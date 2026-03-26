const express = require('express');
const router = express.Router();
const multer = require('multer');
const ingestController = require('../controllers/ingestController');
const { requireAuth, requireRoles } = require('../middlewares/auth');

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;

function excelFileFilter(req, file, cb) {
    const allowedMime = new Set([
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/octet-stream'
    ]);
    const isExcelExt = /\.(xlsx|xls)$/i.test(file.originalname || '');
    if (!isExcelExt || !allowedMime.has(file.mimetype)) {
        return cb(new Error('INVALID_EXCEL_FILE'));
    }
    return cb(null, true);
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: excelFileFilter
});

// Endpoint existente para subir Excel
router.post('/upload', requireAuth, requireRoles(1, 2, 3), upload.single('archivo'), ingestController.processUpload);

// Nuevos endpoints para texto plano
router.post('/preview', requireAuth, requireRoles(1, 2, 3), ingestController.previewTextCEUTEC);
router.post('/preview-text', requireAuth, requireRoles(1, 2, 3), ingestController.previewTextCEUTEC);
router.post('/import', requireAuth, requireRoles(1, 2, 3), ingestController.importData);

module.exports = router;