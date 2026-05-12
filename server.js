require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mqtt = require('mqtt');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');

// --- CẤU HÌNH SERVER ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'smart_warehouse_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// Middleware bảo vệ route
function requireLogin(req, res, next) {
    if (req.session && req.session.user) return next();
    res.status(401).json({ error: 'Chưa đăng nhập' });
}
function requireAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'admin') return next();
    res.status(403).json({ error: 'Không có quyền truy cập' });
}

app.use(express.static(path.join(__dirname, 'public')));

// Route gốc
app.get('/', (req, res) => {
    if (req.session && req.session.user) return res.redirect('/index.html');
    res.redirect('/login.html');
});

// --- DATABASE KHO (TÍCH HỢP TRỰC TIẾP) ---
const dbFile = path.join(__dirname, 'db.json');

function loadDB() {
    try {
        if (fs.existsSync(dbFile)) {
            const data = fs.readFileSync(dbFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error("⚠️ Lỗi đọc file DB, tạo DB mới:", err);
    }
    return { products: [], receipts: [], deliveries: [], auditLog: [], users: [] };
}

// Hàm ghi dữ liệu vào file
function saveDB(dbData) {
    try {
        fs.writeFileSync(dbFile, JSON.stringify(dbData, null, 2), 'utf8');
    } catch (err) {
        console.error("⚠️ Lỗi lưu file DB:", err);
    }
}

let db = loadDB();
if (!db.users) db.users = [];

function addAudit(user, action, entity, data) {
    db.auditLog.push({ timestamp: new Date().toISOString(), user, action, entity, data });
    saveDB(db);
}

// Tạo tài khoản admin mặc định nếu chưa có
(async () => {
    if (!db.users.find(u => u.role === 'admin')) {
        const hashed = await bcrypt.hash('admin123', 10);
        db.users.push({ id: 'U-default', username: 'admin', password: hashed, role: 'admin', createdAt: new Date().toISOString() });
        saveDB(db);
        console.log('✅ Tạo tài khoản admin mặc định: admin / admin123');
    }
})();

// --- API AUTH ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin' });
        if (!['admin', 'customer'].includes(role)) return res.status(400).json({ error: 'Role không hợp lệ' });
        if (db.users.find(u => u.username === username)) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
        const hashed = await bcrypt.hash(password, 10);
        const user = { id: 'U-' + Date.now(), username, password: hashed, role, createdAt: new Date().toISOString() };
        db.users.push(user);
        saveDB(db);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = db.users.find(u => u.username === username);
        if (!user) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
        req.session.user = { id: user.id, username: user.username, role: user.role };
        res.json({ success: true, role: user.role });
    } catch (e) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
    if (req.session && req.session.user) return res.json(req.session.user);
    res.status(401).json({ error: 'Chưa đăng nhập' });
});

// --- KALMAN FILTER CLASS ---
class KalmanFilter {
    constructor({ Q = {x: 0.005, y: 0.005, z: 0.005}, R = {x: 0.8, y: 0.8, z: 0.8} } = {}) {
        this.Q = Q;
        this.R = R;
        this.P = { x: 1, y: 1, z: 1 };
        this.X = { x: 0, y: 0, z: 0 };
        this.initialized = false;
    }

    filter(measurement) {
        if (!this.initialized) {
            this.X = { ...measurement };
            this.initialized = true;
            return this.X;
        }

        ['x', 'y', 'z'].forEach(axis => {
            if (measurement[axis] === undefined || isNaN(measurement[axis])) return;
            const P_pred = this.P[axis] + this.Q[axis];
            const K = P_pred / (P_pred + this.R[axis]);
            this.X[axis] = this.X[axis] + K * (measurement[axis] - this.X[axis]);
            this.P[axis] = (1 - K) * P_pred;
        });

        return { ...this.X };
    }
}

// --- DỮ LIỆU BỘ NHỚ (3D Positioning) ---
let anchors = [];
let tagPositions = {};
let kalmanFilters = {};
let roomConfig = { length: 10, width: 8, height: 4 };

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    console.log('🔌 Client connected');
    socket.emit('room_config_update', roomConfig);
    socket.emit('anchors_updated', anchors);

    socket.on('update_room_config', (config) => {
        roomConfig = config;
        io.emit('room_config_update', roomConfig);
    });

    socket.on('set_anchors', (newAnchors) => {
        anchors = newAnchors;
        console.log("📡 Updated Anchors:", anchors);
        io.emit('anchors_updated', anchors);
    });
});

