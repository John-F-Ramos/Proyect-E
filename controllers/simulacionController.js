const { poolPromise, sql } = require('../config/db');

// Mapeo de electivas para equivalencias
const ELECTIVAS_MAP = {
    'ART/DEP': { prefijo: 'DEP', tipo: 'Arte/Deporte' },
    'BIO': { prefijo: 'BIO', tipo: 'Ciencias Naturales' },
    'EIE1': { prefijo: 'ING', tipo: 'Inglés I' },
    'EIE2': { prefijo: 'ING', tipo: 'Inglés II' },
    'EIE3': { prefijo: 'ING', tipo: 'Inglés III' },
    'EIE4': { prefijo: 'ING', tipo: 'Inglés IV' },
    'EIE5': { prefijo: 'ING', tipo: 'Inglés V' },
    'EIE6': { prefijo: 'ING', tipo: 'Inglés VI' },
    'EIE7': { prefijo: 'ING', tipo: 'Inglés VII' },
    'EIE8': { prefijo: 'ING', tipo: 'Inglés VIII' }
};

exports.calcularSimulacion = async (req, res) => {
    try {
        const { cuenta, carreraDestino } = req.body;
        const pool = await poolPromise;

        // 1. Obtener el plan de la carrera destino
        const planDestinoResult = await pool.request()
            .input('codigoCarrera', sql.VarChar, carreraDestino)
            .query(`
                SELECT TOP 1 p.IdPlan, p.NombrePlan, p.AnioPlan,
                       COUNT(pm.CodigoMateria) as TotalMaterias,
                       ISNULL(SUM(m.UVS), 0) as TotalUVS
                FROM PlanesEstudio p
                LEFT JOIN Pensum_Materias pm ON p.IdPlan = pm.IdPlan
                LEFT JOIN Materias m ON pm.CodigoMateria = m.CodigoMateria
                WHERE p.CodigoCarrera = @codigoCarrera
                GROUP BY p.IdPlan, p.NombrePlan, p.AnioPlan
                ORDER BY p.AnioPlan DESC
            `);

        if (planDestinoResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Plan de destino no encontrado' });
        }

        const planDestino = planDestinoResult.recordset[0];

        // 2. Obtener materias aprobadas del alumno
        const historialResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT DISTINCT h.CodigoMateria, h.NombreMateria, h.Estado
                FROM Historial_Importado h
                WHERE h.NumeroCuenta = @cuenta 
                AND h.Estado IN ('APB', 'APR', 'APROBADO', 'REQ')
            `);

        const materiasAprobadas = historialResult.recordset;

        // 3. Obtener todas las materias del plan destino
        const materiasDestinoResult = await pool.request()
            .input('idPlan', sql.Int, planDestino.IdPlan)
            .query(`
                SELECT pm.CodigoMateria, m.NombreMateria, m.UVS
                FROM Pensum_Materias pm
                INNER JOIN Materias m ON pm.CodigoMateria = m.CodigoMateria
                WHERE pm.IdPlan = @idPlan
            `);

        const materiasDestino = materiasDestinoResult.recordset;

        // 4. Calcular equivalencias
        const equivalencias = [];
        const materiasEquivalentes = new Set();
        let uvsEquivalentes = 0;

        // Buscar coincidencias exactas
        materiasDestino.forEach(materiaDestino => {
            const materiaAprobada = materiasAprobadas.find(m => m.CodigoMateria === materiaDestino.CodigoMateria);
            
            if (materiaAprobada) {
                equivalencias.push({
                    materiaCursada: materiaAprobada.CodigoMateria,
                    materiaEquivalente: materiaDestino.CodigoMateria,
                    uvs: materiaDestino.UVS
                });
                materiasEquivalentes.add(materiaDestino.CodigoMateria);
                uvsEquivalentes += materiaDestino.UVS;
            }
        });

        // Buscar equivalencias por prefijo (electivas)
        materiasDestino.forEach(materiaDestino => {
            if (ELECTIVAS_MAP[materiaDestino.CodigoMateria]) {
                const electiva = ELECTIVAS_MAP[materiaDestino.CodigoMateria];
                
                // Buscar materia aprobada con el mismo prefijo
                const materiaCumple = materiasAprobadas.find(m => 
                    m.CodigoMateria.startsWith(electiva.prefijo) &&
                    !materiasEquivalentes.has(materiaDestino.CodigoMateria)
                );

                if (materiaCumple) {
                    equivalencias.push({
                        materiaCursada: materiaCumple.CodigoMateria,
                        materiaEquivalente: materiaDestino.CodigoMateria,
                        uvs: materiaDestino.UVS
                    });
                    materiasEquivalentes.add(materiaDestino.CodigoMateria);
                    uvsEquivalentes += materiaDestino.UVS;
                }
            }
        });

        // 5. Calcular estadísticas
        const materiasFaltantes = planDestino.TotalMaterias - materiasEquivalentes.size;
        const uvsFaltantes = planDestino.TotalUVS - uvsEquivalentes;

        res.json({
            planDestino: {
                nombre: planDestino.NombrePlan,
                totalMaterias: planDestino.TotalMaterias,
                totalUvs: planDestino.TotalUVS
            },
            materiasEquivalentes: materiasEquivalentes.size,
            uvsEquivalentes: uvsEquivalentes,
            materiasFaltantes: materiasFaltantes,
            uvsFaltantes: uvsFaltantes,
            equivalencias: equivalencias.slice(0, 20) // Primeras 20 para no saturar
        });

    } catch (error) {
        console.error('Error en simulación:', error);
        res.status(500).json({ error: 'Error al calcular simulación' });
    }
};