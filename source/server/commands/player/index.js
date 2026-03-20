mp.events.addCommand('ping', (player) => {
    player.outputChatBox('pong!');
}, {
    description: 'Server latency test.'
});

console.log('[COMMANDS] Player commands loaded successfully!');

// Open phone server-side command (client will open its phone UI when server calls this)
mp.events.addCommand('phone', (player) => {
    try {
        player.call('OpenPhone');
    } catch (e) {
        console.error('[CMD phone] failed to call client OpenPhone', e);
    }
}, {
    description: 'Opens the phone interface.'
});

// Legacy command palette list event kaldırıldı.
// Custom chat autocomplete akışı: chat:commands:request / chat:commands:query