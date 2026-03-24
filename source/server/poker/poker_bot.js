// poker_bots.js — Simulare jucători fake pentru testare
// Comenzi disponibile:
//   /addbot [numar]     — adaugă 1 sau mai mulți boți la masa ta
//   /removebot [numar]  — elimină ultimul bot (sau un număr specific)
//   /botaction <seat> <action> [raiseAmount>]  — faci o acțiune în locul botului de pe scaunul X
//   /botfold <seat>     — bot fold
//   /botcheck <seat>    — bot check
//   /botcall <seat>     — bot call
//   /botraise <seat> <amount> — bot raise
//   /botallin <seat>    — bot all-in
//   /botstatus          — afișează toți boții la masa ta
//   /autobots           — boții joacă automat (random) până dai iar comanda
//   /simbots [mese] [boti] — simulare: adaugă boți pe primele X mese (auto-play)
//   /stopsim             — oprește simularea, elimină toți boții tăi

const fs   = require('fs');
const path = require('path');
const { LOBBY_CONFIG, joinLobby, leaveLobby, processAction, lobbies, getBestHand, getDetailedHandName, CARD_VALUES, parseCard } = require('./poker_server.js');

const TABLES_SAVE_PATH = path.join(process.cwd(), 'poker_tables.json');

// ──────────────────────────────────────────
// Fake player factory
// ──────────────────────────────────────────
let botIdCounter = 1;

function createFakePlayer(name) {
    return {
        name,
        _isBot: true,
        _messages: [],       // stocăm mesajele pentru debug
        outputChatBox(msg) {
            // Trimite mesajul la toți adminii online sau logează
            // console.log(`[BOT:${this.name}] ${msg}`);
        },
        call(eventName, ...args) {
            //console.log(`[BOT:${this.name}] event "${eventName}" args: ${JSON.stringify(args)}`);
        },
    };
}

// Map: botPlayer → playerReal care îl controlează
const botOwner  = new Map();   // fakePlayer → realPlayer
const ownerBots = new Map();   // realPlayer.name → [fakePlayer, ...]
const autoMode  = new Set();   // realPlayer.name → auto play activ

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

function getBotBySeat(lobby, seat) {
    return lobby.players.find(p => p.seat === parseInt(seat));
}

// ────────────────────────────────────────────
// Hand strength evaluation for bot AI
// ────────────────────────────────────────────

// Preflop hand ranking (0.0 = trash, 1.0 = premium)
function getPreflopStrength(cards) {
    const c1 = parseCard(cards[0]);
    const c2 = parseCard(cards[1]);
    const v1 = CARD_VALUES[c1.rank];
    const v2 = CARD_VALUES[c2.rank];
    const high = Math.max(v1, v2);
    const low = Math.min(v1, v2);
    const suited = c1.suit === c2.suit;
    const gap = high - low;
    const isPair = v1 === v2;

    // Pairs
    if (isPair) {
        if (high >= 13) return 0.95;          // KK, AA
        if (high >= 11) return 0.85;          // JJ, QQ
        if (high >= 9)  return 0.70;          // 99, TT
        if (high >= 7)  return 0.55;          // 77, 88
        return 0.40;                           // 22-66
    }

    // High cards
    let strength = 0;
    if (high === 14) {      // Ax
        if (low >= 13) strength = suited ? 0.90 : 0.85;   // AK
        else if (low >= 12) strength = suited ? 0.80 : 0.72; // AQ
        else if (low >= 11) strength = suited ? 0.75 : 0.65; // AJ
        else if (low >= 10) strength = suited ? 0.68 : 0.58; // AT
        else strength = suited ? 0.48 : 0.35;                 // A9-A2
    } else if (high === 13) { // Kx
        if (low >= 12) strength = suited ? 0.72 : 0.62;      // KQ
        else if (low >= 11) strength = suited ? 0.65 : 0.55;  // KJ
        else if (low >= 10) strength = suited ? 0.60 : 0.48;  // KT
        else strength = suited ? 0.38 : 0.25;                  // K9-K2
    } else if (high === 12) { // Qx
        if (low >= 11) strength = suited ? 0.60 : 0.50;       // QJ
        else if (low >= 10) strength = suited ? 0.55 : 0.45;  // QT
        else strength = suited ? 0.32 : 0.22;                  // Q9-Q2
    } else if (high === 11) { // Jx
        if (low >= 10) strength = suited ? 0.52 : 0.42;       // JT
        else if (low >= 9) strength = suited ? 0.42 : 0.32;   // J9
        else strength = suited ? 0.28 : 0.18;                  // J8-J2
    } else {
        // Low cards
        if (gap <= 1 && suited) strength = 0.35;        // connected suited (76s, 87s etc.)
        else if (gap <= 2 && suited) strength = 0.28;   // 1-gap suited
        else if (gap <= 1) strength = 0.25;              // connected offsuit
        else strength = suited ? 0.20 : 0.12;            // trash
    }

    return strength;
}

