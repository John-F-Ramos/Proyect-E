const excelProcessor = require('../services/excelProcessor');
const { db } = require('../models/firebase');

exports.processUpload = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ningún archivo' });
        }

        const planesEstudioJSON = await excelProcessor.parseExcelBuffer(req.file.buffer);

        // TODO: DEUDA TÉCNICA - [Procesamiento Masivo] Implementar Firestore Batches para manejar excels con miles de registros de forma eficiente.
        const collectionRef = db.collection('planes_estudio');

        // For MVP, we'll just save the whole array as one document, or iterate.
        // Iterating to create individual documents per class/entry.
        let count = 0;
        const batch = db.batch(); // MVP improvement: use batch but capped at 500 limits.

        for (const record of planesEstudioJSON) {
            const docRef = collectionRef.doc(); // Auto-id
            batch.set(docRef, record);
            count++;

            // If we reach Firestore batch limit of 500
            if (count % 500 === 0) {
                await batch.commit();
            }
        }

        // Commit remaining
        if (count % 500 !== 0) {
            await batch.commit();
        }

        res.status(200).json({
            message: 'Procesamiento exitoso',
            recordsProcessed: count
        });

    } catch (error) {
        console.error('Error procesando el archivo:', error);
        res.status(500).json({ error: 'Ocurrió un error al procesar el archivo Excel.' });
    }
};
