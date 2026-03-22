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

// Corner calibration (initial defaults — will be overwritten by calibration)
const C_1  = { f: -0.1,   r:  0.2   };
const C_3  = { f:  0.35,  r: -0.2   };
const C_34 = { f:  1.1,   r:  0.5   };
const C_36 = { f:  1.085, r: -0.24  };

// Bilinear interpolation
function gridToLocal(c, r) {
    const u = (c + 0.5) / 12;
    const v = (r + 0.5) / 3;
    return {
        f: (1-u)*(1-v)*C_1.f + u*(1-v)*C_34.f + (1-u)*v*C_3.f + u*v*C_36.f,
        r: (1-u)*(1-v)*C_1.r + u*(1-v)*C_34.r + (1-u)*v*C_3.r + u*v*C_36.r,
    };
}

// Bet zones array — rebuilt by rebuildBetZones()
let BET_ZONES = [];

function rebuildBetZones() {
    BET_ZONES = [];
    // 36 numbers
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 12; c++) {
            const p = gridToLocal(c, r);
            const num = GRID_ROWS[r][c];
            BET_ZONES.push({ type: 'straight', value: num, label: `${num}`, color: getNumberColor(num), f: p.f, r: p.r });
        }
    }
    // 0 at top (row 0 side), 00 at bottom (row 2 side) — swapped vs before
    const p00 = gridToLocal(-1, 0.5);
    const p0  = gridToLocal(-1, 1.5);
    BET_ZONES.push({ type: 'straight', value: 0, label: '0', color: 'green', f: p00.f, r: p00.r });
    BET_ZONES.push({ type: 'straight', value: '00', label: '00', color: 'green', f: p0.f, r: p0.r });
    // Dozens — below row 2 (row index 3.5)
    for (let d = 0; d < 3; d++) {
        const p = gridToLocal(d * 4 + 1.5, -1.0);
        BET_ZONES.push({ type: 'dozen', value: d + 1, label: `${d === 0 ? '1st' : d === 1 ? '2nd' : '3rd'} 12`, color: 'white', f: p.f, r: p.r });
    }
    // Columns (2:1) — right of col 11
    for (let r = 0; r < 3; r++) {
        const p = gridToLocal(12.5, r);
        BET_ZONES.push({ type: 'column', value: r + 1, label: `Col ${r+1} (2:1)`, color: 'white', f: p.f, r: p.r });
    }
    // Outside bets — below dozens
    const OUTSIDE = [
        { type: 'low', value: null, label: '1-18', color: 'white' },
        { type: 'even', value: null, label: 'EVEN', color: 'white' },
        { type: 'red', value: null, label: 'RED', color: 'red' },
        { type: 'black', value: null, label: 'BLACK', color: 'black' },
        { type: 'odd', value: null, label: 'ODD', color: 'white' },
        { type: 'high', value: null, label: '19-36', color: 'white' },
    ];
    for (let i = 0; i < 6; i++) {
        const p = gridToLocal(i * 2 + 0.5, -2.0);
        BET_ZONES.push({ ...OUTSIDE[i], f: p.f, r: p.r });
    }
}
rebuildBetZones();

let nearestDist2 = 0; // for debug display
let showDebugGrid = false; // toggle with G key

// ──────────────────────────────────────────
// GRID EDITOR MODE (press H)
// ──────────────────────────────────────────
let gridEditorActive = false;
let gridEditorCorner = 0; // 0=C_1, 1=C_3, 2=C_34, 3=C_36
const CORNER_NAMES = ['C_1 (nr 1)', 'C_3 (nr 3)', 'C_34 (nr 34)', 'C_36 (nr 36)'];
const CORNER_REFS = [C_1, C_3, C_34, C_36];
const CORNER_COLORS = [
    [255, 255, 0],   // yellow
    [0, 255, 255],   // cyan
    [255, 0, 255],   // magenta
    [0, 255, 0],     // green
];

function gridEditorNudge(dF, dR) {
    const c = CORNER_REFS[gridEditorCorner];
    c.f += dF;
    c.r += dR;
    rebuildBetZones();
}

