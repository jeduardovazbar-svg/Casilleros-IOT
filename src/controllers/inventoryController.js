// src/controllers/inventoryController.js
const db = require('../config/database');
const { sendEmailReceipt } = require('../services/notificationService');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const UserModel = require('../models/userModel');
const LockerModel = require('../models/lockerModel');
const MovementModel = require('../models/movementModel');
const esp32Bridge = require('../services/esp32Bridge');
const { success, error } = require('../utils/responseHelper');

const InventoryController = {
  // ==========================================
  // 1. RETIRO INDIVIDUAL (DESDE MODAL)
  // ==========================================
  async withdraw(req, res) {
    const { user_id, locker_id, quantity } = req.body;
    const qty = parseInt(quantity, 10);

    if (!user_id || !locker_id || isNaN(qty) || qty <= 0) {
      return error(res, 'Datos de retiro incompletos o cantidad inválida', 400);
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const user = await UserModel.findById(user_id);
      if (!user || !user.is_active) throw new Error('Usuario no autorizado o inactivo');

      // Restricciones de rol Empleado
      if (user.role === 'empleado') {
        if (Number(user.assigned_locker_id) !== Number(locker_id)) {
          throw new Error('No tienes autorización para abrir este casillero');
        }
        if (qty > user.allowed_qty) {
          throw new Error(`Cantidad solicitada excede tu límite permitido (${user.allowed_qty} pzas)`);
        }
      }

      // Bloqueo de fila para evitar colisiones de stock
      const locker = await LockerModel.findByIdForUpdate(locker_id, conn);
      if (!locker) throw new Error('El casillero seleccionado no existe');

      if (locker.current_stock < qty) {
        throw new Error(`Stock insuficiente. Disponibles: ${locker.current_stock}`);
      }

      const stockBefore = locker.current_stock;
      const stockAfter = stockBefore - qty;
      const unitPrice = parseFloat(locker.price) || 0;
      const subtotal = unitPrice * qty;

      await LockerModel.updateStock(locker_id, stockAfter, conn);

      await MovementModel.log({
        lockerId: locker_id,
        userId: user_id,
        actionType: 'RETIRO',
        quantityChanged: -qty,
        stockBefore,
        stockAfter,
        notes: `Retiro autorizado (${user.role}) - P.Unit: $${unitPrice.toFixed(2)} Subtotal: $${subtotal.toFixed(2)}`
      }, conn);

      await conn.commit();

      // Disparo físico del relé vía Modbus Función 0x06
      esp32Bridge.triggerLock(locker.locker_number, locker.board_id, locker.relay_channel, 1000);

      // Despacho de notificaciones en segundo plano con desglose de precios
      const receiptItem = [{
        locker_number: locker.locker_number,
        product_name: locker.product_name || 'Insumo',
        quantity: qty,
        unit_price: unitPrice,
        subtotal: subtotal
      }];

      if (user.email) {
        sendEmailReceipt({ 
          to: user.email, 
          username: user.username, 
          items: receiptItem, 
          totalAmount: subtotal 
        }).catch(err => console.error('[NOTIFICACIONES] Error al enviar email:', err.message));
      }

      if (user.phone) {
        sendWhatsAppMessage(user.phone, user.username, receiptItem, subtotal)
          .catch(err => console.error('[NOTIFICACIONES] Error al enviar WhatsApp:', err.message));
      }

      return success(res, {
        locker_number: locker.locker_number,
        withdrawn: qty,
        unit_price: unitPrice,
        subtotal: subtotal,
        stock_remaining: stockAfter
      }, `Casillero #${locker.locker_number} abierto exitosamente`);

    } catch (err) {
      await conn.rollback();
      return error(res, err.message, 400);
    } finally {
      conn.release();
    }
  },

  // =======================================================
  // 2. CHECKOUT MULTI-PRODUCTO (CARRITO TIPO AMAZON)
  // =======================================================
  async checkout(req, res) {
    const { user_id, items } = req.body; // items: [{ id / locker_id, quantity }]

    if (!user_id || !Array.isArray(items) || items.length === 0) {
      return error(res, 'El carrito está vacío o faltan datos del usuario', 400);
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const user = await UserModel.findById(user_id);
      if (!user || !user.is_active) throw new Error('Usuario no autorizado o inactivo');

      const processedItems = [];
      let totalAmount = 0;

      // Validar y descontar cada artículo dentro de la misma transacción
      for (const item of items) {
        const targetLockerId = item.locker_id || item.id;
        const qty = parseInt(item.quantity, 10);

        if (!targetLockerId || isNaN(qty) || qty <= 0) {
          throw new Error('Hay artículos con cantidades inválidas en el pedido');
        }

        // Restricción de empleado
        if (user.role === 'empleado' && Number(user.assigned_locker_id) !== Number(targetLockerId)) {
          throw new Error(`No tienes permisos para retirar del casillero ID ${targetLockerId}`);
        }

        const locker = await LockerModel.findByIdForUpdate(targetLockerId, conn);
        if (!locker) throw new Error(`El casillero con ID ${targetLockerId} no existe`);

        if (locker.current_stock < qty) {
          throw new Error(`Stock insuficiente en Casillero #${locker.locker_number} (${locker.product_name}). Disponibles: ${locker.current_stock}`);
        }

        const stockBefore = locker.current_stock;
        const stockAfter = stockBefore - qty;
        const unitPrice = parseFloat(locker.price) || 0;
        const subtotal = unitPrice * qty;
        totalAmount += subtotal;

        await LockerModel.updateStock(targetLockerId, stockAfter, conn);

        await MovementModel.log({
          lockerId: targetLockerId,
          userId: user_id,
          actionType: 'RETIRO',
          quantityChanged: -qty,
          stockBefore,
          stockAfter,
          notes: `Retiro consolidado vía Carrito (${user.role}) - P.Unit: $${unitPrice.toFixed(2)} Subtotal: $${subtotal.toFixed(2)}`
        }, conn);

        processedItems.push({
          locker_number: locker.locker_number,
          board_id: locker.board_id,
          relay_channel: locker.relay_channel,
          product_name: locker.product_name || 'Insumo',
          quantity: qty,
          unit_price: unitPrice,
          subtotal: subtotal
        });
      }

      await conn.commit();

      // Disparar las aperturas en secuencia separada por 800ms
      // para proteger la fuente de 12V sin demorar la respuesta a la pantalla
      (async () => {
        for (const item of processedItems) {
          esp32Bridge.triggerLock(item.locker_number, item.board_id, item.relay_channel, 1000);
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      })();

      // Enviar una sola notificación consolidada por Email y WhatsApp con desglose de precios y total
      if (user.email) {
        sendEmailReceipt({ 
          to: user.email, 
          username: user.username, 
          items: processedItems,
          totalAmount: totalAmount
        }).catch(err => console.error('[NOTIFICACIONES] Error al enviar email:', err.message));
      }

      if (user.phone) {
        sendWhatsAppMessage(user.phone, user.username, processedItems, totalAmount)
          .catch(err => console.error('[NOTIFICACIONES] Error al enviar WhatsApp:', err.message));
      }

      return success(res, {
        total_items: processedItems.length,
        total_amount: totalAmount,
        items: processedItems
      }, 'Pedido procesado con éxito y casilleros liberados');

    } catch (err) {
      await conn.rollback();
      return error(res, err.message, 400);
    } finally {
      conn.release();
    }
  },

  // ==========================================
  // 3. REABASTECIMIENTO DE STOCK (ADMIN)
  // ==========================================
  async restock(req, res) {
    try {
      const { user_id, locker_id, quantity, product_name, price } = req.body;
      const qty = parseInt(quantity, 10);

      const user = await UserModel.findById(user_id);
      if (!user || user.role !== 'admin') {
        return error(res, 'Acceso denegado: solo el Administrador puede reabastecer stock', 403);
      }

      const locker = await LockerModel.findById(locker_id);
      if (!locker) return error(res, 'Casillero no encontrado', 404);

      const stockBefore = locker.current_stock;
      const stockAfter = stockBefore + (isNaN(qty) ? 0 : qty);

      const parsedPrice = price !== undefined && price !== null && price !== '' ? parseFloat(price) : null;
      const targetProductName = product_name !== undefined ? product_name : locker.product_name;

      if (product_name !== undefined || parsedPrice !== null) {
        await LockerModel.assignProduct(locker_id, targetProductName, parsedPrice);
      }

      await LockerModel.updateStock(locker_id, stockAfter);

      if (!isNaN(qty) && qty > 0) {
        await MovementModel.log({
          lockerId: locker_id,
          userId: user_id,
          actionType: 'SURTIDO',
          quantityChanged: qty,
          stockBefore,
          stockAfter,
          notes: `Reabastecimiento registrado por admin${parsedPrice !== null ? ` (Precio: $${parsedPrice.toFixed(2)})` : ''}`
        });
      }

      return success(res, { 
        locker_id, 
        new_stock: stockAfter, 
        price: parsedPrice !== null ? parsedPrice : locker.price 
      }, 'Casillero reabastecido correctamente');
    } catch (err) {
      return error(res, 'Error al resurtir el casillero', 500, err.message);
    }
  }
};

module.exports = InventoryController;
