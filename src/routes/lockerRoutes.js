// src/routes/lockerRoutes.js
const express = require('express');
const router = express.Router();
const LockerController = require('../controllers/lockerController');

// GET /api/lockers (Consulta de cuadrícula y estado físico)
router.get('/', LockerController.getAll);

// PUT /api/lockers/:id/resize (Redimensionamiento CSS Grid por Admin)
router.put('/:id/resize', LockerController.resize);

// POST /api/lockers/:id/unlock (Apertura manual directa Admin)
router.post('/:id/unlock', LockerController.unlock);

module.exports = router;