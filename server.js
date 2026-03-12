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

// In-memory stats storage
let interactionStats = {
    pageViews: {}, // { protocol: count }
    logins: 0,
    clicks: 0,
    regions: {}, // { region: count }
    devices: {}, // { deviceType: count }
    browsers: {}, // { browserName: count }
    activeSessions: new Set()
};

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
    interactionStats.activeSessions.add(socket.id);
    io.to('admin_room').emit('stats_update', getStatsSnapshot());

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

    // Interaction tracking
    socket.on('interaction_event', (data) => {
        // data: { type, protocol, region, device, browser }
        const { type, protocol, region, device, browser } = data;

        if (type === 'page_view') {
            interactionStats.pageViews[protocol] = (interactionStats.pageViews[protocol] || 0) + 1;
        } else if (type === 'login') {
            interactionStats.logins++;
        } else if (type === 'click') {
            interactionStats.clicks++;
        }

        if (region) interactionStats.regions[region] = (interactionStats.regions[region] || 0) + 1;
        if (device) interactionStats.devices[device] = (interactionStats.devices[device] || 0) + 1;
        if (browser) interactionStats.browsers[browser] = (interactionStats.browsers[browser] || 0) + 1;

        // Broadcast updated stats to admins
        io.to('admin_room').emit('stats_update', getStatsSnapshot());
    });

    socket.on('admin_join', () => {
        socket.join('admin_room');
        socket.emit('stats_update', getStatsSnapshot());
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        interactionStats.activeSessions.delete(socket.id);
        io.to('admin_room').emit('stats_update', getStatsSnapshot());
    });
});

function getStatsSnapshot() {
    return {
        ...interactionStats,
        activeSessions: interactionStats.activeSessions.size
    };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
