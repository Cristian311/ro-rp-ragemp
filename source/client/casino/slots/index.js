// client_packages/slots/index.js — Client-side Shining Crown logic

let slotsBrowser = null;

const KEY_E   = 0x45;
const KEY_ESC = 0x1B;
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

mp.events.add('openSlotsUI', () => {
    if (slotsBrowser === null) {
        slotsBrowser = mp.browsers.new('package://casino/slots/index.html');
        mp.gui.cursor.show(true, true);
    }
});

function closeSlotsUI() {
    if (slotsBrowser !== null) {
        slotsBrowser.destroy();
        slotsBrowser = null;
        mp.gui.cursor.show(false, false);
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
