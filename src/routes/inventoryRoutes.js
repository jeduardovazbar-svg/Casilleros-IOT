// src/routes/inventoryRoutes.js
const express = require('express');
const router = express.Router();
const InventoryController = require('../controllers/inventoryController');

// POST /api/inventory/withdraw (Retiro con descuento de stock y disparo Modbus)
router.post('/withdraw', InventoryController.withdraw);

// POST /api/inventory/restock (Reabastecimiento exclusivo para Admin)
router.post('/restock', InventoryController.restock);

module.exports = router;