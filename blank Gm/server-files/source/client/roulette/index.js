// client_packages/roulette/index.js — Client-side roulette logic

let rouletteBrowser = null;

const KEY_E   = 0x45;
const KEY_ESC = 0x1B;

mp.keys.bind(KEY_E, true, () => {
    mp.events.callRemote('Server_PlayerAction', 'interact');
});

mp.keys.bind(KEY_ESC, true, () => {
    if (rouletteBrowser !== null) {
        closeRouletteUI();
        mp.events.callRemote('Server_LeaveRouletteTable');
    }
});

mp.events.add('openRouletteUI', () => {
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
