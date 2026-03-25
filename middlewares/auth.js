const jwt = require('jsonwebtoken');
const { poolPromise, sql } = require('../config/db');

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'production' && !secret) {
        throw new Error('JWT_SECRET is required in production.');
    }
    return secret || 'dev-jwt-secret-change-me';
}

function extractToken(req) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return null;
    return authHeader.slice(7).trim();
}

async function requireAuth(req, res, next) {
    try {
        const token = extractToken(req);
        if (!token) {
            return res.status(401).json({ error: 'UNAUTHORIZED' });
        }

        const payload = jwt.verify(token, getJwtSecret());

        const pool = await poolPromise;
        const result = await pool.request()
            .input('idUsuario', sql.Int, Number(payload.id))
            .query(`
                SELECT IdUsuario, IdRol, NumeroCuenta, Activo
                FROM Usuarios
                WHERE IdUsuario = @idUsuario
            `);

        const dbUser = result.recordset[0];
        if (!dbUser) {
            return res.status(401).json({ error: 'UNAUTHORIZED' });
        }
        if (!dbUser.Activo) {
            return res.status(403).json({ error: 'ACCOUNT_INACTIVE' });
        }

        req.user = {
            id: dbUser.IdUsuario,
            rol: dbUser.IdRol,
            numeroCuenta: dbUser.NumeroCuenta || null
        };

        return next();
    } catch (error) {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
}

function requireRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'UNAUTHORIZED' });
        }

        if (!allowedRoles.includes(req.user.rol)) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }

        return next();
    };
}

module.exports = {
    requireAuth,
    requireRoles
};
