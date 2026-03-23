const jwt = require('jsonwebtoken');

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

function requireAuth(req, res, next) {
    try {
        const token = extractToken(req);
        if (!token) {
            return res.status(401).json({ error: 'UNAUTHORIZED' });
        }

        const payload = jwt.verify(token, getJwtSecret());
        req.user = {
            id: payload.id,
            rol: payload.rol,
            numeroCuenta: payload.numeroCuenta || null
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
