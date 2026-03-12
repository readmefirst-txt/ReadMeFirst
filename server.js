const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);

// Initialize DB structure
db.defaults({ interactionStats: {
    pageViews: {},
    logins: 0,
    clicks: 0,
    regions: {},
    devices: {},
    browsers: {},
    activeSessions: 0
}, history: [] }).write();

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
let broadcastHistory = db.get('history').value() || [];

// Interaction stats managed by LowDB
function getStatsFromDB() {
    return db.get('interactionStats').value();
}

function updateStat(path, value) {
    db.set(`interactionStats.${path}`, value).write();
}

let activeSessionsCount = 0;

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
    activeSessionsCount++;
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
        db.set('history', broadcastHistory).write();

        // Broadcast to all connected clients
        io.emit('new_broadcast', payload);
        socket.emit('admin_success', { status: "Broadcast Transmitted Successfully" });
        console.log('Broadcast sent:', payload);
    });

    socket.on('admin_reset_broadcasts', (data) => {
        if (!data.password || data.password.trim() !== 'SYS_OVERRIDE') {
            socket.emit('admin_error', { error: "ACCESS DENIED: Invalid Admin Password" });
            return;
        }
        broadcastHistory = [];
        db.set('history', []).write();
        io.emit('clear_broadcasts');
        socket.emit('admin_success', { status: "All Transmissions Reset" });
        console.log('Broadcast history cleared');
    });

    // Interaction tracking
    socket.on('interaction_event', (data) => {
        // data: { type, protocol, region, device, browser }
        const { type, protocol, region, device, browser } = data;
        let stats = db.get('interactionStats').value();

        if (type === 'page_view') {
            const current = db.get(`interactionStats.pageViews.${protocol.replace(/\./g, '_')}`).value() || 0;
            db.set(`interactionStats.pageViews.${protocol.replace(/\./g, '_')}`, current + 1).write();
        } else if (type === 'login') {
            db.update('interactionStats.logins', n => n + 1).write();
        } else if (type === 'click') {
            db.update('interactionStats.clicks', n => n + 1).write();
        }

        if (region) {
            const current = db.get(`interactionStats.regions.${region.replace(/\./g, '_')}`).value() || 0;
            db.set(`interactionStats.regions.${region.replace(/\./g, '_')}`, current + 1).write();
        }
        if (device) {
            const current = db.get(`interactionStats.devices.${device}`).value() || 0;
            db.set(`interactionStats.devices.${device}`, current + 1).write();
        }
        if (browser) {
            const current = db.get(`interactionStats.browsers.${browser}`).value() || 0;
            db.set(`interactionStats.browsers.${browser}`, current + 1).write();
        }

        // Broadcast updated stats to admins
        io.to('admin_room').emit('stats_update', getStatsSnapshot());
    });

    socket.on('admin_join', () => {
        socket.join('admin_room');
        socket.emit('stats_update', getStatsSnapshot());
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (activeSessionsCount > 0) activeSessionsCount--;
        io.to('admin_room').emit('stats_update', getStatsSnapshot());
    });
});

function getStatsSnapshot() {
    const stats = db.get('interactionStats').value();
    return {
        ...stats,
        activeSessions: activeSessionsCount
    };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
