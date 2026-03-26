const { poolPromise, sql } = require('../config/db');
const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const excelProcessor = require('../services/excelProcessor');
const { extractCarreraAndAnio, parsePensumPdfText } = require('../services/pensumPdfConverter');
const {
    TEMPLATE_TYPES,
    TEMPLATE_DEFINITIONS,
    detectTemplateType,
    validateTemplateHeaders,
    validatePensumRows,
    validateReglasRows
} = require('../services/uploadValidators');

const TEMPLATE_FILES_DIR = path.join(__dirname, '..', 'public', 'templates');

function resolveTemplatePath(filename) {
    return path.join(TEMPLATE_FILES_DIR, filename);
}

function sendTemplateFileOrFallback({ res, templatePath, downloadName, fallbackBuilder }) {
    if (fs.existsSync(templatePath)) {
        return res.download(templatePath, downloadName);
    }
    return fallbackBuilder();
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
        const result = await pool.request().query(`
            SELECT 
                m.CodigoMateria, 
                m.NombreMateria, 
                m.UVS, 
                c.CodigoCarrera,
                c.NombreCarrera, 
                p.NombrePlan,
                p.AnioPlan
            FROM Materias m
            LEFT JOIN Pensum_Materias pm ON m.CodigoMateria = pm.CodigoMateria
            LEFT JOIN PlanesEstudio p ON pm.IdPlan = p.IdPlan
            LEFT JOIN Carreras c ON p.CodigoCarrera = c.CodigoCarrera
            ORDER BY m.NombreMateria
        `);
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
        
        // Verificar si la carrera ya existe
        const carreraCheck = await pool.request()
            .input('codigo', sql.VarChar, codigo)
            .query('SELECT NombreCarrera FROM Carreras WHERE CodigoCarrera = @codigo');
        
        if (carreraCheck.recordset.length > 0) {
            return res.status(409).json({
                error: `Carrera ya registrada bajo el ID: ${codigo}, carrera: ${carreraCheck.recordset[0].NombreCarrera}`
            });
        }

        await pool.request()
            .input('codigo', sql.VarChar, codigo)
            .input('nombre', sql.VarChar, nombre)
            .query('INSERT INTO Carreras (CodigoCarrera, NombreCarrera) VALUES (@codigo, @nombre)');
        
        res.status(201).json({ message: 'Carrera creada exitosamente.' });
    } catch (err) {
        console.error('Error creating carrera:', err);
        res.status(500).json({ error: 'Error interno al crear carrera.' });
    }
};

exports.createPlan = async (req, res) => {
    const { codigoCarrera, nombrePlan, anioPlan, nombreCarreraPlan } = req.body;
    if (!codigoCarrera || !nombrePlan || !anioPlan) {
        return res.status(400).json({ error: 'Código de Carrera, Nombre del Plan y Año son requeridos.' });
    }

    try {
        const pool = await poolPromise;

        // Verificar que la carrera exista
        const carreraCheck = await pool.request()
            .input('codigo', sql.VarChar, codigoCarrera)
            .query('SELECT NombreCarrera FROM Carreras WHERE CodigoCarrera = @codigo');

        if (carreraCheck.recordset.length === 0) {
            return res.status(404).json({ error: `No existe ninguna carrera con el código: ${codigoCarrera}. Créela primero.` });
        }

        const nombreCarreraPlanValue = (nombreCarreraPlan || carreraCheck.recordset[0].NombreCarrera || '')
            .toString()
            .trim();

        // Verificar si el plan ya existe
        const planCheck = await pool.request()
            .input('codigo', sql.VarChar, codigoCarrera)
            .input('nombrePlan', sql.VarChar, nombrePlan)
            .input('anio', sql.Int, anioPlan)
            .query(`
                SELECT p.IdPlan, c.NombreCarrera, p.NombrePlan 
                FROM PlanesEstudio p
                JOIN Carreras c ON p.CodigoCarrera = c.CodigoCarrera
                WHERE p.CodigoCarrera = @codigo
                  AND p.NombrePlan = @nombrePlan
                  AND p.AnioPlan = @anio
            `);
        
        if (planCheck.recordset.length > 0) {
            const p = planCheck.recordset[0];
            return res.status(409).json({ 
                error: `carrera ya registrado bajo el ID: ${p.IdPlan}, carrera: ${p.NombreCarrera}, plan de estudio: ${p.NombrePlan}` 
            });
        }

        const planInsert = await pool.request()
            .input('codigo', sql.VarChar, codigoCarrera)
            .input('nombrePlan', sql.VarChar, nombrePlan)
            .input('anio', sql.Int, anioPlan)
            .input('nombreCarreraPlan', sql.VarChar(150), nombreCarreraPlanValue)
            .query(`
                INSERT INTO PlanesEstudio (CodigoCarrera, NombrePlan, AnioPlan, NombreCarreraPlan)
                OUTPUT INSERTED.IdPlan
                VALUES (@codigo, @nombrePlan, @anio, @nombreCarreraPlan)
            `);
        
        const newPlanId = planInsert.recordset[0].IdPlan;

        // 4. Vincular materias si se proporcionaron
        if (req.body.materias && Array.from(req.body.materias).length > 0) {
            const materias = Array.from(req.body.materias);
            for (const codMateria of materias) {
                await pool.request()
                    .input('idPlan', sql.Int, newPlanId)
                    .input('cod', sql.VarChar, codMateria)
                    .query('INSERT INTO Pensum_Materias (IdPlan, CodigoMateria) VALUES (@idPlan, @cod)');
            }
        }
        
        res.status(201).json({ message: 'Plan de Estudio creado y materias vinculadas exitosamente.' });
    } catch (err) {
        console.error('Error creating plan:', err);
        res.status(500).json({ error: 'Error interno al crear el plan.' });
    }
};

