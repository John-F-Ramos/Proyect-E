const { poolPromise, sql } = require('../config/db');

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
                       p.NombrePlan, p.AnioPlan,
                       c.NombreCarrera
                FROM Alumnos a
                LEFT JOIN PlanesEstudio p ON a.IdPlanActual = p.IdPlan
                LEFT JOIN Carreras c ON p.CodigoCarrera = c.CodigoCarrera
                WHERE a.NumeroCuenta = @cuenta
            `);

        if (alumnoResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Alumno no encontrado' });
        }
        
        const alumnoInfo = alumnoResult.recordset[0];

        // 2. Historial Reciente (últimas materias importadas)
        const historialResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT TOP 10 CodigoMateria, NombreMateria, Nota, Estado
                FROM Historial_Importado
                WHERE NumeroCuenta = @cuenta
                ORDER BY IdRegistro DESC
            `);

        // 3. Progreso Curricular (Aproximación inicial: UVs del historial vs Total asumiendo un estándar)
        // NOTA: Para un cálculo real exacto, necesitaríamos la tabla Pensum_Materias llena.
        // Haremos una aproximación basada en las clases sumando las uv de "Materias" si existen.
        const progresoResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT 
                    COUNT(*) as TotalClasesAprobadas,
                    SUM(COALESCE(m.UVS, 3)) as UvsAprobadas -- Fallback a 3 si no existe la materia
                FROM Historial_Importado h
                LEFT JOIN Materias m ON h.CodigoMateria = m.CodigoMateria
                WHERE h.NumeroCuenta = @cuenta AND h.Estado IN ('APB', 'APR', 'APROBADO', 'REQ')
            `);

        const progreso = progresoResult.recordset[0];

        // Construir la respuesta estructurada
        const dashboardData = {
            alumno: alumnoInfo,
            progreso: {
                clasesAprobadas: progreso.TotalClasesAprobadas || 0,
                uvsAprobadas: progreso.UvsAprobadas || 0,
                // Hardcodeado para MVP simulado. El plan de estudio dictaría el total exacto.
                totalUvsPlan: 160 
            },
            historialReciente: historialResult.recordset
        };

        res.status(200).json(dashboardData);

    } catch (error) {
        console.error('Error al obtener dashboard del alumno:', error);
        res.status(500).json({ error: 'Error interno del servidor al cargar el dashboard.' });
    }
};
