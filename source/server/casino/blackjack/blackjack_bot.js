// blackjack_bot.js — Simulare jucători fake pentru testare blackjack
// Comenzi disponibile:
//   /bjaddbot [numar]      — adaugă 1 sau mai mulți boți la masa ta de blackjack
//   /bjremovebot [numar]   — elimină ultimul bot
//   /bjbotstatus           — afișează toți boții la masa ta
//   /bjautobots            — boții joacă automat
//   /bjsimbots [mese] [boti] — simulare masivă
//   /bjstopsim             — oprește simularea

const fs   = require('fs');
const path = require('path');
const { LOBBY_CONFIG, joinLobby, leaveLobby, processAction, placeBet, lobbies, calculateHandValue, parseCard, CARD_VALUES } = require('./blackjack_server.js');

const TABLES_SAVE_PATH = path.join(process.cwd(), 'blackjack_tables.json');

// ──────────────────────────────────────────
// Fake player factory
// ──────────────────────────────────────────
let botIdCounter = 1;

function createFakePlayer(name) {
    return {
        name,
        _isBot: true,
        _messages: [],
        outputChatBox(msg) { /* silent */ },
        call(eventName, ...args) { /* silent */ },
    };
}

const botOwner  = new Map();
const ownerBots = new Map();
const autoMode  = new Set();

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────
function getLobbyByPlayer(player) {
    for (const key in lobbies) {
        const found = lobbies[key].players.find(p => p.player === player && !p._hasLeft);
        if (found) return lobbies[key];
    }
    return null;
}

function getPlayerBots(player) {
    return ownerBots.get(player.name) || [];
}

// ──────────────────────────────────────────
// Bot AI — Basic Strategy
// ──────────────────────────────────────────
function isSoftHand(cards) {
    let value = 0, aces = 0;
    for (const card of cards) {
        const v = CARD_VALUES[parseCard(card).rank] || 0;
        value += v;
        if (parseCard(card).rank === 'A') aces++;
    }
    // Soft = un as contează ca 11 și total <= 21
    while (value > 21 && aces > 0) { value -= 10; aces--; }
    return aces > 0;
}

function getBotDecision(slot, dealerUpCard) {
    const handValue = calculateHandValue(slot.cards);
    const dealerVal = CARD_VALUES[parseCard(dealerUpCard).rank] || 10;
    const soft = isSoftHand(slot.cards);
    const canDD = slot.cards.length === 2 && slot.chips >= slot.bet;

    // ── Soft hand strategy ──
    if (soft) {
        if (handValue >= 20) return 'stand';                                    // Soft 20-21
        if (handValue === 19) {
            if (dealerVal === 6 && canDD) return 'doubledown';                  // Soft 19 vs 6 → DD
            return 'stand';                                                     // Soft 19 → stand
        }
        if (handValue === 18) {
            if (dealerVal >= 3 && dealerVal <= 6 && canDD) return 'doubledown'; // Soft 18 vs 3-6 → DD
            if (dealerVal >= 9 || dealerVal === 1) return 'hit';                // Soft 18 vs 9,10,A → hit
            return 'stand';                                                     // Soft 18 vs 2,7,8 → stand
        }
        if (handValue === 17) {
            if (dealerVal >= 3 && dealerVal <= 6 && canDD) return 'doubledown'; // Soft 17 vs 3-6 → DD
            return 'hit';                                                       // Soft 17 → hit
        }
        if (handValue >= 15 && handValue <= 16) {
            if (dealerVal >= 4 && dealerVal <= 6 && canDD) return 'doubledown'; // Soft 15-16 vs 4-6 → DD
            return 'hit';                                                       // Soft 15-16 → hit
        }
        // Soft 13-14
        if (dealerVal >= 5 && dealerVal <= 6 && canDD) return 'doubledown';     // Soft 13-14 vs 5-6 → DD
        return 'hit';                                                           // Soft 13-14 → hit
    }

    // ── Hard hand strategy ──
    if (handValue >= 17) return 'stand';
    if (handValue >= 13 && dealerVal <= 6) return 'stand';
    if (handValue === 12 && dealerVal >= 4 && dealerVal <= 6) return 'stand';
    if (handValue === 11) {
        if (canDD) return 'doubledown';
        return 'hit';
    }
    if (handValue === 10 && dealerVal <= 9) {
        if (canDD) return 'doubledown';
        return 'hit';
    }
    if (handValue === 9 && dealerVal >= 3 && dealerVal <= 6) {
        if (canDD) return 'doubledown';
        return 'hit';
    }

    if (handValue <= 11) return 'hit';
    if (handValue <= 16 && dealerVal >= 7) return 'hit';

    return 'stand';
}