exports.createMateria = async (req, res) => {
    const { codigo, nombre, uvs } = req.body;
    if (!codigo || !nombre) {
        return res.status(400).json({ error: 'Código y Nombre son requeridos.' });
    }

    try {
        const pool = await poolPromise;
        
        // 1. Verificar si la materia ya existe
        const materiaExists = await pool.request()
            .input('codigo', sql.VarChar, codigo)
            .query('SELECT NombreMateria FROM Materias WHERE CodigoMateria = @codigo');
        
        if (materiaExists.recordset.length > 0) {
            return res.status(409).json({ 
                error: `Materia ya registrada bajo el ID: ${codigo}, nombre: ${materiaExists.recordset[0].NombreMateria}` 
            });
        }

        // 2. Crear materia
        await pool.request()
            .input('codigo', sql.VarChar, codigo)
            .input('nombre', sql.VarChar, nombre)
            .input('uvs', sql.Int, uvs || 0)
            .query('INSERT INTO Materias (CodigoMateria, NombreMateria, UVS) VALUES (@codigo, @nombre, @uvs)');
        
        res.status(201).json({ message: 'Materia registrada exitosamente.' });
    } catch (err) {
        console.error('Error creating materia:', err);
        res.status(500).json({ error: 'Error interno al crear materia.' });
    }
};

exports.updateCarrera = async (req, res) => {
    const { codigo } = req.params;
    const { nombre } = req.body;

    if (!nombre) {
        return res.status(400).json({ error: 'El nombre de la carrera es requerido.' });
    }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('codigo', sql.VarChar(20), codigo)
            .input('nombre', sql.VarChar(150), nombre)
            .query(`
                UPDATE Carreras
                SET NombreCarrera = @nombre
                WHERE CodigoCarrera = @codigo
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Carrera no encontrada.' });
        }

        return res.status(200).json({ message: 'Carrera actualizada exitosamente.' });
    } catch (err) {
        console.error('Error updating carrera:', err);
        return res.status(500).json({ error: 'Error interno al actualizar carrera.' });
    }
};

exports.updateMateria = async (req, res) => {
    const { codigo } = req.params;
    const { codigoNuevo, nombre, uvs } = req.body;

    if (!nombre) {
        return res.status(400).json({ error: 'El nombre de la materia es requerido.' });
    }

    const uvValue = Number(uvs);
    if (!Number.isInteger(uvValue) || uvValue < 0) {
        return res.status(400).json({ error: 'UVs debe ser un numero entero mayor o igual a 0.' });
    }

    const oldCode = (codigo || '').trim().toUpperCase();
    const newCode = (codigoNuevo || codigo || '').toString().trim().toUpperCase();
    if (!newCode) {
        return res.status(400).json({ error: 'El codigo de materia es requerido.' });
    }

    try {
        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const existsOld = await new sql.Request(transaction)
                .input('codigo', sql.VarChar(20), oldCode)
                .query('SELECT CodigoMateria, NombreMateria, UVS FROM Materias WHERE CodigoMateria = @codigo');

            if (existsOld.recordset.length === 0) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Materia no encontrada.' });
            }

            if (newCode !== oldCode) {
                const existsNew = await new sql.Request(transaction)
                    .input('nuevoCodigo', sql.VarChar(20), newCode)
                    .query('SELECT 1 FROM Materias WHERE CodigoMateria = @nuevoCodigo');

                if (existsNew.recordset.length > 0) {
                    await transaction.rollback();
                    return res.status(409).json({ error: 'El nuevo codigo de materia ya existe.' });
                }

                // Crear nueva materia con el nuevo codigo.
                await new sql.Request(transaction)
                    .input('nuevoCodigo', sql.VarChar(20), newCode)
                    .input('nombre', sql.VarChar(150), nombre)
                    .input('uvs', sql.Int, uvValue)
                    .query(`
                        INSERT INTO Materias (CodigoMateria, NombreMateria, UVS)
                        VALUES (@nuevoCodigo, @nombre, @uvs)
                    `);

                // Reapuntar referencias FK.
                await new sql.Request(transaction)
                    .input('codigoOld', sql.VarChar(20), oldCode)
                    .input('codigoNew', sql.VarChar(20), newCode)
                    .query(`
                        UPDATE Pensum_Materias SET CodigoMateria = @codigoNew WHERE CodigoMateria = @codigoOld;
                        UPDATE Requisitos_Pensum SET CodigoMateria = @codigoNew WHERE CodigoMateria = @codigoOld;
                        UPDATE Requisitos_Pensum SET CodigoRequisito = @codigoNew WHERE CodigoRequisito = @codigoOld;
                        UPDATE Equivalencias_Internas SET CodigoMateriaPlan = @codigoNew WHERE CodigoMateriaPlan = @codigoOld;
                        UPDATE Equivalencias_Internas SET CodigoMateriaCursada = @codigoNew WHERE CodigoMateriaCursada = @codigoOld;
                        UPDATE Regla_MateriaDestino SET CodigoOtorgada = @codigoNew WHERE CodigoOtorgada = @codigoOld;
                        UPDATE DetalleConsulta_Equivalencias SET CodigoMateriaOtorgada = @codigoNew WHERE CodigoMateriaOtorgada = @codigoOld;
                    `);

                // Actualizar tablas sin FK por consistencia funcional.
                await new sql.Request(transaction)
                    .input('codigoOld', sql.VarChar(20), oldCode)
                    .input('codigoNew', sql.VarChar(20), newCode)
                    .input('nombre', sql.VarChar(150), nombre)
                    .query(`
                        UPDATE Historial_Importado
                        SET CodigoMateria = @codigoNew,
                            NombreMateria = @nombre
                        WHERE CodigoMateria = @codigoOld;
                    `);

                // Eliminar la materia antigua después de migrar referencias.
                await new sql.Request(transaction)
                    .input('codigoOld', sql.VarChar(20), oldCode)
                    .query('DELETE FROM Materias WHERE CodigoMateria = @codigoOld');
            } else {
                await new sql.Request(transaction)
                    .input('codigo', sql.VarChar(20), oldCode)
                    .input('nombre', sql.VarChar(150), nombre)
                    .input('uvs', sql.Int, uvValue)
                    .query(`
                        UPDATE Materias
                        SET NombreMateria = @nombre,
                            UVS = @uvs
                        WHERE CodigoMateria = @codigo
                    `);

                await new sql.Request(transaction)
                    .input('codigo', sql.VarChar(20), oldCode)
                    .input('nombre', sql.VarChar(150), nombre)
                    .query(`
                        UPDATE Historial_Importado
                        SET NombreMateria = @nombre
                        WHERE CodigoMateria = @codigo
                    `);
            }

            await transaction.commit();
            return res.status(200).json({
                message: 'Materia actualizada exitosamente.',
                codigoAnterior: oldCode,
                codigoActual: newCode
            });
        } catch (innerErr) {
            try { await transaction.rollback(); } catch (_) {}
            throw innerErr;
        }
    } catch (err) {
        console.error('Error updating materia:', err);
        return res.status(500).json({ error: 'Error interno al actualizar materia.' });
    }
};

exports.updatePlan = async (req, res) => {
    const { id } = req.params;
    const { codigoCarrera, nombrePlan, anioPlan, nombreCarreraPlan } = req.body;

    if (!codigoCarrera || !nombrePlan || !anioPlan) {
        return res.status(400).json({ error: 'Codigo de carrera, nombre del plan y anio son requeridos.' });
    }

    const anio = Number(anioPlan);
    if (!Number.isInteger(anio) || anio <= 0) {
        return res.status(400).json({ error: 'Anio de plan invalido.' });
    }

    try {
        const pool = await poolPromise;

        const carreraExists = await pool.request()
            .input('codigoCarrera', sql.VarChar(20), codigoCarrera)
            .query('SELECT 1 FROM Carreras WHERE CodigoCarrera = @codigoCarrera');

        if (carreraExists.recordset.length === 0) {
            return res.status(404).json({ error: 'La carrera indicada no existe.' });
        }

        const duplicatePlan = await pool.request()
            .input('idPlan', sql.Int, Number(id))
            .input('codigoCarrera', sql.VarChar(20), codigoCarrera)
            .input('nombrePlan', sql.VarChar(100), nombrePlan)
            .input('anioPlan', sql.Int, anio)
            .query(`
                SELECT 1
                FROM PlanesEstudio
                WHERE IdPlan <> @idPlan
                  AND CodigoCarrera = @codigoCarrera
                  AND NombrePlan = @nombrePlan
                  AND AnioPlan = @anioPlan
            `);

        if (duplicatePlan.recordset.length > 0) {
            return res.status(409).json({ error: 'Ya existe otro plan con esos mismos datos.' });
        }

        const nombreCarreraPlanValue = (nombreCarreraPlan || '').toString().trim();
        const finalNombreCarreraPlan = nombreCarreraPlanValue || null;

        const result = await pool.request()
            .input('idPlan', sql.Int, Number(id))
            .input('codigoCarrera', sql.VarChar(20), codigoCarrera)
            .input('nombrePlan', sql.VarChar(100), nombrePlan)
            .input('anioPlan', sql.Int, anio)
            .input('nombreCarreraPlan', sql.VarChar(150), finalNombreCarreraPlan)
            .query(`
                UPDATE PlanesEstudio
                SET CodigoCarrera = @codigoCarrera,
                    NombrePlan = @nombrePlan,
                    AnioPlan = @anioPlan,
                    NombreCarreraPlan = COALESCE(@nombreCarreraPlan, NombreCarreraPlan)
                WHERE IdPlan = @idPlan
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Plan no encontrado.' });
        }

        return res.status(200).json({ message: 'Plan de estudio actualizado exitosamente.' });
    } catch (err) {
        console.error('Error updating plan:', err);
        return res.status(500).json({ error: 'Error interno al actualizar el plan.' });
    }
};

