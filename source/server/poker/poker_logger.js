const fs   = require('fs');
const path = require('path');

const LOGS_DIR       = path.join(process.cwd(), 'logs/poker_logs');
const TABLES_DIR     = path.join(LOGS_DIR, 'tables');
const GAMES_DIR      = path.join(LOGS_DIR, 'games');
const SUMMARY_FILE   = path.join(LOGS_DIR, 'all_games_history.log');

[LOGS_DIR, TABLES_DIR, GAMES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ──────────────────────────────────────────
// ASYNC WRITE BUFFER 
// ──────────────────────────────────────────
const writeBuffers = {};       // filePath → string[]
let flushTimer     = null;
let isFlushing     = false;
const FLUSH_INTERVAL_MS = 2000; // flush la fiecare 2 secunde

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
                if (err) console.error(`[POKER_LOG] Eroare scriere ${fp}:`, err.message);
                resolve();
            });
        });
    });

    Promise.all(promises).then(() => { isFlushing = false; });
}

// Pornește flush-ul periodic
flushTimer = setInterval(flushAllBuffers, FLUSH_INTERVAL_MS);

// Flush la oprirea serverului
function shutdownFlush() {
    if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
    for (const [fp, lines] of Object.entries(writeBuffers)) {
        if (lines.length > 0) {
            try { fs.appendFileSync(fp, lines.join('\n') + '\n', 'utf8'); } catch (e) { /* ignore */ }
            writeBuffers[fp] = [];
        }
    }
}

// Hook la process exit
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
        if (err) console.error('[POKER_LOG] Eroare salvare counter:', err.message);
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
const activeGames = {}; // lobbyId → { gameId, actions: [], ... }

/**
 * Apelat la START GAME — începe tracking-ul unui joc nou
 */
function onGameStart(lobby) {
    const gameId = nextGameId();

    const playerList = lobby.players.map(slot => ({
        name: slot.player.name,
        seat: slot.seat,
        chips: slot.chips,
        cards: [...slot.cards],
        isBot: !!slot.player._isBot,
    }));

    activeGames[lobby.id] = {
        gameId,
        tableId:   lobby.id,
        tableName: lobby.name,
        casinoId:  lobby.casinoId || null,
        startTime: timestamp(),
        players:   playerList,
        blinds:    { small: null, big: null },
        communityCards: [],
        rounds:    { preflop: [], flop: [], turn: [], river: [] },
        currentRound: 'preflop',
        pot: 0,
        winners: [],
        endTime: null,
    };

    logToTable(lobby.id, lobby.name, `── JOC #${gameId} START ── Jucători: ${playerList.map(p => `${p.name}(seat ${p.seat + 1}, $${p.chips})`).join(', ')}`);

    return gameId;
}

/**
 * Logare blinduri
 */
function onBlinds(lobby, sbName, sbAmount, bbName, bbAmount) {
    const game = activeGames[lobby.id];
    if (!game) return;

    game.blinds = {
        small: { player: sbName, amount: sbAmount },
        big:   { player: bbName, amount: bbAmount },
    };

    logToTable(lobby.id, lobby.name, `  Blinds: SB=${sbName} ($${sbAmount}), BB=${bbName} ($${bbAmount})`);
}

/**
 * Logare cărți împărțite unui jucător
 */
function onDealCards(lobby, playerName, cards) {
    const game = activeGames[lobby.id];
    if (!game) return;

    // Sincronizează cărțile jucătorului în game log (safety net)
    const playerEntry = game.players.find(p => p.name === playerName);
    if (playerEntry) {
        playerEntry.cards = [...cards];
    }

    logToTable(lobby.id, lobby.name, `  Deal: ${playerName} → [${cards.join(' ')}]`);
}

/**
 * Logare acțiune jucător
 */
