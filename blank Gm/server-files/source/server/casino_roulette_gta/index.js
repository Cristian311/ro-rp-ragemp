// ═══════════════════════════════════════════════════════════════
// CASINO ROULETTE GTA — SERVER ENTRY POINT
// Recreated from decompiled GTA V casinoroulette.c
// Registers all MP events, commands, colshape handlers
// ═══════════════════════════════════════════════════════════════

const { CONFIG }   = require('./config');
const tables       = require('./tables');
const stateMachine = require('./state_machine');
const logger       = require('./logger');

console.log('[CASINO_ROULETTE_GTA] ════════════════════════════════════════');
console.log('[CASINO_ROULETTE_GTA] Diamond Casino Roulette — GTA V Recreation');
console.log('[CASINO_ROULETTE_GTA] Max tables: ' + CONFIG.MAX_TABLES + ' | Seats per table: ' + CONFIG.SEATS_PER_TABLE);
console.log('[CASINO_ROULETTE_GTA] ════════════════════════════════════════');

// ──────────────────────────────────────────
// LOAD SAVED TABLES ON START
// ──────────────────────────────────────────
tables.loadTables();

// ──────────────────────────────────────────
// EVENTS: JOIN / LEAVE
// ──────────────────────────────────────────
mp.events.add('Server_JoinCasinoRouletteGTA', (player, tableIndex, tableName, casinoId) => {
    console.log(`[CASINO_ROULETTE_GTA] JOIN request: ${player.name} → table #${tableIndex} "${tableName}"`);
    stateMachine.joinTable(player, parseInt(tableIndex), tableName, casinoId || null);
});

mp.events.add('Server_LeaveCasinoRouletteGTA', (player) => {
    console.log(`[CASINO_ROULETTE_GTA] LEAVE request: ${player.name}`);
    stateMachine.leaveTable(player);
});

// ──────────────────────────────────────────
// EVENTS: BETTING
// ──────────────────────────────────────────
mp.events.add('Server_CasinoRouletteGTA_Bet', (player, betType, betValueJson, amount) => {
    let betValue;
    try {
        betValue = JSON.parse(betValueJson);
    } catch (e) {
        betValue = parseInt(betValueJson);
        if (isNaN(betValue)) betValue = betValueJson;
    }
    console.log(`[CASINO_ROULETTE_GTA] BET: ${player.name} → ${betType} [${JSON.stringify(betValue)}] $${amount}`);
    stateMachine.placeBet(player, betType, betValue, parseInt(amount) || 0);
});

mp.events.add('Server_CasinoRouletteGTA_ClearBets', (player) => {
    console.log(`[CASINO_ROULETTE_GTA] CLEAR_BETS: ${player.name}`);
    stateMachine.clearBets(player);
});

// ──────────────────────────────────────────
// EVENT: MONEY UPDATE
// (from func_133 — transaction system; simple version here)
// ──────────────────────────────────────────
mp.events.add('casinoRouletteGTA:updateMoney', (player, newAmount) => {
    if (!player) return;
    player.money = newAmount;
    // You can hook into your own money system here
    // e.g. mp.events.call('economy:setPlayerMoney', player, newAmount);
    console.log(`[CASINO_ROULETTE_GTA] MONEY_SET: ${player.name} → $${newAmount}`);
});

// ──────────────────────────────────────────
// COLSHAPE: ENTER / EXIT
// (from func_200 — proximity detection for table interaction)
// ──────────────────────────────────────────
mp.events.add('playerEnterColshape', (player, colshape) => {
    // Table interaction zone
    if (colshape.getVariable('isCasinoRouletteGTA')) {
        const tableIndex = colshape.getVariable('tableIndex');
        const tableName  = colshape.getVariable('tableName');
        player.outputChatBox('!{#c9a84c}[CASINO ROULETTE] !{White}Ai intrat în zona mesei. Apasă !{Green}E !{White}pentru a juca.');
        player.currentCasinoRouletteGTA = colshape;
    }
});

mp.events.add('playerExitColshape', (player, colshape) => {
    // Clear interaction reference
    if (colshape.getVariable('isCasinoRouletteGTA')) {
        if (player.currentCasinoRouletteGTA === colshape) {
            player.currentCasinoRouletteGTA = null;
        }
    }

    // Auto-leave if too far from table (leave zone)
    if (colshape.getVariable('isCasinoRouletteGTALeave')) {
        const tableIndex = colshape.getVariable('tableIndex');
        const lobby = stateMachine.getLobbyByPlayer(player);

        if (lobby && lobby.id === tableIndex) {
            player.outputChatBox('!{#c9a84c}[CASINO ROULETTE] !{Red}Te-ai îndepărtat prea mult de masă — ai fost scos automat.');
            stateMachine.leaveTable(player);
        }
    }
});