// Post-flop hand strength (folosește evaluatorul real + detectează contribuția cărților din mână)
function getPostflopStrength(holeCards, communityCards) {
    const result = getBestHand(holeCards, communityCards);
    const score = result.score;

    // Detectează dacă cărțile din mână contribuie la cea mai bună combinație de 5
    const usesHole = result.cards
        ? holeCards.some(hc => result.cards.includes(hc))
        : true; // fallback: presupune că da

    // Bazat pe scor: 0=HC, 1=Pair, 2=TwoPair, 3=Trips, 4=Straight, 5=Flush, 6=FH, 7=Quads, 8=SF
    switch (score) {
        case 0: {
            // High Card — dacă hole cards contribuie la top card, puțin mai bine
            const highCard = result.tiebreakers[0];
            if (usesHole && highCard >= 12) return 0.22; // Q+ high din mână
            return 0.08 + (highCard / 14) * 0.12;       // 0.08 - 0.20
        }
        case 1: {
            // One Pair — contează MULT dacă perechea e din mână vs doar de pe board
            const pairRank = result.tiebreakers[0];
            const topKicker = result.tiebreakers[1] || 0;
            const kickerBonus = (topKicker / 14) * 0.05;

            if (usesHole) {
                // Perechea folosește cel puțin o carte din mână — pereche reală
                if (pairRank >= 13) return 0.70 + kickerBonus; // KK/AA
                if (pairRank >= 11) return 0.62 + kickerBonus; // JJ/QQ
                if (pairRank >= 9)  return 0.55 + kickerBonus; // 99/TT
                if (pairRank >= 6)  return 0.48 + kickerBonus; // 66-88
                return 0.40 + kickerBonus;                      // 22-55
            } else {
                // Board pair — toți au această pereche, doar kicker-ul contează
                return 0.18 + (topKicker / 14) * 0.15; // 0.18 - 0.33
            }
        }
        case 2: {
            // Two Pair — diferență mare între board two pair și two pair cu mâna
            const highPair = result.tiebreakers[0];
            if (usesHole) {
                return highPair >= 10 ? 0.75 : 0.70; // strong / medium two pair
            }
            return 0.40; // board two pair, doar kicker contează
        }
        case 3: return usesHole ? 0.82 : 0.50; // Trips — board trips sunt slabe relativ
        case 4: return usesHole ? 0.85 : 0.65; // Straight
        case 5: return usesHole ? 0.90 : 0.72; // Flush
        case 6: return usesHole ? 0.93 : 0.80; // Full House
        case 7: return 0.97;                     // Quads (mereu puternică)
        case 8: return 0.99;                     // Straight Flush
        default: return 0.15;
    }
}

