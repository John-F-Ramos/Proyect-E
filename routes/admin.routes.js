const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const { requireAuth, requireRoles } = require('../middlewares/auth');

router.get('/users', requireAuth, requireRoles(1), adminController.getAdminUsers);
router.get('/metrics/users', requireAuth, requireRoles(1), adminController.getPlatformUserMetrics);
router.put('/users/:id/role', requireAuth, requireRoles(1), adminController.updateUserRole);
router.put('/users/:id/status', requireAuth, requireRoles(1), adminController.updateUserStatus);
router.get('/audit/roles', requireAuth, requireRoles(1), adminController.getRoleAudit);

module.exports = router;
