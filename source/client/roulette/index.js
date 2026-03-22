// client_packages/roulette/index.js — Orbit camera + raytrace betting + native animations

let rouletteBrowser = null;

const KEY_E   = 0x45;
const KEY_F   = 0x46;
const KEY_G   = 0x47;
const KEY_H   = 0x48;
const KEY_ESC = 0x1B;
const KEY_LMB = 0x01;
const KEY_TAB = 0x09;
const KEY_UP  = 0x26;
const KEY_DN  = 0x28;
const KEY_LT  = 0x25;
const KEY_RT  = 0x27;

const ANIM_LIB = 'anim_casino_b@amb@casino@games@roulette@table';

// ──────────────────────────────────────────
// NATIVE TABLE / BALL OBJECTS
// ──────────────────────────────────────────
let nativeRouletteTable = null;
let nativeRouletteBall  = null;
let nativeTablePos      = null;
let nativeTableHeading  = 0;
let hiddenServerProp    = null;
let isAtRouletteTable   = false;
let currentTableIndex   = -1;
let placedChipObjects   = [];

const NUMBER_TO_ANIM = {
    8: 1, 19: 2, 31: 3, 18: 4, 6: 5, 21: 6, 33: 7, 16: 8,
    4: 9, 23: 10, 35: 11, 14: 12, 2: 13, 0: 14, 28: 15, 9: 16,
    26: 17, 30: 18, 11: 19, 7: 20, 20: 21, 32: 22, 17: 23, 5: 24,
    22: 25, 34: 26, 15: 27, 3: 28, 24: 29, 36: 30, 13: 31, 1: 32,
    '00': 33, 27: 34, 10: 35, 25: 36, 29: 37, 12: 38
};

function loadAnimDict(dict) {
    return new Promise((resolve) => {
        if (mp.game.streaming.hasAnimDictLoaded(dict)) { resolve(); return; }
        mp.game.streaming.requestAnimDict(dict);
        let check = setInterval(() => {
            if (mp.game.streaming.hasAnimDictLoaded(dict)) { clearInterval(check); resolve(); }
        }, 50);
    });
}

// ──────────────────────────────────────────
// NATIVE ROULETTE SPAWN / DESTROY
// ──────────────────────────────────────────
function spawnNativeRoulette(tableX, tableY, tableZ, tableHeading) {
    destroyNativeRoulette();
    const tableHash = mp.game.joaat('vw_prop_casino_roulette_01');
    const serverObj = mp.game.object.getClosestObjectOfType(
        tableX, tableY, tableZ, 5.0, tableHash, false, false, false);
    if (serverObj && serverObj !== 0) {
        mp.game.entity.setVisible(serverObj, false, false);
        hiddenServerProp = serverObj;
    }
    const pos = new mp.Vector3(tableX, tableY, tableZ);
    nativeTablePos = pos;
    nativeTableHeading = tableHeading;
    nativeRouletteTable = mp.objects.new(mp.game.joaat('vw_prop_casino_roulette_01'), pos);
    nativeRouletteTable.rotation = new mp.Vector3(0, 0, tableHeading);

    // Rotate ball offset by heading so it lands on the wheel
    const hRadSpawn = tableHeading * Math.PI / 180;
    const bx = -0.734742, by = -0.16617;
    const rbx = bx * Math.cos(hRadSpawn) - by * Math.sin(hRadSpawn);
    const rby = bx * Math.sin(hRadSpawn) + by * Math.cos(hRadSpawn);
    nativeRouletteBall = mp.objects.new(mp.game.joaat('vw_prop_roulette_ball'),
        new mp.Vector3(pos.x + rbx, pos.y + rby, pos.z + 1.0715));
    nativeRouletteBall.attachTo(nativeRouletteTable.handle, 0, 0, 0, 0, 0, 0, 0, true, true, false, false, 0, false);
}

function destroyNativeRoulette() {
    if (nativeRouletteTable) { nativeRouletteTable.destroy(); nativeRouletteTable = null; }
    if (nativeRouletteBall)  { nativeRouletteBall.destroy();  nativeRouletteBall  = null; }
    if (hiddenServerProp) {
        try { mp.game.entity.setVisible(hiddenServerProp, true, false); } catch(e) {}
        hiddenServerProp = null;
    }
    nativeTablePos = null;
    nativeTableHeading = 0;
}

function playAllAnimations(winningNumber) {
    if (!nativeRouletteTable || !nativeRouletteBall) return;
    const animIndex = NUMBER_TO_ANIM[winningNumber] || NUMBER_TO_ANIM[0];
    if (nativeTablePos) {
        const hRadBall = nativeTableHeading * Math.PI / 180;
        const bxR = -0.734742, byR = -0.16617;
        const rbxR = bxR * Math.cos(hRadBall) - byR * Math.sin(hRadBall);
        const rbyR = bxR * Math.sin(hRadBall) + byR * Math.cos(hRadBall);
        nativeRouletteBall.position = new mp.Vector3(
            nativeTablePos.x + rbxR, nativeTablePos.y + rbyR, nativeTablePos.z + 1.0715);
        nativeRouletteBall.rotation = new mp.Vector3(0, 0, 32.6 + nativeTableHeading);
    }
    nativeRouletteBall.playAnim('intro_ball', ANIM_LIB, 1000.0, false, true, true, 0, 136704);
    nativeRouletteBall.playAnim('loop_ball',  ANIM_LIB, 1000.0, false, true, false, 0, 136704);
    nativeRouletteTable.playAnim('intro_wheel', ANIM_LIB, 1000.0, false, true, true, 0, 136704);
    nativeRouletteTable.playAnim('loop_wheel',  ANIM_LIB, 1000.0, false, true, false, 0, 136704);
    nativeRouletteBall.playAnim(`exit_${animIndex}_ball`,   ANIM_LIB, 1000.0, false, true, false, 0, 136704);
    nativeRouletteTable.playAnim(`exit_${animIndex}_wheel`, ANIM_LIB, 1000.0, false, true, false, 0, 136704);
}

