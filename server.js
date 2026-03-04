
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mqtt = require('mqtt');
const bodyParser = require('body-parser');

// --- CẤU HÌNH ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- KALMAN FILTER CLASS ---
class KalmanFilter {
    constructor() {
        this.Q = 0.005; // Process noise covariance
        this.R = 0.8;   // Measurement noise covariance
        this.P = { x: 1, y: 1, z: 1 }; // Estimation error covariance
        this.X = { x: 0, y: 0, z: 0 }; // State
        this.initialized = false;
    }

    filter(measurement) {
        if (!this.initialized) {
            this.X = { ...measurement };
            this.initialized = true;
            return this.X;
        }

        ['x', 'y', 'z'].forEach(axis => {
            // Prediction
            const P_pred = this.P[axis] + this.Q;
            // Kalman Gain
            const K = P_pred / (P_pred + this.R);
            // Update
            this.X[axis] = this.X[axis] + K * (measurement[axis] - this.X[axis]);
            this.P[axis] = (1 - K) * P_pred;
        });

        return { ...this.X };
    }
}

// --- DỮ LIỆU BỘ NHỚ (RAM) ---
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

// --- MQTT (NHẬN KHOẢNG CÁCH) ---
const MQTT_HOST = 'ac283ced08d54c199286b8bdb567f195.s1.eu.hivemq.cloud';
const MQTT_PORT = 8883;
const MQTT_USER = 'smart_warehouse';
const MQTT_PASS = 'Thuan@06032006';

const client = mqtt.connect(`mqtts://${MQTT_HOST}`, {
    port: MQTT_PORT,
    username: MQTT_USER,
    password: MQTT_PASS,
    protocol: 'mqtts',
    rejectUnauthorized: true
});

client.on('connect', () => {
    console.log('✅ MQTT Connected');
    client.subscribe('kho_thong_minh/tags/+');
});

client.on('message', async (topic, message) => {
    try {
        const tagId = topic.split('/').pop();
        const data = JSON.parse(message.toString());
        const dists = data.distances;

        if (anchors.length < 3) return;

        const distArray = Object.keys(dists).map(idx => ({
            anchor: anchors[parseInt(idx)],
            distance: dists[idx]
        })).filter(d => d.anchor && typeof d.distance === 'number' && d.distance > 0);

        if (distArray.length < 3) return;

        const rawPos = weightedCentroidTrilateration(distArray);

        if (rawPos && isValidPosition(rawPos)) {
            if (!kalmanFilters[tagId]) {
                kalmanFilters[tagId] = new KalmanFilter();
            }

            const smoothedPos = kalmanFilters[tagId].filter(rawPos);
            const accuracy = calculateAccuracy(distArray, smoothedPos);
            
            // Chỉ cập nhật vị trí trong bộ nhớ
            tagPositions[tagId] = { ...smoothedPos, accuracy };
        }
    } catch (e) { console.error('MQTT Message Error:', e); }
});

// --- SERVER-SIDE UPDATE LOOP ---
const UPDATE_INTERVAL = 33; // ~30 FPS
setInterval(() => {
    if (Object.keys(tagPositions).length > 0) {
        io.emit('tags_update', tagPositions);
    }
}, UPDATE_INTERVAL);


// --- THUẬT TOÁN ĐỊNH VỊ (WEIGHTED CENTROID) ---
function weightedCentroidTrilateration(distArray) {
    let totalWeight = 0;
    let weightedPos = { x: 0, y: 0, z: 0 };
    let validDistances = 0;

    distArray.forEach(({ anchor, distance }) => {
        // Trọng số nghịch đảo với khoảng cách. Thêm 1 epsilon nhỏ để tránh chia cho 0.
        const weight = 1.0 / (distance + 0.001);
        
        weightedPos.x += anchor.x * weight;
        weightedPos.y += anchor.y * weight;
        weightedPos.z += anchor.z * weight;
        totalWeight += weight;
        validDistances++;
    });

    if (totalWeight === 0 || validDistances < 3) {
        return null; // Không đủ dữ liệu để tính toán
    }

    weightedPos.x /= totalWeight;
    weightedPos.y /= totalWeight;
    weightedPos.z /= totalWeight;

    return weightedPos;
}


function isValidPosition(pos) {
    if (!pos || isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) return false;
    // Tăng vùng đệm để chấp nhận vị trí hơi lệch ra ngoài
    const buffer = 2; 
    if (pos.x < -buffer || pos.x > roomConfig.length + buffer) return false;
    if (pos.y < -buffer || pos.y > roomConfig.width + buffer) return false; // Sửa lại thành width
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

const PORT = 3000;
server.listen(PORT, () => console.log(`🚀 3D Server running on http://localhost:${PORT}`));
