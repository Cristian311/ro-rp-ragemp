// client_packages/poker/index.js — Client-side poker logic

let pokerBrowser = null;

const KEY_E   = 69;
const KEY_ESC = 27;
const KEY_CURSOR = 0xC0; // ~
// ──────────────────────────────────────────
// Key bindings
// ──────────────────────────────────────────
mp.keys.bind(KEY_E, true, () => {
    mp.events.callRemote('Server_PlayerAction', 'interact');
});

mp.keys.bind(KEY_ESC, true, () => {
    if (pokerBrowser !== null) {
        closePokerUI();
    }
});

mp.keys.bind(KEY_CURSOR, true, () => {
    const cursorState = mp.gui.cursor.visible;
    mp.gui.cursor.show(!cursorState, !cursorState);
});

// ──────────────────────────────────────────
// UI management
// ──────────────────────────────────────────
mp.events.add('openPokerUI', () => {
    if (pokerBrowser === null) {
        pokerBrowser = mp.browsers.new('package://poker/index.html');
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

// ──────────────────────────────────────────
// Receive cards from server — r1, s1, r2, s2
// (server sends: pokerDealCards, rank1, suit1, rank2, suit2)
// ──────────────────────────────────────────
mp.events.add('pokerDealCards', (rank1, suit1, rank2, suit2) => {
    mp.gui.chat.push(`[POKER] Cărțile tale: ${rank1}${suit1} ${rank2}${suit2}`);
    if (pokerBrowser !== null) {
        pokerBrowser.execute(`updateMyCards('${rank1}', '${suit1}', '${rank2}', '${suit2}');`);
    }
});

// ──────────────────────────────────────────
// Game state update from server
// ──────────────────────────────────────────
mp.events.add('pokerUpdateState', (stateJson) => {
    if (pokerBrowser !== null) {
        // stateJson already serialized by RAGE; pass it straight to the HTML
        pokerBrowser.execute(`updateGameState(${JSON.stringify(stateJson)});`);
    }
});

// ──────────────────────────────────────────
// Your turn notification
// ──────────────────────────────────────────
mp.events.add('pokerYourTurn', (currentBet, myBet, myChips) => {
    if (pokerBrowser !== null) {
        pokerBrowser.execute(`onYourTurn(${currentBet}, ${myBet}, ${myChips});`);
    }
});

// ──────────────────────────────────────────
// Turn timer countdown
// ──────────────────────────────────────────
mp.events.add('pokerTurnTimer', (playerName, timeLeft) => {
    if (pokerBrowser !== null) {
        pokerBrowser.execute(`updateTurnTimer('${playerName}', ${timeLeft});`);
    }
});

// ──────────────────────────────────────────
// Lobby countdown (before game starts)
// ──────────────────────────────────────────
mp.events.add('pokerLobbyCountdown', (secondsLeft) => {
    if (pokerBrowser !== null) {
        pokerBrowser.execute(`updateLobbyCountdown(${secondsLeft});`);
    }
});

// ──────────────────────────────────────────
// Action buttons from HTML UI → server
// ──────────────────────────────────────────
mp.events.add('Poker_PlayerAction', (actionName, raiseAmount) => {
    mp.gui.chat.push(`[Client] Ai apăsat: ${actionName}`);
    mp.events.callRemote('Server_ReceivePokerAction', actionName, raiseAmount || 0);
});