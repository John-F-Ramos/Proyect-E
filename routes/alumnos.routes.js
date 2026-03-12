const express = require('express');
const router = express.Router();
const alumnosController = require('../controllers/alumnosController');

// Rutas existentes
router.get('/', alumnosController.getAllAlumnos);
router.get('/:cuenta/dashboard', alumnosController.getAlumnoDashboard);
router.get('/:cuenta/pendientes', alumnosController.getMateriasPendientes);
router.get('/:cuenta/resumen', alumnosController.getResumenEstados);
router.get('/:cuenta/equivalencias', alumnosController.getEquivalencias);

// Ruta FALTANTE para historial
router.get('/:cuenta/historial', alumnosController.getHistorialCompleto);

module.exports = router;