exports.deleteCarrera = async (req, res) => {
    const { codigo } = req.params;
    try {
        const pool = await poolPromise;
        const plans = await pool.request()
            .input('codigo', sql.VarChar(20), codigo)
            .query('SELECT COUNT(*) AS total FROM PlanesEstudio WHERE CodigoCarrera = @codigo');

        if (plans.recordset[0].total > 0) {
            return res.status(409).json({
                error: 'No se puede eliminar la carrera porque tiene planes de estudio asociados.'
            });
        }

        const result = await pool.request()
            .input('codigo', sql.VarChar(20), codigo)
            .query('DELETE FROM Carreras WHERE CodigoCarrera = @codigo');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Carrera no encontrada.' });
        }
        return res.status(200).json({ message: 'Carrera eliminada exitosamente.' });
    } catch (err) {
        console.error('Error deleting carrera:', err);
        return res.status(500).json({ error: 'Error interno al eliminar carrera.' });
    }
};

exports.deleteMateria = async (req, res) => {
    const { codigo } = req.params;
    try {
        const pool = await poolPromise;
        const refs = await pool.request()
            .input('codigo', sql.VarChar(20), codigo)
            .query(`
                SELECT 
                    (SELECT COUNT(*) FROM Pensum_Materias WHERE CodigoMateria = @codigo) AS PensumRef,
                    (SELECT COUNT(*) FROM Requisitos_Pensum WHERE CodigoMateria = @codigo OR CodigoRequisito = @codigo) AS RequisitoRef,
                    (SELECT COUNT(*) FROM Equivalencias_Internas WHERE CodigoMateriaPlan = @codigo OR CodigoMateriaCursada = @codigo) AS EquivRef,
                    (SELECT COUNT(*) FROM Regla_MateriaDestino WHERE CodigoOtorgada = @codigo) AS ReglaDestinoRef,
                    (SELECT COUNT(*) FROM DetalleConsulta_Equivalencias WHERE CodigoMateriaOtorgada = @codigo) AS ConsultaRef
            `);

        const r = refs.recordset[0];
        const totalRefs = Number(r.PensumRef) + Number(r.RequisitoRef) + Number(r.EquivRef) + Number(r.ReglaDestinoRef) + Number(r.ConsultaRef);
        if (totalRefs > 0) {
            return res.status(409).json({
                error: 'No se puede eliminar la materia porque está siendo utilizada en planes, requisitos o equivalencias.'
            });
        }

        const result = await pool.request()
            .input('codigo', sql.VarChar(20), codigo)
            .query('DELETE FROM Materias WHERE CodigoMateria = @codigo');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Materia no encontrada.' });
        }
        return res.status(200).json({ message: 'Materia eliminada exitosamente.' });
    } catch (err) {
        console.error('Error deleting materia:', err);
        return res.status(500).json({ error: 'Error interno al eliminar materia.' });
    }
};

