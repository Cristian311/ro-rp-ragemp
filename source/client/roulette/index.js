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

function startRouletteCamera(tableX, tableY, tableZ, tableHeading) {
    destroyRouletteCameras();

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

    // Camera "to" — top-down deasupra mesei
    rouletteCamTo = mp.cameras.new('default',
        new mp.Vector3(tableX, tableY, tableZ + CAM_HEIGHT),
        new mp.Vector3(-90.0, 0.0, tableHeading),
        CAM_FOV_TABLE
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
