const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Configurar CORS para permitir que GitHub Pages le hable a este servidor
const corsOptions = {
    origin: 'https://readmefirst-txt.github.io', // Solo permite peticiones desde tu web oficial
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json()); // Para poder recibir datos JSON en las peticiones

// Sigue sirviendo los archivos estáticos por si acaso alguien entra directo,
// pero su función principal ahora será ser un API (cerebro) en segundo plano.
app.use(express.static(path.join(__dirname)));

// === RUTAS DEL API (BACKEND) ===
// Ruta para comprobar si el servidor está despierto (útil para la carga inmersiva)
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        message: 'NODO PRINCIPAL ACTIVO. ENLACE ESTABLECIDO.'
    });
});

// (Más adelante aquí pondremos la ruta para disparar post_to_moltbook.py si lo necesitas)

// Fallback to index.html for any remaining requests
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`API Server is running on port ${PORT}`);
});
