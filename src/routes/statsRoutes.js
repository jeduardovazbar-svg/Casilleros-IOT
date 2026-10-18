// src/routes/statsRoutes.js
const express = require('express');
const router = express.Router();
const StatsController = require('../controllers/statsController');

// GET /api/stats/summary (Métricas de consumo y personal para Chart.js)
router.get('/summary', StatsController.getDashboardStats);

module.exports = router;