exports.deletePlan = async (req, res) => {
    const { id } = req.params;
    const idPlan = Number(id);
    if (!Number.isInteger(idPlan) || idPlan <= 0) {
        return res.status(400).json({ error: 'IdPlan inválido.' });
    }

    try {
        const pool = await poolPromise;
        const planInfoResult = await pool.request()
            .input('idPlan', sql.Int, idPlan)
            .query(`
                SELECT
                    p.IdPlan,
                    p.CodigoCarrera,
                    p.NombrePlan,
                    p.AnioPlan,
                    (SELECT COUNT(*) FROM Pensum_Materias WHERE IdPlan = @idPlan) AS MateriasPlan,
                    (SELECT COUNT(*) FROM Alumnos WHERE IdPlanActual = @idPlan) AS AlumnosRef,
                    (SELECT COUNT(*) FROM RegistroConsultas WHERE IdPlanDestino = @idPlan) AS ConsultasRef
                FROM PlanesEstudio p
                WHERE p.IdPlan = @idPlan
            `);

        if (planInfoResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Plan no encontrado.' });
        }

        const planInfo = planInfoResult.recordset[0];
        const materiasPlan = Number(planInfo.MateriasPlan || 0);
        const alumnosRef = Number(planInfo.AlumnosRef || 0);
        const consultasRef = Number(planInfo.ConsultasRef || 0);
        const hasRefs = alumnosRef > 0 || consultasRef > 0;

        if (materiasPlan > 0 && hasRefs) {
            return res.status(409).json({
                error: 'No se puede eliminar el plan porque está asignado a alumnos o consultas.'
            });
        }

        let idPlanDestino = null;
        if (materiasPlan === 0 && hasRefs) {
            const destinoResult = await pool.request()
                .input('idPlan', sql.Int, idPlan)
                .input('codigoCarrera', sql.VarChar(20), planInfo.CodigoCarrera)
                .input('nombrePlan', sql.VarChar(100), planInfo.NombrePlan)
                .input('anioPlan', sql.Int, Number(planInfo.AnioPlan))
                .query(`
                    SELECT TOP 1 p.IdPlan
                    FROM PlanesEstudio p
                    WHERE p.IdPlan <> @idPlan
                      AND p.CodigoCarrera = @codigoCarrera
                      AND EXISTS (
                          SELECT 1
                          FROM Pensum_Materias pm
                          WHERE pm.IdPlan = p.IdPlan
                      )
                    ORDER BY
                      CASE WHEN p.AnioPlan = @anioPlan THEN 0 ELSE 1 END,
                      CASE WHEN p.NombrePlan = @nombrePlan THEN 0 ELSE 1 END,
                      p.AnioPlan DESC,
                      p.IdPlan ASC
                `);

            if (destinoResult.recordset.length === 0) {
                return res.status(409).json({
                    error: 'No se puede eliminar el plan vacío porque no existe otro plan de la misma carrera con materias para reasignar alumnos/consultas.',
                    code: 'NO_DESTINO_VALIDO'
                });
            }

            idPlanDestino = Number(destinoResult.recordset[0].IdPlan);
        }

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            let alumnosReasignados = 0;
            let consultasReasignadas = 0;

            if (idPlanDestino) {
                const alumnosUpdate = await new sql.Request(tx)
                    .input('idPlan', sql.Int, idPlan)
                    .input('idPlanDestino', sql.Int, idPlanDestino)
                    .query(`
                        UPDATE Alumnos
                        SET IdPlanActual = @idPlanDestino
                        WHERE IdPlanActual = @idPlan
                    `);
                alumnosReasignados = Number((alumnosUpdate.rowsAffected && alumnosUpdate.rowsAffected[0]) || 0);

                const consultasUpdate = await new sql.Request(tx)
                    .input('idPlan', sql.Int, idPlan)
                    .input('idPlanDestino', sql.Int, idPlanDestino)
                    .query(`
                        UPDATE RegistroConsultas
                        SET IdPlanDestino = @idPlanDestino
                        WHERE IdPlanDestino = @idPlan
                    `);
                consultasReasignadas = Number((consultasUpdate.rowsAffected && consultasUpdate.rowsAffected[0]) || 0);
            }

            await new sql.Request(tx)
                .input('idPlan', sql.Int, idPlan)
                .query(`
                    DELETE FROM Requisitos_Pensum WHERE IdPlan = @idPlan;
                    DELETE FROM Pensum_Materias WHERE IdPlan = @idPlan;
                    DELETE FROM PlanesEstudio WHERE IdPlan = @idPlan;
                `);
            await tx.commit();

            if (idPlanDestino) {
                return res.status(200).json({
                    message: 'Plan vacío eliminado con reasignación automática.',
                    idPlanEliminado: idPlan,
                    idPlanDestino,
                    alumnosReasignados,
                    consultasReasignadas
                });
            }
        } catch (innerErr) {
            try { await tx.rollback(); } catch (_) {}
            throw innerErr;
        }

        return res.status(200).json({ message: 'Plan eliminado exitosamente.' });
    } catch (err) {
        console.error('Error deleting plan:', err);
        return res.status(500).json({ error: 'Error interno al eliminar plan.' });
    }
};