// (no custom camera — uses normal gameplay camera)

// ──────────────────────────────────────────
// RAYTRACE
// ──────────────────────────────────────────
let rayHitPos     = null;
let rayPlanePos   = null;
let rayHitBetZone = null;
let selectedChipAmount = 10;

const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
function getNumberColor(n) {
    if (n === 0 || n === '00') return 'green';
    if (RED_NUMBERS.includes(n)) return 'red';
    return 'black';
}

const GRID_ROWS = [
    [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
    [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
    [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
];

// Grid positions for each number: col 0-11, row 0-2
const NUM_GRID = {};
for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 12; c++) {
        NUM_GRID[GRID_ROWS[r][c]] = { col: c, row: r };
    }
}

// ──────────────────────────────────────────
// GRID SYSTEM — LOCAL COORDINATES (relative to table pos + heading)
// One calibration works for ALL tables of same model
// ──────────────────────────────────────────

// Convert world position to local (forward, right) relative to table
function worldToLocal(wx, wy, wz) {
    if (!nativeTablePos) return null;
    const dx = wx - nativeTablePos.x;
    const dy = wy - nativeTablePos.y;
    const dz = wz - nativeTablePos.z;
    const hRad = nativeTableHeading * Math.PI / 180;
    return {
        f: dx * (-Math.sin(hRad)) + dy * Math.cos(hRad),
        r: dx * Math.cos(hRad) + dy * Math.sin(hRad),
        u: dz
    };
}

// Convert local (forward, right) to world position using current table
function localToWorld(f, r, u) {
    if (!nativeTablePos) return null;
    const hRad = nativeTableHeading * Math.PI / 180;
    return new mp.Vector3(
        nativeTablePos.x + f * (-Math.sin(hRad)) + r * Math.cos(hRad),
        nativeTablePos.y + f * Math.cos(hRad) + r * Math.sin(hRad),
        nativeTablePos.z + u
    );
}

// Local offsets for 8 calibration corners {f, r, u}
let localCorners = {
    c1:  null,  // number 1  (col 0, row 0)
    c3:  null,  // number 3  (col 0, row 2)
    c16: null,  // number 16 (col 5, row 0)
    c18: null,  // number 18 (col 5, row 2)
    c34: null,  // number 34 (col 11, row 0)
    c36: null,  // number 36 (col 11, row 2)
    cBotL: null, // "1-18" zone center  (col 0.5, row -1.25)
    cBotR: null, // "19-36" zone center (col 10.5, row -1.25)
};
const CORNER_KEYS = ['c1', 'c3', 'c16', 'c18', 'c34', 'c36', 'cBotL', 'cBotR'];
const CORNER_NAMES = ['nr 1', 'nr 3', 'nr 16', 'nr 18', 'nr 34', 'nr 36', '1-18 (stanga-jos)', '19-36 (dreapta-jos)'];
const CORNER_COLORS = [[255,255,0], [0,255,255], [255,128,0], [0,255,128], [255,0,255], [0,255,0], [255,100,100], [100,100,255]];

// Piecewise bilinear interpolation in LOCAL space, then convert to world
function gridToWorld(c, r) {
    if (!localCorners.c1 || !localCorners.c3 || !localCorners.c34 || !localCorners.c36) return null;
    let lf, lr, lu;

    // For rows below 0 (dozens, outside bets): use bottom calibration points
    if (r < 0 && localCorners.cBotL && localCorners.cBotR) {
        // Top reference: point at (c, 0) from the number grid
        const top = gridToLocal(c, 0);
        if (!top) return null;
        // Bottom reference: lerp between cBotL (col 0.5) and cBotR (col 10.5)
        const uBot = Math.max(0, Math.min(1, (c - 0.5) / 10.0));
        const botF = (1-uBot) * localCorners.cBotL.f + uBot * localCorners.cBotR.f;
        const botR = (1-uBot) * localCorners.cBotL.r + uBot * localCorners.cBotR.r;
        const botU = (1-uBot) * localCorners.cBotL.u + uBot * localCorners.cBotR.u;
        // t: 0 at row 0, 1 at row -1.25 (where bottom cal points are)
        const t = Math.abs(r) / 1.25;
        lf = top.f + t * (botF - top.f);
        lr = top.r + t * (botR - top.r);
        lu = top.u + t * (botU - top.u);
        return localToWorld(lf, lr, lu);
    }

    const v = r / 2;

    // Piecewise: split at col 5 if middle points exist
    if (localCorners.c16 && localCorners.c18) {
        let l0, l2, r0, r2, u;
        if (c <= 5) {
            l0 = localCorners.c1; l2 = localCorners.c3;
            r0 = localCorners.c16; r2 = localCorners.c18;
            u = c / 5;
        } else {
            l0 = localCorners.c16; l2 = localCorners.c18;
            r0 = localCorners.c34; r2 = localCorners.c36;
            u = (c - 5) / 6;
        }
        lf = (1-u)*(1-v)*l0.f + u*(1-v)*r0.f + (1-u)*v*l2.f + u*v*r2.f;
        lr = (1-u)*(1-v)*l0.r + u*(1-v)*r0.r + (1-u)*v*l2.r + u*v*r2.r;
        lu = (1-u)*(1-v)*l0.u + u*(1-v)*r0.u + (1-u)*v*l2.u + u*v*r2.u;
    } else {
        const u = c / 11;
        lf = (1-u)*(1-v)*localCorners.c1.f + u*(1-v)*localCorners.c34.f + (1-u)*v*localCorners.c3.f + u*v*localCorners.c36.f;
        lr = (1-u)*(1-v)*localCorners.c1.r + u*(1-v)*localCorners.c34.r + (1-u)*v*localCorners.c3.r + u*v*localCorners.c36.r;
        lu = (1-u)*(1-v)*localCorners.c1.u + u*(1-v)*localCorners.c34.u + (1-u)*v*localCorners.c3.u + u*v*localCorners.c36.u;
    }

    return localToWorld(lf, lr, lu);
}

// Helper: get local coords for a grid point (rows >= 0 only, for number grid)
function gridToLocal(c, r) {
    if (!localCorners.c1 || !localCorners.c3 || !localCorners.c34 || !localCorners.c36) return null;
    const v = r / 2;
    if (localCorners.c16 && localCorners.c18) {
        let l0, l2, r0, r2, u;
        if (c <= 5) {
            l0 = localCorners.c1; l2 = localCorners.c3;
            r0 = localCorners.c16; r2 = localCorners.c18;
            u = c / 5;
        } else {
            l0 = localCorners.c16; l2 = localCorners.c18;
            r0 = localCorners.c34; r2 = localCorners.c36;
            u = (c - 5) / 6;
        }
        return {
            f: (1-u)*(1-v)*l0.f + u*(1-v)*r0.f + (1-u)*v*l2.f + u*v*r2.f,
            r: (1-u)*(1-v)*l0.r + u*(1-v)*r0.r + (1-u)*v*l2.r + u*v*r2.r,
            u: (1-u)*(1-v)*l0.u + u*(1-v)*r0.u + (1-u)*v*l2.u + u*v*r2.u
        };
    }
    const u = c / 11;
    return {
        f: (1-u)*(1-v)*localCorners.c1.f + u*(1-v)*localCorners.c34.f + (1-u)*v*localCorners.c3.f + u*v*localCorners.c36.f,
        r: (1-u)*(1-v)*localCorners.c1.r + u*(1-v)*localCorners.c34.r + (1-u)*v*localCorners.c3.r + u*v*localCorners.c36.r,
        u: (1-u)*(1-v)*localCorners.c1.u + u*(1-v)*localCorners.c34.u + (1-u)*v*localCorners.c3.u + u*v*localCorners.c36.u
    };
}

let BET_ZONES = [];
function rebuildBetZones() {
    BET_ZONES = [];
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 12; c++) {
            const num = GRID_ROWS[r][c];
            BET_ZONES.push({ type: 'straight', value: num, label: `${num}`, color: getNumberColor(num), col: c, row: r });
        }
    }
    BET_ZONES.push({ type: 'straight', value: 0, label: '0', color: 'green', col: -1, row: 0.5 });
    BET_ZONES.push({ type: 'straight', value: '00', label: '00', color: 'green', col: -1, row: 1.5 });
    // Dozens: each spans 4 cols, half-row height below the numbers
    for (let d = 0; d < 3; d++) {
        BET_ZONES.push({ type: 'dozen', value: d + 1, label: `${d === 0 ? '1st' : d === 1 ? '2nd' : '3rd'} 12`, color: 'white', col: d * 4 + 1.5, row: -0.75 });
    }
    // Columns (2:1): right side of grid
    for (let r = 0; r < 3; r++) {
        BET_ZONES.push({ type: 'column', value: r + 1, label: `2:1`, color: 'white', col: 12, row: r });
    }
    // Outside bets: each spans 2 cols, half-row below dozens
    const OUTSIDE = [
        { type: 'low', value: null, label: '1-18', color: 'white' },
        { type: 'even', value: null, label: 'EVEN', color: 'white' },
        { type: 'red', value: null, label: 'RED', color: 'red' },
        { type: 'black', value: null, label: 'BLACK', color: 'black' },
        { type: 'odd', value: null, label: 'ODD', color: 'white' },
        { type: 'high', value: null, label: '19-36', color: 'white' },
    ];
    for (let i = 0; i < 6; i++) {
        BET_ZONES.push({ ...OUTSIDE[i], col: i * 2 + 0.5, row: -1.25 });
    }
}
rebuildBetZones();

