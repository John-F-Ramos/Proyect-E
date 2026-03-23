const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const corsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(
    cors({
        origin(origin, callback) {
            if (!origin) return callback(null, true);
            if (corsOrigins.length === 0) return callback(null, true);
            if (corsOrigins.includes(origin)) return callback(null, true);
            return callback(new Error('CORS origin not allowed'));
        }
    })
);
app.use(
    helmet({
        contentSecurityPolicy: false
    })
);
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (CSS, JS, imágenes)
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal - Sirve el index.html (Login)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/registro', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'registro.html'));
});

// Ruta del Dashboard
app.get('/dashboard', (req, res) => {
    res.render('dashboard');
});

// Rutas de Navegación del Sidebar
app.get('/equivalencias', (req, res) => {
    res.render('equivalencias');
});

app.get('/plan-estudio', (req, res) => {
    res.render('plan-estudio');
});

app.get('/reportes', (req, res) => {
    res.render('reportes');
});

app.get('/perfil', (req, res) => {
    res.render('perfil');
});

// Import variables
const ingestRoutes = require('./routes/ingest.routes');
const authRoutes = require('./routes/auth.routes');
const alumnosRoutes = require('./routes/alumnos.routes');
const catologosRoutes = require('./routes/catalogo.routes');
// Agrega esta línea con las demás importaciones
const simulacionRoutes = require('./routes/simulacion.routes');

// Y agrega esta línea con las demás rutas
app.use('/api/simulacion', simulacionRoutes);

// Definir rutas base
app.use('/api/ingest', ingestRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/alumnos', alumnosRoutes);
app.use('/api/catalogos', catologosRoutes);

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Servicio Módulo Ingesta online' });
});

// Error middleware global (evita filtrar detalles internos)
app.use((err, req, res, next) => {
    if (err && err.message && err.message.includes('CORS')) {
        return res.status(403).json({ error: 'CORS_FORBIDDEN' });
    }
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'FILE_TOO_LARGE' });
    }
    if (err && (err.message === 'INVALID_EXCEL_FILE' || err.message === 'INVALID_PDF_FILE')) {
        return res.status(400).json({ error: err.message });
    }
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({ error: 'INVALID_JSON' });
    }

    console.error('[Server] Unhandled error:', err);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});