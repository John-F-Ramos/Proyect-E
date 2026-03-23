const express = require('express');
const router = express.Router();
const simulacionController = require('../controllers/simulacionController');
const { requireAuth } = require('../middlewares/auth');

router.post('/calcular', requireAuth, simulacionController.calcularSimulacion);

module.exports = router;