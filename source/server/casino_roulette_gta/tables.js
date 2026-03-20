// ═══════════════════════════════════════════════════════════════
// CASINO ROULETTE GTA — TABLES & SEAT POSITIONS
// Recreated from decompiled casinoroulette.c
// func_20, func_21 — Seat world positions & headings
// func_112 — Interior room assignment
// __EntryFunction__ — Table center position
// ═══════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const { CONFIG } = require('./config');
const dealer = require('./dealer');

const savePath = path.join(process.cwd(), 'data', 'casino_roulette_gta', 'casino_roulette_gta_tables.json');
fs.mkdirSync(path.dirname(savePath), { recursive: true });

// ──────────────────────────────────────────
// GTA V DIAMOND CASINO SEAT POSITIONS (from func_21)
// World coordinates for the 6 poker/roulette seats
// Around x≈1130–1150, y≈247–268, z≈-52
// ──────────────────────────────────────────
const GTA_SEAT_POSITIONS = {
    0: { x: 1133.99, y: 260.76, z: -52.44 },
    1: { x: 1135.80, y: 263.74, z: -52.44 },
    2: { x: 1139.96, y: 264.19, z: -52.44 },
    3: { x: 1143.12, y: 261.61, z: -52.44 },
    4: { x: 1141.31, y: 258.63, z: -52.44 },
    5: { x: 1137.15, y: 258.18, z: -52.44 },
};

// ──────────────────────────────────────────
// GTA V DIAMOND CASINO SEAT HEADINGS (from func_20)
// Facing angles for each of the 6 seats
// ──────────────────────────────────────────
const GTA_SEAT_HEADINGS = {
    0: -135.0,
    1: 45.0,
    2: -45.0,
    3: 135.0,
    4: -135.0,
    5: 45.0,
};

// ──────────────────────────────────────────
// TABLE CENTER (from __EntryFunction__ Local_134)
// ──────────────────────────────────────────
const GTA_TABLE_CENTER = { x: 1140.7462, y: 258.6841, z: -52.4408 };

// ──────────────────────────────────────────
// INTERIOR ROOM MAPPING (from func_112)
// Tables 2-5 → gaming_floor_02, Tables 0,1 → gaming_floor_03
// ──────────────────────────────────────────
function getInteriorRoom(tableIndex) {
    if (tableIndex >= 2 && tableIndex <= 5) {
        return CONFIG.INTERIOR_ROOMS.GAMING_FLOOR_02;
    }
    return CONFIG.INTERIOR_ROOMS.GAMING_FLOOR_03;
}

// ──────────────────────────────────────────
// SEAT POSITION CALCULATION
// Given a table's world position + heading, compute
// relative seat positions around it (4 seats per table)
// ──────────────────────────────────────────
function calculateSeatPositions(tablePos, tableHeading, seatCount) {
    const seats = [];
    const radius = 1.5;  // distance from table center to seat
    const headingRad = (tableHeading * Math.PI) / 180;

    for (let i = 0; i < seatCount; i++) {
        // Distribute seats evenly around the table
        const angle = headingRad + (i * 2 * Math.PI / seatCount);
        seats.push({
            index: i,
            position: {
                x: tablePos.x + Math.cos(angle) * radius,
                y: tablePos.y + Math.sin(angle) * radius,
                z: tablePos.z,
            },
            // Seat faces toward center of table (from func_18 normalization)
            heading: normalizeHeading(((angle * 180 / Math.PI) + 180) % 360),
        });
    }
    return seats;
}

// func_19 — Normalize heading to [0, 360)
function normalizeHeading(angle) {
    while (angle < 0) angle += 360;
    while (angle >= 360) angle -= 360;
    return angle;
}

// ──────────────────────────────────────────
// TABLE STORAGE (references for colshapes, labels, blips)
// ──────────────────────────────────────────
const tableLabels         = {};
const tableColshapes      = {};
const tableBlips          = {};
const tableLeaveColshapes = {};
const tableObjects        = {};

// ──────────────────────────────────────────
// TABLE DEFINITION
// Each table has: position, heading, seats, dealer, state
// ──────────────────────────────────────────
function createTableDefinition(index, data) {
    const pos = { x: data.x, y: data.y, z: data.z };
    return {
        index,
        name: data.name || `CasinoRoulette_${index}`,
        position: pos,
        heading: data.heading || 0,
        casinoId: data.casinoId || null,
        dealerFemale: data.dealerFemale !== undefined ? data.dealerFemale : (Math.random() > 0.5),
        dealerVoice: data.dealerVoice || Math.floor(Math.random() * 4),
        interiorRoom: getInteriorRoom(index),
        seats: calculateSeatPositions(pos, data.heading || 0, CONFIG.SEATS_PER_TABLE),
    };
}

