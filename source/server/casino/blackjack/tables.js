// blackjack/tables.js — Mese de blackjack (colshapes, blips, markers)
const fs   = require('fs');
const path = require('path');
const server = require('./blackjack_server');

const savePath = path.join(process.cwd(), 'data', 'blackjack', 'blackjack_tables.json');
fs.mkdirSync(path.dirname(savePath), { recursive: true });

const tableLabels         = {};
const tableColshapes      = {};
const tableBlips          = {};
const tableLeaveColshapes = {};
const tableObjects        = {};

function getMarkerText(index, state, players, maxPlayers) {
    let statusLine;
    if (state === 'playing' || state === 'dealer_turn' || state === 'resolving') {
        statusLine = `~r~In joc`;
    } else if (state === 'betting') {
        statusLine = `~g~Se pariaza`;
    } else if (players >= server.LOBBY_CONFIG.MIN_PLAYERS) {
        statusLine = `~g~Asteapta start`;
    } else {
        statusLine = `~y~Asteapta jucatori`;
    }
    return `~g~Masa Blackjack ~w~#${index}\n${statusLine} ~w~(${players}/${maxPlayers})\n~y~Apasa ~g~E ~w~pentru a juca`;
}

const tableLastText = {};

function updateTableMarker(tableIndex, state, players, maxPlayers) {
    const old = tableLabels[tableIndex];
    if (!old) return;

    const newText = getMarkerText(tableIndex, state, players, maxPlayers);
    // Nu re-crea label-ul dacă textul e identic
    if (tableLastText[tableIndex] === newText) return;
    tableLastText[tableIndex] = newText;

    const pos = old.position;
    old.destroy();
    tableLabels[tableIndex] = mp.labels.new(
        newText,
        pos,
        { los: true, font: 4, drawDistance: 10, dimension: 0 }
    );
}

function loadBlackjackTables() {
    if (!fs.existsSync(savePath)) return;

    const tables = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    console.log(`[BLACKJACK] S-au găsit ${tables.length} mese salvate:`);

    tables.forEach((table, index) => {
        createBlip(table, index);
        createColshape(table, index, table.name, table.casinoId);
        createLeaveColshape(table, index);
        createMarker(table, index);
        if (table.spawnTable !== false) {
            spawnTableObject(table, index);
        }
        console.log(`  Masa BJ #${index}. ${table.name}: X:${table.x}, Y:${table.y}, Z:${table.z} (object: ${table.spawnTable !== false})`);
    });
}

loadBlackjackTables();

// ──────────────────────────────────────────
// Commands
// ──────────────────────────────────────────
// Folosire: /createblackjack [nume] [true/false]
// Exemplu: /createblackjack VIPTable true   — creează masa cu obiect fizic
// Exemplu: /createblackjack VIPTable false  — creează masa FĂRĂ obiect fizic
// Default: true (se spawn-ează masa verde)
mp.events.addCommand('createblackjack', (player, fullText) => {
    const args = (fullText || '').trim().split(/\s+/);
    let name = null;
    let spawnTable = true;

    // Parsăm argumentele
    if (args.length >= 2) {
        name = args[0];
        if (args[1].toLowerCase() === 'false' || args[1] === '0') spawnTable = false;
    } else if (args.length === 1 && args[0] !== '') {
        if (args[0].toLowerCase() === 'false' || args[0] === '0') {
            spawnTable = false;
        } else if (args[0].toLowerCase() === 'true' || args[0] === '1') {
            spawnTable = true;
        } else {
            name = args[0];
        }
    }

    const pos = player.position;
    const rot = player.heading;

    const newTable = {
        name:       name || `BlackjackTable_${Date.now()}`,
        x:          parseFloat(pos.x.toFixed(2)),
        y:          parseFloat(pos.y.toFixed(2)),
        z:          parseFloat((pos.z - 1.0).toFixed(2)),
        heading:    parseFloat(rot.toFixed(2)),
        casinoId:   null,
        spawnTable: spawnTable,
    };

    let tables = [];
    if (fs.existsSync(savePath)) {
        tables = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    }

    tables.push(newTable);
    fs.writeFileSync(savePath, JSON.stringify(tables, null, 4));

    const newIndex = tables.length - 1;
    createMarker(newTable, newIndex);
    createColshape(newTable, newIndex, newTable.name, newTable.casinoId);
    createLeaveColshape(newTable, newIndex);
    createBlip(newTable, newIndex);

    if (spawnTable) {
        spawnTableObject(newTable, newIndex);
        global.chatSend(player, `!{Green}[BLACKJACK] Masa "${newTable.name}" salvată cu obiect fizic la: ${newTable.x}, ${newTable.y}, ${newTable.z}`);
    } else {
        global.chatSend(player, `!{Green}[BLACKJACK] Masa "${newTable.name}" salvată FĂRĂ obiect fizic la: ${newTable.x}, ${newTable.y}, ${newTable.z}`);
    }
});

