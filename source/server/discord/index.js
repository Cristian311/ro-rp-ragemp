// ═══════════════════════════════════════════════
//  Discord Rich Presence — Server Side
// ═══════════════════════════════════════════════

mp.events.add('discord:requestPlayerCount', (player) => {
    const count = mp.players.length;
    player.call('discord:updatePlayerCount', [count]);
});
