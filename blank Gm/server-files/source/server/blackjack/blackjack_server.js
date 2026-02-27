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

function broadcastToLobby(lobby, message) {
    lobby.players.forEach(slot => {
        if (!slot._hasLeft) slot.player.outputChatBox(message);
    });
}

function callToLobby(lobby, eventName, ...args) {
    lobby.players.forEach(slot => {
        if (!slot._hasLeft) slot.player.call(eventName, ...args);
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
        seat,
        chips: LOBBY_CONFIG.STARTING_CHIPS,
        cards: [],
        bet: 0,
        insuranceBet: 0,
        status: 'waiting',      // waiting | betting | playing | stand | bust | blackjack | win | lose | push
        hasDoubledDown: false,
        hasSplit: false,
        splitHand: null,        // Al doilea hand dacă split
        _hasLeft: false,
    });

    player.outputChatBox(`!{Orange}[BLACKJACK] Te-ai așezat la masă pe locul ${seat + 1}.`);
    broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{Cyan}${player.name} !{White}s-a alăturat (${lobby.players.length}/${LOBBY_CONFIG.MAX_PLAYERS})`);
    console.log(`[BLACKJACK] JOIN: ${player.name} la "${tableName}" (${lobby.players.length}/${LOBBY_CONFIG.MAX_PLAYERS}), seat ${seat}`);
    bjLog.onPlayerJoin(tableIndex, tableName, player.name, lobby.players.length, LOBBY_CONFIG.MAX_PLAYERS);

    player.call('openBlackjackUI');
    updateLobbyUI(lobby);

    if (lobby.players.length >= LOBBY_CONFIG.MIN_PLAYERS && lobby.state === 'waiting') {
        lobby.state = 'betting';
        startBettingPhase(lobby);
    }
}

function leaveLobby(player) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) return;

    const leavingIndex = lobby.players.findIndex(p => p.player === player);
    if (leavingIndex === -1) return;

    const wasPlaying = lobby.state === 'playing' || lobby.state === 'dealer_turn';
    console.log(`[BLACKJACK] LEAVE: ${player.name} părăsește "${lobby.name}" (wasPlaying: ${wasPlaying})`);
    bjLog.onPlayerLeave(lobby.id, lobby.name, player.name, wasPlaying ? 'mid-hand' : 'manual');

    player.call('closeBlackjackUI');
    player.outputChatBox('!{Orange}[BLACKJACK] !{White}Ai părăsit masa.');

    if (wasPlaying) {
        const slot = lobby.players[leavingIndex];
        slot.status = 'bust';
        slot._hasLeft = true;

        broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{Cyan}${player.name} !{White}a părăsit masa.`);

        const isCurrentPlayer = (leavingIndex === lobby.currentPlayerIndex);
        if (isCurrentPlayer) {
            nextPlayerTurn(lobby);
        }
        updateLobbyUI(lobby);
        return;
    }

    // Nu e în joc — scoatem normal
    const leavingSlot = lobby.players[leavingIndex];
    if (!player._isBot) {
        mp.events.call('blackjack:updatePlayerMoney', player, leavingSlot.chips);
    }

    lobby.players.splice(leavingIndex, 1);
    lobby.players.forEach((p, i) => { p.seat = i; });

    broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{Cyan}${player.name} !{White}a părăsit masa.`);

    if (lobby.players.length < LOBBY_CONFIG.MIN_PLAYERS) {
        if (lobby.startTimer) { clearInterval(lobby.startTimer); lobby.startTimer = null; }
        if (lobby.turnTimer)  { clearInterval(lobby.turnTimer);  lobby.turnTimer = null; }
        lobby.state = 'waiting';
        broadcastToLobby(lobby, '!{Red}[BLACKJACK] Nu mai sunt suficienți jucători.');

        const remaining = [...lobby.players];
        remaining.forEach(slot => {
            if (!slot.player._isBot) {
                mp.events.call('blackjack:updatePlayerMoney', slot.player, slot.chips);
            }
            slot.player.call('closeBlackjackUI');
            slot.player.outputChatBox('!{Orange}[BLACKJACK] !{White}Ai fost scos de la masă.');
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
        slot.hasSplit = false;
        slot.splitHand = null;
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
                    slot.player.outputChatBox(`!{Yellow}[BLACKJACK] Pariu automat: $${autoBet}`);
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

    const betAmount = Math.max(LOBBY_CONFIG.MIN_BET, Math.min(amount, LOBBY_CONFIG.MAX_BET, slot.chips));
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

    // Împarte cărțile: 2 la fiecare jucător, 2 la dealer (una face-down)
    lobby.players.forEach(slot => {
        if (!slot._hasLeft) {
            slot.cards = dealFromDeck(lobby, 2);
            slot.status = 'playing';
            console.log(`[BLACKJACK] DEAL: ${slot.player.name} → ${slot.cards.join(' ')} (bet: $${slot.bet})`);
            bjLog.onDealCards(lobby, slot.player.name, slot.cards);
        }
    });

    lobby.dealerCards = dealFromDeck(lobby, 2);
    console.log(`[BLACKJACK] DEALER: ${lobby.dealerCards[0]} [hidden]`);
    bjLog.onDealerCards(lobby, lobby.dealerCards);

    // Trimite cărțile la toți jucătorii
    lobby.players.forEach(slot => {
        if (!slot._hasLeft) {
            const [c1, c2] = slot.cards;
            const p1 = parseCard(c1);
            const p2 = parseCard(c2);
            slot.player.call('bjDealCards', [p1.rank, p1.suit, p2.rank, p2.suit]);

            // Dealer — doar prima carte vizibilă
            const dc = parseCard(lobby.dealerCards[0]);
            slot.player.call('bjDealerCard', [dc.rank, dc.suit, true]); // true = are carte ascunsă
        }
    });

    // Verifică blackjack natural
    lobby.players.forEach(slot => {
        if (!slot._hasLeft && isBlackjack(slot.cards)) {
            slot.status = 'blackjack';
            broadcastToLobby(lobby, `!{Yellow}[BLACKJACK] !{Cyan}${slot.player.name} !{White}are !{Gold}BLACKJACK!`);
        }
    });

    updateLobbyUI(lobby);

    // Începe tururile jucătorilor
    lobby.currentPlayerIndex = 0;
    startPlayerTurn(lobby);
}

function startPlayerTurn(lobby) {
    // Sari peste jucătorii care au stand, bust, blackjack sau au plecat
    let safetyCounter = 0;
    while (
        lobby.currentPlayerIndex < lobby.players.length &&
        safetyCounter < lobby.players.length
    ) {
        const slot = lobby.players[lobby.currentPlayerIndex];
        if (!slot._hasLeft && slot.status === 'playing') break;
        lobby.currentPlayerIndex++;
        safetyCounter++;
    }

    if (lobby.currentPlayerIndex >= lobby.players.length) {
        dealerTurn(lobby);
        return;
    }

    const currentSlot = lobby.players[lobby.currentPlayerIndex];
    const handValue = calculateHandValue(currentSlot.cards);

    lobby.turnTimeLeft = LOBBY_CONFIG.TURN_TIME;
    console.log(`[BLACKJACK] TURN: ${currentSlot.player.name} | cards: ${currentSlot.cards.join(' ')} = ${handValue} | chips: $${currentSlot.chips}`);

    broadcastToLobby(lobby,
        `!{Orange}[BLACKJACK] !{White}Rândul lui !{Cyan}${currentSlot.player.name} !{White}| Mâna: ${handValue}`
    );

    // Determină acțiunile disponibile
    const canDoubleDown = currentSlot.cards.length === 2 && currentSlot.chips >= currentSlot.bet;
    const canSplit = currentSlot.cards.length === 2 &&
        parseCard(currentSlot.cards[0]).rank === parseCard(currentSlot.cards[1]).rank &&
        currentSlot.chips >= currentSlot.bet &&
        !currentSlot.hasSplit;

    callToLobby(lobby, 'bjUpdateState', [getLobbyStateForUI(lobby)]);
    currentSlot.player.call('bjYourTurn', [handValue, canDoubleDown, canSplit]);

    if (lobby.turnTimer) clearInterval(lobby.turnTimer);

    lobby.turnTimer = setInterval(() => {
        lobby.turnTimeLeft--;
        callToLobby(lobby, 'bjTurnTimer', [currentSlot.player.name, lobby.turnTimeLeft]);

        if (lobby.turnTimeLeft <= 0) {
            clearInterval(lobby.turnTimer);
            lobby.turnTimer = null;
            // Auto-stand la timeout
            currentSlot.status = 'stand';
            broadcastToLobby(lobby, `!{Red}[BLACKJACK] ${currentSlot.player.name} a picat timpul — Stand automat!`);
            bjLog.onTimeout(lobby, currentSlot.player.name, 'stand');
            nextPlayerTurn(lobby);
        }
    }, 1000);
}

function nextPlayerTurn(lobby) {
    if (lobby.turnTimer) {
        clearInterval(lobby.turnTimer);
        lobby.turnTimer = null;
    }

    lobby.currentPlayerIndex++;
    startPlayerTurn(lobby);
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

    const currentSlot = lobby.players[lobby.currentPlayerIndex];
    if (!currentSlot || currentSlot.player !== player) {
        player.outputChatBox('!{Red}Nu este rândul tău!');
        return;
    }

    const slot = getPlayerSlot(lobby, player);
    console.log(`[BLACKJACK] ACTION: ${player.name} → ${action} | cards: ${slot.cards.join(' ')} = ${calculateHandValue(slot.cards)} | chips: $${slot.chips}`);

    switch (action) {
        case 'hit': {
            const newCard = dealFromDeck(lobby, 1)[0];
            slot.cards.push(newCard);
            const handValue = calculateHandValue(slot.cards);
            const pc = parseCard(newCard);

            broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{Cyan}${player.name} !{White}a tras o carte: !{Yellow}${newCard} !{White}(Total: ${handValue})`);
            bjLog.onPlayerAction(lobby, player.name, 'hit', slot.cards, handValue);

            callToLobby(lobby, 'bjHitCard', [player.name, pc.rank, pc.suit, handValue]);

            if (handValue > 21) {
                slot.status = 'bust';
                broadcastToLobby(lobby, `!{Red}[BLACKJACK] !{Cyan}${player.name} !{White}a dat BUST! (${handValue})`);
                bjLog.onPlayerAction(lobby, player.name, 'bust', slot.cards, handValue);
                nextPlayerTurn(lobby);
            } else if (handValue === 21) {
                slot.status = 'stand';
                broadcastToLobby(lobby, `!{Green}[BLACKJACK] !{Cyan}${player.name} !{White}are 21!`);
                nextPlayerTurn(lobby);
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
            nextPlayerTurn(lobby);
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

            callToLobby(lobby, 'bjHitCard', [player.name, pc.rank, pc.suit, handValue]);

            if (handValue > 21) {
                slot.status = 'bust';
                broadcastToLobby(lobby, `!{Red}[BLACKJACK] !{Cyan}${player.name} !{White}a dat BUST! (${handValue})`);
            } else {
                slot.status = 'stand';
            }
            nextPlayerTurn(lobby);
            break;
        }

        case 'split': {
            if (slot.cards.length !== 2) {
                player.outputChatBox('!{Red}Nu poți da Split acum!');
                return;
            }
            const r1 = parseCard(slot.cards[0]).rank;
            const r2 = parseCard(slot.cards[1]).rank;
            if (r1 !== r2) {
                player.outputChatBox('!{Red}Cărțile nu sunt egale — nu poți da Split!');
                return;
            }
            if (slot.chips < slot.bet) {
                player.outputChatBox('!{Red}Nu ai suficienți chips pentru Split!');
                return;
            }

            // Creează al doilea hand
            slot.chips -= slot.bet;
            slot.hasSplit = true;
            slot.splitHand = {
                cards: [slot.cards.pop()],
                bet: slot.bet,
                status: 'playing',
            };

            // Adaugă o carte la fiecare hand
            const card1 = dealFromDeck(lobby, 1)[0];
            const card2 = dealFromDeck(lobby, 1)[0];
            slot.cards.push(card1);
            slot.splitHand.cards.push(card2);

            broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{Cyan}${player.name} !{White}a dat !{Pink}Split!{White}!`);
            bjLog.onPlayerAction(lobby, player.name, 'split', slot.cards, calculateHandValue(slot.cards));

            // Continuă cu primul hand
            const handValue = calculateHandValue(slot.cards);
            const canDD = slot.chips >= slot.bet;
            slot.player.call('bjYourTurn', [handValue, canDD, false]);
            callToLobby(lobby, 'bjUpdateState', [getLobbyStateForUI(lobby)]);
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

        if (dealerValue >= 17) {
            // Dealer stă
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

        // Split hand
        let splitOutcome = null;
        let splitPayout = 0;
        if (slot.splitHand) {
            const splitValue = calculateHandValue(slot.splitHand.cards);
            const splitBust = splitValue > 21;

            if (splitBust) {
                splitOutcome = 'lose';
                splitPayout = 0;
            } else if (dealerBust) {
                splitOutcome = 'win';
                splitPayout = slot.splitHand.bet * 2;
            } else if (splitValue > dealerValue) {
                splitOutcome = 'win';
                splitPayout = slot.splitHand.bet * 2;
            } else if (splitValue === dealerValue) {
                splitOutcome = 'push';
                splitPayout = slot.splitHand.bet;
            } else {
                splitOutcome = 'lose';
                splitPayout = 0;
            }

            slot.chips += splitPayout;
        }

        const resultStr = outcomeLabel(outcome);
        const payoutStr = payout > 0 ? `+$${payout}` : '-$' + slot.bet;

        results.push({
            name: slot.player.name,
            cards: [...slot.cards],
            value: playerValue,
            outcome,
            payout,
            bet: slot.bet,
            splitOutcome,
            splitPayout,
        });

        console.log(`[BLACKJACK] RESULT: ${slot.player.name} → ${slot.cards.join(' ')} = ${playerValue} → ${outcome} (bet: $${slot.bet}, payout: $${payout})`);
        bjLog.onPlayerResult(lobby, slot.player.name, outcome, slot.cards, playerValue, slot.bet, payout);

        if (outcome === 'blackjack') {
            broadcastToLobby(lobby, `!{Gold}[BLACKJACK] !{Cyan}${slot.player.name} !{White}— !{Gold}BLACKJACK! !{Green}+$${payout}`);
        } else if (outcome === 'win') {
            broadcastToLobby(lobby, `!{Green}[BLACKJACK] !{Cyan}${slot.player.name} !{White}— !{Green}CÂȘTIGĂ! +$${payout}`);
        } else if (outcome === 'push') {
            broadcastToLobby(lobby, `!{Yellow}[BLACKJACK] !{Cyan}${slot.player.name} !{White}— !{Yellow}PUSH (egal). Banii înapoi.`);
        } else {
            broadcastToLobby(lobby, `!{Red}[BLACKJACK] !{Cyan}${slot.player.name} !{White}— !{Red}PIERDE -$${slot.bet}`);
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

    // Update bani
    lobby.players.forEach(slot => {
        if (!slot.player._isBot) {
            mp.events.call('blackjack:updatePlayerMoney', slot.player, slot.chips);
            console.log(`[BLACKJACK] MONEY_UPDATE: ${slot.player.name} → $${slot.chips}`);
        }
    });

    // Curăță jucătorii care au plecat sau nu mai au chips
    const leftPlayers = lobby.players.filter(p => p._hasLeft);
    const eliminated = lobby.players.filter(p => p.chips <= 0 && !p._hasLeft);

    eliminated.forEach(slot => {
        slot.player.outputChatBox('!{Red}[BLACKJACK] Nu mai ai chips! Ai fost eliminat.');
        slot.player.call('closeBlackjackUI');
        broadcastToLobby(lobby, `!{Red}[BLACKJACK] ${slot.player.name} a fost eliminat (0 chips).`);
    });

    lobby.players = lobby.players.filter(p => p.chips > 0 && !p._hasLeft);
    lobby.players.forEach((p, i) => { p.seat = i; });

    updateLobbyUI(lobby);

    console.log(`[BLACKJACK] POST_ROUND: ${lobby.players.length} jucători rămași`);

    if (lobby.players.length >= LOBBY_CONFIG.MIN_PLAYERS) {
        broadcastToLobby(lobby, `!{Orange}[BLACKJACK] !{White}Runda nouă în ${LOBBY_CONFIG.END_DELAY} secunde...`);
        setTimeout(() => {
            if (lobby.players.length >= LOBBY_CONFIG.MIN_PLAYERS) {
                startBettingPhase(lobby);
            } else {
                lobby.state = 'waiting';
                broadcastToLobby(lobby, '!{Red}[BLACKJACK] Nu sunt suficienți jucători.');
            }
        }, LOBBY_CONFIG.END_DELAY * 1000);
    } else {
        lobby.state = 'waiting';
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
        currentPlayer: lobby.players[lobby.currentPlayerIndex]?.player?.name || '',
        players: visiblePlayers.map(p => ({
            name:       p.player.name,
            chips:      p.chips,
            seat:       p.seat,
            bet:        p.bet,
            status:     p.status,
            handValue:  calculateHandValue(p.cards),
            cardCount:  p.cards.length,
            hasSplit:   p.hasSplit,
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
        s += `Scaun ${slot.seat + 1} (${slot.player.name}):${turnMark}\n`;
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