mp.keys.bind(KEY_H, true, () => {
    if (!isAtRouletteTable) return;
    gridEditorActive = !gridEditorActive;
    if (gridEditorActive) {
        showDebugGrid = true;
        try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: '[EDITOR] Grid editor ON — Tab: schimba colt, Sageti: muta, LMB: pune colt la crosshair, H: salveaza si inchide'})); } catch(e) {}
    } else {
        // Print final values to console on close
        mp.console.logInfo('=== GRID EDITOR FINAL VALUES ===');
        mp.console.logInfo(`const C_1  = { f: ${C_1.f.toFixed(6)}, r: ${C_1.r.toFixed(6)} };`);
        mp.console.logInfo(`const C_3  = { f: ${C_3.f.toFixed(6)}, r: ${C_3.r.toFixed(6)} };`);
        mp.console.logInfo(`const C_34 = { f: ${C_34.f.toFixed(6)}, r: ${C_34.r.toFixed(6)} };`);
        mp.console.logInfo(`const C_36 = { f: ${C_36.f.toFixed(6)}, r: ${C_36.r.toFixed(6)} };`);
        mp.console.logInfo('================================');
        try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[EDITOR] Salvat! C_1={${C_1.f.toFixed(3)},${C_1.r.toFixed(3)}} C_3={${C_3.f.toFixed(3)},${C_3.r.toFixed(3)}} C_34={${C_34.f.toFixed(3)},${C_34.r.toFixed(3)}} C_36={${C_36.f.toFixed(3)},${C_36.r.toFixed(3)}}`})); } catch(e) {}
        mp.events.callRemote('Roulette:CalibrationData', JSON.stringify({
            corners: {
                C_1: { f: C_1.f.toFixed(6), r: C_1.r.toFixed(6) },
                C_3: { f: C_3.f.toFixed(6), r: C_3.r.toFixed(6) },
                C_34: { f: C_34.f.toFixed(6), r: C_34.r.toFixed(6) },
                C_36: { f: C_36.f.toFixed(6), r: C_36.r.toFixed(6) },
            }
        }));
    }
});

mp.keys.bind(KEY_TAB, true, () => {
    if (!isAtRouletteTable || !gridEditorActive) return;
    gridEditorCorner = (gridEditorCorner + 1) % 4;
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[EDITOR] Colt selectat: ${CORNER_NAMES[gridEditorCorner]}`})); } catch(e) {}
});

// Arrow keys — small step 0.005, hold Shift for 0.02
mp.keys.bind(KEY_UP, true, () => {
    if (!isAtRouletteTable || !gridEditorActive) return;
    const step = mp.keys.isDown(0x10) ? 0.02 : 0.005;
    gridEditorNudge(step, 0);
});
mp.keys.bind(KEY_DN, true, () => {
    if (!isAtRouletteTable || !gridEditorActive) return;
    const step = mp.keys.isDown(0x10) ? 0.02 : 0.005;
    gridEditorNudge(-step, 0);
});
mp.keys.bind(KEY_RT, true, () => {
    if (!isAtRouletteTable || !gridEditorActive) return;
    const step = mp.keys.isDown(0x10) ? 0.02 : 0.005;
    gridEditorNudge(0, step);
});
mp.keys.bind(KEY_LT, true, () => {
    if (!isAtRouletteTable || !gridEditorActive) return;
    const step = mp.keys.isDown(0x10) ? 0.02 : 0.005;
    gridEditorNudge(0, -step);
});

// Convert local (F, R) to world position
function localToWorld(lF, lR) {
    if (!nativeTablePos) return null;
    const hRad = -nativeTableHeading * Math.PI / 180;
    const sinH = Math.sin(hRad);
    const cosH = Math.cos(hRad);
    // Inverse of: lF = dx*sinH + dy*cosH, lR = dx*cosH - dy*sinH
    // => dx = lF*sinH + lR*cosH, dy = lF*cosH - lR*sinH
    const wx = nativeTablePos.x + lF * sinH + lR * cosH;
    const wy = nativeTablePos.y + lF * cosH - lR * sinH;
    const wz = nativeTablePos.z + 1.0; // table surface height
    return new mp.Vector3(wx, wy, wz);
}

// ──────────────────────────────────────────
// CALIBRATION MODE (press F to start)
// All 37 numbers: 0, then 1-36 in table order
// ──────────────────────────────────────────
let calibrationActive = false;
let calibrationStep = 0;
let calibrationData = {};
let calibrationMessages = [];
let calibrationMsgTime = 0;

// Only 4 corners needed: 1 (top-left), 3 (bottom-left), 34 (top-right), 36 (bottom-right)
const CALIBRATION_SEQUENCE = [1, 3, 34, 36];

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
    calibrationData = {};
    calibrationMessages = [];
    calLog('Calibrare pornita! Doar 4 clickuri: 1, 3, 34, 36');
    calLog(`>> Apasa pe CENTRUL numarului ${CALIBRATION_SEQUENCE[0]} (1/4)`);
}

