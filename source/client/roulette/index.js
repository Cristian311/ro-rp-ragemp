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
const DEALER_ANIM_IDLE = 'anim_casino_b@amb@casino@games@shared@dealer@';
const DEALER_ANIM_ROULETTE = 'anim_casino_b@amb@casino@games@roulette@dealer';

// Known table surface offset (table base to betting felt)
// The raycast hits the glass dome at ~1.20, but the felt is at ~0.96
let TABLE_SURFACE_U = 0.96;

// ──────────────────────────────────────────
// NATIVE TABLE / BALL OBJECTS
// ──────────────────────────────────────────
let nativeRouletteTable = null;
let nativeRouletteBall  = null;
let nativeTablePos      = null;
let nativeTableHeading  = 0;
let hiddenServerProp    = null;
let hiddenServerProps   = [];    // array of all hidden props (multi-prop support)
let dealerNPC           = null;  // dealer ped at the table
let dealerIsServerPed   = false; // true if dealerNPC is a server-spawned ped
let isAtRouletteTable   = false;
let currentTableIndex   = -1;
let placedChipObjects   = [];     // [{obj, zoneKey, x, y, z}, ...]
let placedChipsByZone   = {};     // zoneKey -> [{obj, x, y, z}, ...] for stacking
let rouletteSpinning    = false;  // true during spin phase (block bets)
let rouletteBetting     = false;  // true only during betting phase
let myBets              = [];     // [{type, value, amount, label}, ...]
let myChips             = 0;
let myTotalBet          = 0;
let rouletteHistory     = [];     // [{number, color}, ...]
let otherChipObjects    = [];     // chips placed by other players
let previewChipObject   = null;   // 3D chip model following raytrace
let previewChipAmount   = 0;      // track which chip model is loaded

// Expose table data globally for animation system
if (!global.tableData) global.tableData = {};
function updateGlobalTableData() {
    global.tableData.roulette = isAtRouletteTable && nativeTablePos ? {
        x: nativeTablePos.x, y: nativeTablePos.y, z: nativeTablePos.z,
        heading: nativeTableHeading
    } : null;
}

// ──────────────────────────────────────────
// FIXED CAMERA
// ──────────────────────────────────────────
let rouletteCam = null;
let camRotX = 0;  // pitch (up/down)
let camRotZ = 0;  // yaw (left/right)
let camBaseRotX = 0;
let camBaseRotZ = 0;
// Camera offset from table center (local: forward, right, up)
let CAM_OFFSET_F = -0.9;   // behind player (toward player side)
let CAM_OFFSET_R = 0.35;    // slightly right of center
let CAM_OFFSET_U = 1.8;    // above table
// Camera looks at this point on table (local offset)
let CAM_LOOKAT_F = -0.45;
let CAM_LOOKAT_R = 0.35;
let CAM_LOOKAT_U = 0.96;
// Mouse sensitivity & clamp range
let CAM_SENSITIVITY = 3.0;
let CAM_PITCH_MIN = -80;   // how far down
let CAM_PITCH_MAX = -20;   // how far up
let CAM_YAW_RANGE = 40;    // degrees left/right from center
// Hardcoded seat positions (local offsets: forward, right, up relative to table center + heading offset)
let SEAT_POSITIONS = [
    { f: -1.0436, r: -0.2434, u: 0.5201, heading: 354, animDict: 'amb@prop_human_seat_chair@male@generic@base', animName: 'base', animFlags: 2 },
    { f: -1.1104, r:  0.7752, u: 0.6101, heading: 379, animDict: 'amb@prop_human_seat_chair@male@generic@base', animName: 'base', animFlags: 2 },
    { f: -0.0841, r:  1.5364, u: 0.5601, heading: 440, animDict: 'amb@prop_human_seat_chair@male@generic@base', animName: 'base', animFlags: 2 },
    { f:  0.8431, r:  0.7731, u: 0.5601, heading: 174, animDict: 'amb@prop_human_seat_chair@male@generic@base', animName: 'base', animFlags: 2 },
];
let currentSeatIndex = 0;

const NUMBER_TO_ANIM = {
    '00': 1, 0: 20, 1: 38, 2: 19, 3: 34, 4: 15, 5: 30, 6: 11,
    7: 26, 8: 7, 9: 22, 10: 3, 11: 25, 12: 6, 13: 37, 14: 18,
    15: 33, 16: 14, 17: 29, 18: 10, 19: 8, 20: 27, 21: 12, 22: 31,
    23: 16, 24: 35, 25: 4, 26: 23, 27: 2, 28: 21, 29: 5, 30: 24,
    31: 9, 32: 28, 33: 13, 34: 32, 35: 17, 36: 36
};

function loadAnimDict(dict) {
    return new Promise((resolve) => {
        if (mp.game.streaming.hasAnimDictLoaded(dict)) { resolve(); return; }
        mp.game.streaming.requestAnimDict(dict);
        let elapsed = 0;
        let check = setInterval(() => {
            if (mp.game.streaming.hasAnimDictLoaded(dict)) { clearInterval(check); resolve(); return; }
            elapsed += 50;
            if (elapsed > 10000) { // 10s timeout — prevent infinite loop
                clearInterval(check);
                mp.console.logInfo(`[RULETĂ] WARNING: AnimDict "${dict}" failed to load after 10s`);
                resolve(); // resolve anyway to prevent hanging
            }
        }, 50);
    });
}

// ──────────────────────────────────────────
// NATIVE ROULETTE SPAWN / DESTROY
// ──────────────────────────────────────────
function spawnNativeRoulette(tableX, tableY, tableZ, tableHeading) {
    destroyNativeRoulette();
    const tableHash = mp.game.joaat('vw_prop_casino_roulette_01');
    // Hide ALL matching roulette props nearby (server-spawned AND IPL/interior props)
    hiddenServerProps = [];
    let searchX = tableX, searchY = tableY, searchZ = tableZ;
    for (let attempt = 0; attempt < 5; attempt++) {
        const obj = mp.game.object.getClosestObjectOfType(
            searchX, searchY, searchZ, 5.0, tableHash, false, false, false);
        if (!obj || obj === 0) break;
        // Check we haven't already hidden this one
        if (hiddenServerProps.includes(obj)) break;
        mp.game.entity.setVisible(obj, false, false);
        hiddenServerProps.push(obj);
        // Nudge search position slightly to find the next one
        searchX += 0.01;
    }
    hiddenServerProp = hiddenServerProps.length > 0 ? hiddenServerProps[0] : null;
    const pos = new mp.Vector3(tableX, tableY, tableZ);
    nativeTablePos = pos;
    nativeTableHeading = tableHeading;
    // Spawn directly like casino.js (no preloading interval)
    nativeRouletteTable = mp.objects.new(tableHash, pos);
    nativeRouletteTable.rotation = new mp.Vector3(0, 0, tableHeading);
    // Ball: use same hash as casino.js (87196104)
    nativeRouletteBall = mp.objects.new(87196104, new mp.Vector3(pos.x, pos.y, pos.z));
    _spawnDealer(pos, tableHeading);
}

function _spawnDealer(pos, tableHeading) {
    // Find the server-spawned dealer ped (no local fallback — server always spawns it)
    function findServerDealer() {
        let found = null;
        mp.peds.forEach(ped => {
            try {
                if (ped.getVariable('rouletteDealer') && ped.getVariable('tableIndex') === currentTableIndex) {
                    found = ped;
                }
            } catch(e) {}
        });
        return found;
    }

    let serverPed = findServerDealer();
    if (serverPed) {
        dealerNPC = serverPed;
        dealerIsServerPed = true;
    } else {
        // Retry a few times — ped might not be streamed in yet
        let retries = 0;
        const retryInterval = setInterval(() => {
            retries++;
            serverPed = findServerDealer();
            if (serverPed) {
                dealerNPC = serverPed;
                dealerIsServerPed = true;
                clearInterval(retryInterval);
            } else if (retries >= 10) {
                clearInterval(retryInterval);
            }
        }, 500);
    }
}

function destroyNativeRoulette() {
    if (nativeRouletteTable) { nativeRouletteTable.destroy(); nativeRouletteTable = null; }
    if (nativeRouletteBall)  { nativeRouletteBall.destroy();  nativeRouletteBall  = null; }
    if (dealerNPC) {
        if (!dealerIsServerPed) {
            try { dealerNPC.destroy(); } catch(e) {}
        }
        dealerNPC = null;
        dealerIsServerPed = false;
    }
    if (hiddenServerProp) {
        try { mp.game.entity.setVisible(hiddenServerProp, true, false); } catch(e) {}
        hiddenServerProp = null;
    }
    // Restore ALL hidden props (multi-prop support for casino interiors)
    for (const handle of hiddenServerProps) {
        try { mp.game.entity.setVisible(handle, true, false); } catch(e) {}
    }
    hiddenServerProps = [];
    nativeTablePos = null;
    nativeTableHeading = 0;
}

function playAllAnimations(winningNumber) {
    if (!nativeRouletteTable || !nativeRouletteBall) return;
    // Normalize: RAGE:MP events may send numbers as strings
    if (winningNumber !== '00' && winningNumber !== 0) {
        const parsed = parseInt(winningNumber);
        if (!isNaN(parsed)) winningNumber = parsed;
    }
    if (winningNumber === '0') winningNumber = 0;
    const animIndex = NUMBER_TO_ANIM[winningNumber];
    if (!animIndex) {
        mp.console.logInfo(`[RULETĂ] WARNING: No anim for number ${winningNumber} (type: ${typeof winningNumber}), fallback to 0`);
    }
    const finalAnimIndex = animIndex || NUMBER_TO_ANIM[0];
    mp.console.logInfo(`[RULETĂ] SPIN: number=${winningNumber} → exit_${finalAnimIndex}_ball / exit_${finalAnimIndex}_wheel`);
    // Exactly like casino.js spin_wheel:
    nativeRouletteTable.playAnim('intro_wheel', ANIM_LIB, 1000.0, false, true, true, 0, 131072);
    nativeRouletteTable.forceAiAndAnimationUpdate();
    const ballPos = nativeRouletteTable.getWorldPositionOfBone(nativeRouletteTable.getBoneIndexByName('Roulette_Wheel'));
    nativeRouletteBall.position = ballPos;
    nativeRouletteBall.setCoordsNoOffset(ballPos.x, ballPos.y, ballPos.z, false, false, false);
    const ballRot = nativeRouletteTable.getRotation(2);
    nativeRouletteBall.setRotation(ballRot.x, ballRot.y, ballRot.z + 90, 2, false);
    nativeRouletteBall.playAnim('intro_ball', ANIM_LIB, 1000.0, false, true, false, 0, 136704);
    nativeRouletteBall.forceAiAndAnimationUpdate();
    rouletteSpinData = {
        spins: 0,
        lastSpinTime: 0,
        needSpins: SPIN_LOOP_COUNT,
        endTable: `exit_${finalAnimIndex}_wheel`,
        endBall: `exit_${finalAnimIndex}_ball`
    };
}