// ────────────────────────────────────────────
// Smart auto-play logic
// ────────────────────────────────────────────
function autoBotAction(lobby) {
    if (lobby.state !== 'playing') return;

    const currentSlot = lobby.players[lobby.currentPlayerIndex];
    if (!currentSlot) return;

    const owner = botOwner.get(currentSlot.player);
    if (!owner || !autoMode.has(owner.name)) return;

    setTimeout(() => {
        // Re-fetch fresh după delay
        const slot = lobby.players[lobby.currentPlayerIndex];
        if (!slot) return;
        
        // Verifică că mai e tot un bot al aceluiași owner
        const currentOwner = botOwner.get(slot.player);
        if (!currentOwner || !autoMode.has(currentOwner.name)) return;

        const canCheck = lobby.currentBet <= slot.currentBet;
        const toCall = lobby.currentBet - slot.currentBet;
        const canAffordRaise = slot.chips > toCall + LOBBY_CONFIG.BIG_BLIND;

        // Verifică dacă toți adversarii sunt all-in
        const opponents = lobby.players.filter(p => p !== slot && !p.hasFolded);
        const allOpponentsAllIn = opponents.length > 0 && opponents.every(p => p.chips === 0);

        // Calculează puterea mâinii
        const isPreflop = lobby.communityCards.length === 0;
        const handStrength = isPreflop
            ? getPreflopStrength(slot.cards)
            : getPostflopStrength(slot.cards, lobby.communityCards);

        // Pot odds: cât costă call-ul relativ la pot
        const potOdds = toCall > 0 ? toCall / (lobby.pot + toCall) : 0;
        const callRatio = slot.chips > 0 ? toCall / slot.chips : 1;

        // Adaugă puțin randomness (±0.10) pentru variație
        const noise = (Math.random() - 0.5) * 0.20;
        const effectiveStrength = Math.max(0, Math.min(1, handStrength + noise));

        let action;
        let raiseAmount = 0;

        if (canCheck) {
            // Poți da check — nu da fold niciodată
            if (allOpponentsAllIn) {
                action = 'check';
            } else if (effectiveStrength >= 0.70) {
                // Mână puternică — raise agresiv
                action = canAffordRaise ? 'raise' : 'check';
            } else if (effectiveStrength >= 0.45) {
                // Mână decentă — raise uneori, altfel check
                action = (canAffordRaise && Math.random() < 0.40) ? 'raise' : 'check';
            } else {
                // Mână slabă — check
                action = 'check';
            }
        } else {
            // Nu poți da check — trebuie call/fold/raise
            if (effectiveStrength >= 0.75) {
                // Mână foarte puternică — raise sau all-in
                if (canAffordRaise && !allOpponentsAllIn) {
                    action = Math.random() < 0.65 ? 'raise' : 'call';
                } else {
                    action = 'call';
                }
            } else if (effectiveStrength >= 0.50) {
                // Mână bună — call, poate raise
                if (canAffordRaise && !allOpponentsAllIn && Math.random() < 0.30) {
                    action = 'raise';
                } else {
                    action = 'call';
                }
            } else if (effectiveStrength >= 0.30) {
                // Mână marginală — call dacă e ieftin, fold dacă e scump
                if (callRatio > 0.4) {
                    action = Math.random() < 0.7 ? 'fold' : 'call';
                } else {
                    action = Math.random() < 0.25 ? 'fold' : 'call';
                }
            } else {
                // Mână slabă — fold de obicei
                if (callRatio < 0.1 && Math.random() < 0.35) {
                    action = 'call';  // calling station mic cu trash
                } else {
                    action = 'fold';
                }
            }
        }

        // Calculează raise amount bazat pe puterea mâinii
        if (action === 'raise') {
            const bigBlind = LOBBY_CONFIG.BIG_BLIND;
            if (effectiveStrength >= 0.85) {
                raiseAmount = bigBlind * (3 + Math.floor(Math.random() * 4));  // 3-6x BB
            } else if (effectiveStrength >= 0.65) {
                raiseAmount = bigBlind * (2 + Math.floor(Math.random() * 3));  // 2-4x BB
            } else {
                raiseAmount = bigBlind * (1 + Math.floor(Math.random() * 2));  // 1-2x BB (min raise)
            }
        }

        processAction(slot.player, action, raiseAmount);
    }, 800 + Math.random() * 700);
}

// Hook în nextTurn pentru auto-mode
mp.events.add('_poker_afterTurn', (lobby) => {
    autoBotAction(lobby);
});

// ──────────────────────────────────────────
// /addbot [numar]
// ──────────────────────────────────────────

