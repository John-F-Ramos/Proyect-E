const { poolPromise, sql } = require('../config/db');

const VALID_ROLES = new Set([1, 2, 3]);

function getRoleName(idRol) {
    if (idRol === 1) return 'Administrador';
    if (idRol === 2) return 'Jefe de Carrera';
    return 'Estudiante';
}

function toBool(value) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    return null;
}

function normalizeIpToIpv4(value) {
    const raw = (value || '').toString().trim();
    if (!raw) return null;

    const candidates = raw
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

    for (const c of candidates) {
        const withoutBrackets = c.replace(/^\[/, '').replace(/\]$/, '');
        const mapped = withoutBrackets.replace(/^::ffff:/i, '');

        const ipv4Match = mapped.match(/\b((25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3})\b/);
        if (ipv4Match) {
            return ipv4Match[1];
        }

        if (
            mapped === '::1' ||
            mapped === '0:0:0:0:0:0:0:1' ||
            mapped.toLowerCase() === 'localhost'
        ) {
            return '127.0.0.1';
        }
    }

    // Si no se pudo convertir (IPv6 pura pública), devuelve el valor original.
    return candidates[0];
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return normalizeIpToIpv4(forwarded);
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) {
        return normalizeIpToIpv4(realIp);
    }
    return normalizeIpToIpv4(req.ip || req.socket?.remoteAddress || null);
}

async function getAdminUsers(req, res) {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT
                u.IdUsuario,
                u.NombreCompleto,
                u.CorreoInstitucional,
                u.IdRol,
                u.NumeroCuenta,
                u.Activo,
                u.FechaCreacion,
                a.IdPlanActual,
                a.IndiceAcademico
            FROM Usuarios u
            LEFT JOIN Alumnos a ON a.NumeroCuenta = u.NumeroCuenta
            ORDER BY u.IdRol ASC, u.NombreCompleto ASC
        `);

        const users = result.recordset.map((u) => ({
            id: u.IdUsuario,
            nombre: u.NombreCompleto,
            correoInstitucional: u.CorreoInstitucional,
            rol: u.IdRol,
            rolNombre: getRoleName(u.IdRol),
            numeroCuenta: u.NumeroCuenta,
            activo: Boolean(u.Activo),
            fechaCreacion: u.FechaCreacion,
            idPlanActual: u.IdPlanActual,
            indiceAcademico: u.IndiceAcademico
        }));

        return res.status(200).json(users);
    } catch (error) {
        console.error('[Admin] Error listando usuarios:', error.message);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}

async function getPlatformUserMetrics(req, res) {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT
                COUNT(1) AS TotalUsuarios,
                SUM(CASE WHEN ISNULL(Activo, 1) = 1 THEN 1 ELSE 0 END) AS UsuariosActivos,
                SUM(CASE WHEN ISNULL(Activo, 1) = 0 THEN 1 ELSE 0 END) AS UsuariosInactivos,
                SUM(CASE WHEN IdRol = 1 THEN 1 ELSE 0 END) AS TotalAdmins,
                SUM(CASE WHEN IdRol = 2 THEN 1 ELSE 0 END) AS TotalJefes,
                SUM(CASE WHEN IdRol = 3 THEN 1 ELSE 0 END) AS TotalEstudiantes,
                SUM(CASE WHEN FechaCreacion >= DATEADD(DAY, -7, GETDATE()) THEN 1 ELSE 0 END) AS AltasUltimos7Dias
            FROM Usuarios
        `);

        const row = result.recordset[0] || {};
        return res.status(200).json({
            totalUsuarios: Number(row.TotalUsuarios || 0),
            usuariosActivos: Number(row.UsuariosActivos || 0),
            usuariosInactivos: Number(row.UsuariosInactivos || 0),
            totalAdmins: Number(row.TotalAdmins || 0),
            totalJefes: Number(row.TotalJefes || 0),
            totalEstudiantes: Number(row.TotalEstudiantes || 0),
            altasUltimos7Dias: Number(row.AltasUltimos7Dias || 0)
        });
    } catch (error) {
        console.error('[Admin] Error obteniendo métricas de usuarios:', error.message);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}

