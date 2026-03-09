const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const catalogoController = require('../controllers/catalogoController');

// Configuración de Multer para la subida de archivos (Reutilizamos la carpeta temp)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../temp/'));
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Rutas de Carreras
router.get('/carreras', catalogoController.getAllCarreras);
router.post('/carreras', catalogoController.createCarrera);

// Rutas de Materias
router.get('/materias', catalogoController.getAllMaterias);
router.post('/materias', catalogoController.createMateria);

// Ruta de Carga Masiva (Excel)
router.post('/upload', upload.single('archivoCatalogo'), catalogoController.uploadCatalogosExcel);

module.exports = router;
