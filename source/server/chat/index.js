'use strict';

// Converteste !{RRGGBB} si !{ColorName} tokens in HTML spans
function colorizeText(text) {
    const parts = String(text || '').split(/!\{([0-9A-Fa-f]{6}|[A-Za-z]+)\}/g);
    let result = '';
    for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
            result += parts[i];
        } else {
            const colorValue = /^[0-9A-Fa-f]{6}$/.test(parts[i]) ? `#${parts[i]}` : parts[i];
            const nextText = parts[i + 1] !== undefined ? parts[i + 1] : '';
            result += `<span style="color:${colorValue}">${nextText}</span>`;
            i++;
        }
    }
    return result;
}

function sendToPlayer(player, type, authorName, text) {
    const payload = JSON.stringify({
        type,
        author: { name: authorName || '' },
        text,
        sentAt: Date.now()
    });
    try { player.call('chat:receive', [payload]); } catch (_) {}
}

// Patch prototype o singura data — toate obiectele player primesc automat outputChatBox nou
const _originalOutputChatBox = mp.Player.prototype.outputChatBox;
mp.Player.prototype.outputChatBox = function(message) {
    const html = colorizeText(String(message || ''));
    sendToPlayer(this, 'system', '', html);
};

// Also override on each player instance (native bindings shadow prototype)
mp.events.add('playerJoin', (player) => {
    try {
        Object.defineProperty(player, 'outputChatBox', {
            value: function(message) {
                const html = colorizeText(String(message || ''));
                sendToPlayer(player, 'system', '', html);
            },
            writable: true,
            configurable: true,
            enumerable: true
        });
    } catch (_) {
        // Fallback: simple assignment
        try { player.outputChatBox = function(message) {
            const html = colorizeText(String(message || ''));
            sendToPlayer(player, 'system', '', html);
        }; } catch (__) {}
    }
});

// Global chat utilities — reliable from any package
global.chatSend = function(player, message) {
    const html = colorizeText(String(message || ''));
    sendToPlayer(player, 'system', '', html);
};

global.chatBroadcast = function(message) {
    const html = colorizeText(String(message || ''));
    mp.players.forEach(p => {
        if (p && p.id !== undefined) {
            sendToPlayer(p, 'system', '', html);
        }
    });
};

mp.events.add('playerChat', (player, message) => {
    if (!message || typeof message !== 'string') return;

    const cleanMessage = message.trim().slice(0, 200);
    if (!cleanMessage) return;

    const payload = JSON.stringify({
        type: 'rp',
        author: { name: player.name },
        text: cleanMessage,
        sentAt: Date.now()
    });

    mp.players.forEach((target) => {
        target.call('chat:receive', [payload]);
    });
});