mp.events.addCommand('addbot', (player, _, countStr) => {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) {
        player.outputChatBox('!{Red}[BOT] Nu ești la nicio masă de poker!');
        return;
    }
    if (lobby.state === 'playing') {
        player.outputChatBox('!{Red}[BOT] Nu poți adăuga boți în timpul jocului!');
        return;
    }

    const count = Math.min(parseInt(countStr) || 1, LOBBY_CONFIG_MAX - lobby.players.length);
    if (count <= 0) {
        player.outputChatBox('!{Red}[BOT] Masa este plină sau număr invalid!');
        return;
    }

    const added = [];
    for (let i = 0; i < count; i++) {
        const botName   = `Bot_${botIdCounter++}`;
        const fakePlayer = createFakePlayer(botName);

        botOwner.set(fakePlayer, player);

        if (!ownerBots.has(player.name)) ownerBots.set(player.name, []);
        ownerBots.get(player.name).push(fakePlayer);

        joinLobby(fakePlayer, lobby.id, lobby.name);
        added.push(botName);
    }

    player.outputChatBox(`!{Green}[BOT] Adăugat: ${added.join(', ')}`);
    player.outputChatBox(`!{Yellow}[BOT] Folosește /botstatus să vezi scaunele. Controlezi tu acțiunile cu /botcall, /botfold etc.`);
});

const LOBBY_CONFIG_MAX = 10; // trebuie să coincidă cu LOBBY_CONFIG.MAX_PLAYERS

// ──────────────────────────────────────────
// /removebot [numar]
// ──────────────────────────────────────────
mp.events.addCommand('removebot', (player, _, countStr) => {
    const bots  = getPlayerBots(player);
    if (!bots.length) {
        player.outputChatBox('!{Red}[BOT] Nu ai niciun bot activ!');
        return;
    }

    const count    = Math.min(parseInt(countStr) || 1, bots.length);
    const removed  = bots.splice(bots.length - count, count);

    removed.forEach(bot => {
        leaveLobby(bot);
        botOwner.delete(bot);
        player.outputChatBox(`!{Yellow}[BOT] ${bot.name} a părăsit masa.`);
    });
});

// ──────────────────────────────────────────
// /botstatus
// ──────────────────────────────────────────
mp.events.addCommand('botstatus', (player) => {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) { player.outputChatBox('!{Red}Nu ești la o masă!'); return; }

    const bots = getPlayerBots(player);
    if (!bots.length) {
        player.outputChatBox('!{Yellow}[BOT] Nu ai boți la masă.');
        return;
    }

    player.outputChatBox('!{Cyan}══ BOȚI ══');
    bots.forEach(bot => {
        const slot = lobby.players.find(p => p.player === bot);
        if (!slot) return;
        const isTurn = lobby.players[lobby.currentPlayerIndex]?.player === bot;
        const turnMark = isTurn ? ' !{Green}◄ RÂNDUL LUI' : '';
        player.outputChatBox(
            `!{White}Scaun ${slot.seat + 1} | ${bot.name} | Chips: $${slot.chips} | Bet: $${slot.currentBet} | Fold: ${slot.hasFolded}${turnMark}`
        );
    });

    if (lobby.state === 'playing') {
        const curSlot = lobby.players[lobby.currentPlayerIndex];
        player.outputChatBox(`!{Yellow}Rândul curent: ${curSlot?.player?.name || '?'} | Bet: $${lobby.currentBet} | Pot: $${lobby.pot}`);
    }
});

// ──────────────────────────────────────────
// Helper generic pentru acțiuni manuale
// ──────────────────────────────────────────
function doBotAction(player, seatStr, action, raiseAmount = 0) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby || lobby.state !== 'playing') {
        player.outputChatBox('!{Red}[BOT] Nu există un joc activ!');
        return;
    }

    const seat     = parseInt(seatStr) - 1;   // user dă 1-based
    const slot     = getBotBySeat(lobby, seat);
    if (!slot) {
        player.outputChatBox(`!{Red}[BOT] Nu există niciun jucător pe scaunul ${seatStr}!`);
        return;
    }

    // Verifică că botul îți aparține
    if (botOwner.get(slot.player) !== player) {
        player.outputChatBox('!{Red}[BOT] Acel bot nu îți aparține!');
        return;
    }

    // Verifică că e rândul lui
    const currentSlot = lobby.players[lobby.currentPlayerIndex];
    if (!currentSlot || currentSlot !== slot) {
        player.outputChatBox(`!{Red}[BOT] Nu este rândul lui ${slot.player.name}! Rândul curent: ${currentSlot?.player?.name}`);
        return;
    }

    processAction(slot.player, action, raiseAmount);
}

