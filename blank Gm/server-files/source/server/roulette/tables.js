
const fs   = require('fs');
const path = require('path');
const server = require('./roulette_server');

const savePath = path.join(process.cwd(), 'roulette_tables.json');

// References by tableIndex
const tableLabels         = {};
const tableColshapes      = {};
const tableBlips          = {};
const tableLeaveColshapes = {};

function getMarkerText(index, state, players, maxPlayers) {
    let statusLine;
    if (state === 'spinning' || state === 'result') {
        statusLine = `~r~Bila se invarte`;
    } else if (state === 'betting') {
        statusLine = `~g~Se accepta pariuri`;
    } else {
        statusLine = `~y~Asteapta jucatori`;
    }
    return `~g~Masa Ruleta ~w~#${index}\n${statusLine} ~w~(${players}/${maxPlayers})\n~y~Apasa ~g~E ~w~pentru a juca`;
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

// Load data on server start
function loadRouletteTables() {
    if (!fs.existsSync(savePath)) return;

    const tables = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    console.log(`[RULETĂ] S-au găsit ${tables.length} mese salvate:`);

    tables.forEach((table, index) => {
        createColshape(table, index, table.name, table.casinoId);
        createLeaveColshape(table, index);
        createMarker(table, index);
        const pos = new mp.Vector3(table.x, table.y, table.z);
        createBlip(pos, index);
        createProp(pos, table.heading);
        console.log(`  Masa #${index}. ${table.name}: X:${table.x}, Y:${table.y}, Z:${table.z}`);
    });
}

loadRouletteTables();

// Commands
mp.events.addCommand('createroulette', (player, _, name) => {
    const pos = player.position;
    const rot = player.heading;

    mp.objects.new(mp.joaat('prop_roulette_01'), pos, {
        rotation: new mp.Vector3(0, 0, rot),
        dimension: 0
    });

    const newTable = {
        name:     name || `RouletteTable_${Date.now()}`,
        x:        parseFloat(pos.x.toFixed(2)),
        y:        parseFloat(pos.y.toFixed(2)),
        z:        parseFloat(pos.z.toFixed(2) - 1.0), // Adjust for marker height
        heading:  parseFloat(rot.toFixed(2)),
        casinoId: null
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

    player.outputChatBox(`!{Green}[RULETĂ] Masa "${newTable.name}" salvată la: ${newTable.x}, ${newTable.y}, ${newTable.z}`);
});

mp.events.addCommand('deleteroulette', (player, _, idStr) => {
    const index = parseInt(idStr);
    if (isNaN(index)) {
        player.outputChatBox('!{Red}[RULETĂ] Folosire: /deleteroulette <id>');
        return;
    }

    if (tableLabels[index]) { tableLabels[index].destroy(); delete tableLabels[index]; }
    if (tableColshapes[index]) { tableColshapes[index].destroy(); delete tableColshapes[index]; }
    if (tableBlips[index]) { tableBlips[index].destroy(); delete tableBlips[index]; }
    if (tableLeaveColshapes[index]) { tableLeaveColshapes[index].destroy(); delete tableLeaveColshapes[index]; }

    if (fs.existsSync(savePath)) {
        const tables = JSON.parse(fs.readFileSync(savePath, 'utf8'));
        if (index < 0 || index >= tables.length) {
            player.outputChatBox(`!{Red}[RULETĂ] Nu există masa cu ID-ul ${index}.`);
            return;
        }
        const removed = tables.splice(index, 1)[0];
        fs.writeFileSync(savePath, JSON.stringify(tables, null, 4));
        player.outputChatBox(`!{Green}[RULETĂ] Masa #${index} "${removed.name}" a fost ștearsă.`);
        mp.players.forEach(p => p.outputChatBox(`!{Red}[RULETĂ] Masa #${index} "${removed.name}" a fost eliminată de un admin.`));
    } else {
        player.outputChatBox('!{Red}[RULETĂ] Nu există tabele salvate.');
    }
});

// Events
mp.events.add('playerEnterColshape', (player, colshape) => {
    if (colshape.getVariable('isRouletteTable')) {
        player.outputChatBox('!{Orange}[RULETĂ]!{White} Ai intrat în zona mesei. Apasă !{Green}E!{White} pentru a juca.');
        player.currentRouletteTable = colshape;
    }
});

mp.events.add('playerExitColshape', (player, colshape) => {
    if (colshape.getVariable('isRouletteTable')) {
        player.currentRouletteTable = null;
    }

    if (colshape.getVariable('isRouletteLeaveZone')) {
        const { leaveLobby, getLobbyByPlayer } = require('./roulette_server');
        const lobby = getLobbyByPlayer(player);

        if (lobby && lobby.id === colshape.getVariable('tableIndex')) {
            player.outputChatBox('!{Orange}[RULETĂ] !{Red}Te-ai îndepărtat prea mult de masă — ai fost scos automat.');
            leaveLobby(player);
        }
    }
});

mp.events.add('Server_PlayerAction', (player, actionName) => {
    if (actionName === 'interact') {
        if (player.currentRouletteTable) {
            const tableIndex    = player.currentRouletteTable.getVariable('tableIndex');
            const tableName     = player.currentRouletteTable.getVariable('tableName');
            const casinoId      = player.currentRouletteTable.getVariable('casinoId');
            const tableX        = player.currentRouletteTable.getVariable('tableX');
            const tableY        = player.currentRouletteTable.getVariable('tableY');
            const tableZ        = player.currentRouletteTable.getVariable('tableZ');
            const tableHeading  = player.currentRouletteTable.getVariable('tableHeading');

            mp.events.call('Server_JoinRouletteTable', player, tableIndex, tableName, casinoId, tableX, tableY, tableZ, tableHeading);
        }
    }
});

// Util functions
function createBlip(position, index) {
    const blip = mp.blips.new(310, new mp.Vector3(position.x, position.y, position.z), {
        name: "Masa Ruletă",
        color: 1,
        shortRange: false,
        scale: 1.0
    });
    if (index !== undefined) tableBlips[index] = blip;
    return blip;
}

function createMarker(table, index) {
    const label = mp.labels.new(
        getMarkerText(index, 'waiting', 0, 8),
        new mp.Vector3(table.x, table.y, table.z + 1.1),
        { los: true, font: 4, drawDistance: 10, dimension: 0 }
    );
    tableLabels[index] = label;
    return label;
}

function createColshape(position, index, name, casinoId) {
    const colShape = mp.colshapes.newCircle(position.x, position.y, 3.0, 0);
    colShape.setVariable('isRouletteTable', true);
    colShape.setVariable('tableIndex', index);
    colShape.setVariable('tableName', name);
    colShape.setVariable('casinoId', casinoId || null);
    colShape.setVariable('tableX', position.x);
    colShape.setVariable('tableY', position.y);
    colShape.setVariable('tableZ', position.z);
    colShape.setVariable('tableHeading', position.heading || 0);
    tableColshapes[index] = colShape;
    return colShape;
}

function createLeaveColshape(position, index) {
    const colShape = mp.colshapes.newCircle(position.x, position.y, 10.0, 0);
    colShape.setVariable('isRouletteLeaveZone', true);
    colShape.setVariable('tableIndex', index);
    tableLeaveColshapes[index] = colShape;
    return colShape;
}

function createProp(position, heading) {
    // Spawn roulette prop
    return mp.objects.new(mp.joaat('vw_prop_casino_roulette_01'), position, {
        rotation: new mp.Vector3(0, 0, heading),
        dimension: 0,
    });
}

mp.events.add('_roulette_updateMarker', (tableIndex, state, players, maxPlayers) => {
    updateTableMarker(tableIndex, state, players, maxPlayers);
});

module.exports = { createBlip, createColshape, createLeaveColshape, createMarker, loadRouletteTables };
