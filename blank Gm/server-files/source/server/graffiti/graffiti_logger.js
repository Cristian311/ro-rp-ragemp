const fs   = require('fs');
const path = require('path');

const LOGS_DIR    = path.join(process.cwd(), 'logs/graffiti_logs');
const LOG_FILE    = path.join(LOGS_DIR, 'graffiti_history.log');

if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

function timestamp() {
    return new Date().toLocaleString('ro-RO', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function appendLog(text) {
    const line = `[${timestamp()}] ${text}\n`;
    fs.appendFile(LOG_FILE, line, 'utf8', (err) => {
        if (err) console.error('[GRAFFITI_LOG] Eroare scriere:', err.message);
    });
}

function logCreated(playerName, id, pos) {
    appendLog(`CREATED | Player: ${playerName} | ID: ${id} | Pos: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
}

function logDeleted(adminName, id, ownerName) {
    appendLog(`DELETED | Admin: ${adminName} | ID: ${id} | Owner: ${ownerName}`);
}

function logDeletedOwn(playerName, id) {
    appendLog(`DELETED_OWN | Player: ${playerName} | ID: ${id}`);
}

function logClearedAll(adminName, count) {
    appendLog(`CLEARED_ALL | Admin: ${adminName} | Count: ${count}`);
}

module.exports = { logCreated, logDeleted, logDeletedOwn, logClearedAll };