// ──────────────────────────────────────────
// Comenzi individuale
// ──────────────────────────────────────────
mp.events.addCommand('botfold', (player, _, seat) => {
    doBotAction(player, seat, 'fold');
});

mp.events.addCommand('botcheck', (player, _, seat) => {
    doBotAction(player, seat, 'check');
});

mp.events.addCommand('botcall', (player, _, seat) => {
    doBotAction(player, seat, 'call');
});

mp.events.addCommand('botraise', (player, _, seat, amount) => {
    doBotAction(player, seat, 'raise', parseInt(amount) || 0);
});

mp.events.addCommand('botallin', (player, _, seat) => {
    doBotAction(player, seat, 'allin');
});

// ──────────────────────────────────────────
// /botaction <seat> <action> [amount]  — shorthand universal
// ──────────────────────────────────────────
mp.events.addCommand('botaction', (player, _, seat, action, amount) => {
    doBotAction(player, seat, action, parseInt(amount) || 0);
});

// ──────────────────────────────────────────
// /autobots — toggle auto-play pentru boții tăi
// ──────────────────────────────────────────
mp.events.addCommand('autobots', (player) => {
    if (autoMode.has(player.name)) {
        autoMode.delete(player.name);
        player.outputChatBox('!{Red}[BOT] Auto-play OPRIT. Controlezi tu boții manual.');
    } else {
        autoMode.add(player.name);
        player.outputChatBox('!{Green}[BOT] Auto-play PORNIT. Boții joacă singuri (random).');

        // Dacă e deja rândul unui bot, pornește imediat
        const lobby = getLobbyByPlayer(player);
        if (lobby) autoBotAction(lobby);
    }
});

// ──────────────────────────────────────────
// /a — shortcut: addbot 2 + autobots ON
// ──────────────────────────────────────────
mp.events.addCommand('a', (player) => {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) {
        player.outputChatBox('!{Red}[BOT] Nu ești la nicio masă de poker!');
        return;
    }
    if (lobby.state === 'playing') {
        player.outputChatBox('!{Red}[BOT] Nu poți adăuga boți în timpul jocului!');
        return;
    }

    // Adaugă 2 boți
    const count = Math.min(5, LOBBY_CONFIG.MAX_PLAYERS - lobby.players.length);
    if (count <= 0) {
        player.outputChatBox('!{Red}[BOT] Masa este plină!');
        return;
    }
    const added = [];
    for (let i = 0; i < count; i++) {
        const botName    = `Bot_${botIdCounter++}`;
        const fakePlayer = createFakePlayer(botName);
        botOwner.set(fakePlayer, player);
        if (!ownerBots.has(player.name)) ownerBots.set(player.name, []);
        ownerBots.get(player.name).push(fakePlayer);
        joinLobby(fakePlayer, lobby.id, lobby.name);
        added.push(botName);
    }
    player.outputChatBox(`!{Green}[BOT] Adăugat: ${added.join(', ')}`);

    // Pornește auto-play dacă nu e deja activ
    if (!autoMode.has(player.name)) {
        autoMode.add(player.name);
        player.outputChatBox('!{Green}[BOT] Auto-play PORNIT automat.');
        const updatedLobby = getLobbyByPlayer(player);
        if (updatedLobby) autoBotAction(updatedLobby);
    }
});

