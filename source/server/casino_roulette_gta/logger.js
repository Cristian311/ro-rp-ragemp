// ═══════════════════════════════════════════════════════════════
// CASINO ROULETTE GTA — LOGGER
// Recreated from decompiled casinoroulette.c stat tracking
// func_152 — stat persistence, func_133 — transaction tracking
// ═══════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

const LOGS_DIR       = path.join(process.cwd(), 'casino_roulette_gta_logs');
const TABLES_DIR     = path.join(LOGS_DIR, 'tables');
const GAMES_DIR      = path.join(LOGS_DIR, 'games');
const SUMMARY_FILE   = path.join(LOGS_DIR, 'all_games_history.log');
const STATS_FILE     = path.join(LOGS_DIR, 'stats.json');

[LOGS_DIR, TABLES_DIR, GAMES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ──────────────────────────────────────────
// ASYNC WRITE BUFFER (performance optimization)
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
                if (err) console.error(`[CASINO_ROULETTE_GTA_LOG] Write error ${fp}:`, err.message);
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
// HELPERS
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
// Game ID Counter (persistent)
// (from func_152 — stat persistence logic)
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
    try { fs.writeFileSync(COUNTER_FILE, JSON.stringify({ counter: gameCounter })); } catch (e) {}
    return gameCounter;
}

// ──────────────────────────────────────────
// GLOBAL STATS (from func_152 — stat tracking)
// Tracks total house profit, total bets, etc.
// ──────────────────────────────────────────
let globalStats = {
    totalGames: 0,
    totalBets: 0,
    totalWagered: 0,
    totalPaidOut: 0,
    totalHouseProfit: 0,
    numberFrequency: {},
};

function loadStats() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            globalStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        }
    } catch (e) {}
}
loadStats();

function saveStats() {
    try { fs.writeFileSync(STATS_FILE, JSON.stringify(globalStats, null, 2)); } catch (e) {}
}

function updateStats(winningNumber, totalWagered, totalPaidOut) {
    globalStats.totalGames++;
    globalStats.totalWagered += totalWagered;
    globalStats.totalPaidOut += totalPaidOut;
    globalStats.totalHouseProfit += (totalWagered - totalPaidOut);

    if (!globalStats.numberFrequency[winningNumber]) {
        globalStats.numberFrequency[winningNumber] = 0;
    }
    globalStats.numberFrequency[winningNumber]++;

    saveStats();
}

// ──────────────────────────────────────────
// LOGGING FUNCTIONS
// ──────────────────────────────────────────
function getTableLogFile(tableIndex, tableName) {
    return path.join(TABLES_DIR, `table_${tableIndex}_${sanitizeName(tableName || 'unnamed')}.log`);
}

function onPlayerJoin(tableIndex, tableName, playerName, currentPlayers, maxPlayers) {
    const line = `[${timestamp()}] JOIN: ${playerName} joined table #${tableIndex} "${tableName}" (${currentPlayers}/${maxPlayers})`;
    appendToFile(getTableLogFile(tableIndex, tableName), line);
    appendToFile(SUMMARY_FILE, line);
}

function onPlayerLeave(tableIndex, tableName, playerName, state) {
    const line = `[${timestamp()}] LEAVE: ${playerName} left table #${tableIndex} "${tableName}" (state: ${state})`;
    appendToFile(getTableLogFile(tableIndex, tableName), line);
    appendToFile(SUMMARY_FILE, line);
}

function onSpinStart(lobby) {
    const gameId = nextGameId();
    lobby._gameId = gameId;
    const playerNames = lobby.players.map(p => p.player.name).join(', ');
    const line = `[${timestamp()}] ══ GAME #${gameId} START ══ Table "${lobby.name}" | Round ${lobby.roundNumber} | Players: ${playerNames}`;
    appendToFile(getTableLogFile(lobby.id, lobby.name), line);
    appendToFile(SUMMARY_FILE, line);
}

function onBetsPlaced(lobby) {
    let totalWagered = 0;
    lobby.players.forEach(slot => {
        totalWagered += slot.totalBet;
        if (slot.bets && slot.bets.length > 0) {
            const betsStr = slot.bets.map(b => `${b.type}(${b.numbers ? b.numbers.join(',') : ''})=$${b.amount}`).join(', ');
            const line = `[${timestamp()}] BETS: ${slot.player.name} → ${betsStr} | Total: $${slot.totalBet}`;
            appendToFile(getTableLogFile(lobby.id, lobby.name), line);
        }
    });
    globalStats.totalBets += lobby.players.reduce((sum, s) => sum + s.bets.length, 0);
}

function onSpinResult(lobby, result) {
    const line = `[${timestamp()}] SPIN: Winning number = ${result.number} (${result.color}) | Table "${lobby.name}"`;
    appendToFile(getTableLogFile(lobby.id, lobby.name), line);
    appendToFile(SUMMARY_FILE, line);
}

function onPlayerWin(lobby, playerName, totalWin, totalBet) {
    const line = `[${timestamp()}] WIN: ${playerName} won $${totalWin} (bet: $${totalBet}) | Table "${lobby.name}"`;
    appendToFile(getTableLogFile(lobby.id, lobby.name), line);
    appendToFile(SUMMARY_FILE, line);
}

function onPlayerLose(lobby, playerName, totalBet) {
    const line = `[${timestamp()}] LOSE: ${playerName} lost $${totalBet} | Table "${lobby.name}"`;
    appendToFile(getTableLogFile(lobby.id, lobby.name), line);
}

function onGameEnd(lobby, totalHouseProfit) {
    const totalWagered = lobby.players.reduce((sum, s) => sum + s.totalBet, 0);
    const totalPaidOut = totalWagered - totalHouseProfit;

    const line = `[${timestamp()}] ══ GAME #${lobby._gameId || '?'} END ══ Table "${lobby.name}" | House profit: $${totalHouseProfit} | Wagered: $${totalWagered}`;
    appendToFile(getTableLogFile(lobby.id, lobby.name), line);
    appendToFile(SUMMARY_FILE, line);

    updateStats(lobby.lastResult ? lobby.lastResult.number : -1, totalWagered, totalPaidOut > 0 ? totalPaidOut : 0);
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
    globalStats,
};