mp.events.addCommand('deleteblackjack', (player, _, idStr) => {
    const index = parseInt(idStr);
    if (isNaN(index)) {
        global.chatSend(player, '!{Red}[BLACKJACK] Folosire: /deleteblackjack <id>');
        return;
    }

    if (tableLabels[index]) { tableLabels[index].destroy(); delete tableLabels[index]; }
    if (tableColshapes[index]) { tableColshapes[index].destroy(); delete tableColshapes[index]; }
    if (tableBlips[index]) { tableBlips[index].destroy(); delete tableBlips[index]; }
    if (tableLeaveColshapes[index]) { tableLeaveColshapes[index].destroy(); delete tableLeaveColshapes[index]; }
    if (tableObjects[index]) { tableObjects[index].destroy(); delete tableObjects[index]; }

    if (fs.existsSync(savePath)) {
        const tables = JSON.parse(fs.readFileSync(savePath, 'utf8'));
        if (index < 0 || index >= tables.length) {
            global.chatSend(player, `!{Red}[BLACKJACK] Nu există masa cu ID-ul ${index}.`);
            return;
        }
        const removed = tables.splice(index, 1)[0];
        fs.writeFileSync(savePath, JSON.stringify(tables, null, 4));
        global.chatSend(player, `!{Green}[BLACKJACK] Masa #${index} "${removed.name}" a fost ștearsă.`);
        global.chatBroadcast(`!{Red}[BLACKJACK] Masa #${index} "${removed.name}" a fost eliminată de un admin.`);
    } else {
        global.chatSend(player, '!{Red}[BLACKJACK] Nu există tabele salvate.');
    }
});

// ──────────────────────────────────────────
// Events
// ──────────────────────────────────────────
mp.events.add('playerEnterColshape', (player, colshape) => {
    if (colshape.getVariable('isBlackjackTable')) {
        global.chatSend(player, '!{Orange}[BLACKJACK]!{White} Ai intrat în zona mesei. Apasă !{Green}E!{White} pentru a juca.');
        player.currentBlackjackTable = colshape;
    }
});

mp.events.add('playerExitColshape', (player, colshape) => {
    if (colshape.getVariable('isBlackjackTable')) {
        player.currentBlackjackTable = null;
    }

    if (colshape.getVariable('isBlackjackLeaveZone')) {
        const { leaveLobby, getLobbyByPlayer } = require('./blackjack_server');
        const lobby = getLobbyByPlayer(player);

        if (lobby && lobby.id === colshape.getVariable('bjTableIndex')) {
            global.chatSend(player, '!{Orange}[BLACKJACK] !{Red}Te-ai îndepărtat prea mult de masă — ai fost scos automat.');
            leaveLobby(player);
        }
    }
});

mp.events.add('Server_PlayerAction', (player, actionName) => {
    if (actionName === 'interact') {
        if (player.currentBlackjackTable) {
            const tableIndex = player.currentBlackjackTable.getVariable('bjTableIndex');
            const tableName  = player.currentBlackjackTable.getVariable('bjTableName');
            const casinoId   = player.currentBlackjackTable.getVariable('bjCasinoId');

            mp.events.call('Server_JoinBlackjackTable', player, tableIndex, tableName, casinoId);
        }
    }
});

// ──────────────────────────────────────────
// Util functions
// ──────────────────────────────────────────
function createBlip(position, index) {
    const blip = mp.blips.new(682, new mp.Vector3(position.x, position.y, position.z), {
        name: "Masa Blackjack",
        color: 5,
        shortRange: false,
        scale: 1.0
    });
    if (index !== undefined) tableBlips[index] = blip;
    return blip;
}

function createMarker(table, index) {
    const label = mp.labels.new(
        getMarkerText(index, 'waiting', 0, 6),
        new mp.Vector3(table.x, table.y, table.z + 1.1),
        { los: true, font: 4, drawDistance: 10, dimension: 0 }
    );
    tableLabels[index] = label;
    return label;
}

function createColshape(position, index, name, casinoId) {
    const colShape = mp.colshapes.newCircle(position.x, position.y, 3.0, 0);
    colShape.setVariable('isBlackjackTable', true);
    colShape.setVariable('bjTableIndex', index);
    colShape.setVariable('bjTableName', name);
    colShape.setVariable('bjCasinoId', casinoId || null);
    tableColshapes[index] = colShape;
    return colShape;
}

function createLeaveColshape(position, index) {
    const colShape = mp.colshapes.newCircle(position.x, position.y, 10.0, 0);
    colShape.setVariable('isBlackjackLeaveZone', true);
    colShape.setVariable('bjTableIndex', index);
    tableLeaveColshapes[index] = colShape;
    return colShape;
}

function spawnTableObject(table, index) {
    const obj = mp.objects.new(mp.joaat('ch_prop_casino_blackjack_01a'), new mp.Vector3(table.x, table.y, table.z), {
        rotation: new mp.Vector3(0, 0, table.heading || 0),
        dimension: 0
    });
    tableObjects[index] = obj;
    return obj;
}

mp.events.add('_blackjack_updateMarker', (tableIndex, state, players, maxPlayers) => {
    updateTableMarker(tableIndex, state, players, maxPlayers);
});

module.exports = { createBlip, createColshape, createLeaveColshape, createMarker, spawnTableObject, loadBlackjackTables };
