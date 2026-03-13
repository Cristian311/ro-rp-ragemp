// blackjack_server.js — Server-side blackjack logic (RAGE MP)
const bjLog = require('./blackjack_logger');

const LOBBY_CONFIG = {
    TEST_SERVER: false,
    MAX_PLAYERS: 6,       // Maxim 6 jucători per masă (+ dealer)
    MIN_PLAYERS: 1,       // Minim 1 jucător pentru a începe
    TURN_TIME: 20,        // Secunde per tur
    START_DELAY: 5,       // Secunde înainte de start
    END_DELAY: 8,         // Secunde între runde
    MIN_BET: 100,
    MAX_BET: 10000,
    STARTING_CHIPS: 5000,
    HOUSE_CUT_PERCENT: 0, // Blackjack nu are rake tradițional — avantajul casei e matematic
    BLACKJACK_PAYOUT: 1.5, // 3:2 payout pentru blackjack natural
    DECKS: 6,             // Numărul de pachete de cărți
};

// ──────────────────────────────────────────
// Card values & deck
// ──────────────────────────────────────────
const CARD_VALUES = {
    '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,
    'J':10,'Q':10,'K':10,'A':11
};

function parseCard(cardStr) {
    const suit = cardStr.slice(-1);
    const rank = cardStr.slice(0, -1);
    return { rank, suit };
}

function getCardValue(cardStr) {
    const { rank } = parseCard(cardStr);
    return CARD_VALUES[rank] || 0;
}

function createShuffledDeck(numDecks) {
    const suits  = ['s', 'h', 'd', 'c'];
    const values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const deck   = [];
    for (let d = 0; d < numDecks; d++) {
        for (const s of suits) {
            for (const v of values) {
                deck.push(`${v}${s}`);
            }
        }
    }
    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function dealFromDeck(lobby, count) {
    if (lobby.deck.length < count) {
        console.log(`[BLACKJACK] Deck-ul se reface (rămase: ${lobby.deck.length})`);
        lobby.deck = createShuffledDeck(LOBBY_CONFIG.DECKS);
    }
    return lobby.deck.splice(0, count);
}

// ──────────────────────────────────────────
// Hand evaluation
// ──────────────────────────────────────────
function calculateHandValue(cards) {
    let value = 0;
    let aces = 0;
    for (const card of cards) {
        const v = getCardValue(card);
        value += v;
        if (parseCard(card).rank === 'A') aces++;
    }
    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }
    return value;
}

function isBlackjack(cards) {
    return cards.length === 2 && calculateHandValue(cards) === 21;
}

function isSoftHand(cards) {
    let value = 0, aces = 0;
    for (const card of cards) {
        const v = getCardValue(card);
        value += v;
        if (parseCard(card).rank === 'A') aces++;
    }
    while (value > 21 && aces > 0) { value -= 10; aces--; }
    return aces > 0;
}

function isBust(cards) {
    return calculateHandValue(cards) > 21;
}

function getHandName(cards) {
    const value = calculateHandValue(cards);
    if (isBlackjack(cards)) return 'Blackjack!';
    if (value > 21) return `Bust (${value})`;
    return `${value}`;
}

// ──────────────────────────────────────────
// Lobby management
// ──────────────────────────────────────────
function createLobby(tableIndex, tableName, casinoId) {
    return {
        id: tableIndex,
        name: tableName,
        casinoId: casinoId || null,
        state: 'waiting',       // waiting | betting | playing | dealer_turn | resolving
        players: [],
        dealerCards: [],
        currentPlayerIndex: 0,
        startTimer: null,
        turnTimer: null,
        turnTimeLeft: 0,
        deck: createShuffledDeck(LOBBY_CONFIG.DECKS),
    };
}

const lobbies = {};

function getLobbyByPlayer(player) {
    for (const key in lobbies) {
        const found = lobbies[key].players.find(p => p.player === player && !p._hasLeft);
        if (found) return lobbies[key];
    }
    return null;
}

function getPlayerSlot(lobby, player) {
    return lobby.players.find(p => p.player === player);
}

function isPlayerValid(player) {
    try { return player && player.id !== undefined; } catch (e) { return false; }
}

function safeName(slot) {
    return (slot && slot.name) || 'Unknown';
}

function broadcastToLobby(lobby, message) {
    lobby.players.forEach(slot => {
        if (!slot._hasLeft && isPlayerValid(slot.player)) {
            try { slot.player.outputChatBox(message); } catch (e) {}
        }
    });
}

