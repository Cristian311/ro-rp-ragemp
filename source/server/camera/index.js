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

// Receive saved position from client
mp.events.add('camera:savePosition', (player, jsonData) => {
    let entry;
    try {
        entry = JSON.parse(jsonData);
    } catch (e) {
        player.outputChatBox('§{FF0000}[CAMERA] Eroare la salvare pozitie.');
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

// /camclear — clear all saved positions
mp.events.addCommand('camclear', (player) => {
    allPositions = [];
    fs.writeFileSync(savePath, '[]', 'utf8');
    player.outputChatBox('§{00FF00}[CAMERA] §{FFFFFF}Toate pozitiile salvate au fost sterse.');
    console.log(`[CAMERA] Pozitii sterse de ${player.name}`);
});

console.log('[CAMERA] Camera system loaded.');