exports.deletePlanMateria = async (req, res) => {
    const { id, codigo } = req.params;
    const idPlan = Number(id);
    if (!Number.isInteger(idPlan) || idPlan <= 0) {
        return res.status(400).json({ error: 'IdPlan inválido.' });
    }

    try {
        const pool = await poolPromise;
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx)
                .input('idPlan', sql.Int, idPlan)
                .input('codigo', sql.VarChar(20), codigo)
                .query(`
                    DELETE FROM Requisitos_Pensum
                    WHERE IdPlan = @idPlan
                      AND (CodigoMateria = @codigo OR CodigoRequisito = @codigo);

                    DELETE FROM Pensum_Materias
                    WHERE IdPlan = @idPlan
                      AND CodigoMateria = @codigo;
                `);
            await tx.commit();
        } catch (innerErr) {
            try { await tx.rollback(); } catch (_) {}
            throw innerErr;
        }

        return res.status(200).json({ message: 'Materia eliminada del plan exitosamente.' });
    } catch (err) {
        console.error('Error deleting plan materia:', err);
        return res.status(500).json({ error: 'Error interno al eliminar materia del plan.' });
    }
};

// -------------------------------------------------------------
// POST / CATÁLOGOS UPLOAD (EXCEL)
// -------------------------------------------------------------

function buildValidationResponse(templateType, missingHeaders, errors) {
    return {
        error: 'VALIDATION_FAILED',
        templateType,
        missingHeaders,
        errorsCount: errors.length,
        errors: errors.slice(0, 100)
    };
}

function createLoteInsertRequest(request, { tipoCarga, nombreArchivo, filasLeidas }) {
    return request
        .input('TipoCarga', sql.VarChar(50), tipoCarga)
        .input('NombreArchivo', sql.VarChar(255), nombreArchivo || 'archivo.xlsx')
        .input('Estado', sql.VarChar(30), 'RECIBIDO')
        .input('FilasLeidas', sql.Int, filasLeidas)
        .query(`
            INSERT INTO CargaLote (TipoCarga, NombreArchivo, Estado, FilasLeidas, FechaInicio)
            OUTPUT INSERTED.IdLote
            VALUES (@TipoCarga, @NombreArchivo, @Estado, @FilasLeidas, GETDATE())
        `);
}

async function runPensumBulk(transaction, rows, idLote) {
    const table = new sql.Table('stg_Pensum');
    table.create = false;
    table.columns.add('IdLote', sql.Int, { nullable: false });
    table.columns.add('CodigoCarrera', sql.VarChar(20), { nullable: false });
    table.columns.add('AnioPlan', sql.Int, { nullable: false });
    table.columns.add('CodigoClase', sql.VarChar(20), { nullable: false });
    table.columns.add('NombreClase', sql.VarChar(150), { nullable: false });
    table.columns.add('UV', sql.Int, { nullable: false });

    rows.forEach((row) => {
        table.rows.add(
            idLote,
            row.codigoCarrera.substring(0, 20),
            row.anioPlan,
            row.codigoClase.substring(0, 20),
            row.nombreClase.substring(0, 150),
            row.uv
        );
    });

    const bulkRequest = new sql.Request(transaction);
    await bulkRequest.bulk(table);

    const applyRequest = new sql.Request(transaction);
    applyRequest.input('IdLote', sql.Int, idLote);
    await applyRequest.execute('usp_AplicarCargaPensum');
}

async function runReglasBulk(transaction, rows, idLote) {
    const table = new sql.Table('stg_ReglasEquivalencia');
    table.create = false;
    table.columns.add('IdLote', sql.Int, { nullable: false });
    table.columns.add('TipoEquivalencia', sql.VarChar(20), { nullable: false });
    table.columns.add('UniversidadOrigen', sql.VarChar(150), { nullable: true });
    table.columns.add('CodigoOrigen', sql.VarChar(50), { nullable: false });
    table.columns.add('CodigoDestino', sql.VarChar(20), { nullable: false });
    table.columns.add('Condicion', sql.VarChar(255), { nullable: true });

    rows.forEach((row) => {
        table.rows.add(
            idLote,
            row.tipoEquivalencia.substring(0, 20),
            (row.universidadOrigen || '').substring(0, 150) || null,
            row.codigoOrigen.substring(0, 50),
            row.codigoDestino.substring(0, 20),
            (row.condicion || '').substring(0, 255) || null
        );
    });

    const bulkRequest = new sql.Request(transaction);
    await bulkRequest.bulk(table);

    const applyRequest = new sql.Request(transaction);
    applyRequest.input('IdLote', sql.Int, idLote);
    await applyRequest.execute('usp_AplicarCargaReglasEquivalencia');
}

async function markLoteError(idLote, errorMessage) {
    if (!idLote) return;
    const pool = await poolPromise;
    await pool.request()
        .input('IdLote', sql.Int, idLote)
        .input('Estado', sql.VarChar(30), 'ERROR')
        .input('MensajeError', sql.VarChar(sql.MAX), errorMessage.substring(0, 4000))
        .query(`
            UPDATE CargaLote
            SET Estado = @Estado,
                MensajeError = @MensajeError,
                FechaFin = GETDATE()
            WHERE IdLote = @IdLote
        `);
}