function onPlayerAction(lobby, playerName, action, amount, chipsAfter, potAfter) {
    const game = activeGames[lobby.id];
    if (!game) return;

    const actionEntry = {
        player: playerName,
        action: action,
        amount: amount || 0,
        chipsAfter: chipsAfter,
        potAfter: potAfter,
        time: timestamp(),
    };

    const round = game.currentRound || 'preflop';
    if (game.rounds[round]) {
        game.rounds[round].push(actionEntry);
    }

    const amountStr = amount > 0 ? ` $${amount}` : '';
    logToTable(lobby.id, lobby.name, `  [${round.toUpperCase()}] ${playerName}: ${action}${amountStr} | chips=$${chipsAfter} | pot=$${potAfter}`);
}

/**
 * Logare tranziție la o nouă rundă (flop/turn/river)
 */
function onNewRound(lobby, roundName, communityCards) {
    const game = activeGames[lobby.id];
    if (!game) return;

    game.currentRound = roundName;
    game.communityCards = [...communityCards];

    logToTable(lobby.id, lobby.name, `  ── ${roundName.toUpperCase()} ── Community: [${communityCards.join(' ')}]`);
}

/**
 * Logare showdown
 */
function onShowdown(lobby, showdownResults) {
    const game = activeGames[lobby.id];
    if (!game) return;

    game.communityCards = [...lobby.communityCards];

    logToTable(lobby.id, lobby.name, `  ══ SHOWDOWN ══ Community: [${lobby.communityCards.join(' ')}]`);

    showdownResults.forEach(r => {
        logToTable(lobby.id, lobby.name, `  ${r.playerName}: [${r.cards.join(' ')}] → ${r.handName} (score: ${r.score})`);
    });
}

/**
 * Logare câștigător(i) per pot
 */
function onPotWinner(lobby, potLabel, potAmount, winnerNames, handName, shareEach, rake) {
    const game = activeGames[lobby.id];
    if (!game) return;

    game.winners.push({
        pot: potLabel,
        amount: potAmount,
        winners: winnerNames,
        hand: handName,
        share: shareEach,
        rake: rake || 0,
    });

    const rakeStr = rake > 0 ? ` | Rake: $${rake}` : '';
    logToTable(lobby.id, lobby.name, `  ${potLabel} ($${potAmount}${rakeStr}) → ${winnerNames.join(', ')} (${handName}) — câte $${shareEach}`);
}

/**
 * Apelat la END ROUND/GAME — finalizează și salvează jocul în fișier
 */
function onGameEnd(lobby, totalPot) {
    const game = activeGames[lobby.id];
    if (!game) return;

    game.endTime = timestamp();
    game.pot = totalPot;

    logToTable(lobby.id, lobby.name, `── JOC #${game.gameId} END ── Pot total: $${totalPot} | Câștigător(i): ${game.winners.map(w => w.winners.join(', ')).join('; ') || 'N/A'}`);
    logToTable(lobby.id, lobby.name, '');

    // Salvează jocul complet în fișierul zilnic de istorii
    writeGameToHistory(game);

    // Salvează și în summary-ul global
    writeGameToSummary(game);

    delete activeGames[lobby.id];
}

/**
 * Logare fold win (un singur jucător rămâne)
 */
