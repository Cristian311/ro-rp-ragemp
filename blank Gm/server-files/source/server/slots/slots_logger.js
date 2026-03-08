const fs   = require('fs');
const path = require('path');

const LOGS_DIR       = path.join(process.cwd(), 'slots_logs');
const MACHINES_DIR   = path.join(LOGS_DIR, 'machines');
const GAMES_DIR      = path.join(LOGS_DIR, 'games');
const SUMMARY_FILE   = path.join(LOGS_DIR, 'all_games_history.log');

[LOGS_DIR, MACHINES_DIR, GAMES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ──────────────────────────────────────────
// ASYNC WRITE BUFFER
// ──────────────────────────────────────────
const writeBuffers = {};
let flushTimer     = null;
let isFlushing     = false;
const FLUSH_INTERVAL_MS = 2000;

function queueWrite(filePath, text) {
    if (!writeBuffers[filePath]) writeBuffers[filePath] = [];
    writeBuffers[filePath].push(text);
}

function flushAllBuffers() {
    if (isFlushing) return;
    isFlushing = true;

    const entries = Object.entries(writeBuffers);
    if (entries.length === 0) { isFlushing = false; return; }

    const toWrite = {};
    for (const [fp, lines] of entries) {
        if (lines.length > 0) {
            toWrite[fp] = lines.join('\n') + '\n';
            writeBuffers[fp] = [];
        }
    }

    const promises = Object.entries(toWrite).map(([fp, content]) => {
        return new Promise((resolve) => {
            fs.appendFile(fp, content, 'utf8', (err) => {
                if (err) console.error(`[SLOTS_LOG] Eroare scriere ${fp}:`, err.message);
                resolve();
            });
        });
    });

    Promise.all(promises).then(() => { isFlushing = false; });
}

flushTimer = setInterval(flushAllBuffers, FLUSH_INTERVAL_MS);

function shutdownFlush() {
    if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
    for (const [fp, lines] of Object.entries(writeBuffers)) {
        if (lines.length > 0) {
            try { fs.appendFileSync(fp, lines.join('\n') + '\n', 'utf8'); } catch (e) { /* ignore */ }
            writeBuffers[fp] = [];
        }
    }
}

process.on('exit', shutdownFlush);
process.on('SIGINT',  () => { shutdownFlush(); process.exit(); });
process.on('SIGTERM', () => { shutdownFlush(); process.exit(); });

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────
function timestamp() {
    return new Date().toLocaleString('ro-RO', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function appendToFile(filePath, text) {
    queueWrite(filePath, text);
}

// ──────────────────────────────────────────
// Counter pt Game IDs (persistent)
// ──────────────────────────────────────────
const COUNTER_FILE = path.join(LOGS_DIR, 'game_counter.json');
let gameCounter = 0;

function loadCounter() {
    try {
        if (fs.existsSync(COUNTER_FILE)) {
            const data = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
            gameCounter = data.counter || 0;
        }
    } catch (e) { gameCounter = 0; }
}
loadCounter();

function nextGameId() {
    gameCounter++;
    try { fs.writeFileSync(COUNTER_FILE, JSON.stringify({ counter: gameCounter })); } catch (e) { /* ignore */ }
    return gameCounter;
}

// ──────────────────────────────────────────
// Logging functions
// ──────────────────────────────────────────
function getMachineLogFile(machineIndex, machineName) {
    return path.join(MACHINES_DIR, `machine_${machineIndex}_${sanitizeName(machineName || 'unnamed')}.log`);
}

function onPlayerJoin(machineIndex, machineName, playerName) {
    const line = `[${timestamp()}] JOIN: ${playerName} s-a așezat la aparatul #${machineIndex} "${machineName}"`;
    appendToFile(getMachineLogFile(machineIndex, machineName), line);
    appendToFile(SUMMARY_FILE, line);
}

function onPlayerLeave(machineIndex, machineName, playerName) {
    const line = `[${timestamp()}] LEAVE: ${playerName} a părăsit aparatul #${machineIndex} "${machineName}"`;
    appendToFile(getMachineLogFile(machineIndex, machineName), line);
    appendToFile(SUMMARY_FILE, line);
}

function onSpin(machineIndex, machineName, playerName, betPerLine, lines, totalBet) {
    const gameId = nextGameId();
    const line = `[${timestamp()}] SPIN #${gameId}: ${playerName} | Pariu: $${betPerLine} x ${lines} linii = $${totalBet} | Aparat "${machineName}"`;
    appendToFile(getMachineLogFile(machineIndex, machineName), line);
    appendToFile(SUMMARY_FILE, line);
    return gameId;
}

function onSpinResult(machineIndex, machineName, playerName, gameId, grid, totalWin, freeSpins) {
    const gridStr = grid.map(row => row.join(',')).join(' | ');
    const line = `[${timestamp()}] RESULT #${gameId}: ${playerName} → [${gridStr}] | Câștig: $${totalWin}${freeSpins > 0 ? ` + ${freeSpins} FREE SPINS` : ''} | Aparat "${machineName}"`;
    appendToFile(getMachineLogFile(machineIndex, machineName), line);
    appendToFile(SUMMARY_FILE, line);
}

function onGamble(machineIndex, machineName, playerName, amount, won, newBalance) {
    const line = `[${timestamp()}] GAMBLE: ${playerName} → $${amount} → ${won ? 'CÂȘTIG' : 'PIERDERE'} | Balanță: $${newBalance} | Aparat "${machineName}"`;
    appendToFile(getMachineLogFile(machineIndex, machineName), line);
    appendToFile(SUMMARY_FILE, line);
}

module.exports = {
    onPlayerJoin,
    onPlayerLeave,
    onSpin,
    onSpinResult,
    onGamble,
};