// Number of loop_ball/loop_wheel cycles before transitioning to exit
let SPIN_LOOP_COUNT = 1;

// Spin tracking data (null when no spin active)
let rouletteSpinData = null;

// Buffered result — shown only after animation completes
let pendingResult = null;

// ──────────────────────────────────────────
// SERVER DEALER PED — apply clothing + idle when streamed in
// ──────────────────────────────────────────
mp.events.add('entityStreamIn', (entity) => {
    if (entity.type !== 'ped') return;
    try {
        if (!entity.getVariable('rouletteDealer')) return;
    } catch(e) { return; }
    setTimeout(() => {
        try {
            entity.setComponentVariation(0, 2, 1, 0);
            entity.setComponentVariation(1, 1, 0, 0);
            entity.setComponentVariation(2, 2, 0, 0);
            entity.setComponentVariation(3, 0, 2, 0);
            entity.setComponentVariation(4, 0, 0, 0);
            entity.setComponentVariation(6, 1, 0, 0);
            entity.setComponentVariation(7, 2, 0, 0);
            entity.setComponentVariation(8, 1, 0, 0);
            entity.setComponentVariation(10, 1, 0, 0);
            entity.setComponentVariation(11, 1, 0, 0);
            entity.setConfigFlag(185, true);
            entity.setConfigFlag(108, true);
            entity.setConfigFlag(208, true);
            loadAnimDict(DEALER_ANIM_IDLE).then(() => {
                try { entity.taskPlayAnim(DEALER_ANIM_IDLE, 'idle', 1000.0, -2.0, -1, 2, 1148846080, false, false, false); } catch(e) {}
            });
        } catch(e) {}
    }, 300);
});

// ──────────────────────────────────────────
// SPECTATOR ANIMATION (nearby players see spin)
// ──────────────────────────────────────────
let spectatorTables = {};

function cleanupSpectator(key) {
    const spec = spectatorTables[key];
    if (!spec) return;
    if (spec.table) { try { spec.table.destroy(); } catch(e) {} }
    if (spec.ball)  { try { spec.ball.destroy(); } catch(e) {} }
    if (spec.hiddenProp) {
        try { mp.game.entity.setVisible(spec.hiddenProp, true, false); } catch(e) {}
    }
    // Restore all hidden props (multi-prop support)
    if (spec.hiddenProps) {
        for (const handle of spec.hiddenProps) {
            try { mp.game.entity.setVisible(handle, true, false); } catch(e) {}
        }
    }
    delete spectatorTables[key];
}

mp.events.add('rouletteNearbySpinStart', (tableX, tableY, tableZ, tableHeading, number, color, spinTime, tableIndex) => {
    if (isAtRouletteTable) return; // seated players get regular events
    const key = `${tableX},${tableY},${tableZ}`;
    cleanupSpectator(key);

    const pos = new mp.Vector3(tableX, tableY, tableZ);
    const tableHash = mp.game.joaat('vw_prop_casino_roulette_01');

    // Hide server prop(s) — may be multiple overlapping in casino interiors
    const serverObj = mp.game.object.getClosestObjectOfType(tableX, tableY, tableZ, 5.0, tableHash, false, false, false);
    let hiddenProp = null;
    let hiddenProps = [];
    if (serverObj && serverObj !== 0) {
        mp.game.entity.setVisible(serverObj, false, false);
        hiddenProp = serverObj;
        hiddenProps.push(serverObj);
        // Hide additional overlapping props
        for (let i = 0; i < 4; i++) {
            const extra = mp.game.object.getClosestObjectOfType(tableX, tableY, tableZ, 5.0, tableHash, false, false, false);
            if (!extra || extra === 0) break;
            mp.game.entity.setVisible(extra, false, false);
            hiddenProps.push(extra);
        }
    }

    const table = mp.objects.new(mp.game.joaat('vw_prop_casino_roulette_01'), pos);
    table.rotation = new mp.Vector3(0, 0, tableHeading);

    // Spawn ball at table pos (no attachTo — sync via bone like casino.js)
    const ball = mp.objects.new(87196104,
        new mp.Vector3(pos.x, pos.y, pos.z));

    spectatorTables[key] = { table, ball, hiddenProp, hiddenProps };

    // Play dealer spin animation on the server-spawned dealer ped
    if (tableIndex !== undefined) {
        mp.peds.forEach(ped => {
            try {
                if (ped.getVariable('rouletteDealer') && ped.getVariable('tableIndex') === tableIndex) {
                    loadAnimDict(DEALER_ANIM_ROULETTE).then(() => {
                        try {
                            ped.taskPlayAnim(DEALER_ANIM_ROULETTE, 'spin_wheel', 8.0, 1, -1, 2, 0.0, false, false, false);
                            setTimeout(() => {
                                try { ped.taskPlayAnim(DEALER_ANIM_IDLE, 'idle', 1000.0, -2.0, -1, 2, 1148846080, false, false, false); } catch(e) {}
                            }, 8000);
                        } catch(e) {}
                    });
                }
            } catch(e) {}
        });
    }

    // Normalize number type (RAGE:MP may send as string)
    let normNumber = number;
    if (normNumber !== '00' && normNumber !== 0) {
        const parsed = parseInt(normNumber);
        if (!isNaN(parsed)) normNumber = parsed;
    }
    if (normNumber === '0') normNumber = 0;
    const animIndex = NUMBER_TO_ANIM[normNumber] || NUMBER_TO_ANIM[0];
    loadAnimDict(ANIM_LIB).then(() => {
        try {
            // Exactly like casino.js spin_wheel: play table intro first, forceUpdate, sync ball, play ball intro
            table.playAnim('intro_wheel', ANIM_LIB, 1000.0, false, true, true, 0, 131072);
            table.forceAiAndAnimationUpdate();
            const bonePos = table.getWorldPositionOfBone(table.getBoneIndexByName('Roulette_Wheel'));
            ball.position = bonePos;
            ball.setCoordsNoOffset(bonePos.x, bonePos.y, bonePos.z, false, false, false);
            const boneRot = table.getRotation(2);
            ball.setRotation(boneRot.x, boneRot.y, boneRot.z + 90, 2, false);
            ball.playAnim('intro_ball', ANIM_LIB, 1000.0, false, true, false, 0, 136704);
            ball.forceAiAndAnimationUpdate();
            // After intro (~4s), sync and start loop
            setTimeout(() => {
                try {
                    table.playAnim('loop_wheel', ANIM_LIB, 1000.0, true, true, true, 0, 131072);
                    const bp = table.getWorldPositionOfBone(table.getBoneIndexByName('Roulette_Wheel'));
                    const br = table.getRotation(2);
                    ball.position = new mp.Vector3(bp.x, bp.y, bp.z);
                    ball.rotation = new mp.Vector3(br.x, br.y, br.z + 90);
                    ball.playAnim('loop_ball', ANIM_LIB, 1000.0, true, true, false, 0, 136704);
                } catch(e) {}
            }, 4000);
            // After loop phase, sync and play exit
            setTimeout(() => {
                try {
                    table.playAnim(`exit_${animIndex}_wheel`, ANIM_LIB, 1000.0, false, true, true, 0, 131072);
                    const bp = table.getWorldPositionOfBone(table.getBoneIndexByName('Roulette_Wheel'));
                    const br = table.getRotation(2);
                    ball.position = new mp.Vector3(bp.x, bp.y, bp.z);
                    ball.rotation = new mp.Vector3(br.x, br.y, br.z + 90);
                    ball.playAnim(`exit_${animIndex}_ball`, ANIM_LIB, 1000.0, false, true, true, 0, 136704);
                } catch(e) {}
            }, 10000);
        } catch(e) {}
    });

    // Cleanup after full animation
    setTimeout(() => { cleanupSpectator(key); }, (spinTime + 5) * 1000);
});

// ──────────────────────────────────────────
// CAMERA SETUP
// ──────────────────────────────────────────
function createRouletteCamera() {
    if (!nativeTablePos) return;
    const hRad = nativeTableHeading * Math.PI / 180;
    // Camera position in world
    const camX = nativeTablePos.x + CAM_OFFSET_F * (-Math.sin(hRad)) + CAM_OFFSET_R * Math.cos(hRad);
    const camY = nativeTablePos.y + CAM_OFFSET_F * Math.cos(hRad) + CAM_OFFSET_R * Math.sin(hRad);
    const camZ = nativeTablePos.z + CAM_OFFSET_U;
    // Look-at point on table
    const lookX = nativeTablePos.x + CAM_LOOKAT_F * (-Math.sin(hRad)) + CAM_LOOKAT_R * Math.cos(hRad);
    const lookY = nativeTablePos.y + CAM_LOOKAT_F * Math.cos(hRad) + CAM_LOOKAT_R * Math.sin(hRad);
    const lookZ = nativeTablePos.z + CAM_LOOKAT_U;

    // Calculate initial rotation from cam pos to look-at
    const dx = lookX - camX, dy = lookY - camY, dz = lookZ - camZ;
    const dist2d = Math.sqrt(dx*dx + dy*dy);
    camBaseRotX = Math.atan2(dz, dist2d) * 180 / Math.PI;
    camBaseRotZ = Math.atan2(-dx, dy) * 180 / Math.PI;
    camRotX = camBaseRotX;
    camRotZ = camBaseRotZ;

    rouletteCam = mp.cameras.new('default', new mp.Vector3(camX, camY, camZ),
        new mp.Vector3(camRotX, 0, camRotZ), 50);
    rouletteCam.setActive(true);
    mp.game.cam.renderScriptCams(true, true, 500, true, false);
}

function destroyRouletteCamera() {
    if (rouletteCam) {
        mp.game.cam.renderScriptCams(false, true, 500, true, false);
        rouletteCam.setActive(false);
        rouletteCam.destroy();
        rouletteCam = null;
    }
}

// Camera offset for viewing the wheel during spin (local: forward, right, up relative to table)
let CAM_SPIN_OFFSET_F = -0.593;
let CAM_SPIN_OFFSET_R = -1.4177;
let CAM_SPIN_OFFSET_U = 1.7479;
let CAM_SPIN_PITCH    = -27.5;
let CAM_SPIN_YAW_OFF  = -58.5;   // yaw offset relative to table heading
let CAM_SPIN_FOV      = 60;

let spinCam = null;

function panCameraToWheel() {
    if (!nativeTablePos || !rouletteCam) return;
    const hRad = nativeTableHeading * Math.PI / 180;
    const camX = nativeTablePos.x + CAM_SPIN_OFFSET_F * (-Math.sin(hRad)) + CAM_SPIN_OFFSET_R * Math.cos(hRad);
    const camY = nativeTablePos.y + CAM_SPIN_OFFSET_F * Math.cos(hRad) + CAM_SPIN_OFFSET_R * Math.sin(hRad);
    const camZ = nativeTablePos.z + CAM_SPIN_OFFSET_U;
    const rotZ = nativeTableHeading + CAM_SPIN_YAW_OFF;

    spinCam = mp.cameras.new('default', new mp.Vector3(camX, camY, camZ),
        new mp.Vector3(CAM_SPIN_PITCH, 0, rotZ), CAM_SPIN_FOV);
    spinCam.setActive(true);
    mp.game.cam.renderScriptCams(true, true, 1000, true, false);
}

