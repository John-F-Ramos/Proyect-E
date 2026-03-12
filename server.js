const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (CSS, JS, imágenes)
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal - Sirve el index.html (Login)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});