async function processMassiveUpload({ req, res, templateType, parsed }) {
    if (!req.file) {
        return res.status(400).json({ error: 'No se subio ningun archivo' });
    }

    if (!parsed.rows || parsed.rows.length === 0) {
        return res.status(400).json({
            error: 'El archivo Excel esta vacio o no se pudo leer'
        });
    }

    const { missingHeaders } = validateTemplateHeaders(templateType, parsed.headers || []);
    if (missingHeaders.length > 0) {
        return res.status(400).json(buildValidationResponse(templateType, missingHeaders, []));
    }

    const validator = templateType === TEMPLATE_TYPES.PENSUM
        ? validatePensumRows
        : validateReglasRows;

    const { validRows, errors } = validator(parsed.rows);
    if (errors.length > 0) {
        return res.status(400).json(buildValidationResponse(templateType, [], errors));
    }

    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    let idLote = null;
    let transactionStarted = false;

    try {
        await transaction.begin();
        transactionStarted = true;
        const insertLoteResult = await createLoteInsertRequest(
            new sql.Request(transaction),
            {
                tipoCarga: templateType,
                nombreArchivo: req.file.originalname,
                filasLeidas: validRows.length
            }
        );
        idLote = insertLoteResult.recordset[0].IdLote;

        if (templateType === TEMPLATE_TYPES.PENSUM) {
            await runPensumBulk(transaction, validRows, idLote);
        } else {
            await runReglasBulk(transaction, validRows, idLote);
        }

        await new sql.Request(transaction)
            .input('IdLote', sql.Int, idLote)
            .input('Estado', sql.VarChar(30), 'APLICADO')
            .input('FilasInsertadas', sql.Int, validRows.length)
            .input('FilasRechazadas', sql.Int, 0)
            .query(`
                UPDATE CargaLote
                SET Estado = @Estado,
                    FilasInsertadas = @FilasInsertadas,
                    FilasRechazadas = @FilasRechazadas,
                    FechaFin = GETDATE()
                WHERE IdLote = @IdLote
            `);

        await transaction.commit();
        transactionStarted = false;

        return res.status(200).json({
            message: 'Carga masiva aplicada correctamente',
            templateType,
            idLote,
            filasProcesadas: validRows.length
        });
    } catch (error) {
        try {
            if (transactionStarted) {
                await transaction.rollback();
            }
        } catch (rollbackError) {
            console.error('Error en rollback de carga masiva:', rollbackError);
        }

        await markLoteError(idLote, error.message || 'Error desconocido');
        console.error('Error en carga masiva:', error);
        return res.status(500).json({
            error: 'Error al procesar la carga masiva'
        });
    }
}

exports.downloadPensumTemplate = async (req, res) => {
    const templatePath = resolveTemplatePath('plantilla_pensum.xlsx');
    return sendTemplateFileOrFallback({
        res,
        templatePath,
        downloadName: 'plantilla_pensum.xlsx',
        fallbackBuilder: async () => {
            const headers = TEMPLATE_DEFINITIONS[TEMPLATE_TYPES.PENSUM].requiredHeaders;
            const sampleRows = [
                ['I-06', 2023, 'CCC104', 'PROGRAMACION I', 4],
                ['I-06', 2023, 'CCC105', 'PROGRAMACION II', 4]
            ];
            const buffer = await excelProcessor.buildTemplateWorkbookBuffer({ headers, sampleRows });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="plantilla_pensum.xlsx"');
            return res.send(Buffer.from(buffer));
        }
    });
};

exports.downloadReglasTemplate = async (req, res) => {
    const templatePath = resolveTemplatePath('plantilla_reglas_equivalencia.xlsx');
    return sendTemplateFileOrFallback({
        res,
        templatePath,
        downloadName: 'plantilla_reglas_equivalencia.xlsx',
        fallbackBuilder: async () => {
            const headers = TEMPLATE_DEFINITIONS[TEMPLATE_TYPES.REGLAS_EQUIVALENCIA].requiredHeaders;
            const sampleRows = [
                ['INTERNA', '', 'ING113', 'EIE1', '1:1'],
                ['EXTERNA', 'UNAH', 'MAT-101', 'MAT101', '2:1']
            ];
            const buffer = await excelProcessor.buildTemplateWorkbookBuffer({ headers, sampleRows });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="plantilla_reglas_equivalencia.xlsx"');
            return res.send(Buffer.from(buffer));
        }
    });
};

exports.downloadStatusAlumnoTemplate = async (req, res) => {
    const templatePath = resolveTemplatePath('plantilla_status_alumno.xlsx');
    return sendTemplateFileOrFallback({
        res,
        templatePath,
        downloadName: 'plantilla_status_alumno.xlsx',
        fallbackBuilder: async () => {
            const headers = ['Numero_Cuenta', 'Estado_Alumno'];
            const sampleRows = [
                ['20240001', 'ACTIVO'],
                ['20240002', 'INACTIVO']
            ];
            const buffer = await excelProcessor.buildTemplateWorkbookBuffer({ headers, sampleRows });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="plantilla_status_alumno.xlsx"');
            return res.send(Buffer.from(buffer));
        }
    });
};

function extractFromFileName(originalFileName) {
    const value = (originalFileName || '').toString().trim();
    if (!value) return { codigoCarrera: null, anioPlan: null };

    const normalized = value.replace(/[–—]/g, '-');
    const codigoMatch = normalized.match(/\b([A-Z]{1,3})\s*-\s*(\d{2})\b/i);
    const anioMatch = normalized.match(/\b(19|20)\d{2}\b/);

    return {
        codigoCarrera: codigoMatch ? `${codigoMatch[1].toUpperCase()}-${codigoMatch[2]}` : null,
        anioPlan: anioMatch ? Number(anioMatch[0]) : null
    };
}

