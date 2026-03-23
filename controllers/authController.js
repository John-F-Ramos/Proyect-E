const { poolPromise, sql } = require('../config/db');
const bcrypt = require('bcryptjs');

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
            return res.status(401).json({ message: "Usuario no encontrado" });
        }

        console.log(`[Login] Usuario encontrado. Validando contraseña...`);
        
        const isHash = user.PasswordHash && user.PasswordHash.startsWith('$2');
        let isMatch = false;

        if (isHash) {
            isMatch = await bcrypt.compare(password, user.PasswordHash);
            console.log(`[Login] Comparación BCrypt: ${isMatch}`);
        } else {
            isMatch = (user.PasswordHash === password);
            console.log(`[Login] Comparación Texto Plano: ${isMatch}`);
        }

        if (isMatch) {
            console.log(`[Login] Login exitoso para: ${email}`);

            const roleNameMap = {
                1: 'Administrador',
                2: 'Jefe de Carrera',
                3: 'Estudiante'
            };

            res.status(200).json({
                message: "Login exitoso",
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
        } else {
            console.log(`[Login] Fallo: Contraseña incorrecta para ${email}`);
            res.status(401).json({ message: "Contraseña incorrecta" });
        }

    } catch (err) {
        console.error(`[Login] Error crítico: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
}

async function getUserById(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'Id de usuario inválido' });
    }

    try {
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

        const roleNameMap = {
            1: 'Administrador',
            2: 'Jefe de Carrera',
            3: 'Estudiante'
        };

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

module.exports = { login, getUserById };