const express = require('express');
const router = express.Router();
const simulacionController = require('../controllers/simulacionController');

router.post('/calcular', simulacionController.calcularSimulacion);

module.exports = router;