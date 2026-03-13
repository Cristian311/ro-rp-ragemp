const fs   = require('fs');
const path = require('path');
const logger = require('./graffiti_logger');

// ──────────────────────────────────────────
// PERSISTENCE
// ──────────────────────────────────────────
const SAVE_PATH = path.join(process.cwd(), 'graffiti_data.json');

const MAX_PER_PLAYER = 15;
const COOLDOWN_MS    = 5000;       // 5 seconds
const MAX_IMAGE_SIZE = 250000;      // ~250 KB base64

let graffitiList = [];              // Array of graffiti objects
let nextId       = 1;
const cooldowns  = {};              // socialClub → timestamp

function loadGraffiti() {
    if (!fs.existsSync(SAVE_PATH)) return;
    try {
        const data = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8'));
        if (Array.isArray(data)) {
            graffitiList = data;
            if (graffitiList.length > 0) {
                nextId = Math.max(...graffitiList.map(g => g.id)) + 1;
            }
            console.log(`[GRAFFITI] Loaded ${graffitiList.length} graffiti from file.`);
        }
    } catch (e) {
        console.error('[GRAFFITI] Error loading graffiti_data.json:', e.message);
    }
}

function saveGraffiti() {
    try {
        fs.writeFileSync(SAVE_PATH, JSON.stringify(graffitiList, null, 2), 'utf8');
    } catch (e) {
        console.error('[GRAFFITI] Error saving graffiti_data.json:', e.message);
    }
}

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────
function getPlayerIdentifier(player) {
    return player.socialClub || player.name;
}

function getPlayerGraffitiCount(player) {
    const id = getPlayerIdentifier(player);
    return graffitiList.filter(g => g.socialClub === id).length;
}

function isOnCooldown(player) {
    const id = getPlayerIdentifier(player);
    if (!cooldowns[id]) return false;
    return (Date.now() - cooldowns[id]) < COOLDOWN_MS;
}

function setCooldown(player) {
    cooldowns[getPlayerIdentifier(player)] = Date.now();
}

function broadcastGraffitiToAll(eventName, data) {
    mp.players.forEach(p => {
        if (p && p.id !== undefined) {
            p.call(eventName, [typeof data === 'string' ? data : JSON.stringify(data)]);
        }
    });
}

function sendAllGraffitiToPlayer(player) {
    const total = graffitiList.length;
    if (total === 0) {
        player.call('graffitiLoadComplete', []);
        return;
    }
    // Send one graffiti at a time with delays to avoid overwhelming the client
    for (let i = 0; i < total; i++) {
        setTimeout(() => {
            try {
                player.call('graffitiLoadChunk', [JSON.stringify([graffitiList[i]])]);
                if (i === total - 1) {
                    player.call('graffitiLoadComplete', []);
                }
            } catch (e) {}
        }, i * 300);
    }
}

// ──────────────────────────────────────────
// COMMANDS
// ──────────────────────────────────────────

// /spray — open the drawing canvas
mp.events.addCommand('spray', (player) => {
    if (getPlayerGraffitiCount(player) >= MAX_PER_PLAYER) {
        player.outputChatBox(`!{FF4444}[GRAFFITI] Ai atins limita de ${MAX_PER_PLAYER} graffiti! Sterge unul cu /deletemygraffiti.`);
        return;
    }

    if (isOnCooldown(player)) {
        player.outputChatBox('!{FF4444}[GRAFFITI] Asteapta putin inainte sa faci alt graffiti.');
        return;
    }

    player.call('openGraffitiCanvas', []);
});

// /deletemygraffiti — delete your nearest graffiti (< 5m)
mp.events.addCommand('deletemygraffiti', (player) => {
    const identifier = getPlayerIdentifier(player);
    const pos = player.position;

    let nearest = null;
    let nearestDist = 5.0;

    for (const g of graffitiList) {
        if (g.socialClub !== identifier) continue;
        const dx = g.position.x - pos.x;
        const dy = g.position.y - pos.y;
        const dz = g.position.z - pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < nearestDist) {
            nearest = g;
            nearestDist = dist;
        }
    }

    if (!nearest) {
        player.outputChatBox('!{FF4444}[GRAFFITI] Nu ai niciun graffiti in raza de 5m.');
        return;
    }

    graffitiList = graffitiList.filter(g => g.id !== nearest.id);
    saveGraffiti();
    logger.logDeletedOwn(player.name, nearest.id);

    broadcastGraffitiToAll('graffitiDeleted', { id: nearest.id });
    player.outputChatBox(`!{00FF88}[GRAFFITI] Graffiti #${nearest.id} sters!`);
});

