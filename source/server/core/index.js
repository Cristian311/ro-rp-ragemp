require('./commands.js')
const fs = require('fs');
const path = require('path');

// ──────────────────────────────────────────
// ADMIN DATABASE — saved locally in data/admin/admins.json
// ──────────────────────────────────────────
const adminDbDir = path.join(process.cwd(), 'data', 'admin');
const adminDbPath = path.join(adminDbDir, 'admins.json');
fs.mkdirSync(adminDbDir, { recursive: true });

// Database structure: { "playername": { level: 7, addedBy: "system", addedAt: "..." } }
let adminDb = {};

function loadAdminDb() {
    try {
        if (fs.existsSync(adminDbPath)) {
            adminDb = JSON.parse(fs.readFileSync(adminDbPath, 'utf8'));
            console.log(`[ADMIN DB] Loaded ${Object.keys(adminDb).length} admins from database.`);
        } else {
            // First run — seed with default super admins
            adminDb = {
                'woolfye': { level: 7, addedBy: 'system', addedAt: new Date().toISOString() },
                'lition':  { level: 7, addedBy: 'system', addedAt: new Date().toISOString() },
            };
            saveAdminDb();
            console.log('[ADMIN DB] Created admin database with default super admins.');
        }
    } catch (e) {
        console.error(`[ADMIN DB] Error loading: ${e.message}`);
        adminDb = {};
    }
}

function saveAdminDb() {
    try {
        fs.writeFileSync(adminDbPath, JSON.stringify(adminDb, null, 2), 'utf8');
    } catch (e) {
        console.error(`[ADMIN DB] Error saving: ${e.message}`);
    }
}

function getAdminLevelFromDb(playerName) {
    const entry = adminDb[playerName.toLowerCase()];
    return entry ? entry.level : 0;
}

function setAdminInDb(playerName, level, addedBy) {
    const key = playerName.toLowerCase();
    if (level <= 0) {
        delete adminDb[key];
    } else {
        adminDb[key] = {
            level: level,
            addedBy: addedBy || 'system',
            addedAt: new Date().toISOString(),
        };
    }
    saveAdminDb();
}

// Make functions available globally for other packages
global.adminDb = {
    getLevel: getAdminLevelFromDb,
    setAdmin: setAdminInDb,
    getAll: () => ({ ...adminDb }),
    save: saveAdminDb,
    reload: loadAdminDb,
};

// Load on startup
loadAdminDb();

// ──────────────────────────────────────────
// PLAYER JOIN — assign admin from DB + announce
// ──────────────────────────────────────────
mp.events.add("playerJoin", (player) => {
    const log = `${player.name} joined at ${new Date().toISOString()}\n`;

    fs.appendFile("logs.txt", log, (err) => {
        if (err) console.error("Log error:", err);
    });

    // Assign admin level from database
    const adminLevel = getAdminLevelFromDb(player.name);
    player.setVariable('adminLevel', adminLevel);

    if (adminLevel > 0) {
        console.log(`[ADMIN] ${player.name} a primit admin level ${adminLevel} (din baza de date)`);

        // Announce to all players
        mp.players.forEach(p => {
            if (p && p.id !== undefined) {
                p.outputChatBox(`!{FF4444}[ADMIN] !{FFD700}${player.name} !{FFFFFF}s-a conectat! !{AAAAAA}(Admin Level ${adminLevel})`);
            }
        });
    }
});

