const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import variables
const ingestRoutes = require('./routes/ingest.routes');

// Definir rutas base
app.use('/api/ingest', ingestRoutes);

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Servicio Módulo Ingesta online' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