// --- MQTT ---
const MQTT_HOST = '127.0.0.1';
const MQTT_PORT = 1883;

const client = mqtt.connect(`mqtt://${MQTT_HOST}`, {
    port: MQTT_PORT
});

client.on('connect', () => {
    console.log('✅ MQTT Connected');
    client.subscribe('kho_thong_minh/tags/+');
});

client.on('error', (err) => {
    console.log('⚠️ MQTT Connection Error (Bỏ qua nếu bạn không chạy Broker trên Render):', err.message);
});

client.on('message', async (topic, message) => {
    try {
        const tagId = topic.split('/').pop();
        const data = JSON.parse(message.toString());
        const dists = data.distances;

        if (anchors.length < 4) return;

        const distArray = Object.keys(dists).map(idx => ({
            anchor: anchors[parseInt(idx)],
            distance: dists[idx]
        })).filter(d => d.anchor && typeof d.distance === 'number' && d.distance > 0);

        if (distArray.length < 4) return;

        const rawPos = multilateration(distArray);

        if (rawPos && isValidPosition(rawPos)) {
            if (!kalmanFilters[tagId]) {
                kalmanFilters[tagId] = new KalmanFilter({
                    Q: { x: 0.005, y: 0.005, z: 0.002 },
                    R: { x: 0.8, y: 0.8, z: 1.0 }
                });
            }
            const smoothedPos = kalmanFilters[tagId].filter(rawPos);
            const accuracy = calculateAccuracy(distArray, smoothedPos);
            tagPositions[tagId] = { ...smoothedPos, accuracy };
        }
    } catch (e) { console.error('MQTT Message Error:', e); }
});

// --- SERVER-SIDE UPDATE LOOP (3D) ---
const UPDATE_INTERVAL = 33; // ~30 FPS
setInterval(() => {
    if (Object.keys(tagPositions).length > 0) {
        io.emit('tags_update', tagPositions);
    }
}, UPDATE_INTERVAL);


// --- API QUẢN LÝ KHO HÀNG ---
app.get('/api/stats', requireLogin, (req, res) => {
    const totalProducts = db.products.length;
    const totalValue = db.products.reduce((sum, p) => sum + (p.price * p.quantity), 0);
    const lowStockCount = db.products.filter(p => p.minQuantity > 0 && p.quantity <= p.minQuantity).length;
    res.json({ totalProducts, totalValue, lowStockCount });
});

app.get('/api/products', requireLogin, (req, res) => res.json(db.products));
app.post('/api/products', requireAdmin, (req, res) => {
    const product = { id: 'SKU-' + Date.now(), ...req.body };
    db.products.push(product);
    addAudit('Admin', 'CREATE', 'product', product);
    saveDB(db);
    io.emit('products_updated', db.products);
    res.json(product);
});

app.get('/api/receipts', requireLogin, (req, res) => res.json(db.receipts));
app.post('/api/receipts', requireAdmin, (req, res) => {
    const receipt = { id: 'PN-' + Date.now(), createdAt: new Date().toISOString(), ...req.body };
    let total = 0;
    receipt.items.forEach(item => {
        total += item.quantity * item.price;
        const p = db.products.find(x => x.id === item.productId);
        if (p) p.quantity += item.quantity;
    });
    receipt.total = total;
    db.receipts.push(receipt);
    addAudit('Admin', 'IMPORT', 'receipt', receipt);
    saveDB(db);
    io.emit('products_updated', db.products);
    res.json(receipt);
});

app.get('/api/deliveries', requireLogin, (req, res) => res.json(db.deliveries));
app.post('/api/deliveries', requireAdmin, (req, res) => {
    const delivery = { id: 'PX-' + Date.now(), createdAt: new Date().toISOString(), ...req.body };
    let total = 0;
    delivery.items.forEach(item => {
        total += item.quantity * item.price;
        const p = db.products.find(x => x.id === item.productId);
        if (p) p.quantity = Math.max(0, p.quantity - item.quantity);
    });
    delivery.total = total;
    db.deliveries.push(delivery);
    addAudit('Admin', 'EXPORT', 'delivery', delivery);
    saveDB(db);
    io.emit('products_updated', db.products);
    res.json(delivery);
});

app.get('/api/audit', requireAdmin, (req, res) => res.json(db.auditLog));


// --- MATRIX & THUẬT TOÁN HELPER FUNCTIONS ---
function mat_transpose(matrix) {
    if (!matrix || matrix.length === 0) return [];
    return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
}

