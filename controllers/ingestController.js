const excelProcessor = require('../services/excelProcessor');
const textParser = require('../services/textparser');
const { poolPromise, sql } = require('../config/db');

function normalizeEstadoHistorial(raw) {
    const s = (raw == null ? '' : String(raw)).trim().toUpperCase();
    return s || 'EN CURSO';
}

/** Nota para Historial_Importado: número o null (EQV / placeholders / no numérico). */
function parseNotaHistorial(estadoNorm, rawNota) {
    if (estadoNorm === 'EQV') return null;
    const t = (rawNota == null ? '' : String(rawNota)).replace(/\s+/g, ' ').trim();
    if (!t) return null;
    const compact = t.replace(/\s/g, '');
    if (/^-+$/.test(compact)) return null;
    const v = parseFloat(t.replace(',', '.'));
    return Number.isFinite(v) ? v : null;
}

function normalizeNotaFromDb(v) {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function parseRowIdPlan(row) {
    const raw = row.idplan ?? row.id_plan;
    if (raw == null || String(raw).trim() === '') return null;
    const n = parseInt(String(raw).trim(), 10);
    return Number.isInteger(n) && n > 0 ? n : null;
}

function parseRowAnioPlan(row) {
    const raw = row.anioplan ?? row.anio_plan;
    if (raw == null || String(raw).trim() === '') return null;
    const n = parseInt(String(raw).trim(), 10);
    return Number.isInteger(n) && n > 0 ? n : null;
}

function userProvidedExcelPlanId(row) {
    return parseRowIdPlan(row) != null;
}

function userProvidedExcelAnio(row) {
    return parseRowAnioPlan(row) != null;
}

/** uvs_tot del Excel (total UV aprobadas según registro). */
function parseRowUvsTot(row) {
    const raw = row.uvs_tot ?? row.uvstot ?? row.uvs_total;
    if (raw == null || String(raw).trim() === '') return null;
    const n = parseInt(String(raw).replace(/\s/g, ''), 10);
    return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * A: IdPlan del Excel existe en BD
 * B: Carrera + AnioPlan del Excel
 * C: IdPlanActual del alumno (cuenta fija o ADMIN por cuenta)
 * D: crear Plan {año actual} solo si la fila no trae IdPlan ni AnioPlan en el Excel
 */
async function resolvePlanIdForRow({
    row,
    finalCodigoCarrera,
    targetAcc,
    idPlanAlumnoDb,
    cuenta,
    pool,
    cache,
    getIdPlanActualForCuenta
}) {
    const rowIdPlan = parseRowIdPlan(row);
    if (rowIdPlan && cache.planesById.has(rowIdPlan)) {
        const meta = cache.planesById.get(rowIdPlan);
        const rowAnio = parseRowAnioPlan(row);
        if (
            rowAnio != null &&
            meta.AnioPlan != null &&
            Number(meta.AnioPlan) !== rowAnio
        ) {
            console.warn(
                `[Ingest] AnioPlan en Excel (${rowAnio}) no coincide con plan IdPlan=${rowIdPlan} (AnioPlan BD=${meta.AnioPlan}); se usa IdPlan del Excel.`
            );
        }
        return { idPlan: rowIdPlan, fromExcel: true };
    }
    if (rowIdPlan) {
        console.warn(
            `[Ingest] IdPlan=${rowIdPlan} del Excel no existe en PlanesEstudio; se intenta por carrera/año o alumno.`
        );
    }

    const rowAnio = parseRowAnioPlan(row);
    if (finalCodigoCarrera && finalCodigoCarrera !== 'S/D' && rowAnio != null) {
        const key = `${finalCodigoCarrera}|${rowAnio}`;
        const byCa = cache.planesByCarreraAnio.get(key);
        if (byCa != null) {
            return { idPlan: byCa, fromExcel: true };
        }
    }

    let idPlan = null;
    if (targetAcc === 'ADMIN_IMPORT') {
        idPlan = await getIdPlanActualForCuenta(cuenta);
    } else {
        idPlan = idPlanAlumnoDb;
    }
    if (idPlan != null && cache.planesById.has(idPlan)) {
        return { idPlan, fromExcel: false };
    }
    if (idPlan != null) {
        console.warn(
            `[Ingest] IdPlanActual del alumno (${idPlan}) no existe en PlanesEstudio; se ignora.`
        );
    }

    const skipFallbackCreate =
        userProvidedExcelPlanId(row) || userProvidedExcelAnio(row);
    if (skipFallbackCreate) {
        return { idPlan: null, fromExcel: false };
    }

    const anioFallback = new Date().getFullYear();
    const nombrePlanFallback = `Plan ${anioFallback}`;
    if (finalCodigoCarrera && finalCodigoCarrera !== 'S/D') {
        const planKey = `${finalCodigoCarrera}|${nombrePlanFallback.toLowerCase()}`;
        let fid = cache.planes.get(planKey);
        if (!fid) {
            const planResult = await pool
                .request()
                .input('codCarrera', sql.VarChar, finalCodigoCarrera)
                .input('anio', sql.Int, anioFallback)
                .input('nom', sql.VarChar, nombrePlanFallback)
                .query(`
                    INSERT INTO PlanesEstudio (CodigoCarrera, AnioPlan, NombrePlan)
                    OUTPUT INSERTED.IdPlan
                    VALUES (@codCarrera, @anio, @nom)
                `);
            fid = planResult.recordset[0].IdPlan;
            cache.planes.set(planKey, fid);
            cache.planesById.set(fid, {
                CodigoCarrera: finalCodigoCarrera,
                AnioPlan: anioFallback,
                NombrePlan: nombrePlanFallback
            });
            const caKey = `${finalCodigoCarrera}|${anioFallback}`;
            const cur = cache.planesByCarreraAnio.get(caKey);
            if (cur == null || fid < cur) {
                cache.planesByCarreraAnio.set(caKey, fid);
            }
            console.log(
                `[Ingest] Creado Plan (fallback): ${nombrePlanFallback} (ID: ${fid}) para carrera ${finalCodigoCarrera}`
            );
        }
        return { idPlan: fid, fromExcel: false, fallback: true };
    }

    return { idPlan: null, fromExcel: false };
}

// Función reutilizable para procesar datos en la BD
async function processDataInDB(rawData, numeroCuenta, bypassPlanValidation = false) {
    const pool = await poolPromise;
    let count = 0;
    let errors = [];
    let inserts = 0;
    let updates = 0;

    // --- OBTENER DATOS DEL ALUMNO ACTUAL ---
    let idPlanAlumno = null;
    let codigoCarreraAlumno = 'S/D';
    let nombreCarreraAlumno = 'Sin Asignar';
    
    try {
        const alumnoInfo = await pool.request()
            .input('cuenta', sql.VarChar, numeroCuenta)
            .query(`
                SELECT a.IdPlanActual, p.CodigoCarrera, c.NombreCarrera, c.CodigoCarrera as CodCarrera
                FROM Alumnos a
                LEFT JOIN PlanesEstudio p ON a.IdPlanActual = p.IdPlan
                LEFT JOIN Carreras c ON p.CodigoCarrera = c.CodigoCarrera
                WHERE a.NumeroCuenta = @cuenta
            `);
        
        if (alumnoInfo.recordset.length > 0) {
            idPlanAlumno = alumnoInfo.recordset[0].IdPlanActual;
            codigoCarreraAlumno = alumnoInfo.recordset[0].CodigoCarrera || 'S/D';
            nombreCarreraAlumno = alumnoInfo.recordset[0].NombreCarrera || 'Sin Asignar';
            console.log(`[Ingest] Alumno pertenece a carrera: ${codigoCarreraAlumno} - ${nombreCarreraAlumno}`);
        } else {
            console.log(`[Ingest] Alumno no encontrado en BD, se usará carrera por defecto`);
        }
    } catch (e) {
        console.error('[Ingest] Error obteniendo carrera del alumno:', e);
    }

    // --- CACHÉS EN MEMORIA ---
    const cache = {
        carreras: new Set(),
        planes: new Map(),
        planesById: new Map(),
        planesByCarreraAnio: new Map(),
        materias: new Set(),
        alumnos: new Set(),
        historial: new Map() // key: 'cuenta|codigoMateria', value: { nota, estado }
    };

    const alumnoIdPlanLazy = new Map();
    async function getIdPlanActualForCuenta(cuenta) {
        if (alumnoIdPlanLazy.has(cuenta)) return alumnoIdPlanLazy.get(cuenta);
        const r = await pool.request()
            .input('c', sql.VarChar, cuenta)
            .query('SELECT IdPlanActual FROM Alumnos WHERE NumeroCuenta = @c');
        const id = r.recordset[0]?.IdPlanActual ?? null;
        alumnoIdPlanLazy.set(cuenta, id);
        return id;
    }

    const idPlanSyncedForCuenta = new Set();
    const uvsTotRegistroByCuenta = new Map();

    // Precargar cachés
    console.log('[Ingest] Precargando cachés...');
    
    const carrerasDB = await pool.request().query('SELECT CodigoCarrera FROM Carreras');
    carrerasDB.recordset.forEach(c => cache.carreras.add(c.CodigoCarrera));

    const planesDB = await pool.request().query(`
        SELECT IdPlan, CodigoCarrera, AnioPlan, NombrePlan FROM PlanesEstudio
    `);
    planesDB.recordset.forEach((p) => {
        if (p.CodigoCarrera && p.NombrePlan) {
            cache.planes.set(`${p.CodigoCarrera}|${p.NombrePlan.toLowerCase()}`, p.IdPlan);
        }
        cache.planesById.set(p.IdPlan, {
            CodigoCarrera: p.CodigoCarrera,
            AnioPlan: p.AnioPlan,
            NombrePlan: p.NombrePlan
        });
        if (p.CodigoCarrera != null && p.AnioPlan != null) {
            const caKey = `${p.CodigoCarrera}|${Number(p.AnioPlan)}`;
            const cur = cache.planesByCarreraAnio.get(caKey);
            if (cur == null || p.IdPlan < cur) {
                cache.planesByCarreraAnio.set(caKey, p.IdPlan);
            }
        }
    });

    const materiasDB = await pool.request().query('SELECT CodigoMateria FROM Materias');
    materiasDB.recordset.forEach(m => cache.materias.add(m.CodigoMateria));

    const alumnosDB = await pool.request().query('SELECT NumeroCuenta FROM Alumnos');
    alumnosDB.recordset.forEach(a => cache.alumnos.add(a.NumeroCuenta));

    // Precargar historial existente del alumno
    const historialDB = await pool.request()
        .input('cuenta', sql.VarChar, numeroCuenta)
        .query('SELECT CodigoMateria, Nota, Estado FROM Historial_Importado WHERE NumeroCuenta = @cuenta');
    
    historialDB.recordset.forEach(h => {
        cache.historial.set(`${numeroCuenta}|${h.CodigoMateria}`, {
            nota: normalizeNotaFromDb(h.Nota),
            estado: h.Estado
        });
    });
    
    console.log(`[Ingest] Historial existente cargado: ${historialDB.recordset.length} registros`);

    // Procesar cada registro
    for (const record of rawData) {
        try {
            const row = {};
            Object.keys(record).forEach(k => row[k.toLowerCase().trim()] = record[k]);

            // Datos de la materia
            const codigoMateria = row.codigo_materia || 'S/D';
            const nombreMateria = row.nombre_materia || 'S/D';
            const uvs = parseInt(row.uvs || 0);

            const estadoNormalizado = normalizeEstadoHistorial(row.estado);
            const nota = parseNotaHistorial(estadoNormalizado, row.nota);

            // --- VALIDACIÓN Y EXTRACCIÓN DE CUENTA ---
            const cuentaEnData = row.cuenta || row.numerocuenta || row.account;
            let cuenta = numeroCuenta;
            let nombreAlumno = row.nombre || row.nombrecompleto || row.student_name || 'Nombre Desconocido';
            let indiceAlumno = parseFloat(row.indice || row.indiceacademico || row.index || 0);
            
            if (isNaN(indiceAlumno)) indiceAlumno = 0;

            // Si numeroCuenta es 'ADMIN_IMPORT', intentamos obtener la cuenta de la fila
            const targetAcc = numeroCuenta ? numeroCuenta.toString().trim() : '';
            if (targetAcc === 'ADMIN_IMPORT') {
                if (cuentaEnData) {
                    cuenta = cuentaEnData.toString().trim();
                } else {
                    // Si no hay cuenta en la fila y es ADMIN_IMPORT, no podemos procesar
                    continue;
                }
            } else {
                // Si NO es 'ADMIN_IMPORT' (es un alumno o admin con alumno seleccionado)
                // Solo validamos si la cuenta viene en los datos y no coincide
                if (cuentaEnData && cuentaEnData.toString().trim() !== targetAcc) {
                    console.warn(`[Ingest] Fila ignorada: la cuenta en datos (${cuentaEnData}) no coincide con la seleccionada (${targetAcc})`);
                    continue;
                }
            }

            const uvsTotParsed = parseRowUvsTot(row);
            if (uvsTotParsed != null) {
                const prev = uvsTotRegistroByCuenta.get(cuenta);
                uvsTotRegistroByCuenta.set(
                    cuenta,
                    prev == null ? uvsTotParsed : Math.max(prev, uvsTotParsed)
                );
            }

            // Datos de Carrera: si no tenemos carrera del alumno, intentar extraer del texto
            let codigo_carrera_row = row.codigo_carrera || row.cod_carrera || row.career_code;
            let nombre_carrera_row = row.nombre_carrera || row.nom_carrera || row.career_name;

            let finalCodigoCarrera = codigoCarreraAlumno;
            let finalNombreCarrera = nombreCarreraAlumno;

            // Si el alumno no tiene carrera (S/D) y la fila trae una, usar la de la fila
            if ((finalCodigoCarrera === 'S/D' || numeroCuenta === 'ADMIN_IMPORT') && codigo_carrera_row) {
                finalCodigoCarrera = codigo_carrera_row.toString().trim();
                finalNombreCarrera = nombre_carrera_row ? nombre_carrera_row.toString().trim() : (finalCodigoCarrera === 'S/D' ? 'Sin Asignar' : 'Carrera ' + finalCodigoCarrera);
            }

            if (!codigoMateria || codigoMateria === 'S/D') {
                continue;
            }

            // Gestionar Carrera (siempre crear si no existe para evitar conflicto FK)
            if (!cache.carreras.has(finalCodigoCarrera)) {
                try {
                    await pool.request()
                        .input('cod', sql.VarChar, finalCodigoCarrera)
                        .input('nom', sql.VarChar, finalNombreCarrera)
                        .query('INSERT INTO Carreras (CodigoCarrera, NombreCarrera) VALUES (@cod, @nom)');
                    cache.carreras.add(finalCodigoCarrera);
                    console.log(`[Ingest] Creada Carrera: ${finalCodigoCarrera}`);
                } catch (e) {
                    // Si ya existe, ignorar
                }
            }

            const alumnoExistedBeforeAlumnoStep = cache.alumnos.has(cuenta);

            const planRes = await resolvePlanIdForRow({
                row,
                finalCodigoCarrera,
                targetAcc,
                idPlanAlumnoDb: idPlanAlumno,
                cuenta,
                pool,
                cache,
                getIdPlanActualForCuenta
            });
            const idPlan = planRes.idPlan;
            const planFromExcel = planRes.fromExcel;

            // Gestionar Materia
            if (!cache.materias.has(codigoMateria)) {
                try {
                    await pool.request()
                        .input('cod', sql.VarChar, codigoMateria)
                        .input('nom', sql.VarChar, nombreMateria)
                        .input('uvs', sql.Int, uvs)
                        .query('INSERT INTO Materias (CodigoMateria, NombreMateria, UVS) VALUES (@cod, @nom, @uvs)');
                    cache.materias.add(codigoMateria);
                    console.log(`[Ingest] Creada Materia: ${codigoMateria}`);
                } catch (e) {
                    // Si ya existe, ignorar
                }
            }

            // Gestionar Alumno (si no existe)
            if (!cache.alumnos.has(cuenta)) {
                try {
                    await pool.request()
                        .input('cuenta', sql.VarChar, cuenta)
                        .input('nombre', sql.VarChar, nombreAlumno)
                        .input('idPlan', sql.Int, idPlan)
                        .input('indice', sql.Decimal(5, 2), indiceAlumno)
                        .query(`
                            INSERT INTO Alumnos (NumeroCuenta, NombreCompleto, IdPlanActual, IndiceAcademico)
                            VALUES (@cuenta, @nombre, @idPlan, @indice)
                        `);
                    cache.alumnos.add(cuenta);
                    console.log(`[Ingest] Creado Alumno: ${cuenta}`);
                } catch (e) {
                    console.error(`[Ingest] Error al crear Alumno ${cuenta}:`, e.message);
                }
            }

            // --- SEGURIDAD: SI EL ALUMNO NO EXISTE EN CACHÉ NI PUDO SER CREADO, SALTAR ---
            if (!cache.alumnos.has(cuenta)) {
                // Re-verificar en DB por si acaso los cachés fallaron
                const checkAlum = await pool.request().input('c', sql.VarChar, cuenta).query('SELECT 1 FROM Alumnos WHERE NumeroCuenta = @c');
                if (checkAlum.recordset.length === 0) {
                    console.warn(`[Ingest] Omitiendo historial: el alumno ${cuenta} no pudo ser creado.`);
                    continue;
                }
                cache.alumnos.add(cuenta);
            }

            if (
                planFromExcel &&
                idPlan != null &&
                alumnoExistedBeforeAlumnoStep &&
                !idPlanSyncedForCuenta.has(cuenta)
            ) {
                try {
                    await pool
                        .request()
                        .input('idPlan', sql.Int, idPlan)
                        .input('c', sql.VarChar, cuenta)
                        .query('UPDATE Alumnos SET IdPlanActual = @idPlan WHERE NumeroCuenta = @c');
                    idPlanSyncedForCuenta.add(cuenta);
                    alumnoIdPlanLazy.set(cuenta, idPlan);
                    console.log(`[Ingest] IdPlanActual sincronizado desde Excel para ${cuenta} -> ${idPlan}`);
                } catch (e) {
                    console.error('[Ingest] Error actualizando IdPlanActual:', e.message);
                }
            }

            // --- UPSERT EN HISTORIAL ---
            const historialKey = `${cuenta}|${codigoMateria}`;
            const existeHistorial = cache.historial.has(historialKey);

            if (existeHistorial) {
                // Verificar si los datos cambiaron (comparación exacta)
                const datosPrevios = cache.historial.get(historialKey);
                const estadoPrevNormalizado = normalizeEstadoHistorial(datosPrevios.estado);

                const prevNota = normalizeNotaFromDb(datosPrevios.nota);
                const notaCambio = prevNota !== nota;
                const estadoCambio = estadoPrevNormalizado !== estadoNormalizado;
                
                if (notaCambio || estadoCambio) {
                    // Actualizar registro existente
                    await pool.request()
                        .input('NumeroCuenta', sql.VarChar, cuenta)
                        .input('CodigoMateria', sql.VarChar, codigoMateria)
                        .input('Nota', sql.Decimal(5, 2), nota)
                        .input('Estado', sql.VarChar, estadoNormalizado)
                        .query(`
                            UPDATE Historial_Importado 
                            SET Nota = @Nota, Estado = @Estado, FechaActualizacion = GETDATE()
                            WHERE NumeroCuenta = @NumeroCuenta AND CodigoMateria = @CodigoMateria
                        `);
                    
                    // Actualizar caché
                    cache.historial.set(historialKey, { nota, estado: estadoNormalizado });
                    updates++;
                    console.log(`[Ingest] Actualizado: ${codigoMateria} (nota: ${nota}, estado: ${estadoNormalizado})`);
                } else {
                    // Sin cambios, ignorar
                    console.log(`[Ingest] Sin cambios: ${codigoMateria}`);
                }
            } else {
                // Insertar nuevo registro
                await pool.request()
                    .input('NumeroCuenta', sql.VarChar, cuenta)
                    .input('CodigoMateria', sql.VarChar, codigoMateria)
                    .input('NombreMateria', sql.VarChar, nombreMateria)
                    .input('Nota', sql.Decimal(5, 2), nota)
                    .input('Estado', sql.VarChar, estadoNormalizado)
                    .query(`
                        INSERT INTO Historial_Importado (NumeroCuenta, CodigoMateria, NombreMateria, Nota, Estado, FechaCreacion)
                        VALUES (@NumeroCuenta, @CodigoMateria, @NombreMateria, @Nota, @Estado, GETDATE())
                    `);
                
                // Actualizar caché
                cache.historial.set(historialKey, { nota, estado: estadoNormalizado });
                inserts++;
                console.log(`[Ingest] Insertado: ${codigoMateria} (estado: ${estadoNormalizado})`);
            }

            count++;
        } catch (innerErr) {
            console.error(`[Ingest] Error en fila:`, innerErr.message);
            errors.push({ 
                record: { materia: record.codigo_materia }, 
                error: innerErr.message 
            });
        }
    }

    for (const [cuentaVal, v] of uvsTotRegistroByCuenta) {
        try {
            await pool
                .request()
                .input('v', sql.Int, v)
                .input('c', sql.VarChar, cuentaVal)
                .query(
                    'UPDATE Alumnos SET UVsTotalesRegistro = @v WHERE NumeroCuenta = @c'
                );
            console.log(`[Ingest] UVsTotalesRegistro (registro universidad) = ${v} para ${cuentaVal}`);
        } catch (e) {
            console.warn(
                '[Ingest] No se pudo guardar UVsTotalesRegistro (¿migración sql/2026-03-28-alumnos-uvs-registro.sql?):',
                e.message
            );
        }
    }

    console.log(`[Ingest] Resumen: ${inserts} insertados, ${updates} actualizados, ${errors.length} errores`);
    return { count, inserts, updates, errors };
}

// Endpoint para procesar archivo Excel
exports.processUpload = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ningún archivo' });
        }

        let { numeroCuenta } = req.body;
        
        if (!numeroCuenta) {
            return res.status(400).json({ error: 'Número de cuenta requerido' });
        }

        // Si es estudiante, solo puede importar a su propia cuenta.
        if (req.user?.rol === 3) {
            const ownAccount = (req.user.numeroCuenta || '').toString().trim();
            const targetAccount = (numeroCuenta || '').toString().trim();
            if (!ownAccount || ownAccount !== targetAccount) {
                return res.status(403).json({ error: 'FORBIDDEN' });
            }
            numeroCuenta = ownAccount;
        }

        const rawData = await excelProcessor.parseExcelBuffer(req.file.buffer);
        console.log(`[Ingest] Procesando ${rawData.length} filas desde Excel para cuenta ${numeroCuenta}...`);

        const { count, inserts, updates, errors } = await processDataInDB(rawData, numeroCuenta);

        res.status(200).json({
            message: 'Procesamiento Completado',
            recordsProcessed: count,
            inserts: inserts,
            updates: updates,
            errorsCount: errors.length,
            errors: errors.slice(0, 5)
        });

    } catch (error) {
        console.error('Error crítico:', error);
        res.status(500).json({ error: 'Error general al procesar el archivo Excel.' });
    }
};

