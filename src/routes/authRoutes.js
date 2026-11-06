// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');

// POST /api/auth/login (Autenticación por PIN)
router.post('/login', AuthController.loginPin);

// POST /api/auth/register (Creación jerárquica de cuentas)
router.post('/register', AuthController.createUser);

// POST /api/auth/security-lockout (Alerta de 3 intentos fallidos de PIN -> Video 5s)
router.post('/security-lockout', AuthController.reportLockout);

module.exports = router;
