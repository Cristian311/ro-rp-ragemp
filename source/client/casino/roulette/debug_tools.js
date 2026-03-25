// client_packages/roulette/debug_tools.js — Debug tools for roulette (admin 3+ only)
// Keys: F = calibration, G = debug grid, H = grid editor, J = offset editor

const KEY_F   = 0x46;
const KEY_G   = 0x47;
const KEY_H   = 0x48;
const KEY_TAB = 0x09;
const KEY_UP  = 0x26;
const KEY_DN  = 0x28;
const KEY_LT  = 0x25;
const KEY_RT  = 0x27;

function isAdmin3() {
    return (mp.players.local.getVariable('adminLevel') || 0) >= 3;
}

function getShared() { return global.rouletteShared; }
function getDbg()    { return global.rouletteDebug; }

// ──────────────────────────────────────────
// GRID EDITOR (H key)
// ──────────────────────────────────────────

function gridEditorNudge(dx, dy) {
    const shared = getShared();
    const dbg = getDbg();
    const key = shared.CORNER_KEYS[dbg.gridEditorCorner];
    if (!shared.localCorners[key]) return;
    shared.localCorners[key].f += dy;
    shared.localCorners[key].r += dx;
}

mp.keys.bind(KEY_H, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    const shared = getShared();
    const dbg = getDbg();
    if (!shared.isAtRouletteTable) return;
    dbg.gridEditorActive = !dbg.gridEditorActive;
    if (dbg.gridEditorActive) {
        dbg.gridEditorBackup = JSON.parse(JSON.stringify(shared.localCorners));
        dbg.showDebugGrid = true;
        try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: '[EDITOR] Grid editor ON — Tab: colt, Sageti: muta, LMB: pune la crosshair, R: revert, H: salveaza'})); } catch(e) {}
    } else {
        if (shared.localCorners.c1) {
            mp.console.logInfo('=== GRID EDITOR SAVED (LOCAL) ===');
            for (const k of shared.CORNER_KEYS) {
                const c = shared.localCorners[k];
                if (c) mp.console.logInfo(`  ${k}: F:${c.f.toFixed(4)} R:${c.r.toFixed(4)} U:${c.u.toFixed(4)}`);
            }
            mp.console.logInfo('=================================');
            try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: '[EDITOR] Grid salvat!'})); } catch(e) {}
            mp.events.callRemote('Roulette:SaveGridCorners', 'global', JSON.stringify(shared.localCorners));
        }
    }
});

