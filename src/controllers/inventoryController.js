// src/controllers/inventoryController.js
const db = require('../config/database');
const UserModel = require('../models/userModel');
const LockerModel = require('../models/lockerModel');
const ProductModel = require('../models/productModel');
const MovementModel = require('../models/movementModel');
const esp32Bridge = require('../services/esp32Bridge');
const { success, error } = require('../utils/responseHelper');

const InventoryController = {
  // Retiro de material con validación estricta y disparo Modbus
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

      await ProductModel.updateStock(locker_id, stockAfter, conn);

      await MovementModel.log({
        lockerId: locker_id,
        userId: user_id,
        actionType: 'RETIRO',
        quantityChanged: -qty,
        stockBefore,
        stockAfter,
        notes: `Retiro autorizado para rol: ${user.role}`
      }, conn);

      await conn.commit();

      // Disparo físico del relé vía Modbus Función 0x06
      esp32Bridge.triggerLock(locker.locker_number, locker.board_id, locker.relay_channel, 1000);

      return success(res, {
        locker_number: locker.locker_number,
        withdrawn: qty,
        stock_remaining: stockAfter
      }, `Casillero #${locker.locker_number} abierto exitosamente`);

    } catch (err) {
      await conn.rollback();
      return error(res, err.message, 400);
    } finally {
      conn.release();
    }
  },

  // Reabastecimiento de insumos (Exclusivo Admin)
  async restock(req, res) {
    try {
      const { user_id, locker_id, quantity, product_name } = req.body;
      const qty = parseInt(quantity, 10);

      const user = await UserModel.findById(user_id);
      if (!user || user.role !== 'admin') {
        return error(res, 'Acceso denegado: solo el Administrador puede reabastecer stock', 403);
      }

      const locker = await LockerModel.findById(locker_id);
      if (!locker) return error(res, 'Casillero no encontrado', 404);

      const stockBefore = locker.current_stock;
      const stockAfter = stockBefore + (isNaN(qty) ? 0 : qty);

      if (product_name) {
        await ProductModel.assignProduct(locker_id, product_name);
      }

      await ProductModel.updateStock(locker_id, stockAfter);

      if (!isNaN(qty) && qty > 0) {
        await MovementModel.log({
          lockerId: locker_id,
          userId: user_id,
          actionType: 'SURTIDO',
          quantityChanged: qty,
          stockBefore,
          stockAfter,
          notes: 'Reabastecimiento registrado por admin'
        });
      }

      return success(res, { locker_id, new_stock: stockAfter }, 'Casillero reabastecido correctamente');
    } catch (err) {
      return error(res, 'Error al resurtir el casillero', 500, err.message);
    }
  }
};

module.exports = InventoryController;