// src/routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const ReportController = require('../controllers/reportController');
const { authenticateUser, requireRole } = require('../middlewares/authMiddleware');

// GET /api/reports/daily (Bitácora de movimientos para Admin)
router.get('/daily', authenticateUser, requireRole(['admin']), ReportController.getDailyLogs);

// GET /api/reports/recordings (Listado de grabaciones de video MP4 y seguridad)
router.get('/recordings', authenticateUser, requireRole(['admin']), ReportController.getRecordings);

// GET /api/reports/excel (Descarga directa del reporte Excel .xlsx con KPIs)
router.get('/excel', authenticateUser, requireRole(['admin', 'operador']), ReportController.downloadExcelReport);

// POST /api/reports/send-weekly (Disparo manual de reporte por correo a Admin y Operadores)
router.post('/send-weekly', authenticateUser, requireRole(['admin']), ReportController.triggerWeeklyDispatch);

module.exports = router;
