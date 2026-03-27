// client_packages/slots/index.js — Client-side Shining Crown logic

let slotsBrowser = null;
let slotsTablePos = null;  // { x, y, z, heading }
let slotsCam = null;

// Hardcoded camera offset (relative to machine center)
const SLOTS_CAM = {
    f: -0.7478,
    r: 0.0157,
    u: 0.4543,
    rotX: -32.15,
    rotHeading: 358.55,
    fov: 60
};

// Hardcoded seat position (relative offset from machine center)
const SLOTS_SEAT = {
    f: -0.6979,
    r: -0.0725,
    u: -0.3562,
    heading: 361.07,
    animDict: 'amb@code_human_in_bus_passenger_idles@female@sit@base',
    animName: 'base',
    animFlags: 2
};

function loadAnimDict(dict) {
    return new Promise((resolve) => {
        if (mp.game.streaming.hasAnimDictLoaded(dict)) { resolve(); return; }
        mp.game.streaming.requestAnimDict(dict);
        let elapsed = 0;
        const check = setInterval(() => {
            if (mp.game.streaming.hasAnimDictLoaded(dict)) { clearInterval(check); resolve(); return; }
            elapsed += 50;
            if (elapsed > 10000) { clearInterval(check); resolve(); }
        }, 50);
    });
}

function positionPlayerAtSlots() {
    if (!slotsTablePos) return;
    const hRad = slotsTablePos.heading * Math.PI / 180;
    const px = slotsTablePos.x + SLOTS_SEAT.f * (-Math.sin(hRad)) + SLOTS_SEAT.r * Math.cos(hRad);
    const py = slotsTablePos.y + SLOTS_SEAT.f * Math.cos(hRad) + SLOTS_SEAT.r * Math.sin(hRad);
    const pz = slotsTablePos.z + SLOTS_SEAT.u;
    const playerHeading = (slotsTablePos.heading + SLOTS_SEAT.heading) % 360;

    mp.players.local.position = new mp.Vector3(px, py, pz);
    mp.players.local.setHeading(playerHeading);
    mp.game.entity.freezePosition(mp.players.local.handle, true);

    loadAnimDict(SLOTS_SEAT.animDict).then(() => {
        mp.players.local.taskPlayAnim(SLOTS_SEAT.animDict, SLOTS_SEAT.animName, 8.0, -8.0, -1, SLOTS_SEAT.animFlags, 0, false, false, false);
    });

    createSlotsCamera();
}

function createSlotsCamera() {
    if (!slotsTablePos) return;
    destroySlotsCamera();

    const hRad = slotsTablePos.heading * Math.PI / 180;
    const cx = slotsTablePos.x + SLOTS_CAM.f * (-Math.sin(hRad)) + SLOTS_CAM.r * Math.cos(hRad);
    const cy = slotsTablePos.y + SLOTS_CAM.f * Math.cos(hRad) + SLOTS_CAM.r * Math.sin(hRad);
    const cz = slotsTablePos.z + SLOTS_CAM.u;
    const camHeading = (slotsTablePos.heading + SLOTS_CAM.rotHeading) % 360;

    slotsCam = mp.cameras.new('default', new mp.Vector3(cx, cy, cz),
        new mp.Vector3(SLOTS_CAM.rotX, 0, camHeading), SLOTS_CAM.fov);
    slotsCam.setActive(true);
    mp.game.cam.renderScriptCams(true, true, 800, true, false);
}

function destroySlotsCamera() {
    if (slotsCam) {
        slotsCam.setActive(false);
        mp.game.cam.renderScriptCams(false, true, 800, true, false);
        slotsCam.destroy();
        slotsCam = null;
    }
}

function unpositionPlayer() {
    destroySlotsCamera();
    mp.game.entity.freezePosition(mp.players.local.handle, false);
    try {
        mp.players.local.stopAnimTask(SLOTS_SEAT.animDict, SLOTS_SEAT.animName, 1.0);
    } catch(e) {}
}

const KEY_E     = 0x45;
const KEY_ESC   = 0x1B;
const KEY_SPACE = 0x20;