function getBotBet(slot) {
    // Pariuri variabil între min și un maxim bazat pe chips
    const minBet = LOBBY_CONFIG.MIN_BET;
    const maxBet = Math.min(LOBBY_CONFIG.MAX_BET, slot.chips, minBet * 5);
    const betOptions = [minBet, minBet * 2, minBet * 3, minBet * 5];
    const validBets = betOptions.filter(b => b <= maxBet && b <= slot.chips);
    return validBets[Math.floor(Math.random() * validBets.length)] || minBet;
}

// ──────────────────────────────────────────
// Auto-play hooks
// ──────────────────────────────────────────

// Hook pentru faza de pariuri — boții pariază automat
mp.events.add('Server_BlackjackPlaceBet', (player, amount) => {
    // Este deja procesat în server; nu avem nevoie de hook suplimentar
});

// Verifică dacă e rândul unui bot și acționează automat
function checkBotTurn() {
    for (const key in lobbies) {
        const lobby = lobbies[key];
        if (lobby.state === 'playing') {
            // Joc paralel — verifică toți boții cu status 'playing'
            lobby.players.forEach(slot => {
                if (slot._hasLeft || slot.status !== 'playing') return;

                const owner = botOwner.get(slot.player);
                if (!owner || !autoMode.has(owner.name)) return;

                // Previne acțiuni duble
                if (slot._botActing) return;
                slot._botActing = true;

                setTimeout(() => {
                    slot._botActing = false;
                    if (slot.status !== 'playing') return;

                    const dealerUpCard = lobby.dealerCards[0];
                    if (!dealerUpCard) return;

                    const decision = getBotDecision(slot, dealerUpCard);
                    processAction(slot.player, decision);
                }, 600 + Math.random() * 800);
            });
        }

        // Faza de pariuri — boții pariază automat
        if (lobby.state === 'betting') {
            lobby.players.forEach(slot => {
                if (slot._hasLeft || slot.bet > 0) return;
                const owner = botOwner.get(slot.player);
                if (!owner || !autoMode.has(owner.name)) return;

                setTimeout(() => {
                    if (slot.bet > 0) return; // A pariat deja
                    const betAmount = getBotBet(slot);
                    placeBet(slot.player, betAmount);
                }, 500 + Math.random() * 1500);
            });
        }
    }
}

// Polling la fiecare 1 secundă
setInterval(checkBotTurn, 1000);

// ──────────────────────────────────────────
// /bjaddbot [numar]
// ──────────────────────────────────────────
mp.events.addCommand('bjaddbot', (player, _, countStr) => {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) {
        global.chatSend(player, '!{Red}[BJ-BOT] Nu ești la nicio masă de blackjack!');
        return;
    }
    if (lobby.state === 'playing' || lobby.state === 'dealer_turn') {
        global.chatSend(player, '!{Red}[BJ-BOT] Nu poți adăuga boți în timpul jocului!');
        return;
    }

    const count = Math.min(parseInt(countStr) || 1, LOBBY_CONFIG.MAX_PLAYERS - lobby.players.length);
    if (count <= 0) {
        global.chatSend(player, '!{Red}[BJ-BOT] Masa este plină sau număr invalid!');
        return;
    }

    const added = [];
    for (let i = 0; i < count; i++) {
        const botName    = `BJ_Bot_${botIdCounter++}`;
        const fakePlayer = createFakePlayer(botName);

        botOwner.set(fakePlayer, player);
        if (!ownerBots.has(player.name)) ownerBots.set(player.name, []);
        ownerBots.get(player.name).push(fakePlayer);

        joinLobby(fakePlayer, lobby.id, lobby.name);
        added.push(botName);
    }

    global.chatSend(player, `!{Green}[BJ-BOT] Adăugat: ${added.join(', ')}`);
});