async function extractPensumPreviewFromPdf({ pdfBuffer, originalFileName, codigoCarreraInput, anioPlanInput }) {
    const parser = new PDFParse({ data: pdfBuffer });
    let parsedPdf;
    try {
        parsedPdf = await parser.getText();
    } finally {
        await parser.destroy();
    }

    const text = parsedPdf?.text || '';
    const detected = extractCarreraAndAnio(text);
    const detectedFromFileName = extractFromFileName(originalFileName);

    const codigoCarrera = (codigoCarreraInput || detected.codigoCarrera || detectedFromFileName.codigoCarrera || '')
        .toString()
        .trim()
        .toUpperCase();
    const anioPlanRaw = anioPlanInput || detected.anioPlan || detectedFromFileName.anioPlan;
    const anioPlan = Number(anioPlanRaw);

    if (!codigoCarrera) {
        throw new Error('No se pudo identificar Codigo_Carrera. Indicalo manualmente en el formulario.');
    }
    if (!Number.isInteger(anioPlan) || anioPlan <= 0) {
        throw new Error('No se pudo identificar Anio_Plan. Indicalo manualmente en el formulario.');
    }

    const materias = parsePensumPdfText(text);
    if (materias.length === 0) {
        throw new Error('No se pudieron extraer materias del PDF. Verifica que sea un pensum legible.');
    }

    return { codigoCarrera, anioPlan, materias };
}

function normalizePreviewMaterias(materias) {
    const rows = Array.isArray(materias) ? materias : [];
    const errors = [];
    const normalized = [];
    const seen = new Set();

    rows.forEach((row, idx) => {
        const codigoClase = (row.codigoClase || '').toString().trim().toUpperCase();
        const nombreClase = (row.nombreClase || '').toString().trim();
        const uv = Number(row.uv);
        const rowNumber = idx + 1;

        if (!codigoClase) errors.push(`Fila ${rowNumber}: Codigo_Clase es obligatorio.`);
        if (!nombreClase) errors.push(`Fila ${rowNumber}: Nombre_Clase es obligatorio.`);
        if (!Number.isInteger(uv) || uv < 0) errors.push(`Fila ${rowNumber}: UV debe ser entero >= 0.`);

        const key = `${codigoClase}|${nombreClase}|${uv}`;
        if (codigoClase && seen.has(key)) {
            errors.push(`Fila ${rowNumber}: materia duplicada en previsualización.`);
        } else {
            seen.add(key);
        }

        normalized.push({ codigoClase, nombreClase, uv });
    });

    return { normalized, errors };
}

async function sendPensumWorkbook({ res, codigoCarrera, anioPlan, materias }) {
    const headers = TEMPLATE_DEFINITIONS[TEMPLATE_TYPES.PENSUM].requiredHeaders;
    const rows = materias.map((m) => [
        codigoCarrera,
        anioPlan,
        m.codigoClase,
        m.nombreClase,
        m.uv
    ]);
    const buffer = await excelProcessor.buildTemplateWorkbookBuffer({ headers, sampleRows: rows });
    const filename = `plantilla_pensum_convertida_${codigoCarrera}_${anioPlan}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(buffer));
}

exports.previewPensumPdfTemplate = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subio ningun PDF' });
        }

        const result = await extractPensumPreviewFromPdf({
            pdfBuffer: req.file.buffer,
            originalFileName: req.file.originalname,
            codigoCarreraInput: req.body.codigoCarrera,
            anioPlanInput: req.body.anioPlan
        });

        return res.status(200).json(result);
    } catch (error) {
        return res.status(400).json({ error: error.message || 'No se pudo previsualizar el PDF.' });
    }
};

exports.convertPensumPdfTemplate = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subio ningun PDF' });
        }

        const result = await extractPensumPreviewFromPdf({
            pdfBuffer: req.file.buffer,
            originalFileName: req.file.originalname,
            codigoCarreraInput: req.body.codigoCarrera,
            anioPlanInput: req.body.anioPlan
        });

        return sendPensumWorkbook({
            res,
            codigoCarrera: result.codigoCarrera,
            anioPlan: result.anioPlan,
            materias: result.materias
        });
    } catch (error) {
        console.error('Error convirtiendo PDF a plantilla de pensum:', error);
        return res.status(500).json({
            error: 'Error interno al convertir PDF a plantilla'
        });
    }
};

exports.generatePensumFromPreview = async (req, res) => {
    try {
        const codigoCarrera = (req.body.codigoCarrera || '').toString().trim().toUpperCase();
        const anioPlan = Number(req.body.anioPlan);
        const materiasInput = req.body.materias;

        if (!codigoCarrera) {
            return res.status(400).json({ error: 'Codigo_Carrera es requerido.' });
        }
        if (!Number.isInteger(anioPlan) || anioPlan <= 0) {
            return res.status(400).json({ error: 'Anio_Plan debe ser entero positivo.' });
        }

        const { normalized, errors } = normalizePreviewMaterias(materiasInput);
        if (errors.length > 0) {
            return res.status(400).json({ error: errors[0], errors });
        }
        if (normalized.length === 0) {
            return res.status(400).json({ error: 'No hay materias para generar el Excel.' });
        }

        return sendPensumWorkbook({
            res,
            codigoCarrera,
            anioPlan,
            materias: normalized
        });
    } catch (error) {
        console.error('Error generando Excel desde previsualización:', error);
        return res.status(500).json({ error: 'Error interno al generar Excel.' });
    }
};

exports.uploadPensumExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subio ningun archivo' });
        }
        const parsed = await excelProcessor.parseExcelBufferDetailed(req.file.buffer);
        return processMassiveUpload({ req, res, templateType: TEMPLATE_TYPES.PENSUM, parsed });
    } catch (error) {
        console.error('Error en upload de pensum:', error);
        return res.status(500).json({ error: 'Error interno procesando plantilla de pensum' });
    }
};

exports.uploadReglasEquivalenciaExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subio ningun archivo' });
        }
        const parsed = await excelProcessor.parseExcelBufferDetailed(req.file.buffer);
        return processMassiveUpload({
            req,
            res,
            templateType: TEMPLATE_TYPES.REGLAS_EQUIVALENCIA,
            parsed
        });
    } catch (error) {
        console.error('Error en upload de reglas:', error);
        return res.status(500).json({ error: 'Error interno procesando plantilla de reglas' });
    }
};

exports.uploadCatalogosExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subio ningun archivo' });
        }
        const parsed = await excelProcessor.parseExcelBufferDetailed(req.file.buffer);
        const detectedType = detectTemplateType(parsed.headers || []);

        if (!detectedType) {
            return res.status(400).json({
                error: 'No se reconocio el tipo de plantilla',
                supportedTemplates: Object.values(TEMPLATE_TYPES)
            });
        }

        return processMassiveUpload({ req, res, templateType: detectedType, parsed });
    } catch (error) {
        console.error('Error en endpoint legacy de catalogo:', error);
        return res.status(500).json({ error: 'Error al procesar el archivo Excel' });
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
                ISNULL(p.NombreCarreraPlan, c.NombreCarrera) AS NombreCarreraPlan,
                COUNT(pm.CodigoMateria) AS TotalMaterias,
                ISNULL(SUM(m.UVS), 0) AS TotalUVS
            FROM PlanesEstudio p
            LEFT JOIN Carreras c ON p.CodigoCarrera = c.CodigoCarrera
            LEFT JOIN Pensum_Materias pm ON p.IdPlan = pm.IdPlan
            LEFT JOIN Materias m ON pm.CodigoMateria = m.CodigoMateria
            GROUP BY p.IdPlan, p.NombrePlan, p.AnioPlan, p.CodigoCarrera, p.NombreCarreraPlan, c.NombreCarrera
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

exports.updatePlanMateriaSemestre = async (req, res) => {
    try {
        const { id, codigo } = req.params;
        const { semestre } = req.body;
        const idPlan = Number(id);

        if (!Number.isInteger(idPlan) || idPlan <= 0) {
            return res.status(400).json({ error: 'IdPlan invalido.' });
        }

        let semestreValue = null;
        if (semestre !== null && semestre !== undefined && semestre !== '') {
            const parsed = Number(semestre);
            if (!Number.isInteger(parsed) || parsed <= 0) {
                return res.status(400).json({ error: 'Semestre debe ser entero positivo o vacio.' });
            }
            semestreValue = parsed;
        }

        const pool = await poolPromise;
        const result = await pool.request()
            .input('idPlan', sql.Int, idPlan)
            .input('codigo', sql.VarChar(20), codigo)
            .input('semestre', sql.Int, semestreValue)
            .query(`
                UPDATE Pensum_Materias
                SET Semestre = @semestre
                WHERE IdPlan = @idPlan
                  AND CodigoMateria = @codigo
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Materia del plan no encontrada.' });
        }

        return res.status(200).json({ message: 'Semestre actualizado exitosamente.' });
    } catch (err) {
        console.error('Error updating plan materia semestre:', err);
        return res.status(500).json({ error: 'Error interno al actualizar semestre.' });
    }
};

