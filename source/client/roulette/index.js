// client_packages/roulette/index.js — Client-side roulette logic

let rouletteBrowser = null;

const KEY_E   = 0x45;
const KEY_ESC = 0x1B;

// ──────────────────────────────────────────
// CAMERA TRANSITION SYSTEM
// ──────────────────────────────────────────
let rouletteCamFrom = null;
let rouletteCamTo   = null;
let rouletteCamExit = null;

const CAM_HEIGHT         = 2.5;   // unități deasupra mesei
const CAM_TRANSITION_IN  = 2000;  // ms — tranziție spre masă
const CAM_TRANSITION_OUT = 1500;  // ms — tranziție înapoi la player
const CAM_FOV_TABLE      = 60;    // field of view pe masă

// Saved from CEF sliders
let currentCamHeight = CAM_HEIGHT;
let currentCamFov    = CAM_FOV_TABLE;
let currentCamRot    = 0;
let currentCamOx     = -0.1;
let currentCamOy     = 0;
let currentTablePos  = null; // { x, y, z, heading }

function startRouletteCamera(tableX, tableY, tableZ, tableHeading) {
    destroyRouletteCameras();

    currentTablePos = { x: tableX, y: tableY, z: tableZ, heading: tableHeading };

    const player = mp.players.local;
    const pPos   = player.position;
    const pHead  = player.getHeading();

    // Freeze player — nu se mișcă cât e la masă
    player.freezePosition(true);

    // Camera "from" — poziția ochilor playerului
    rouletteCamFrom = mp.cameras.new('default',
        new mp.Vector3(pPos.x, pPos.y, pPos.z + 0.5),
        new mp.Vector3(0, 0, pHead),
        50
    );

    // Camera "to" — top-down deasupra mesei (with offsets)
    const headRad = (tableHeading + currentCamRot) * Math.PI / 180;
    const camX = tableX + currentCamOx * Math.cos(headRad) - currentCamOy * Math.sin(headRad);
    const camY = tableY + currentCamOx * Math.sin(headRad) + currentCamOy * Math.cos(headRad);

    rouletteCamTo = mp.cameras.new('default',
        new mp.Vector3(camX, camY, tableZ + currentCamHeight),
        new mp.Vector3(-90.0, 0.0, tableHeading + currentCamRot),
        currentCamFov
    );

    // Activăm "from" camera și render script cams
    rouletteCamFrom.setActive(true);
    mp.game.cam.renderScriptCams(true, false, 0, true, false);


    // Interpolăm smooth spre top-down
    rouletteCamTo.setActive(true);
    mp.game.cam.setActiveWithInterp(
        rouletteCamTo.handle,
        rouletteCamFrom.handle,
        CAM_TRANSITION_IN,
        1, 1
    );
}

function stopRouletteCamera() {
    const player = mp.players.local;

    if (!rouletteCamTo) {
        mp.game.cam.renderScriptCams(false, false, 0, true, false);
        player.freezePosition(false);
        destroyRouletteCameras();
        return;
    }

    const pPos  = player.position;
    const pHead = player.getHeading();

    // Camera "exit" — înapoi la player
    rouletteCamExit = mp.cameras.new('default',
        new mp.Vector3(pPos.x, pPos.y, pPos.z + 0.5),
        new mp.Vector3(0, 0, pHead),
        50
    );

    // Interpolăm de la top-down înapoi la player
    rouletteCamExit.setActive(true);
    mp.game.invoke('0x9FBDA379383A52A4',
        rouletteCamExit.handle,
        rouletteCamTo.handle,
        CAM_TRANSITION_OUT,
        1, 1
    );

    // După tranziție — cleanup & gameplay cam
    setTimeout(() => {
        mp.game.cam.renderScriptCams(false, false, 0, true, false);
        player.freezePosition(false);
        destroyRouletteCameras();
    }, CAM_TRANSITION_OUT + 200);
}

function destroyRouletteCameras() {
    if (rouletteCamFrom) { rouletteCamFrom.destroy(); rouletteCamFrom = null; }
    if (rouletteCamTo)   { rouletteCamTo.destroy();   rouletteCamTo   = null; }
    if (rouletteCamExit) { rouletteCamExit.destroy();  rouletteCamExit = null; }
}

// ──────────────────────────────────────────
// KEY BINDS
// ──────────────────────────────────────────

/*
mp.keys.bind(KEY_E, true, () => {
    mp.events.callRemote('Server_PlayerAction', 'interact');
});
*/

mp.keys.bind(KEY_ESC, true, () => {
    if (rouletteBrowser !== null) {
        closeRouletteUI();
        mp.events.callRemote('Server_LeaveRouletteTable');
    }
});

// ──────────────────────────────────────────
// OPEN / CLOSE UI + CAMERA
// ──────────────────────────────────────────
mp.events.add('openRouletteUI', (tableX, tableY, tableZ, tableHeading) => {
    // Pornește tranziția de cameră spre masă
    startRouletteCamera(tableX, tableY, tableZ, tableHeading);

    // Deschide CEF-ul
    if (rouletteBrowser === null) {
        rouletteBrowser = mp.browsers.new('package://roulette/index.html');
        mp.gui.cursor.show(true, true);

        // After CEF loads, ask it to send saved camera settings
        setTimeout(() => {
            if (rouletteBrowser) {
                rouletteBrowser.execute('sendCameraUpdate();');
            }
        }, 500);
    }
});

