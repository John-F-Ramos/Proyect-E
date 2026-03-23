const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Endpoint para el login
router.post('/login', authController.login);
router.get('/user/:id', authController.getUserById);

module.exports = router;