function restoreCameraFromWheel() {
    if (spinCam) {
        spinCam.setActive(false);
        spinCam.destroy();
        spinCam = null;
    }
    if (rouletteCam) {
        rouletteCam.setActive(true);
        mp.game.cam.renderScriptCams(true, true, 1000, true, false);
    }
}

function positionPlayerAtTable(seatIndex) {
    if (!nativeTablePos) return;
    const seat = SEAT_POSITIONS[seatIndex] || SEAT_POSITIONS[0];
    const hRad = nativeTableHeading * Math.PI / 180;

    const px = nativeTablePos.x + seat.f * (-Math.sin(hRad)) + seat.r * Math.cos(hRad);
    const py = nativeTablePos.y + seat.f * Math.cos(hRad) + seat.r * Math.sin(hRad);
    const pz = nativeTablePos.z + seat.u;

    const playerHeading = (nativeTableHeading + seat.heading) % 360;

    mp.players.local.position = new mp.Vector3(px, py, pz);
    mp.players.local.setHeading(playerHeading);
    mp.game.entity.freezePosition(mp.players.local.handle, true);

    // Play sitting animation
    loadAnimDict(seat.animDict).then(() => {
        mp.players.local.taskPlayAnim(seat.animDict, seat.animName, 8.0, -8.0, -1, seat.animFlags, 0, false, false, false);
    });
}

// ──────────────────────────────────────────
// RAYTRACE
// ──────────────────────────────────────────
let rayHitPos     = null;
let rayPlanePos   = null;
let rayHitBetZone = null;
let selectedChipAmount = 25;

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

// Local offsets for 14 calibration corners {f, r, u}
let localCorners = {
    // Main number grid (6 points)
    c1:  null,  // number 1  (col 0, row 0)
    c3:  null,  // number 3  (col 0, row 2)
    c16: null,  // number 16 (col 5, row 0)
    c18: null,  // number 18 (col 5, row 2)
    c34: null,  // number 34 (col 11, row 0)
    c36: null,  // number 36 (col 11, row 2)
    // Bottom rectangle: dozens + outside bets (4 corners)
    cBotTL: null,  // bottom area top-left     (col -0.5, row -0.5)
    cBotTR: null,  // bottom area top-right    (col 11.5, row -0.5)
    cBotBL: null,  // bottom area bottom-left  (col -0.5, row -1.5)
    cBotBR: null,  // bottom area bottom-right (col 11.5, row -1.5)
    // Right column: 2:1 bets (2 corners)
    c21T: null,    // 2:1 top-right  (col 12.5, row -0.5)
    c21B: null,    // 2:1 bot-right  (col 12.5, row 2.5)
    // Left column: 0/00 area (2 corners)
    c0T: null,     // 0/00 top-left  (col -1.5, row -0.5)
    c0B: null,     // 0/00 bot-left  (col -1.5, row 2.5)
};
const CORNER_KEYS = [
    'c1', 'c3', 'c16', 'c18', 'c34', 'c36',
    'cBotTL', 'cBotTR', 'cBotBL', 'cBotBR',
    'c21T', 'c21B', 'c0T', 'c0B'
];
const CORNER_NAMES = [
    'nr 1', 'nr 3', 'nr 16', 'nr 18', 'nr 34', 'nr 36',
    'Bot top-left', 'Bot top-right', 'Bot bottom-left', 'Bot bottom-right',
    '2:1 top-right', '2:1 bottom-right', '0/00 top-left', '0/00 bottom-left'
];
const CORNER_COLORS = [
    [255,255,0], [0,255,255], [255,128,0], [0,255,128], [255,0,255], [0,255,0],
    [255,100,100], [100,100,255], [255,50,50], [50,50,255],
    [255,200,0], [200,255,0], [0,200,255], [200,0,255]
];

// Bilinear helper: interpolate 4 corners given u (0..1 horizontal), v (0..1 vertical)
function bilinear(tl, tr, bl, br, u, v) {
    return {
        f: (1-u)*(1-v)*tl.f + u*(1-v)*tr.f + (1-u)*v*bl.f + u*v*br.f,
        r: (1-u)*(1-v)*tl.r + u*(1-v)*tr.r + (1-u)*v*bl.r + u*v*br.r,
        u: (1-u)*(1-v)*tl.u + u*(1-v)*tr.u + (1-u)*v*bl.u + u*v*br.u,
    };
}

// Piecewise bilinear interpolation in LOCAL space, then convert to world
function gridToWorld(c, r) {
    if (!localCorners.c1 || !localCorners.c3 || !localCorners.c34 || !localCorners.c36) return null;
    let loc;

    // REGION: Bottom rectangle (dozens + outside bets) — rows < -0.5
    if (r < -0.5 && localCorners.cBotTL && localCorners.cBotTR && localCorners.cBotBL && localCorners.cBotBR) {
        const u = Math.max(0, Math.min(1, (c - (-0.5)) / 12.0));  // -0.5 to 11.5
        const v = Math.max(0, Math.min(1, (r - (-0.5)) / (-1.0))); // -0.5 to -1.5
        loc = bilinear(localCorners.cBotTL, localCorners.cBotTR, localCorners.cBotBL, localCorners.cBotBR, u, v);
        return localToWorld(loc.f, loc.r, loc.u);
    }

    // REGION: Right column (2:1 bets) — col > 11.5
    if (c > 11.5 && localCorners.c21T && localCorners.c21B) {
        // Top-left = grid at (11.5, -0.5), top-right = c21T
        // Bot-left = grid at (11.5, 2.5),  bot-right = c21B
        const tl = gridToLocal(11, 0); // approximate top-left from number grid edge
        const bl = gridToLocal(11, 2);
        if (!tl || !bl) return null;
        const u = Math.max(0, Math.min(1, (c - 11.5) / 1.0)); // 11.5 to 12.5
        const v = Math.max(0, Math.min(1, (r - (-0.5)) / 3.0)); // -0.5 to 2.5
        loc = bilinear(tl, localCorners.c21T, bl, localCorners.c21B, u, v);
        return localToWorld(loc.f, loc.r, loc.u);
    }

    // REGION: Left column (0/00 area) — col < -0.5
    if (c < -0.5 && localCorners.c0T && localCorners.c0B) {
        const tr = gridToLocal(0, 0); // right edge from number grid
        const br = gridToLocal(0, 2);
        if (!tr || !br) return null;
        const u = Math.max(0, Math.min(1, (c - (-1.5)) / 1.0)); // -1.5 to -0.5
        const v = Math.max(0, Math.min(1, (r - (-0.5)) / 3.0)); // -0.5 to 2.5
        loc = bilinear(localCorners.c0T, tr, localCorners.c0B, br, u, v);
        return localToWorld(loc.f, loc.r, loc.u);
    }

    // REGION: Main number grid (rows 0..2, cols 0..11)
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
        loc = bilinear(l0, r0, l2, r2, u, v);
    } else {
        const u = c / 11;
        loc = bilinear(localCorners.c1, localCorners.c34, localCorners.c3, localCorners.c36, u, v);
    }

    return localToWorld(loc.f, loc.r, loc.u);
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
    // 00 top, 0 bottom (matching actual table layout)
    BET_ZONES.push({ type: 'straight', value: '00', label: '00', color: 'green', col: -1, row: 0.25 });
    BET_ZONES.push({ type: 'straight', value: 0, label: '0', color: 'green', col: -1, row: 1.75 });
    // Dozens: each spans 4 cols, half-row height below the numbers
    for (let d = 0; d < 3; d++) {
        BET_ZONES.push({ type: 'dozen', value: d + 1, label: `${d === 0 ? '1st' : d === 1 ? '2nd' : '3rd'} 12`, color: 'white', col: d * 4 + 1.5, row: -0.75 });
    }
    // Columns (2:1): right side of grid — each aligned to its number row
    BET_ZONES.push({ type: 'column', value: 1, label: '2:1 Row 1', color: 'white', col: 12, row: 0 });
    BET_ZONES.push({ type: 'column', value: 2, label: '2:1 Row 2', color: 'white', col: 12, row: 1 });
    BET_ZONES.push({ type: 'column', value: 3, label: '2:1 Row 3', color: 'white', col: 12, row: 2 });
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

// Get the numbers covered by a bet zone (client-side mirror of server logic)
function getZoneNumbers(zone) {
    if (!zone) return [];
    switch (zone.type) {
        case 'straight': return [zone.value];
        case 'column': {
            const nums = [];
            for (let i = zone.value; i <= 36; i += 3) nums.push(i);
            return nums;
        }
        case 'dozen': {
            const start = (zone.value - 1) * 12 + 1;
            const nums = [];
            for (let i = start; i < start + 12; i++) nums.push(i);
            return nums;
        }
        case 'red': return [...RED_NUMBERS];
        case 'black': {
            const nums = [];
            for (let i = 1; i <= 36; i++) { if (!RED_NUMBERS.includes(i)) nums.push(i); }
            return nums;
        }
        case 'odd': {
            const nums = [];
            for (let i = 1; i <= 36; i += 2) nums.push(i);
            return nums;
        }
        case 'even': {
            const nums = [];
            for (let i = 2; i <= 36; i += 2) nums.push(i);
            return nums;
        }
        case 'low': {
            const nums = [];
            for (let i = 1; i <= 18; i++) nums.push(i);
            return nums;
        }
        case 'high': {
            const nums = [];
            for (let i = 19; i <= 36; i++) nums.push(i);
            return nums;
        }
        default: return [];
    }
}

// ── HIGHLIGHT OFFSET TWEAKS ──
// Adjust these to nudge the 2:1, 0, and 00 highlights/chips into place.
// F = forward/back along the table, R = left/right across the table.
let OFFSET_21 = { f: 0.005, r: 0.02 };   // 2:1 cells offset
let OFFSET_0  = { f: -0.01, r: -0.02 };   // 0 cell offset
let OFFSET_00 = { f: 0.035, r: -0.025 };   // 00 cell offset

// Expose shared roulette state for debug tools (debug_tools.js)
global.rouletteShared = {
    get isAtRouletteTable() { return isAtRouletteTable; },
    localCorners,
    CORNER_KEYS,
    CORNER_NAMES,
    CORNER_COLORS,
    get TABLE_SURFACE_U() { return TABLE_SURFACE_U; },
    OFFSET_21,
    OFFSET_0,
    OFFSET_00,
};

