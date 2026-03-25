// client_packages/poker/index.js — Client-side poker logic

let pokerBrowser = null;

const KEY_E   = 0x45;
const KEY_ESC = 0x1B;
const KEY_F3 = 0x72; 

mp.keys.bind(KEY_E, true, () => {
    if (global.chatInputActive) return;
    mp.events.callRemote('Server_PlayerAction', 'interact');
});

mp.keys.bind(KEY_ESC, true, () => {
    if (global.chatInputActive) return;
    if (pokerBrowser !== null) {
        closePokerUI();
        mp.events.callRemote('Server_LeavePokerTable');
    }
});

mp.keys.bind(KEY_F3, true, () => {
    if (global.chatInputActive) return;
    const cursorState = mp.gui.cursor.visible;
    mp.gui.cursor.show(!cursorState, !cursorState);
});

mp.events.add('openPokerUI', () => {
    if (pokerBrowser === null) {
        pokerBrowser = mp.browsers.new('package://casino/poker/index.html');
        mp.gui.cursor.show(true, true);
    }
});

function closePokerUI() {
    if (pokerBrowser !== null) {
        pokerBrowser.destroy();
        pokerBrowser = null;
        mp.gui.cursor.show(false, false);
    }
}

mp.events.add('closePokerUI', closePokerUI);

mp.events.add('pokerDealCards', (r1, s1, r2, s2) => {
    if (pokerBrowser !== null) {
        pokerBrowser.execute(`updateMyCards('${r1}', '${s1}', '${r2}', '${s2}');`);
    }
});

mp.events.add('pokerUpdateState', (state) => {
    if (pokerBrowser !== null) {
        let stateJson = JSON.stringify(state);
        pokerBrowser.execute(`updateGameState('${stateJson}');`);
    }
});

mp.events.add('pokerYourTurn', (currentBet, myBet, myChips) => {
    if (pokerBrowser !== null) {
        pokerBrowser.execute(`onYourTurn(${currentBet}, ${myBet}, ${myChips});`);
    }
});

mp.events.add('pokerTurnTimer', (playerName, timeLeft) => {
    if (pokerBrowser !== null) {
        pokerBrowser.execute(`updateTurnTimer('${playerName}', ${timeLeft});`);
    }
});

mp.events.add('pokerLobbyCountdown', (secondsLeft) => {
    if (pokerBrowser !== null) {
        pokerBrowser.execute(`updateLobbyCountdown(${secondsLeft});`);
    }
});

mp.events.add('pokerShowWinner', (winnerNames, pot, handName) => {
    if (pokerBrowser !== null) {
        const namesJson = JSON.stringify(winnerNames);
        pokerBrowser.execute(`showWinnerBanner(${namesJson}, ${pot}, '${handName}')`);
    }
});

mp.events.add('Poker_PlayerAction', (actionName, raiseAmount) => {
    mp.events.callRemote('Server_ReceivePokerAction', actionName, raiseAmount || 0);
});

mp.events.add('Poker_LeaveTable', () => {
    closePokerUI();
    mp.events.callRemote('Server_LeavePokerTable');
});