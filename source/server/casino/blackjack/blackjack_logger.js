// blackjack_logger.js — Sistem de logare pentru blackjack (identic cu poker_logger)
const fs   = require('fs');
const path = require('path');

const LOGS_DIR       = path.join(process.cwd(), 'logs/blackjack_logs');
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
                if (err) console.error(`[BJ_LOG] Eroare scriere ${fp}:`, err.message);
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
    } catch (e) {
        gameCounter = 0;
    }
}

function saveCounter() {
    fs.writeFile(COUNTER_FILE, JSON.stringify({ counter: gameCounter }, null, 2), 'utf8', (err) => {
        if (err) console.error('[BJ_LOG] Eroare salvare counter:', err.message);
    });
}

loadCounter();

function nextGameId() {
    gameCounter++;
    saveCounter();
    return gameCounter;
}

// ──────────────────────────────────────────
// Fișier log per masă
// ──────────────────────────────────────────
function getTableLogPath(tableId, tableName) {
    const safeName = sanitizeName(tableName);
    return path.join(TABLES_DIR, `table_${tableId}_${safeName}.log`);
}

function logToTable(tableId, tableName, message) {
    const filePath = getTableLogPath(tableId, tableName);
    appendToFile(filePath, `[${timestamp()}] ${message}`);
}

// ──────────────────────────────────────────
// Fișier log per joc (zi)
// ──────────────────────────────────────────
function getGamesLogPath() {
    return path.join(GAMES_DIR, `games_${dateTag()}.log`);
}

// ──────────────────────────────────────────
// Tracking activ per lobby (în memorie)
// ──────────────────────────────────────────
const activeGames = {};

function onGameStart(lobby) {
    const gameId = nextGameId();

    const playerList = lobby.players.filter(p => !p._hasLeft).map(slot => ({
        name: slot.player.name,
        seat: slot.seat,
        chips: slot.chips,
        bet: slot.bet,
        isBot: !!slot.player._isBot,
    }));

    activeGames[lobby.id] = {
        gameId,
        tableId:   lobby.id,
        tableName: lobby.name,
        casinoId:  lobby.casinoId || null,
        startTime: timestamp(),
        players:   playerList,
        dealerCards: [],
        actions:   [],
        results:   [],
        endTime:   null,
    };

    logToTable(lobby.id, lobby.name, `── JOC #${gameId} START ── Jucători: ${playerList.map(p => `${p.name}(seat ${p.seat + 1}, $${p.chips}, bet: $${p.bet})`).join(', ')}`);

    return gameId;
}

function onPlayerBet(lobby, playerName, amount) {
    logToTable(lobby.id, lobby.name, `  BET: ${playerName} → $${amount}`);
}

function onDealCards(lobby, playerName, cards) {
    const game = activeGames[lobby.id];
    if (!game) return;

    logToTable(lobby.id, lobby.name, `  DEAL: ${playerName} → [${cards.join(' ')}]`);
}

function onDealerCards(lobby, cards) {
    const game = activeGames[lobby.id];
    if (!game) return;

    game.dealerCards = [...cards];
    logToTable(lobby.id, lobby.name, `  DEALER: [${cards[0]} ?]`);
}

function onPlayerAction(lobby, playerName, action, cards, handValue) {
    const game = activeGames[lobby.id];
    if (!game) return;

    game.actions.push({
        player: playerName,
        action,
        cards: [...cards],
        handValue,
        time: timestamp(),
    });

    logToTable(lobby.id, lobby.name, `  ACTION: ${playerName} → ${action.toUpperCase()} | [${cards.join(' ')}] = ${handValue}`);
}

function onDealerAction(lobby, action, cards, handValue) {
    const game = activeGames[lobby.id];
    if (!game) return;

    game.dealerCards = [...cards];
    logToTable(lobby.id, lobby.name, `  DEALER: ${action.toUpperCase()} | [${cards.join(' ')}] = ${handValue}`);
}

function onPlayerResult(lobby, playerName, outcome, cards, handValue, bet, payout) {
    const game = activeGames[lobby.id];
    if (!game) return;

    game.results.push({
        player: playerName,
        outcome,
        cards: [...cards],
        handValue,
        bet,
        payout,
    });

    logToTable(lobby.id, lobby.name, `  RESULT: ${playerName} → ${outcome.toUpperCase()} | [${cards.join(' ')}] = ${handValue} | Bet: $${bet} | Payout: $${payout}`);
}

