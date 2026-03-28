// ═══════════════════════════════════════════════
//  Discord Rich Presence — Romania Roleplay
// ═══════════════════════════════════════════════

const SERVER_NAME = 'Romania Roleplay';
const MAX_PLAYERS = 1000;
const UPDATE_INTERVAL = 30000; // 30 secunde

let playerCount = 0;
let playerName = '';

// ── Setari initiale Discord ──
mp.events.add('playerReady', () => {
    playerName = mp.players.local.name || 'Jucator';

    // Seteaza prezenta Discord
    mp.discord.update(
        `${SERVER_NAME} — Testing`,                    // detail (linia 1)
        `${playerName} (${playerCount}/${MAX_PLAYERS})` // state (linia 2)
    );
});

// ── Primeste actualizarea numarului de jucatori de la server ──
mp.events.add('discord:updatePlayerCount', (count) => {
    playerCount = count;
    playerName = mp.players.local.name || 'Jucator';

    mp.discord.update(
        `${SERVER_NAME} — Testing`,
        `${playerName} (${playerCount}/${MAX_PLAYERS})`
    );
});

// ── Cere numarul de jucatori la interval regulat ──
mp.events.add('render', (() => {
    let lastUpdate = 0;
    return () => {
        const now = Date.now();
        if (now - lastUpdate > UPDATE_INTERVAL) {
            lastUpdate = now;
            mp.events.callRemote('discord:requestPlayerCount');
        }
    };
})());

// ── Prima cerere dupa conectare ──
mp.events.add('playerReady', () => {
    mp.events.callRemote('discord:requestPlayerCount');
});
