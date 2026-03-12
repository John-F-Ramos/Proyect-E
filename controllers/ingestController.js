const excelProcessor = require('../services/excelProcessor');
const textParser = require('../services/textparser');
const { poolPromise, sql } = require('../config/db');

// Función reutilizable para procesar datos en la BD
async function processDataInDB(rawData, numeroCuenta) {
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

            // Usar la carrera del alumno (no la del texto)
            const codigoCarrera = codigoCarreraAlumno;
            const nombreCarrera = nombreCarreraAlumno;
            
            // Extraer año del plan actual del alumno
            const anioPlan = new Date().getFullYear();
            const nombrePlanExcel = `Plan ${anioPlan}`;
            
            // Datos de la materia
            const codigoMateria = row.codigo_materia || 'S/D';
            const nombreMateria = row.nombre_materia || 'S/D';
            const uvs = parseInt(row.uvs || 0);

            const cuenta = numeroCuenta;
            const nombreAlumno = 'Alumno Importado';
            const indiceAlumno = 0;

            const nota = parseFloat(row.nota || 0);
            const estado = row.estado || 'EN CURSO';

            if (!cuenta || !codigoMateria || codigoMateria === 'S/D') {
                continue;
            }

            // Gestionar Carrera (solo si realmente necesitamos crearla)
            if (!cache.carreras.has(codigoCarrera) && codigoCarrera !== 'S/D') {
                try {
                    await pool.request()
                        .input('cod', sql.VarChar, codigoCarrera)
                        .input('nom', sql.VarChar, nombreCarrera)
                        .query('INSERT INTO Carreras (CodigoCarrera, NombreCarrera) VALUES (@cod, @nom)');
                    cache.carreras.add(codigoCarrera);
                    console.log(`[Ingest] Creada Carrera: ${codigoCarrera}`);
                } catch (e) {
                    // Si ya existe, ignorar
                }
            }

            // Gestionar Plan (usar el plan del alumno o crear uno nuevo)
            let idPlan = idPlanAlumno;
            if (!idPlan) {
                const planKey = `${codigoCarrera}|${nombrePlanExcel.toLowerCase()}`;
                idPlan = cache.planes.get(planKey);
                
                if (!idPlan) {
                    const planResult = await pool.request()
                        .input('codCarrera', sql.VarChar, codigoCarrera)
                        .input('anio', sql.Int, anioPlan)
                        .input('nom', sql.VarChar, nombrePlanExcel)
                        .query(`
                            INSERT INTO PlanesEstudio (CodigoCarrera, AnioPlan, NombrePlan) 
                            OUTPUT INSERTED.IdPlan
                            VALUES (@codCarrera, @anio, @nom)
                        `);
                    
                    idPlan = planResult.recordset[0].IdPlan;
                    cache.planes.set(planKey, idPlan);
                    console.log(`[Ingest] Creado Plan: ${nombrePlanExcel} (ID: ${idPlan})`);
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
                    // Si ya existe, ignorar
                }
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
        const { data, numeroCuenta } = req.body;
        
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ error: 'Datos inválidos' });
        }

        if (!numeroCuenta) {
            return res.status(400).json({ error: 'Número de cuenta requerido' });
        }

        console.log(`[Ingest] Importando ${data.length} registros para cuenta ${numeroCuenta}...`);

        const { count, inserts, updates, errors } = await processDataInDB(data, numeroCuenta);

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