async function getRoleAudit(req, res) {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 200 ? limitRaw : 50;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('limit', sql.Int, limit)
            .query(`
                SELECT TOP (@limit)
                    ar.IdAuditoria,
                    ar.IdAdminActor,
                    adminU.NombreCompleto AS NombreAdminActor,
                    ar.IdUsuarioObjetivo,
                    targetU.NombreCompleto AS NombreUsuarioObjetivo,
                    ar.RolAnterior,
                    ar.RolNuevo,
                    ar.EstadoAnterior,
                    ar.EstadoNuevo,
                    ar.Motivo,
                    ar.Fecha,
                    CONVERT(VARCHAR(19), ar.Fecha, 120) AS FechaTexto,
                    ar.IpOrigen
                FROM AuditoriaRoles ar
                INNER JOIN Usuarios adminU ON adminU.IdUsuario = ar.IdAdminActor
                INNER JOIN Usuarios targetU ON targetU.IdUsuario = ar.IdUsuarioObjetivo
                ORDER BY ar.Fecha DESC, ar.IdAuditoria DESC
            `);

        return res.status(200).json(result.recordset.map((row) => ({
            idAuditoria: row.IdAuditoria,
            idAdminActor: row.IdAdminActor,
            nombreAdminActor: row.NombreAdminActor,
            idUsuarioObjetivo: row.IdUsuarioObjetivo,
            nombreUsuarioObjetivo: row.NombreUsuarioObjetivo,
            rolAnterior: row.RolAnterior,
            rolAnteriorNombre: row.RolAnterior == null ? null : getRoleName(row.RolAnterior),
            rolNuevo: row.RolNuevo,
            rolNuevoNombre: row.RolNuevo == null ? null : getRoleName(row.RolNuevo),
            estadoAnterior: row.EstadoAnterior == null ? null : Boolean(row.EstadoAnterior),
            estadoNuevo: row.EstadoNuevo == null ? null : Boolean(row.EstadoNuevo),
            motivo: row.Motivo,
            fecha: row.Fecha,
            fechaTexto: row.FechaTexto,
            ipOrigen: normalizeIpToIpv4(row.IpOrigen)
        })));
    } catch (error) {
        console.error('[Admin] Error listando auditoría:', error.message);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}

async function updateUserRole(req, res) {
    const idUsuario = Number(req.params.id);
    const nuevoRol = Number(req.body?.idRol);
    const motivo = (req.body?.motivo || '').toString().trim() || null;

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
        return res.status(400).json({ error: 'INVALID_USER_ID' });
    }
    if (!VALID_ROLES.has(nuevoRol)) {
        return res.status(400).json({ error: 'INVALID_ROLE' });
    }

    try {
        const pool = await poolPromise;
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const targetResult = await new sql.Request(tx)
                .input('idUsuario', sql.Int, idUsuario)
                .query(`
                    SELECT IdUsuario, IdRol, Activo
                    FROM Usuarios WITH (UPDLOCK, ROWLOCK)
                    WHERE IdUsuario = @idUsuario
                `);

            if (targetResult.recordset.length === 0) {
                await tx.rollback();
                return res.status(404).json({ error: 'USER_NOT_FOUND' });
            }

            const target = targetResult.recordset[0];
            const rolAnterior = Number(target.IdRol);
            const estadoAnterior = Boolean(target.Activo);
            const estadoNuevo = estadoAnterior;
            const rolNuevo = nuevoRol;

            if (rolAnterior === rolNuevo) {
                await tx.rollback();
                return res.status(200).json({
                    message: 'Sin cambios: el usuario ya tiene ese rol.',
                    user: {
                        id: idUsuario,
                        rol: rolAnterior,
                        rolNombre: getRoleName(rolAnterior),
                        activo: estadoAnterior
                    }
                });
            }

            const isCurrentActiveAdmin = rolAnterior === 1 && estadoAnterior;
            const isNextActiveAdmin = rolNuevo === 1 && estadoNuevo;
            if (isCurrentActiveAdmin && !isNextActiveAdmin) {
                const adminCountResult = await new sql.Request(tx)
                    .input('idUsuario', sql.Int, idUsuario)
                    .query(`
                        SELECT COUNT(1) AS Total
                        FROM Usuarios
                        WHERE IdRol = 1 AND Activo = 1 AND IdUsuario <> @idUsuario
                    `);
                const otrosAdmins = Number(adminCountResult.recordset[0].Total || 0);
                if (otrosAdmins <= 0) {
                    await tx.rollback();
                    return res.status(409).json({ error: 'LAST_ACTIVE_ADMIN' });
                }
            }

            await new sql.Request(tx)
                .input('idUsuario', sql.Int, idUsuario)
                .input('idRol', sql.Int, rolNuevo)
                .query(`
                    UPDATE Usuarios
                    SET IdRol = @idRol
                    WHERE IdUsuario = @idUsuario
                `);

            await new sql.Request(tx)
                .input('idAdminActor', sql.Int, Number(req.user.id))
                .input('idUsuarioObjetivo', sql.Int, idUsuario)
                .input('rolAnterior', sql.Int, rolAnterior)
                .input('rolNuevo', sql.Int, rolNuevo)
                .input('estadoAnterior', sql.Bit, estadoAnterior ? 1 : 0)
                .input('estadoNuevo', sql.Bit, estadoNuevo ? 1 : 0)
                .input('motivo', sql.NVarChar(300), motivo)
                .input('ipOrigen', sql.VarChar(64), getClientIp(req))
                .query(`
                    INSERT INTO AuditoriaRoles (
                        IdAdminActor, IdUsuarioObjetivo, RolAnterior, RolNuevo,
                        EstadoAnterior, EstadoNuevo, Motivo, IpOrigen
                    )
                    VALUES (
                        @idAdminActor, @idUsuarioObjetivo, @rolAnterior, @rolNuevo,
                        @estadoAnterior, @estadoNuevo, @motivo, @ipOrigen
                    )
                `);

            await tx.commit();

            return res.status(200).json({
                message: 'Rol actualizado correctamente.',
                user: {
                    id: idUsuario,
                    rol: rolNuevo,
                    rolNombre: getRoleName(rolNuevo),
                    activo: estadoNuevo
                }
            });
        } catch (txError) {
            await tx.rollback();
            throw txError;
        }
    } catch (error) {
        console.error('[Admin] Error actualizando rol:', error.message);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}

