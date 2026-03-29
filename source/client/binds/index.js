// client_packages/binds/index.js — Centralized keybinds

// ── Key codes ──
const KEY_E     = 0x45;
const KEY_F7    = 0x76;

// ──────────────────────────────────────────
// F7 — Toggle HUD visibility
// ──────────────────────────────────────────
mp.keys.bind(KEY_F7, true, () => {
    if (global.chatInputActive) return;
    mp.events.call('hud:f7toggle');
});

// ──────────────────────────────────────────
// E — General interact key
// ──────────────────────────────────────────
mp.keys.bind(KEY_E, true, () => {
    if (global.chatInputActive) return;
    if (global.freecamActive) return;
    mp.events.callRemote('Server_PlayerAction', 'interact');
});

console.log('[Binds] Keybinds loaded.');
