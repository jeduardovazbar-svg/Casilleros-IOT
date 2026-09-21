// src/routes/index.js
const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const lockerRoutes = require('./lockerRoutes');
const inventoryRoutes = require('./inventoryRoutes');
const reportRoutes = require('./reportRoutes');
const statsRoutes = require('./statsRoutes');

router.use('/auth', authRoutes);
router.use('/lockers', lockerRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/reports', reportRoutes);
router.use('/stats', statsRoutes);

module.exports = router;