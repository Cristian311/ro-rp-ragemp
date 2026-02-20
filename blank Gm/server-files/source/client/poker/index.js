let pokerBrowser = null;

const KEY_E = 69;
const KEY_ESC = 27;

mp.keys.bind(KEY_E, true, () => {
    mp.events.callRemote('Server_PlayerAction', 'interact');
});

mp.keys.bind(KEY_ESC, true, () => {
    if (pokerBrowser !== null) {
        closePokerUI();
    }
});

mp.events.add('openPokerUI', () => {
    if (pokerBrowser === null) {
        pokerBrowser = mp.browsers.new("package://poker/index.html");
        mp.gui.cursor.show(true, true);
        mp.gui.chat.push("Ai deschis masa de Poker.");
    }
});

function closePokerUI() {
if (pokerBrowser !== null) {
        pokerBrowser.destroy();
        pokerBrowser = null;
        mp.gui.cursor.show(false, false);
        mp.gui.chat.push("Ai închis masa de Poker.");
    }
}

mp.events.add('closePokerUI', closePokerUI);


mp.events.add('Poker_PlayerAction', (actionName) => {
    
    mp.gui.chat.push(`[Client] Ai apăsat butonul: ${actionName}`);
    
    mp.events.callRemote('Server_ReceivePokerAction', actionName);
});

mp.events.add('Client_UpdateMyCards', (rank1, suit1, rank2, suit2) => {
    if (pokerBrowser !== null) {
        // Executăm funcția ta din HTML
        pokerBrowser.execute(`updateMyCards('${rank1}', '${suit1}', '${rank2}', '${suit2}');`);
    }
});