function getBetZoneFromHit(hitX, hitY) {
    if (!localCorners.c1) return null;
    let bestD2 = Infinity, best = null;
    for (const z of BET_ZONES) {
        const wp = gridToWorld(z.col, z.row);
        if (!wp) continue;
        const d2 = (hitX - wp.x) ** 2 + (hitY - wp.y) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = z; }
    }
    nearestDist2 = bestD2;
    if (best && bestD2 < 0.04) return best;
    return null;
}

let nearestDist2 = 0;
let showDebugGrid = false;

// ──────────────────────────────────────────
// GRID EDITOR MODE (press H)
// ──────────────────────────────────────────
let gridEditorActive = false;
let gridEditorCorner = 0;

function gridEditorNudge(dx, dy) {
    const key = CORNER_KEYS[gridEditorCorner];
    if (!localCorners[key]) return;
    localCorners[key].f += dy; // forward
    localCorners[key].r += dx; // right
}

mp.keys.bind(KEY_H, true, () => {
    if (!isAtRouletteTable) return;
    gridEditorActive = !gridEditorActive;
    if (gridEditorActive) {
        showDebugGrid = true;
        try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: '[EDITOR] Grid editor ON — Tab: colt, Sageti: muta, LMB: pune la crosshair, H: salveaza'})); } catch(e) {}
    } else {
        if (localCorners.c1) {
            mp.console.logInfo('=== GRID EDITOR SAVED (LOCAL) ===');
            for (const k of CORNER_KEYS) {
                const c = localCorners[k];
                if (c) mp.console.logInfo(`  ${k}: F:${c.f.toFixed(4)} R:${c.r.toFixed(4)} U:${c.u.toFixed(4)}`);
            }
            mp.console.logInfo('=================================');
            try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: '[EDITOR] Grid salvat!'})); } catch(e) {}
            mp.events.callRemote('Roulette:SaveGridCorners', 'global', JSON.stringify(localCorners));
        }
    }
});

