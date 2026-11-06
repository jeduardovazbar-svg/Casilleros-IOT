// src/routes/lockerRoutes.js
const express = require('express');
const router = express.Router();
const LockerController = require('../controllers/lockerController');
const { authenticateUser, requireRole } = require('../middlewares/authMiddleware');

// GET /api/lockers (Consulta de cuadrícula y estado físico para el kiosco)
router.get('/', LockerController.getAll);

// PUT /api/lockers/:id/resize (Redimensionamiento CSS Grid exclusivo para Admin)
router.put('/:id/resize', authenticateUser, requireRole(['admin']), LockerController.resize);

// POST /api/lockers/:id/unlock (Apertura manual directa exclusivo para Admin)
router.post('/:id/unlock', authenticateUser, requireRole(['admin']), LockerController.unlock);

module.exports = router;
