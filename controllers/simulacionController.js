const { poolPromise, sql } = require('../config/db');
const { SQL_IN_APROBADOS } = require('../services/historialConstants');

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
        const { cuenta, carreraDestino, idPlanDestino } = req.body;
        const requester = req.user;
        const cuentaObjetivo = (cuenta || '').toString().trim();
        const requesterCuenta = (requester?.numeroCuenta || '').toString().trim();

        if (!requester) {
            return res.status(401).json({ error: 'UNAUTHORIZED' });
        }
        if (requester.rol === 3 && requesterCuenta !== cuentaObjetivo) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }
        if (!cuentaObjetivo) {
            return res.status(400).json({ error: 'Cuenta objetivo requerida.' });
        }

        const pool = await poolPromise;

        // 1. Obtener el plan destino (por IdPlan seleccionado o carrera legacy)
        let planDestinoResult;
        const planId = Number(idPlanDestino);
        if (Number.isInteger(planId) && planId > 0) {
            planDestinoResult = await pool.request()
                .input('idPlan', sql.Int, planId)
                .query(`
                    SELECT 
                        p.IdPlan,
                        p.NombrePlan,
                        p.AnioPlan,
                        p.CodigoCarrera,
                        c.NombreCarrera,
                        (
                            SELECT COUNT(*)
                            FROM Pensum_Materias pm2
                            WHERE pm2.IdPlan = p.IdPlan
                        ) AS TotalMaterias,
                        (
                            SELECT ISNULL(SUM(ISNULL(m2.UVS, 0)), 0)
                            FROM Pensum_Materias pm2
                            LEFT JOIN (
                                SELECT CodigoMateria, MAX(UVS) AS UVS
                                FROM Materias
                                GROUP BY CodigoMateria
                            ) m2 ON pm2.CodigoMateria = m2.CodigoMateria
                            WHERE pm2.IdPlan = p.IdPlan
                        ) AS TotalUVS
                    FROM PlanesEstudio p
                    LEFT JOIN Carreras c ON p.CodigoCarrera = c.CodigoCarrera
                    WHERE p.IdPlan = @idPlan
                `);
        } else {
            planDestinoResult = await pool.request()
                .input('codigoCarrera', sql.VarChar, carreraDestino)
                .query(`
                    SELECT TOP 1 
                        p.IdPlan,
                        p.NombrePlan,
                        p.AnioPlan,
                        p.CodigoCarrera,
                        c.NombreCarrera,
                        (
                            SELECT COUNT(*)
                            FROM Pensum_Materias pm2
                            WHERE pm2.IdPlan = p.IdPlan
                        ) AS TotalMaterias,
                        (
                            SELECT ISNULL(SUM(ISNULL(m2.UVS, 0)), 0)
                            FROM Pensum_Materias pm2
                            LEFT JOIN (
                                SELECT CodigoMateria, MAX(UVS) AS UVS
                                FROM Materias
                                GROUP BY CodigoMateria
                            ) m2 ON pm2.CodigoMateria = m2.CodigoMateria
                            WHERE pm2.IdPlan = p.IdPlan
                        ) AS TotalUVS
                    FROM PlanesEstudio p
                    LEFT JOIN Carreras c ON p.CodigoCarrera = c.CodigoCarrera
                    WHERE p.CodigoCarrera = @codigoCarrera
                    ORDER BY p.AnioPlan DESC
                `);
        }

        if (planDestinoResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Plan de destino no encontrado' });
        }

        const planDestino = planDestinoResult.recordset[0];

        // 2. Obtener TODAS las materias del plan destino
        const materiasDestinoResult = await pool.request()
            .input('idPlan', sql.Int, planDestino.IdPlan)
            .query(`
                SELECT
                    pm.CodigoMateria,
                    ISNULL(m.NombreMateria, pm.CodigoMateria) AS NombreMateria,
                    ISNULL(m.UVS, 0) AS UVS,
                    pm.Semestre
                FROM Pensum_Materias pm
                LEFT JOIN (
                    SELECT
                        CodigoMateria,
                        MAX(NombreMateria) AS NombreMateria,
                        MAX(UVS) AS UVS
                    FROM Materias
                    GROUP BY CodigoMateria
                ) m ON pm.CodigoMateria = m.CodigoMateria
                WHERE pm.IdPlan = @idPlan
                ORDER BY pm.Semestre, pm.CodigoMateria
            `);

        const materiasDestino = materiasDestinoResult.recordset;

        // 3. Obtener el HISTORIAL DEL ALUMNO (materias aprobadas)
        const historialResult = await pool.request()
            .input('cuenta', sql.VarChar, cuentaObjetivo)
            .query(`
                SELECT DISTINCT h.CodigoMateria, h.NombreMateria, h.Estado
                FROM Historial_Importado h
                WHERE h.NumeroCuenta = @cuenta 
                AND h.Estado IN (${SQL_IN_APROBADOS})
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

        // 6. Construir detalle de materias faltantes (las del plan destino no cubiertas por equivalencia)
        const materiasFaltantesDetalle = materiasDestino
            .filter((materiaDestino) => !materiasEquivalentesSet.has(materiaDestino.CodigoMateria))
            .map((materiaDestino) => ({
                codigoMateria: materiaDestino.CodigoMateria,
                nombreMateria: materiaDestino.NombreMateria,
                uvs: materiaDestino.UVS || 0,
                semestre: materiaDestino.Semestre || null
            }));

        // 7. Calcular estadísticas finales
        const materiasEquivalentes = materiasEquivalentesSet.size;
        const materiasFaltantes = materiasFaltantesDetalle.length;
        const uvsFaltantes = planDestino.TotalUVS - uvsEquivalentes;

        console.log(`[Simulación] Resultado: ${materiasEquivalentes} materias equivalentes, ${uvsEquivalentes} UVs`);

        res.json({
            planDestino: {
                idPlan: planDestino.IdPlan,
                codigoCarrera: planDestino.CodigoCarrera,
                nombreCarrera: planDestino.NombreCarrera,
                nombre: planDestino.NombrePlan,
                anioPlan: planDestino.AnioPlan,
                totalMaterias: planDestino.TotalMaterias,
                totalUvs: planDestino.TotalUVS
            },
            materiasEquivalentes: materiasEquivalentes,
            uvsEquivalentes: uvsEquivalentes,
            materiasFaltantes: materiasFaltantes,
            uvsFaltantes: uvsFaltantes,
            materiasFaltantesDetalle: materiasFaltantesDetalle,
            equivalencias: equivalencias // Primeras 20 para no saturar
        });

    } catch (error) {
        console.error('Error en simulación:', error);
        res.status(500).json({ error: 'Error al calcular simulación' });
    }
};