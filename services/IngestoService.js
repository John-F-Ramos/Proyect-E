const { poolPromise, sql } = require('../config/db');

async function guardarPlanes(datosExcel) {
    try {
        const pool = await poolPromise;
        // Ejemplo de inserción siguiendo el requerimiento de automatización de datos [cite: 4]
        await pool.request()
            .input('codigo', sql.VarChar, datosExcel.codigo)
            .query('INSERT INTO PlanesEstudio (CodigoClase) VALUES (@codigo)');
    } catch (err) {
        console.error("Error en la ingesta:", err);
    }
}