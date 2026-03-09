const { poolPromise, sql } = require('../config/db');
const bcrypt = require('bcryptjs'); // Usamos bcryptjs para mayor compatibilidad en Windows

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
        
        // Verificamos si es un hash de bcrypt (empiezan con $2)
        const isHash = user.PasswordHash && user.PasswordHash.startsWith('$2');
        let isMatch = false;

        if (isHash) {
            isMatch = await bcrypt.compare(password, user.PasswordHash);
            console.log(`[Login] Comparación BCrypt: ${isMatch}`);
        } else {
            // Si no es hash, comparamos como texto plano
            isMatch = (user.PasswordHash === password);
            console.log(`[Login] Comparación Texto Plano: ${isMatch}`);
        }

        if (isMatch) {
            console.log(`[Login] Login exitoso para: ${email}`);
            res.status(200).json({
                message: "Login exitoso",
                user: { 
                    id: user.IdUsuario, 
                    nombre: user.NombreCompleto, 
                    rol: user.IdRol 
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

module.exports = { login };