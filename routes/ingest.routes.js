const express = require('express');
const router = express.Router();
const multer = require('multer');
const ingestController = require('../controllers/ingestController');

// TODO: DEUDA TÉCNICA - [Validación Archivos] Configurar validación estricta de MIME types para asegurar que solo sean Excels.
const upload = multer({ storage: multer.memoryStorage() });

// Endpoint para subir el Excel y procesarlo
router.post('/upload', upload.single('archivo'), ingestController.processUpload);

module.exports = router;
