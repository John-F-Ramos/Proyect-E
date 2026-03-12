const { poolPromise, sql } = require('../config/db');

// Mapeo de electivas para equivalencias
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

exports.calcularSimulacion = async (req, res) => {
    try {
        const { cuenta, carreraDestino } = req.body;
        const pool = await poolPromise;

        // 1. Obtener el plan de la carrera destino (el más reciente)
        const planDestinoResult = await pool.request()
            .input('codigoCarrera', sql.VarChar, carreraDestino)
            .query(`
                SELECT TOP 1 p.IdPlan, p.NombrePlan, p.AnioPlan,
                       COUNT(pm.CodigoMateria) AS TotalMaterias,
                       ISNULL(SUM(m.UVS), 0) AS TotalUVS
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

        // 2. Obtener TODAS las materias del plan destino
        const materiasDestinoResult = await pool.request()
            .input('idPlan', sql.Int, planDestino.IdPlan)
            .query(`
                SELECT pm.CodigoMateria, m.NombreMateria, m.UVS, pm.Semestre
                FROM Pensum_Materias pm
                INNER JOIN Materias m ON pm.CodigoMateria = m.CodigoMateria
                WHERE pm.IdPlan = @idPlan
                ORDER BY pm.Semestre, pm.CodigoMateria
            `);

        const materiasDestino = materiasDestinoResult.recordset;

        // 3. Obtener el HISTORIAL DEL ALUMNO (materias aprobadas)
        const historialResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT DISTINCT h.CodigoMateria, h.NombreMateria, h.Estado
                FROM Historial_Importado h
                WHERE h.NumeroCuenta = @cuenta 
                AND h.Estado IN ('APB', 'APR', 'APROBADO', 'REQ')
            `);

        const materiasAprobadas = historialResult.recordset.map(m => m.CodigoMateria);
        
        // 4. Identificar materias de inglés aprobadas (para lógica de bilingües)
        const materiasIngles = materiasAprobadas.filter(cod => cod.startsWith('ING'));
        const tieneING113 = materiasIngles.includes('ING113');
        const tieneING114 = materiasIngles.includes('ING114');
        const tieneING115 = materiasIngles.includes('ING115');
        const tieneING116 = materiasIngles.includes('ING116');

        console.log(`[Simulación] Inglés aprobado: ING113=${tieneING113}, ING114=${tieneING114}, ING115=${tieneING115}, ING116=${tieneING116}`);

        // 5. Calcular equivalencias (comparando historial del alumno VS materias destino)
        const equivalencias = [];
        const materiasEquivalentesSet = new Set();
        let uvsEquivalentes = 0;

        // PASO 1: Buscar coincidencias EXACTAS (misma materia en historial y en destino)
        materiasDestino.forEach(materiaDestino => {
            if (materiasAprobadas.includes(materiaDestino.CodigoMateria)) {
                equivalencias.push({
                    materiaCursada: materiaDestino.CodigoMateria,
                    materiaEquivalente: materiaDestino.CodigoMateria,
                    uvs: materiaDestino.UVS,
                    tipo: 'Exacta'
                });
                materiasEquivalentesSet.add(materiaDestino.CodigoMateria);
                uvsEquivalentes += materiaDestino.UVS;
            }
        });

        // PASO 2: Buscar equivalencias por prefijo (electivas normales: ART/DEP, BIO)
        materiasDestino.forEach(materiaDestino => {
            const codigoDestino = materiaDestino.CodigoMateria;
            
            // Si ya fue encontrada como exacta, ignorar
            if (materiasEquivalentesSet.has(codigoDestino)) return;
            
            // Verificar si es una electiva especial
            if (ELECTIVAS_MAP[codigoDestino]) {
                const electiva = ELECTIVAS_MAP[codigoDestino];
                
                // Electivas normales (ART/DEP, BIO)
                if (!codigoDestino.startsWith('EIE')) {
                    const materiaQueCumple = materiasAprobadas.find(cod => 
                        cod.startsWith(electiva.prefijo)
                    );
                    
                    if (materiaQueCumple && !materiasEquivalentesSet.has(codigoDestino)) {
                        equivalencias.push({
                            materiaCursada: materiaQueCumple,
                            materiaEquivalente: codigoDestino,
                            uvs: materiaDestino.UVS,
                            tipo: 'Electiva'
                        });
                        materiasEquivalentesSet.add(codigoDestino);
                        uvsEquivalentes += materiaDestino.UVS;
                    }
                }
            }
        });

        // PASO 3: Buscar equivalencias de inglés (EIE)
        materiasDestino.forEach(materiaDestino => {
            const codigoDestino = materiaDestino.CodigoMateria;
            
            if (materiasEquivalentesSet.has(codigoDestino)) return;
            
            if (codigoDestino.startsWith('EIE')) {
                const electiva = ELECTIVAS_MAP[codigoDestino];
                if (!electiva) return;
                
                let materiaCumple = false;
                let materiaCursada = null;
                
                // Verificar si tiene la materia base específica
                if (codigoDestino === 'EIE1' && tieneING113) {
                    materiaCumple = true;
                    materiaCursada = 'ING113';
                } else if (codigoDestino === 'EIE2' && tieneING114) {
                    materiaCumple = true;
                    materiaCursada = 'ING114';
                } else if (codigoDestino === 'EIE3' && tieneING115) {
                    materiaCumple = true;
                    materiaCursada = 'ING115';
                } else if (codigoDestino === 'EIE4' && tieneING116) {
                    materiaCumple = true;
                    materiaCursada = 'ING116';
                } else if ((codigoDestino === 'EIE5' || codigoDestino === 'EIE6' || codigoDestino === 'EIE7' || codigoDestino === 'EIE8') && tieneING116) {
                    materiaCumple = true;
                    materiaCursada = 'ING116';
                }
                
                if (materiaCumple) {
                    equivalencias.push({
                        materiaCursada: materiaCursada,
                        materiaEquivalente: codigoDestino,
                        uvs: materiaDestino.UVS,
                        tipo: 'Inglés'
                    });
                    materiasEquivalentesSet.add(codigoDestino);
                    uvsEquivalentes += materiaDestino.UVS;
                }
            }
        });

        // 6. Calcular estadísticas finales
        const materiasEquivalentes = materiasEquivalentesSet.size;
        const materiasFaltantes = planDestino.TotalMaterias - materiasEquivalentes;
        const uvsFaltantes = planDestino.TotalUVS - uvsEquivalentes;

        console.log(`[Simulación] Resultado: ${materiasEquivalentes} materias equivalentes, ${uvsEquivalentes} UVs`);

        res.json({
            planDestino: {
                nombre: planDestino.NombrePlan,
                totalMaterias: planDestino.TotalMaterias,
                totalUvs: planDestino.TotalUVS
            },
            materiasEquivalentes: materiasEquivalentes,
            uvsEquivalentes: uvsEquivalentes,
            materiasFaltantes: materiasFaltantes,
            uvsFaltantes: uvsFaltantes,
            equivalencias: equivalencias // Primeras 20 para no saturar
        });

    } catch (error) {
        console.error('Error en simulación:', error);
        res.status(500).json({ error: 'Error al calcular simulación' });
    }
};