function mat_multiply(A, B) {
    if (B.every(el => typeof el === 'number')) {
        if (A[0].length !== B.length) throw new Error("Matrix dimensions are not compatible for multiplication.");
        let result = new Array(A.length).fill(0);
        for (let i = 0; i < A.length; i++) {
            for (let j = 0; j < B.length; j++) {
                result[i] += A[i][j] * B[j];
            }
        }
        return result;
    }
    if (A[0].length !== B.length) throw new Error("Matrix dimensions are not compatible for multiplication.");
    let result = new Array(A.length).fill(0).map(() => new Array(B[0].length).fill(0));
    for (let i = 0; i < A.length; i++) {
        for (let j = 0; j < B[0].length; j++) {
            for (let k = 0; k < A[0].length; k++) {
                result[i][j] += A[i][k] * B[k][j];
            }
        }
    }
    return result;
}

function mat_invert_3x3(m) {
    const [[a, b, c], [d, e, f], [g, h, i]] = m;
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (det === 0) return null;
    const invDet = 1.0 / det;
    const result = [
        [(e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet],
        [(f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet],
        [(d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet]
    ];
    return result;
}

function multilateration(distArray, { iterations = 20, learningRate = 0.01 } = {}) {
    const initialGuess = multilateration_linear(distArray);
    if (!initialGuess) return null;

    let currentPosition = { ...initialGuess };

    for (let iter = 0; iter < iterations; iter++) {
        let gradient = { x: 0, y: 0, z: 0 };
        for (const item of distArray) {
            const { anchor, distance } = item;
            const calculatedDist = Math.sqrt(
                (currentPosition.x - anchor.x) ** 2 +
                (currentPosition.y - anchor.y) ** 2 +
                (currentPosition.z - anchor.z) ** 2
            );

            if (calculatedDist < 1e-6) continue;

            const commonFactor = 2 * (1 - distance / calculatedDist);
            gradient.x += commonFactor * (currentPosition.x - anchor.x);
            gradient.y += commonFactor * (currentPosition.y - anchor.y);
            gradient.z += commonFactor * (currentPosition.z - anchor.z);
        }

        currentPosition.x -= learningRate * gradient.x;
        currentPosition.y -= learningRate * gradient.y;
        currentPosition.z -= learningRate * gradient.z;
    }

    return currentPosition;
}

function multilateration_linear(distArray) {
    if (distArray.length < 4) return null;

    const refAnchor = distArray[distArray.length - 1].anchor;
    const refDist = distArray[distArray.length - 1].distance;
    const refAnchorSq = refAnchor.x ** 2 + refAnchor.y ** 2 + refAnchor.z ** 2;

    const A = [];
    const b = [];

    for (let i = 0; i < distArray.length - 1; i++) {
        const anchor = distArray[i].anchor;
        const dist = distArray[i].distance;

        A.push([
            2 * (refAnchor.x - anchor.x),
            2 * (refAnchor.y - anchor.y),
            2 * (refAnchor.z - anchor.z)
        ]);
        
        const anchorSq = anchor.x ** 2 + anchor.y ** 2 + anchor.z ** 2;
        b.push(dist ** 2 - refDist ** 2 - anchorSq + refAnchorSq);
    }

    try {
        const A_T = mat_transpose(A);
        const A_T_A = mat_multiply(A_T, A);
        const A_T_A_inv = mat_invert_3x3(A_T_A);

        if (!A_T_A_inv) return null;

        const A_T_b = mat_multiply(A_T, b);
        const pos = mat_multiply(A_T_A_inv, A_T_b);
        
        return { x: pos[0], y: pos[1], z: pos[2] };
    } catch (e) {
        return null;
    }
}

function isValidPosition(pos) {
    if (!pos || isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) return false;
    const buffer = 5;
    if (pos.x < -buffer || pos.x > roomConfig.length + buffer) return false;
    if (pos.y < -buffer || pos.y > roomConfig.width + buffer) return false;
    if (pos.z < -buffer || pos.z > roomConfig.height + buffer) return false;
    return true;
}

function calculateAccuracy(distArray, pos) {
    if (!pos) return 99;
    let totalError = 0;
    distArray.forEach(({ anchor, distance }) => {
        const calculatedDist = Math.sqrt(
            Math.pow(pos.x - anchor.x, 2) +
            Math.pow(pos.y - anchor.y, 2) +
            Math.pow(pos.z - anchor.z, 2)
        );
        totalError += Math.abs(calculatedDist - distance);
    });
    return totalError / distArray.length;
}

// --- KHỞI ĐỘNG SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🔥 Smart Warehouse & 3D Server đang chạy tại port: ${PORT}`);
});
