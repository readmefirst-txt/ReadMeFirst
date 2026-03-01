const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configuración CORS estricta para GitHub Pages y la propia consola de SysAdmin
const allowedOrigins = ['https://readmefirst-txt.github.io', 'https://readmefirst-server.onrender.com', 'http://localhost:3000'];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST']
};
app.use(cors(corsOptions));
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Socket.io con configuración CORS
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    }
});

// In-memory array to store the last 10 broadcasts (temporary DB until Supabase/Postgres)
let broadcastHistory = [];

// Rutas de estado y chequeo (Health & UI wake-up)
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        message: 'NODO PRINCIPAL ACTIVO. ENLACE ESTABLECIDO.'
    });
});

// Socket.io connection logic
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Send history to newly connected users so they see past messages
    socket.emit('history', broadcastHistory);

    // Listen for admin broadcasts
    socket.on('admin_broadcast', (data) => {
        // data expects: { message: "the text", protocol: "all", password: "SYS_OVERRIDE" }

        if (!data.password || data.password.trim() !== 'SYS_OVERRIDE') {
            socket.emit('admin_error', { error: "ACCESS DENIED: Invalid Admin Password" });
            console.log('Failed broadcast attempt:', socket.id);
            return;
        }

        const timestamp = new Date().toISOString();
        const payload = {
            message: data.message,
            protocol: data.protocol,
            timestamp: timestamp
        };

        // Save to history (keep only the last 20 messages)
        broadcastHistory.push(payload);
        if (broadcastHistory.length > 20) broadcastHistory.shift();

        // Broadcast to all connected clients
        io.emit('new_broadcast', payload);
        socket.emit('admin_success', { status: "Broadcast Transmitted Successfully" });
        console.log('Broadcast sent:', payload);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
