const pokerLog = require('./poker_logger');

const LOBBY_CONFIG = {
    TEST_SERVER: false, // true = creează automat 10 mese cu 10 boți la start
    MAX_PLAYERS: 10,
    MIN_PLAYERS: 2,
    TURN_TIME: 30,
    START_DELAY: 5,
    END_DELAY: 10,
    SMALL_BLIND: 50,
    BIG_BLIND: 100,
    HOUSE_CUT_PERCENT: 2, // Procentul cazinoului din câștiguri (rake)
};

function createLobby(tableIndex, tableName, casinoId) {
    return {
        id: tableIndex,
        name: tableName,
        casinoId: casinoId || null, // ID-ul cazinoului (null = fără cazinou)
        state: 'waiting',
        players: [],
        pot: 0,
        communityCards: [],
        currentPlayerIndex: 0,
        dealerIndex: 0,
        round: 'preflop',
        currentBet: 0,
        startTimer: null,
        turnTimer: null,
        turnTimeLeft: 0,
        deck: [],
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
        if (!slot._hasLeft) global.chatSend(slot.player, message);
    });
}

function callToLobby(lobby, eventName, ...args) {
    lobby.players.forEach(slot => {
        if (!slot._hasLeft) slot.player.call(eventName, ...args);
    });
}

function joinLobby(player, tableIndex, tableName, casinoId) {
    if (getLobbyByPlayer(player)) {
        global.chatSend(player, '!{Red}Ești deja la o masă de poker!');
        return;
    }

    if (!lobbies[tableIndex]) {
        lobbies[tableIndex] = createLobby(tableIndex, tableName, casinoId);
    }

    const lobby = lobbies[tableIndex];

    if (lobby.state === 'playing') {
        global.chatSend(player, '!{Red}Partida e în desfășurare. Așteaptă runda următoare!');
        return;
    }

    if (lobby.players.length >= LOBBY_CONFIG.MAX_PLAYERS) {
        global.chatSend(player, '!{Red}Masa este plină!');
        return;
    }

    // Găsește cel mai mic seat liber
    const usedSeats = new Set(lobby.players.map(p => p.seat));
    let seat = 0;
    while (usedSeats.has(seat)) seat++;

    lobby.players.push({
        player,
        seat,
        chips: player.money || 10000,
        cards: [],
        currentBet: 0,
        hasFolded: false,
        hasActed: false,
        totalContributed: 0,
    });

    global.chatSend(player, `!{Orange}[POKER] Te-ai așezat la masa pe locul ${seat + 1}.`);
    broadcastToLobby(lobby, `!{Orange}[POKER] !{Cyan}${player.name} !{White}s-a alăturat (${lobby.players.length}/${LOBBY_CONFIG.MAX_PLAYERS})`);
    //(`[POKER] JOIN: ${player.name} s-a alăturat lobby "${tableName}" (${lobby.players.length}/${LOBBY_CONFIG.MAX_PLAYERS}), seat ${seat}`);
    pokerLog.onPlayerJoin(tableIndex, tableName, player.name, lobby.players.length, LOBBY_CONFIG.MAX_PLAYERS);

    
    player.call('openPokerUI');
    updateLobbyUI(lobby);
    callToLobby(lobby, 'pokerUpdateState', [getLobbyStateForUI(lobby)]);
    
    if (lobby.players.length >= LOBBY_CONFIG.MIN_PLAYERS && lobby.state === 'waiting') {
        lobby.state = 'starting';
        startCountdown(lobby);
    }
}

function leaveLobby(player) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) return;

    const wasPlaying = lobby.state === 'playing';
    const leavingIndex = lobby.players.findIndex(p => p.player === player);
    if (leavingIndex === -1) return;
    console.log(`[POKER] LEAVE: ${player.name} părăsește lobby "${lobby.name}" (wasPlaying: ${wasPlaying}, index: ${leavingIndex})`);
    pokerLog.onPlayerLeave(lobby.id, lobby.name, player.name, wasPlaying ? 'mid-hand' : 'manual');

    player.call('closePokerUI');
    global.chatSend(player, '!{Orange}[POKER] !{White}Ai părăsit masa.');

    if (wasPlaying) {
        // Mid-hand: NU scoatem din array — păstrăm pentru calculul corect al side pots
        const slot = lobby.players[leavingIndex];
        slot.hasFolded = true;
        slot.hasActed = true;
        slot._hasLeft = true;

        broadcastToLobby(lobby, `!{Orange}[POKER] !{Cyan}${player.name} !{White}a părăsit masa.`);
        console.log(`[POKER] LEAVE_MID_HAND: ${player.name} marcat ca folded+left (rămâne în array pentru pot)`);

        const isCurrentPlayer = (leavingIndex === lobby.currentPlayerIndex);

        if (isCurrentPlayer) {
            nextTurn(lobby);
        } else {
            const activePlayers = lobby.players.filter(p => !p.hasFolded);
            if (activePlayers.length === 1) {
                if (lobby.turnTimer) { clearInterval(lobby.turnTimer); lobby.turnTimer = null; }
                endRound(lobby, activePlayers[0]);
            }
        }
        updateLobbyUI(lobby);
        return;
    }

    // Nu e în joc — scoatem normal
    const leavingSlot = lobby.players[leavingIndex];
    if (!player._isBot) {
        mp.events.call('poker:updatePlayerMoney', player, leavingSlot.chips);
        console.log(`[POKER] MONEY_UPDATE (leave): ${player.name} → $${leavingSlot.chips}`);
    }

    lobby.players.splice(leavingIndex, 1);
    lobby.players.forEach((p, i) => { p.seat = i; });

    broadcastToLobby(lobby, `!{Orange}[POKER] !{Cyan}${player.name} !{White}a părăsit masa.`);

    if (lobby.players.length < LOBBY_CONFIG.MIN_PLAYERS) {
        if (lobby.startTimer) { clearInterval(lobby.startTimer); lobby.startTimer = null; }
        if (lobby.turnTimer)  { clearInterval(lobby.turnTimer);  lobby.turnTimer  = null; }
        lobby.state = 'waiting';
        broadcastToLobby(lobby, '!{Red}[POKER] Nu mai sunt suficienți jucători. Jocul s-a oprit.');

        const remaining = [...lobby.players];
        remaining.forEach(slot => {
            if (!slot.player._isBot) {
                mp.events.call('poker:updatePlayerMoney', slot.player, slot.chips);
                console.log(`[POKER] MONEY_UPDATE (disband): ${slot.player.name} → $${slot.chips}`);
            }
            slot.player.call('closePokerUI');
            global.chatSend(slot.player, '!{Orange}[POKER] !{White}Ai fost scos de la masă — nu sunt suficienți jucători.');
        });
        lobby.players = [];
    }

    if (lobby.dealerIndex >= lobby.players.length) {
        lobby.dealerIndex = 0;
    }

    updateLobbyUI(lobby);
}

