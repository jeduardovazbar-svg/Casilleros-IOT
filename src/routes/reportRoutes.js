// src/routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const ReportController = require('../controllers/reportController');

// GET /api/reports/daily (Bitácora de movimientos para Admin)
router.get('/daily', ReportController.getDailyLogs);

module.exports = router;