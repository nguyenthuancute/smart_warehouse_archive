// db.js - Simple JSON file-based database (no external DB needed)
const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, 'warehouse_db.json');

function loadDB() {
    if (!fs.existsSync(DB_PATH)) {
        const initial = {
            products: [],       // SKU catalog
            receipts: [],       // Phiếu nhập
            deliveries: [],     // Phiếu xuất
            auditLog: []        // Audit log
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
        return initial;
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { loadDB, saveDB };