function recordCalibrationPoint(lF, lR) {
    const num = CALIBRATION_SEQUENCE[calibrationStep];
    calibrationData[num] = { f: lF, r: lR };
    calLog(`#${num} -> F:${lF.toFixed(4)} R:${lR.toFixed(4)}`);
    calibrationStep++;
    if (calibrationStep < CALIBRATION_SEQUENCE.length) {
        calLog(`>> Apasa pe CENTRUL numarului ${CALIBRATION_SEQUENCE[calibrationStep]} (${calibrationStep+1}/${CALIBRATION_SEQUENCE.length})`);
    } else {
        finishCalibration();
    }
}

function finishCalibration() {
    calibrationActive = false;
    calLog('=== CALIBRARE COMPLETA ===');

    // Direct corner assignment from 4 clicks: 1→C_1, 3→C_3, 34→C_34, 36→C_36
    const d1  = calibrationData[1];
    const d3  = calibrationData[3];
    const d34 = calibrationData[34];
    const d36 = calibrationData[36];

    if (d1 && d3 && d34 && d36) {
        C_1.f  = d1.f;   C_1.r  = d1.r;
        C_3.f  = d3.f;   C_3.r  = d3.r;
        C_34.f = d34.f;  C_34.r = d34.r;
        C_36.f = d36.f;  C_36.r = d36.r;

        rebuildBetZones();
        calLog('Grid recalculat din 4 colturi!');

        calLog(`C_1={f:${C_1.f.toFixed(4)},r:${C_1.r.toFixed(4)}}`);
        calLog(`C_3={f:${C_3.f.toFixed(4)},r:${C_3.r.toFixed(4)}}`);
        calLog(`C_34={f:${C_34.f.toFixed(4)},r:${C_34.r.toFixed(4)}}`);
        calLog(`C_36={f:${C_36.f.toFixed(4)},r:${C_36.r.toFixed(4)}}`);

        // Also print to F8 console
        mp.console.logInfo('=== COPY INTO CODE ===');
        mp.console.logInfo(`const C_1  = { f: ${C_1.f.toFixed(6)}, r: ${C_1.r.toFixed(6)} };`);
        mp.console.logInfo(`const C_3  = { f: ${C_3.f.toFixed(6)}, r: ${C_3.r.toFixed(6)} };`);
        mp.console.logInfo(`const C_34 = { f: ${C_34.f.toFixed(6)}, r: ${C_34.r.toFixed(6)} };`);
        mp.console.logInfo(`const C_36 = { f: ${C_36.f.toFixed(6)}, r: ${C_36.r.toFixed(6)} };`);
        mp.console.logInfo('=====================');

        // Send to server console
        mp.events.callRemote('Roulette:CalibrationData', JSON.stringify({
            corners: {
                C_1: { f: C_1.f.toFixed(6), r: C_1.r.toFixed(6) },
                C_3: { f: C_3.f.toFixed(6), r: C_3.r.toFixed(6) },
                C_34: { f: C_34.f.toFixed(6), r: C_34.r.toFixed(6) },
                C_36: { f: C_36.f.toFixed(6), r: C_36.r.toFixed(6) },
            }
        }));
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

function getBetZoneFromWorldPos(hitX, hitY, tableX, tableY, heading) {
    const hRad = -heading * Math.PI / 180;
    const dx = hitX - tableX;
    const dy = hitY - tableY;
    const lF =  dx * Math.sin(hRad) + dy * Math.cos(hRad);
    const lR =  dx * Math.cos(hRad) - dy * Math.sin(hRad);
    let bestD2 = Infinity;
    let best = null;
    for (const z of BET_ZONES) {
        const d2 = (lF - z.f) * (lF - z.f) + (lR - z.r) * (lR - z.r);
        if (d2 < bestD2) { bestD2 = d2; best = z; }
    }
    nearestDist2 = bestD2;
    if (best && bestD2 < 0.025) return best; // within ~0.16 units
    return null;
}

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
        if (gridEditorActive && rayHitPos && nativeTablePos) {
            // Grid editor: place selected corner at raytrace hit
            const hR2 = -nativeTableHeading * Math.PI / 180;
            const ddx2 = rayHitPos.x - nativeTablePos.x;
            const ddy2 = rayHitPos.y - nativeTablePos.y;
            const hitF = ddx2 * Math.sin(hR2) + ddy2 * Math.cos(hR2);
            const hitR = ddx2 * Math.cos(hR2) - ddy2 * Math.sin(hR2);
            CORNER_REFS[gridEditorCorner].f = hitF;
            CORNER_REFS[gridEditorCorner].r = hitR;
            rebuildBetZones();
            try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[EDITOR] ${CORNER_NAMES[gridEditorCorner]} = F:${hitF.toFixed(4)} R:${hitR.toFixed(4)}`})); } catch(e) {}
        } else if (calibrationActive && rayHitPos && nativeTablePos) {
            // Calibration mode: record this point
            const hR2 = -nativeTableHeading * Math.PI / 180;
            const ddx2 = rayHitPos.x - nativeTablePos.x;
            const ddy2 = rayHitPos.y - nativeTablePos.y;
            const calF = ddx2 * Math.sin(hR2) + ddy2 * Math.cos(hR2);
            const calR = ddx2 * Math.cos(hR2) - ddy2 * Math.sin(hR2);
            recordCalibrationPoint(calF, calR);
        } else if (rayHitPos && rayHitBetZone) {
            mp.events.callRemote('Server_ReceiveRouletteBet', rayHitBetZone.type, String(rayHitBetZone.value), selectedChipAmount);
            spawnChipOnTable(rayHitPos.x, rayHitPos.y, rayHitPos.z);
            mp.gui.chat.push(`~y~[RULETA] ~w~Pariu: ${rayHitBetZone.label} - $${selectedChipAmount}`);
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
        if (nativeTablePos) {
            rayHitBetZone = getBetZoneFromWorldPos(rayHitPos.x, rayHitPos.y, nativeTablePos.x, nativeTablePos.y, nativeTableHeading);
        }
    } else {
        rayHitPos = null;
        rayHitBetZone = null;
    }

    // ── DRAW CROSSHAIR ──
    mp.game.graphics.drawRect(0.5, 0.5, 0.002, 0.016, 255, 215, 0, 200);
    mp.game.graphics.drawRect(0.5, 0.5, 0.016, 0.002, 255, 215, 0, 200);

    // ── CALIBRATION PROMPT ──
    if (calibrationActive && calibrationStep < CALIBRATION_SEQUENCE.length) {
        const calNum = CALIBRATION_SEQUENCE[calibrationStep];
        mp.game.graphics.drawText(
            `~r~CALIBRARE: ~y~Click pe numarul ~g~${calNum}`,
            [0.5, 0.12],
            { font: 4, color: [255, 255, 100, 255], scale: [0.55, 0.55], outline: true, centre: true }
        );
        mp.game.graphics.drawText(
            `~w~Pune crosshair-ul FIX pe ~y~CENTRUL ~w~numarului de pe masa`,
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
    if (showDebugGrid && nativeTablePos) {
        for (const z of BET_ZONES) {
            if (z.type !== 'straight') continue;
            const wp = localToWorld(z.f, z.r);
            if (!wp) continue;
            let mr = 255, mg = 255, mb = 255, ma = 200;
            if (z.color === 'red')   { mr = 255; mg = 50;  mb = 50; }
            if (z.color === 'black') { mr = 30;  mg = 30;  mb = 30; }
            if (z.color === 'green') { mr = 0;   mg = 200; mb = 60; }
            mp.game.graphics.drawMarker(25, wp.x, wp.y, wp.z + 0.003,
                0, 0, 0, 0, 0, 0, 0.025, 0.025, 0.005,
                mr, mg, mb, ma, false, false, 2, false, null, null, false);
            // Draw number label at each zone in 3D
            if (gridEditorActive) {
                mp.game.graphics.drawText(`~w~${z.label}`, mp.game.graphics.world3dToScreen2d(wp.x, wp.y, wp.z + 0.02) || [0,0],
                    { font: 4, color: [255,255,255,220], scale: [0.2, 0.2], outline: true, centre: true });
            }
        }
        // Draw grid lines
        for (let r = -0.5; r <= 2.5; r += 1.0) {
            const a = localToWorld(gridToLocal(-0.5, r).f, gridToLocal(-0.5, r).r);
            const b = localToWorld(gridToLocal(11.5, r).f, gridToLocal(11.5, r).r);
            if (a && b) mp.game.graphics.drawLine(a.x, a.y, a.z, b.x, b.y, b.z, 255, 255, 0, 120);
        }
        for (let c = -0.5; c <= 11.5; c += 1.0) {
            const a = localToWorld(gridToLocal(c, -0.5).f, gridToLocal(c, -0.5).r);
            const b = localToWorld(gridToLocal(c, 2.5).f, gridToLocal(c, 2.5).r);
            if (a && b) mp.game.graphics.drawLine(a.x, a.y, a.z, b.x, b.y, b.z, 255, 255, 0, 120);
        }
        // Draw corner markers (bigger, colored) in editor mode
        if (gridEditorActive) {
            const cornerGridPos = [
                { c: 0, r: 0 },   // C_1
                { c: 0, r: 2 },   // C_3
                { c: 11, r: 0 },  // C_34
                { c: 11, r: 2 },  // C_36
            ];
            for (let ci = 0; ci < 4; ci++) {
                const ref = CORNER_REFS[ci];
                const wp = localToWorld(ref.f, ref.r);
                if (!wp) continue;
                const clr = CORNER_COLORS[ci];
                const isSelected = ci === gridEditorCorner;
                const sz = isSelected ? 0.06 : 0.04;
                const alpha = isSelected ? 255 : 150;
                mp.game.graphics.drawMarker(28, wp.x, wp.y, wp.z + 0.01,
                    0, 0, 0, 0, 0, 0, sz, sz, sz,
                    clr[0], clr[1], clr[2], alpha, false, false, 2, false, null, null, false);
            }
        }
    }

    // ── GRID EDITOR HUD ──
    if (gridEditorActive) {
        const cc = CORNER_REFS[gridEditorCorner];
        const cn = CORNER_NAMES[gridEditorCorner];
        const clr = CORNER_COLORS[gridEditorCorner];
        mp.game.graphics.drawText(
            `~y~GRID EDITOR  ~w~Colt: ~g~${cn}`,
            [0.5, 0.04],
            { font: 4, color: [clr[0], clr[1], clr[2], 255], scale: [0.45, 0.45], outline: true, centre: true }
        );
        mp.game.graphics.drawText(
            `~w~F: ~y~${cc.f.toFixed(4)}  ~w~R: ~y~${cc.r.toFixed(4)}`,
            [0.5, 0.075],
            { font: 4, color: [255, 255, 255, 230], scale: [0.35, 0.35], outline: true, centre: true }
        );
        mp.game.graphics.drawText(
            `~y~Tab~w~=schimba colt  ~y~Sageti~w~=muta(+Shift=rapid)  ~y~LMB~w~=pune la crosshair  ~y~H~w~=salveaza`,
            [0.5, 0.10],
            { font: 4, color: [200, 200, 200, 200], scale: [0.22, 0.22], outline: true, centre: true }
        );
    }

    // ── DRAW HIT MARKER ──
    if (rayHitPos) {
        mp.game.graphics.drawMarker(28, rayHitPos.x, rayHitPos.y, rayHitPos.z + 0.01,
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

        // Debug: show local coords + nearest zone + distance
        if (nativeTablePos) {
            const hR2 = -nativeTableHeading * Math.PI / 180;
            const ddx2 = rayHitPos.x - nativeTablePos.x;
            const ddy2 = rayHitPos.y - nativeTablePos.y;
            const lF = ddx2 * Math.sin(hR2) + ddy2 * Math.cos(hR2);
            const lR = ddx2 * Math.cos(hR2) - ddy2 * Math.sin(hR2);
            const dstr = Math.sqrt(nearestDist2).toFixed(3);
            const zLabel = rayHitBetZone ? rayHitBetZone.label : 'none';
            mp.game.graphics.drawText(`~w~F:${lF.toFixed(3)} R:${lR.toFixed(3)}  Zone:${zLabel} Dist:${dstr}`, [0.5, 0.90],
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
        const chip = mp.objects.new(mp.game.joaat(hashes[idx]),
            new mp.Vector3(x, y, z + 0.02 + placedChipObjects.length * 0.005));
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
mp.events.add('openRouletteUI', (tableX, tableY, tableZ, tableHeading) => {
    spawnNativeRoulette(tableX, tableY, tableZ, tableHeading);
    isAtRouletteTable = true;
    loadAnimDict(ANIM_LIB);

    if (rouletteBrowser === null) {
        rouletteBrowser = mp.browsers.new('package://roulette/index.html');
    }
});

function closeRouletteUI() {
    if (rouletteBrowser) { rouletteBrowser.destroy(); rouletteBrowser = null; }
    isAtRouletteTable = false;
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
