const excelProcessor = require('../services/excelProcessor');
const textParser = require('../services/textparser');
const { poolPromise, sql } = require('../config/db');

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
        materias: new Set(),
        alumnos: new Set(),
        historial: new Map() // key: 'cuenta|codigoMateria', value: { nota, estado }
    };

    // Precargar cachés
    console.log('[Ingest] Precargando cachés...');
    
    const carrerasDB = await pool.request().query('SELECT CodigoCarrera FROM Carreras');
    carrerasDB.recordset.forEach(c => cache.carreras.add(c.CodigoCarrera));

    const planesDB = await pool.request().query('SELECT IdPlan, CodigoCarrera, NombrePlan FROM PlanesEstudio');
    planesDB.recordset.forEach(p => {
        if (p.CodigoCarrera && p.NombrePlan) {
            cache.planes.set(`${p.CodigoCarrera}|${p.NombrePlan.toLowerCase()}`, p.IdPlan);
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
            nota: h.Nota, 
            estado: h.Estado 
        });
    });
    
    console.log(`[Ingest] Historial existente cargado: ${historialDB.recordset.length} registros`);

    // Procesar cada registro
    for (const record of rawData) {
        try {
            const row = {};
            Object.keys(record).forEach(k => row[k.toLowerCase().trim()] = record[k]);

            // Extraer año del plan actual o actual global
            const anioPlan = new Date().getFullYear();
            const nombrePlanExcel = `Plan ${anioPlan}`;

            // Datos de la materia
            const codigoMateria = row.codigo_materia || 'S/D';
            const nombreMateria = row.nombre_materia || 'S/D';
            const uvs = parseInt(row.uvs || 0);

            const nota = parseFloat(row.nota || 0);
            const estado = row.estado || 'EN CURSO';

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

            // Gestionar Plan (usar el plan del alumno o crear uno nuevo)
            let idPlan = idPlanAlumno;
            const planKey = `${finalCodigoCarrera}|${nombrePlanExcel.toLowerCase()}`;

            if (!idPlan || numeroCuenta === 'ADMIN_IMPORT') {
                idPlan = cache.planes.get(planKey);
                
                if (!idPlan && (finalCodigoCarrera && finalCodigoCarrera !== 'S/D')) {
                    try {
                        const planResult = await pool.request()
                            .input('codCarrera', sql.VarChar, finalCodigoCarrera)
                            .input('anio', sql.Int, anioPlan)
                            .input('nom', sql.VarChar, nombrePlanExcel)
                            .query(`
                                INSERT INTO PlanesEstudio (CodigoCarrera, AnioPlan, NombrePlan) 
                                OUTPUT INSERTED.IdPlan
                                VALUES (@codCarrera, @anio, @nom)
                            `);
                        
                        idPlan = planResult.recordset[0].IdPlan;
                        cache.planes.set(planKey, idPlan);
                        console.log(`[Ingest] Creado Plan: ${nombrePlanExcel} (ID: ${idPlan}) para carrera ${finalCodigoCarrera}`);
                    } catch (e) {
                        console.error(`[Ingest] Error al crear Plan ${nombrePlanExcel}:`, e.message);
                    }
                }
            }

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

            // --- UPSERT EN HISTORIAL ---
            const historialKey = `${cuenta}|${codigoMateria}`;
            const existeHistorial = cache.historial.has(historialKey);
            
            // Normalizar estado para comparación
            const estadoNormalizado = estado || 'EN CURSO';
            
            if (existeHistorial) {
                // Verificar si los datos cambiaron (comparación exacta)
                const datosPrevios = cache.historial.get(historialKey);
                const estadoPrevNormalizado = datosPrevios.estado || 'EN CURSO';
                
                // Comparación EXACTA de notas y estados
                const notaCambio = datosPrevios.nota !== nota;
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

    console.log(`[Ingest] Resumen: ${inserts} insertados, ${updates} actualizados, ${errors.length} errores`);
    return { count, inserts, updates, errors };
}

// Endpoint para procesar archivo Excel
exports.processUpload = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ningún archivo' });
        }

        const { numeroCuenta } = req.body;
        
        if (!numeroCuenta) {
            return res.status(400).json({ error: 'Número de cuenta requerido' });
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

// Endpoint para previsualizar texto
exports.previewText = async (req, res) => {
    try {
        const { text } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'No se proporcionó texto' });
        }

        const rawData = textParser.parsePlainText(text);
        
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

// Endpoint para importar datos (recibe JSON)
exports.importData = async (req, res) => {
    try {
        const { data, cuenta, bypassPlanValidation } = req.body;
        const targetAccount = cuenta || req.body.numeroCuenta;
        
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ error: 'Datos inválidos' });
        }

        if (!targetAccount) {
            return res.status(400).json({ error: 'Número de cuenta requerido' });
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