// ──────────────────────────────────────────
// EVENT: PLAYER INTERACT (E key)
// ──────────────────────────────────────────
mp.events.add('Server_PlayerAction', (player, actionName) => {
    if (actionName === 'interact') {
        if (player.currentCasinoRouletteGTA) {
            const tableIndex = player.currentCasinoRouletteGTA.getVariable('tableIndex');
            const tableName  = player.currentCasinoRouletteGTA.getVariable('tableName');
            const casinoId   = player.currentCasinoRouletteGTA.getVariable('casinoId');

            mp.events.call('Server_JoinCasinoRouletteGTA', player, tableIndex, tableName, casinoId);
        }
    }
});

// ──────────────────────────────────────────
// EVENT: PLAYER DISCONNECT
// ──────────────────────────────────────────
mp.events.add('playerQuit', (player) => {
    const lobby = stateMachine.getLobbyByPlayer(player);
    if (lobby) {
        console.log(`[CASINO_ROULETTE_GTA] DISCONNECT: ${player.name} was at table "${lobby.name}"`);
        stateMachine.leaveTable(player);
    }
});

// ──────────────────────────────────────────
// COMMANDS: TABLE MANAGEMENT
// /createcasinoroulette [name]  — create a table at player position
// /deletecasinoroulette <id>    — delete a table by index
// /casinoroulettetables         — list all tables
// ──────────────────────────────────────────
mp.events.addCommand('createcasinoroulette', (player, _, name) => {
    const tableName = name || `CasinoRoulette_${Date.now()}`;

    const result = tables.addTable(player, tableName);
    player.outputChatBox(`!{Green}[CASINO ROULETTE] Masa "${result.table.name}" creată! Index: #${result.index}`);
    player.outputChatBox(`!{White}  Poziție: ${result.table.x}, ${result.table.y}, ${result.table.z} | Heading: ${result.table.heading}`);
    console.log(`[CASINO_ROULETTE_GTA] TABLE_CREATE: "${result.table.name}" at ${result.table.x}, ${result.table.y}, ${result.table.z} by ${player.name}`);
});

mp.events.addCommand('deletecasinoroulette', (player, _, idStr) => {
    const index = parseInt(idStr);
    if (isNaN(index)) {
        player.outputChatBox('!{Red}[CASINO ROULETTE] Folosire: /deletecasinoroulette <id>');
        return;
    }

    const removed = tables.removeTable(index);
    if (removed) {
        player.outputChatBox(`!{Green}[CASINO ROULETTE] Masa #${index} "${removed.name}" a fost ștearsă.`);

        // Kick players from deleted table
        const lobby = stateMachine.lobbies[index];
        if (lobby) {
            stateMachine.broadcastToLobby(lobby, '!{Red}[CASINO ROULETTE] Masa a fost eliminată de un admin!');
            [...lobby.players].forEach(slot => stateMachine.leaveTable(slot.player));
            delete stateMachine.lobbies[index];
        }

        mp.players.forEach(p => {
            p.outputChatBox(`!{Red}[CASINO ROULETTE] Masa #${index} "${removed.name}" a fost eliminată de un admin.`);
        });
        console.log(`[CASINO_ROULETTE_GTA] TABLE_DELETE: #${index} "${removed.name}" by ${player.name}`);
    } else {
        player.outputChatBox(`!{Red}[CASINO ROULETTE] Nu există masa cu ID-ul ${index}.`);
    }
});

mp.events.addCommand('casinoroulettetables', (player) => {
    const fs   = require('fs');
    const path = require('path');
    const savePath = path.join(process.cwd(), 'casino_roulette_gta_tables.json');

    let allTables = [];
    try {
        if (fs.existsSync(savePath)) {
            allTables = JSON.parse(fs.readFileSync(savePath, 'utf8'));
        }
    } catch (e) {}

    if (allTables.length === 0) {
        player.outputChatBox('!{#c9a84c}[CASINO ROULETTE] !{White}Nu există mese create.');
        return;
    }

    player.outputChatBox('!{#c9a84c}═══ CASINO ROULETTE GTA — MESE ═══');
    allTables.forEach((table, i) => {
        const lobby = stateMachine.lobbies[i];
        const playerCount = lobby ? lobby.players.length : 0;
        const stateStr = lobby ? Object.keys(CONFIG.STATES).find(k => CONFIG.STATES[k] === lobby.state) || '?' : 'IDLE';
        player.outputChatBox(`!{White}#${i} — !{Yellow}${table.name} !{White}| ${playerCount}/${CONFIG.SEATS_PER_TABLE} | State: ${stateStr}`);
        player.outputChatBox(`!{Gray}   Pos: ${table.x}, ${table.y}, ${table.z}`);
    });
});

// ──────────────────────────────────────────
// MARKER UPDATE (internal event from state_machine)
// ──────────────────────────────────────────
mp.events.add('_casinoRouletteGTA_updateMarker', (tableIndex, state, players, maxPlayers) => {
    tables.updateTableMarker(tableIndex, state, players, maxPlayers);
});

console.log('[CASINO_ROULETTE_GTA] Server-side loaded successfully.');
