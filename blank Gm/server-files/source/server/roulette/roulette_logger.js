const fs   = require('fs');
const path = require('path');

const LOGS_DIR       = path.join(process.cwd(), 'logs/roulette_logs');
const TABLES_DIR     = path.join(LOGS_DIR, 'tables');
const GAMES_DIR      = path.join(LOGS_DIR, 'games');
const SUMMARY_FILE   = path.join(LOGS_DIR, 'all_games_history.log');

[LOGS_DIR, TABLES_DIR, GAMES_DIR].forEach(dir => {
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
                if (err) console.error(`[ROULETTE_LOG] Eroare scriere ${fp}:`, err.message);
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

function dateTag() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
function getTableLogFile(tableIndex, tableName) {
    return path.join(TABLES_DIR, `table_${tableIndex}_${sanitizeName(tableName || 'unnamed')}.log`);
}

function onPlayerJoin(tableIndex, tableName, playerName, currentPlayers, maxPlayers) {
    const line = `[${timestamp()}] JOIN: ${playerName} s-a alăturat mesei #${tableIndex} "${tableName}" (${currentPlayers}/${maxPlayers})`;
    appendToFile(getTableLogFile(tableIndex, tableName), line);
    appendToFile(SUMMARY_FILE, line);
}

function onPlayerLeave(tableIndex, tableName, playerName, reason) {
    const line = `[${timestamp()}] LEAVE: ${playerName} a părăsit masa #${tableIndex} "${tableName}" (${reason})`;
    appendToFile(getTableLogFile(tableIndex, tableName), line);
    appendToFile(SUMMARY_FILE, line);
}

function onSpinStart(lobby) {
    const gameId = nextGameId();
    lobby._gameId = gameId;
    const playerNames = lobby.players.map(p => p.player.name).join(', ');
    const line = `[${timestamp()}] ══ GAME #${gameId} START ══ Masa "${lobby.name}" | Jucători: ${playerNames}`;
    appendToFile(getTableLogFile(lobby.id, lobby.name), line);
    appendToFile(SUMMARY_FILE, line);
}

function onBetsPlaced(lobby) {
    lobby.players.forEach(slot => {
        if (slot.bets && slot.bets.length > 0) {
            const betsStr = slot.bets.map(b => `${b.type}(${b.numbers ? b.numbers.join(',') : ''})=$${b.amount}`).join(', ');
            const line = `[${timestamp()}] BETS: ${slot.player.name} → ${betsStr} | Total: $${slot.totalBet}`;
            appendToFile(getTableLogFile(lobby.id, lobby.name), line);
        }
    });
}

function onSpinResult(lobby, result) {
    const line = `[${timestamp()}] SPIN: Numărul câștigător = ${result.number} (${result.color}) | Masa "${lobby.name}"`;
    appendToFile(getTableLogFile(lobby.id, lobby.name), line);
    appendToFile(SUMMARY_FILE, line);
}

function onPlayerWin(lobby, playerName, totalWin, totalBet) {
    const line = `[${timestamp()}] WIN: ${playerName} a câștigat $${totalWin} (pariu: $${totalBet}) | Masa "${lobby.name}"`;
    appendToFile(getTableLogFile(lobby.id, lobby.name), line);
    appendToFile(SUMMARY_FILE, line);
}

function onPlayerLose(lobby, playerName, totalBet) {
    const line = `[${timestamp()}] LOSE: ${playerName} a pierdut $${totalBet} | Masa "${lobby.name}"`;
    appendToFile(getTableLogFile(lobby.id, lobby.name), line);
}

function onGameEnd(lobby, totalHouseProfit) {
    const line = `[${timestamp()}] ══ GAME #${lobby._gameId || '?'} END ══ Masa "${lobby.name}" | Profit casă: $${totalHouseProfit}`;
    appendToFile(getTableLogFile(lobby.id, lobby.name), line);
    appendToFile(SUMMARY_FILE, line);
}

module.exports = {
    onPlayerJoin,
    onPlayerLeave,
    onSpinStart,
    onBetsPlaced,
    onSpinResult,
    onPlayerWin,
    onPlayerLose,
    onGameEnd,
};
