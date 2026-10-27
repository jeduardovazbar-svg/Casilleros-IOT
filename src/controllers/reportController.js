// src/controllers/reportController.js
const fs = require('fs');
const path = require('path');
const MovementModel = require('../models/movementModel');
const UserModel = require('../models/userModel');
const { success, error } = require('../utils/responseHelper');

const RECORDINGS_DIR = path.join(__dirname, '../../storage/recordings');

const ReportController = {
  // Consulta los últimos movimientos para auditar aperturas y faltantes
  async getDailyLogs(req, res) {
    try {
      const { user_id, limit } = req.query;

      const user = await UserModel.findById(user_id);
      if (!user || user.role !== 'admin') {
        return error(res, 'Acceso denegado: reporte exclusivo para administradores', 403);
      }

      const logs = await MovementModel.getDailyLogs(limit || 100);
      return success(res, logs, 'Bitácora de movimientos recuperada');
    } catch (err) {
      return error(res, 'Error al consultar reporte de auditoría', 500, err.message);
    }
  },

  // Lista todos los archivos de video generados por la cámara de seguridad
  async getRecordings(req, res) {
    try {
      const { user_id } = req.query;

      const user = await UserModel.findById(user_id);
      if (!user || user.role !== 'admin') {
        return error(res, 'Acceso denegado: exclusivo para administradores', 403);
      }

      if (!fs.existsSync(RECORDINGS_DIR)) {
        return success(res, [], 'No hay grabaciones disponibles');
      }

      const files = fs.readdirSync(RECORDINGS_DIR)
        .filter(file => file.endsWith('.mp4'))
        .map(file => {
          const stats = fs.statSync(path.join(RECORDINGS_DIR, file));
          return {
            filename: file,
            url: `/recordings/${file}`,
            sizeBytes: stats.size,
            sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
            createdAt: stats.mtime
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);

      return success(res, files, 'Lista de grabaciones de seguridad recuperada');
    } catch (err) {
      return error(res, 'Error al consultar grabaciones de video', 500, err.message);
    }
  }
};

module.exports = ReportController;
