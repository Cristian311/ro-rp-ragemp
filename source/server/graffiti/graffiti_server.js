const fs   = require('fs');
const path = require('path');
const logger = require('./graffiti_logger');

// ──────────────────────────────────────────
// PERSISTENCE
// ──────────────────────────────────────────
const SAVE_PATH = path.join(process.cwd(), 'graffiti_data.json');

const MAX_PER_PLAYER = 199;
const COOLDOWN_MS    = 1000;       // 1 second
const MAX_IMAGE_SIZE = 2000000;     // ~2 MB base64

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
            try { sendGraffitiChunked(p, eventName, data); } catch (e) {}
        }
    });
}

const SERVER_CHUNK_SIZE = 20000; // 20KB per player.call()

function sendGraffitiChunked(player, eventName, graffiti) {
    // Send metadata (without imageData) + image chunks separately
    const meta = {};
    for (const key in graffiti) {
        if (key !== 'imageData') meta[key] = graffiti[key];
    }
    const imgData = graffiti.imageData || '';
    const totalChunks = Math.ceil(imgData.length / SERVER_CHUNK_SIZE) || 1;
    player.call('graffitiMeta', [JSON.stringify(meta), '' + totalChunks]);
    for (let i = 0; i < totalChunks; i++) {
        const chunk = imgData.substring(i * SERVER_CHUNK_SIZE, (i + 1) * SERVER_CHUNK_SIZE);
        setTimeout(() => {
            try { player.call('graffitiImgChunk', ['' + meta.id, '' + i, chunk]); } catch(e) {}
        }, (i + 1) * 10);
    }
}

function sendAllGraffitiToPlayer(player) {
    const total = graffitiList.length;
    if (total === 0) {
        player.call('graffitiLoadComplete', []);
        return;
    }
    // Send one graffiti at a time with delays
    for (let i = 0; i < total; i++) {
        setTimeout(() => {
            try {
                sendGraffitiChunked(player, 'graffitiCreated', graffitiList[i]);
                if (i === total - 1) {
                    setTimeout(() => {
                        try { player.call('graffitiLoadComplete', []); } catch(e) {}
                    }, 500);
                }
            } catch (e) {}
        }, i * 400);
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

// Chunked placement: client sends meta first, then image chunks
const pendingPlace = {};  // playerId → { meta, totalChunks, chunks[], received }

mp.events.add('Server_GraffitiPlaceMeta', (player, metaJson, totalStr) => {
    let meta;
    try {
        meta = JSON.parse(metaJson);
    } catch (e) {
        player.outputChatBox('!{FF4444}[GRAFFITI] Date invalide.');
        return;
    }
    const total = parseInt(totalStr) || 0;
    if (total <= 0 || total > 200) {
        player.outputChatBox('!{FF4444}[GRAFFITI] Date invalide.');
        return;
    }
    pendingPlace[player.id] = {
        meta,
        totalChunks: total,
        chunks: new Array(total),
        received: 0
    };
    // Safety: clear pending after 30s if not completed
    setTimeout(() => { delete pendingPlace[player.id]; }, 30000);
});

mp.events.add('Server_GraffitiPlaceChunk', (player, idxStr, chunkData) => {
    const pending = pendingPlace[player.id];
    if (!pending) return;
    const idx = parseInt(idxStr);
    if (idx < 0 || idx >= pending.totalChunks) return;
    pending.chunks[idx] = chunkData;
    pending.received++;
    if (pending.received >= pending.totalChunks) {
        const imageData = pending.chunks.join('');
        const meta = pending.meta;
        delete pendingPlace[player.id];
        finalizeGraffitiPlace(player, meta, imageData);
    }
});

function finalizeGraffitiPlace(player, meta, imageData) {
    if (!imageData || !meta.position || !meta.normal) {
        player.outputChatBox('!{FF4444}[GRAFFITI] Date incomplete.');
        return;
    }

    if (imageData.length > MAX_IMAGE_SIZE) {
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
            x: parseFloat(meta.position.x),
            y: parseFloat(meta.position.y),
            z: parseFloat(meta.position.z),
        },
        normal: {
            x: parseFloat(meta.normal.x),
            y: parseFloat(meta.normal.y),
            z: parseFloat(meta.normal.z),
        },
        size: parseFloat(meta.sizeW) || 2.0,
        sizeW: parseFloat(meta.sizeW) || 2.0,
        sizeH: parseFloat(meta.sizeH) || 2.0,
        rotation: parseFloat(meta.rotation) || 0,
        imageData: imageData,
        timestamp: Date.now(),
    };

    graffitiList.push(graffiti);
    saveGraffiti();
    setCooldown(player);

    logger.logCreated(player.name, graffiti.id, graffiti.position);

    broadcastGraffitiToAll('graffitiCreated', graffiti);
    player.outputChatBox(`!{00FF88}[GRAFFITI] Graffiti #${graffiti.id} plasat! (${getPlayerGraffitiCount(player)}/${MAX_PER_PLAYER})`);
}

// Legacy single-call placement (kept for backward compat)
mp.events.add('Server_GraffitiPlace', (player, jsonData) => {
    let data;
    try {
        data = JSON.parse(jsonData);
    } catch (e) {
        player.outputChatBox('!{FF4444}[GRAFFITI] Date invalide.');
        return;
    }
    finalizeGraffitiPlace(player, data, data.imageData);
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