mp.keys.bind(KEY_TAB, true, () => {
    if (!isAtRouletteTable || !gridEditorActive) return;
    gridEditorCorner = (gridEditorCorner + 1) % CORNER_KEYS.length;
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[EDITOR] Colt: ${CORNER_NAMES[gridEditorCorner]}`})); } catch(e) {}
});

mp.keys.bind(KEY_UP, true, () => {
    if (!isAtRouletteTable || !gridEditorActive) return;
    const s = mp.keys.isDown(0x10) ? 0.02 : 0.005;
    gridEditorNudge(0, s);
});
mp.keys.bind(KEY_DN, true, () => {
    if (!isAtRouletteTable || !gridEditorActive) return;
    const s = mp.keys.isDown(0x10) ? 0.02 : 0.005;
    gridEditorNudge(0, -s);
});
mp.keys.bind(KEY_RT, true, () => {
    if (!isAtRouletteTable || !gridEditorActive) return;
    const s = mp.keys.isDown(0x10) ? 0.02 : 0.005;
    gridEditorNudge(s, 0);
});
mp.keys.bind(KEY_LT, true, () => {
    if (!isAtRouletteTable || !gridEditorActive) return;
    const s = mp.keys.isDown(0x10) ? 0.02 : 0.005;
    gridEditorNudge(-s, 0);
});

// ──────────────────────────────────────────
// CALIBRATION MODE (press F — 8 clicks: 1, 3, 16, 18, 34, 36, 1-18, 19-36)
// ──────────────────────────────────────────
let calibrationActive = false;
let calibrationStep = 0;
let calibrationMessages = [];
let calibrationMsgTime = 0;
const CALIBRATION_SEQUENCE = ['1', '3', '16', '18', '34', '36', '1-18', '19-36'];
const CALIBRATION_LABELS = ['numarul 1', 'numarul 3', 'numarul 16', 'numarul 18', 'numarul 34', 'numarul 36', 'zona 1-18 (stanga-jos)', 'zona 19-36 (dreapta-jos)'];

function calLog(msg) {
    mp.console.logInfo('[CAL] ' + msg);
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: '[CAL] ' + msg})); } catch(e) {}
    calibrationMessages.push(msg);
    if (calibrationMessages.length > 10) calibrationMessages.shift();
    calibrationMsgTime = Date.now();
}

function startCalibration() {
    calibrationActive = true;
    calibrationStep = 0;
    calibrationMessages = [];
    calLog('Calibrare: 8 clickuri (6 numere + 2 zone laterale)');
    calLog(`>> Click pe CENTRUL: ${CALIBRATION_LABELS[0]} (1/${CALIBRATION_SEQUENCE.length})`);
}

function recordCalibrationPoint(loc) {
    const label = CALIBRATION_LABELS[calibrationStep];
    const key = CORNER_KEYS[calibrationStep];
    // For corners after c1, use c1's U to keep grid flat on table
    const fixedU = (calibrationStep > 0 && localCorners.c1) ? localCorners.c1.u : loc.u;
    localCorners[key] = { f: loc.f, r: loc.r, u: fixedU };
    calLog(`${label} -> F:${loc.f.toFixed(4)} R:${loc.r.toFixed(4)}${fixedU !== loc.u ? ' (U fixat)' : ''}`);
    calibrationStep++;
    if (calibrationStep < CALIBRATION_SEQUENCE.length) {
        calLog(`>> Click pe CENTRUL: ${CALIBRATION_LABELS[calibrationStep]} (${calibrationStep+1}/${CALIBRATION_SEQUENCE.length})`);
    } else {
        finishCalibration();
    }
}

function finishCalibration() {
    calibrationActive = false;
    calLog('=== CALIBRARE COMPLETA ===');
    if (localCorners.c1 && localCorners.c3 && localCorners.c16 && localCorners.c18 && localCorners.c34 && localCorners.c36 && localCorners.cBotL && localCorners.cBotR) {
        const tableU = localCorners.c1.u;
        localCorners.c3.u  = tableU;
        localCorners.c16.u = tableU;
        localCorners.c18.u = tableU;
        localCorners.c34.u = tableU;
        localCorners.c36.u = tableU;
        localCorners.cBotL.u = tableU;
        localCorners.cBotR.u = tableU;
        calLog('Grid salvat in coordonate locale (relativ la masa)!');
        calLog('Functioneaza pe ORICE masa cu aceeasi orientare.');
        for (const k of CORNER_KEYS) {
            const c = localCorners[k];
            if (c) calLog(`${k}: F:${c.f.toFixed(4)} R:${c.r.toFixed(4)}`);
        }
        // Save with key 'global' so it applies to all tables
        mp.events.callRemote('Roulette:SaveGridCorners', 'global', JSON.stringify(localCorners));
    } else {
        calLog('EROARE: Nu toate colturile au fost calibrate!');
    }
}

mp.keys.bind(KEY_F, true, () => {
    if (!isAtRouletteTable) return;
    if (calibrationActive) {
        calibrationActive = false;
        calibrationStep = 0;
        calibrationMessages = ['Calibrare anulata.'];
        calibrationMsgTime = Date.now();
    } else {
        startCalibration();
    }
});

mp.keys.bind(KEY_G, true, () => {
    if (!isAtRouletteTable) return;
    showDebugGrid = !showDebugGrid;
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[DEBUG] Grid overlay: ${showDebugGrid ? 'ON' : 'OFF'}`})); } catch(e) {}
});

