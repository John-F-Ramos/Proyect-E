const { poolPromise, sql } = require('../config/db');

// Mapeo de prefijos de electivas
const ELECTIVAS_MAP = {
    'ART/DEP': { prefijo: 'DEP', tipo: 'Arte/Deporte' },
    'BIO': { prefijo: 'BIO', tipo: 'Ciencias Naturales' },
    'EIE1': { prefijo: 'ING', tipo: 'Inglés I', materiaBase: 'ING113' },
    'EIE2': { prefijo: 'ING', tipo: 'Inglés II', materiaBase: 'ING114' },
    'EIE3': { prefijo: 'ING', tipo: 'Inglés III', materiaBase: 'ING115' },
    'EIE4': { prefijo: 'ING', tipo: 'Inglés IV', materiaBase: 'ING116' },
    'EIE5': { prefijo: 'ING', tipo: 'Inglés V', materiaBase: 'ING116' },
    'EIE6': { prefijo: 'ING', tipo: 'Inglés VI', materiaBase: 'ING116' },
    'EIE7': { prefijo: 'ING', tipo: 'Inglés VII', materiaBase: 'ING116' },
    'EIE8': { prefijo: 'ING', tipo: 'Inglés VIII', materiaBase: 'ING116' }
};

// Obtener lista ligera de alumnos para el dropdown
exports.getAllAlumnos = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT NumeroCuenta, NombreCompleto 
            FROM Alumnos 
            ORDER BY NombreCompleto ASC
        `);
        
        res.status(200).json(result.recordset);
    } catch (error) {
        console.error('Error al obtener lista de alumnos:', error);
        res.status(500).json({ error: 'Error interno del servidor al obtener alumnos.' });
    }
};

// Función para registrar equivalencias internas
async function registrarEquivalencia(pool, cuenta, codigoPlan, codigoCursada) {
    try {
        await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .input('codigoPlan', sql.VarChar, codigoPlan)
            .input('codigoCursada', sql.VarChar, codigoCursada)
            .query(`
                IF NOT EXISTS (
                    SELECT 1 FROM Equivalencias_Internas 
                    WHERE NumeroCuenta = @cuenta 
                    AND CodigoMateriaPlan = @codigoPlan
                )
                BEGIN
                    INSERT INTO Equivalencias_Internas (NumeroCuenta, CodigoMateriaPlan, CodigoMateriaCursada)
                    VALUES (@cuenta, @codigoPlan, @codigoCursada)
                END
            `);
    } catch (e) {
        console.log(`[Equivalencia] Error registrando: ${codigoPlan} -> ${codigoCursada}`, e.message);
    }
}

// Obtener datos consolidados de un alumno para el Dashboard
exports.getAlumnoDashboard = async (req, res) => {
    try {
        const { cuenta } = req.params;
        const pool = await poolPromise;

        // 1. Datos Generales del Alumno y su Plan
        const alumnoResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT a.NumeroCuenta, a.NombreCompleto, a.IndiceAcademico,
                       p.IdPlan, p.NombrePlan, p.AnioPlan,
                       c.CodigoCarrera, c.NombreCarrera
                FROM Alumnos a
                LEFT JOIN PlanesEstudio p ON a.IdPlanActual = p.IdPlan
                LEFT JOIN Carreras c ON p.CodigoCarrera = c.CodigoCarrera
                WHERE a.NumeroCuenta = @cuenta
            `);

        if (alumnoResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Alumno no encontrado' });
        }
        
        const alumnoInfo = alumnoResult.recordset[0];

        // 2. Obtener información del Plan de Estudios
        const planInfoResult = await pool.request()
            .input('idPlan', sql.Int, alumnoInfo.IdPlan)
            .query(`
                SELECT 
                    COUNT(pm.CodigoMateria) AS TotalMaterias,
                    ISNULL(SUM(m.UVS), 0) AS TotalUVS
                FROM PlanesEstudio p
                LEFT JOIN Pensum_Materias pm ON p.IdPlan = pm.IdPlan
                LEFT JOIN Materias m ON pm.CodigoMateria = m.CodigoMateria
                WHERE p.IdPlan = @idPlan
                GROUP BY p.IdPlan
            `);

        const planInfo = planInfoResult.recordset[0] || { TotalMaterias: 0, TotalUVS: 0 };

        // 3. Obtener todas las materias del plan
        const materiasPlanResult = await pool.request()
            .input('idPlan', sql.Int, alumnoInfo.IdPlan)
            .query(`
                SELECT 
                    pm.CodigoMateria,
                    m.NombreMateria,
                    m.UVS,
                    pm.Semestre
                FROM Pensum_Materias pm
                INNER JOIN Materias m ON pm.CodigoMateria = m.CodigoMateria
                WHERE pm.IdPlan = @idPlan
                ORDER BY pm.Semestre, pm.CodigoMateria
            `);

        const materiasPlan = materiasPlanResult.recordset;

        // 4. Obtener historial del alumno
        const historialAlumnoResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT 
                    h.CodigoMateria,
                    h.NombreMateria,
                    h.Nota,
                    h.Estado,
                    m.UVS,
                    h.FechaCreacion
                FROM Historial_Importado h
                LEFT JOIN Materias m ON h.CodigoMateria = m.CodigoMateria
                WHERE h.NumeroCuenta = @cuenta
            `);

        const historialAlumno = historialAlumnoResult.recordset;

        // 5. Materias en curso
        const enCursoResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT 
                    h.CodigoMateria,
                    h.NombreMateria,
                    m.UVS,
                    pm.Semestre
                FROM Historial_Importado h
                LEFT JOIN Materias m ON h.CodigoMateria = m.CodigoMateria
                LEFT JOIN Pensum_Materias pm ON h.CodigoMateria = pm.CodigoMateria AND pm.IdPlan = (SELECT IdPlanActual FROM Alumnos WHERE NumeroCuenta = @cuenta)
                WHERE h.NumeroCuenta = @cuenta 
                AND h.Estado = 'EN CURSO'
                ORDER BY pm.Semestre, h.NombreMateria
            `);

        const materiasEnCurso = enCursoResult.recordset.map(m => m.CodigoMateria);
        console.log(`[Dashboard] Materias en curso: ${materiasEnCurso.join(', ')}`);

         // 6. Calcular materias aprobadas (con lógica de bilingües)
        let uvsAprobadas = 0;
        let clasesAprobadas = 0;
        const materiasAprobadasSet = new Set();
        const materiasExactasAprobadas = new Set();

        const materiasAprobadasHistorial = historialAlumno
            .filter(h => ['APB', 'APR', 'APROBADO', 'REQ'].includes(h.Estado))
            .map(h => h.CodigoMateria);

        console.log(`[Dashboard] Materias aprobadas en historial: ${materiasAprobadasHistorial.length}`);

        // Identificar materias de inglés aprobadas
        const materiasIngles = materiasAprobadasHistorial.filter(cod => cod.startsWith('ING'));
        const tieneING113 = materiasIngles.includes('ING113');
        const tieneING114 = materiasIngles.includes('ING114');
        const tieneING115 = materiasIngles.includes('ING115');
        const tieneING116 = materiasIngles.includes('ING116');
        
        // CORRECCIÓN: Bilingüe se determina SOLO por tener ING113
        const esBilingue = tieneING113;
        
        console.log(`[Dashboard] Inglés: ING113=${tieneING113}, ING114=${tieneING114}, ING115=${tieneING115}, ING116=${tieneING116}, Bilingüe=${esBilingue}`);

        // Procesar electivas
        for (const materiaPlan of materiasPlan) {
            const codigoPlan = materiaPlan.CodigoMateria;
            
            if (ELECTIVAS_MAP[codigoPlan]) {
                const electiva = ELECTIVAS_MAP[codigoPlan];
                let materiaCumple = false;
                let materiaCursada = null;
                
                // Caso especial: electivas de inglés
                if (codigoPlan.startsWith('EIE')) {
                    // Verificar si tiene la materia base específica (independientemente de si es bilingüe o no)
                    if (codigoPlan === 'EIE1' && tieneING113) {
                        materiaCumple = true;
                        materiaCursada = 'ING113';
                    } else if (codigoPlan === 'EIE2' && tieneING114) {
                        materiaCumple = true;
                        materiaCursada = 'ING114';
                    } else if (codigoPlan === 'EIE3' && tieneING115) {
                        materiaCumple = true;
                        materiaCursada = 'ING115';
                    } else if (codigoPlan === 'EIE4' && tieneING116) {
                        materiaCumple = true;
                        materiaCursada = 'ING116';
                    } else if ((codigoPlan === 'EIE5' || codigoPlan === 'EIE6' || codigoPlan === 'EIE7' || codigoPlan === 'EIE8') && tieneING116) {
                        materiaCumple = true;
                        materiaCursada = 'ING116';
                    }
                } 
                // Electivas normales (ART/DEP, BIO)
                else {
                    const materiaQueCumple = materiasAprobadasHistorial.find(cod => 
                        cod.startsWith(electiva.prefijo)
                    );
                    if (materiaQueCumple) {
                        materiaCumple = true;
                        materiaCursada = materiaQueCumple;
                    }
                }
                
                if (materiaCumple && !materiasAprobadasSet.has(codigoPlan)) {
                    uvsAprobadas += materiaPlan.UVS || 0;
                    clasesAprobadas++;
                    materiasAprobadasSet.add(codigoPlan);
                    
                    // Registrar equivalencia si aplica
                    if (materiaCursada && materiaCursada !== codigoPlan) {
                        await registrarEquivalencia(pool, cuenta, codigoPlan, materiaCursada);
                    }
                    
                    // Marcar materia base como usada
                    if (electiva.materiaBase) {
                        materiasExactasAprobadas.add(electiva.materiaBase);
                    }
                }
            }
        }

        // Procesar materias exactas que NO sean electivas
        for (const materiaPlan of materiasPlan) {
            const codigoPlan = materiaPlan.CodigoMateria;
            
            if (ELECTIVAS_MAP[codigoPlan]) continue;
            
            const materiaAprobada = materiasAprobadasHistorial.includes(codigoPlan);
            const yaUsada = materiasExactasAprobadas.has(codigoPlan);
            const yaContada = materiasAprobadasSet.has(codigoPlan);
            
            if (materiaAprobada && !yaUsada && !yaContada) {
                uvsAprobadas += materiaPlan.UVS || 0;
                clasesAprobadas++;
                materiasAprobadasSet.add(codigoPlan);
            }
        }

        // Materias del historial que no están en el plan
        const materiasNoEnPlan = materiasAprobadasHistorial.filter(cod => 
            !materiasPlan.some(m => m.CodigoMateria === cod) && 
            !materiasExactasAprobadas.has(cod) &&
            !materiasAprobadasSet.has(cod)
        );

        if (materiasNoEnPlan.length > 0) {
            console.log(`[Dashboard] Materias fuera del plan: ${materiasNoEnPlan.join(', ')}`);
        }

        console.log(`[Dashboard] Cálculo final: ${clasesAprobadas} clases, ${uvsAprobadas} UVs`);

        // 7. Estadísticas de rendimiento
        const rendimientoResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT 
                    SUM(CASE WHEN Estado IN ('APB', 'APR', 'APROBADO', 'REQ') THEN 1 ELSE 0 END) as Aprobadas,
                    SUM(CASE WHEN Estado = 'REP' THEN 1 ELSE 0 END) as Reprobadas,
                    SUM(CASE WHEN Estado = 'EN CURSO' THEN 1 ELSE 0 END) as EnCurso,
                    AVG(CASE WHEN Estado IN ('APB', 'APR', 'APROBADO', 'REQ', 'REP') THEN Nota ELSE NULL END) as PromedioGeneral
                FROM Historial_Importado
                WHERE NumeroCuenta = @cuenta
            `);

        const rendimiento = rendimientoResult.recordset[0] || { 
            Aprobadas: 0, 
            Reprobadas: 0, 
            EnCurso: 0, 
            PromedioGeneral: 0 
        };

        // 8. Historial Completo
        const historialCompletoResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT 
                    h.CodigoMateria, 
                    h.NombreMateria, 
                    h.Nota, 
                    h.Estado,
                    m.UVS,
                    h.FechaCreacion
                FROM Historial_Importado h
                LEFT JOIN Materias m ON h.CodigoMateria = m.CodigoMateria
                WHERE h.NumeroCuenta = @cuenta
                ORDER BY 
                    CASE 
                        WHEN h.Estado = 'EN CURSO' THEN 1
                        WHEN h.Estado IN ('APB', 'APR', 'APROBADO') THEN 2
                        ELSE 3
                    END,
                    h.FechaCreacion DESC
            `);

        // 9. Determinar semestre actual
        const semestreActualResult = await pool.request()
            .input('idPlan', sql.Int, alumnoInfo.IdPlan)
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT ISNULL(MAX(pm.Semestre), 0) as SemestreActual
                FROM Historial_Importado h
                INNER JOIN Pensum_Materias pm ON h.CodigoMateria = pm.CodigoMateria AND pm.IdPlan = @idPlan
                WHERE h.NumeroCuenta = @cuenta 
                AND h.Estado IN ('APB', 'APR', 'APROBADO', 'REQ')
            `);

        const semestreActual = semestreActualResult.recordset[0]?.SemestreActual || 1;

        // 10. Próximas materias sugeridas
        const materiasPendientes = [];

        materiasPlan.forEach(materiaPlan => {
            const codigo = materiaPlan.CodigoMateria;
            
            // Excluir si ya está aprobada
            if (materiasAprobadasSet.has(codigo)) return;
            
            // Excluir si está en curso
            if (materiasEnCurso.includes(codigo)) return;
            
            // CASO ESPECIAL: Electivas de inglés
            if (codigo.startsWith('EIE')) {
                const electiva = ELECTIVAS_MAP[codigo];
                if (!electiva) return;
                
                // Verificar si la materia base está aprobada
                const materiaBaseAprobada = materiasAprobadasHistorial.includes(electiva.materiaBase);
                
                // Verificar si la materia base está en curso
                const materiaBaseEnCurso = materiasEnCurso.includes(electiva.materiaBase);
                
                // Si la materia base ya está aprobada, la electiva ya se cumplió (no debe aparecer)
                if (materiaBaseAprobada) return;
                
                // Si la materia base está en curso, la electiva se cumplirá cuando termine (no debe aparecer)
                if (materiaBaseEnCurso) return;
                
                // Si llegamos aquí, la materia base NO está aprobada ni en curso
                // Por lo tanto, la electiva SÍ debe aparecer como pendiente
                console.log(`[Dashboard] Electiva pendiente: ${codigo} (requiere ${electiva.materiaBase})`);
            }
            
            materiasPendientes.push({
                CodigoMateria: materiaPlan.CodigoMateria,
                NombreMateria: materiaPlan.NombreMateria,
                UVS: materiaPlan.UVS,
                Semestre: materiaPlan.Semestre,
                Tipo: materiaPlan.Semestre <= semestreActual ? 'Pendiente de semestres anteriores' : 
                      materiaPlan.Semestre === semestreActual + 1 ? 'Siguiente semestre' : 'Semestres futuros'
            });
        });

        // Ordenar por prioridad
        materiasPendientes.sort((a, b) => {
            if (a.Semestre <= semestreActual && b.Semestre > semestreActual) return -1;
            if (a.Semestre > semestreActual && b.Semestre <= semestreActual) return 1;
            return a.Semestre - b.Semestre;
        });

        const proximasMateriasResult = materiasPendientes.slice(0, 5);
        
        console.log(`[Dashboard] Materias pendientes: ${materiasPendientes.length}, mostrando: ${proximasMateriasResult.length}`);

        // 11. Calcular porcentaje
        const totalUVSPlan = planInfo.TotalUVS || 1;
        const porcentajeProgreso = Math.min(Math.round((uvsAprobadas / totalUVSPlan) * 100), 100);

        // 12. Construir respuesta
        const dashboardData = {
            alumno: {
                NumeroCuenta: alumnoInfo.NumeroCuenta,
                NombreCompleto: alumnoInfo.NombreCompleto,
                IndiceAcademico: alumnoInfo.IndiceAcademico || 0,
                NombrePlan: alumnoInfo.NombrePlan || 'Sin Plan',
                AnioPlan: alumnoInfo.AnioPlan,
                NombreCarrera: alumnoInfo.NombreCarrera || 'Sin Carrera',
                CodigoCarrera: alumnoInfo.CodigoCarrera,
                SemestreActual: semestreActual,
                EsBilingue: esBilingue
            },
            planEstudio: {
                totalMaterias: planInfo.TotalMaterias,
                totalUVS: planInfo.TotalUVS
            },
            progreso: {
                clasesAprobadas: clasesAprobadas,
                uvsAprobadas: uvsAprobadas,
                materiasEnCurso: enCursoResult.recordset.length,
                totalUvsPlan: totalUVSPlan,
                porcentaje: porcentajeProgreso
            },
            rendimiento: {
                aprobadas: rendimiento.Aprobadas || 0,
                reprobadas: rendimiento.Reprobadas || 0,
                enCurso: rendimiento.EnCurso || 0,
                promedioGeneral: rendimiento.PromedioGeneral ? rendimiento.PromedioGeneral.toFixed(2) : '0.00'
            },
            materiasEnCurso: enCursoResult.recordset,
            proximasMaterias: proximasMateriasResult,
            historialCompleto: historialCompletoResult.recordset
        };

        console.log(`[Dashboard] Alumno: ${cuenta} - Semestre: ${semestreActual} - Progreso: ${porcentajeProgreso}% (${uvsAprobadas}/${totalUVSPlan} UVs) - Próximas: ${proximasMateriasResult.length}`);
        res.status(200).json(dashboardData);

    } catch (error) {
        console.error('Error al obtener dashboard del alumno:', error);
        res.status(500).json({ error: 'Error interno del servidor al cargar el dashboard.' });
    }
};

// Endpoint para obtener equivalencias del alumno
exports.getEquivalencias = async (req, res) => {
    try {
        const { cuenta } = req.params;
        const pool = await poolPromise;

        const equivalenciasResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT 
                    e.CodigoMateriaPlan,
                    mp.NombreMateria as NombreMateriaPlan,
                    mp.UVS as UVSPlan,
                    e.CodigoMateriaCursada,
                    mc.NombreMateria as NombreMateriaCursada,
                    e.TipoEquivalencia,
                    e.FechaRegistro
                FROM Equivalencias_Internas e
                LEFT JOIN Materias mp ON e.CodigoMateriaPlan = mp.CodigoMateria
                LEFT JOIN Materias mc ON e.CodigoMateriaCursada = mc.CodigoMateria
                WHERE e.NumeroCuenta = @cuenta
                ORDER BY e.FechaRegistro DESC
            `);

        res.status(200).json(equivalenciasResult.recordset);

    } catch (error) {
        console.error('Error al obtener equivalencias:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Obtener historial completo del alumno
exports.getHistorialCompleto = async (req, res) => {
    try {
        const { cuenta } = req.params;
        const pool = await poolPromise;

        const historialResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT 
                    h.CodigoMateria,
                    h.NombreMateria,
                    h.Nota,
                    h.Estado,
                    m.UVS,
                    h.FechaCreacion
                FROM Historial_Importado h
                LEFT JOIN Materias m ON h.CodigoMateria = m.CodigoMateria
                WHERE h.NumeroCuenta = @cuenta
                ORDER BY 
                    CASE 
                        WHEN h.Estado = 'EN CURSO' THEN 1
                        WHEN h.Estado IN ('APB', 'APR', 'APROBADO') THEN 2
                        ELSE 3
                    END,
                    h.FechaCreacion DESC
            `);

        res.status(200).json(historialResult.recordset);

    } catch (error) {
        console.error('Error al obtener historial completo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Obtener materias pendientes de un alumno
exports.getMateriasPendientes = async (req, res) => {
    try {
        const { cuenta } = req.params;
        const pool = await poolPromise;

        const alumnoResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query('SELECT IdPlanActual FROM Alumnos WHERE NumeroCuenta = @cuenta');

        if (alumnoResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Alumno no encontrado' });
        }

        const idPlan = alumnoResult.recordset[0].IdPlanActual;
        const semestreActual = await getSemestreActual(pool, idPlan, cuenta);

        const pendientesResult = await pool.request()
            .input('idPlan', sql.Int, idPlan)
            .input('cuenta', sql.VarChar, cuenta)
            .input('semestreActual', sql.Int, semestreActual)
            .query(`
                SELECT 
                    pm.CodigoMateria,
                    m.NombreMateria,
                    m.UVS,
                    pm.Semestre,
                    CASE 
                        WHEN h.Estado = 'EN CURSO' THEN 'En Curso'
                        WHEN h.Estado IS NULL THEN 
                            CASE 
                                WHEN pm.Semestre <= @semestreActual THEN 'Atrasada'
                                ELSE 'Pendiente'
                            END
                        ELSE h.Estado
                    END as Estado
                FROM Pensum_Materias pm
                INNER JOIN Materias m ON pm.CodigoMateria = m.CodigoMateria
                LEFT JOIN (
                    SELECT DISTINCT CodigoMateria, Estado
                    FROM Historial_Importado 
                    WHERE NumeroCuenta = @cuenta
                ) h ON pm.CodigoMateria = h.CodigoMateria
                WHERE pm.IdPlan = @idPlan
                AND (h.Estado IS NULL OR h.Estado NOT IN ('APB', 'APR', 'APROBADO', 'REQ'))
                ORDER BY 
                    CASE 
                        WHEN pm.Semestre <= @semestreActual THEN 1
                        ELSE 2
                    END,
                    pm.Semestre,
                    pm.CodigoMateria
            `);

        res.status(200).json(pendientesResult.recordset);

    } catch (error) {
        console.error('Error al obtener materias pendientes:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Obtener resumen de estados
exports.getResumenEstados = async (req, res) => {
    try {
        const { cuenta } = req.params;
        const pool = await poolPromise;

        const resumenResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT 
                    Estado,
                    COUNT(*) as Cantidad,
                    ISNULL(SUM(m.UVS), 0) as TotalUVS
                FROM Historial_Importado h
                LEFT JOIN Materias m ON h.CodigoMateria = m.CodigoMateria
                WHERE h.NumeroCuenta = @cuenta
                GROUP BY h.Estado
                ORDER BY 
                    CASE 
                        WHEN h.Estado = 'APB' THEN 1
                        WHEN h.Estado = 'EN CURSO' THEN 2
                        ELSE 3
                    END
            `);

        res.status(200).json(resumenResult.recordset);

    } catch (error) {
        console.error('Error al obtener resumen:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Función auxiliar para obtener semestre actual
async function getSemestreActual(pool, idPlan, cuenta) {
    const result = await pool.request()
        .input('idPlan', sql.Int, idPlan)
        .input('cuenta', sql.VarChar, cuenta)
        .query(`
            SELECT ISNULL(MAX(pm.Semestre), 0) as SemestreActual
            FROM Historial_Importado h
            INNER JOIN Pensum_Materias pm ON h.CodigoMateria = pm.CodigoMateria AND pm.IdPlan = @idPlan
            WHERE h.NumeroCuenta = @cuenta 
            AND h.Estado IN ('APB', 'APR', 'APROBADO', 'REQ')
        `);
    
    return result.recordset[0]?.SemestreActual || 1;
}