function onTimeout(lobby, playerName, autoAction) {
    const game = activeGames[lobby.id];
    if (!game) return;

    game.actions.push({
        player: playerName,
        action: `${autoAction} (timeout)`,
        cards: [],
        handValue: 0,
        time: timestamp(),
    });

    logToTable(lobby.id, lobby.name, `  TIMEOUT: ${playerName} → ${autoAction}`);
}

function onGameEnd(lobby, results) {
    const game = activeGames[lobby.id];
    if (!game) return;

    game.endTime = timestamp();
    game.results = results || game.results;

    const resultSummary = game.results.map(r => `${r.name}: ${r.outcome} ($${r.payout})`).join(', ');
    logToTable(lobby.id, lobby.name, `── JOC #${game.gameId} END ── ${resultSummary}`);
    logToTable(lobby.id, lobby.name, '');

    writeGameToHistory(game);
    writeGameToSummary(game);

    delete activeGames[lobby.id];
}

function onPlayerJoin(tableId, tableName, playerName, playerCount, maxPlayers) {
    logToTable(tableId, tableName, `JOIN: ${playerName} s-a alăturat (${playerCount}/${maxPlayers})`);
}

function onPlayerLeave(tableId, tableName, playerName, reason) {
    logToTable(tableId, tableName, `LEAVE: ${playerName} a părăsit masa (${reason || 'manual'})`);
}

// ──────────────────────────────────────────
// Scriere joc complet în fișierul zilnic
// ──────────────────────────────────────────
function writeGameToHistory(game) {
    const filePath = getGamesLogPath();
    const sep = '═'.repeat(70);

    let text = `\n${sep}\n`;
    text += `JOC #${game.gameId} | Masa: "${game.tableName}" (ID: ${game.tableId}) | Cazinou: ${game.casinoId || 'none'}\n`;
    text += `Start: ${game.startTime} | End: ${game.endTime}\n`;
    text += `${'-'.repeat(40)}\n`;

    text += `JUCATORI:\n`;
    game.players.forEach(p => {
        text += `  Seat ${p.seat + 1}: ${p.name}${p.isBot ? ' [BOT]' : ''} — Chips: $${p.chips} — Bet: $${p.bet}\n`;
    });

    text += `\nDEALER: [${game.dealerCards.join(' ')}]\n`;

    if (game.actions.length > 0) {
        text += `\nACTIUNI:\n`;
        game.actions.forEach(a => {
            text += `  ${a.player}: ${a.action} | [${a.cards.join(' ')}] = ${a.handValue}\n`;
        });
    }

    text += `\nREZULTATE:\n`;
    game.results.forEach(r => {
        text += `  ${r.name}: ${r.outcome.toUpperCase()} | [${(r.cards || []).join(' ')}] = ${r.value || r.handValue || '?'} | Bet: $${r.bet} | Payout: $${r.payout}\n`;
    });

    text += `${sep}\n`;

    appendToFile(filePath, text);
}

function writeGameToSummary(game) {
    const resultsStr = game.results.map(r => `${r.name}: ${r.outcome}($${r.payout})`).join(' | ');
    const playersStr = game.players.map(p => p.name).join(', ');
    const casinoStr = game.casinoId ? ` | Casino: ${game.casinoId}` : '';

    const line = `[${game.endTime}] JOC #${game.gameId} | Masa: "${game.tableName}" (ID:${game.tableId})${casinoStr} | Jucatori: ${playersStr} | Rezultate: ${resultsStr}`;
    appendToFile(SUMMARY_FILE, line);
}

// ──────────────────────────────────────────
// Exports
// ──────────────────────────────────────────
module.exports = {
    onGameStart,
    onGameEnd,
    onPlayerBet,
    onDealCards,
    onDealerCards,
    onPlayerAction,
    onDealerAction,
    onPlayerResult,
    onPlayerJoin,
    onPlayerLeave,
    onTimeout,
    logToTable,
    flushAllBuffers,
    shutdownFlush,
};