// /deletegraffiti — admin: delete nearest graffiti (< 5m)
mp.events.addCommand('deletegraffiti', (player) => {
    const pos = player.position;

    let nearest = null;
    let nearestDist = 5.0;

    for (const g of graffitiList) {
        const dx = g.position.x - pos.x;
        const dy = g.position.y - pos.y;
        const dz = g.position.z - pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < nearestDist) {
            nearest = g;
            nearestDist = dist;
        }
    }

    if (!nearest) {
        player.outputChatBox('!{FF4444}[GRAFFITI] Nu exista niciun graffiti in raza de 5m.');
        return;
    }

    const ownerName = nearest.playerName;
    graffitiList = graffitiList.filter(g => g.id !== nearest.id);
    saveGraffiti();
    logger.logDeleted(player.name, nearest.id, ownerName);

    broadcastGraffitiToAll('graffitiDeleted', { id: nearest.id });
    player.outputChatBox(`!{00FF88}[GRAFFITI] Graffiti #${nearest.id} (de la ${ownerName}) sters!`);
});

// /clearallgraffiti — admin: remove all
mp.events.addCommand('clearallgraffiti', (player) => {
    const count = graffitiList.length;
    if (count === 0) {
        player.outputChatBox('!{FF4444}[GRAFFITI] Nu exista graffiti pe server.');
        return;
    }

    logger.logClearedAll(player.name, count);
    graffitiList = [];
    nextId = 1;
    saveGraffiti();

    broadcastGraffitiToAll('graffitiClearAll', {});
    player.outputChatBox(`!{00FF88}[GRAFFITI] Toate cele ${count} graffiti au fost sterse!`);
});

// /graffitilist — admin: list all in chat
mp.events.addCommand('graffitilist', (player) => {
    if (graffitiList.length === 0) {
        player.outputChatBox('!{FFAA00}[GRAFFITI] Nu exista graffiti pe server.');
        return;
    }

    player.outputChatBox(`!{FFAA00}[GRAFFITI] Total: ${graffitiList.length}`);
    for (const g of graffitiList) {
        player.outputChatBox(`  !{FFFFFF}#${g.id} | ${g.playerName} | (${g.position.x.toFixed(1)}, ${g.position.y.toFixed(1)}, ${g.position.z.toFixed(1)})`);
    }
});

// ──────────────────────────────────────────
// CLIENT EVENTS
// ──────────────────────────────────────────

// Player places graffiti after drawing + aiming at wall
mp.events.add('Server_GraffitiPlace', (player, jsonData) => {
    let data;
    try {
        data = JSON.parse(jsonData);
    } catch (e) {
        player.outputChatBox('!{FF4444}[GRAFFITI] Date invalide.');
        return;
    }

    // Validate
    if (!data.imageData || !data.position || !data.normal) {
        player.outputChatBox('!{FF4444}[GRAFFITI] Date incomplete.');
        return;
    }

    if (data.imageData.length > MAX_IMAGE_SIZE) {
        player.outputChatBox('!{FF4444}[GRAFFITI] Imaginea este prea mare.');
        return;
    }

    if (getPlayerGraffitiCount(player) >= MAX_PER_PLAYER) {
        player.outputChatBox(`!{FF4444}[GRAFFITI] Ai atins limita de ${MAX_PER_PLAYER} graffiti!`);
        return;
    }

    if (isOnCooldown(player)) {
        player.outputChatBox('!{FF4444}[GRAFFITI] Asteapta putin inainte sa faci alt graffiti.');
        return;
    }

    const graffiti = {
        id: nextId++,
        playerName: player.name,
        socialClub: getPlayerIdentifier(player),
        position: {
            x: parseFloat(data.position.x),
            y: parseFloat(data.position.y),
            z: parseFloat(data.position.z),
        },
        normal: {
            x: parseFloat(data.normal.x),
            y: parseFloat(data.normal.y),
            z: parseFloat(data.normal.z),
        },
        imageData: data.imageData,
        timestamp: Date.now(),
    };

    graffitiList.push(graffiti);
    saveGraffiti();
    setCooldown(player);

    logger.logCreated(player.name, graffiti.id, graffiti.position);

    broadcastGraffitiToAll('graffitiCreated', graffiti);
    player.outputChatBox(`!{00FF88}[GRAFFITI] Graffiti #${graffiti.id} plasat! (${getPlayerGraffitiCount(player)}/${MAX_PER_PLAYER})`);
});

// Player requests all graffiti (on join / reconnect)
mp.events.add('Server_GraffitiRequestAll', (player) => {
    sendAllGraffitiToPlayer(player);
});

// Send graffiti to newly joined players
mp.events.add('playerReady', (player) => {
    if (graffitiList.length > 0) {
        // Small delay to ensure client is fully loaded
        setTimeout(() => {
            sendAllGraffitiToPlayer(player);
        }, 3000);
    }
});

// ──────────────────────────────────────────
// INIT
// ──────────────────────────────────────────
loadGraffiti();
console.log('[GRAFFITI] Graffiti system initialized.');
