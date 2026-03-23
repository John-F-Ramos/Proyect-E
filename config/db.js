const sql = require('mssql');

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
    const requiredVars = ['DB_USER', 'DB_PASSWORD', 'DB_SERVER', 'DB_DATABASE'];
    const missing = requiredVars.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing required DB env vars in production: ${missing.join(', ')}`);
    }
}

const dbConfig = {
    user: process.env.DB_USER || 'UsuariosDB',
    password: process.env.DB_PASSWORD || 'Temporal2025',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_DATABASE || 'AppEquivalenciasDB',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: isProduction ? process.env.DB_TRUST_SERVER_CERT === 'true' : true
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