// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');

// GET /api/users (Listado para Administrador)
router.get('/', UserController.getAllUsers);

// POST /api/users (Creación de usuario)
router.post('/', UserController.createUser);

// DELETE /api/users/:id (Desactivación lógica de usuario)
router.delete('/:id', UserController.deactivateUser);

module.exports = router;