function callToLobby(lobby, eventName, ...args) {
    lobby.players.forEach(slot => {
        if (!slot._hasLeft && isPlayerValid(slot.player)) {
            try { slot.player.call(eventName, ...args); } catch (e) {}
        }
    });
}

// ──────────────────────────────────────────
// Join / Leave
// ──────────────────────────────────────────
function joinLobby(player, tableIndex, tableName, casinoId) {
    if (getLobbyByPlayer(player)) {
        player.outputChatBox('!{Red}Ești deja la o masă de blackjack!');
        return;
    }

    if (!lobbies[tableIndex]) {
        lobbies[tableIndex] = createLobby(tableIndex, tableName, casinoId);
    }

    const lobby = lobbies[tableIndex];

    if (lobby.state !== 'waiting' && lobby.state !== 'betting') {
        player.outputChatBox('!{Red}Partida e în desfășurare. Așteaptă runda următoare!');
        return;
    }

    if (lobby.players.length >= LOBBY_CONFIG.MAX_PLAYERS) {
        player.outputChatBox('!{Red}Masa este plină!');
        return;
    }

    const usedSeats = new Set(lobby.players.map(p => p.seat));
    let seat = 0;
    while (usedSeats.has(seat)) seat++;

    lobby.players.push({
        player,
        name: player.name,
        seat,
        chips: LOBBY_CONFIG.STARTING_CHIPS,
        cards: [],
        bet: 0,
        insuranceBet: 0,
        status: 'waiting',      // waiting | betting | playing | stand | bust | blackjack | win | lose | push
        hasDoubledDown: false,
        _hasLeft: false,
    });

    player.outputChatBox(`!{Orange}[BLACKJACK] Te-ai așezat la masă pe locul ${seat + 1}.`);
    broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{Cyan}${safeName({ name: player.name })} !{White}s-a alăturat (${lobby.players.length}/${LOBBY_CONFIG.MAX_PLAYERS})`);
    console.log(`[BLACKJACK] JOIN: ${safeName({ name: player.name })} la "${tableName}" (${lobby.players.length}/${LOBBY_CONFIG.MAX_PLAYERS}), seat ${seat}`);
    bjLog.onPlayerJoin(tableIndex, tableName, safeName({ name: player.name }), lobby.players.length, LOBBY_CONFIG.MAX_PLAYERS);

    player.call('openBlackjackUI');
    updateLobbyUI(lobby);

    if (lobby.state === 'betting') {
        setTimeout(() => {
            if (isPlayerValid(player)) {
                try { player.call('bjBettingPhase', [LOBBY_CONFIG.MIN_BET, LOBBY_CONFIG.MAX_BET]); } catch (e) {}
            }
        }, 500);
    }

    if (lobby.players.length >= LOBBY_CONFIG.MIN_PLAYERS && lobby.state === 'waiting') {
        lobby.state = 'betting';
        setTimeout(() => {
            startBettingPhase(lobby);
        }, 500);
    }
}

function leaveLobby(player) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) return;

    const leavingIndex = lobby.players.findIndex(p => p.player === player);
    if (leavingIndex === -1) return;

    const leaveName = lobby.players[leavingIndex].name || player.name;
    const wasPlaying = lobby.state === 'playing' || lobby.state === 'dealer_turn';
    console.log(`[BLACKJACK] LEAVE: ${leaveName} părăsește "${lobby.name}" (wasPlaying: ${wasPlaying})`);
    bjLog.onPlayerLeave(lobby.id, lobby.name, leaveName, wasPlaying ? 'mid-hand' : 'manual');

    if (isPlayerValid(player)) {
        try {
            player.call('closeBlackjackUI');
            player.outputChatBox('!{Orange}[BLACKJACK] !{White}Ai părăsit masa.');
        } catch (e) {}
    }

    if (wasPlaying) {
        const slot = lobby.players[leavingIndex];
        slot.status = 'bust';
        slot._hasLeft = true;

        // Pariul e pierdut, dar returnează restul de chips
        if (isPlayerValid(player) && !player._isBot) {
            try { mp.events.call('blackjack:updatePlayerMoney', player, slot.chips); } catch (e) {}
        }
        bjLog.onPlayerLeave(lobby.id, lobby.name, leaveName, `mid-hand (bet $${slot.bet} forfeited, $${slot.chips} returned)`);

        broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{Cyan}${leaveName} !{White}a părăsit masa.`);

        checkAllPlayersDone(lobby);
        updateLobbyUI(lobby);
        return;
    }

    // Nu e în joc — scoatem normal
    const leavingSlot = lobby.players[leavingIndex];
    if (isPlayerValid(player) && !player._isBot) {
        try { mp.events.call('blackjack:updatePlayerMoney', player, leavingSlot.chips); } catch (e) {}
    }

    lobby.players.splice(leavingIndex, 1);
    lobby.players.forEach((p, i) => { p.seat = i; });

    broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{Cyan}${leaveName} !{White}a părăsit masa.`);

    if (lobby.players.length < LOBBY_CONFIG.MIN_PLAYERS) {
        if (lobby.startTimer) { clearInterval(lobby.startTimer); lobby.startTimer = null; }
        if (lobby.turnTimer)  { clearInterval(lobby.turnTimer);  lobby.turnTimer = null; }
        lobby.state = 'waiting';
        broadcastToLobby(lobby, '!{Red}[BLACKJACK] Nu mai sunt suficienți jucători.');

        const remaining = [...lobby.players];
        remaining.forEach(slot => {
            if (!isPlayerValid(slot.player)) return;
            try {
                if (!slot.player._isBot) {
                    mp.events.call('blackjack:updatePlayerMoney', slot.player, slot.chips);
                }
                slot.player.call('closeBlackjackUI');
                slot.player.outputChatBox('!{Orange}[BLACKJACK] !{White}Ai fost scos de la masă.');
            } catch (e) {}
        });
        lobby.players = [];
    }

    updateLobbyUI(lobby);
}

// ──────────────────────────────────────────
// Betting phase
// ──────────────────────────────────────────
function startBettingPhase(lobby) {
    lobby.state = 'betting';
    lobby.dealerCards = [];
    lobby.players.forEach(slot => {
        slot.cards = [];
        slot.bet = 0;
        slot.insuranceBet = 0;
        slot.status = 'betting';
        slot.hasDoubledDown = false;
    });

    broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{White}Plasează pariul! (Min: $${LOBBY_CONFIG.MIN_BET}, Max: $${LOBBY_CONFIG.MAX_BET})`);
    callToLobby(lobby, 'bjBettingPhase', [LOBBY_CONFIG.MIN_BET, LOBBY_CONFIG.MAX_BET]);

    let secondsLeft = LOBBY_CONFIG.START_DELAY + 10; // 15 secunde pentru pariuri
    lobby.startTimer = setInterval(() => {
        secondsLeft--;
        callToLobby(lobby, 'bjBetTimer', [secondsLeft]);

        // Verifică dacă toți au pariat
        const allBet = lobby.players.filter(p => !p._hasLeft).every(p => p.bet > 0);
        if (allBet || secondsLeft <= 0) {
            clearInterval(lobby.startTimer);
            lobby.startTimer = null;

            // Setează bet-ul minim pentru cei care nu au pariat
            lobby.players.forEach(slot => {
                if (!slot._hasLeft && slot.bet === 0) {
                    const autoBet = Math.min(LOBBY_CONFIG.MIN_BET, slot.chips);
                    slot.bet = autoBet;
                    slot.chips -= autoBet;
                    if (isPlayerValid(slot.player)) {
                        try { slot.player.outputChatBox(`!{Yellow}[BLACKJACK] Pariu automat: $${autoBet}`); } catch (e) {}
                    }
                }
            });

            startGame(lobby);
        }
    }, 1000);
}