// Get world position for a bet zone.
// For 2:1 and 0/00, interpolate directly along the edge corners
// instead of bilinear (which compresses positions).
function getZoneWorldPos(z) {
    // 2:1 column: midpoint between c21 edge and grid boundary at col 11
    // c21T = physical top (row 2 area), c21B = physical bottom (row 0 area)
    if (z.type === 'column' && localCorners.c21T && localCorners.c21B) {
        const t = (2.5 - z.row) / 3.0;
        const edgePos = localToWorld(
            localCorners.c21T.f * (1-t) + localCorners.c21B.f * t,
            localCorners.c21T.r * (1-t) + localCorners.c21B.r * t,
            localCorners.c21T.u * (1-t) + localCorners.c21B.u * t
        );
        const gridPos = gridToWorld(11, z.row);
        if (edgePos && gridPos) {
            const hRad = nativeTableHeading * Math.PI / 180;
            const sinH = Math.sin(hRad), cosH = Math.cos(hRad);
            return new mp.Vector3(
                (edgePos.x + gridPos.x) / 2 + OFFSET_21.f * (-sinH) + OFFSET_21.r * cosH,
                (edgePos.y + gridPos.y) / 2 + OFFSET_21.f * cosH + OFFSET_21.r * sinH,
                (edgePos.z + gridPos.z) / 2
            );
        }
        return edgePos;
    }
    // 0/00: midpoint between c0 edge and grid boundary at col 0
    // c0T = physical top (row 2 area), c0B = physical bottom (row 0 area)
    if (z.type === 'straight' && (z.value === 0 || z.value === '00') && localCorners.c0T && localCorners.c0B) {
        const t = z.value === '00' ? 0.25 : 0.75;
        const edgePos = localToWorld(
            localCorners.c0T.f * (1-t) + localCorners.c0B.f * t,
            localCorners.c0T.r * (1-t) + localCorners.c0B.r * t,
            localCorners.c0T.u * (1-t) + localCorners.c0B.u * t
        );
        const gridRow = z.value === '00' ? 1.5 : 0.5;
        const gridPos = gridToWorld(0, gridRow);
        const off = z.value === '00' ? OFFSET_00 : OFFSET_0;
        if (edgePos && gridPos) {
            const hRad = nativeTableHeading * Math.PI / 180;
            const sinH = Math.sin(hRad), cosH = Math.cos(hRad);
            return new mp.Vector3(
                (edgePos.x + gridPos.x) / 2 + off.f * (-sinH) + off.r * cosH,
                (edgePos.y + gridPos.y) / 2 + off.f * cosH + off.r * sinH,
                (edgePos.z + gridPos.z) / 2
            );
        }
        return edgePos;
    }
    return gridToWorld(z.col, z.row);
}

function getBetZoneFromHit(hitX, hitY) {
    if (!localCorners.c1 || !nativeTablePos) return null;
    // Convert hit to local space
    const loc = worldToLocal(hitX, hitY, nativeTablePos.z + TABLE_SURFACE_U);
    if (!loc) return null;

    // Convert local (f,r) to grid coordinates (col, row)
    // We need to invert the gridToWorld mapping.
    // The grid is split into regions, find which one the hit is in using the calibration corners.

    // First check rough bounds
    const allF = [], allR = [];
    for (const k of CORNER_KEYS) {
        if (localCorners[k]) { allF.push(localCorners[k].f); allR.push(localCorners[k].r); }
    }
    if (allF.length < 4) return null;
    const minF = Math.min(...allF) - 0.08;
    const maxF = Math.max(...allF) + 0.08;
    const minR = Math.min(...allR) - 0.08;
    const maxR = Math.max(...allR) + 0.08;
    if (loc.f < minF || loc.f > maxF || loc.r < minR || loc.r > maxR) return null;

    // Determine grid col/row from local position using inverse bilinear
    const gc = localToGridCoords(loc.f, loc.r);
    if (!gc) return null;
    const col = gc.col, row = gc.row;

    // Now determine which zone this grid position falls in:

    // 0/00 area: col < -0.5, row -0.5 to 2.5
    if (col < -0.5 && row >= -0.5 && row <= 2.5) {
        if (row < 1.0) return BET_ZONES.find(z => z.value === 0);
        return BET_ZONES.find(z => z.value === '00');
    }

    // 2:1 column area: col > 11.5, row -0.5 to 2.5
    if (col > 11.5 && row >= -0.5 && row <= 2.5) {
        if (row < 0.5) return BET_ZONES.find(z => z.type === 'column' && z.value === 1);
        if (row < 1.5) return BET_ZONES.find(z => z.type === 'column' && z.value === 2);
        return BET_ZONES.find(z => z.type === 'column' && z.value === 3);
    }

    // Main number grid: col -0.5 to 11.5, row -0.5 to 2.5
    if (col >= -0.5 && col <= 11.5 && row >= -0.5 && row <= 2.5) {
        const c = Math.floor(col + 0.5); // 0..11
        const r = Math.floor(row + 0.5); // 0..2
        if (c >= 0 && c < 12 && r >= 0 && r < 3) {
            const num = GRID_ROWS[r][c];
            return BET_ZONES.find(z => z.type === 'straight' && z.value === num);
        }
    }

    // Dozens row: col -0.5 to 11.5, row -0.5 to -1.0
    if (col >= -0.5 && col <= 11.5 && row < -0.5 && row >= -1.0) {
        if (col < 3.5) return BET_ZONES.find(z => z.type === 'dozen' && z.value === 1);
        if (col < 7.5) return BET_ZONES.find(z => z.type === 'dozen' && z.value === 2);
        return BET_ZONES.find(z => z.type === 'dozen' && z.value === 3);
    }

    // Outside bets row: col -0.5 to 11.5, row -1.0 to -1.5
    if (col >= -0.5 && col <= 11.5 && row < -1.0 && row >= -1.5) {
        if (col < 1.5) return BET_ZONES.find(z => z.type === 'low');
        if (col < 3.5) return BET_ZONES.find(z => z.type === 'even');
        if (col < 5.5) return BET_ZONES.find(z => z.type === 'red');
        if (col < 7.5) return BET_ZONES.find(z => z.type === 'black');
        if (col < 9.5) return BET_ZONES.find(z => z.type === 'odd');
        return BET_ZONES.find(z => z.type === 'high');
    }

    return null;
}

// Inverse mapping: local (f, r) → grid (col, row)
function localToGridCoords(f, r) {
    if (!localCorners.c1 || !localCorners.c34 || !localCorners.c3 || !localCorners.c36) return null;

    // Check special regions FIRST (before main grid Newton)

    // 2:1 area
    if (localCorners.c21T && localCorners.c21B) {
        const c21 = gridToLocal21(f, r);
        if (c21) return c21;
    }
    // 0/00 area
    if (localCorners.c0T && localCorners.c0B) {
        const c0 = gridToLocal0(f, r);
        if (c0) return c0;
    }
    // Bottom area (dozens + outside)
    if (localCorners.cBotTL && localCorners.cBotBL && localCorners.cBotTR && localCorners.cBotBR) {
        const botLoc = gridToLocalBot(f, r);
        if (botLoc) return botLoc;
    }

    // Main number grid: Newton iteration
    const c1 = localCorners.c1, c36 = localCorners.c36;
    let col = 11 * (r - c1.r) / (c36.r - c1.r || 0.001);
    let row = 2 * (f - c1.f) / (c36.f - c1.f || 0.001);

    for (let iter = 0; iter < 8; iter++) {
        const loc = gridToLocal(Math.max(-0.5, Math.min(11.5, col)), Math.max(-0.5, Math.min(2.5, row)));
        if (!loc) break;
        const ef = f - loc.f;
        const er = r - loc.r;
        if (Math.abs(ef) < 0.0001 && Math.abs(er) < 0.0001) break;
        const dc = 0.01, dr = 0.01;
        const locC = gridToLocal(Math.max(-0.5, Math.min(11.5, col + dc)), Math.max(-0.5, Math.min(2.5, row)));
        const locR = gridToLocal(Math.max(-0.5, Math.min(11.5, col)), Math.max(-0.5, Math.min(2.5, row + dr)));
        if (!locC || !locR) break;
        const dfdc = (locC.f - loc.f) / dc;
        const drdc = (locC.r - loc.r) / dc;
        const dfdr = (locR.f - loc.f) / dr;
        const drdr = (locR.r - loc.r) / dr;
        const det = dfdc * drdr - dfdr * drdc;
        if (Math.abs(det) < 1e-8) break;
        col += (drdr * ef - dfdr * er) / det;
        row += (dfdc * er - drdc * ef) / det;
    }

    return { col, row };
}

// Check if point is in the bottom area (dozens + outside)
function gridToLocalBot(f, r) {
    const tl = localCorners.cBotTL, tr = localCorners.cBotTR;
    const bl = localCorners.cBotBL, br = localCorners.cBotBR;
    // Solve for u,v in bilinear: tl*(1-u)*(1-v) + tr*u*(1-v) + bl*(1-u)*v + br*u*v = (f,r)
    // Try if point is roughly in this rectangle
    const minF = Math.min(tl.f, tr.f, bl.f, br.f) - 0.02;
    const maxF = Math.max(tl.f, tr.f, bl.f, br.f) + 0.02;
    const minR = Math.min(tl.r, tr.r, bl.r, br.r) - 0.02;
    const maxR = Math.max(tl.r, tr.r, bl.r, br.r) + 0.02;
    if (f < minF || f > maxF || r < minR || r > maxR) return null;
    // Solve inverse bilinear
    let u = (r - tl.r) / (tr.r - tl.r || 0.001);
    let v = (f - tl.f) / (bl.f - tl.f || 0.001);
    for (let i = 0; i < 5; i++) {
        const pf = (1-u)*(1-v)*tl.f + u*(1-v)*tr.f + (1-u)*v*bl.f + u*v*br.f;
        const pr = (1-u)*(1-v)*tl.r + u*(1-v)*tr.r + (1-u)*v*bl.r + u*v*br.r;
        const ef = f - pf, er = r - pr;
        if (Math.abs(ef) < 0.0001 && Math.abs(er) < 0.0001) break;
        const dfdu = (1-v)*(tr.f-tl.f) + v*(br.f-bl.f);
        const dfdv = (1-u)*(bl.f-tl.f) + u*(br.f-bl.f);
        const drdu = (1-v)*(tr.r-tl.r) + v*(br.r-bl.r);
        const drdv = (1-u)*(bl.r-tl.r) + u*(br.r-bl.r);
        const det = dfdu*drdv - dfdv*drdu;
        if (Math.abs(det) < 1e-8) break;
        u += (drdv*ef - dfdv*er) / det;
        v += (dfdu*er - drdu*ef) / det;
    }
    if (u >= -0.05 && u <= 1.05 && v >= -0.05 && v <= 1.05) {
        return { col: -0.5 + u * 12.0, row: -0.5 - v * 1.0 };
    }
    return null;
}