// ──────────────────────────────────────────
// RENDER LOOP — raytrace from gameplay camera + LMB bet
// ──────────────────────────────────────────
let lmbWasPressed = false;

mp.events.add('render', () => {
    if (!isAtRouletteTable) return;

    // Disable attack/aim so LMB/RMB don't shoot
    mp.game.controls.disableControlAction(0, 24, true);  // attack
    mp.game.controls.disableControlAction(0, 25, true);  // aim
    mp.game.controls.disableControlAction(0, 142, true); // melee

    // ── LMB BET ──
    const lmbNow = mp.game.controls.isDisabledControlPressed(0, 24);
    if (lmbNow && !lmbWasPressed) {
        if (gridEditorActive && (rayPlanePos || rayHitPos)) {
            const pos = rayPlanePos || rayHitPos;
            const key = CORNER_KEYS[gridEditorCorner];
            const loc = worldToLocal(pos.x, pos.y, pos.z);
            if (loc) {
                const fixedU = (key !== 'c1' && localCorners.c1) ? localCorners.c1.u : loc.u;
                localCorners[key] = { f: loc.f, r: loc.r, u: fixedU };
                try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[EDITOR] ${CORNER_NAMES[gridEditorCorner]} = F:${loc.f.toFixed(3)} R:${loc.r.toFixed(3)}`})); } catch(e) {}
            }
        } else if (calibrationActive) {
            const pos = (calibrationStep === 0) ? rayHitPos : (rayPlanePos || rayHitPos);
            if (pos) {
                const loc = worldToLocal(pos.x, pos.y, pos.z);
                if (loc) recordCalibrationPoint(loc);
            }
        } else if ((rayPlanePos || rayHitPos) && rayHitBetZone) {
            mp.events.callRemote('Server_ReceiveRouletteBet', rayHitBetZone.type, String(rayHitBetZone.value), selectedChipAmount);
            const chipPos = rayPlanePos || rayHitPos;
            spawnChipOnTable(chipPos.x, chipPos.y, chipPos.z);
            try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[RULETA] Pariu: ${rayHitBetZone.label} - $${selectedChipAmount}`})); } catch(e) {}
        }
    }
    lmbWasPressed = lmbNow;

    // ── RAYTRACE from gameplay camera center ──
    const gpCam = mp.cameras.new('gameplay');
    const gameCam = gpCam.getCoord();
    const gameRot = gpCam.getRot(2);
    const pRad = gameRot.x * Math.PI / 180;
    const yRad = gameRot.z * Math.PI / 180;
    const dX = -Math.sin(yRad) * Math.cos(pRad);
    const dY =  Math.cos(yRad) * Math.cos(pRad);
    const dZ =  Math.sin(pRad);
    const rl = 20.0;
    const endP = new mp.Vector3(gameCam.x + dX * rl, gameCam.y + dY * rl, gameCam.z + dZ * rl);

    const ray = mp.raycasting.testPointToPoint(gameCam, endP, [mp.players.local.handle], 31);
    if (ray && ray.position) {
        rayHitPos = ray.position;
    } else {
        rayHitPos = null;
    }

    // Ray-plane intersection: project crosshair onto table surface
    // Uses c1 local U offset to get world Z of table surface
    rayPlanePos = null;
    if (localCorners.c1 && nativeTablePos && Math.abs(dZ) > 0.001) {
        const tableZ = nativeTablePos.z + localCorners.c1.u;
        const t = (tableZ - gameCam.z) / dZ;
        if (t > 0 && t < rl) {
            rayPlanePos = new mp.Vector3(gameCam.x + dX * t, gameCam.y + dY * t, tableZ);
        }
    }

    // Use plane projection for bet zone (accurate from any angle)
    if (rayPlanePos) {
        rayHitBetZone = getBetZoneFromHit(rayPlanePos.x, rayPlanePos.y);
    } else if (rayHitPos) {
        rayHitBetZone = getBetZoneFromHit(rayHitPos.x, rayHitPos.y);
    } else {
        rayHitBetZone = null;
    }

    // ── DRAW CROSSHAIR ──
    mp.game.graphics.drawRect(0.5, 0.5, 0.002, 0.016, 255, 215, 0, 200);
    mp.game.graphics.drawRect(0.5, 0.5, 0.016, 0.002, 255, 215, 0, 200);

    // ── CALIBRATION PROMPT ──
    if (calibrationActive && calibrationStep < CALIBRATION_SEQUENCE.length) {
        const calLabel = CALIBRATION_LABELS[calibrationStep];
        mp.game.graphics.drawText(
            `~r~CALIBRARE: ~y~Click pe ~g~${calLabel}`,
            [0.5, 0.12],
            { font: 4, color: [255, 255, 100, 255], scale: [0.55, 0.55], outline: true, centre: true }
        );
        mp.game.graphics.drawText(
            `~w~Pune crosshair-ul FIX pe ~y~CENTRUL ~w~zonei de pe masa`,
            [0.5, 0.16],
            { font: 4, color: [255, 255, 255, 230], scale: [0.3, 0.3], outline: true, centre: true }
        );
        mp.game.graphics.drawText(
            `~w~Pas ${calibrationStep + 1} / ${CALIBRATION_SEQUENCE.length}  ~y~(F = anuleaza)`,
            [0.5, 0.19],
            { font: 4, color: [200, 200, 200, 200], scale: [0.28, 0.28], outline: true, centre: true }
        );
    }

    // ── CALIBRATION LOG MESSAGES (on-screen) ──
    if (calibrationMessages.length > 0 && (Date.now() - calibrationMsgTime) < 10000) {
        for (let mi = 0; mi < calibrationMessages.length; mi++) {
            mp.game.graphics.drawText(
                `~y~[CAL] ~w~${calibrationMessages[mi]}`,
                [0.01, 0.25 + mi * 0.025],
                { font: 4, color: [200, 255, 200, 220], scale: [0.28, 0.28], outline: true, centre: false }
            );
        }
    }

    // ── DEBUG GRID OVERLAY ──
    if (showDebugGrid && localCorners.c1) {
        for (const z of BET_ZONES) {
            const wp = gridToWorld(z.col, z.row);
            if (!wp) continue;
            let mr = 255, mg = 255, mb = 255, ma = 200;
            if (z.color === 'red')   { mr = 255; mg = 50;  mb = 50; }
            if (z.color === 'black') { mr = 30;  mg = 30;  mb = 30; }
            if (z.color === 'green') { mr = 0;   mg = 200; mb = 60; }
            const sz = z.type === 'straight' ? 0.025 : 0.035;
            mp.game.graphics.drawMarker(25, wp.x, wp.y, wp.z + 0.003,
                0, 0, 0, 0, 0, 0, sz, sz, 0.005,
                mr, mg, mb, ma, false, false, 2, false, null, null, false);
            if (gridEditorActive || z.type !== 'straight') {
                const scr = mp.game.graphics.world3dToScreen2d(wp.x, wp.y, wp.z + 0.02);
                if (scr) mp.game.graphics.drawText(`~w~${z.label}`, scr,
                    { font: 4, color: [255,255,255,220], scale: [0.2, 0.2], outline: true, centre: true });
            }
        }
        // ── Grid lines ──
        // Main number grid: rows -0.5 to 2.5, cols -0.5 to 11.5
        const gridLines = [];
        // Horizontal: number rows
        for (let r = -0.5; r <= 2.5; r += 1.0) {
            gridLines.push([[-1.5, r], [12.5, r]]);
        }
        // Horizontal: dozen/outside half-rows
        gridLines.push([[-0.5, -1.0], [11.5, -1.0]]);  // between dozens and outside
        gridLines.push([[-0.5, -1.5], [11.5, -1.5]]);  // bottom of outside
        // Vertical: number columns
        for (let c = -0.5; c <= 11.5; c += 1.0) {
            gridLines.push([[c, -0.5], [c, 2.5]]);
        }
        // Vertical: 0/00 area
        gridLines.push([[-1.5, -0.5], [-1.5, 2.5]]);  // left edge of 0/00
        gridLines.push([[-0.5, 0.5], [-0.5, 1.5]]);   // we skip (already drawn) — 0/00 divider not needed if separate
        // Vertical: 2:1 column area
        gridLines.push([[12.5, -0.5], [12.5, 2.5]]);  // right edge of 2:1
        // Vertical: dozen dividers (every 4 cols)
        for (const c of [3.5, 7.5]) {
            gridLines.push([[c, -0.5], [c, -1.0]]);
        }
        // Vertical: outside dividers (every 2 cols)
        for (const c of [1.5, 3.5, 5.5, 7.5, 9.5]) {
            gridLines.push([[c, -1.0], [c, -1.5]]);
        }
        // Vertical: full-height edges for dozen+outside area
        gridLines.push([[-0.5, -0.5], [-0.5, -1.5]]);
        gridLines.push([[11.5, -0.5], [11.5, -1.5]]);

        for (const [from, to] of gridLines) {
            const a = gridToWorld(from[0], from[1]);
            const b = gridToWorld(to[0], to[1]);
            if (a && b) mp.game.graphics.drawLine(a.x, a.y, a.z, b.x, b.y, b.z, 255, 255, 0, 120);
        }
        if (gridEditorActive) {
            for (let ci = 0; ci < CORNER_KEYS.length; ci++) {
                const lc = localCorners[CORNER_KEYS[ci]];
                if (!lc) continue;
                const wc = localToWorld(lc.f, lc.r, lc.u);
                if (!wc) continue;
                const clr = CORNER_COLORS[ci];
                const isSel = ci === gridEditorCorner;
                mp.game.graphics.drawMarker(28, wc.x, wc.y, wc.z + 0.01,
                    0, 0, 0, 0, 0, 0, isSel ? 0.06 : 0.04, isSel ? 0.06 : 0.04, isSel ? 0.06 : 0.04,
                    clr[0], clr[1], clr[2], isSel ? 255 : 150, false, false, 2, false, null, null, false);
            }
        }
    }

    // ── GRID EDITOR HUD ──
    if (gridEditorActive) {
        const key = CORNER_KEYS[gridEditorCorner];
        const lc = localCorners[key];
        const cn = CORNER_NAMES[gridEditorCorner];
        const clr = CORNER_COLORS[gridEditorCorner];
        mp.game.graphics.drawText(
            `~y~GRID EDITOR  ~w~Colt: ~g~${cn}`,
            [0.5, 0.04],
            { font: 4, color: [clr[0], clr[1], clr[2], 255], scale: [0.45, 0.45], outline: true, centre: true }
        );
        if (lc) {
            mp.game.graphics.drawText(
                `~w~F: ~y~${lc.f.toFixed(4)}  ~w~R: ~y~${lc.r.toFixed(4)}  ~w~U: ~y~${lc.u.toFixed(4)}`,
                [0.5, 0.075],
                { font: 4, color: [255, 255, 255, 230], scale: [0.35, 0.35], outline: true, centre: true }
            );
        }
        mp.game.graphics.drawText(
            `~y~Tab~w~=schimba colt  ~y~Sageti~w~=muta(+Shift=rapid)  ~y~LMB~w~=pune la crosshair  ~y~H~w~=salveaza`,
            [0.5, 0.10],
            { font: 4, color: [200, 200, 200, 200], scale: [0.22, 0.22], outline: true, centre: true }
        );
    }

    // ── DRAW HIT MARKER ──
    const displayPos = rayPlanePos || rayHitPos;
    if (displayPos) {
        mp.game.graphics.drawMarker(28, displayPos.x, displayPos.y, displayPos.z + 0.01,
            0, 0, 0, 0, 0, 0, 0.015, 0.015, 0.015,
            255, 215, 0, 200, false, false, 2, false, null, null, false);

        if (rayHitBetZone) {
            const c = rayHitBetZone.color;
            const r = c === 'red' ? 255 : c === 'green' ? 0 : 255;
            const g = c === 'red' ? 60 : c === 'green' ? 200 : 255;
            const b = c === 'red' ? 60 : c === 'green' ? 60 : 255;
            mp.game.graphics.drawText(`${rayHitBetZone.label}`, [0.5, 0.56],
                { font: 4, color: [r, g, b, 255], scale: [0.45, 0.45], outline: true, centre: true });
        }

        // Debug: show world coords + nearest zone + distance
        {
            const dstr = Math.sqrt(nearestDist2).toFixed(3);
            const zLabel = rayHitBetZone ? rayHitBetZone.label : 'none';
            mp.game.graphics.drawText(`~w~X:${displayPos.x.toFixed(3)} Y:${displayPos.y.toFixed(3)}  Zone:${zLabel} Dist:${dstr}`, [0.5, 0.90],
                { font: 4, color: [200, 200, 200, 150], scale: [0.25, 0.25], outline: true, centre: true });
        }
    }

    mp.game.graphics.drawText(`~y~Chip: ~w~$${selectedChipAmount}`, [0.5, 0.62],
        { font: 4, color: [255, 255, 255, 200], scale: [0.35, 0.35], outline: true, centre: true });

    mp.game.graphics.drawText(
        `~y~LMB ~w~Pariu  ~y~[1-6] ~w~Chip  ~y~C ~w~Sterge  ~y~F ~w~Calibrare  ~y~G ~w~Grid  ~y~H ~w~Editor  ~y~ESC ~w~Iesire`,
        [0.5, 0.95], { font: 4, color: [200, 200, 200, 180], scale: [0.22, 0.22], outline: true, centre: true });
});