function placeBet(player, amount) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby || lobby.state !== 'betting') {
        player.outputChatBox('!{Red}Nu poți paria acum!');
        return;
    }

    const slot = getPlayerSlot(lobby, player);
    if (!slot) return;

    if (slot.bet > 0) {
        player.outputChatBox('!{Red}Ai pariat deja!');
        return;
    }

    const parsed = parseInt(amount);
    if (isNaN(parsed) || parsed <= 0) {
        player.outputChatBox('!{Red}Sumă invalidă!');
        return;
    }
    const betAmount = Math.max(LOBBY_CONFIG.MIN_BET, Math.min(parsed, LOBBY_CONFIG.MAX_BET, slot.chips));
    if (betAmount > slot.chips) {
        player.outputChatBox('!{Red}Nu ai suficienți chips!');
        return;
    }

    slot.bet = betAmount;
    slot.chips -= betAmount;
    slot.status = 'playing';

    player.outputChatBox(`!{Green}[BLACKJACK] Ai pariat $${betAmount}.`);
    broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{Cyan}${player.name} !{White}a pariat !{Green}$${betAmount}`);

    bjLog.onPlayerBet(lobby, player.name, betAmount);
    updateLobbyUI(lobby);
}

// ──────────────────────────────────────────
// Game flow
// ──────────────────────────────────────────
function startGame(lobby) {
    lobby.state = 'playing';
    lobby.dealerCards = [];

    console.log(`[BLACKJACK] ====== START GAME ====== Lobby "${lobby.name}", ${lobby.players.length} jucători`);
    bjLog.onGameStart(lobby);

    lobby.players.forEach(slot => {
        if (!slot._hasLeft) {
            slot.cards = dealFromDeck(lobby, 2);
            slot.status = 'playing';
            console.log(`[BLACKJACK] DEAL: ${safeName(slot)} → ${slot.cards.join(' ')} (bet: $${slot.bet})`);
            bjLog.onDealCards(lobby, safeName(slot), slot.cards);
        }
    });

    lobby.dealerCards = dealFromDeck(lobby, 2);
    console.log(`[BLACKJACK] DEALER: ${lobby.dealerCards[0]} [hidden]`);
    bjLog.onDealerCards(lobby, lobby.dealerCards);

    // Trimite cărțile la toți jucătorii
    lobby.players.forEach(slot => {
        if (!slot._hasLeft && isPlayerValid(slot.player)) {
            try {
                const [c1, c2] = slot.cards;
                const p1 = parseCard(c1);
                const p2 = parseCard(c2);
                slot.player.call('bjDealCards', [p1.rank, p1.suit, p2.rank, p2.suit]);

                const dc = parseCard(lobby.dealerCards[0]);
                slot.player.call('bjDealerCard', [dc.rank, dc.suit, true]); 
            } catch (e) {}
        }
    });

    // Verifică blackjack natural
    lobby.players.forEach(slot => {
        if (!slot._hasLeft && isBlackjack(slot.cards)) {
            slot.status = 'blackjack';
            broadcastToLobby(lobby, `!{Yellow}[BLACKJACK] !{Cyan}${safeName(slot)} !{White}are !{Gold}BLACKJACK!`);
        }
    });

    updateLobbyUI(lobby);

    // Activează toți jucătorii simultan (joc paralel)
    activateAllPlayers(lobby);
}

function activateAllPlayers(lobby) {
    lobby.turnTimeLeft = LOBBY_CONFIG.TURN_TIME;

    // Trimite bjYourTurn la toți jucătorii activi
    lobby.players.forEach(slot => {
        if (slot._hasLeft || slot.status !== 'playing') return;

        const handValue = calculateHandValue(slot.cards);
        const canDoubleDown = slot.cards.length === 2 && slot.chips >= slot.bet;

        console.log(`[BLACKJACK] TURN: ${safeName(slot)} | cards: ${slot.cards.join(' ')} = ${handValue} | chips: $${slot.chips}`);
        broadcastToLobby(lobby,
            `!{Orange}[BLACKJACK] !{White}Rândul lui !{Cyan}${safeName(slot)} !{White}| Mâna: ${handValue}`
        );

        if (isPlayerValid(slot.player)) {
            try { slot.player.call('bjYourTurn', [handValue, canDoubleDown]); } catch (e) {}
        }
    });

    callToLobby(lobby, 'bjUpdateState', [getLobbyStateForUI(lobby)]);

    // Dacă nimeni nu mai are status 'playing' (toți au blackjack/bust), treci direct la dealer
    const stillPlaying = lobby.players.some(p => !p._hasLeft && p.status === 'playing');
    if (!stillPlaying) {
        dealerTurn(lobby);
        return;
    }

    // Timer partajat pentru toată runda
    if (lobby.turnTimer) clearInterval(lobby.turnTimer);
    lobby.turnTimer = setInterval(() => {
        lobby.turnTimeLeft--;
        callToLobby(lobby, 'bjTurnTimer', ['Acționează!', lobby.turnTimeLeft]);

        if (lobby.turnTimeLeft <= 0) {
            clearInterval(lobby.turnTimer);
            lobby.turnTimer = null;
            // Auto-stand pe toți jucătorii rămași
            lobby.players.forEach(slot => {
                if (!slot._hasLeft && slot.status === 'playing') {
                    slot.status = 'stand';
                    broadcastToLobby(lobby, `!{Red}[BLACKJACK] ${safeName(slot)} a picat timpul — Stand automat!`);
                    bjLog.onTimeout(lobby, safeName(slot), 'stand');
                }
            });
            dealerTurn(lobby);
        }
    }, 1000);
}

function checkAllPlayersDone(lobby) {
    const stillPlaying = lobby.players.some(p => !p._hasLeft && p.status === 'playing');
    if (!stillPlaying) {
        if (lobby.turnTimer) { clearInterval(lobby.turnTimer); lobby.turnTimer = null; }
        dealerTurn(lobby);
    } else {
        callToLobby(lobby, 'bjUpdateState', [getLobbyStateForUI(lobby)]);
    }
}

// ──────────────────────────────────────────
// Player actions
// ──────────────────────────────────────────
function processAction(player, action) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby || lobby.state !== 'playing') {
        player.outputChatBox('!{Red}Nu ești într-un joc activ.');
        return;
    }

    const validActions = ['hit', 'stand', 'doubledown'];
    if (typeof action !== 'string' || !validActions.includes(action)) {
        player.outputChatBox('!{Red}Acțiune invalidă!');
        return;
    }

    const slot = getPlayerSlot(lobby, player);
    if (!slot || slot.status !== 'playing') {
        player.outputChatBox('!{Red}Nu poți acționa acum!');
        return;
    }
    console.log(`[BLACKJACK] ACTION: ${player.name} → ${action} | cards: ${slot.cards.join(' ')} = ${calculateHandValue(slot.cards)} | chips: $${slot.chips}`);

    switch (action) {
        case 'hit': {
            const newCard = dealFromDeck(lobby, 1)[0];
            slot.cards.push(newCard);
            const handValue = calculateHandValue(slot.cards);
            const pc = parseCard(newCard);

            broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{Cyan}${player.name} !{White}a tras o carte: !{Yellow}${newCard} !{White}(Total: ${handValue})`);
            bjLog.onPlayerAction(lobby, player.name, 'hit', slot.cards, handValue);

            slot.player.call('bjHitCard', [player.name, pc.rank, pc.suit, handValue]);

            if (handValue > 21) {
                slot.status = 'bust';
                broadcastToLobby(lobby, `!{Red}[BLACKJACK] !{Cyan}${player.name} !{White}a dat BUST! (${handValue})`);
                bjLog.onPlayerAction(lobby, player.name, 'bust', slot.cards, handValue);
                checkAllPlayersDone(lobby);
            } else if (handValue === 21) {
                slot.status = 'stand';
                broadcastToLobby(lobby, `!{Green}[BLACKJACK] !{Cyan}${player.name} !{White}are 21!`);
                checkAllPlayersDone(lobby);
            } else {
                // Mai poate acționa
                const canDoubleDown = false; // Nu mai poți double down după hit
                slot.player.call('bjYourTurn', [handValue, canDoubleDown, false]);
            }
            break;
        }

        case 'stand': {
            slot.status = 'stand';
            broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{Cyan}${player.name} !{White}a dat !{Yellow}Stand !{White}(${calculateHandValue(slot.cards)})`);
            bjLog.onPlayerAction(lobby, player.name, 'stand', slot.cards, calculateHandValue(slot.cards));
            checkAllPlayersDone(lobby);
            break;
        }

        case 'doubledown': {
            if (slot.cards.length !== 2) {
                player.outputChatBox('!{Red}Nu poți da Double Down acum!');
                return;
            }
            if (slot.chips < slot.bet) {
                player.outputChatBox('!{Red}Nu ai suficienți chips pentru Double Down!');
                return;
            }

            slot.chips -= slot.bet;
            slot.bet *= 2;
            slot.hasDoubledDown = true;

            const newCard = dealFromDeck(lobby, 1)[0];
            slot.cards.push(newCard);
            const handValue = calculateHandValue(slot.cards);
            const pc = parseCard(newCard);

            broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{Cyan}${player.name} !{White}a dat !{Pink}Double Down!{White} ($${slot.bet})! Carte: !{Yellow}${newCard} !{White}(Total: ${handValue})`);
            bjLog.onPlayerAction(lobby, player.name, 'doubledown', slot.cards, handValue);

            slot.player.call('bjHitCard', [player.name, pc.rank, pc.suit, handValue]);

            if (handValue > 21) {
                slot.status = 'bust';
                broadcastToLobby(lobby, `!{Red}[BLACKJACK] !{Cyan}${player.name} !{White}a dat BUST! (${handValue})`);
            } else {
                slot.status = 'stand';
            }
            checkAllPlayersDone(lobby);
            break;
        }

        default:
            player.outputChatBox('!{Red}Acțiune invalidă!');
            return;
    }

    updateLobbyUI(lobby);
}