// ──────────────────────────────────────────
// /simbots [numMese] [numBoti] — simulare masivă pe mai multe mese
//   /simbots           → toate mesele, MAX boți per masă
//   /simbots 3         → primele 3 mese, MAX boți
//   /simbots 3 5       → primele 3 mese, 5 boți per masă
// ──────────────────────────────────────────
mp.events.addCommand('simbots', (player, _, numMeseStr, numBotiStr) => {
    if (!fs.existsSync(TABLES_SAVE_PATH)) {
        player.outputChatBox('!{Red}[SIM] Nu există mese de poker salvate!');
        return;
    }

    const tables = JSON.parse(fs.readFileSync(TABLES_SAVE_PATH, 'utf8'));
    if (tables.length === 0) {
        player.outputChatBox('!{Red}[SIM] Nu există mese de poker salvate!');
        return;
    }

    const numMese = Math.min(parseInt(numMeseStr) || tables.length, tables.length);
    const numBoti = Math.min(parseInt(numBotiStr) || LOBBY_CONFIG.MAX_PLAYERS, LOBBY_CONFIG.MAX_PLAYERS);

    if (numBoti < LOBBY_CONFIG.MIN_PLAYERS) {
        player.outputChatBox(`!{Red}[SIM] Minim ${LOBBY_CONFIG.MIN_PLAYERS} boți per masă pentru a porni jocul!`);
        return;
    }

    let totalAdded = 0;
    let mesePornite = 0;

    for (let t = 0; t < numMese; t++) {
        const table = tables[t];
        const tableIndex = t;
        const tableName = table.name;

        // Skip mese cu joc în desfășurare
        const existingLobby = lobbies[tableIndex];
        if (existingLobby && existingLobby.state === 'playing') {
            player.outputChatBox(`!{Yellow}[SIM] Masa #${t} "${tableName}" — joc în desfășurare, skip.`);
            continue;
        }

        const currentPlayers = existingLobby ? existingLobby.players.length : 0;
        const slotsAvailable = LOBBY_CONFIG.MAX_PLAYERS - currentPlayers;
        const botsToAdd = Math.min(numBoti - currentPlayers, slotsAvailable);

        if (botsToAdd <= 0) {
            player.outputChatBox(`!{Yellow}[SIM] Masa #${t} "${tableName}" — plină sau deja destui, skip.`);
            continue;
        }

        const added = [];
        for (let b = 0; b < botsToAdd; b++) {
            const botName    = `Bot_${botIdCounter++}`;
            const fakePlayer = createFakePlayer(botName);

            botOwner.set(fakePlayer, player);
            if (!ownerBots.has(player.name)) ownerBots.set(player.name, []);
            ownerBots.get(player.name).push(fakePlayer);

            joinLobby(fakePlayer, tableIndex, tableName);
            added.push(botName);
            totalAdded++;
        }

        mesePornite++;
        player.outputChatBox(`!{Green}[SIM] Masa #${t} "${tableName}" — ${added.length} boți: ${added.join(', ')}`);
    }

    // Pornește auto-play
    if (!autoMode.has(player.name)) {
        autoMode.add(player.name);
    }

    player.outputChatBox(`!{Green}[SIM] ══════════════════════════════════`);
    player.outputChatBox(`!{Green}[SIM] Simulare pornită: ${totalAdded} boți pe ${mesePornite} mese. Auto-play ON.`);
    player.outputChatBox(`!{Yellow}[SIM] Folosește /stopsim pentru a opri totul.`);
});

// ──────────────────────────────────────────
// /stopsim — oprește simularea, elimină TOȚI boții adminului
// ──────────────────────────────────────────
mp.events.addCommand('stopsim', (player) => {
    const bots = getPlayerBots(player);
    if (!bots.length) {
        player.outputChatBox('!{Red}[SIM] Nu ai niciun bot activ!');
        return;
    }

    const count = bots.length;
    const allBots = [...bots]; // clonă — evităm probleme la splice în leaveLobby

    allBots.forEach(bot => {
        leaveLobby(bot);
        botOwner.delete(bot);
    });

    ownerBots.set(player.name, []);
    autoMode.delete(player.name);

    player.outputChatBox(`!{Green}[SIM] ══════════════════════════════════`);
    player.outputChatBox(`!{Green}[SIM] Simulare oprită. ${count} boți eliminați de pe toate mesele.`);
});

// ──────────────────────────────────────────
// Cleanup la quit
// ──────────────────────────────────────────
mp.events.add('playerQuit', (player) => {
    const bots = getPlayerBots(player);
    bots.forEach(bot => {
        leaveLobby(bot);
        botOwner.delete(bot);
    });
    ownerBots.delete(player.name);
    autoMode.delete(player.name);
});