// ──────────────────────────────────────────
// /bjremovebot [numar]
// ──────────────────────────────────────────
mp.events.addCommand('bjremovebot', (player, _, countStr) => {
    const bots = getPlayerBots(player);
    if (!bots.length) {
        global.chatSend(player, '!{Red}[BJ-BOT] Nu ai niciun bot activ!');
        return;
    }

    const count    = Math.min(parseInt(countStr) || 1, bots.length);
    const removed  = bots.splice(bots.length - count, count);

    removed.forEach(bot => {
        leaveLobby(bot);
        botOwner.delete(bot);
        global.chatSend(player, `!{Yellow}[BJ-BOT] ${bot.name} a părăsit masa.`);
    });
});

// ──────────────────────────────────────────
// /bjbotstatus
// ──────────────────────────────────────────
mp.events.addCommand('bjbotstatus', (player) => {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) { global.chatSend(player, '!{Red}Nu ești la o masă!'); return; }

    const bots = getPlayerBots(player);
    if (!bots.length) {
        global.chatSend(player, '!{Yellow}[BJ-BOT] Nu ai boți la masă.');
        return;
    }

    global.chatSend(player, '!{Cyan}══ BJ BOȚI ══');
    bots.forEach(bot => {
        const slot = lobby.players.find(p => p.player === bot);
        if (!slot) return;
        const isTurn = lobby.players[lobby.currentPlayerIndex]?.player === bot;
        const turnMark = isTurn ? ' !{Green}◄ RÂNDUL LUI' : '';
        global.chatSend(player, 
            `!{White}Scaun ${slot.seat + 1} | ${bot.name} | Chips: $${slot.chips} | Bet: $${slot.bet} | Status: ${slot.status}${turnMark}`
        );
    });
});

// ──────────────────────────────────────────
// /bjautobots — toggle auto-play
// ──────────────────────────────────────────
mp.events.addCommand('bjautobots', (player) => {
    if (autoMode.has(player.name)) {
        autoMode.delete(player.name);
        global.chatSend(player, '!{Red}[BJ-BOT] Auto-play OPRIT.');
    } else {
        autoMode.add(player.name);
        global.chatSend(player, '!{Green}[BJ-BOT] Auto-play PORNIT. Boții joacă singuri.');
    }
});

// ──────────────────────────────────────────
// /bja — shortcut: addbot 3 + autobots ON
// ──────────────────────────────────────────
mp.events.addCommand('bja', (player) => {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) {
        global.chatSend(player, '!{Red}[BJ-BOT] Nu ești la nicio masă de blackjack!');
        return;
    }
    if (lobby.state === 'playing' || lobby.state === 'dealer_turn') {
        global.chatSend(player, '!{Red}[BJ-BOT] Nu poți adăuga boți în timpul jocului!');
        return;
    }

    const count = Math.min(3, LOBBY_CONFIG.MAX_PLAYERS - lobby.players.length);
    if (count <= 0) {
        global.chatSend(player, '!{Red}[BJ-BOT] Masa este plină!');
        return;
    }

    const added = [];
    for (let i = 0; i < count; i++) {
        const botName    = `BJ_Bot_${botIdCounter++}`;
        const fakePlayer = createFakePlayer(botName);
        botOwner.set(fakePlayer, player);
        if (!ownerBots.has(player.name)) ownerBots.set(player.name, []);
        ownerBots.get(player.name).push(fakePlayer);
        joinLobby(fakePlayer, lobby.id, lobby.name);
        added.push(botName);
    }
    global.chatSend(player, `!{Green}[BJ-BOT] Adăugat: ${added.join(', ')}`);

    if (!autoMode.has(player.name)) {
        autoMode.add(player.name);
        global.chatSend(player, '!{Green}[BJ-BOT] Auto-play PORNIT automat.');
    }
});