// ──────────────────────────────────────────
// Dealer turn
// ──────────────────────────────────────────
function dealerTurn(lobby) {
    lobby.state = 'dealer_turn';

    // Verifică dacă sunt jucători activi (nu bust)
    const activePlayers = lobby.players.filter(p => !p._hasLeft && (p.status === 'stand' || p.status === 'blackjack'));
    if (activePlayers.length === 0) {
        // Toți au bust → nu mai trage dealer-ul
        broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{White}Toți jucătorii au dat bust. Dealerul nu mai trage.`);
        // Reveal dealer cards
        callToLobby(lobby, 'bjDealerReveal', [lobby.dealerCards.map(c => { const p = parseCard(c); return { rank: p.rank, suit: p.suit }; }), calculateHandValue(lobby.dealerCards)]);
        resolveRound(lobby);
        return;
    }

    broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{White}Rândul dealerului...`);

    // Reveal cartea ascunsă
    const dealerValue = calculateHandValue(lobby.dealerCards);
    callToLobby(lobby, 'bjDealerReveal', [lobby.dealerCards.map(c => { const p = parseCard(c); return { rank: p.rank, suit: p.suit }; }), dealerValue]);

    console.log(`[BLACKJACK] DEALER REVEAL: ${lobby.dealerCards.join(' ')} = ${dealerValue}`);

    // Dealer trage cărți cu delay vizual
    dealerDrawSequence(lobby, () => {
        resolveRound(lobby);
    });
}

