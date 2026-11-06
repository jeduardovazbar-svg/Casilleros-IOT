// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { authenticateUser, requireRole } = require('../middlewares/authMiddleware');

// GET /api/users (Listado para Administrador)
router.get('/', authenticateUser, requireRole(['admin']), UserController.getAllUsers);

// POST /api/users (Creación de usuario con jerarquía Admin / Operador)
router.post('/', authenticateUser, requireRole(['admin', 'operador']), UserController.createUser);

// DELETE /api/users/:id (Desactivación lógica de usuario por Admin)
router.delete('/:id', authenticateUser, requireRole(['admin']), UserController.deactivateUser);

module.exports = router;
