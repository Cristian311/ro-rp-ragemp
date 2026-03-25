/**
 * Radar Debug Visualizer
 * Draws raycast lines in 3D and collects debug logs.
 *
 * KEYBINDS:
 *   J — Toggle Stalker debug rays (albastru=fata, verde=spate, rosu=hit)
 *   H — Toggle ALPR debug rays (galben=miss, rosu=hit)
 *   K — Save debug log to server JSON
 */

// ──────────────────────────────────────────
// STATE
// ──────────────────────────────────────────
let stalkerDebug = false;
let alprDebug = false;

// Ray buffers — populated each frame by scan functions, drawn in render loop
let stalkerRays = [];  // { start, end, hit: bool, antenna: 'front'|'rear' }
let alprRays = [];     // { start, end, hit: bool }

// Debug log entries
let debugLog = [];
const MAX_LOG_ENTRIES = 500;

// ──────────────────────────────────────────
// DRAWING — mp.events.add('render') draws lines every frame
// ──────────────────────────────────────────
mp.events.add('render', () => {
    // Draw Stalker rays
    if (stalkerDebug && stalkerRays.length > 0) {
        for (let i = 0; i < stalkerRays.length; i++) {
            const r = stalkerRays[i];
            let cr, cg, cb;
            if (r.hit) {
                cr = 255; cg = 30; cb = 30; // Red = hit vehicle
            } else if (r.antenna === 'front') {
                cr = 30; cg = 144; cb = 255; // Blue = front antenna miss
            } else {
                cr = 30; cg = 255; cb = 100; // Green = rear antenna miss
            }
            mp.game.graphics.drawLine(
                r.start.x, r.start.y, r.start.z,
                r.end.x, r.end.y, r.end.z,
                cr, cg, cb, 180
            );
        }
    }

    // Draw ALPR rays
    if (alprDebug && alprRays.length > 0) {
        for (let i = 0; i < alprRays.length; i++) {
            const r = alprRays[i];
            let cr, cg, cb;
            if (r.hit) {
                cr = 255; cg = 30; cb = 30; // Red = hit
            } else {
                cr = 255; cg = 200; cb = 0; // Yellow = ALPR miss
            }
            mp.game.graphics.drawLine(
                r.start.x, r.start.y, r.start.z,
                r.end.x, r.end.y, r.end.z,
                cr, cg, cb, 150
            );
        }
    }
});

// ──────────────────────────────────────────
// API — called by stalker/alpr scan functions
// ──────────────────────────────────────────

// Reset rays for current frame (call at start of scan)
function clearStalkerRays() { stalkerRays = []; }
function clearAlprRays() { alprRays = []; }

// Push a ray to the buffer (call per raycast)
function pushStalkerRay(start, end, hit, antenna) {
    if (!stalkerDebug) return;
    stalkerRays.push({ start, end, hit, antenna });
}

function pushAlprRay(start, end, hit) {
    if (!alprDebug) return;
    alprRays.push({ start, end, hit });
}

// Check if debug is active
function isStalkerDebug() { return stalkerDebug; }
function isAlprDebug() { return alprDebug; }

// ──────────────────────────────────────────
// LOGGING
// ──────────────────────────────────────────
function addDebugLog(source, data) {
    const entry = {
        time: new Date().toISOString(),
        source: source,
        data: data
    };
    debugLog.push(entry);
    if (debugLog.length > MAX_LOG_ENTRIES) {
        debugLog = debugLog.slice(-MAX_LOG_ENTRIES);
    }
}

function getDebugLog() { return debugLog; }
function clearDebugLog() { debugLog = []; }

// ──────────────────────────────────────────
// KEYBINDS
// ──────────────────────────────────────────

// J (0x4A) — Toggle Stalker debug rays
mp.keys.bind(0x4A, true, () => {
    if (global.chatInputActive) return;
    stalkerDebug = !stalkerDebug;
    if (!stalkerDebug) stalkerRays = [];
    mp.events.call('chat:receive', JSON.stringify({
        type: 'system',
        text: stalkerDebug
            ? '!{f59e0b}[DEBUG] !{1e90ff}Stalker rays !{22c55e}ON !{FFFFFF}(albastru=fata, verde=spate, rosu=hit)'
            : '!{f59e0b}[DEBUG] !{1e90ff}Stalker rays !{ef4444}OFF'
    }));
});

// H (0x48) — Toggle ALPR debug rays
mp.keys.bind(0x48, true, () => {
    if (global.chatInputActive) return;
    alprDebug = !alprDebug;
    if (!alprDebug) alprRays = [];
    mp.events.call('chat:receive', JSON.stringify({
        type: 'system',
        text: alprDebug
            ? '!{f59e0b}[DEBUG] !{ffc800}ALPR rays !{22c55e}ON !{FFFFFF}(galben=miss, rosu=hit)'
            : '!{f59e0b}[DEBUG] !{ffc800}ALPR rays !{ef4444}OFF'
    }));
});

// K (0x4B) — Save debug log to server JSON
mp.keys.bind(0x4B, true, () => {
    if (global.chatInputActive) return;
    if (debugLog.length === 0) {
        mp.events.call('chat:receive', JSON.stringify({
            type: 'system',
            text: '!{f59e0b}[DEBUG] !{FFFFFF}Nu exista loguri de salvat.'
        }));
        return;
    }
    // Send log to server to save as JSON
    mp.events.callRemote('debug:saveLog', JSON.stringify(debugLog));
    mp.events.call('chat:receive', JSON.stringify({
        type: 'system',
        text: `!{f59e0b}[DEBUG] !{22c55e}${debugLog.length} loguri trimise la server pentru salvare.`
    }));
});

// ──────────────────────────────────────────
// EXPORT via global for other scripts
// ──────────────────────────────────────────
global.radarDebug = {
    isStalkerDebug,
    isAlprDebug,
    clearStalkerRays,
    clearAlprRays,
    pushStalkerRay,
    pushAlprRay,
    addDebugLog,
    getDebugLog,
    clearDebugLog
};
