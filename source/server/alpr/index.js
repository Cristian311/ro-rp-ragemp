/**
 * ALPR (Automatic License Plate Reader) - Server Side
 * Handles /alpr command and vehicle data lookups.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ──────────────────────────────────────────
// VEHICLE DATABASE (persistent JSON file)
// ──────────────────────────────────────────
const dataDir = path.join(process.cwd(), 'data', 'alpr');
const vehicleDbPath = path.join(dataDir, 'vehicles.json');
fs.mkdirSync(dataDir, { recursive: true });

let vehicleDb = {};

function loadVehicleDb() {
    try {
        if (fs.existsSync(vehicleDbPath)) {
            vehicleDb = JSON.parse(fs.readFileSync(vehicleDbPath, 'utf8').replace(/^\uFEFF/, ''));
            console.log(`[ALPR] Loaded ${Object.keys(vehicleDb).length} vehicle records.`);
        }
    } catch (e) {
        console.error(`[ALPR] Error loading vehicle DB: ${e.message}`);
        vehicleDb = {};
    }
}

function saveVehicleDb() {
    try {
        fs.writeFileSync(vehicleDbPath, JSON.stringify(vehicleDb, null, 2), 'utf8');
    } catch (e) {
        console.error(`[ALPR] Error saving vehicle DB: ${e.message}`);
    }
}

loadVehicleDb();

// ──────────────────────────────────────────
// LOAD VEHICLE NAMES FROM JSON (data/alpr/)
// ──────────────────────────────────────────
function loadJson(filePath, fallback) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
        }
    } catch (e) {
        console.error(`[ALPR] Error loading ${filePath}: ${e.message}`);
    }
    return fallback;
}

const VEHICLE_DISPLAY_NAMES = loadJson(path.join(dataDir, 'vehicle_names.json'), {});
console.log(`[ALPR] Loaded ${Object.keys(VEHICLE_DISPLAY_NAMES).length} vehicle names.`);

// Vehicle colors (hardcoded — color index to Romanian name)
const VEHICLE_COLORS = {
    0: 'Negru', 1: 'Negru', 2: 'Negru', 3: 'Negru',
    4: 'Argintiu', 5: 'Argintiu', 6: 'Argintiu', 7: 'Argintiu',
    8: 'Gri', 9: 'Gri', 10: 'Gri', 11: 'Gri',
    12: 'Albastru', 13: 'Albastru', 14: 'Albastru', 15: 'Albastru',
    27: 'Rosu', 28: 'Rosu', 29: 'Rosu', 30: 'Rosu', 31: 'Rosu', 35: 'Rosu',
    36: 'Verde', 37: 'Verde', 38: 'Verde', 39: 'Verde',
    42: 'Portocaliu', 43: 'Portocaliu',
    49: 'Galben', 50: 'Galben',
    53: 'Alb', 54: 'Alb', 55: 'Alb',
    56: 'Albastru', 57: 'Albastru', 58: 'Albastru',
    60: 'Albastru', 61: 'Albastru', 62: 'Albastru',
    63: 'Galben', 64: 'Galben',
    66: 'Verde', 67: 'Verde', 68: 'Verde',
    88: 'Rosu', 89: 'Rosu',
    91: 'Roz', 92: 'Roz',
    94: 'Auriu', 95: 'Auriu',
    111: 'Alb', 112: 'Alb',
    120: 'Maro', 121: 'Maro',
    134: 'Negru', 135: 'Negru',
};

// Test NPC vehicles
const TEST_VEHICLES = ['premier', 'washington', 'stanier', 'fugitive', 'emperor', 'ingot', 'intruder', 'stratum', 'tailgater', 'asea', 'primo', 'schafter2', 'oracle', 'felon', 'sentinel', 'baller', 'granger', 'cavalcade', 'gresley', 'landstalker', 'dominator', 'gauntlet', 'vigero', 'minivan', 'blista'];

function getColorName(colorIndex) {
    return VEHICLE_COLORS[colorIndex] || 'Necunoscut';
}

// ──────────────────────────────────────────
// VIN GENERATOR (deterministic per plate)
// ──────────────────────────────────────────
function generateVIN(plate) {
    const hash = crypto.createHash('md5').update(plate.toUpperCase()).digest('hex');
    return ('1HGBH41JXMN' + hash.substring(0, 6)).toUpperCase();
}

// ──────────────────────────────────────────
// MODEL NAME RESOLVER — hash-based (no client dependency)
// ──────────────────────────────────────────
// Build THREE lookup tables for maximum reliability
const displayNameLookup = {};   // lowercase name → display name
const hashLookup = {};          // joaat hash (as-is) → display name
const unsignedHashLookup = {};  // unsigned hash → display name

for (const [name, display] of Object.entries(VEHICLE_DISPLAY_NAMES)) {
    if (name.startsWith('_')) continue;
    const key = name.toLowerCase().trim();
    displayNameLookup[key] = display;

    // Compute joaat hash — server mp.joaat returns signed int32
    const hash = mp.joaat(key);
    hashLookup[hash] = display;

    // Also store unsigned version (hash >>> 0) for cross-comparison
    const unsignedHash = hash >>> 0;
    unsignedHashLookup[unsignedHash] = display;
}
console.log(`[ALPR] Built hash lookup for ${Object.keys(hashLookup).length} vehicles.`);

// Debug: log a few known hashes to verify
['stratum', 'premier', 'oracle', 'washington', 'stanier'].forEach(name => {
    const h = mp.joaat(name);
    console.log(`[ALPR DEBUG] ${name} → hash=${h}, unsigned=${h >>> 0}, resolved=${hashLookup[h] || 'NOT FOUND'}`);
});

function resolveDisplayName(modelHashFromClient, serverVehicle) {
    // Method 1: Use server vehicle object's model hash (most reliable)
    if (serverVehicle) {
        try {
            const serverHash = serverVehicle.model;
            if (hashLookup[serverHash]) {
                return hashLookup[serverHash];
            }
            // Try unsigned
            const uHash = serverHash >>> 0;
            if (unsignedHashLookup[uHash]) {
                return unsignedHashLookup[uHash];
            }
            console.log(`[ALPR DEBUG] Server vehicle hash=${serverHash} unsigned=${uHash} NOT found in lookup`);
        } catch (e) {
            console.log(`[ALPR DEBUG] Error reading server vehicle model: ${e.message}`);
        }
    }

    // Method 2: Use the hash sent from client
    if (modelHashFromClient !== undefined && modelHashFromClient !== null) {
        const clientHash = parseInt(modelHashFromClient);
        if (!isNaN(clientHash)) {
            if (hashLookup[clientHash]) {
                return hashLookup[clientHash];
            }
            // Try unsigned
            const uHash = clientHash >>> 0;
            if (unsignedHashLookup[uHash]) {
                return unsignedHashLookup[uHash];
            }
            // Try as negative (if client sent unsigned, convert to signed)
            const signedHash = clientHash | 0;
            if (hashLookup[signedHash]) {
                return hashLookup[signedHash];
            }
            console.log(`[ALPR DEBUG] Client hash=${clientHash} signed=${signedHash} unsigned=${uHash} NOT found`);
        }
    }

    return 'Vehicul Necunoscut';
}

// ──────────────────────────────────────────
// SCAN EVENT — client sends vehicle data for lookup
// ──────────────────────────────────────────
mp.events.add('alpr:scan', (player, vehicleId, plate, modelHash, speed) => {
    try {
        if (!player || !player.vehicle) return;

        plate = String(plate || '').trim().toUpperCase();
        modelHash = parseInt(modelHash) || 0;
        speed = parseInt(speed) || 0;
        const parsedVehicleId = parseInt(vehicleId);

        // Try finding the target vehicle on server (use == for type-safe comparison)
        let targetVeh = null;
        mp.vehicles.forEach(v => {
            if (v.id == parsedVehicleId) targetVeh = v;
        });

        // Resolve display name using hash-based lookup (server-side only)
        const displayName = resolveDisplayName(modelHash, targetVeh);
        console.log(`[ALPR] Scan: plate=${plate} vehId=${parsedVehicleId} found=${!!targetVeh} hash=${modelHash} → ${displayName}`);

        // Check if we have stored data for this plate
        let record = vehicleDb[plate];
        if (!record) {
            // Generate new record (auto-register)
            // Determine owner from vehicle driver or last known
            let ownerName = 'Necunoscut';
            let ownerId = '-';

            if (targetVeh) {
                // Check occupants
                mp.players.forEach(p => {
                    if (p && p.vehicle && p.vehicle.id === vehicleId && p.seat === -1) {
                        ownerName = p.name.replace('_', ' ');
                        ownerId = String(p.id);
                    }
                });
            }

            record = {
                plate: plate,
                model: displayName,
                ownerName: ownerName,
                ownerId: ownerId,
                vin: generateVIN(plate),
                year: String(2010 + Math.floor(Math.random() * 17)),
                insurance: Math.random() > 0.3,
                license: Math.random() > 0.2 ? 'VALID' : 'EXPIRAT',
                wanted: false,
                stolen: false,
                notes: '',
                color: 'Necunoscut'
            };

            // Get color from vehicle if available
            if (targetVeh) {
                try {
                    const colors = targetVeh.color;
                    if (colors && colors.length) {
                        record.color = getColorName(colors[0]);
                    }
                } catch (_) {}

                // Try getting primary + secondary color names
                try {
                    const c1 = targetVeh.getColor(0);
                    const c2 = targetVeh.getColor(1);
                    const name1 = getColorName(c1);
                    const name2 = getColorName(c2);
                    if (name1 !== name2) {
                        record.color = `${name1}/${name2}`;
                    } else {
                        record.color = name1;
                    }
                } catch (_) {}
            }

            vehicleDb[plate] = record;
            saveVehicleDb();
        }

        // Update model name if it was unknown  before
        if (record.model === 'Vehicul Necunoscut' && displayName !== 'Vehicul Necunoscut') {
            record.model = displayName;
            saveVehicleDb();
        }

        // Send result to client
        const result = {
            plate: record.plate,
            model: record.model,
            color: record.color,
            vin: record.vin,
            year: record.year,
            ownerName: record.ownerName,
            ownerId: record.ownerId,
            license: record.license,
            insurance: record.insurance,
            wanted: record.wanted,
            stolen: record.stolen,
            notes: record.notes || null,
            speed: speed
        };

        player.call('alpr:result', [JSON.stringify(result)]);

    } catch (e) {
        console.error('[ALPR] Scan error:', e);
    }
});

// ──────────────────────────────────────────
// /alpr COMMAND
// ──────────────────────────────────────────
mp.events.addCommand('alpr', (player, _, state) => {
    if (!state) {
        global.chatSend(player, '!{3b82f6}[ALPR] !{FFFFFF}Foloseste: /alpr ON sau /alpr OFF');
        return;
    }

    state = String(state).toUpperCase().trim();

    if (state === 'ON') {
        if (!player.vehicle) {
            global.chatSend(player, '!{ef4444}[ALPR] !{FFFFFF}Trebuie sa fii intr-un vehicul!');
            return;
        }
        player.call('alpr:toggle', [true]);
        global.chatSend(player, '!{3b82f6}[ALPR] !{FFFFFF}Sistem ALPR !{22c55e}activat!{FFFFFF}.');
    } else if (state === 'OFF') {
        player.call('alpr:toggle', [false]);
        global.chatSend(player, '!{3b82f6}[ALPR] !{FFFFFF}Sistem ALPR !{ef4444}dezactivat!{FFFFFF}.');
    } else {
        global.chatSend(player, '!{3b82f6}[ALPR] !{FFFFFF}Foloseste: /alpr ON sau /alpr OFF');
    }
}, {
    description: 'Activeaza/dezactiveaza sistemul ALPR (radar politie).'
});

// ──────────────────────────────────────────
// ADMIN: /alpr:setveh <plate> <field> <value>
// Allows setting vehicle record fields
// ──────────────────────────────────────────
mp.events.addCommand('setplate', (player, _, plate, field, ...valueParts) => {
    if (!plate || !field) {
        global.chatSend(player, '!{3b82f6}[ALPR] !{FFFFFF}Foloseste: /setplate <plăcuță> <camp> <valoare>');
        global.chatSend(player, '!{6b7280}Campuri: owner, insurance, license, wanted, stolen, notes');
        return;
    }

    plate = plate.toUpperCase();
    const value = valueParts.join(' ');
    let record = vehicleDb[plate];

    if (!record) {
        global.chatSend(player, `!{ef4444}[ALPR] !{FFFFFF}Nu exista niciun vehicul cu placuta ${plate}.`);
        return;
    }

    field = field.toLowerCase();
    switch (field) {
        case 'owner':
            record.ownerName = value;
            break;
        case 'ownerid':
            record.ownerId = value;
            break;
        case 'insurance':
            record.insurance = value.toLowerCase() === 'true' || value === '1';
            break;
        case 'license':
            record.license = value.toUpperCase();
            break;
        case 'wanted':
            record.wanted = value.toLowerCase() === 'true' || value === '1';
            break;
        case 'stolen':
            record.stolen = value.toLowerCase() === 'true' || value === '1';
            break;
        case 'notes':
            record.notes = value;
            break;
        case 'color':
            record.color = value;
            break;
        case 'year':
            record.year = value;
            break;
        default:
            global.chatSend(player, `!{ef4444}[ALPR] !{FFFFFF}Camp necunoscut: ${field}`);
            return;
    }

    vehicleDb[plate] = record;
    saveVehicleDb();
    global.chatSend(player, `!{3b82f6}[ALPR] !{22c55e}Actualizat ${plate}: ${field} = ${value}`);
}, {
    description: 'Seteaza informatii vehicul in baza ALPR. Campuri: owner, insurance, license, wanted, stolen, notes, color, year'
});

// ──────────────────────────────────────────
// /testnpc — spawn a vehicle with NPC driver for ALPR testing
// ──────────────────────────────────────────
mp.events.addCommand('testnpc', (player, _, modelName) => {
    try {
        const pos = player.position;
        const heading = player.heading;

        // Pick random vehicle or use specified
        const vehName = modelName && modelName.length > 0 ? modelName : TEST_VEHICLES[Math.floor(Math.random() * TEST_VEHICLES.length)];

        // Spawn vehicle 15m ahead of the player
        const rad = (heading * Math.PI) / 180;
        const spawnX = pos.x + Math.sin(-rad) * 15;
        const spawnY = pos.y + Math.cos(-rad) * 15;

        const vehicle = mp.vehicles.new(mp.joaat(vehName), new mp.Vector3(spawnX, spawnY, pos.z), {
            heading: heading,
            numberPlate: 'NPC' + String(Math.floor(Math.random() * 9000) + 1000),
            color: [[Math.floor(Math.random() * 160), Math.floor(Math.random() * 160), Math.floor(Math.random() * 160)], [20, 20, 20]],
            dimension: player.dimension
        });

        // Tell the client to create an NPC ped and make it drive this vehicle
        setTimeout(() => {
            player.call('alpr:spawnNpcDriver', [vehicle.id]);
        }, 500);

        global.chatSend(player, `!{3b82f6}[TEST] !{FFFFFF}NPC cu ${vehName} a fost spawnat in fata ta. Urmeaza-l cu ALPR ON!`);
    } catch (e) {
        console.error('[ALPR] testnpc error:', e);
        global.chatSend(player, '!{ef4444}[TEST] Eroare la spawnarea NPC-ului.');
    }
}, {
    description: 'Spawneaza un NPC care conduce normal, pentru testarea ALPR.'
});

// Cleanup NPC vehicles
mp.events.addCommand('cleannpc', (player) => {
    let count = 0;
    mp.vehicles.forEach(v => {
        try {
            const plate = v.numberPlate || '';
            if (plate.startsWith('NPC')) {
                v.destroy();
                count++;
            }
        } catch (_) {}
    });
    global.chatSend(player, `!{3b82f6}[TEST] !{FFFFFF}${count} vehicule NPC sterse.`);
}, {
    description: 'Sterge toate vehiculele NPC de test.'
});

console.log('[ALPR] Server-side loaded.');