// ──────────────────────────────────────────
// CHIP SELECT (1-6) + PLACE (LMB) + CLEAR (C)
// ──────────────────────────────────────────
const CHIP_AMOUNTS = [10, 25, 50, 100, 500, 1000];
[0x31, 0x32, 0x33, 0x34, 0x35, 0x36].forEach((key, i) => {
    mp.keys.bind(key, true, () => {
        if (!isAtRouletteTable) return;
        selectedChipAmount = CHIP_AMOUNTS[i];
        mp.gui.chat.push(`~y~[RULETA] ~w~Chip: $${selectedChipAmount}`);
    });
});

// LMB bet is now handled inside the render loop via isDisabledControlPressed

mp.keys.bind(0x43, true, () => { // C key
    if (!isAtRouletteTable) return;
    mp.events.callRemote('Server_ClearRouletteBets');
    clearChipObjects();
    mp.gui.chat.push('~y~[RULETA] ~w~Pariuri sterse.');
});

function spawnChipOnTable(x, y, z) {
    try {
        const hashes = ['vw_prop_chip_10dollar_x1','vw_prop_chip_50dollar_x1','vw_prop_chip_100dollar_x1','vw_prop_chip_500dollar_x1'];
        const idx = selectedChipAmount <= 25 ? 0 : selectedChipAmount <= 50 ? 1 : selectedChipAmount <= 100 ? 2 : 3;
        // Place chip flat on table surface (z is already table surface from plane projection)
        const chip = mp.objects.new(mp.game.joaat(hashes[idx]),
            new mp.Vector3(x, y, z - 0.01 + placedChipObjects.length * 0.005));
        placedChipObjects.push(chip);
    } catch(e) {}
}

