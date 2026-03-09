const express = require('express');
const router = express.Router();
const alumnosController = require('../controllers/alumnosController');

// Ruta para obtener la lista de todos los alumnos
router.get('/', alumnosController.getAllAlumnos);

// Ruta para obtener los datos consolidados del dashboard de un alumno específico
router.get('/:cuenta/dashboard', alumnosController.getAlumnoDashboard);

module.exports = router;