// ──────────────────────────────────────────
// TEST SERVER — creează automat 10 mese + 10 boți per masă
// ──────────────────────────────────────────
function initTestServer() {
    if (!LOBBY_CONFIG.TEST_SERVER) return;

    console.log('[POKER][TEST] TEST_SERVER activat — se creează 10 mese cu 10 boți fiecare...');

    const tables = require('./tables');

    // Poziții de test (zona portului LS, distanțate)
    const TEST_POSITIONS = [
        { x: -1835.50, y: -643.50, z: 11.25, heading: 0 },
        { x: -1825.50, y: -643.50, z: 11.25, heading: 0 },
        { x: -1815.50, y: -643.50, z: 11.25, heading: 0 },
        { x: -1805.50, y: -643.50, z: 11.25, heading: 0 },
        { x: -1795.50, y: -643.50, z: 11.25, heading: 0 },
        { x: -1835.50, y: -653.50, z: 11.25, heading: 0 },
        { x: -1825.50, y: -653.50, z: 11.25, heading: 0 },
        { x: -1815.50, y: -653.50, z: 11.25, heading: 0 },
        { x: -1805.50, y: -653.50, z: 11.25, heading: 0 },
        { x: -1795.50, y: -653.50, z: 11.25, heading: 0 },
    ];

    // Creează tabelele în JSON dacă nu există sau sunt prea puține
    let savedTables = [];
    if (fs.existsSync(TABLES_SAVE_PATH)) {
        savedTables = JSON.parse(fs.readFileSync(TABLES_SAVE_PATH, 'utf8'));
    }

    const needTables = 10 - savedTables.length;
    if (needTables > 0) {
        for (let i = 0; i < needTables; i++) {
            const pos = TEST_POSITIONS[savedTables.length + i] || TEST_POSITIONS[i];
            const newTable = {
                name: `TestTable_${savedTables.length + i}`,
                x: pos.x,
                y: pos.y,
                z: pos.z,
                heading: pos.heading
            };
            savedTables.push(newTable);

            // Creează obiectele fizice în joc
            const idx = savedTables.length - 1;
            mp.objects.new(mp.joaat('prop_poker_table_02'), new mp.Vector3(pos.x, pos.y, pos.z), {
                rotation: new mp.Vector3(0, 0, pos.heading),
                dimension: 0
            });
            tables.createBlip(pos, idx);
            tables.createColshape(pos, idx, newTable.name);
            tables.createLeaveColshape(pos, idx);
            tables.createMarker(newTable, idx);
        }
        fs.writeFileSync(TABLES_SAVE_PATH, JSON.stringify(savedTables, null, 4));
        console.log(`[POKER][TEST] ${needTables} mese noi create.`);
    }

    // Creează un owner virtual pentru boții de test
    const testOwner = createFakePlayer('__TestServerOwner__');
    testOwner._isTestOwner = true;
    ownerBots.set(testOwner.name, []);

    // Adaugă 10 boți la fiecare din primele 10 mese
    const totalMese = Math.min(10, savedTables.length);
    let totalBots = 0;

    for (let t = 0; t < totalMese; t++) {
        const table = savedTables[t];
        const tableIndex = t;
        const tableName = table.name;

        // Verifică câte sloturi sunt libere
        const existingLobby = lobbies[tableIndex];
        const currentPlayers = existingLobby ? existingLobby.players.length : 0;
        const botsToAdd = Math.min(LOBBY_CONFIG.MAX_PLAYERS, LOBBY_CONFIG.MAX_PLAYERS - currentPlayers);

        for (let b = 0; b < botsToAdd; b++) {
            const botName = `TestBot_${botIdCounter++}`;
            const fakePlayer = createFakePlayer(botName);

            botOwner.set(fakePlayer, testOwner);
            ownerBots.get(testOwner.name).push(fakePlayer);

            joinLobby(fakePlayer, tableIndex, tableName);
            totalBots++;
        }
    }

    // Activează auto-play
    autoMode.add(testOwner.name);

    console.log(`[POKER][TEST] ══════════════════════════════════`);
    console.log(`[POKER][TEST] Simulare test pornită: ${totalBots} boți pe ${totalMese} mese. Auto-play ON.`);
    console.log(`[POKER][TEST] Setează TEST_SERVER: false în poker_server.js pentru a dezactiva.`);
}

// Pornește test server-ul după ce totul s-a încărcat (2 secunde delay)
setTimeout(() => {
    initTestServer();
}, 2000);

console.log('[POKER] poker_bots.js încărcat. Comenzi: /addbot /removebot /botfold /botcheck /botcall /botraise /botallin /botstatus /autobots /simbots /stopsim');