// Check if point is in the 2:1 area
function gridToLocal21(f, r) {
    const t = localCorners.c21T, b = localCorners.c21B;
    // Left edge = grid boundary at col 11.5
    const gridRT = gridToLocal(11.5, 0);
    const gridRB = gridToLocal(11.5, 2);
    if (!gridRT || !gridRB) return null;
    const minR = Math.min(gridRT.r, gridRB.r, t.r, b.r) - 0.02;
    const maxR = Math.max(gridRT.r, gridRB.r, t.r, b.r) + 0.02;
    const minF = Math.min(gridRT.f, gridRB.f, t.f, b.f) - 0.02;
    const maxF = Math.max(gridRT.f, gridRB.f, t.f, b.f) + 0.02;
    if (f < minF || f > maxF || r < minR || r > maxR) return null;
    const v = (f - t.f) / (b.f - t.f || 0.001); // 0=top, 1=bottom
    if (v < -0.1 || v > 1.1) return null;
    const leftR = gridRT.r * (1-v) + gridRB.r * v;
    const rightR = t.r * (1-v) + b.r * v;
    const u = (r - leftR) / (rightR - leftR || 0.001);
    if (u >= 0 && u <= 1.1) {
        return { col: 11.5 + u * 1.0, row: 2.5 - v * 3.0 };
    }
    return null;
}

// Check if point is in the 0/00 area
function gridToLocal0(f, r) {
    const t = localCorners.c0T, b = localCorners.c0B;
    // Right edge = grid boundary at col -0.5
    const gridLT = gridToLocal(-0.5, 0);
    const gridLB = gridToLocal(-0.5, 2);
    if (!gridLT || !gridLB) return null;
    const minR = Math.min(gridLT.r, gridLB.r, t.r, b.r) - 0.02;
    const maxR = Math.max(gridLT.r, gridLB.r, t.r, b.r) + 0.02;
    const minF = Math.min(gridLT.f, gridLB.f, t.f, b.f) - 0.02;
    const maxF = Math.max(gridLT.f, gridLB.f, t.f, b.f) + 0.02;
    if (f < minF || f > maxF || r < minR || r > maxR) return null;
    const v = (f - t.f) / (b.f - t.f || 0.001);
    if (v < -0.1 || v > 1.1) return null;
    const rightR = gridLT.r * (1-v) + gridLB.r * v;
    const leftR = t.r * (1-v) + b.r * v;
    const u = (r - leftR) / (rightR - leftR || 0.001);
    if (u >= -0.1 && u <= 1.0) {
        return { col: -1.5 + u * 1.0, row: 2.5 - v * 3.0 };
    }
    return null;
}


let nearestDist2 = 0;
let showDebugGrid = false;
let gridEditorActive = false;
let gridEditorCorner = 0;
let gridEditorBackup = null;
let offsetEditorActive = false;
let calibrationActive = false;
let calibrationStep = 0;
let calibrationMessages = [];
let calibrationMsgTime = 0;
const CALIBRATION_SEQUENCE = CORNER_KEYS;
const CALIBRATION_LABELS = CORNER_NAMES;

// Expose debug state for debug_tools.js (getter/setter bridge)
global.rouletteDebug = {
    get showDebugGrid() { return showDebugGrid; },
    set showDebugGrid(v) { showDebugGrid = v; },
    get gridEditorActive() { return gridEditorActive; },
    set gridEditorActive(v) { gridEditorActive = v; },
    get gridEditorCorner() { return gridEditorCorner; },
    set gridEditorCorner(v) { gridEditorCorner = v; },
    get gridEditorBackup() { return gridEditorBackup; },
    set gridEditorBackup(v) { gridEditorBackup = v; },
    get offsetEditorActive() { return offsetEditorActive; },
    set offsetEditorActive(v) { offsetEditorActive = v; },
    get calibrationActive() { return calibrationActive; },
    set calibrationActive(v) { calibrationActive = v; },
    get calibrationStep() { return calibrationStep; },
    set calibrationStep(v) { calibrationStep = v; },
    get calibrationMessages() { return calibrationMessages; },
    set calibrationMessages(v) { calibrationMessages = v; },
    get calibrationMsgTime() { return calibrationMsgTime; },
    set calibrationMsgTime(v) { calibrationMsgTime = v; },
    recordCalibrationPoint: () => {},
};

// ──────────────────────────────────────────
// RENDER LOOP — raytrace from gameplay camera + LMB bet
// ──────────────────────────────────────────
let lmbWasPressed = false;
let rmbWasPressed = false;

