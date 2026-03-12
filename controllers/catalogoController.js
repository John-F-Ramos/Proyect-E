const { poolPromise, sql } = require('../config/db');
const excelProcessor = require('../services/excelProcessor');
const fs = require('fs');

/**
 * Normaliza las llaves de un objeto para buscar independientemente de mayúsculas/espacios
 */
function normalizeKeys(record) {
    const normalizedRecord = {};
    Object.keys(record).forEach(key => {
        normalizedRecord[key.toLowerCase().trim()] = record[key];
    });
    return normalizedRecord;
}

// -------------------------------------------------------------
// GET / CATÁLOGOS LIST
// -------------------------------------------------------------

exports.getAllCarreras = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM Carreras ORDER BY NombreCarrera');
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error getting carreras:', err);
        res.status(500).json({ error: 'Error del servidor al obtener carreras' });
    }
};

exports.getAllMaterias = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM Materias ORDER BY NombreMateria');
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error getting materias:', err);
        res.status(500).json({ error: 'Error del servidor al obtener materias' });
    }
};

// -------------------------------------------------------------
// POST / CATÁLOGOS CREATION (MANUAL)
// -------------------------------------------------------------

exports.createCarrera = async (req, res) => {
    const { codigo, nombre } = req.body;
    if (!codigo || !nombre) {
        return res.status(400).json({ error: 'Código y Nombre son requeridos.' });
    }

    try {
        const pool = await poolPromise;
        // Check if exists
        const check = await pool.request()
            .input('codigo', sql.VarChar, codigo)
            .query('SELECT CodigoCarrera FROM Carreras WHERE CodigoCarrera = @codigo');
        
        if (check.recordset.length > 0) {
            return res.status(409).json({ error: 'La carrera con ese código ya existe.' });
        }

        await pool.request()
            .input('codigo', sql.VarChar, codigo)
            .input('nombre', sql.VarChar, nombre)
            .query('INSERT INTO Carreras (CodigoCarrera, NombreCarrera) VALUES (@codigo, @nombre)');
        
        res.status(201).json({ message: 'Carrera creada exitosamente.', carrera: { CodigoCarrera: codigo, NombreCarrera: nombre } });
    } catch (err) {
        console.error('Error creating carrera:', err);
        res.status(500).json({ error: 'Error interno al crear carrera.' });
    }
};

exports.createMateria = async (req, res) => {
    const { codigo, nombre, uvs } = req.body;
    if (!codigo || !nombre) {
        return res.status(400).json({ error: 'Código y Nombre son requeridos para la materia.' });
    }

    try {
        const pool = await poolPromise;
        // Check if exists
        const check = await pool.request()
            .input('codigo', sql.VarChar, codigo)
            .query('SELECT CodigoMateria FROM Materias WHERE CodigoMateria = @codigo');
        
        if (check.recordset.length > 0) {
            return res.status(409).json({ error: 'La materia con ese código ya existe.' });
        }

        await pool.request()
            .input('codigo', sql.VarChar, codigo)
            .input('nombre', sql.VarChar, nombre)
            .input('uvs', sql.Int, uvs || 0)
            .query('INSERT INTO Materias (CodigoMateria, NombreMateria, UVS) VALUES (@codigo, @nombre, @uvs)');
        
        res.status(201).json({ message: 'Materia creada exitosamente.', materia: { CodigoMateria: codigo, NombreMateria: nombre, UVS: uvs || 0 } });
    } catch (err) {
        console.error('Error creating materia:', err);
        res.status(500).json({ error: 'Error interno al crear materia.' });
    }
};

// -------------------------------------------------------------
// POST / CATÁLOGOS UPLOAD (EXCEL)
// -------------------------------------------------------------

