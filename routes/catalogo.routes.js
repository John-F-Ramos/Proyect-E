const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const catalogoController = require('../controllers/catalogoController');

// Configuración de Multer para la subida de archivos
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

// Rutas para Planes de Estudio y Detalles
router.get('/carreras-con-planes', catalogoController.getCarrerasConPlanes);
router.get('/planes/:id/materias', catalogoController.getMateriasByPlan);
router.get('/planes', catalogoController.getAllPlanes); // Opcional
router.post('/planes', catalogoController.createPlan);

// Ruta de Carga Masiva (Excel)
router.post('/upload', upload.single('archivoCatalogo'), catalogoController.uploadCatalogosExcel);

module.exports = router;