// client_packages/blackjack/index.js — Client-side blackjack logic

let bjBrowser = null;

const KEY_E   = 0x45;
const KEY_ESC = 0x1B;
const KEY_F3  = 0x72;

// Notă: KEY_E și KEY_ESC sunt deja bound de poker — 
// interacțiunea se face prin Server_PlayerAction care decide dacă e poker sau blackjack

mp.events.add('openBlackjackUI', () => {
    if (bjBrowser === null) {
        bjBrowser = mp.browsers.new('package://blackjack/index.html');
        mp.gui.cursor.show(true, true);
    }
});

function closeBlackjackUI() {
    if (bjBrowser !== null) {
        bjBrowser.destroy();
        bjBrowser = null;
        mp.gui.cursor.show(false, false);
    }
}

mp.events.add('closeBlackjackUI', closeBlackjackUI);

// ── Betting phase ──
mp.events.add('bjBettingPhase', (minBet, maxBet) => {
    if (bjBrowser !== null) {
        bjBrowser.execute(`showBettingOverlay(${minBet}, ${maxBet});`);
    }
});

mp.events.add('bjBetTimer', (secondsLeft) => {
    if (bjBrowser !== null) {
        bjBrowser.execute(`updateBetTimer(${secondsLeft});`);
    }
});

// ── Deal cards ──
mp.events.add('bjDealCards', (r1, s1, r2, s2) => {
    if (bjBrowser !== null) {
        bjBrowser.execute(`hideBettingOverlay(); updateMyCards('${r1}', '${s1}', '${r2}', '${s2}');`);
    }
});

mp.events.add('bjDealerCard', (rank, suit, hasHidden) => {
    if (bjBrowser !== null) {
        bjBrowser.execute(`updateDealerCard('${rank}', '${suit}', ${hasHidden});`);
    }
});

// ── Game state ──
mp.events.add('bjUpdateState', (state) => {
    if (bjBrowser !== null) {
        let stateJson = JSON.stringify(state);
        bjBrowser.execute(`updateGameState('${stateJson}');`);
    }
});

// ── Turn ──
mp.events.add('bjYourTurn', (handValue, canDoubleDown, canSplit) => {
    if (bjBrowser !== null) {
        bjBrowser.execute(`onYourTurn(${handValue}, ${canDoubleDown}, ${canSplit});`);
    }
});

mp.events.add('bjTurnTimer', (playerName, timeLeft) => {
    if (bjBrowser !== null) {
        bjBrowser.execute(`updateTurnTimer('${playerName}', ${timeLeft});`);
    }
});

// ── Hit card (doar pentru jucătorul local) ──
mp.events.add('bjHitCard', (playerName, rank, suit, handValue) => {
    if (bjBrowser !== null) {
        bjBrowser.execute(`addHitCard('${rank}', '${suit}', ${handValue});`);
    }
});

// ── Dealer ──
mp.events.add('bjDealerReveal', (cards, value) => {
    if (bjBrowser !== null) {
        const cardsJson = JSON.stringify(cards);
        bjBrowser.execute(`revealDealerCards(${cardsJson}, ${value});`);
    }
});

mp.events.add('bjDealerHit', (rank, suit, value) => {
    if (bjBrowser !== null) {
        bjBrowser.execute(`addDealerHitCard('${rank}', '${suit}', ${value});`);
    }
});

// ── Results ──
mp.events.add('bjShowResults', (resultsJson, dealerValue, dealerBust) => {
    if (bjBrowser !== null) {
        bjBrowser.execute(`showResults('${resultsJson}', ${dealerValue}, ${dealerBust});`);
    }
});

// ── Player actions → Server ──
mp.events.add('Blackjack_PlayerAction', (actionName) => {
    mp.events.callRemote('Server_ReceiveBlackjackAction', actionName);
});

mp.events.add('Blackjack_PlaceBet', (amount) => {
    mp.events.callRemote('Server_BlackjackPlaceBet', amount);
});

// ── Leave table (ESC or Exit button) ──
mp.events.add('Blackjack_LeaveTable', () => {
    mp.events.callRemote('Server_LeaveBlackjackTable');
});

mp.keys.bind(KEY_ESC, false, () => {
    if (bjBrowser !== null) {
        mp.events.callRemote('Server_LeaveBlackjackTable');
    }
});
