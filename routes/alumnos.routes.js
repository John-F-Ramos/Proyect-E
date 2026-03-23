const express = require('express');
const router = express.Router();
const alumnosController = require('../controllers/alumnosController');
const { requireAuth, requireRoles } = require('../middlewares/auth');

// Rutas existentes
router.get('/', requireAuth, requireRoles(1, 2), alumnosController.getAllAlumnos);
router.get('/visibles/:idUsuario', requireAuth, requireRoles(1, 2), alumnosController.getVisibleAlumnos);
router.get('/:cuenta/dashboard', requireAuth, alumnosController.getAlumnoDashboard);
router.get('/:cuenta/pendientes', requireAuth, alumnosController.getMateriasPendientes);
router.get('/:cuenta/resumen', requireAuth, alumnosController.getResumenEstados);
router.get('/:cuenta/equivalencias', requireAuth, alumnosController.getEquivalencias);

// Obtener carrera del alumno actual
router.get('/:cuenta/carrera', requireAuth, alumnosController.getAlumnoCarrera);

// Ruta FALTANTE para historial
router.get('/:cuenta/historial', requireAuth, alumnosController.getHistorialCompleto);

module.exports = router;