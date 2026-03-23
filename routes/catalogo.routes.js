const express = require('express');
const router = express.Router();
const multer = require('multer');
const catalogoController = require('../controllers/catalogoController');
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

function pdfFileFilter(req, file, cb) {
    const isPdfExt = /\.pdf$/i.test(file.originalname || '');
    const isPdfMime = file.mimetype === 'application/pdf' || file.mimetype === 'application/octet-stream';
    if (!isPdfExt || !isPdfMime) {
        return cb(new Error('INVALID_PDF_FILE'));
    }
    return cb(null, true);
}

// Carga en memoria con límites para validar y enviar a SQL bulk.
const uploadExcel = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: excelFileFilter
});
const uploadPdf = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: pdfFileFilter
});

// Rutas de Carreras
router.get('/carreras', requireAuth, catalogoController.getAllCarreras);
router.post('/carreras', requireAuth, requireRoles(1, 2), catalogoController.createCarrera);
router.put('/carreras/:codigo', requireAuth, requireRoles(1, 2), catalogoController.updateCarrera);
router.delete('/carreras/:codigo', requireAuth, requireRoles(1, 2), catalogoController.deleteCarrera);

// Rutas de Materias
router.get('/materias', requireAuth, catalogoController.getAllMaterias);
router.post('/materias', requireAuth, requireRoles(1, 2), catalogoController.createMateria);
router.put('/materias/:codigo', requireAuth, requireRoles(1, 2), catalogoController.updateMateria);
router.delete('/materias/:codigo', requireAuth, requireRoles(1, 2), catalogoController.deleteMateria);

// Rutas para Planes de Estudio y Detalles
router.get('/carreras-con-planes', requireAuth, catalogoController.getCarrerasConPlanes);
router.get('/planes/:id/materias', requireAuth, catalogoController.getMateriasByPlan);
router.post('/planes/:id/materias', requireAuth, requireRoles(1, 2), catalogoController.addPlanMateria);
router.put('/planes/:id/materias/:codigo/semestre', requireAuth, requireRoles(1, 2), catalogoController.updatePlanMateriaSemestre);
router.delete('/planes/:id/materias/:codigo', requireAuth, requireRoles(1, 2), catalogoController.deletePlanMateria);
router.get('/planes', requireAuth, catalogoController.getAllPlanes); // Opcional
router.post('/planes', requireAuth, requireRoles(1, 2), catalogoController.createPlan);
router.put('/planes/:id', requireAuth, requireRoles(1, 2), catalogoController.updatePlan);
router.delete('/planes/:id', requireAuth, requireRoles(1, 2), catalogoController.deletePlan);

// Ruta de Carga Masiva (Excel)
router.post('/upload', requireAuth, requireRoles(1, 2), uploadExcel.single('archivoCatalogo'), catalogoController.uploadCatalogosExcel);
router.post('/upload/pensum', requireAuth, requireRoles(1, 2), uploadExcel.single('archivoCatalogo'), catalogoController.uploadPensumExcel);
router.post('/upload/reglas-equivalencia', requireAuth, requireRoles(1, 2), uploadExcel.single('archivoCatalogo'), catalogoController.uploadReglasEquivalenciaExcel);
router.get('/templates/pensum', requireAuth, catalogoController.downloadPensumTemplate);
router.get('/templates/reglas-equivalencia', requireAuth, catalogoController.downloadReglasTemplate);
router.post('/templates/preview-pdf-pensum', requireAuth, requireRoles(1, 2), uploadPdf.single('archivoPdf'), catalogoController.previewPensumPdfTemplate);
router.post('/templates/convert-pdf-pensum', requireAuth, requireRoles(1, 2), uploadPdf.single('archivoPdf'), catalogoController.convertPensumPdfTemplate);
router.post('/templates/generate-pensum-from-preview', requireAuth, requireRoles(1, 2), catalogoController.generatePensumFromPreview);

module.exports = router;