let slotsSpaceHeld = false;

/*
mp.keys.bind(KEY_E, true, () => {
    mp.events.callRemote('Server_PlayerAction', 'interact');
});
*/
mp.keys.bind(KEY_ESC, true, () => {
    if (global.chatInputActive) return;
    if (slotsBrowser !== null) {
        closeSlotsUI();
        mp.events.callRemote('Server_LeaveSlotsMachine');
    }
});

// SPACE keydown → forward to CEF
mp.keys.bind(KEY_SPACE, true, () => {
    if (global.chatInputActive) return;
    if (slotsBrowser !== null) {
        if (!slotsSpaceHeld) {
            slotsSpaceHeld = true;
            slotsBrowser.execute('onSpaceDown();');
        }
    }
});

// SPACE keyup → forward to CEF
mp.keys.bind(KEY_SPACE, false, () => {
    if (slotsBrowser !== null) {
        slotsSpaceHeld = false;
        slotsBrowser.execute('onSpaceUp();');
    }
});

mp.events.add('openSlotsUI', () => {
    if (slotsBrowser === null) {
        positionPlayerAtSlots();
        slotsBrowser = mp.browsers.new('package://casino/slots/index.html');
        mp.gui.cursor.show(true, true);
    }
});

function closeSlotsUI() {
    if (slotsBrowser !== null) {
        slotsBrowser.destroy();
        slotsBrowser = null;
        mp.gui.cursor.show(false, false);
        unpositionPlayer();
    }
}

mp.events.add('closeSlotsUI', closeSlotsUI);

mp.events.add('slotsUpdateState', (stateJson) => {
    if (slotsBrowser !== null) {
        slotsBrowser.execute(`updateState('${stateJson.replace(/'/g, "\\'")}');`);
    }
});

mp.events.add('slotsSpinResult', (spinDataJson, chips) => {
    if (slotsBrowser !== null) {
        slotsBrowser.execute(`onSpinResult('${spinDataJson.replace(/'/g, "\\'")}', ${chips});`);
    }
});

mp.events.add('slotsGambleStart', (amount) => {
    if (slotsBrowser !== null) {
        slotsBrowser.execute(`onGambleStart(${amount});`);
    }
});

mp.events.add('slotsGambleResult', (resultJson) => {
    if (slotsBrowser !== null) {
        slotsBrowser.execute(`onGambleResult('${resultJson.replace(/'/g, "\\'")}');`);
    }
});

// Events from CEF → server
mp.events.add('Slots_Spin', () => {
    mp.events.callRemote('Server_SlotsSpin');
});

mp.events.add('Slots_SetBet', (amount) => {
    mp.events.callRemote('Server_SlotsSetBet', amount);
});

mp.events.add('Slots_Gamble', () => {
    mp.events.callRemote('Server_SlotsGamble');
});

mp.events.add('Slots_GambleChoice', (choice) => {
    mp.events.callRemote('Server_SlotsGambleChoice', choice);
});

mp.events.add('Slots_CollectGamble', () => {
    mp.events.callRemote('Server_SlotsCollectGamble');
});

mp.events.add('Slots_ToggleTurbo', () => {
    mp.events.callRemote('Server_SlotsToggleTurbo');
});

mp.events.add('Slots_SkipAnimation', () => {
    mp.events.callRemote('Server_SlotsSkipAnimation');
});

mp.events.add('slotsSkipAnimation', () => {
    if (slotsBrowser !== null) {
        slotsBrowser.execute('skipAnimation();');
    }
});

mp.events.add('Slots_LeaveTable', () => {
    closeSlotsUI();
    mp.events.callRemote('Server_LeaveSlotsMachine');
});

// Store slot machine position for animation offset calculation
mp.events.add('slotsSetTableData', (x, y, z, heading) => {
    if (!global.tableData) global.tableData = {};
    global.tableData.slots = { x, y, z, heading };
    slotsTablePos = { x, y, z, heading };
});

mp.events.add('slotsClearTableData', () => {
    if (global.tableData) global.tableData.slots = null;
    slotsTablePos = null;
});