exports.uploadCatalogosExcel = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    const filePath = req.file.path;

    try {
        const data = await excelProcessor.processExcel(filePath);
        if (data.length === 0) {
            return res.status(400).json({ error: 'El archivo Excel está vacío o no se pudo leer.' });
        }

        const pool = await poolPromise;

        // Cachés para no re-insertar
        const carrerasSet = new Map();
        const materiasSet = new Map();

        // 1. Cargar existentes a memoria para comparar rápidamente
        const resultCarreras = await pool.request().query('SELECT CodigoCarrera FROM Carreras');
        resultCarreras.recordset.forEach(c => carrerasSet.set(c.CodigoCarrera, true));

        const resultMaterias = await pool.request().query('SELECT CodigoMateria FROM Materias');
        resultMaterias.recordset.forEach(m => materiasSet.set(m.CodigoMateria, true));

        let carrerasNuevas = 0;
        let materiasNuevas = 0;

        // Procesar archivo
        for (const row of data) {
            const rawRow = normalizeKeys(row);
            
            // Posibles campos del excel para carreras
            const codigoCarrera = (rawRow['codigo_carrera'] || rawRow['codigocarrera'] || '').toString().trim();
            const nombreCarrera = (rawRow['nombre_carrera'] || rawRow['nombrecarrera'] || '').toString().trim();

            if (codigoCarrera && nombreCarrera && !carrerasSet.has(codigoCarrera)) {
                await pool.request()
                    .input('codigo', sql.VarChar, codigoCarrera.substring(0, 20))
                    .input('nombre', sql.VarChar, nombreCarrera.substring(0, 150))
                    .query('INSERT INTO Carreras (CodigoCarrera, NombreCarrera) VALUES (@codigo, @nombre)');
                
                carrerasSet.set(codigoCarrera, true);
                carrerasNuevas++;
            }

            // Procesamos posibles materias del excel. Habían 2 pares posibles según la imagen:
            // codigo_materia_cursada / nombre_materia_cursada
            // codigo_materia_otorgada / nombre_materia_otorgada
            
            const checksMaterias = [
                {
                    cod: (rawRow['codigo_materia_cursada'] || '').toString().trim(),
                    nom: (rawRow['nombre_materia_cursada'] || '').toString().trim()
                },
                {
                    cod: (rawRow['codigo_materia_otorgada'] || '').toString().trim(),
                    nom: (rawRow['nombre_materia_otorgada'] || '').toString().trim()
                }
            ];

            for (let mat of checksMaterias) {
                if (mat.cod && mat.nom && !materiasSet.has(mat.cod)) {
                    await pool.request()
                        .input('codigo', sql.VarChar, mat.cod.substring(0, 20))
                        .input('nombre', sql.VarChar, mat.nom.substring(0, 150))
                        .input('uvs', sql.Int, 0) // Default 0 as we don't know it from the dict
                        .query('INSERT INTO Materias (CodigoMateria, NombreMateria, UVS) VALUES (@codigo, @nombre, @uvs)');
                    materiasSet.set(mat.cod, true);
                    materiasNuevas++;
                }
            }
        }

        // Limpiar archivo local
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        res.status(200).json({ 
            message: 'Procesamiento de catálogo completado.',
            carrerasNuevas,
            materiasNuevas
        });

    } catch (error) {
        console.error('Error procesando catálogo Excel:', error);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).json({ error: 'Ocurrió un error al procesar el archivo Excel.' });
    }
};

// Obtener carreras con sus planes de estudio (incluyendo totales)
exports.getCarrerasConPlanes = async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // Consulta para obtener todas las carreras
        const carrerasResult = await pool.request().query(`
            SELECT CodigoCarrera, NombreCarrera 
            FROM Carreras 
            ORDER BY NombreCarrera
        `);
        
        // Consulta para obtener todos los planes con sus totales
        const planesResult = await pool.request().query(`
            SELECT 
                p.IdPlan,
                p.NombrePlan,
                p.AnioPlan,
                p.CodigoCarrera,
                COUNT(pm.CodigoMateria) AS TotalMaterias,
                ISNULL(SUM(m.UVS), 0) AS TotalUVS
            FROM PlanesEstudio p
            LEFT JOIN Pensum_Materias pm ON p.IdPlan = pm.IdPlan
            LEFT JOIN Materias m ON pm.CodigoMateria = m.CodigoMateria
            GROUP BY p.IdPlan, p.NombrePlan, p.AnioPlan, p.CodigoCarrera
            ORDER BY p.CodigoCarrera, p.AnioPlan DESC
        `);

        res.status(200).json({
            carreras: carrerasResult.recordset,
            planes: planesResult.recordset
        });

    } catch (err) {
        console.error('Error getting carreras con planes:', err);
        res.status(500).json({ error: 'Error del servidor al obtener carreras y planes' });
    }
};

// Obtener materias de un plan específico
exports.getMateriasByPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await poolPromise;

        const result = await pool.request()
            .input('idPlan', sql.Int, id)
            .query(`
                SELECT 
                    pm.CodigoMateria,
                    m.NombreMateria,
                    m.UVS,
                    pm.Semestre
                FROM Pensum_Materias pm
                INNER JOIN Materias m ON pm.CodigoMateria = m.CodigoMateria
                WHERE pm.IdPlan = @idPlan
                ORDER BY ISNULL(pm.Semestre, 999), pm.CodigoMateria
            `);

        res.status(200).json(result.recordset);

    } catch (err) {
        console.error('Error getting materias del plan:', err);
        res.status(500).json({ error: 'Error del servidor al obtener materias del plan' });
    }
};

// Obtener todos los planes de estudio (opcional, por si lo necesitas)
exports.getAllPlanes = async (req, res) => {
    try {
        const pool = await poolPromise;
        
        const result = await pool.request().query(`
            SELECT 
                p.IdPlan,
                p.NombrePlan,
                p.AnioPlan,
                p.CodigoCarrera,
                c.NombreCarrera
            FROM PlanesEstudio p
            INNER JOIN Carreras c ON p.CodigoCarrera = c.CodigoCarrera
            ORDER BY c.NombreCarrera, p.AnioPlan DESC
        `);

        res.status(200).json(result.recordset);

    } catch (err) {
        console.error('Error getting planes:', err);
        res.status(500).json({ error: 'Error del servidor al obtener planes' });
    }
};