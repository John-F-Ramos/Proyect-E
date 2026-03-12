const express = require('express');
const router = express.Router();
const multer = require('multer');
const ingestController = require('../controllers/ingestController');

const upload = multer({ storage: multer.memoryStorage() });

// Endpoint existente para subir Excel
router.post('/upload', upload.single('archivo'), ingestController.processUpload);

// Nuevos endpoints para texto plano
router.post('/preview', ingestController.previewText);
router.post('/import', ingestController.importData);

module.exports = router;