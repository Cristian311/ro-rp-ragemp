
const fs   = require('fs');
const path = require('path');
const server = require('./poker_server');

const savePath = path.join(process.cwd(), 'poker_tables.json');

// References by tableIndex
const tableLabels         = {};  // index → mp.TextLabel
const tableColshapes      = {};  // index → mp.Colshape
const tableBlips          = {};  // index → mp.Blip
const tableLeaveColshapes = {};  // index → mp.Colshape (leave zone, raza 10)

function getMarkerText(index, state, players, maxPlayers) {
    let statusLine;
    if (state === 'playing') {
        statusLine = `~r~In joc`;
    } else if (players >= server.LOBBY_CONFIG.MIN_PLAYERS) {
        statusLine = `~g~Asteapta start`;
    } else {
        statusLine = `~y~Asteapta jucatori`;
    }
    return `~g~Masa Poker ~w~#${index}\n${statusLine} ~w~(${players}/${maxPlayers})\n~y~Apasa ~g~E ~w~pentru a juca`;
}

function updateTableMarker(tableIndex, state, players, maxPlayers) {
    const old = tableLabels[tableIndex];
    if (!old) return;
    const pos = old.position;
    old.destroy();
    tableLabels[tableIndex] = mp.labels.new(
        getMarkerText(tableIndex, state, players, maxPlayers),
        pos,
        { los: true, font: 4, drawDistance: 10, dimension: 0 }
    );
}



// Load data on server start and create colshapes + markers
function loadPokerTables() {
    if (!fs.existsSync(savePath)) return;

    const tables = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    console.log(`[POKER] S-au găsit ${tables.length} mese salvate:`);

    tables.forEach((table, index) => {
        //createBlip(table, index);
        createColshape(table, index, table.name, table.casinoId);
        createLeaveColshape(table, index);
        createMarker(table, index);
        console.log(`  Masa #${index}. ${table.name}: X:${table.x}, Y:${table.y}, Z:${table.z}`);
    });
}

loadPokerTables();
 
//Commands

