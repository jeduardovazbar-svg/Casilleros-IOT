// src/routes/inventoryRoutes.js
const express = require('express');
const router = express.Router();
const InventoryController = require('../controllers/inventoryController');
const { authenticateUser, requireRole } = require('../middlewares/authMiddleware');

// POST /api/inventory/withdraw (Retiro con descuento de stock y disparo Modbus)
router.post('/withdraw', authenticateUser, InventoryController.withdraw);

// POST /api/inventory/checkout (Retiro consolidado de carrito multi-producto)
router.post('/checkout', authenticateUser, InventoryController.checkout);

// POST /api/inventory/restock (Reabastecimiento exclusivo para Admin)
router.post('/restock', authenticateUser, requireRole(['admin']), InventoryController.restock);

module.exports = router;
