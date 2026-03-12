const sql = require('mssql');

// Configuración basada en el estándar de seguridad
const dbConfig = {
    user: process.env.DB_USER || 'UsuariosDB',
    password: process.env.DB_PASSWORD || 'Temporal2025',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_DATABASE || 'AppEquivalenciasDB',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

const poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(pool => {
        console.log('Conexión exitosa a SQL Server');
        return pool;
    })
    .catch(err => {
        console.error('Error de conexión a la base de datos:', err);
        process.exit(1);
    });

module.exports = {
    sql, poolPromise
};