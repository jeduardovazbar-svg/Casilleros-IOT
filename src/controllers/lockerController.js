// src/controllers/lockerController.js
const LockerModel = require('../models/lockerModel');
const UserModel = require('../models/userModel');
const MovementModel = require('../models/movementModel');
const esp32Bridge = require('../services/esp32Bridge');
const { success, error } = require('../utils/responseHelper');

const LockerController = {
  // Lista los casilleros para la cuadrícula
  async getAll(req, res) {
    try {
      const lockers = await LockerModel.getAll();
      return success(res, lockers);
    } catch (err) {
      return error(res, 'Error al consultar casilleros', 500, err.message);
    }
  },

  // Modifica las dimensiones del casillero
  async resize(req, res) {
    try {
      const { id } = req.params;
      const { user_id, size_type } = req.body;

      const dimensions = {
        'S':  { col: 1, row: 1 },
        'M':  { col: 2, row: 1 },
        'L':  { col: 1, row: 2 },
        'XL': { col: 2, row: 2 }
      };

      if (!dimensions[size_type]) {
        return error(res, 'Tamaño inválido. Opciones: S, M, L o XL', 400);
      }

      const user = await UserModel.findById(user_id);
      if (!user || user.role !== 'admin') {
        return error(res, 'Acceso denegado: solo el Administrador puede cambiar tamaños', 403);
      }

      const updated = await LockerModel.updateDimensions(
        id,
        size_type,
        dimensions[size_type].col,
        dimensions[size_type].row
      );

      if (!updated) return error(res, 'Casillero no encontrado', 404);

      return success(res, { locker_id: id, size: size_type }, 'Dimensiones actualizadas');
    } catch (err) {
      return error(res, 'Error al redimensionar casillero', 500, err.message);
    }
  },

  // Apertura manual directa para Administrador
  async unlock(req, res) {
    try {
      const { id } = req.params;
      const { user_id } = req.body;

      const user = await UserModel.findById(user_id);
      if (!user || user.role !== 'admin') {
        console.warn(`[UNLOCK DENEGADO] Usuario ${user_id} no es administrador`);
        return error(res, 'Acceso denegado: requiere permisos de Administrador', 403);
      }

      const locker = await LockerModel.findById(id);
      if (!locker) {
        console.warn(`[UNLOCK DENEGADO] Casillero ${id} no existe`);
        return error(res, 'Casillero no encontrado', 404);
      }

      // 1. DISPARAR EL CERROJO INMEDIATAMENTE AL ESP32
      console.log(`[DISPARO ADMIN] Abriendo Casillero #${locker.locker_number} (Placa ${locker.board_id}, Canal ${locker.relay_channel})`);
      const sent = esp32Bridge.triggerLock(locker.locker_number, locker.board_id, locker.relay_channel, 1000);

      if (!sent) {
        return error(res, 'El ESP32 no está conectado vía WebSocket', 503);
      }

      // 2. REGISTRO EN BITÁCORA (dentro de try/catch para evitar que bloquee la apertura)
      try {
        await MovementModel.log({
          lockerId: locker.id,
          userId: user.id,
          actionType: 'RETIRO', // Usa RETIRO para ser 100% compatible con ENUMs existentes
          quantityChanged: 0,
          stockBefore: locker.current_stock,
          stockAfter: locker.current_stock,
          notes: 'Apertura manual directa por Administrador'
        });
      } catch (logErr) {
        console.warn('[BITÁCORA ALERTA] No se pudo guardar el registro de auditoría:', logErr.message);
      }

      return success(res, { locker_number: locker.locker_number }, `Casillero #${locker.locker_number} destrabado con éxito`);

    } catch (err) {
      console.error('❌ Error interno en unlock:', err);
      return error(res, 'Error interno al destrabar casillero', 500, err.message);
    }
  }
};

module.exports = LockerController;