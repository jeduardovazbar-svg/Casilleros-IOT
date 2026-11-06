// src/routes/statsRoutes.js
const express = require('express');
const router = express.Router();
const StatsController = require('../controllers/statsController');
const { authenticateUser, requireRole } = require('../middlewares/authMiddleware');

// GET /api/stats/summary (Métricas de consumo y personal para Chart.js - Solo Admin)
router.get('/summary', authenticateUser, requireRole(['admin']), StatsController.getDashboardStats);

module.exports = router;
