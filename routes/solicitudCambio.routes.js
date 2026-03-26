const express = require('express');
const router = express.Router();
const controller = require('../controllers/solicitudCambioController');
const { requireAuth, requireRoles } = require('../middlewares/auth');

// Student endpoints
router.post('/', requireAuth, controller.crearSolicitud);
router.get('/mis-solicitudes', requireAuth, controller.misSolicitudes);

// Jefe / Admin endpoints
router.get('/', requireAuth, requireRoles(1, 2), controller.listarSolicitudes);
router.get('/pendientes/count', requireAuth, requireRoles(1, 2), controller.contarPendientes);
router.put('/:id/resolver', requireAuth, requireRoles(1, 2), controller.resolverSolicitud);

module.exports = router;
