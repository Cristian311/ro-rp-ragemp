// packages/hud/index.js — Server-side HUD data provider

// Send initial HUD data when player is ready
mp.events.add('playerReady', (player) => {
    const money = player.money || 0;
    const playerCount = mp.players.length;
    player.call('hud:init', [player.name, money, playerCount]);
});

// Broadcast player count to all when someone joins or leaves
function broadcastPlayerCount() {
    const count = mp.players.length;
    mp.players.forEach((p) => {
        p.call('hud:updatePlayers', [count]);
    });
}

mp.events.add('playerJoin', () => {
    setTimeout(broadcastPlayerCount, 500);
});

mp.events.add('playerQuit', () => {
    setTimeout(broadcastPlayerCount, 500);
});

// Utility: call this from other packages to update a player's money on the HUD
global.hudUpdateMoney = function(player, amount) {
    player.call('hud:updateMoney', [amount]);
};

console.log('[HUD] Server-side HUD provider loaded.');