function clearChipObjects() {
    placedChipObjects.forEach(c => { try { c.destroy(); } catch(e) {} });
    placedChipObjects = [];
}

// ──────────────────────────────────────────
// KEY BINDS
// ──────────────────────────────────────────
mp.keys.bind(KEY_ESC, true, () => {
    if (isAtRouletteTable) {
        closeRouletteUI();
        mp.events.callRemote('Server_LeaveRouletteTable');
    }
});

// ──────────────────────────────────────────
// OPEN / CLOSE
// ──────────────────────────────────────────
mp.events.add('openRouletteUI', (tableX, tableY, tableZ, tableHeading, tableIndex) => {
    spawnNativeRoulette(tableX, tableY, tableZ, tableHeading);
    isAtRouletteTable = true;
    currentTableIndex = tableIndex !== undefined ? tableIndex : -1;
    loadAnimDict(ANIM_LIB);

    if (rouletteBrowser === null) {
        rouletteBrowser = mp.browsers.new('package://roulette/index.html');
    }
});

// Server sends saved grid corners on join
mp.events.add('rouletteLoadGridCorners', (cornersJson) => {
    try {
        const c = JSON.parse(cornersJson);
        if (c.c1 && c.c3 && c.c34 && c.c36) {
            const tableU = c.c1.u || 0;
            localCorners.c1  = { f: c.c1.f, r: c.c1.r, u: tableU };
            localCorners.c3  = { f: c.c3.f, r: c.c3.r, u: tableU };
            localCorners.c34 = { f: c.c34.f, r: c.c34.r, u: tableU };
            localCorners.c36 = { f: c.c36.f, r: c.c36.r, u: tableU };
            if (c.c16) localCorners.c16 = { f: c.c16.f, r: c.c16.r, u: tableU };
            if (c.c18) localCorners.c18 = { f: c.c18.f, r: c.c18.r, u: tableU };
            if (c.cBotL) localCorners.cBotL = { f: c.cBotL.f, r: c.cBotL.r, u: tableU };
            if (c.cBotR) localCorners.cBotR = { f: c.cBotR.f, r: c.cBotR.r, u: tableU };
            mp.console.logInfo('[GRID] Local corners loaded (F/R/U format)');
            try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: '[GRID] Grid incarcat (coordonate locale)'})); } catch(e) {}
        }
    } catch(e) { mp.console.logInfo('[GRID] Failed to parse: ' + e); }
});

