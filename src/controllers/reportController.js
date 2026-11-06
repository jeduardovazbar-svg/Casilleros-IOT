// src/controllers/reportController.js
const fs = require('fs');
const path = require('path');
const MovementModel = require('../models/movementModel');
const UserModel = require('../models/userModel');
const ReportGeneratorService = require('../services/reportGeneratorService');
const SchedulerService = require('../services/schedulerService');
const { success, error } = require('../utils/responseHelper');
const logger = require('../core/logger');

const RECORDINGS_DIR = path.join(__dirname, '../../storage/recordings');

const ReportController = {
  // Consulta los últimos movimientos para auditar aperturas y faltantes
  async getDailyLogs(req, res) {
    try {
      const { limit } = req.query;
      const logs = await MovementModel.getDailyLogs(limit || 100);
      return success(res, logs, 'Bitácora de movimientos recuperada');
    } catch (err) {
      logger.error('REPORTES', 'Error al consultar reporte de auditoría', err);
      return error(res, 'Error al consultar reporte de auditoría', 500, err.message);
    }
  },

  // Lista todos los archivos de video generados por la cámara de seguridad
  async getRecordings(req, res) {
    try {
      if (!fs.existsSync(RECORDINGS_DIR)) {
        return success(res, [], 'No hay grabaciones disponibles');
      }

      const files = fs.readdirSync(RECORDINGS_DIR)
        .filter(file => file.endsWith('.mp4'))
        .map(file => {
          const stats = fs.statSync(path.join(RECORDINGS_DIR, file));
          const isSecurity = file.startsWith('seguridad_');
          return {
            filename: file,
            url: `/recordings/${file}`,
            isSecurity,
            sizeBytes: stats.size,
            sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
            createdAt: stats.mtime
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);

      return success(res, files, 'Lista de grabaciones de seguridad recuperada');
    } catch (err) {
      logger.error('REPORTES', 'Error al consultar grabaciones de video', err);
      return error(res, 'Error al consultar grabaciones de video', 500, err.message);
    }
  },

  // Descargar el archivo Excel (.xlsx) con todas las métricas y bitácoras
  async downloadExcelReport(req, res) {
    try {
      const days = parseInt(req.query.days, 10) || 7;
      const report = await ReportGeneratorService.generateWeeklyReport(days);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
      return res.send(report.buffer);
    } catch (err) {
      logger.error('REPORTES', 'Error al generar descarga de Excel', err);
      return error(res, 'Error al generar reporte Excel', 500, err.message);
    }
  },

  // Disparar manualmente el envío del reporte semanal por correo a administradores y operadores
  async triggerWeeklyDispatch(req, res) {
    try {
      const days = parseInt(req.body?.days, 10) || 7;
      const result = await SchedulerService.runWeeklyReportTask(days);
      if (!result.success) {
        return error(res, result.message || 'Error en el despacho del reporte', 500);
      }
      return success(res, result, 'Reporte periódico despachado exitosamente');
    } catch (err) {
      logger.error('REPORTES', 'Error al despachar reporte manualmente', err);
      return error(res, 'Fallo al despachar reporte', 500, err.message);
    }
  }
};

module.exports = ReportController;