function dealerDrawSequence(lobby, callback) {
    const drawNext = () => {
        const dealerValue = calculateHandValue(lobby.dealerCards);

        if (dealerValue >= 17 && !(dealerValue === 17 && isSoftHand(lobby.dealerCards))) {
            // Dealer stă (H17: trage pe soft 17)
            if (dealerValue > 21) {
                broadcastToLobby(lobby, `!{Red}[BLACKJACK] !{White}Dealerul a dat BUST! (${dealerValue})`);
            } else {
                broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{White}Dealerul stă la ${dealerValue}.`);
            }
            callback();
            return;
        }

        // Trage o carte
        const newCard = dealFromDeck(lobby, 1)[0];
        lobby.dealerCards.push(newCard);
        const newValue = calculateHandValue(lobby.dealerCards);
        const pc = parseCard(newCard);

        broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{White}Dealerul trage: !{Yellow}${newCard} !{White}(Total: ${newValue})`);
        callToLobby(lobby, 'bjDealerHit', [pc.rank, pc.suit, newValue]);

        bjLog.onDealerAction(lobby, 'hit', lobby.dealerCards, newValue);

        // Delay de 1.5 secunde între cărți
        setTimeout(drawNext, 1500);
    };

    // Primul delay de 1 sec pentru dramatic effect
    setTimeout(drawNext, 1000);
}

// ──────────────────────────────────────────
// Resolve round
// ──────────────────────────────────────────
function resolveRound(lobby) {
    lobby.state = 'resolving';
    const dealerValue = calculateHandValue(lobby.dealerCards);
    const dealerBlackjack = isBlackjack(lobby.dealerCards);
    const dealerBust = dealerValue > 21;

    console.log(`[BLACKJACK] ====== RESOLVE ====== Dealer: ${lobby.dealerCards.join(' ')} = ${dealerValue} (bust: ${dealerBust}, bj: ${dealerBlackjack})`);

    const results = [];

    lobby.players.forEach(slot => {
        if (slot._hasLeft) return;

        const playerValue = calculateHandValue(slot.cards);
        const playerBJ = isBlackjack(slot.cards);
        let outcome, payout;

        if (slot.status === 'bust') {
            outcome = 'lose';
            payout = 0;
        } else if (playerBJ && dealerBlackjack) {
            outcome = 'push';
            payout = slot.bet;
        } else if (playerBJ) {
            outcome = 'blackjack';
            payout = slot.bet + Math.floor(slot.bet * LOBBY_CONFIG.BLACKJACK_PAYOUT);
        } else if (dealerBlackjack) {
            outcome = 'lose';
            payout = 0;
        } else if (dealerBust) {
            outcome = 'win';
            payout = slot.bet * 2;
        } else if (playerValue > dealerValue) {
            outcome = 'win';
            payout = slot.bet * 2;
        } else if (playerValue === dealerValue) {
            outcome = 'push';
            payout = slot.bet;
        } else {
            outcome = 'lose';
            payout = 0;
        }

        slot.chips += payout;
        slot.status = outcome;

        const resultStr = outcomeLabel(outcome);
        const payoutStr = payout > 0 ? `+$${payout}` : '-$' + slot.bet;

        results.push({
            name: safeName(slot),
            cards: [...slot.cards],
            value: playerValue,
            outcome,
            payout,
            bet: slot.bet,
        });

        console.log(`[BLACKJACK] RESULT: ${safeName(slot)} → ${slot.cards.join(' ')} = ${playerValue} → ${outcome} (bet: $${slot.bet}, payout: $${payout})`);
        bjLog.onPlayerResult(lobby, safeName(slot), outcome, slot.cards, playerValue, slot.bet, payout);

        if (outcome === 'blackjack') {
            broadcastToLobby(lobby, `!{Gold}[BLACKJACK] !{Cyan}${safeName(slot)} !{White}— !{Gold}BLACKJACK! !{Green}+$${payout}`);
        } else if (outcome === 'win') {
            broadcastToLobby(lobby, `!{Green}[BLACKJACK] !{Cyan}${safeName(slot)} !{White}— !{Green}CÂȘTIGĂ! +$${payout}`);
        } else if (outcome === 'push') {
            broadcastToLobby(lobby, `!{Yellow}[BLACKJACK] !{Cyan}${safeName(slot)} !{White}— !{Yellow}PUSH (egal). Banii înapoi.`);
        } else {
            broadcastToLobby(lobby, `!{Red}[BLACKJACK] !{Cyan}${safeName(slot)} !{White}— !{Red}PIERDE -$${slot.bet}`);
        }
    });

    // Trimite rezultatele la UI
    callToLobby(lobby, 'bjShowResults', [JSON.stringify(results), dealerValue, dealerBust]);

    bjLog.onGameEnd(lobby, results);

    // Cleanup & next round
    endRound(lobby);
}

function outcomeLabel(outcome) {
    switch (outcome) {
        case 'blackjack': return 'BLACKJACK';
        case 'win': return 'WIN';
        case 'push': return 'PUSH';
        case 'lose': return 'LOSE';
        case 'bust': return 'BUST';
        default: return outcome.toUpperCase();
    }
}

function endRound(lobby) {
    if (lobby.turnTimer) { clearInterval(lobby.turnTimer); lobby.turnTimer = null; }

    lobby.players.forEach(slot => {
        if (isPlayerValid(slot.player) && !slot.player._isBot) {
            try {
                mp.events.call('blackjack:updatePlayerMoney', slot.player, slot.chips);
                console.log(`[BLACKJACK] MONEY_UPDATE: ${safeName(slot)} → $${slot.chips}`);
            } catch (e) {}
        }
    });

    const eliminated = lobby.players.filter(p => p.chips <= 0 && !p._hasLeft);

    eliminated.forEach(slot => {
        if (isPlayerValid(slot.player)) {
            try {
                slot.player.outputChatBox('!{Red}[BLACKJACK] Nu mai ai chips! Ai fost eliminat.');
                slot.player.call('closeBlackjackUI');
            } catch (e) {}
        }
        broadcastToLobby(lobby, `!{Red}[BLACKJACK] ${safeName(slot)} a fost eliminat (0 chips).`);
    });

    lobby.players = lobby.players.filter(p => p.chips > 0 && !p._hasLeft);
    lobby.players.forEach((p, i) => { p.seat = i; });

    console.log(`[BLACKJACK] POST_ROUND: ${lobby.players.length} jucători rămași`);

    if (lobby.players.length >= LOBBY_CONFIG.MIN_PLAYERS) {
        updateLobbyUI(lobby);
        broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{White}Runda nouă în ${LOBBY_CONFIG.END_DELAY} secunde...`);
        setTimeout(() => {
            if (lobby.players.length >= LOBBY_CONFIG.MIN_PLAYERS) {
                startBettingPhase(lobby);
            } else {
                lobby.state = 'waiting';
                updateLobbyUI(lobby);
                broadcastToLobby(lobby, '!{Red}[BLACKJACK] Nu sunt suficienți jucători.');
            }
        }, LOBBY_CONFIG.END_DELAY * 1000);
    } else {
        lobby.state = 'waiting';
        updateLobbyUI(lobby);
        broadcastToLobby(lobby, '!{Red}[BLACKJACK] Nu sunt suficienți jucători.');
    }
}

// ──────────────────────────────────────────
// UI state
// ──────────────────────────────────────────
function getLobbyStateForUI(lobby) {
    const visiblePlayers = lobby.players.filter(p => !p._hasLeft);
    return {
        state: lobby.state,
        dealerCards: lobby.state === 'dealer_turn' || lobby.state === 'resolving'
            ? lobby.dealerCards.map(c => { const p = parseCard(c); return { rank: p.rank, suit: p.suit }; })
            : lobby.dealerCards.length > 0
                ? [{ rank: parseCard(lobby.dealerCards[0]).rank, suit: parseCard(lobby.dealerCards[0]).suit }, { hidden: true }]
                : [],
        dealerValue: lobby.state === 'dealer_turn' || lobby.state === 'resolving'
            ? calculateHandValue(lobby.dealerCards)
            : getCardValue(lobby.dealerCards[0] || ''),
        currentPlayer: '',
        players: visiblePlayers.map(p => ({
            name:       safeName(p),
            chips:      p.chips,
            seat:       p.seat,
            bet:        p.bet,
            status:     p.status,
            handValue:  calculateHandValue(p.cards),
            cardCount:  p.cards.length,
        })),
    };
}

function updateLobbyUI(lobby) {
    const visibleCount = lobby.players.filter(p => !p._hasLeft).length;
    callToLobby(lobby, 'bjUpdateState', [getLobbyStateForUI(lobby)]);
    console.log(`[BLACKJACK] UI update: "${lobby.name}" stare: ${lobby.state}, jucători: ${visibleCount}/${LOBBY_CONFIG.MAX_PLAYERS}`);
    mp.events.call('_blackjack_updateMarker', lobby.id, lobby.state, visibleCount, LOBBY_CONFIG.MAX_PLAYERS);
}

// ──────────────────────────────────────────
// Events
// ──────────────────────────────────────────
mp.events.add('Server_ReceiveBlackjackAction', (player, actionName) => {
    console.log(`[BLACKJACK] ${player.name} -> ${actionName}`);
    processAction(player, actionName);
});

mp.events.add('Server_BlackjackPlaceBet', (player, amount) => {
    console.log(`[BLACKJACK] ${player.name} -> bet $${amount}`);
    placeBet(player, parseInt(amount) || LOBBY_CONFIG.MIN_BET);
});

mp.events.add('Server_JoinBlackjackTable', (player, tableIndex, tableName, casinoId) => {
    player.outputChatBox(`!{Green}[BLACKJACK] Încerci să te alături mesei "${tableName}"...`);
    joinLobby(player, tableIndex, tableName, casinoId);
});

mp.events.add('Server_LeaveBlackjackTable', (player) => {
    leaveLobby(player);
});

mp.events.add('playerQuit', (player) => {
    leaveLobby(player);
});

// ──────────────────────────────────────────
// Debug
// ──────────────────────────────────────────
function generateDebugString(lobby) {
    if (!lobby) return "No active blackjack lobby.";

    let s = `Lobby: ${lobby.name}\n`;
    s += `Stare: ${lobby.state}\n`;
    s += `Dealer: ${lobby.dealerCards.length > 0 ? lobby.dealerCards.join(' ') + ' = ' + calculateHandValue(lobby.dealerCards) : 'N/A'}\n\n`;
    s += `--- JUCATORI ---\n`;

    lobby.players.filter(p => !p._hasLeft).forEach(slot => {
        const isTurn = lobby.players[lobby.currentPlayerIndex] === slot;
        const turnMark = isTurn ? ' <- RANDUL LUI' : '';
        s += `Scaun ${slot.seat + 1} (${safeName(slot)}):${turnMark}\n`;
        s += `  Chips: $${slot.chips} | Bet: $${slot.bet}\n`;
        s += `  Carti: ${slot.cards.join(' ')} = ${calculateHandValue(slot.cards)}\n`;
        s += `  Status: ${slot.status}\n\n`;
    });

    return s;
}

module.exports = {
    LOBBY_CONFIG,
    joinLobby,
    leaveLobby,
    processAction,
    placeBet,
    lobbies,
    getLobbyByPlayer,
    generateDebugString,
    calculateHandValue,
    parseCard,
    CARD_VALUES,
};
