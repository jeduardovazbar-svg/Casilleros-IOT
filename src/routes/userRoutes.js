// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');

// POST /api/users
router.post('/', UserController.createUser);

module.exports = router;