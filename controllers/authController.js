const { poolPromise, sql } = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function getRoleNameMap() {
    return {
        1: 'Administrador',
        2: 'Jefe de Carrera',
        3: 'Estudiante'
    };
}

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'production' && !secret) {
        throw new Error('JWT_SECRET is required in production.');
    }
    return secret || 'dev-jwt-secret-change-me';
}

async function login(req, res) {
    const { email, password } = req.body;
    console.log(`[Login] Intento para: ${email}`);

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT * FROM Usuarios WHERE CorreoInstitucional = @email');

        const user = result.recordset[0];

        if (!user) {
            console.log(`[Login] Usuario no encontrado: ${email}`);
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        console.log(`[Login] Usuario encontrado. Validando contraseña...`);
        
        const isHash = user.PasswordHash && user.PasswordHash.startsWith('$2');
        let isMatch = false;

        if (isHash) {
            isMatch = await bcrypt.compare(password, user.PasswordHash);
            console.log(`[Login] Comparación BCrypt: ${isMatch}`);
        } else {
            // Migración legacy: una vez valide en texto plano, guarda bcrypt y elimina dependencia de texto plano.
            isMatch = user.PasswordHash === password;
            if (isMatch) {
                const newHash = await bcrypt.hash(password, 12);
                await pool.request()
                    .input('idUsuario', sql.Int, user.IdUsuario)
                    .input('hash', sql.VarChar(255), newHash)
                    .query('UPDATE Usuarios SET PasswordHash = @hash WHERE IdUsuario = @idUsuario');
                user.PasswordHash = newHash;
                console.log(`[Login] Password legacy migrado a bcrypt para: ${email}`);
            }
        }

        if (isMatch) {
            console.log(`[Login] Login exitoso para: ${email}`);

            const roleNameMap = getRoleNameMap();
            const token = jwt.sign(
                { id: user.IdUsuario, rol: user.IdRol, numeroCuenta: user.NumeroCuenta || null },
                getJwtSecret(),
                { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
            );

            return res.status(200).json({
                message: 'Login exitoso',
                token,
                user: {
                    id: user.IdUsuario, 
                    nombre: user.NombreCompleto, 
                    rol: user.IdRol,
                    rolNombre: roleNameMap[user.IdRol] || 'Usuario',
                    numeroCuenta: user.NumeroCuenta,
                    correoInstitucional: user.CorreoInstitucional,
                    fechaCreacion: user.FechaCreacion
                }
            });
        }

        console.log(`[Login] Fallo de credenciales para ${email}`);
        return res.status(401).json({ message: 'Credenciales inválidas' });

    } catch (err) {
        console.error(`[Login] Error crítico: ${err.message}`);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function register(req, res) {
    const nombre = (req.body?.nombre || '').trim();
    const email = (req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password || '';
    const numeroCuentaRaw = (req.body?.numeroCuenta || '').trim();
    const numeroCuenta = numeroCuentaRaw || null;

    if (!nombre || !email || !password || !numeroCuenta) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
    }
    if (nombre.length < 5) {
        return res.status(400).json({ message: 'El nombre completo es demasiado corto.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || !email.endsWith('@unitec.edu')) {
        return res.status(400).json({ message: 'El correo debe ser institucional (@unitec.edu).' });
    }

    try {
        const pool = await poolPromise;

        const emailYaExiste = await pool.request()
            .input('email', sql.VarChar(150), email)
            .query('SELECT 1 AS ok FROM Usuarios WHERE CorreoInstitucional = @email');
        if (emailYaExiste.recordset.length > 0) {
            return res.status(409).json({ message: 'El correo ya está registrado.' });
        }

        const cuentaYaExiste = await pool.request()
            .input('numeroCuenta', sql.VarChar(50), numeroCuenta)
            .query('SELECT 1 AS ok FROM Usuarios WHERE NumeroCuenta = @numeroCuenta');
        if (cuentaYaExiste.recordset.length > 0) {
            return res.status(409).json({ message: 'La cuenta ya tiene un usuario registrado.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            const cuentaEnAlumnos = await new sql.Request(transaction)
                .input('numeroCuenta', sql.VarChar(50), numeroCuenta)
                .query('SELECT 1 AS ok FROM Alumnos WHERE NumeroCuenta = @numeroCuenta');

            if (cuentaEnAlumnos.recordset.length === 0) {
                await new sql.Request(transaction)
                    .input('numeroCuenta', sql.VarChar(50), numeroCuenta)
                    .input('nombre', sql.VarChar(200), nombre)
                    .query(`
                        INSERT INTO Alumnos (NumeroCuenta, NombreCompleto, IdPlanActual, IndiceAcademico, UltimaSincronizacion)
                        VALUES (@numeroCuenta, @nombre, NULL, 0, GETDATE())
                    `);
            }

            await new sql.Request(transaction)
                .input('correo', sql.VarChar(150), email)
                .input('hash', sql.VarChar(255), passwordHash)
                .input('nombre', sql.VarChar(200), nombre)
                .input('idRol', sql.Int, 3)
                .input('numeroCuenta', sql.VarChar(50), numeroCuenta)
                .query(`
                    INSERT INTO Usuarios (
                        CorreoInstitucional, PasswordHash, NombreCompleto, IdRol, NumeroCuenta, Activo, FechaCreacion
                    )
                    VALUES (
                        @correo, @hash, @nombre, @idRol, @numeroCuenta, 1, GETDATE()
                    )
                `);

            await transaction.commit();
        } catch (txError) {
            await transaction.rollback();
            throw txError;
        }

        return res.status(201).json({ message: 'Registro exitoso. Ya puedes iniciar sesión.' });
    } catch (err) {
        if (err && (err.number === 2601 || err.number === 2627)) {
            return res.status(409).json({ message: 'La cuenta o el correo ya están registrados.' });
        }
        console.error(`[Register] Error crítico: ${err.message}`);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
}

async function getUserById(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'Id de usuario inválido' });
    }

    try {
        const requester = req.user;
        if (!requester) {
            return res.status(401).json({ message: 'UNAUTHORIZED' });
        }
        if (requester.rol !== 1 && requester.id !== id) {
            return res.status(403).json({ message: 'FORBIDDEN' });
        }

        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT IdUsuario, NombreCompleto, CorreoInstitucional, IdRol, NumeroCuenta, FechaCreacion
                FROM Usuarios
                WHERE IdUsuario = @id
            `);

        const user = result.recordset[0];
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const roleNameMap = getRoleNameMap();

        return res.status(200).json({
            id: user.IdUsuario,
            nombre: user.NombreCompleto,
            rol: user.IdRol,
            rolNombre: roleNameMap[user.IdRol] || 'Usuario',
            numeroCuenta: user.NumeroCuenta,
            correoInstitucional: user.CorreoInstitucional,
            fechaCreacion: user.FechaCreacion
        });
    } catch (err) {
        console.error(`[Auth] Error obteniendo usuario por id: ${err.message}`);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
}

module.exports = { login, register, getUserById };