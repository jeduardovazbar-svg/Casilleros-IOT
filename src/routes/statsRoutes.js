// src/routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');

router.get('/stats/summary', statsController.getDashboardStats);

module.exports = router;