mp.events.add('render', () => {
    if (!isAtRouletteTable) return;

    // Force local player visible (GTA hides ped when scriptcam is close)
    mp.game.entity.setVisible(mp.players.local.handle, true, false);

    // ── ANIMATION STATE MACHINE — 3 independent if blocks (like ruski casino.js) ──
    if (rouletteSpinData && nativeRouletteTable && nativeRouletteBall) {
        const sd = rouletteSpinData;

        // 1) intro_wheel → loop_wheel
        if (nativeRouletteTable.isPlayingAnim(ANIM_LIB, 'intro_wheel', 3)) {
            if (nativeRouletteTable.getAnimCurrentTime(ANIM_LIB, 'intro_wheel') > 0.9425) {
                nativeRouletteTable.playAnim('loop_wheel', ANIM_LIB, 1000.0, true, true, true, 0, 131072);
            }
        }

        // 2) intro_ball → sync + loop_ball
        if (nativeRouletteBall.isPlayingAnim(ANIM_LIB, 'intro_ball', 3)) {
            if (nativeRouletteBall.getAnimCurrentTime(ANIM_LIB, 'intro_ball') > 0.99) {
                const bp = nativeRouletteTable.getWorldPositionOfBone(nativeRouletteTable.getBoneIndexByName('Roulette_Wheel'));
                const br = nativeRouletteTable.getRotation(2);
                nativeRouletteBall.position = new mp.Vector3(bp.x, bp.y, bp.z);
                nativeRouletteBall.rotation = new mp.Vector3(br.x, br.y, br.z + 90);
                nativeRouletteBall.playAnim('loop_ball', ANIM_LIB, 1000.0, true, true, false, 0, 136704);
            }
        }

        // 3) loop_wheel → count spins → exit
        if (!sd.exiting && nativeRouletteTable.isPlayingAnim(ANIM_LIB, 'loop_wheel', 3)) {
            const t = nativeRouletteTable.getAnimCurrentTime(ANIM_LIB, 'loop_wheel');
            if (t >= 0.9 && Date.now() - sd.lastSpinTime > 1000) {
                sd.spins++;
                sd.lastSpinTime = Date.now();
            }
            if (sd.spins == sd.needSpins - 1 && !sd.slowed) {
                nativeRouletteBall.setAnimSpeed(ANIM_LIB, 'loop_ball', 0.70);
                sd.slowed = true;
            }
            if (sd.spins >= sd.needSpins && t > 0.95) {
                nativeRouletteTable.playAnim(sd.endTable, ANIM_LIB, 1000.0, false, true, true, 0, 131072);
                const bp = nativeRouletteTable.getWorldPositionOfBone(nativeRouletteTable.getBoneIndexByName('Roulette_Wheel'));
                const br = nativeRouletteTable.getRotation(2);
                nativeRouletteBall.position = new mp.Vector3(bp.x, bp.y, bp.z);
                nativeRouletteBall.rotation = new mp.Vector3(br.x, br.y, br.z + 90);
                nativeRouletteBall.playAnim(sd.endBall, ANIM_LIB, 1000.0, false, true, true, 0, 136704);
                sd.exiting = true;
                sd.exitStart = Date.now();
            }
        }

        // 4) Wait for exit animation to finish, then clear
        //    Require at least 6s after exit starts so ball visually settles
        if (sd.exiting) {
            const exitElapsed = Date.now() - (sd.exitStart || 0);
            if (exitElapsed > 6000) {
                const tableExitDone = !nativeRouletteTable.isPlayingAnim(ANIM_LIB, sd.endTable, 3)
                    || nativeRouletteTable.getAnimCurrentTime(ANIM_LIB, sd.endTable) > 0.95;
                const ballExitDone = !nativeRouletteBall.isPlayingAnim(ANIM_LIB, sd.endBall, 3)
                    || nativeRouletteBall.getAnimCurrentTime(ANIM_LIB, sd.endBall) > 0.95;
                if (tableExitDone && ballExitDone) {
                    rouletteSpinData = null;
                }
            }
        }
    }

    // Show buffered result once animation fully finished (including exit)
    if (pendingResult && !rouletteSpinData) {
        const pr = pendingResult;
        pendingResult = null;
        const colorName = pr.color === 'red' ? 'Rosu' : pr.color === 'black' ? 'Negru' : 'Verde';
        try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[RULETA] Rezultat: ${pr.number} (${colorName})`})); } catch(e) {}
        if (rouletteBrowser) {
            let j = JSON.stringify(pr.state);
            rouletteBrowser.execute(`if(typeof onShowResult==='function')onShowResult(${pr.number},'${pr.color}','${j.replace(/'/g, "\\'")}');`);
        }
        rouletteSpinning = false;
        rouletteHistory.unshift({ number: pr.number, color: pr.color });
        if (rouletteHistory.length > 15) rouletteHistory.pop();
        // Keep spin camera for a few more seconds so player sees ball resting
        setTimeout(() => {
            if (!global.freecamActive) restoreCameraFromWheel();
            rouletteBetting = false;
            clearChipObjects(); clearOtherChipObjects();
        }, 4000);
    }

    // Disable attack/aim so LMB/RMB don't shoot
    mp.game.controls.disableControlAction(0, 24, true);  // attack
    mp.game.controls.disableControlAction(0, 25, true);  // aim
    mp.game.controls.disableControlAction(0, 142, true); // melee
    // Disable movement
    mp.game.controls.disableControlAction(0, 30, true);  // move LR
    mp.game.controls.disableControlAction(0, 31, true);  // move UD
    mp.game.controls.disableControlAction(0, 21, true);  // sprint
    mp.game.controls.disableControlAction(0, 22, true);  // jump

    // ── MOUSE LOOK (update camera rotation) ──
    if (rouletteCam) {
        const mouseX = mp.game.controls.getDisabledControlNormal(0, 1); // look LR
        const mouseY = mp.game.controls.getDisabledControlNormal(0, 2); // look UD
        camRotZ -= mouseX * CAM_SENSITIVITY;
        camRotX -= mouseY * CAM_SENSITIVITY;
        // Clamp
        camRotX = Math.max(CAM_PITCH_MIN, Math.min(CAM_PITCH_MAX, camRotX));
        camRotZ = Math.max(camBaseRotZ - CAM_YAW_RANGE, Math.min(camBaseRotZ + CAM_YAW_RANGE, camRotZ));
        rouletteCam.setRot(camRotX, 0, camRotZ, 2);
    }

    // ── LMB BET ──
    const lmbNow = mp.game.controls.isDisabledControlPressed(0, 24);
    if (lmbNow && !lmbWasPressed) {
        if (gridEditorActive && (rayPlanePos || rayHitPos)) {
            const pos = rayPlanePos || rayHitPos;
            const key = CORNER_KEYS[gridEditorCorner];
            const loc = worldToLocal(pos.x, pos.y, pos.z);
            if (loc) {
                localCorners[key] = { f: loc.f, r: loc.r, u: TABLE_SURFACE_U };
                try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[EDITOR] ${CORNER_NAMES[gridEditorCorner]} = F:${loc.f.toFixed(3)} R:${loc.r.toFixed(3)}`})); } catch(e) {}
            }
        } else if (calibrationActive) {
            const pos = rayPlanePos || rayHitPos;
            if (pos) {
                const loc = worldToLocal(pos.x, pos.y, pos.z);
                if (loc) global.rouletteDebug.recordCalibrationPoint(loc);
            }
        } else if ((rayPlanePos || rayHitPos) && rayHitBetZone && !rouletteSpinning && rouletteBetting) {
            if (selectedChipAmount > myChips) {
                mp.game.graphics.notify('~r~Nu ai suficienți bani!');
            } else {
                const chipPos = rayPlanePos || rayHitPos;
                const chipZ = nativeTablePos ? nativeTablePos.z + TABLE_SURFACE_U : chipPos.z;
                const zoneKey = `${rayHitBetZone.type}_${rayHitBetZone.value}`;
                // If same zone already has chips, stack at same X,Y (zone center)
                let cx = chipPos.x, cy = chipPos.y;
                if (placedChipsByZone[zoneKey] && placedChipsByZone[zoneKey].length > 0) {
                    cx = placedChipsByZone[zoneKey][0].x;
                    cy = placedChipsByZone[zoneKey][0].y;
                }
                mp.events.callRemote('Server_ReceiveRouletteBet', rayHitBetZone.type, String(rayHitBetZone.value), selectedChipAmount, cx, cy, chipZ);
                spawnChipOnTable(cx, cy, chipZ, selectedChipAmount, zoneKey);
            }
        }
    }
    lmbWasPressed = lmbNow;

    // ── RMB REMOVE BET ──
    const rmbNow = mp.game.controls.isDisabledControlPressed(0, 25);
    if (rmbNow && !rmbWasPressed) {
        if ((rayPlanePos || rayHitPos) && rayHitBetZone && !rouletteSpinning && rouletteBetting) {
            const zoneKey = `${rayHitBetZone.type}_${rayHitBetZone.value}`;
            if (placedChipsByZone[zoneKey] && placedChipsByZone[zoneKey].length > 0) {
                // Remove last chip from this zone
                const lastChip = placedChipsByZone[zoneKey].pop();
                if (lastChip) {
                    try { lastChip.obj.destroy(); } catch(e) {}
                    const idx = placedChipObjects.indexOf(lastChip);
                    if (idx !== -1) placedChipObjects.splice(idx, 1);
                }
                // Tell server to remove the bet
                mp.events.callRemote('Server_RemoveRouletteBet', rayHitBetZone.type, String(rayHitBetZone.value));
            }
        }
    }
    rmbWasPressed = rmbNow;

    // ── RAYTRACE from active camera center (skip during spin — performance) ──
    if (rouletteSpinning) return;
    const activeCam = rouletteCam || mp.cameras.new('gameplay');
    const gameCam = activeCam.getCoord();
    const gameRot = activeCam.getRot(2);
    const pRad = gameRot.x * Math.PI / 180;
    const yRad = gameRot.z * Math.PI / 180;
    const dX = -Math.sin(yRad) * Math.cos(pRad);
    const dY =  Math.cos(yRad) * Math.cos(pRad);
    const dZ =  Math.sin(pRad);
    const rl = 20.0;
    const endP = new mp.Vector3(gameCam.x + dX * rl, gameCam.y + dY * rl, gameCam.z + dZ * rl);

    const excludeHandles = [mp.players.local.handle];
    if (nativeRouletteTable) excludeHandles.push(nativeRouletteTable.handle);
    if (hiddenServerProp) excludeHandles.push(hiddenServerProp);
    for (const h of hiddenServerProps) { excludeHandles.push(h); }
    const ray = mp.raycasting.testPointToPoint(gameCam, endP, excludeHandles, 31);
    if (ray && ray.position) {
        rayHitPos = ray.position;
    } else {
        rayHitPos = null;
    }

    // Ray-plane intersection: project crosshair onto table surface
    // Uses TABLE_SURFACE_U constant — raycast Z is unreliable (hits glass dome)
    rayPlanePos = null;
    if (nativeTablePos && Math.abs(dZ) > 0.001) {
        const tableZ = nativeTablePos.z + TABLE_SURFACE_U;
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

    // ── DRAW CROSSHAIR (hide during spin) ──
    if (!rouletteSpinning) {
        mp.game.graphics.drawRect(0.5, 0.5, 0.002, 0.016, 255, 215, 0, 200);
        mp.game.graphics.drawRect(0.5, 0.5, 0.016, 0.002, 255, 215, 0, 200);
    }

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
            const wp = getZoneWorldPos(z);
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
        gridLines.push([[-0.5, 0.5], [-0.5, 1.5]]);   // 0/00 divider
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
                    0, 0, 0, 0, 0, 0, isSel ? 0.03 : 0.018, isSel ? 0.03 : 0.018, isSel ? 0.03 : 0.018,
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
            `~y~Tab~w~=schimba colt  ~y~Sageti~w~=muta(+Shift=rapid)  ~y~LMB~w~=pune la crosshair  ~y~R~w~=revert  ~y~H~w~=salveaza`,
            [0.5, 0.10],
            { font: 4, color: [200, 200, 200, 200], scale: [0.22, 0.22], outline: true, centre: true }
        );
    }

    // ── DRAW HIT MARKER (chip model preview) ──
    const displayPos = rayPlanePos || rayHitPos;
    if (displayPos && rouletteBetting && !rouletteSpinning) {
        // Create or swap preview chip object when chip amount changes
        if (!previewChipObject || previewChipAmount !== selectedChipAmount) {
            if (previewChipObject) { try { previewChipObject.destroy(); } catch(e) {} previewChipObject = null; }
            const propName = CHIP_AMOUNT_TO_HASH[selectedChipAmount] || CHIP_AMOUNT_TO_HASH[25];
            const hash = mp.game.joaat(propName);
            if (mp.game.streaming.hasModelLoaded(hash)) {
                previewChipObject = mp.objects.new(hash, new mp.Vector3(displayPos.x, displayPos.y, displayPos.z + 0.01 + CHIP_HEIGHT_OFFSET));
                previewChipObject.setAlpha(180);
                previewChipAmount = selectedChipAmount;
            } else {
                mp.game.streaming.requestModel(hash);
                // Fallback: show small marker while model loads
                mp.game.graphics.drawMarker(28, displayPos.x, displayPos.y, displayPos.z + 0.01,
                    0, 0, 0, 0, 0, 0, 0.015, 0.015, 0.015,
                    255, 215, 0, 200, false, false, 2, false, null, null, false);
            }
        }
        // Update preview chip position each frame
        if (previewChipObject) {
            previewChipObject.position = new mp.Vector3(displayPos.x, displayPos.y, displayPos.z + 0.01 + CHIP_HEIGHT_OFFSET);
        }

        if (rayHitBetZone) {
            // ── HIGHLIGHT: draw YELLOW highlights on covered cells ──
            const coveredNums = getZoneNumbers(rayHitBetZone);
            const isMultiNum = rayHitBetZone.type !== 'straight';

            // Helper: draw yellow highlight on a single number cell in the main grid
            const highlightGridCell = (num) => {
                const g = NUM_GRID[num];
                if (!g) return;
                const cc = gridToWorld(g.col, g.row);
                if (!cc) return;
                const cL = gridToWorld(g.col - 0.5, g.row);
                const cR = gridToWorld(g.col + 0.5, g.row);
                const cT = gridToWorld(g.col, g.row - 0.5);
                const cB = gridToWorld(g.col, g.row + 0.5);
                if (cL && cR && cT && cB) {
                    const sx = Math.sqrt((cR.x-cL.x)**2 + (cR.y-cL.y)**2);
                    const sy = Math.sqrt((cB.x-cT.x)**2 + (cB.y-cT.y)**2);
                    mp.game.graphics.drawMarker(25,
                        cc.x, cc.y, cc.z + 0.002,
                        0, 0, 0, 0, 0, nativeTableHeading,
                        sx, sy, 0.002, 255, 215, 0, 90,
                        false, false, 2, false, null, null, false);
                }
            };

            // Helper: get standard grid cell size from a reference cell (col 5, row 1)
            const getRefCellSize = () => {
                const cL = gridToWorld(4.5, 1), cR = gridToWorld(5.5, 1);
                const cT = gridToWorld(5, 0.5), cB = gridToWorld(5, 1.5);
                if (!cL || !cR || !cT || !cB) return null;
                return {
                    sx: Math.sqrt((cR.x-cL.x)**2 + (cR.y-cL.y)**2),
                    sy: Math.sqrt((cB.x-cT.x)**2 + (cB.y-cT.y)**2)
                };
            };

            // Helper: highlight a 2:1 cell — same size as a regular number cell
            const highlight21Cell = (row) => {
                const zone = BET_ZONES.find(z => z.type === 'column' && z.row === row);
                if (!zone) return;
                const cc = getZoneWorldPos(zone);
                const sz = getRefCellSize();
                if (!cc || !sz) return;
                mp.game.graphics.drawMarker(25,
                    cc.x, cc.y, cc.z + 0.002,
                    0, 0, 0, 0, 0, nativeTableHeading,
                    sz.sx, sz.sy, 0.002, 255, 215, 0, 100,
                    false, false, 2, false, null, null, false);
            };

            // Helper: highlight a 0 or 00 cell — same size as a regular number cell
            const highlight0Cell = (is00) => {
                const zone = BET_ZONES.find(z => z.type === 'straight' && (is00 ? z.value === '00' : z.value === 0));
                if (!zone) return;
                const cc = getZoneWorldPos(zone);
                const sz = getRefCellSize();
                if (!cc || !sz) return;
                mp.game.graphics.drawMarker(25,
                    cc.x, cc.y, cc.z + 0.002,
                    0, 0, 0, 0, 0, nativeTableHeading,
                    sz.sx, sz.sy, 0.002, 255, 215, 0, 100,
                    false, false, 2, false, null, null, false);
            };

            if (isMultiNum) {
                // Highlight each covered number cell in yellow
                for (const num of coveredNums) highlightGridCell(num);

                // Also highlight the bet zone button itself
                if (rayHitBetZone.type === 'column') {
                    highlight21Cell(rayHitBetZone.row);
                } else {
                    const zoneCenter = getZoneWorldPos(rayHitBetZone);
                    if (zoneCenter) {
                        let cellW = 1, cellH = 1;
                        if (rayHitBetZone.type === 'dozen') { cellW = 4; cellH = 0.5; }
                        else if (['low','high','even','odd','red','black'].includes(rayHitBetZone.type)) { cellW = 2; cellH = 0.5; }
                        const halfW = cellW / 2, halfH = cellH / 2;
                        const pL = gridToWorld(rayHitBetZone.col - halfW, rayHitBetZone.row);
                        const pR = gridToWorld(rayHitBetZone.col + halfW, rayHitBetZone.row);
                        const pT = gridToWorld(rayHitBetZone.col, rayHitBetZone.row - halfH);
                        const pB = gridToWorld(rayHitBetZone.col, rayHitBetZone.row + halfH);
                        if (pL && pR && pT && pB) {
                            const sizeX = Math.sqrt((pR.x-pL.x)**2 + (pR.y-pL.y)**2);
                            const sizeY = Math.sqrt((pB.x-pT.x)**2 + (pB.y-pT.y)**2);
                            mp.game.graphics.drawMarker(25,
                                zoneCenter.x, zoneCenter.y, zoneCenter.z + 0.002,
                                0, 0, 0, 0, 0, nativeTableHeading,
                                sizeX, sizeY, 0.002, 255, 215, 0, 100,
                                false, false, 2, false, null, null, false);
                        }
                    }
                }
            } else {
                // Single number — yellow highlight
                if (rayHitBetZone.value === 0 || rayHitBetZone.value === '00') {
                    highlight0Cell(rayHitBetZone.value === '00');
                } else {
                    highlightGridCell(rayHitBetZone.value);
                }
            }

            // Preview text: colored by zone type (red for red, white for black, green for 0/00)
            const lblColor = rayHitBetZone.color === 'red' ? [255, 50, 50, 255]
                : rayHitBetZone.color === 'black' ? [255, 255, 255, 255]
                : rayHitBetZone.color === 'green' ? [0, 220, 0, 255]
                : [255, 215, 0, 255];
            mp.game.graphics.drawText(`${rayHitBetZone.label}`, [0.5, 0.56],
                { font: 4, color: lblColor, scale: [0.40, 0.40], outline: true, centre: true });

            mp.game.graphics.drawText(`Chip: $${selectedChipAmount}`, [0.5, 0.62],
                { font: 4, color: [255, 255, 255, 200], scale: [0.35, 0.35], outline: true, centre: true });
        }
    } else {
        // Destroy preview when not betting or no hit
        if (previewChipObject) { try { previewChipObject.destroy(); } catch(e) {} previewChipObject = null; previewChipAmount = 0; }
    }

    // HUD: bets, history, status — all handled by CEF now

    // ── CHIP GLOW EFFECT ──
    const glowPulse = (Math.sin(Date.now() * 0.005) + 1) / 2; // 0..1 pulsing
    const glowAlpha = Math.floor(80 + glowPulse * 120); // 80..200
    const glowSize = 0.025 + glowPulse * 0.015; // 0.025..0.040
    for (const chip of placedChipObjects) {
        try {
            const cp = chip.obj.position;
            mp.game.graphics.drawMarker(25, cp.x, cp.y, cp.z + 0.015,
                0, 0, 0, 0, 0, 0, glowSize, glowSize, 0.003,
                255, 215, 0, glowAlpha, false, false, 2, false, null, null, false);
        } catch(e) {}
    }

    // Controls hint — handled by CEF now

    // ── KEYBIND INDICATOR HUD ──
    const isAdmin = (mp.players.local.getVariable('adminLevel') || 0) >= 3;
    const hintLines = [];
    if (rouletteBetting && !rouletteSpinning) {
        hintLines.push('~y~LMB~w~ Plaseaza pariu');
        hintLines.push('~y~RMB~w~ Scoate pariu');
        hintLines.push('~y~← →~w~ Schimba chip');
        hintLines.push('~y~E~w~ Paraseste masa');
    }
    if (isAdmin) {
        hintLines.push('');
        hintLines.push('~o~[ADMIN]');
        hintLines.push('~y~F~w~ Calibrare');
        hintLines.push('~y~G~w~ Debug grid');
        hintLines.push('~y~H~w~ Grid editor');
        hintLines.push('~y~J~w~ Offset editor');
    }
    if (hintLines.length > 0) {
        const hintX = 0.01;
        const hintBaseY = 0.75;
        for (let hi = 0; hi < hintLines.length; hi++) {
            mp.game.graphics.drawText(hintLines[hi], [hintX, hintBaseY + hi * 0.022],
                { font: 4, color: [220, 220, 220, 200], scale: [0.28, 0.28], outline: true, centre: false });
        }
    }
});

// ──────────────────────────────────────────
// CHIP SELECT (1-6) + PLACE (LMB) + CLEAR (C)
// ──────────────────────────────────────────
const CHIP_AMOUNTS = [25, 50, 100, 500, 1000, 5000];
let selectedChipIndex = 0;

// Arrow keys cycle through chips
mp.keys.bind(KEY_LT, true, () => {
    if (global.chatInputActive) return;
    if (!isAtRouletteTable) return;
    if (rouletteSpinning) return;
    selectedChipIndex = (selectedChipIndex - 1 + CHIP_AMOUNTS.length) % CHIP_AMOUNTS.length;
    selectedChipAmount = CHIP_AMOUNTS[selectedChipIndex];
    if (rouletteBrowser) rouletteBrowser.execute(`if(typeof setSelectedChip==='function')setSelectedChip(${selectedChipAmount},${selectedChipIndex},'left');`);
});
mp.keys.bind(KEY_RT, true, () => {
    if (global.chatInputActive) return;
    if (!isAtRouletteTable) return;
    if (rouletteSpinning) return;
    selectedChipIndex = (selectedChipIndex + 1) % CHIP_AMOUNTS.length;
    selectedChipAmount = CHIP_AMOUNTS[selectedChipIndex];
    if (rouletteBrowser) rouletteBrowser.execute(`if(typeof setSelectedChip==='function')setSelectedChip(${selectedChipAmount},${selectedChipIndex},'right');`);
});

// LMB bet is now handled inside the render loop via isDisabledControlPressed

mp.keys.bind(0x43, true, () => { // C key
    if (global.chatInputActive) return;
    if (!isAtRouletteTable) return;
    mp.events.callRemote('Server_ClearRouletteBets');
    clearChipObjects();
    mp.gui.chat.push('~y~[RULETA] ~w~Pariuri sterse.');
});

// Map chip amounts to specific prop models
let CHIP_AMOUNT_TO_HASH = {
    25:   'vw_prop_chip_10dollar_st',
    50:   'vw_prop_chip_50dollar_x1',
    100:  'vw_prop_chip_500dollar_x1',
    500:  'vw_prop_chip_1kdollar_st',
    1000: 'vw_prop_chip_1kdollar_st',
    5000: 'vw_prop_chip_5kdollar_x1',
};

// Ball offset (local, rotated by heading in spawn functions)
let BALL_OFFSET_X = -0.734742;
let BALL_OFFSET_Y = -0.16617;
let BALL_OFFSET_Z = 1.0715;

// Chip height offset (adjustable with Page Up/Down, persisted to config)
let CHIP_HEIGHT_OFFSET = 0.0;
let CHIP_STACK_OFFSET = 0.003;

function requestModel(hash) {
    return new Promise((resolve) => {
        if (mp.game.streaming.hasModelLoaded(hash)) { resolve(); return; }
        mp.game.streaming.requestModel(hash);
        let check = setInterval(() => {
            if (mp.game.streaming.hasModelLoaded(hash)) { clearInterval(check); resolve(); }
        }, 50);
    });
}

function spawnChipOnTable(x, y, z, amount, zoneKey) {
    const propName = CHIP_AMOUNT_TO_HASH[amount] || CHIP_AMOUNT_TO_HASH[25];
    const hash = mp.game.joaat(propName);
    requestModel(hash).then(() => {
        try {
            // Count chips already on this zone for stacking height
            const zoneChips = zoneKey && placedChipsByZone[zoneKey] ? placedChipsByZone[zoneKey].length : 0;
            const stackOffset = zoneChips * CHIP_STACK_OFFSET;
            const chipZ = z + CHIP_HEIGHT_OFFSET + stackOffset + 0.005; // +0.005 base offset so first chip doesn't clip
            const chip = mp.objects.new(hash,
                new mp.Vector3(x, y, chipZ));
            const entry = { obj: chip, zoneKey, x, y, z: chipZ };
            placedChipObjects.push(entry);
            if (zoneKey) {
                if (!placedChipsByZone[zoneKey]) placedChipsByZone[zoneKey] = [];
                placedChipsByZone[zoneKey].push(entry);
            }
        } catch(e) {}
    });
}

function spawnOtherChipOnTable(x, y, z, amount) {
    const propName = CHIP_AMOUNT_TO_HASH[amount] || CHIP_AMOUNT_TO_HASH[25];
    const hash = mp.game.joaat(propName);
    requestModel(hash).then(() => {
        try {
            const stackOffset = otherChipObjects.length * CHIP_STACK_OFFSET;
            const chip = mp.objects.new(hash,
                new mp.Vector3(x, y, z + CHIP_HEIGHT_OFFSET + stackOffset));
            otherChipObjects.push(chip);
        } catch(e) {}
    });
}

function clearChipObjects() {
    placedChipObjects.forEach(c => { try { c.obj.destroy(); } catch(e) {} });
    placedChipObjects = [];
    placedChipsByZone = {};
}

function clearOtherChipObjects() {
    otherChipObjects.forEach(c => { try { c.destroy(); } catch(e) {} });
    otherChipObjects = [];
}

// ──────────────────────────────────────────
// KEY BINDS
// ──────────────────────────────────────────
mp.keys.bind(KEY_ESC, true, () => {
    if (global.chatInputActive) return;
    if (isAtRouletteTable) {
        closeRouletteUI();
        mp.events.callRemote('Server_LeaveRouletteTable');
    }
});

// ──────────────────────────────────────────
// OPEN / CLOSE
// ──────────────────────────────────────────
mp.events.add('openRouletteUI', (tableX, tableY, tableZ, tableHeading, tableIndex, seatIndex) => {
    spawnNativeRoulette(tableX, tableY, tableZ, tableHeading);
    isAtRouletteTable = true;
    currentTableIndex = tableIndex !== undefined ? tableIndex : -1;
    currentSeatIndex = (seatIndex !== undefined && seatIndex < SEAT_POSITIONS.length) ? seatIndex : 0;
    updateGlobalTableData();
    loadAnimDict(ANIM_LIB);

    if (!global.freecamActive) {
        positionPlayerAtTable(currentSeatIndex);
        createRouletteCamera();
    }

    if (rouletteBrowser === null) {
        rouletteBrowser = mp.browsers.new('package://roulette/index.html');
    }
});

// Server sends saved grid corners on join
mp.events.add('rouletteLoadGridCorners', (cornersJson) => {
    try {
        const c = JSON.parse(cornersJson);
        if (c.c1 && c.c3 && c.c34 && c.c36) {
            // Always use TABLE_SURFACE_U — saved U may be wrong (dome hit)
            for (const k of CORNER_KEYS) {
                if (c[k]) localCorners[k] = { f: c[k].f, r: c[k].r, u: TABLE_SURFACE_U };
            }
            // Backward compat: old cBotL/cBotR → estimate new corners
            if (c.cBotL && c.cBotR && !c.cBotTL) {
                localCorners.cBotTL = { f: c.c1.f, r: c.cBotL.r, u: tableU };
                localCorners.cBotTR = { f: c.c34.f, r: c.cBotR.r, u: tableU };
                localCorners.cBotBL = { f: c.cBotL.f, r: c.cBotL.r, u: tableU };
                localCorners.cBotBR = { f: c.cBotR.f, r: c.cBotR.r, u: tableU };
            }
            mp.console.logInfo('[GRID] Local corners loaded (F/R/U format)');
            try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: '[GRID] Grid incarcat (coordonate locale)'})); } catch(e) {}
        }
    } catch(e) { mp.console.logInfo('[GRID] Failed to parse: ' + e); }
});

// Server sends roulette config (seats, camera, chip models, etc.)
mp.events.add('rouletteLoadConfig', (configJson) => {
    try {
        const cfg = JSON.parse(configJson);
        if (cfg.TABLE_SURFACE_U !== undefined) TABLE_SURFACE_U = cfg.TABLE_SURFACE_U;
        if (cfg.CHIP_HEIGHT_OFFSET !== undefined) CHIP_HEIGHT_OFFSET = cfg.CHIP_HEIGHT_OFFSET;
        if (cfg.CHIP_STACK_OFFSET !== undefined) CHIP_STACK_OFFSET = cfg.CHIP_STACK_OFFSET;
        if (cfg.camera) {
            if (cfg.camera.offset_f !== undefined) CAM_OFFSET_F = cfg.camera.offset_f;
            if (cfg.camera.offset_r !== undefined) CAM_OFFSET_R = cfg.camera.offset_r;
            if (cfg.camera.offset_u !== undefined) CAM_OFFSET_U = cfg.camera.offset_u;
            if (cfg.camera.lookat_f !== undefined) CAM_LOOKAT_F = cfg.camera.lookat_f;
            if (cfg.camera.lookat_r !== undefined) CAM_LOOKAT_R = cfg.camera.lookat_r;
            if (cfg.camera.lookat_u !== undefined) CAM_LOOKAT_U = cfg.camera.lookat_u;
            if (cfg.camera.sensitivity !== undefined) CAM_SENSITIVITY = cfg.camera.sensitivity;
            if (cfg.camera.pitch_min !== undefined) CAM_PITCH_MIN = cfg.camera.pitch_min;
            if (cfg.camera.pitch_max !== undefined) CAM_PITCH_MAX = cfg.camera.pitch_max;
            if (cfg.camera.yaw_range !== undefined) CAM_YAW_RANGE = cfg.camera.yaw_range;
        }
        if (cfg.spin_camera) {
            if (cfg.spin_camera.offset_f !== undefined) CAM_SPIN_OFFSET_F = cfg.spin_camera.offset_f;
            if (cfg.spin_camera.offset_r !== undefined) CAM_SPIN_OFFSET_R = cfg.spin_camera.offset_r;
            if (cfg.spin_camera.offset_u !== undefined) CAM_SPIN_OFFSET_U = cfg.spin_camera.offset_u;
            if (cfg.spin_camera.pitch !== undefined) CAM_SPIN_PITCH = cfg.spin_camera.pitch;
            if (cfg.spin_camera.yaw_offset !== undefined) CAM_SPIN_YAW_OFF = cfg.spin_camera.yaw_offset;
            if (cfg.spin_camera.fov !== undefined) CAM_SPIN_FOV = cfg.spin_camera.fov;
        }
        if (cfg.seats && Array.isArray(cfg.seats)) SEAT_POSITIONS = cfg.seats;
        if (cfg.chip_models) {
            for (const k in cfg.chip_models) {
                CHIP_AMOUNT_TO_HASH[k] = cfg.chip_models[k];
            }
        }
        if (cfg.ball_offset) {
            if (cfg.ball_offset.x !== undefined) BALL_OFFSET_X = cfg.ball_offset.x;
            if (cfg.ball_offset.y !== undefined) BALL_OFFSET_Y = cfg.ball_offset.y;
            if (cfg.ball_offset.z !== undefined) BALL_OFFSET_Z = cfg.ball_offset.z;
        }
        mp.console.logInfo('[RULETĂ] Config loaded from server');
    } catch(e) { mp.console.logInfo('[RULETĂ] Failed to parse config: ' + e); }
});

// ──────────────────────────────────────────
// CHIP HEIGHT ADJUSTMENT (Page Up / Page Down)
// ──────────────────────────────────────────
mp.keys.bind(0x21, true, () => { // Page Up
    if (global.chatInputActive) return;
    if (!isAtRouletteTable) return;
    CHIP_HEIGHT_OFFSET += 0.005;
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[CHIP] Height offset: ${CHIP_HEIGHT_OFFSET.toFixed(3)}`})); } catch(e) {}
    mp.events.callRemote('Roulette:SaveConfig', JSON.stringify({ CHIP_HEIGHT_OFFSET }));
});
mp.keys.bind(0x22, true, () => { // Page Down
    if (global.chatInputActive) return;
    if (!isAtRouletteTable) return;
    CHIP_HEIGHT_OFFSET -= 0.005;
    try { mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[CHIP] Height offset: ${CHIP_HEIGHT_OFFSET.toFixed(3)}`})); } catch(e) {}
    mp.events.callRemote('Roulette:SaveConfig', JSON.stringify({ CHIP_HEIGHT_OFFSET }));
});

function closeRouletteUI() {
    if (previewChipObject) { try { previewChipObject.destroy(); } catch(e) {} previewChipObject = null; previewChipAmount = 0; }
    if (rouletteBrowser) { rouletteBrowser.destroy(); rouletteBrowser = null; }
    isAtRouletteTable = false;
    currentTableIndex = -1;
    rouletteSpinning = false;
    rouletteBetting = false;
    rouletteSpinData = null;
    pendingResult = null;
    myBets = [];
    myTotalBet = 0;
    updateGlobalTableData();
    gridEditorActive = false;
    if (spinCam) { spinCam.setActive(false); spinCam.destroy(); spinCam = null; }
    destroyRouletteCamera();
    mp.players.local.clearTasks();
    mp.game.entity.freezePosition(mp.players.local.handle, false);
    // Restore player visibility (scriptcam hides local ped)
    mp.game.entity.setVisible(mp.players.local.handle, true, false);
    destroyNativeRoulette();
    clearChipObjects();
    clearOtherChipObjects();
}

mp.events.add('closeRouletteUI', closeRouletteUI);

// ──────────────────────────────────────────
// SERVER → CLIENT EVENTS
// ──────────────────────────────────────────

mp.events.add('rouletteBettingStart', (betTime) => {
    rouletteSpinning = false;
    rouletteBetting = true;
    myBets = [];
    myTotalBet = 0;
    clearChipObjects();
    clearOtherChipObjects();
    if (rouletteBrowser) {
        rouletteBrowser.execute(`if(typeof onBettingStart==='function')onBettingStart(${betTime});`);
        rouletteBrowser.execute(`if(typeof setSelectedChip==='function')setSelectedChip(${selectedChipAmount},${selectedChipIndex},'none');`);
    }
});

mp.events.add('rouletteBetTimer', (timeLeft) => {
    if (rouletteBrowser) rouletteBrowser.execute(`if(typeof updateBetTimer==='function')updateBetTimer(${timeLeft});`);
});

mp.events.add('rouletteSpinStart', (number, color, spinTime) => {
    if (rouletteBrowser) rouletteBrowser.execute(`if(typeof onSpinStart==='function')onSpinStart(${number},'${color}',${spinTime});`);
    rouletteSpinning = true;
    rouletteBetting = false;
    // Destroy preview chip so it doesn't linger on table during spin
    if (previewChipObject) { try { previewChipObject.destroy(); } catch(e) {} previewChipObject = null; previewChipAmount = 0; }
    // CEF status is updated by onSpinStart in HTML
    playAllAnimations(number);
    // Dealer spin_wheel animation
    if (dealerNPC) {
        loadAnimDict(DEALER_ANIM_ROULETTE).then(() => {
            if (dealerNPC) {
                dealerNPC.taskPlayAnim(DEALER_ANIM_ROULETTE, 'spin_wheel', 8.0, 1, -1, 2, 0.0, false, false, false);
                // Return to idle after spin animation
                setTimeout(() => {
                    if (dealerNPC) dealerNPC.taskPlayAnim(DEALER_ANIM_ROULETTE, 'idle', 8.0, 1, -1, 1, 0.0, false, false, false);
                }, 8000);
            }
        });
    }
    // Pan camera to the right to show the wheel during spin (skip if in freecam)
    if (!global.freecamActive) {
        panCameraToWheel();
    }
});

mp.events.add('rouletteShowResult', (number, color, state) => {
    // Buffer result — will be shown when animation finishes (in render loop)
    pendingResult = { number, color, state };
});

// Receive updated bets from server — track locally for HUD
mp.events.add('rouletteUpdateBets', (betsJson, chips, totalBet) => {
    try {
        myBets = JSON.parse(betsJson);
    } catch(e) { myBets = []; }
    myChips = chips;
    myTotalBet = totalBet;
    if (rouletteBrowser) rouletteBrowser.execute(`if(typeof updateMyBets==='function')updateMyBets('${betsJson.replace(/'/g, "\\'")}',${chips},${totalBet});`);
});

// Receive other players' chip placements
mp.events.add('rouletteOtherPlayerChip', (chipX, chipY, chipZ, amount) => {
    if (!isAtRouletteTable || !nativeTablePos) return;
    spawnOtherChipOnTable(chipX, chipY, chipZ, amount);
});

// Receive game state with history
mp.events.add('rouletteUpdateState', (state) => {
    if (state && state.history) rouletteHistory = state.history;
    if (state && state.players) {
        const me = state.players.find(p => p.name === mp.players.local.name);
        if (me) { myChips = me.chips; }
    }
    if (rouletteBrowser) {
        let j = JSON.stringify(state);
        rouletteBrowser.execute(`if(typeof updateGameState==='function')updateGameState('${j.replace(/'/g, "\\'")}');`);
    }
});

// Legacy CEF triggers
mp.events.add('Roulette_PlaceBet', (betType, betValue, amount) => {
    mp.events.callRemote('Server_ReceiveRouletteBet', betType, String(betValue), amount);
});
mp.events.add('Roulette_ClearBets', () => { mp.events.callRemote('Server_ClearRouletteBets'); });
mp.events.add('Roulette_LeaveTable', () => { closeRouletteUI(); mp.events.callRemote('Server_LeaveRouletteTable'); });