function startCountdown(lobby) {
    let secondsLeft = LOBBY_CONFIG.START_DELAY;
    console.log(`[POKER] COUNTDOWN: Lobby "${lobby.name}" — pornește numărătoarea (${secondsLeft}s), ${lobby.players.length} jucători`);
    broadcastToLobby(lobby, `!{Orange}[POKER] !{White}Jocul începe în ${secondsLeft} secunde!`);

    lobby.startTimer = setInterval(() => {
        secondsLeft--;
        //callToLobby(lobby, 'pokerLobbyCountdown', secondsLeft);

        if (secondsLeft <= 0) {
            clearInterval(lobby.startTimer);
            lobby.startTimer = null;
            startGame(lobby);
        } else if (secondsLeft <= 3) {
            broadcastToLobby(lobby, `!{Orange}[POKER] !{White}${secondsLeft}...`);
        }
    }, 1000);
}



function createShuffledDeck() {
    const suits  = ['s', 'h', 'd', 'c'];
    const values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const deck   = [];
    for (const s of suits) for (const v of values) deck.push(`${v}${s}`);
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function dealFromDeck(lobby, count) {
    if (lobby.deck.length < count) {
        console.error(`[POKER] BUG: Deck epuizat! Rămase: ${lobby.deck.length}, cerute: ${count}. Lobby: "${lobby.name}"`);
        const remaining = lobby.deck.splice(0, lobby.deck.length);
        return remaining;
    }
    return lobby.deck.splice(0, count);
}

function validateNoDuplicateCards(lobby) {
    const allCards = [];

    // Colectează toate cărțile jucătorilor
    lobby.players.forEach(slot => {
        slot.cards.forEach(c => allCards.push({ card: c, source: `player ${slot.player.name}` }));
    });

    // Colectează cărțile din community
    lobby.communityCards.forEach(c => allCards.push({ card: c, source: 'community' }));

    // Verifică duplicate
    const seen = {};
    let hasDuplicates = false;
    allCards.forEach(({ card, source }) => {
        if (seen[card]) {
            console.error(`[POKER] BUG DUPLICATE: "${card}" apare la ${seen[card]} ȘI la ${source}! Lobby: "${lobby.name}"`);
            hasDuplicates = true;
        } else {
            seen[card] = source;
        }
    });

    if (hasDuplicates) {
        console.error(`[POKER] DECK CORRUPTION DETECTED! Alle dealt cards: ${allCards.map(c => `${c.card}(${c.source})`).join(', ')}`);
        console.error(`[POKER] Deck remaining: ${lobby.deck.length} cards`);
    }

    return !hasDuplicates;
}

function parseCard(cardStr) {
    const suit = cardStr.slice(-1);
    const rank = cardStr.slice(0, -1);
    return { rank, suit };
}

function startGame(lobby) {
    lobby.state = 'playing';
    lobby.pot = 0;
    lobby.communityCards = [];
    lobby.currentBet = 0;
    lobby.round = 'preflop';

    lobby.deck = createShuffledDeck();

    lobby.players.forEach(slot => {
        slot.cards             = dealFromDeck(lobby, 2);
        slot.currentBet        = 0;
        slot.hasFolded         = false;
        slot.hasActed          = false;
        slot.lastAction        = null;
        slot.totalContributed  = 0;
    });

    // Validare: verifică dacă există cărți duplicate după dealing
    validateNoDuplicateCards(lobby);

    console.log(`[POKER] ====== START GAME ====== Lobby "${lobby.name}", ${lobby.players.length} jucători, dealer index: ${lobby.dealerIndex}`);
    pokerLog.onGameStart(lobby);

    // Heads-up: dealer=SB, celalalt=BB. 3+ jucători: SB=dealer+1, BB=dealer+2
    let sbIndex, bbIndex;
    if (lobby.players.length === 2) {
        sbIndex = lobby.dealerIndex;
        bbIndex = (lobby.dealerIndex + 1) % lobby.players.length;
    } else {
        sbIndex = (lobby.dealerIndex + 1) % lobby.players.length;
        bbIndex = (lobby.dealerIndex + 2) % lobby.players.length;
    }
    const sbSlot  = lobby.players[sbIndex];
    const bbSlot  = lobby.players[bbIndex];

    // Blind-uri — dacă nu are destui chips, pune cât poate (all-in forced)
    const sbAmount = Math.min(LOBBY_CONFIG.SMALL_BLIND, sbSlot.chips);
    sbSlot.chips -= sbAmount;
    sbSlot.currentBet = sbAmount;
    sbSlot.totalContributed += sbAmount;
    lobby.pot += sbAmount;

    const bbAmount = Math.min(LOBBY_CONFIG.BIG_BLIND, bbSlot.chips);
    bbSlot.chips -= bbAmount;
    bbSlot.currentBet = bbAmount;
    bbSlot.totalContributed += bbAmount;
    lobby.pot += bbAmount;
    lobby.currentBet = bbAmount;

    console.log(`[POKER] BLINDS: SB=${sbSlot.player.name} ($${sbAmount}), BB=${bbSlot.player.name} ($${bbAmount}), pot=$${lobby.pot}`);
    pokerLog.onBlinds(lobby, sbSlot.player.name, sbAmount, bbSlot.player.name, bbAmount);

    broadcastToLobby(lobby, `!{Green}====== Incepe runda ======`);

    lobby.players.forEach(slot => {
        const [c1, c2] = slot.cards;
        const { rank: r1, suit: s1 } = parseCard(c1);
        const { rank: r2, suit: s2 } = parseCard(c2);
        slot.player.call('pokerDealCards', [r1, s1, r2, s2]);
        console.log(`[POKER] DEAL: ${slot.player.name} → ${c1} ${c2} (chips: $${slot.chips})`);
        pokerLog.onDealCards(lobby, slot.player.name, [c1, c2]);
    });

    updateLobbyUI(lobby);
    

    lobby.currentPlayerIndex = (bbIndex + 1) % lobby.players.length;
    startTurn(lobby);
    mp.events.call('_poker_afterTurn', lobby);
}

function startTurn(lobby) {
    // Sari peste jucătorii folded SAU all-in (chips === 0)
    let safetyCounter = 0;
    while (
        (lobby.players[lobby.currentPlayerIndex]?.hasFolded ||
         lobby.players[lobby.currentPlayerIndex]?.chips === 0) &&
        safetyCounter < lobby.players.length
    ) {
        lobby.currentPlayerIndex = (lobby.currentPlayerIndex + 1) % lobby.players.length;
        safetyCounter++;
    }

    const currentSlot = lobby.players[lobby.currentPlayerIndex];
    if (!currentSlot || currentSlot.hasFolded) return;

    // Dacă jucătorul curent e all-in (chips=0), nu porni timer — treci direct la nextTurn
    if (currentSlot.chips === 0) {
        nextTurn(lobby);
        return;
    }

    lobby.turnTimeLeft = LOBBY_CONFIG.TURN_TIME;
    console.log(`[POKER] TURN: ${currentSlot.player.name} (index ${lobby.currentPlayerIndex}) | round: ${lobby.round} | pot: $${lobby.pot} | currentBet: $${lobby.currentBet} | chips: $${currentSlot.chips} | playerBet: $${currentSlot.currentBet}`);

    broadcastToLobby(lobby,
        `!{Orange}[POKER] !{White}Rândul lui !{Cyan}${currentSlot.player.name} !{White}| Pot: !{Green}$${lobby.pot}`
    );

    callToLobby(lobby, 'pokerUpdateState', [getLobbyStateForUI(lobby)]);
    currentSlot.player.call('pokerYourTurn', [lobby.currentBet, currentSlot.currentBet, currentSlot.chips]);

    if (lobby.turnTimer) clearInterval(lobby.turnTimer);

    lobby.turnTimer = setInterval(() => {
        lobby.turnTimeLeft--;
        callToLobby(lobby, 'pokerTurnTimer', [currentSlot.player.name, lobby.turnTimeLeft]);

        if (lobby.turnTimeLeft <= 0) {
            clearInterval(lobby.turnTimer);
            const canCheck = lobby.currentBet <= currentSlot.currentBet;
            if (canCheck) {
                // Auto-check — nu pierzi chips-urile deja investite
                currentSlot.hasActed   = true;
                currentSlot.lastAction = 'check';
                broadcastToLobby(lobby, `!{Red}[POKER] ${currentSlot.player.name} a picat timpul — Check automat!`);
                console.log(`[POKER] ACTION: ${currentSlot.player.name} → check (timeout) | chips=$${currentSlot.chips}, bet=$${currentSlot.currentBet}, lobbyBet=$${lobby.currentBet}, pot=$${lobby.pot}`);
                pokerLog.onTimeout(lobby, currentSlot.player.name, 'check');
            } else {
                // Auto-fold — trebuie să pună bani, deci fold
                currentSlot.hasFolded  = true;
                currentSlot.hasActed   = true;
                currentSlot.lastAction = 'fold';
                broadcastToLobby(lobby, `!{Red}[POKER] ${currentSlot.player.name} a picat timpul — Fold automat!`);
                console.log(`[POKER] ACTION: ${currentSlot.player.name} → fold (timeout) | chips=$${currentSlot.chips}, bet=$${currentSlot.currentBet}, lobbyBet=$${lobby.currentBet}, pot=$${lobby.pot}`);
                pokerLog.onTimeout(lobby, currentSlot.player.name, 'fold');
            }
            nextTurn(lobby);
        }
    }, 1000);
}

function nextTurn(lobby) {
    if (lobby.turnTimer) {
        clearInterval(lobby.turnTimer);
        lobby.turnTimer = null;
    }
    const activePlayers = lobby.players.filter(p => !p.hasFolded);
    console.log(`[POKER] NEXT_TURN: activi=${activePlayers.length}, pot=$${lobby.pot}, currentBet=$${lobby.currentBet}`);
    const playerStatus = lobby.players.map(p => `${p.player.name}(fold:${p.hasFolded},acted:${p.hasActed},bet:$${p.currentBet},chips:$${p.chips})`);
    console.log(`[POKER] PLAYERS: ${playerStatus.join(' | ')}`);

    if (activePlayers.length === 1) {
        endRound(lobby, activePlayers[0]);
        return;
    }

    const allActed = lobby.players.every(
        p => p.hasFolded || p.chips === 0 || (p.hasActed && p.currentBet === lobby.currentBet)
    );
    if (allActed) {
        nextRound(lobby);
        return;
    }

    lobby.currentPlayerIndex = (lobby.currentPlayerIndex + 1) % lobby.players.length;
    startTurn(lobby);
    mp.events.call('_poker_afterTurn', lobby);
}

const ROUND_ORDER = ['preflop', 'flop', 'turn', 'river'];

function nextRound(lobby) {
    // Reset bets for new betting round
    lobby.currentBet = 0;
    lobby.players.forEach(p => {
        p.currentBet = 0;
        p.hasActed   = false;
    });

    // Fast-forward: dacă max 1 jucător mai poate acționa, deal remaining cards + showdown
    const activeNonFolded = lobby.players.filter(p => !p.hasFolded);
    const canActPlayers = activeNonFolded.filter(p => p.chips > 0);
    if (canActPlayers.length <= 1 && activeNonFolded.length >= 2) {
        if (lobby.communityCards.length === 0) {
            lobby.communityCards = dealFromDeck(lobby, 3);
        }
        while (lobby.communityCards.length < 5) {
            lobby.communityCards.push(...dealFromDeck(lobby, 1));
        }
        lobby.round = 'river';
        validateNoDuplicateCards(lobby);
        console.log(`[POKER] FAST_FORWARD: All-in → Community: [${lobby.communityCards.join(', ')}] | Pot: $${lobby.pot}`);
        pokerLog.onNewRound(lobby, 'river (fast-forward)', lobby.communityCards);
        callToLobby(lobby, 'pokerUpdateState', [getLobbyStateForUI(lobby)]);
        showdown(lobby);
        return;
    }

    const currentRoundIdx = ROUND_ORDER.indexOf(lobby.round);
    if (currentRoundIdx >= ROUND_ORDER.length - 1) {
        console.log(`[POKER] NEXT_ROUND: river terminat → SHOWDOWN`);
        showdown(lobby);
        return;
    }

    lobby.round = ROUND_ORDER[currentRoundIdx + 1];

    if (lobby.round === 'flop') {
        lobby.communityCards = dealFromDeck(lobby, 3);
    } else {
        lobby.communityCards.push(...dealFromDeck(lobby, 1));
    }
    validateNoDuplicateCards(lobby);
    console.log(`[POKER] NEXT_ROUND: → ${lobby.round.toUpperCase()} | Community: [${lobby.communityCards.join(', ')}] | Pot: $${lobby.pot}`);
    pokerLog.onNewRound(lobby, lobby.round, lobby.communityCards);

    callToLobby(lobby, 'pokerUpdateState', [getLobbyStateForUI(lobby)]);

    lobby.currentPlayerIndex = (lobby.dealerIndex + 1) % lobby.players.length;
    startTurn(lobby);

    // pentru boti
    mp.events.call('_poker_afterTurn', lobby);
}

function processAction(player, action, raiseAmount = 0) {
    const lobby = getLobbyByPlayer(player);

    if (!lobby || lobby.state !== 'playing') {
        global.chatSend(player, '!{Red}Nu ești într-un joc activ.');
        return;
    }

    const currentSlot = lobby.players[lobby.currentPlayerIndex];
    if (!currentSlot || currentSlot.player !== player) {
        global.chatSend(player, '!{Red}Nu este rândul tău!');
        return;
    }

    const slot = getPlayerSlot(lobby, player);
    console.log(`[POKER] ACTION: ${player.name} → ${action}${action === 'raise' ? ` (amount: ${raiseAmount})` : ''} | chips=$${slot.chips}, bet=$${slot.currentBet}, lobbyBet=$${lobby.currentBet}, pot=$${lobby.pot}`);

    const _preActionChips = slot.chips;
    const _preActionPot   = lobby.pot;

    switch (action) {
        case 'fold':
            slot.hasFolded  = true;
            slot.hasActed   = true;
            slot.lastAction = 'fold';
            broadcastToLobby(lobby, `!{Orange}[POKER] !{Cyan}${player.name} !{White}a dat !{Red}Fold!{White}.`);
            break;

        case 'check':
            if (lobby.currentBet > slot.currentBet) {
                global.chatSend(player, '!{Red}Nu poți da Check — există un bet activ!');
                return;
            }
            slot.hasActed   = true;
            slot.lastAction = 'check';
            broadcastToLobby(lobby, `!{Orange}[POKER] !{Cyan}${player.name} !{White}a dat !{Yellow}Check!{White}.`);
            break;

        case 'call': {
            const toCall = lobby.currentBet - slot.currentBet;
            if (toCall < 0) {
                global.chatSend(player, '!{Red}Nu ai ce să call-uiești.');
                return;
            }
            if(toCall == 0)
            {
                slot.hasActed   = true;
                slot.lastAction = 'check';
                broadcastToLobby(lobby, 
                    `!{Orange}[POKER] !{Cyan}${player.name} !{White}a dat !{Yellow}Check!{White}.`
                );
                break;
            }
            const actualCall = Math.min(toCall, slot.chips);
            slot.chips            -= actualCall;
            slot.currentBet       += actualCall;
            slot.totalContributed += actualCall;
            lobby.pot             += actualCall;
            slot.hasActed          = true;
            
            if (actualCall < toCall && slot.chips === 0) {
                // All-in call (nu avea destule chipuri)
                slot.lastAction = 'allin';
                broadcastToLobby(lobby, 
                    `!{Orange}[POKER] !{Cyan}${player.name} !{White}a dat !{Pink}ALL-IN!{White} cu !{90EE90}$${actualCall}!{White}.`
                );
            } else {
                slot.lastAction = 'call';
                broadcastToLobby(lobby, 
                    `!{Orange}[POKER] !{Cyan}${player.name} !{White}a dat !{Yellow}Call!{White} (!{Green}$${actualCall}!{White}). (!{Green}$${slot.chips} ramasi)`
                );
            }
            break;
        }

        case 'raise': {
            // raiseAmount = INCREMENT trimis de client (cât vrea să adauge peste currentBet)
            const minRaiseIncrement = LOBBY_CONFIG.BIG_BLIND;
            let raiseIncrement = raiseAmount >= minRaiseIncrement ? raiseAmount : minRaiseIncrement;

            // Calculează maximul pe care și-l permite (chips rămase după call)
            const maxAfford = slot.chips - (lobby.currentBet - slot.currentBet);
            if (maxAfford <= 0) {
                // Nu poate raise → convertim automat în all-in dacă are chips
                if (slot.chips > 0) {
                    processAction(player, 'allin');
                } else {
                    slot.hasActed = true;
                    slot.lastAction = 'check';
                    updateLobbyUI(lobby);
                    nextTurn(lobby);
                }
                return;
            }

            // Cap raise la maximul affordable
            if (raiseIncrement > maxAfford) {
                raiseIncrement = maxAfford;
            }

            // Dacă nu-și permite nici minimul de raise → all-in automat
            if (raiseIncrement < minRaiseIncrement && maxAfford < minRaiseIncrement) {
                processAction(player, 'allin');
                return;
            }

            const newBet = lobby.currentBet + raiseIncrement;
            const toAdd           = newBet - slot.currentBet;
            slot.chips           -= toAdd;
            lobby.pot            += toAdd;
            slot.totalContributed += toAdd;
            slot.currentBet       = newBet;
            lobby.currentBet = newBet;
            slot.hasActed    = true;
            slot.lastAction  = 'raise';
            lobby.players.forEach(p => { if (p !== slot && !p.hasFolded && p.chips > 0) p.hasActed = false; });
            broadcastToLobby(lobby, 
                `!{Orange}[POKER] !{Cyan}${player.name} !{White}a dat !{Yellow}Raise!{White} +!{Green}$${raiseIncrement}!{White} (Bet: !{Green}$${newBet}!{White}). Pot: !{Green}$${lobby.pot}`
            );
            break;
        }

        case 'allin': {
            const allInAmount      = slot.chips + slot.currentBet;
            slot.totalContributed += slot.chips;
            lobby.pot             += slot.chips;
            slot.currentBet       += slot.chips;
            slot.chips             = 0;
            if (slot.currentBet > lobby.currentBet) {
                lobby.currentBet = slot.currentBet;
                lobby.players.forEach(p => { if (p !== slot && !p.hasFolded && p.chips > 0) p.hasActed = false; });
            }
            slot.hasActed = true;
            slot.lastAction = 'allin';
            broadcastToLobby(lobby, 
                `!{Orange}[POKER] !{Cyan}${player.name} !{White}este !{Pink}ALL-IN!{White} (!{Green}$${allInAmount}!{White})! Pot: !{Green}$${lobby.pot}`
            );
            break;
        }

        default:
            global.chatSend(player, '!{Red}Acțiune invalidă.');
            return;
    }
    // Log acțiunea în fișier
    const actionAmount = _preActionPot !== lobby.pot ? (lobby.pot - _preActionPot) : 0;
    pokerLog.onPlayerAction(lobby, player.name, action, actionAmount, slot.chips, lobby.pot);

    updateLobbyUI(lobby);
    nextTurn(lobby);
}

const CARD_VALUES = {
    '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,
    'J':11,'Q':12,'K':13,'A':14
};

const HAND_NAMES = [
    'High Card', 'One Pair', 'Two Pair', 'Three of a Kind',
    'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
];

const VALUE_TO_RANK = { 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7', 8:'8', 9:'9', 10:'10', 11:'J', 12:'Q', 13:'K', 14:'A' };

function getDetailedHandName(result) {
    const { score, tiebreakers } = result;
    const r = (v) => VALUE_TO_RANK[v] || v;

    switch (score) {
        case 8: return `Straight Flush (${r(tiebreakers[0])}-high)`;
        case 7: return `Four of a Kind (${r(tiebreakers[0])}s) - ${r(tiebreakers[1])}`;
        case 6: return `Full House (${r(tiebreakers[0])}s full of ${r(tiebreakers[1])}s)`;
        case 5: return `Flush (${tiebreakers.map(r).join(' ')})`;
        case 4: return `Straight (${r(tiebreakers[0])}-high)`;
        case 3: return `Three of a Kind (${r(tiebreakers[0])}s) - ${tiebreakers.slice(1).map(r).join(' ')}`;
        case 2: return `Two Pair (${r(tiebreakers[0])}s & ${r(tiebreakers[1])}s) - ${r(tiebreakers[2])}`;
        case 1: return `One Pair (${r(tiebreakers[0])}s) - ${tiebreakers.slice(1).map(r).join(' ')}`;
        case 0: return `High Card (${tiebreakers.map(r).join(' ')})`;
        default: return HAND_NAMES[score] || 'Unknown';
    }
}

function getCombinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [first, ...rest] = arr;
    return [
        ...getCombinations(rest, k - 1).map(c => [first, ...c]),
        ...getCombinations(rest, k),
    ];
}

function evaluate5Cards(cards) {
    const vals  = cards.map(c => CARD_VALUES[parseCard(c).rank]).sort((a, b) => b - a);
    const suits = cards.map(c => parseCard(c).suit);

    const isFlush = suits.every(s => s === suits[0]);

    const uniqueVals = [...new Set(vals)].sort((a, b) => b - a);
    let isStraight = false;
    let straightHigh = 0;
    if (uniqueVals.length === 5) {
        if (uniqueVals[0] - uniqueVals[4] === 4) {
            isStraight   = true;
            straightHigh = uniqueVals[0];
        } else if (
            uniqueVals[0] === 14 &&
            uniqueVals[1] === 5  &&
            uniqueVals[2] === 4  &&
            uniqueVals[3] === 3  &&
            uniqueVals[4] === 2
        ) {
            isStraight   = true;
            straightHigh = 5;
        }
    }

    const freq = {};
    vals.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    const groups = Object.entries(freq)
        .map(([v, c]) => ({ v: +v, c }))
        .sort((a, b) => b.c - a.c || b.v - a.v);

    const [g0, g1] = groups;

    if (isFlush && isStraight) return { score: 8, tiebreakers: [straightHigh] };
    if (g0.c === 4)            return { score: 7, tiebreakers: [g0.v, g1.v] };
    if (g0.c === 3 && g1?.c === 2) return { score: 6, tiebreakers: [g0.v, g1.v] };
    if (isFlush)               return { score: 5, tiebreakers: vals };
    if (isStraight)            return { score: 4, tiebreakers: [straightHigh] };
    if (g0.c === 3)            return { score: 3, tiebreakers: [g0.v, ...vals.filter(v => v !== g0.v)] };
    if (g0.c === 2 && g1?.c === 2) return { score: 2, tiebreakers: [g0.v, g1.v, groups[2].v] };
    if (g0.c === 2)            return { score: 1, tiebreakers: [g0.v, ...vals.filter(v => v !== g0.v)] };
    return                            { score: 0, tiebreakers: vals };
}

function compareHands(a, b) {
    if (a.score !== b.score) return a.score - b.score;
    for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
        const diff = (a.tiebreakers[i] || 0) - (b.tiebreakers[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

function getBestHand(holeCards, communityCards) {
    const all    = [...holeCards, ...communityCards];
    const combos = all.length >= 5 ? getCombinations(all, 5) : [all];
    let best = null;
    let bestCombo = null;
    for (const combo of combos) {
        const result = evaluate5Cards(combo);
        if (!best || compareHands(result, best) > 0) {
            best = result;
            bestCombo = combo;
        }
    }
    if (best) best.cards = bestCombo;
    return best;
}

// Calculează main pot + side pot-uri bazate pe totalContributed al fiecărui jucător
function calculateSidePots(players) {
    // Sortăm toți jucătorii (inclusiv folded) după contribuție ascendent
    const sorted = [...players].sort((a, b) => a.totalContributed - b.totalContributed);
    const rawPots = [];
    let prevLevel = 0;

    for (let i = 0; i < sorted.length; i++) {
        const level = sorted[i].totalContributed;
        if (level <= prevLevel) continue;

        const increment = level - prevLevel;
        // Jucătorii de la index i în sus au contribuit >= level (sortare ascendentă)
        const count = sorted.length - i;
        const potAmount = increment * count;

        // Eligibili să câștige acest pot = non-folded cu contribuție >= level
        const eligiblePlayers = sorted.slice(i).filter(p => !p.hasFolded);

        if (potAmount > 0) {
            if (eligiblePlayers.length === 0) {
                // Toți cei care au contribuit la acest nivel au foldat — adaugă la potu anterior
                if (rawPots.length > 0) rawPots[rawPots.length - 1].amount += potAmount;
            } else {
                rawPots.push({ amount: potAmount, eligiblePlayers });
            }
        }

        prevLevel = level;
    }

    // Merge consecutive pots cu aceiași eligibili
    const pots = [];
    for (const pot of rawPots) {
        const eligibleNames = pot.eligiblePlayers.map(p => p.player.name).sort().join(',');
        if (pots.length > 0) {
            const lastPot = pots[pots.length - 1];
            const lastNames = lastPot.eligiblePlayers.map(p => p.player.name).sort().join(',');
            if (eligibleNames === lastNames) {
                // Aceiași jucători — merge poturile
                lastPot.amount += pot.amount;
                continue;
            }
        }
        pots.push({ amount: pot.amount, eligiblePlayers: pot.eligiblePlayers });
    }

    return pots;
}

function showdown(lobby) {
    broadcastToLobby(lobby, '!{Green}[POKER] ══ SHOWDOWN ══');
    console.log(`[POKER] ====== SHOWDOWN ====== Lobby "${lobby.name}" | Pot: $${lobby.pot} | Community: [${lobby.communityCards.join(', ')}]`);

    const active = lobby.players.filter(p => !p.hasFolded);

    // Afișează mâinile tuturor jucătorilor activi
    const showdownResults = [];
    active.forEach(slot => {
        const result = getBestHand(slot.cards, lobby.communityCards);
        const detailedName = getDetailedHandName(result);
        console.log(`[POKER] SHOWDOWN: ${slot.player.name} → ${slot.cards.join(' ')} = ${detailedName} (score: ${result.score}, tiebreakers: [${result.tiebreakers.join(',')}])`);
        broadcastToLobby(lobby,
            `!{White}${slot.player.name}: ${slot.cards.join(' ')} — !{Yellow}${detailedName}`
        );
        showdownResults.push({
            playerName: slot.player.name,
            cards: [...slot.cards],
            handName: detailedName,
            score: result.score,
        });
    });
    pokerLog.onShowdown(lobby, showdownResults);

    // Calculează poturile (main + side pots)
    const sidePots = calculateSidePots(lobby.players);
    console.log(`[POKER] SIDE_POTS: ${sidePots.length} pot(uri)`);
    sidePots.forEach((pot, i) => {
        console.log(`[POKER]   Pot ${i}: $${pot.amount} | Eligibili: ${pot.eligiblePlayers.map(p => p.player.name).join(', ')}`);
    });

    let totalAwarded = 0;
    const allWinnerNames = [];

    sidePots.forEach((pot, potIndex) => {
        const { amount, eligiblePlayers } = pot;
        const potLabel = sidePots.length > 1
            ? (potIndex === 0 ? 'Main Pot' : `Side Pot ${potIndex}`)
            : 'Pot';

        // Găsește câștigătorul(ii) pentru acest pot
        let bestResult = null;
        let potWinners = [];

        eligiblePlayers.forEach(slot => {
            const res = getBestHand(slot.cards, lobby.communityCards);
            const cmp = bestResult ? compareHands(res, bestResult) : 1;
            if (cmp > 0) {
                bestResult = res;
                potWinners = [slot];
            } else if (cmp === 0) {
                potWinners.push(slot);
            }
        });

        // Aplică rake-ul cazinoului (HOUSE_CUT_PERCENT)
        let rake = 0;
        let netAmount = amount;
        if (LOBBY_CONFIG.HOUSE_CUT_PERCENT > 0) {
            rake = Math.floor(amount * LOBBY_CONFIG.HOUSE_CUT_PERCENT / 100);
            netAmount = amount - rake;
        }

        const share = Math.floor(netAmount / potWinners.length);
        potWinners.forEach(slot => { slot.chips += share; });
        totalAwarded += share * potWinners.length;
        const winDetailedName = getDetailedHandName(bestResult);
        pokerLog.onPotWinner(lobby, potLabel, amount, potWinners.map(w => w.player.name), winDetailedName, share, rake);
        
        console.log(`[POKER] POT_WINNER: ${potLabel} ($${amount}, rake: $${rake}, net: $${netAmount}) → ${potWinners.map(w => w.player.name).join(', ')} (câte $${share}) — ${winDetailedName}`);
        
        // Notifică jucătorii și trimite rake-ul cazinoului
        if (rake > 0) {
            broadcastToLobby(lobby, `!{Orange}[POKER] !{White}Cazinoul a reținut !{Red}$${rake} !{White}(${LOBBY_CONFIG.HOUSE_CUT_PERCENT}% rake) din ${potLabel}.`);
            if (lobby.casinoId) {
                mp.events.call('poker:casinoRake', lobby.casinoId, rake, lobby.id, lobby.name);
            }
        }

        if (potWinners.length === 1) {
            broadcastToLobby(lobby,
                `!{Orange}[POKER] !{Yellow}${potWinners[0].player.name} !{White}câștigă ${potLabel} (!{Green}$${netAmount}!{White}${rake > 0 ? ` din $${amount}` : ''}) cu !{Yellow}${winDetailedName}!{White}!`
            );
        } else {
            broadcastToLobby(lobby,
                `!{Orange}[POKER] !{White}Split ${potLabel} (!{Green}$${netAmount}!{White}${rake > 0 ? ` din $${amount}` : ''})! ${potWinners.map(w => `!{Yellow}${w.player.name}`).join(', ')} !{White}primesc !{Green}$${share}!{White} fiecare (!{Yellow}${winDetailedName}!{White}).`
            );
        }

        potWinners.forEach(w => {
            if (!allWinnerNames.includes(w.player.name)) allWinnerNames.push(w.player.name);
        });
    });

    // Rest din rotunjire (Math.floor) — îl dăm primului câștigător
    const remainder = lobby.pot - totalAwarded;
    if (remainder > 0 && sidePots.length > 0 && sidePots[0].eligiblePlayers.length > 0) {
        sidePots[0].eligiblePlayers[0].chips += remainder;
    }

    // Trimite winner banner la UI
    callToLobby(lobby, 'pokerShowWinner', [allWinnerNames, lobby.pot, '']);

    pokerLog.onGameEnd(lobby, lobby.pot);

    const firstWinner = lobby.players.find(p => allWinnerNames.includes(p.player.name)) || lobby.players[0];
    endRound(lobby, firstWinner, true);
}

function endRound(lobby, winnerSlot, chipsAlreadyAdded = false) {
    const potWon = lobby.pot;
    console.log(`[POKER] ====== END ROUND ====== Lobby "${lobby.name}" | Pot câștigat: $${potWon} | Winner: ${winnerSlot.player.name} | chipsAlreadyAdded: ${chipsAlreadyAdded}`);
    if (!chipsAlreadyAdded) {
        // Aplică rake la fold win
        let rake = 0;
        let netPot = lobby.pot;
        if (LOBBY_CONFIG.HOUSE_CUT_PERCENT > 0) {
            rake = Math.floor(lobby.pot * LOBBY_CONFIG.HOUSE_CUT_PERCENT / 100);
            netPot = lobby.pot - rake;
        }

        pokerLog.onFoldWin(lobby, winnerSlot.player.name, netPot, rake);
        pokerLog.onGameEnd(lobby, lobby.pot);
        winnerSlot.chips += netPot;

        if (rake > 0) {
            broadcastToLobby(lobby, `!{Orange}[POKER] !{White}Cazinoul a reținut !{Red}$${rake} !{White}(${LOBBY_CONFIG.HOUSE_CUT_PERCENT}% rake).`);
            if (lobby.casinoId) {
                mp.events.call('poker:casinoRake', lobby.casinoId, rake, lobby.id, lobby.name);
            }
        }

        broadcastToLobby(lobby, `!{Orange}[POKER] !{Yellow}${winnerSlot.player.name} !{White}a câștigat runda și !{Green}$${netPot}!{White}${rake > 0 ? ` (din $${lobby.pot})` : ''}!`);
        callToLobby(lobby, 'pokerShowWinner', [[winnerSlot.player.name], netPot, 'Fold Win']);
    }

    if (lobby.turnTimer) { clearInterval(lobby.turnTimer); lobby.turnTimer = null; }

    // ── Update bani pentru TOȚI jucătorii la finalul rundei ──
    lobby.players.forEach(slot => {
        if (!slot.player._isBot) {
            mp.events.call('poker:updatePlayerMoney', slot.player, slot.chips);
            console.log(`[POKER] MONEY_UPDATE: ${slot.player.name} → $${slot.chips}`);
        }
    });

    // Curăță jucătorii care au plecat mid-hand
    const leftPlayers = lobby.players.filter(p => p._hasLeft);
    if (leftPlayers.length > 0) console.log(`[POKER] LEFT_CLEANUP: ${leftPlayers.map(p => p.player.name).join(', ')}`);

    const eliminated = lobby.players.filter(p => p.chips <= 0 && !p._hasLeft);
    if (eliminated.length > 0) console.log(`[POKER] ELIMINATI: ${eliminated.map(p => p.player.name).join(', ')}`);
    eliminated.forEach(slot => {
        global.chatSend(slot.player, '!{Red}[POKER] Nu mai ai chips! Ai fost eliminat.');
        slot.player.call('closePokerUI');
        broadcastToLobby(lobby, `!{Red}[POKER] ${slot.player.name} a fost eliminat (0 chips).`);
    });
    lobby.players = lobby.players.filter(p => p.chips > 0 && !p._hasLeft);

    lobby.players.forEach((p, i) => { p.seat = i; });
    if (lobby.dealerIndex >= lobby.players.length) {
        lobby.dealerIndex = 0;
    }

    updateLobbyUI(lobby);

    console.log(`[POKER] POST_ROUND: ${lobby.players.length} jucători rămași: ${lobby.players.map(p => `${p.player.name}($${p.chips})`).join(', ')}`);
    if (lobby.players.length >= LOBBY_CONFIG.MIN_PLAYERS) {
        lobby.state = 'starting'; 
        const delay = LOBBY_CONFIG.END_DELAY * 1000;
        broadcastToLobby(lobby, `!{Orange}[POKER] !{White}Runda nouă în ${LOBBY_CONFIG.END_DELAY} secunde...`);
        setTimeout(() => {
            if (lobby.players.length >= LOBBY_CONFIG.MIN_PLAYERS) {
                lobby.dealerIndex = (lobby.dealerIndex + 1) % lobby.players.length;
                startGame(lobby);
            } else {
                lobby.state = 'waiting';
                broadcastToLobby(lobby, '!{Red}[POKER] Nu sunt suficienți jucători pentru o nouă rundă.');
            }
        }, delay);
    } else {
        lobby.state = 'waiting';
        broadcastToLobby(lobby, '!{Red}[POKER] Nu sunt suficienți jucători pentru o nouă rundă.');
    }
}

function getLobbyStateForUI(lobby) {
    const visiblePlayers = lobby.players.filter(p => !p._hasLeft);
    return {
        round:          lobby.round,
        pot:            lobby.pot,
        currentBet:     lobby.currentBet,
        communityCards: lobby.communityCards,
        currentPlayer:  lobby.players[lobby.currentPlayerIndex]?.player?.name || '',
        players: visiblePlayers.map(p => ({
            name:       p.player.name,
            chips:      p.chips,
            seat:       p.seat,
            hasFolded:  p.hasFolded,
            currentBet: p.currentBet,
            lastAction: p.lastAction || null,
        })),
    };
}

function updateLobbyUI(lobby) {
    const visibleCount = lobby.players.filter(p => !p._hasLeft).length;

    callToLobby(lobby, 'pokerUpdateState', [getLobbyStateForUI(lobby)]);
    console.log(`[POKER] Lobby "${lobby.name}" actualizat. Stare: ${lobby.state}, Jucători: ${visibleCount}/${LOBBY_CONFIG.MAX_PLAYERS}`);

    mp.events.call('_poker_updateMarker', lobby.id, lobby.state, visibleCount, LOBBY_CONFIG.MAX_PLAYERS);
}

//Events
mp.events.add('poker:updatePlayerMoney', (player, newAmount) => {
    player.money = newAmount; // banii din mana
    console.log(`[POKER] MONEY_SET: ${player.name} → $${newAmount}`);
});

mp.events.add('Server_ReceivePokerAction', (player, actionName, raiseAmount) => {
    console.log(`[POKER] ${player.name} -> ${actionName}`);
    processAction(player, actionName, raiseAmount || 0);
});

mp.events.add('Server_JoinPokerTable', (player, tableIndex, tableName, casinoId) => {
    global.chatSend(player, `!{Green}[POKER] Încerci să te alături mesei "${tableName}"...`);
    joinLobby(player, tableIndex, tableName, casinoId);
});

mp.events.add('Server_LeavePokerTable', (player) => {
    leaveLobby(player);
});

mp.events.add('playerQuit', (player) => {
    leaveLobby(player);
});


module.exports = { LOBBY_CONFIG, joinLobby, leaveLobby, processAction, lobbies, getLobbyByPlayer, getBestHand, getDetailedHandName, CARD_VALUES, HAND_NAMES, parseCard };