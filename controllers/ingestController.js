const excelProcessor = require('../services/excelProcessor');
const { poolPromise, sql } = require('../config/db');

exports.processUpload = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ningún archivo' });
        }

        const rawData = await excelProcessor.parseExcelBuffer(req.file.buffer);
        console.log(`[Ingest] Procesando ${rawData.length} filas desde Excel...`);

        const pool = await poolPromise;
        let count = 0;
        let errors = [];

        // --- CACHÉS EN MEMORIA ---
        // Almacenamos ID/Códigos ya verificados listos para usarse
        const cache = {
            carreras: new Set(),
            planes: new Map(), // key: 'CodigoCarrera|NombrePlan', value: IdPlan
            materias: new Set(),
            alumnos: new Set()
        };

        // Precargar cachés desde DB para evitar selects innecesarios
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
        // -------------------------

        for (const record of rawData) {
            try {
                // Normalizar Excel a minúsculas para un mapeo resistente
                const row = {};
                Object.keys(record).forEach(k => row[k.toLowerCase().trim()] = record[k]);

                // 1. Extracción de Datos
                const codigoCarrera = row.codigo_carrera || row.cod_carrera || 'S/D';
                const nombreCarrera = row.carrera || row.nombre_carrera || 'Sin Asignar';
                
                const nombrePlanExcel = row.plan || row.plan_estudio || 'Plan Base';
                
                const codigoMateria = row.codigo_materia || row.cod_materia || row.sigla || 'S/D';
                const nombreMateria = row.nombre_materia || row.asignatura || row.materia || 'S/D';
                const uvs = parseInt(row.uvs || row.uv || 0);

                const cuenta = row.cuenta || row.numerocuenta || row.codigo;
                const nombreAlumno = row.nombre || row.estudiante || row.nombre_alumno || 'Alumno Desconocido';
                const indiceAlumno = parseFloat(row.indice || row.promedio || 0);

                const nota = parseFloat(row.nota || row.calificacion || row.valor || 0);
                const estado = row.estado || row.resultado || 'S/D';

                if (!cuenta || !codigoMateria) {
                    continue; // Saltar filas completamente inválidas sin logguear agresivamente
                }

                // 2. Gestionar Carrera
                if (!cache.carreras.has(codigoCarrera)) {
                    await pool.request()
                        .input('cod', sql.VarChar, codigoCarrera)
                        .input('nom', sql.VarChar, nombreCarrera)
                        .query('INSERT INTO Carreras (CodigoCarrera, NombreCarrera) VALUES (@cod, @nom)');
                    cache.carreras.add(codigoCarrera);
                    console.log(`[Ingest] Creada Carrera: ${codigoCarrera}`);
                }

                // 3. Gestionar Plan de Estudio
                const planKey = `${codigoCarrera}|${nombrePlanExcel.toLowerCase()}`;
                let idPlan = cache.planes.get(planKey);
                
                if (!idPlan) {
                    // Extracting year from plan if possible (basic regex for 4 digits starting with 19 or 20)
                    const yearMatch = nombrePlanExcel.match(/(?:19|20)\d{2}/);
                    const anioPlan = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();

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

                // 4. Gestionar Materia
                if (!cache.materias.has(codigoMateria)) {
                    await pool.request()
                        .input('cod', sql.VarChar, codigoMateria)
                        .input('nom', sql.VarChar, nombreMateria)
                        .input('uvs', sql.Int, uvs)
                        .query('INSERT INTO Materias (CodigoMateria, NombreMateria, UVS) VALUES (@cod, @nom, @uvs)');
                    cache.materias.add(codigoMateria);
                }

                // 5. Gestionar Alumno
                if (!cache.alumnos.has(cuenta)) {
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
                }

                // 6. Insertar en Historial_Importado
                await pool.request()
                    .input('NumeroCuenta', sql.VarChar, cuenta)
                    .input('CodigoMateria', sql.VarChar, codigoMateria)
                    .input('NombreMateria', sql.VarChar, nombreMateria)
                    .input('Nota', sql.Decimal(5, 2), nota)
                    .input('Estado', sql.VarChar, estado)
                    .query(`
                        INSERT INTO Historial_Importado (NumeroCuenta, CodigoMateria, NombreMateria, Nota, Estado)
                        VALUES (@NumeroCuenta, @CodigoMateria, @NombreMateria, @Nota, @Estado)
                    `);

                count++;
            } catch (innerErr) {
                console.error(`[Ingest] Error en Fila (Cuenta: ${record.cuenta || record.NumeroCuenta || 'N/A'}):`, innerErr.message);
                errors.push({ 
                    record: { cuenta: record.cuenta, materia: record.codigo_materia }, 
                    error: innerErr.message 
                });
            }
        }

        res.status(200).json({
            message: 'Procesamiento Jerárquico Completado',
            recordsProcessed: count,
            errorsCount: errors.length,
            errors: errors.slice(0, 5) // Devolver los primeros 5 errores para feedback
        });

    } catch (error) {
        console.error('Error crítico en ingesta completada:', error);
        res.status(500).json({ error: 'Error general al procesar el archivo Excel.' });
    }
};

