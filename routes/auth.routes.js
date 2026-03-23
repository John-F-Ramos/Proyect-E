const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');

// Endpoint para el login
router.post('/login', authController.login);
router.post('/register', authController.register);
router.get('/user/:id', requireAuth, authController.getUserById);

module.exports = router;
