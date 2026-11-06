// src/services/schedulerService.js
const cron = require('node-cron');
const UserModel = require('../models/userModel');
const ReportGeneratorService = require('./reportGeneratorService');
const { sendWeeklyExecutiveReport } = require('./notificationService');
const { sendWeeklyReportWhatsApp } = require('./whatsappService');
const logger = require('../core/logger');

// Expresión Cron configurable (Por defecto: Cada viernes a las 18:00 hrs)
// Para cada 15 días: '0 18 1,15 * *'
// Para cada domingo: '0 20 * * 0'
const CRON_SCHEDULE = process.env.WEEKLY_REPORT_CRON || '0 18 * * 5';

const SchedulerService = {
  /**
   * Ejecuta la generación y despacho del reporte semanal/periódico
   */
  async runWeeklyReportTask(days = 7) {
    logger.info('SCHEDULER', `Iniciando tarea programada de reporte ejecutivo (${days} días)...`);
    try {
      // 1. Obtener destinatarios (Admin y Operadores activos)
      const recipients = await UserModel.getReportRecipients();
      if (!recipients || recipients.length === 0) {
        logger.warn('SCHEDULER', 'No se encontraron destinatarios activos para el reporte');
        return { success: false, message: 'Sin destinatarios registrados' };
      }

      // 2. Generar el libro de cálculo Excel con todas las métricas
      const report = await ReportGeneratorService.generateWeeklyReport(days);

      // 3. Despachar por correo a todos los administradores y operadores
      const emailSent = await sendWeeklyExecutiveReport({
        recipients,
        stats: report.stats,
        excelBuffer: report.buffer,
        filename: report.filename
      });

      // 4. Despachar resumen formal por WhatsApp a los administradores que tengan teléfono
      const adminUsers = recipients.filter(u => u.role === 'admin' && u.phone);
      for (const admin of adminUsers) {
        sendWeeklyReportWhatsApp(admin.phone, report.stats)
          .catch(err => logger.warn('SCHEDULER', `WhatsApp no enviado a ${admin.username}: ${err.message}`));
      }

      logger.info('SCHEDULER', `Tarea de reporte finalizada. Enviado a ${recipients.length} usuarios.`);
      return {
        success: true,
        filename: report.filename,
        recipientsCount: recipients.length,
        stats: report.stats
      };
    } catch (err) {
      logger.error('SCHEDULER', 'Error ejecutando tarea de reporte semanal', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Inicializa el programador automático
   */
  init() {
    if (!cron.validate(CRON_SCHEDULE)) {
      logger.error('SCHEDULER', `Expresión cron inválida: "${CRON_SCHEDULE}". Se usará el valor predeterminado.`);
    }

    const task = cron.schedule(CRON_SCHEDULE, async () => {
      logger.info('SCHEDULER', `Alarma cron disparada (${CRON_SCHEDULE})`);
      await this.runWeeklyReportTask(7);
    });

    logger.info('SCHEDULER', `Servicio de reporte periódico programado con patrón: [${CRON_SCHEDULE}]`);
    return task;
  }
};

module.exports = SchedulerService;