// ──────────────────────────────────────────
// MARKER TEXT
// ──────────────────────────────────────────
function getMarkerText(index, state, players, maxPlayers) {
    let statusLine;
    switch (state) {
        case CONFIG.STATES.SPINNING:
        case CONFIG.STATES.RESULT:
        case CONFIG.STATES.NO_MORE_BETS:
            statusLine = '~r~Bila se invarte'; break;
        case CONFIG.STATES.BETTING:
            statusLine = '~g~Se accepta pariuri'; break;
        case CONFIG.STATES.PAYOUT:
            statusLine = '~y~Se distribuie castiguri'; break;
        default:
            statusLine = '~y~Asteapta jucatori'; break;
    }
    return `~g~Casino Roulette ~w~#${index}\n${statusLine} ~w~(${players}/${maxPlayers})\n~y~Apasa ~g~E ~w~pentru a juca`;
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

// ──────────────────────────────────────────
// COLSHAPE / MARKER / BLIP CREATION
// ──────────────────────────────────────────
function createBlip(position, index) {
    const blip = mp.blips.new(310, new mp.Vector3(position.x, position.y, position.z), {
        name: 'Casino Roulette',
        color: 1,
        shortRange: false,
        scale: 1.0
    });
    if (index !== undefined) tableBlips[index] = blip;
    return blip;
}

function createMarker(table, index) {
    const label = mp.labels.new(
        getMarkerText(index, CONFIG.STATES.WAITING, 0, CONFIG.SEATS_PER_TABLE),
        new mp.Vector3(table.x, table.y, table.z + 1.1),
        { los: true, font: 4, drawDistance: 10, dimension: 0 }
    );
    tableLabels[index] = label;
    return label;
}

function createColshape(position, index, name, casinoId) {
    const colShape = mp.colshapes.newCircle(position.x, position.y, CONFIG.TABLE_INTERACT_RADIUS, 0);
    colShape.setVariable('isCasinoRouletteGTA', true);
    colShape.setVariable('tableIndex', index);
    colShape.setVariable('tableName', name);
    colShape.setVariable('casinoId', casinoId || null);
    tableColshapes[index] = colShape;
    return colShape;
}

function createLeaveColshape(position, index) {
    const colShape = mp.colshapes.newCircle(position.x, position.y, CONFIG.TABLE_LEAVE_RADIUS, 0);
    colShape.setVariable('isCasinoRouletteGTALeave', true);
    colShape.setVariable('tableIndex', index);
    tableLeaveColshapes[index] = colShape;
    return colShape;
}

// ──────────────────────────────────────────
// LOAD / SAVE TABLES
// ──────────────────────────────────────────
function loadTables() {
    if (!fs.existsSync(savePath)) return [];

    const tables = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    console.log(`[CASINO_ROULETTE_GTA] Found ${tables.length} saved tables:`);

    tables.forEach((table, index) => {
        createColshape(table, index, table.name, table.casinoId);
        createLeaveColshape(table, index);
        createMarker(table, index);

        // Spawn dealer NPC (from func_106)
        const tableDef = createTableDefinition(index, table);
        dealer.createDealer(
            index,
            tableDef.position,
            tableDef.heading,
            tableDef.dealerFemale,
            tableDef.dealerVoice
        );

        console.log(`  Table #${index}. ${table.name}: X:${table.x}, Y:${table.y}, Z:${table.z} | Dealer: ${tableDef.dealerFemale ? 'Female' : 'Male'}`);
    });

    return tables;
}

function saveTables(tables) {
    fs.writeFileSync(savePath, JSON.stringify(tables, null, 4));
}

function getTableCount() {
    if (!fs.existsSync(savePath)) return 0;
    return JSON.parse(fs.readFileSync(savePath, 'utf8')).length;
}

// ──────────────────────────────────────────
// TABLE MANAGEMENT COMMANDS
// ──────────────────────────────────────────
function addTable(player, name) {
    const pos = player.position;
    const rot = player.heading;

    // Spawn roulette prop
    mp.objects.new(mp.joaat('vw_prop_casino_roulette_01'), pos, {
        rotation: new mp.Vector3(0, 0, rot),
        dimension: 0,
    });

    const newTable = {
        name: name || `CasinoRoulette_${Date.now()}`,
        x: parseFloat(pos.x.toFixed(2)),
        y: parseFloat(pos.y.toFixed(2)),
        z: parseFloat(pos.z.toFixed(2)),
        heading: parseFloat(rot.toFixed(2)),
        casinoId: null,
        dealerFemale: Math.random() > 0.5,
        dealerVoice: Math.floor(Math.random() * 4),
    };

    let tables = [];
    if (fs.existsSync(savePath)) {
        tables = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    }

    tables.push(newTable);
    saveTables(tables);

    const newIndex = tables.length - 1;
    createMarker(newTable, newIndex);
    createColshape(newTable, newIndex, newTable.name, newTable.casinoId);
    createLeaveColshape(newTable, newIndex);

    // Spawn dealer
    const tableDef = createTableDefinition(newIndex, newTable);
    dealer.createDealer(
        newIndex,
        tableDef.position,
        tableDef.heading,
        tableDef.dealerFemale,
        tableDef.dealerVoice
    );

    return { index: newIndex, table: newTable };
}

function removeTable(index) {
    if (tableLabels[index]) { tableLabels[index].destroy(); delete tableLabels[index]; }
    if (tableColshapes[index]) { tableColshapes[index].destroy(); delete tableColshapes[index]; }
    if (tableBlips[index]) { tableBlips[index].destroy(); delete tableBlips[index]; }
    if (tableLeaveColshapes[index]) { tableLeaveColshapes[index].destroy(); delete tableLeaveColshapes[index]; }

    dealer.destroyDealer(index);

    if (fs.existsSync(savePath)) {
        const tables = JSON.parse(fs.readFileSync(savePath, 'utf8'));
        if (index < 0 || index >= tables.length) return null;
        const removed = tables.splice(index, 1)[0];
        saveTables(tables);
        return removed;
    }
    return null;
}

module.exports = {
    GTA_SEAT_POSITIONS,
    GTA_SEAT_HEADINGS,
    GTA_TABLE_CENTER,
    getInteriorRoom,
    calculateSeatPositions,
    normalizeHeading,
    createTableDefinition,
    getMarkerText,
    updateTableMarker,
    createBlip,
    createMarker,
    createColshape,
    createLeaveColshape,
    loadTables,
    saveTables,
    getTableCount,
    addTable,
    removeTable,
    tableLabels,
    tableColshapes,
    tableBlips,
    tableLeaveColshapes,
};
