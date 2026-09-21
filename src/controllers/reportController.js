// src/controllers/reportController.js
const MovementModel = require('../models/movementModel');
const UserModel = require('../models/userModel');
const { success, error } = require('../utils/responseHelper');

const ReportController = {
  // Consulta los últimos movimientos para auditar aperturas y faltantes
  async getDailyLogs(req, res) {
    try {
      const { user_id } = req.query;

      const user = await UserModel.findById(user_id);
      if (!user || user.role !== 'admin') {
        return error(res, 'Acceso denegado: reporte exclusivo para administradores', 403);
      }

      const logs = await MovementModel.getDailyLogs(100);
      return success(res, logs, 'Bitácora de movimientos recuperada');
    } catch (err) {
      return error(res, 'Error al consultar reporte de auditoría', 500, err.message);
    }
  }
};

module.exports = ReportController;