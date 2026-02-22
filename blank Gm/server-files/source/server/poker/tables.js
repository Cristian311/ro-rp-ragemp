// tables.js — Table creation, loading, and colshape events (server-side)

const fs   = require('fs');
const path = require('path');

const savePath = path.join(process.cwd(), 'poker_tables.json');

// ──────────────────────────────────────────
// Load saved tables on startup
// ──────────────────────────────────────────
function loadPokerTables() {
    if (!fs.existsSync(savePath)) return;

    const tables = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    console.log(`[POKER] S-au găsit ${tables.length} mese salvate:`);

    tables.forEach((table, index) => {
        createBlip(table);
        createColshape(table, index, table.name);
        createMarker(table, index);
        console.log(`  Masa #${index}. ${table.name}: X:${table.x}, Y:${table.y}, Z:${table.z}`);
    });
}

loadPokerTables();

// ──────────────────────────────────────────
// Command: /createpoker <name>
// ──────────────────────────────────────────
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
        heading: parseFloat(rot.toFixed(2))
    };

    let tables = [];
    if (fs.existsSync(savePath)) {
        tables = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    }

    tables.push(newTable);
    fs.writeFileSync(savePath, JSON.stringify(tables, null, 4));

    const newIndex = tables.length - 1;
    createMarker(newTable, newIndex);
    createColshape(newTable, newIndex, newTable.name);
    createBlip(newTable);

    player.outputChatBox(`!{Green}[POKER] Masa "${newTable.name}" salvată la: ${newTable.x}, ${newTable.y}, ${newTable.z}`);
});

// ──────────────────────────────────────────
// Colshape events
// ──────────────────────────────────────────
mp.events.add('playerEnterColshape', (player, colshape) => {
    if (colshape.getVariable('isPokerTable')) {
        player.outputChatBox('!{Yellow}[POKER]!{White} Ai intrat în zona mesei. Apasă !{Green}E!{White} pentru a juca.');
        player.currentTable = colshape;
    }
});

mp.events.add('playerExitColshape', (player, colshape) => {
    if (colshape.getVariable('isPokerTable')) {
        player.outputChatBox('!{Yellow}[POKER]!{White} Ai părăsit zona mesei.');
        player.currentTable = null;
    }
});

// ──────────────────────────────────────────
// Player interact (E key → join table)
// ──────────────────────────────────────────
mp.events.add('Server_PlayerAction', (player, actionName) => {
    console.log(`[POKER] ${player.name} a acționat: ${actionName}`);

    if (actionName === 'interact') {
        if (player.currentTable) {
            const tableIndex = player.currentTable.getVariable('tableIndex');
            const tableName  = player.currentTable.getVariable('tableName');
            // Redirect to the join event (handled in poker_server.js)
            mp.events.call('Server_JoinPokerTable', player, tableIndex, tableName);
        } else {
            player.outputChatBox('!{Red}Nu ești lângă nicio masă de poker.');
        }
    }
});

// Util

function createBlip(position) {
    mp.blips.new(602, new mp.Vector3(position.x, position.y, position.z), {
        name: "Masa Poker",
        color: 2,
        shortRange: false,
        scale: 1.0
    });
}

function createMarker(table, index) {
    mp.labels.new(
        `~g~Masa Poker ~w~#${index}\n~y~Apasa E pentru joc`,
        new mp.Vector3(table.x, table.y, table.z + 1.1),
        {
            los: true,
            font: 4,
            drawDistance: 10,
            dimension: 0
        }
    );
}

function createColshape(position, index, name) {
    const colShape = mp.colshapes.newCircle(position.x, position.y, 2.0, 0);
    colShape.setVariable('isPokerTable', true);
    colShape.setVariable('tableIndex', index);
    colShape.setVariable('tableName', name);
}