mp.events.addCommand('createpoker', (player, _, name) => {
    const pos = player.position;
    const rot = player.heading;

    mp.objects.new(mp.joaat('prop_poker_table_02'), pos, {
        rotation: new mp.Vector3(0, 0, rot),
        dimension: 0
    });

    const newTable = {
        name:    name || `PokerTable_${Date.now()}`,
        x:       parseFloat(pos.x.toFixed(2)),
        y:       parseFloat(pos.y.toFixed(2)),
        z:       parseFloat(pos.z.toFixed(2)),
        heading: parseFloat(rot.toFixed(2)),
        casinoId: null  // Setează manual ID-ul cazinoului (null = fără cazinou)
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

    player.outputChatBox(`!{Green}[POKER] Masa "${newTable.name}" salvată la: ${newTable.x}, ${newTable.y}, ${newTable.z}`);
});
mp.events.addCommand('deletepoker', (player, _, idStr) => {
    const index = parseInt(idStr);
    if (isNaN(index)) {
        player.outputChatBox('!{Red}[POKER] Folosire: /deletepoker <id>');
        return;
    }

    if (tableLabels[index]) { tableLabels[index].destroy(); delete tableLabels[index]; }

    if (tableColshapes[index]) { tableColshapes[index].destroy(); delete tableColshapes[index]; }

    if (tableBlips[index]) { tableBlips[index].destroy(); delete tableBlips[index]; }

    if (tableLeaveColshapes[index]) { tableLeaveColshapes[index].destroy(); delete tableLeaveColshapes[index]; }

    if (fs.existsSync(savePath)) {
        const tables = JSON.parse(fs.readFileSync(savePath, 'utf8'));
        if (index < 0 || index >= tables.length) {
            player.outputChatBox(`!{Red}[POKER] Nu există masa cu ID-ul ${index}.`);
            return;
        }
        const removed = tables.splice(index, 1)[0];
        fs.writeFileSync(savePath, JSON.stringify(tables, null, 4));
        player.outputChatBox(`!{Green}[POKER] Masa #${index} "${removed.name}" a fost ștearsă.`);
        mp.players.forEach(p => p.outputChatBox(`!{Red}[POKER] Masa #${index} "${removed.name}" a fost eliminată de un admin.`));
    } else {
        player.outputChatBox('!{Red}[POKER] Nu există tabele salvate.');
    }
});

//Events
mp.events.add('playerEnterColshape', (player, colshape) => {
    if (colshape.getVariable('isPokerTable')) {
        player.outputChatBox('!{Orange}[POKER]!{White} Ai intrat în zona mesei. Apasă !{Green}E!{White} pentru a juca.');
        player.currentTable = colshape;
    }
});

mp.events.add('playerExitColshape', (player, colshape) => {
    if (colshape.getVariable('isPokerTable')) {
        //player.outputChatBox('!{Yellow}[POKER]!{White} Ai părăsit zona mesei.');
        player.currentTable = null;
    }

    // Auto-leave 
    if (colshape.getVariable('isPokerLeaveZone')) {
        const { leaveLobby, getLobbyByPlayer } = require('./poker_server');
        const lobby = getLobbyByPlayer(player);

        if (lobby && lobby.id === colshape.getVariable('tableIndex')) {
            player.outputChatBox('!{Orange}[POKER] !{Red}Te-ai îndepărtat prea mult de masă — ai fost scos automat.');
            leaveLobby(player);
        }
    }
});

mp.events.add('Server_PlayerAction', (player, actionName) => {
    console.log(`[POKER] ${player.name} a acționat: ${actionName}`);

    if (actionName === 'interact') {
        if (player.currentTable) {
            const tableIndex = player.currentTable.getVariable('tableIndex');
            const tableName  = player.currentTable.getVariable('tableName');
            const casinoId   = player.currentTable.getVariable('casinoId');

            mp.events.call('Server_JoinPokerTable', player, tableIndex, tableName, casinoId);
        } else {
            player.outputChatBox('!{Red}Nu ești lângă nicio masă de poker.');
        }
    }
});

// Util

function createBlip(position, index) {
    const blip = mp.blips.new(602, new mp.Vector3(position.x, position.y, position.z), {
        name: "Masa Poker",
        color: 2,
        shortRange: false,
        scale: 1.0
    });
    if (index !== undefined) tableBlips[index] = blip;
    return blip;
}

function createMarker(table, index) {
    const label = mp.labels.new(
        getMarkerText(index, 'waiting', 0, 10),
        new mp.Vector3(table.x, table.y, table.z + 1.1),
        { los: true, font: 4, drawDistance: 10, dimension: 0 }
    );
    tableLabels[index] = label;
    return label;
}

function createColshape(position, index, name, casinoId) {
    const colShape = mp.colshapes.newCircle(position.x, position.y, 3.0, 0);
    colShape.setVariable('isPokerTable', true);
    colShape.setVariable('tableIndex', index);
    colShape.setVariable('tableName', name);
    colShape.setVariable('casinoId', casinoId || null);
    tableColshapes[index] = colShape;
    return colShape;
}

function createLeaveColshape(position, index) {
    const colShape = mp.colshapes.newCircle(position.x, position.y, 10.0, 0);
    colShape.setVariable('isPokerLeaveZone', true);
    colShape.setVariable('tableIndex', index);
    tableLeaveColshapes[index] = colShape;
    return colShape;
}

mp.events.add('_poker_updateMarker', (tableIndex, state, players, maxPlayers) => {
    updateTableMarker(tableIndex, state, players, maxPlayers);
});

// Exportăm funcțiile pentru test server
module.exports = { createBlip, createColshape, createLeaveColshape, createMarker, loadPokerTables };

