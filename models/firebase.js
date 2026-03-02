require('dotenv').config();
const admin = require('firebase-admin');

// TODO: DEUDA TÉCNICA - [Configuración Auth] Asegurar que las variables de entorno estén presentes en producción o MVP y evitar fallback hardcodeado.
// Se inicializa usando default credentials si existe GOOGLE_APPLICATION_CREDENTIALS
// O configuración a partir de variables de entorno explícitas
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (serviceAccountPath) {
    admin.initializeApp({
        credential: admin.credential.cert(require(serviceAccountPath))
    });
} else {
    // Inicialización default, dependiente de entorno GCP/Firebase o variables inyectadas por MCP
    admin.initializeApp();
}

const db = admin.firestore();

module.exports = { admin, db };