exports.addPlanMateria = async (req, res) => {
    try {
        const { id } = req.params;
        const { codigoMateria, semestre } = req.body;
        const idPlan = Number(id);

        if (!Number.isInteger(idPlan) || idPlan <= 0) {
            return res.status(400).json({ error: 'IdPlan invalido.' });
        }

        const codigo = (codigoMateria || '').toString().trim().toUpperCase();
        if (!codigo) {
            return res.status(400).json({ error: 'Codigo de materia requerido.' });
        }

        let semestreValue = null;
        if (semestre !== null && semestre !== undefined && semestre !== '') {
            const parsed = Number(semestre);
            if (!Number.isInteger(parsed) || parsed <= 0) {
                return res.status(400).json({ error: 'Semestre debe ser entero positivo o vacio.' });
            }
            semestreValue = parsed;
        }

        const pool = await poolPromise;
        const existsPlan = await pool.request()
            .input('idPlan', sql.Int, idPlan)
            .query('SELECT 1 FROM PlanesEstudio WHERE IdPlan = @idPlan');

        if (existsPlan.recordset.length === 0) {
            return res.status(404).json({ error: 'Plan no encontrado.' });
        }

        const existsMateria = await pool.request()
            .input('codigo', sql.VarChar(20), codigo)
            .query('SELECT 1 FROM Materias WHERE CodigoMateria = @codigo');

        if (existsMateria.recordset.length === 0) {
            return res.status(404).json({ error: 'La materia indicada no existe.' });
        }

        const existsInPlan = await pool.request()
            .input('idPlan', sql.Int, idPlan)
            .input('codigo', sql.VarChar(20), codigo)
            .query(`
                SELECT 1
                FROM Pensum_Materias
                WHERE IdPlan = @idPlan
                  AND CodigoMateria = @codigo
            `);

        if (existsInPlan.recordset.length > 0) {
            return res.status(409).json({ error: 'La materia ya existe en este plan.' });
        }

        await pool.request()
            .input('idPlan', sql.Int, idPlan)
            .input('codigo', sql.VarChar(20), codigo)
            .input('semestre', sql.Int, semestreValue)
            .query(`
                INSERT INTO Pensum_Materias (IdPlan, CodigoMateria, Semestre)
                VALUES (@idPlan, @codigo, @semestre)
            `);

        return res.status(201).json({ message: 'Materia agregada al plan exitosamente.' });
    } catch (err) {
        console.error('Error adding materia to plan:', err);
        return res.status(500).json({ error: 'Error interno al agregar materia al plan.' });
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
                ISNULL(p.NombreCarreraPlan, c.NombreCarrera) AS NombreCarrera
            FROM PlanesEstudio p
            INNER JOIN Carreras c ON p.CodigoCarrera = c.CodigoCarrera
            ORDER BY ISNULL(p.NombreCarreraPlan, c.NombreCarrera), p.AnioPlan DESC
        `);

        res.status(200).json(result.recordset);

    } catch (err) {
        console.error('Error getting planes:', err);
        res.status(500).json({ error: 'Error del servidor al obtener planes' });
    }
};