// Endpoint para previsualizar texto formato CEUTEC
exports.previewTextCEUTEC = async (req, res) => {
    try {
        const { text } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'No se proporcionó texto' });
        }

        const rawData = textParser.parseCEUTECFormat(text);
        if (!rawData || rawData.length === 0) {
            return res.status(400).json({
                error: 'No se pudieron extraer registros del texto. Verifica el formato CEUTEC.'
            });
        }
        
        // Devolver todos los registros para la vista previa
        const previewData = rawData.map(row => ({
            codigo_materia: row.codigo_materia,
            nombre_materia: row.nombre_materia,
            nota: row.nota,
            estado: row.estado,
            uvs: row.uvs
        }));

        res.status(200).json({
            total: rawData.length,
            preview: previewData,
            allData: rawData
        });

    } catch (error) {
        console.error('Error en preview:', error);
        res.status(500).json({ error: 'Error al procesar el texto' });
    }
};

// Compatibilidad con endpoint anterior
exports.previewText = exports.previewTextCEUTEC;

// Endpoint para importar datos (recibe JSON)
exports.importData = async (req, res) => {
    try {
        const { data, cuenta, bypassPlanValidation } = req.body;
        let targetAccount = cuenta || req.body.numeroCuenta;
        
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ error: 'Datos inválidos' });
        }

        if (!targetAccount) {
            return res.status(400).json({ error: 'Número de cuenta requerido' });
        }

        // Si es estudiante, solo puede importar a su propia cuenta.
        if (req.user?.rol === 3) {
            const ownAccount = (req.user.numeroCuenta || '').toString().trim();
            const requestedAccount = (targetAccount || '').toString().trim();
            if (!ownAccount || ownAccount !== requestedAccount) {
                return res.status(403).json({ error: 'FORBIDDEN' });
            }
            targetAccount = ownAccount;
        }

        console.log(`[Ingest] Importando ${data.length} registros para cuenta ${targetAccount}. BypassPlan: ${bypassPlanValidation}`);

        const { count, inserts, updates, errors } = await processDataInDB(data, targetAccount, bypassPlanValidation);

        res.status(200).json({
            message: 'Importación Completada',
            recordsProcessed: count,
            inserts: inserts,
            updates: updates,
            errorsCount: errors.length,
            errors: errors.slice(0, 5)
        });

    } catch (error) {
        console.error('Error en importación:', error);
        res.status(500).json({ error: 'Error al importar los datos' });
    }
};