function closeRouletteUI() {
    if (rouletteBrowser) { rouletteBrowser.destroy(); rouletteBrowser = null; }
    isAtRouletteTable = false;
    currentTableIndex = -1;
    gridEditorActive = false;
    destroyNativeRoulette();
    clearChipObjects();
}

mp.events.add('closeRouletteUI', closeRouletteUI);

// ──────────────────────────────────────────
// SERVER → CLIENT EVENTS
// ──────────────────────────────────────────
mp.events.add('rouletteUpdateState', (state) => {
    if (rouletteBrowser) {
        let j = JSON.stringify(state);
        rouletteBrowser.execute(`if(typeof updateGameState==='function')updateGameState('${j.replace(/'/g, "\\'")}');`);
    }
});

mp.events.add('rouletteBettingStart', (betTime) => {
    if (rouletteBrowser) rouletteBrowser.execute(`if(typeof onBettingStart==='function')onBettingStart(${betTime});`);
});

mp.events.add('rouletteBetTimer', (timeLeft) => {
    if (rouletteBrowser) rouletteBrowser.execute(`if(typeof updateBetTimer==='function')updateBetTimer(${timeLeft});`);
});

mp.events.add('rouletteSpinStart', (number, color, spinTime) => {
    if (rouletteBrowser) rouletteBrowser.execute(`if(typeof onSpinStart==='function')onSpinStart(${number},'${color}',${spinTime});`);
    playAllAnimations(number);
});

mp.events.add('rouletteShowResult', (number, color, state) => {
    // Send result to chat instead of CEF banner
    const colorName = color === 'red' ? 'Rosu' : color === 'black' ? 'Negru' : 'Verde';
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[RULETA] Rezultat: ${number} (${colorName})`})); } catch(e) {}
    if (rouletteBrowser) {
        let j = JSON.stringify(state);
        rouletteBrowser.execute(`if(typeof onShowResult==='function')onShowResult(${number},'${color}','${j.replace(/'/g, "\\'")}');`);
    }
    setTimeout(() => clearChipObjects(), 3000);
});

mp.events.add('rouletteUpdateBets', (betsJson, chips, totalBet) => {
    if (rouletteBrowser) rouletteBrowser.execute(`if(typeof updateMyBets==='function')updateMyBets('${betsJson.replace(/'/g, "\\'")}',${chips},${totalBet});`);
});

// Legacy CEF triggers
mp.events.add('Roulette_PlaceBet', (betType, betValue, amount) => {
    mp.events.callRemote('Server_ReceiveRouletteBet', betType, String(betValue), amount);
});
mp.events.add('Roulette_ClearBets', () => { mp.events.callRemote('Server_ClearRouletteBets'); });
mp.events.add('Roulette_LeaveTable', () => { closeRouletteUI(); mp.events.callRemote('Server_LeaveRouletteTable'); });