// Tab = cycle grid editor corner
mp.keys.bind(KEY_TAB, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    const shared = getShared();
    const dbg = getDbg();
    if (!shared.isAtRouletteTable || !dbg.gridEditorActive) return;
    dbg.gridEditorCorner = (dbg.gridEditorCorner + 1) % shared.CORNER_KEYS.length;
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[EDITOR] Colt: ${shared.CORNER_NAMES[dbg.gridEditorCorner]}`})); } catch(e) {}
});

// R = revert grid to backup
mp.keys.bind(0x52, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    const shared = getShared();
    const dbg = getDbg();
    if (!shared.isAtRouletteTable || !dbg.gridEditorActive) return;
    if (dbg.gridEditorBackup) {
        for (const k of shared.CORNER_KEYS) {
            if (dbg.gridEditorBackup[k]) shared.localCorners[k] = { ...dbg.gridEditorBackup[k] };
            else shared.localCorners[k] = null;
        }
        try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: '[EDITOR] Grid reverted la starea anterioara!'})); } catch(e) {}
    }
});

// Arrow keys for grid editor nudging
mp.keys.bind(KEY_UP, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    if (!getShared().isAtRouletteTable || !getDbg().gridEditorActive) return;
    gridEditorNudge(0, mp.keys.isDown(0x10) ? 0.02 : 0.005);
});
mp.keys.bind(KEY_DN, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    if (!getShared().isAtRouletteTable || !getDbg().gridEditorActive) return;
    gridEditorNudge(0, -(mp.keys.isDown(0x10) ? 0.02 : 0.005));
});
mp.keys.bind(KEY_RT, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    if (!getShared().isAtRouletteTable || !getDbg().gridEditorActive) return;
    gridEditorNudge(mp.keys.isDown(0x10) ? 0.02 : 0.005, 0);
});
mp.keys.bind(KEY_LT, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    if (!getShared().isAtRouletteTable || !getDbg().gridEditorActive) return;
    gridEditorNudge(-(mp.keys.isDown(0x10) ? 0.02 : 0.005), 0);
});

// ──────────────────────────────────────────
// OFFSET EDITOR (J key)
// ──────────────────────────────────────────

let offsetEditorZone = 0;
const OFFSET_ZONE_NAMES = ['2:1', '0', '00'];
function getOffsetRef(idx) {
    const shared = getShared();
    return [shared.OFFSET_21, shared.OFFSET_0, shared.OFFSET_00][idx];
}

mp.keys.bind(0x4A, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    const shared = getShared();
    const dbg = getDbg();
    if (!shared.isAtRouletteTable) return;
    dbg.offsetEditorActive = !dbg.offsetEditorActive;
    if (dbg.offsetEditorActive) {
        offsetEditorZone = 0;
        try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: '[OFFSET] Editor ON — Tab=cycle zone, Arrows=nudge, Shift=big step, J=off'})); } catch(e) {}
        try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[OFFSET] Editing: ${OFFSET_ZONE_NAMES[offsetEditorZone]}`})); } catch(e) {}
    } else {
        try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: '[OFFSET] Editor OFF'})); } catch(e) {}
        try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[OFFSET] Final values — OFFSET_21: f=${shared.OFFSET_21.f.toFixed(4)} r=${shared.OFFSET_21.r.toFixed(4)} | OFFSET_0: f=${shared.OFFSET_0.f.toFixed(4)} r=${shared.OFFSET_0.r.toFixed(4)} | OFFSET_00: f=${shared.OFFSET_00.f.toFixed(4)} r=${shared.OFFSET_00.r.toFixed(4)}`})); } catch(e) {}
    }
});

// Tab = cycle offset zone
mp.keys.bind(0x09, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    const dbg = getDbg();
    if (!getShared().isAtRouletteTable || !dbg.offsetEditorActive) return;
    offsetEditorZone = (offsetEditorZone + 1) % 3;
    const off = getOffsetRef(offsetEditorZone);
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[OFFSET] Editing: ${OFFSET_ZONE_NAMES[offsetEditorZone]} (f=${off.f.toFixed(4)} r=${off.r.toFixed(4)})`})); } catch(e) {}
});

// Arrow keys for offset nudging (only when offset editor active and grid editor NOT)
mp.keys.bind(KEY_UP, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    const dbg = getDbg();
    if (!getShared().isAtRouletteTable || !dbg.offsetEditorActive || dbg.gridEditorActive) return;
    const off = getOffsetRef(offsetEditorZone);
    off.f += mp.keys.isDown(0x10) ? 0.02 : 0.005;
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[OFFSET] ${OFFSET_ZONE_NAMES[offsetEditorZone]} f=${off.f.toFixed(4)} r=${off.r.toFixed(4)}`})); } catch(e) {}
});
mp.keys.bind(KEY_DN, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    const dbg = getDbg();
    if (!getShared().isAtRouletteTable || !dbg.offsetEditorActive || dbg.gridEditorActive) return;
    const off = getOffsetRef(offsetEditorZone);
    off.f -= mp.keys.isDown(0x10) ? 0.02 : 0.005;
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[OFFSET] ${OFFSET_ZONE_NAMES[offsetEditorZone]} f=${off.f.toFixed(4)} r=${off.r.toFixed(4)}`})); } catch(e) {}
});
mp.keys.bind(KEY_RT, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    const dbg = getDbg();
    if (!getShared().isAtRouletteTable || !dbg.offsetEditorActive || dbg.gridEditorActive) return;
    const off = getOffsetRef(offsetEditorZone);
    off.r += mp.keys.isDown(0x10) ? 0.02 : 0.005;
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[OFFSET] ${OFFSET_ZONE_NAMES[offsetEditorZone]} f=${off.f.toFixed(4)} r=${off.r.toFixed(4)}`})); } catch(e) {}
});
mp.keys.bind(KEY_LT, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    const dbg = getDbg();
    if (!getShared().isAtRouletteTable || !dbg.offsetEditorActive || dbg.gridEditorActive) return;
    const off = getOffsetRef(offsetEditorZone);
    off.r -= mp.keys.isDown(0x10) ? 0.02 : 0.005;
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[OFFSET] ${OFFSET_ZONE_NAMES[offsetEditorZone]} f=${off.f.toFixed(4)} r=${off.r.toFixed(4)}`})); } catch(e) {}
});

