/**
 * Debug Log Server — saves radar debug logs from clients to JSON files.
 */
const fs = require('fs');
const path = require('path');

const logDir = path.join(process.cwd(), 'data', 'debug');
fs.mkdirSync(logDir, { recursive: true });

mp.events.add('debug:saveLog', (player, jsonStr) => {
    try {
        const entries = JSON.parse(jsonStr);
        if (!Array.isArray(entries) || entries.length === 0) return;

        const playerName = player.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `radar_${playerName}_${timestamp}.json`;
        const filePath = path.join(logDir, filename);

        const logData = {
            player: player.name,
            playerId: player.id,
            savedAt: new Date().toISOString(),
            entryCount: entries.length,
            entries: entries
        };

        fs.writeFileSync(filePath, JSON.stringify(logData, null, 2), 'utf8');
        console.log(`[DEBUG] Saved ${entries.length} radar log entries to ${filename}`);
        global.chatSend(player, `!{f59e0b}[DEBUG] !{22c55e}Loguri salvate: !{FFFFFF}data/debug/${filename}`);
    } catch (e) {
        console.error('[DEBUG] Error saving log:', e.message);
        global.chatSend(player, '!{ef4444}[DEBUG] Eroare la salvarea logurilor.');
    }
});

console.log('[DEBUG] Debug log server loaded.');