async function updateUserStatus(req, res) {
    const idUsuario = Number(req.params.id);
    const activo = toBool(req.body?.activo);
    const motivo = (req.body?.motivo || '').toString().trim() || null;

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
        return res.status(400).json({ error: 'INVALID_USER_ID' });
    }
    if (activo === null) {
        return res.status(400).json({ error: 'INVALID_STATUS' });
    }

    try {
        const pool = await poolPromise;
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const targetResult = await new sql.Request(tx)
                .input('idUsuario', sql.Int, idUsuario)
                .query(`
                    SELECT IdUsuario, IdRol, Activo
                    FROM Usuarios WITH (UPDLOCK, ROWLOCK)
                    WHERE IdUsuario = @idUsuario
                `);

            if (targetResult.recordset.length === 0) {
                await tx.rollback();
                return res.status(404).json({ error: 'USER_NOT_FOUND' });
            }

            const target = targetResult.recordset[0];
            const rolAnterior = Number(target.IdRol);
            const rolNuevo = rolAnterior;
            const estadoAnterior = Boolean(target.Activo);
            const estadoNuevo = activo;

            if (estadoAnterior === estadoNuevo) {
                await tx.rollback();
                return res.status(200).json({
                    message: 'Sin cambios: el usuario ya tiene ese estado.',
                    user: {
                        id: idUsuario,
                        rol: rolAnterior,
                        rolNombre: getRoleName(rolAnterior),
                        activo: estadoAnterior
                    }
                });
            }

            const isCurrentActiveAdmin = rolAnterior === 1 && estadoAnterior;
            const isNextActiveAdmin = rolNuevo === 1 && estadoNuevo;
            if (isCurrentActiveAdmin && !isNextActiveAdmin) {
                const adminCountResult = await new sql.Request(tx)
                    .input('idUsuario', sql.Int, idUsuario)
                    .query(`
                        SELECT COUNT(1) AS Total
                        FROM Usuarios
                        WHERE IdRol = 1 AND Activo = 1 AND IdUsuario <> @idUsuario
                    `);
                const otrosAdmins = Number(adminCountResult.recordset[0].Total || 0);
                if (otrosAdmins <= 0) {
                    await tx.rollback();
                    return res.status(409).json({ error: 'LAST_ACTIVE_ADMIN' });
                }
            }

            await new sql.Request(tx)
                .input('idUsuario', sql.Int, idUsuario)
                .input('activo', sql.Bit, estadoNuevo ? 1 : 0)
                .query(`
                    UPDATE Usuarios
                    SET Activo = @activo
                    WHERE IdUsuario = @idUsuario
                `);

            await new sql.Request(tx)
                .input('idAdminActor', sql.Int, Number(req.user.id))
                .input('idUsuarioObjetivo', sql.Int, idUsuario)
                .input('rolAnterior', sql.Int, rolAnterior)
                .input('rolNuevo', sql.Int, rolNuevo)
                .input('estadoAnterior', sql.Bit, estadoAnterior ? 1 : 0)
                .input('estadoNuevo', sql.Bit, estadoNuevo ? 1 : 0)
                .input('motivo', sql.NVarChar(300), motivo)
                .input('ipOrigen', sql.VarChar(64), getClientIp(req))
                .query(`
                    INSERT INTO AuditoriaRoles (
                        IdAdminActor, IdUsuarioObjetivo, RolAnterior, RolNuevo,
                        EstadoAnterior, EstadoNuevo, Motivo, IpOrigen
                    )
                    VALUES (
                        @idAdminActor, @idUsuarioObjetivo, @rolAnterior, @rolNuevo,
                        @estadoAnterior, @estadoNuevo, @motivo, @ipOrigen
                    )
                `);

            await tx.commit();

            return res.status(200).json({
                message: 'Estado de cuenta actualizado.',
                user: {
                    id: idUsuario,
                    rol: rolNuevo,
                    rolNombre: getRoleName(rolNuevo),
                    activo: estadoNuevo
                }
            });
        } catch (txError) {
            await tx.rollback();
            throw txError;
        }
    } catch (error) {
        console.error('[Admin] Error actualizando estado:', error.message);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}

module.exports = {
    getAdminUsers,
    getPlatformUserMetrics,
    getRoleAudit,
    updateUserRole,
    updateUserStatus
};