// ──────────────────────────────────────────
// /bjsimbots [numMese] [numBoti]
// ──────────────────────────────────────────
mp.events.addCommand('bjsimbots', (player, _, numMeseStr, numBotiStr) => {
    if (!fs.existsSync(TABLES_SAVE_PATH)) {
        global.chatSend(player, '!{Red}[BJ-SIM] Nu există mese de blackjack salvate!');
        return;
    }

    const tables = JSON.parse(fs.readFileSync(TABLES_SAVE_PATH, 'utf8'));
    if (tables.length === 0) {
        global.chatSend(player, '!{Red}[BJ-SIM] Nu există mese de blackjack salvate!');
        return;
    }

    const numMese = Math.min(parseInt(numMeseStr) || tables.length, tables.length);
    const numBoti = Math.min(parseInt(numBotiStr) || LOBBY_CONFIG.MAX_PLAYERS, LOBBY_CONFIG.MAX_PLAYERS);

    let totalAdded = 0;
    let mesePornite = 0;

    for (let t = 0; t < numMese; t++) {
        const table = tables[t];
        const existingLobby = lobbies[t];
        if (existingLobby && (existingLobby.state === 'playing' || existingLobby.state === 'dealer_turn')) continue;

        const currentPlayers = existingLobby ? existingLobby.players.length : 0;
        const botsToAdd = Math.min(numBoti - currentPlayers, LOBBY_CONFIG.MAX_PLAYERS - currentPlayers);
        if (botsToAdd <= 0) continue;

        const added = [];
        for (let b = 0; b < botsToAdd; b++) {
            const botName    = `BJ_Bot_${botIdCounter++}`;
            const fakePlayer = createFakePlayer(botName);
            botOwner.set(fakePlayer, player);
            if (!ownerBots.has(player.name)) ownerBots.set(player.name, []);
            ownerBots.get(player.name).push(fakePlayer);
            joinLobby(fakePlayer, t, table.name);
            added.push(botName);
            totalAdded++;
        }
        mesePornite++;
        global.chatSend(player, `!{Green}[BJ-SIM] Masa #${t} "${table.name}" — ${added.length} boți`);
    }

    if (!autoMode.has(player.name)) autoMode.add(player.name);

    global.chatSend(player, `!{Green}[BJ-SIM] Simulare pornită: ${totalAdded} boți pe ${mesePornite} mese. Auto-play ON.`);
    global.chatSend(player, `!{Yellow}[BJ-SIM] Folosește /bjstopsim pentru a opri.`);
});

// ──────────────────────────────────────────
// /bjstopsim
// ──────────────────────────────────────────
mp.events.addCommand('bjstopsim', (player) => {
    const bots = getPlayerBots(player);
    if (!bots.length) {
        global.chatSend(player, '!{Red}[BJ-SIM] Nu ai niciun bot activ!');
        return;
    }

    const count = bots.length;
    const allBots = [...bots];

    allBots.forEach(bot => {
        leaveLobby(bot);
        botOwner.delete(bot);
    });

    ownerBots.set(player.name, []);
    autoMode.delete(player.name);

    global.chatSend(player, `!{Green}[BJ-SIM] Simulare oprită. ${count} boți eliminați.`);
});

// Cleanup la quit
mp.events.add('playerQuit', (player) => {
    const bots = getPlayerBots(player);
    bots.forEach(bot => {
        leaveLobby(bot);
        botOwner.delete(bot);
    });
    ownerBots.delete(player.name);
    autoMode.delete(player.name);
});

console.log('[BLACKJACK] blackjack_bot.js încărcat. Comenzi: /bjaddbot /bjremovebot /bjbotstatus /bjautobots /bja /bjsimbots /bjstopsim');
