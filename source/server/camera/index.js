const fs   = require('fs');
const path = require('path');

const savePath = path.join(process.cwd(), 'data', 'camera', 'saved_positions.json');
fs.mkdirSync(path.dirname(savePath), { recursive: true });

// Load existing positions
let allPositions = [];
if (fs.existsSync(savePath)) {
    try {
        allPositions = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    } catch (e) {
        allPositions = [];
    }
}

function getAdminLevel(player) {
    try {
        const lvl = player.getVariable('adminLevel');
        const n = Number(lvl);
        return Number.isFinite(n) ? Math.floor(n) : 0;
    } catch (_) { return 0; }
}

// Admin check before allowing save — client calls this via Enter or /camsave
mp.events.add('camera:requestSave', (player) => {
    const lvl = getAdminLevel(player);
    if (lvl < 1) {
        player.outputChatBox('!{FF0000}[CAMERA] !{FFFFFF}Doar adminii pot salva pozitii!');
        return;
    }
    // Tell client to proceed with save
    player.call('camera:doSave');
});

// Receive saved position from client
mp.events.add('camera:savePosition', (player, jsonData) => {
    const lvl = getAdminLevel(player);
    if (lvl < 1) {
        player.outputChatBox('!{FF0000}[CAMERA] !{FFFFFF}Doar adminii pot salva pozitii!');
        return;
    }

    let entry;
    try {
        entry = JSON.parse(jsonData);
    } catch (e) {
        player.outputChatBox('!{FF0000}[CAMERA] Eroare la salvare pozitie.');
        return;
    }

    entry.playerName = player.name;
    entry.globalIndex = allPositions.length;

    allPositions.push(entry);

    // Write to file
    try {
        fs.writeFileSync(savePath, JSON.stringify(allPositions, null, 2), 'utf8');
        console.log(`[CAMERA] Pozitie #${entry.globalIndex} salvata de ${player.name}`);
    } catch (e) {
        console.error(`[CAMERA] Eroare la scriere fisier: ${e.message}`);
    }
});

// /camclear — clear all saved positions (admin only)
mp.events.addCommand('camclear', (player) => {
    const lvl = getAdminLevel(player);
    if (lvl < 1) {
        player.outputChatBox('!{FF0000}[CAMERA] !{FFFFFF}Doar adminii pot sterge pozitii!');
        return;
    }
    allPositions = [];
    fs.writeFileSync(savePath, '[]', 'utf8');
    player.outputChatBox('!{00FF00}[CAMERA] !{FFFFFF}Toate pozitiile salvate au fost sterse.');
    console.log(`[CAMERA] Pozitii sterse de ${player.name}`);
});

console.log('[CAMERA] Camera system loaded.');