function onFoldWin(lobby, winnerName, potAmount, rake) {
    const game = activeGames[lobby.id];
    if (!game) return;

    game.winners.push({
        pot: 'Fold Win',
        amount: potAmount + (rake || 0),
        winners: [winnerName],
        hand: 'Fold Win',
        share: potAmount,
        rake: rake || 0,
    });

    const rakeStr = rake > 0 ? ` (rake: $${rake})` : '';
    logToTable(lobby.id, lobby.name, `  FOLD WIN: ${winnerName} câștigă $${potAmount}${rakeStr} (toți ceilalți au dat fold)`);
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
    text += `Pot total: $${game.pot}\n`;
    text += `${'-'.repeat(40)}\n`;

    // Jucători
    text += `JUCATORI:\n`;
    game.players.forEach(p => {
        text += `  Seat ${p.seat + 1}: ${p.name}${p.isBot ? ' [BOT]' : ''} — Chips: $${p.chips} — Mana: [${p.cards.join(' ')}]\n`;
    });

    // Blinduri
    if (game.blinds.small) {
        text += `\nBLINDS: SB=${game.blinds.small.player} ($${game.blinds.small.amount}), BB=${game.blinds.big.player} ($${game.blinds.big.amount})\n`;
    }

    // Community cards
    if (game.communityCards.length > 0) {
        text += `COMMUNITY CARDS: [${game.communityCards.join(' ')}]\n`;
    }

    // Acțiuni per rundă
    ['preflop', 'flop', 'turn', 'river'].forEach(round => {
        const actions = game.rounds[round];
        if (actions && actions.length > 0) {
            text += `\n--- ${round.toUpperCase()} ---\n`;
            actions.forEach(a => {
                const amtStr = a.amount > 0 ? ` $${a.amount}` : '';
                text += `  ${a.player}: ${a.action}${amtStr} (chips: $${a.chipsAfter}, pot: $${a.potAfter})\n`;
            });
        }
    });

    // Câștigători
    text += `\nREZULTAT:\n`;
    game.winners.forEach(w => {
        const rakeStr = w.rake > 0 ? ` (rake: $${w.rake})` : '';
        text += `  ${w.pot}: ${w.winners.join(', ')} câștigă $${w.share} fiecare — ${w.hand}${rakeStr}\n`;
    });

    text += `${sep}\n`;

    appendToFile(filePath, text);
}

// ──────────────────────────────────────────
// Summary global (one-liner per joc)
// ──────────────────────────────────────────
function writeGameToSummary(game) {
    const winnersStr = game.winners.map(w => {
        const rakeStr = w.rake > 0 ? `, rake:$${w.rake}` : '';
        return `${w.winners.join('+')} ($${w.share}, ${w.hand}${rakeStr})`;
    }).join(' | ');
    const playersStr = game.players.map(p => p.name).join(', ');
    const casinoStr = game.casinoId ? ` | Casino: ${game.casinoId}` : '';

    const line = `[${game.endTime}] JOC #${game.gameId} | Masa: "${game.tableName}" (ID:${game.tableId})${casinoStr} | Pot: $${game.pot} | Jucatori: ${playersStr} | Castigatori: ${winnersStr}`;
    appendToFile(SUMMARY_FILE, line);
}

// ──────────────────────────────────────────
// Logare join/leave per masă
// ──────────────────────────────────────────
function onPlayerJoin(tableId, tableName, playerName, playerCount, maxPlayers) {
    logToTable(tableId, tableName, `JOIN: ${playerName} s-a alăturat (${playerCount}/${maxPlayers})`);
}

function onPlayerLeave(tableId, tableName, playerName, reason) {
    logToTable(tableId, tableName, `LEAVE: ${playerName} a părăsit masa (${reason || 'manual'})`);
}

// ──────────────────────────────────────────
// Logare timeout
// ──────────────────────────────────────────
function onTimeout(lobby, playerName, autoAction) {
    const game = activeGames[lobby.id];
    if (!game) return;

    const round = game.currentRound || 'preflop';
    if (game.rounds[round]) {
        game.rounds[round].push({
            player: playerName,
            action: `${autoAction} (timeout)`,
            amount: 0,
            chipsAfter: 0,
            potAfter: lobby.pot,
            time: timestamp(),
        });
    }

    logToTable(lobby.id, lobby.name, `  [${round.toUpperCase()}] ${playerName}: TIMEOUT → ${autoAction}`);
}

// ──────────────────────────────────────────
// Exports
// ──────────────────────────────────────────
module.exports = {
    onGameStart,
    onGameEnd,
    onBlinds,
    onDealCards,
    onPlayerAction,
    onNewRound,
    onShowdown,
    onPotWinner,
    onFoldWin,
    onPlayerJoin,
    onPlayerLeave,
    onTimeout,
    logToTable,
    flushAllBuffers,  // manual flush dacă e nevoie
    shutdownFlush,    // flush sincron la shutdown
};