function closeRouletteUI() {
    if (rouletteBrowser !== null) {
        rouletteBrowser.destroy();
        rouletteBrowser = null;
        mp.gui.cursor.show(false, false);
    }
    // Tranziție cameră înapoi la player
    stopRouletteCamera();
}

mp.events.add('closeRouletteUI', closeRouletteUI);

mp.events.add('rouletteUpdateState', (state) => {
    if (rouletteBrowser !== null) {
        let stateJson = JSON.stringify(state);
        rouletteBrowser.execute(`updateGameState('${stateJson.replace(/'/g, "\\'")}');`);
    }
});

mp.events.add('rouletteBettingStart', (betTime) => {
    if (rouletteBrowser !== null) {
        rouletteBrowser.execute(`onBettingStart(${betTime});`);
    }
});

mp.events.add('rouletteBetTimer', (timeLeft) => {
    if (rouletteBrowser !== null) {
        rouletteBrowser.execute(`updateBetTimer(${timeLeft});`);
    }
});

mp.events.add('rouletteSpinStart', (number, color, spinTime) => {
    if (rouletteBrowser !== null) {
        rouletteBrowser.execute(`onSpinStart(${number}, '${color}', ${spinTime});`);
    }
});

mp.events.add('rouletteShowResult', (number, color, state) => {
    if (rouletteBrowser !== null) {
        let stateJson = JSON.stringify(state);
        rouletteBrowser.execute(`onShowResult(${number}, '${color}', '${stateJson.replace(/'/g, "\\'")}');`);
    }
});

mp.events.add('rouletteUpdateBets', (betsJson, chips, totalBet) => {
    if (rouletteBrowser !== null) {
        rouletteBrowser.execute(`updateMyBets('${betsJson.replace(/'/g, "\\'")}', ${chips}, ${totalBet});`);
    }
});

// Events from CEF → server
mp.events.add('Roulette_PlaceBet', (betType, betValue, amount) => {
    mp.events.callRemote('Server_ReceiveRouletteBet', betType, String(betValue), amount);
});

mp.events.add('Roulette_ClearBets', () => {
    mp.events.callRemote('Server_ClearRouletteBets');
});

mp.events.add('Roulette_LeaveTable', () => {
    closeRouletteUI();
    mp.events.callRemote('Server_LeaveRouletteTable');
});

// ──────────────────────────────────────────
// LIVE CAMERA ADJUSTMENTS FROM CEF SLIDERS
// ──────────────────────────────────────────
mp.events.add('Roulette_UpdateCamera', (height, fov, rot, ox, oy) => {
    currentCamHeight = height;
    currentCamFov    = fov;
    currentCamRot    = rot;
    currentCamOx     = ox;
    currentCamOy     = oy;

    // Live update: reposition camera if we're at a table
    if (rouletteCamTo && currentTablePos) {
        const tp = currentTablePos;
        const headRad = (tp.heading + currentCamRot) * Math.PI / 180;
        const camX = tp.x + currentCamOx * Math.cos(headRad) - currentCamOy * Math.sin(headRad);
        const camY = tp.y + currentCamOx * Math.sin(headRad) + currentCamOy * Math.cos(headRad);

        rouletteCamTo.setCoord(camX, camY, tp.z + currentCamHeight);
        rouletteCamTo.setRot(-90.0, 0.0, tp.heading + currentCamRot, 2);
        rouletteCamTo.setFov(currentCamFov);
    }
});

// Forward save settings from CEF to server
mp.events.add('Roulette_SaveSettingsToFile', (settingsJson) => {
    mp.events.callRemote('Server_SaveRouletteSettings', settingsJson);
});

let pos = mp.players.local.position;
const table = mp.objects.new(mp.game.joaat('vw_prop_casino_roulette_01'), pos);
const ball = mp.objects.new(mp.game.joaat('vw_prop_roulette_ball'), new mp.Vector3(pos.x-0.734742, pos.y-0.16617, pos.z+1.0715));


ball.attachTo(table.handle, 0, 0, 0, 0, 0, 0, 0, true, true, false, false, 0, false);


let lib = 'anim_casino_b@amb@casino@games@roulette@table';

const routtle = () => {
    ball.position = new mp.Vector3(pos.x-0.734742, pos.y-0.16617, pos.z+1.0715);
    ball.rotation = new mp.Vector3(0, 0, 32.6);

    ball.playAnim('intro_ball', lib, 1000.0, false, true, true, 0, 136704);
    ball.playAnim('loop_ball', lib, 1000.0, false, true, false, 0, 136704);
 
    table.playAnim('intro_wheel', lib, 1000.0, false, true, true, 0, 136704);
    table.playAnim('loop_wheel', lib, 1000.0, false, true, false, 0, 136704);
    
    ball.playAnim('exit_7_ball', lib, 1000.0, false, true, false, 0, 136704);
    table.playAnim('exit_7_wheel', lib, 1000.0, false, true, false, 0, 136704);
};

mp.keys.bind(0x71, true, routtle);