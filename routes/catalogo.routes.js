const express = require('express');
const router = express.Router();
const multer = require('multer');
const catalogoController = require('../controllers/catalogoController');

// Carga en memoria para validar y enviar a SQL bulk.
const upload = multer({ storage: multer.memoryStorage() });

// Rutas de Carreras
router.get('/carreras', catalogoController.getAllCarreras);
router.post('/carreras', catalogoController.createCarrera);
router.put('/carreras/:codigo', catalogoController.updateCarrera);
router.delete('/carreras/:codigo', catalogoController.deleteCarrera);

// Rutas de Materias
router.get('/materias', catalogoController.getAllMaterias);
router.post('/materias', catalogoController.createMateria);
router.put('/materias/:codigo', catalogoController.updateMateria);
router.delete('/materias/:codigo', catalogoController.deleteMateria);

// Rutas para Planes de Estudio y Detalles
router.get('/carreras-con-planes', catalogoController.getCarrerasConPlanes);
router.get('/planes/:id/materias', catalogoController.getMateriasByPlan);
router.post('/planes/:id/materias', catalogoController.addPlanMateria);
router.put('/planes/:id/materias/:codigo/semestre', catalogoController.updatePlanMateriaSemestre);
router.delete('/planes/:id/materias/:codigo', catalogoController.deletePlanMateria);
router.get('/planes', catalogoController.getAllPlanes); // Opcional
router.post('/planes', catalogoController.createPlan);
router.put('/planes/:id', catalogoController.updatePlan);
router.delete('/planes/:id', catalogoController.deletePlan);

// Ruta de Carga Masiva (Excel)
router.post('/upload', upload.single('archivoCatalogo'), catalogoController.uploadCatalogosExcel);
router.post('/upload/pensum', upload.single('archivoCatalogo'), catalogoController.uploadPensumExcel);
router.post('/upload/reglas-equivalencia', upload.single('archivoCatalogo'), catalogoController.uploadReglasEquivalenciaExcel);
router.get('/templates/pensum', catalogoController.downloadPensumTemplate);
router.get('/templates/reglas-equivalencia', catalogoController.downloadReglasTemplate);
router.post('/templates/preview-pdf-pensum', upload.single('archivoPdf'), catalogoController.previewPensumPdfTemplate);
router.post('/templates/convert-pdf-pensum', upload.single('archivoPdf'), catalogoController.convertPensumPdfTemplate);
router.post('/templates/generate-pensum-from-preview', catalogoController.generatePensumFromPreview);

module.exports = router;