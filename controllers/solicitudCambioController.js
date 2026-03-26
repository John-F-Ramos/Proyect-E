const { poolPromise, sql } = require('../config/db');

// Student creates a career change request
exports.crearSolicitud = async (req, res) => {
    try {
        const { idPlanDestino, motivo } = req.body;
        const requester = req.user;

        if (!requester || requester.rol !== 3) {
            return res.status(403).json({ error: 'Solo estudiantes pueden crear solicitudes de cambio.' });
        }

        const cuenta = (requester.numeroCuenta || '').toString().trim();
        if (!cuenta) {
            return res.status(400).json({ error: 'No se encontró número de cuenta asociado al usuario.' });
        }

        const planId = Number(idPlanDestino);
        if (!Number.isInteger(planId) || planId <= 0) {
            return res.status(400).json({ error: 'Plan destino inválido.' });
        }

        const pool = await poolPromise;

        // Get student's current plan
        const alumnoResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT a.NumeroCuenta, a.IdPlanActual,
                       p.CodigoCarrera, c.NombreCarrera
                FROM Alumnos a
                LEFT JOIN PlanesEstudio p ON a.IdPlanActual = p.IdPlan
                LEFT JOIN Carreras c ON p.CodigoCarrera = c.CodigoCarrera
                WHERE a.NumeroCuenta = @cuenta
            `);

        if (alumnoResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Alumno no encontrado.' });
        }

        const alumno = alumnoResult.recordset[0];

        if (alumno.IdPlanActual === planId) {
            return res.status(400).json({ error: 'El plan destino es el mismo que tu plan actual.' });
        }

        // Check no pending request already exists
        const pendingCheck = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT IdSolicitud FROM SolicitudesCambioCarrera
                WHERE NumeroCuenta = @cuenta AND Estado = 'PENDIENTE'
            `);

        if (pendingCheck.recordset.length > 0) {
            return res.status(409).json({ error: 'Ya tienes una solicitud de cambio pendiente. Espera a que sea resuelta.' });
        }

        // Verify destination plan exists and get info
        const planDestinoResult = await pool.request()
            .input('idPlan', sql.Int, planId)
            .query(`
                SELECT p.IdPlan, p.NombrePlan, p.AnioPlan, p.CodigoCarrera,
                       c.NombreCarrera,
                       (SELECT COUNT(*) FROM Pensum_Materias pm2 WHERE pm2.IdPlan = p.IdPlan) AS TotalMaterias,
                       (SELECT ISNULL(SUM(ISNULL(m2.UVS, 0)), 0)
                        FROM Pensum_Materias pm2
                        LEFT JOIN (SELECT CodigoMateria, MAX(UVS) AS UVS FROM Materias GROUP BY CodigoMateria) m2
                            ON pm2.CodigoMateria = m2.CodigoMateria
                        WHERE pm2.IdPlan = p.IdPlan) AS TotalUVS
                FROM PlanesEstudio p
                LEFT JOIN Carreras c ON p.CodigoCarrera = c.CodigoCarrera
                WHERE p.IdPlan = @idPlan
            `);

        if (planDestinoResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Plan destino no encontrado.' });
        }

        const planDestino = planDestinoResult.recordset[0];

        // Run a quick simulation to store snapshot data
        const historialResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT DISTINCT h.CodigoMateria
                FROM Historial_Importado h
                WHERE h.NumeroCuenta = @cuenta
                AND h.Estado IN ('APB', 'APR', 'APROBADO', 'REQ')
            `);

        const materiasAprobadas = new Set(historialResult.recordset.map(m => m.CodigoMateria));

        const materiasDestinoResult = await pool.request()
            .input('idPlan', sql.Int, planId)
            .query(`
                SELECT pm.CodigoMateria, ISNULL(m.UVS, 0) AS UVS
                FROM Pensum_Materias pm
                LEFT JOIN (SELECT CodigoMateria, MAX(UVS) AS UVS FROM Materias GROUP BY CodigoMateria) m
                    ON pm.CodigoMateria = m.CodigoMateria
                WHERE pm.IdPlan = @idPlan
            `);

        let materiasEquiv = 0;
        let uvsEquiv = 0;
        for (const md of materiasDestinoResult.recordset) {
            if (materiasAprobadas.has(md.CodigoMateria)) {
                materiasEquiv++;
                uvsEquiv += md.UVS;
            }
        }

        const totalMaterias = planDestino.TotalMaterias;
        const totalUVS = planDestino.TotalUVS;
        const materiasFalt = totalMaterias - materiasEquiv;
        const uvsFalt = totalUVS - uvsEquiv;
        const porcentaje = totalUVS > 0 ? Math.round((uvsEquiv / totalUVS) * 10000) / 100 : 0;

        // Insert the request
        const insertResult = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .input('idPlanActual', sql.Int, alumno.IdPlanActual)
            .input('idPlanDestino', sql.Int, planId)
            .input('motivo', sql.NVarChar(500), (motivo || '').substring(0, 500) || null)
            .input('materiasEquiv', sql.Int, materiasEquiv)
            .input('uvsEquiv', sql.Int, uvsEquiv)
            .input('materiasFalt', sql.Int, materiasFalt)
            .input('uvsFalt', sql.Int, uvsFalt)
            .input('porcentaje', sql.Decimal(5, 2), porcentaje)
            .query(`
                INSERT INTO SolicitudesCambioCarrera
                    (NumeroCuenta, IdPlanActual, IdPlanDestino, Motivo,
                     MateriasEquivalentes, UVSEquivalentes, MateriasFaltantes, UVSFaltantes, PorcentajeAvance)
                OUTPUT INSERTED.IdSolicitud
                VALUES (@cuenta, @idPlanActual, @idPlanDestino, @motivo,
                        @materiasEquiv, @uvsEquiv, @materiasFalt, @uvsFalt, @porcentaje)
            `);

        const idSolicitud = insertResult.recordset[0].IdSolicitud;

        res.status(201).json({
            message: 'Solicitud de cambio de carrera creada exitosamente.',
            idSolicitud,
            planDestino: {
                nombre: planDestino.NombrePlan,
                carrera: planDestino.NombreCarrera,
                anio: planDestino.AnioPlan
            }
        });

    } catch (error) {
        console.error('Error al crear solicitud de cambio:', error);
        res.status(500).json({ error: 'Error interno al crear la solicitud.' });
    }
};

// Student views their own requests
exports.misSolicitudes = async (req, res) => {
    try {
        const requester = req.user;
        if (!requester) return res.status(401).json({ error: 'UNAUTHORIZED' });

        const cuenta = (requester.numeroCuenta || '').toString().trim();
        if (!cuenta && requester.rol === 3) {
            return res.status(400).json({ error: 'No se encontró número de cuenta.' });
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input('cuenta', sql.VarChar, cuenta)
            .query(`
                SELECT
                    s.IdSolicitud, s.NumeroCuenta, s.Estado, s.Motivo,
                    s.MateriasEquivalentes, s.UVSEquivalentes,
                    s.MateriasFaltantes, s.UVSFaltantes, s.PorcentajeAvance,
                    s.MotivoResolucion, s.FechaCreacion, s.FechaResolucion,
                    pa.NombrePlan AS PlanActualNombre, pa.AnioPlan AS PlanActualAnio,
                    ca.NombreCarrera AS CarreraActualNombre,
                    pd.NombrePlan AS PlanDestinoNombre, pd.AnioPlan AS PlanDestinoAnio,
                    cd.NombreCarrera AS CarreraDestinoNombre,
                    u.NombreCompleto AS RevisorNombre
                FROM SolicitudesCambioCarrera s
                LEFT JOIN PlanesEstudio pa ON s.IdPlanActual = pa.IdPlan
                LEFT JOIN Carreras ca ON pa.CodigoCarrera = ca.CodigoCarrera
                LEFT JOIN PlanesEstudio pd ON s.IdPlanDestino = pd.IdPlan
                LEFT JOIN Carreras cd ON pd.CodigoCarrera = cd.CodigoCarrera
                LEFT JOIN Usuarios u ON s.IdUsuarioRevisor = u.IdUsuario
                WHERE s.NumeroCuenta = @cuenta
                ORDER BY s.FechaCreacion DESC
            `);

        res.status(200).json(result.recordset);

    } catch (error) {
        console.error('Error al obtener solicitudes:', error);
        res.status(500).json({ error: 'Error interno al obtener solicitudes.' });
    }
};

// Jefe de Carrera / Admin: list all pending requests
exports.listarSolicitudes = async (req, res) => {
    try {
        const requester = req.user;
        if (!requester || (requester.rol !== 1 && requester.rol !== 2)) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }

        const estado = (req.query.estado || '').toUpperCase();
        const validEstados = ['PENDIENTE', 'APROBADA', 'RECHAZADA'];

        const pool = await poolPromise;

        let query = `
            SELECT
                s.IdSolicitud, s.NumeroCuenta, s.Estado, s.Motivo,
                s.MateriasEquivalentes, s.UVSEquivalentes,
                s.MateriasFaltantes, s.UVSFaltantes, s.PorcentajeAvance,
                s.MotivoResolucion, s.FechaCreacion, s.FechaResolucion,
                a.NombreCompleto AS AlumnoNombre,
                pa.NombrePlan AS PlanActualNombre, pa.AnioPlan AS PlanActualAnio,
                ca.NombreCarrera AS CarreraActualNombre, ca.CodigoCarrera AS CarreraActualCodigo,
                pd.NombrePlan AS PlanDestinoNombre, pd.AnioPlan AS PlanDestinoAnio,
                cd.NombreCarrera AS CarreraDestinoNombre, cd.CodigoCarrera AS CarreraDestinoCodigo,
                u.NombreCompleto AS RevisorNombre
            FROM SolicitudesCambioCarrera s
            LEFT JOIN Alumnos a ON s.NumeroCuenta = a.NumeroCuenta
            LEFT JOIN PlanesEstudio pa ON s.IdPlanActual = pa.IdPlan
            LEFT JOIN Carreras ca ON pa.CodigoCarrera = ca.CodigoCarrera
            LEFT JOIN PlanesEstudio pd ON s.IdPlanDestino = pd.IdPlan
            LEFT JOIN Carreras cd ON pd.CodigoCarrera = cd.CodigoCarrera
            LEFT JOIN Usuarios u ON s.IdUsuarioRevisor = u.IdUsuario
        `;

        const request = pool.request();

        if (validEstados.includes(estado)) {
            query += ' WHERE s.Estado = @estado';
            request.input('estado', sql.VarChar(20), estado);
        }

        query += ' ORDER BY s.FechaCreacion DESC';

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (error) {
        console.error('Error al listar solicitudes:', error);
        res.status(500).json({ error: 'Error interno al listar solicitudes.' });
    }
};

// Jefe de Carrera / Admin: approve or reject a request
exports.resolverSolicitud = async (req, res) => {
    try {
        const requester = req.user;
        if (!requester || (requester.rol !== 1 && requester.rol !== 2)) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }

        const { id } = req.params;
        const { accion, motivoResolucion } = req.body;
        const idSolicitud = Number(id);

        if (!Number.isInteger(idSolicitud) || idSolicitud <= 0) {
            return res.status(400).json({ error: 'ID de solicitud inválido.' });
        }

        const accionUpper = (accion || '').toUpperCase();
        if (accionUpper !== 'APROBAR' && accionUpper !== 'RECHAZAR') {
            return res.status(400).json({ error: 'Acción debe ser APROBAR o RECHAZAR.' });
        }

        const nuevoEstado = accionUpper === 'APROBAR' ? 'APROBADA' : 'RECHAZADA';

        const pool = await poolPromise;

        // Get the request
        const solicitudResult = await pool.request()
            .input('id', sql.Int, idSolicitud)
            .query(`
                SELECT IdSolicitud, NumeroCuenta, IdPlanActual, IdPlanDestino, Estado
                FROM SolicitudesCambioCarrera
                WHERE IdSolicitud = @id
            `);

        if (solicitudResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }

        const solicitud = solicitudResult.recordset[0];

        if (solicitud.Estado !== 'PENDIENTE') {
            return res.status(409).json({ error: `La solicitud ya fue ${solicitud.Estado.toLowerCase()}.` });
        }

        const tx = new sql.Transaction(pool);
        await tx.begin();

        try {
            // Update the request status
            await new sql.Request(tx)
                .input('id', sql.Int, idSolicitud)
                .input('estado', sql.VarChar(20), nuevoEstado)
                .input('idRevisor', sql.Int, requester.id)
                .input('motivoResolucion', sql.NVarChar(500), (motivoResolucion || '').substring(0, 500) || null)
                .query(`
                    UPDATE SolicitudesCambioCarrera
                    SET Estado = @estado,
                        IdUsuarioRevisor = @idRevisor,
                        MotivoResolucion = @motivoResolucion,
                        FechaResolucion = GETDATE(),
                        FechaActualizacion = GETDATE()
                    WHERE IdSolicitud = @id
                `);

            // If approved, update the student's plan
            if (nuevoEstado === 'APROBADA') {
                await new sql.Request(tx)
                    .input('cuenta', sql.VarChar, solicitud.NumeroCuenta)
                    .input('idPlanDestino', sql.Int, solicitud.IdPlanDestino)
                    .query(`
                        UPDATE Alumnos
                        SET IdPlanActual = @idPlanDestino
                        WHERE NumeroCuenta = @cuenta
                    `);
            }

            await tx.commit();

            res.status(200).json({
                message: nuevoEstado === 'APROBADA'
                    ? 'Solicitud aprobada. El plan del alumno ha sido actualizado.'
                    : 'Solicitud rechazada.',
                idSolicitud,
                nuevoEstado
            });

        } catch (innerErr) {
            try { await tx.rollback(); } catch (_) {}
            throw innerErr;
        }

    } catch (error) {
        console.error('Error al resolver solicitud:', error);
        res.status(500).json({ error: 'Error interno al resolver la solicitud.' });
    }
};

// Get counts for badges
exports.contarPendientes = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT COUNT(*) AS Total
            FROM SolicitudesCambioCarrera
            WHERE Estado = 'PENDIENTE'
        `);

        res.status(200).json({ pendientes: result.recordset[0].Total });

    } catch (error) {
        console.error('Error al contar solicitudes pendientes:', error);
        res.status(500).json({ error: 'Error interno.' });
    }
};