// ──────────────────────────────────────────
// CALIBRATION MODE (F key — 14 clicks)
// ──────────────────────────────────────────

function calLog(msg) {
    const dbg = getDbg();
    mp.console.logInfo('[CAL] ' + msg);
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: '[CAL] ' + msg})); } catch(e) {}
    dbg.calibrationMessages.push(msg);
    if (dbg.calibrationMessages.length > 10) dbg.calibrationMessages.shift();
    dbg.calibrationMsgTime = Date.now();
}

function startCalibration() {
    const shared = getShared();
    const dbg = getDbg();
    dbg.calibrationActive = true;
    dbg.calibrationStep = 0;
    dbg.calibrationMessages = [];
    calLog(`Calibrare: ${shared.CORNER_KEYS.length} clickuri`);
    calLog(`>> Click pe CENTRUL: ${shared.CORNER_NAMES[0]} (1/${shared.CORNER_KEYS.length})`);
}

function recordCalibrationPoint(loc) {
    const shared = getShared();
    const dbg = getDbg();
    const label = shared.CORNER_NAMES[dbg.calibrationStep];
    const key = shared.CORNER_KEYS[dbg.calibrationStep];
    shared.localCorners[key] = { f: loc.f, r: loc.r, u: shared.TABLE_SURFACE_U };
    calLog(`${label} -> F:${loc.f.toFixed(4)} R:${loc.r.toFixed(4)}`);
    dbg.calibrationStep++;
    if (dbg.calibrationStep < shared.CORNER_KEYS.length) {
        calLog(`>> Click pe CENTRUL: ${shared.CORNER_NAMES[dbg.calibrationStep]} (${dbg.calibrationStep+1}/${shared.CORNER_KEYS.length})`);
    } else {
        finishCalibration();
    }
}

function finishCalibration() {
    const shared = getShared();
    const dbg = getDbg();
    dbg.calibrationActive = false;
    calLog('=== CALIBRARE COMPLETA ===');
    const required = ['c1', 'c3', 'c34', 'c36'];
    if (required.every(k => shared.localCorners[k])) {
        for (const k of shared.CORNER_KEYS) {
            if (shared.localCorners[k]) shared.localCorners[k].u = shared.TABLE_SURFACE_U;
        }
        calLog('Grid salvat in coordonate locale (relativ la masa)!');
        calLog('Functioneaza pe ORICE masa cu aceeasi orientare.');
        for (const k of shared.CORNER_KEYS) {
            const c = shared.localCorners[k];
            if (c) calLog(`${k}: F:${c.f.toFixed(4)} R:${c.r.toFixed(4)}`);
        }
        mp.events.callRemote('Roulette:SaveGridCorners', 'global', JSON.stringify(shared.localCorners));
    } else {
        calLog('EROARE: Nu toate colturile obligatorii au fost calibrate!');
    }
}

// Register recordCalibrationPoint on global so index.js render loop can call it
if (global.rouletteDebug) {
    global.rouletteDebug.recordCalibrationPoint = recordCalibrationPoint;
}

// F = toggle calibration
mp.keys.bind(KEY_F, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    const dbg = getDbg();
    if (!getShared().isAtRouletteTable) return;
    if (dbg.calibrationActive) {
        dbg.calibrationActive = false;
        dbg.calibrationStep = 0;
        dbg.calibrationMessages = ['Calibrare anulata.'];
        dbg.calibrationMsgTime = Date.now();
    } else {
        startCalibration();
    }
});

// G = toggle debug grid overlay
mp.keys.bind(KEY_G, true, () => {
    if (global.chatInputActive) return;
    if (!isAdmin3()) return;
    const dbg = getDbg();
    if (!getShared().isAtRouletteTable) return;
    dbg.showDebugGrid = !dbg.showDebugGrid;
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[DEBUG] Grid overlay: ${dbg.showDebugGrid ? 'ON' : 'OFF'}`})); } catch(e) {}
});

console.log('[Roulette Debug Tools] Loaded — requires admin level 3');
