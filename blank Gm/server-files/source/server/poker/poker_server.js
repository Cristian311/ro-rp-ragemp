const LOBBY_CONFIG = {
    MAX_PLAYERS: 10,
    MIN_PLAYERS: 2,
    TURN_TIME: 30,
    START_DELAY: 5,
    SMALL_BLIND: 50,
    BIG_BLIND: 100,
};

function createLobby(tableIndex, tableName) {
    return {
        id: tableIndex,
        name: tableName,
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
        const found = lobbies[key].players.find(p => p.player === player);
        if (found) return lobbies[key];
    }
    return null;
}

function getPlayerSlot(lobby, player) {
    return lobby.players.find(p => p.player === player);
}

function broadcastToLobby(lobby, message) {
    lobby.players.forEach(slot => slot.player.outputChatBox(message));
}

function callToLobby(lobby, eventName, ...args) {
    lobby.players.forEach(slot => slot.player.call(eventName, ...args));
}

function joinLobby(player, tableIndex, tableName) {
    if (getLobbyByPlayer(player)) {
        player.outputChatBox('!{Red}Ești deja la o masă de poker!');
        return;
    }

    if (!lobbies[tableIndex]) {
        lobbies[tableIndex] = createLobby(tableIndex, tableName);
    }

    const lobby = lobbies[tableIndex];

    if (lobby.state === 'playing') {
        player.outputChatBox('!{Red}Partida e în desfășurare. Așteaptă runda următoare!');
        return;
    }

    if (lobby.players.length >= LOBBY_CONFIG.MAX_PLAYERS) {
        player.outputChatBox('!{Red}Masa este plină!');
        return;
    }

    const seat = lobby.players.length;
    lobby.players.push({
        player,
        seat,
        chips: 1000,
        cards: [],
        currentBet: 0,
        hasFolded: false,
        hasActed: false,
    });

    player.outputChatBox(`!{Green}[POKER] Te-ai așezat la masa "${lobby.name}" pe locul ${seat + 1}.`);
    broadcastToLobby(lobby, `!{Yellow}[POKER] ${player.name} s-a alăturat (${lobby.players.length}/${LOBBY_CONFIG.MAX_PLAYERS})`);

    player.call('openPokerUI');
    updateLobbyUI(lobby);
    callToLobby(lobby, 'pokerUpdateState', JSON.stringify(getLobbyStateForUI(lobby)));
    
    if (lobby.players.length >= LOBBY_CONFIG.MIN_PLAYERS && lobby.state === 'waiting') {
        lobby.state = 'starting';
        startCountdown(lobby);
    }
}

function leaveLobby(player) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) return;

    const wasPlaying = lobby.state === 'playing';
    lobby.players = lobby.players.filter(p => p.player !== player);

    player.outputChatBox('!{Yellow}[POKER] Ai părăsit masa.');
    broadcastToLobby(lobby, `!{Yellow}[POKER] ${player.name} a părăsit masa.`);

    if (lobby.players.length < LOBBY_CONFIG.MIN_PLAYERS) {
        if (lobby.startTimer) { clearInterval(lobby.startTimer); lobby.startTimer = null; }
        if (lobby.turnTimer)  { clearInterval(lobby.turnTimer);  lobby.turnTimer  = null; }
        lobby.state = 'waiting';
        broadcastToLobby(lobby, '!{Red}[POKER] Nu mai sunt suficienți jucători. Jocul s-a oprit.');
    }

    updateLobbyUI(lobby);

    if (wasPlaying && lobby.players.length >= LOBBY_CONFIG.MIN_PLAYERS) {
        // Resetăm indexul dacă e out-of-bounds după eliminare
        if (lobby.currentPlayerIndex >= lobby.players.length) {
            lobby.currentPlayerIndex = 0;
        }
        nextTurn(lobby);
    }
}

function startCountdown(lobby) {
    let secondsLeft = LOBBY_CONFIG.START_DELAY;
    broadcastToLobby(lobby, `!{Green}[POKER] Jocul începe în ${secondsLeft} secunde!`);

    lobby.startTimer = setInterval(() => {
        secondsLeft--;
        //callToLobby(lobby, 'pokerLobbyCountdown', secondsLeft);

        if (secondsLeft <= 0) {
            clearInterval(lobby.startTimer);
            lobby.startTimer = null;
            startGame(lobby);
        } else if (secondsLeft <= 3) {
            broadcastToLobby(lobby, `!{Green}[POKER] ${secondsLeft}...`);
        }
    }, 1000);
}

function updatePlayerDebugInfo(player, lobby, action, raiseAmount) {
    const debugInfo = generateDebugString(lobby, action, raiseAmount);
    player.call('Client_UpdateDebugHUD', [debugInfo]);
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
        console.warn('[POKER] Deck epuizat, se recreează!');
        lobby.deck = createShuffledDeck();
    }
    return lobby.deck.splice(0, count);
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
    lobby.currentBet = LOBBY_CONFIG.BIG_BLIND;
    lobby.round = 'preflop';

    lobby.deck = createShuffledDeck();

    lobby.players.forEach(slot => {
        slot.cards      = dealFromDeck(lobby, 2);
        slot.currentBet = 0;
        slot.hasFolded  = false;
        slot.hasActed   = false;
    });

    const sbIndex = (lobby.dealerIndex + 1) % lobby.players.length;
    const bbIndex = (lobby.dealerIndex + 2) % lobby.players.length;
    const sbSlot  = lobby.players[sbIndex];
    const bbSlot  = lobby.players[bbIndex];

    sbSlot.chips -= LOBBY_CONFIG.SMALL_BLIND;
    sbSlot.currentBet = LOBBY_CONFIG.SMALL_BLIND;
    lobby.pot += LOBBY_CONFIG.SMALL_BLIND;

    bbSlot.chips -= LOBBY_CONFIG.BIG_BLIND;
    bbSlot.currentBet = LOBBY_CONFIG.BIG_BLIND;
    lobby.pot += LOBBY_CONFIG.BIG_BLIND;

    broadcastToLobby(lobby, `!{Green}====== POKER ROUND START ======`);
    broadcastToLobby(lobby, `!{Yellow}Small Blind: ${sbSlot.player.name} (-${LOBBY_CONFIG.SMALL_BLIND})`);
    broadcastToLobby(lobby, `!{Yellow}Big Blind: ${bbSlot.player.name} (-${LOBBY_CONFIG.BIG_BLIND})`);

    lobby.players.forEach(slot => {
        const [c1, c2] = slot.cards;
        const { rank: r1, suit: s1 } = parseCard(c1);
        const { rank: r2, suit: s2 } = parseCard(c2);
        slot.player.call('pokerDealCards', [r1, s1, r2, s2]);
        console.log(`[POKER] ${slot.player.name} primește cărțile: ${r1}${s1} și ${r2}${s2}`);
    });

    updateLobbyUI(lobby);
    

    lobby.currentPlayerIndex = (bbIndex + 1) % lobby.players.length;
    startTurn(lobby);
    mp.events.call('_poker_afterTurn', lobby);
}

function startTurn(lobby) {
    let safetyCounter = 0;
    while (
        lobby.players[lobby.currentPlayerIndex]?.hasFolded &&
        safetyCounter < lobby.players.length
    ) {
        lobby.currentPlayerIndex = (lobby.currentPlayerIndex + 1) % lobby.players.length;
        safetyCounter++;
    }

    const currentSlot = lobby.players[lobby.currentPlayerIndex];
    if (!currentSlot) return;

    lobby.turnTimeLeft = LOBBY_CONFIG.TURN_TIME;

    broadcastToLobby(lobby,
        `!{Cyan}[POKER] Rândul lui ${currentSlot.player.name} (${lobby.turnTimeLeft}s) | Pot: $${lobby.pot} | Bet curent: $${lobby.currentBet}`
    );

    callToLobby(lobby, 'pokerUpdateState', JSON.stringify(getLobbyStateForUI(lobby)));
    currentSlot.player.call('pokerYourTurn', [lobby.currentBet, currentSlot.currentBet, currentSlot.chips]);

    if (lobby.turnTimer) clearInterval(lobby.turnTimer);

    lobby.turnTimer = setInterval(() => {
        lobby.turnTimeLeft--;
        callToLobby(lobby, 'pokerTurnTimer', [currentSlot.player.name, lobby.turnTimeLeft]);

        if (lobby.turnTimeLeft <= 0) {
            clearInterval(lobby.turnTimer);
            broadcastToLobby(lobby, `!{Red}[POKER] ${currentSlot.player.name} a picat timpul — Fold automat!`);
            currentSlot.hasFolded = true;
            currentSlot.hasActed  = true;
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

    // ✅ FIX #1: era `activePlayers` (array) în loc de `activePlayers[0]` (slot)
    if (activePlayers.length === 1) {
        endRound(lobby, activePlayers[0]);
        return;
    }

    const allActed = lobby.players.every(
        p => p.hasFolded || (p.hasActed && p.currentBet === lobby.currentBet)
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
    lobby.players.forEach(p => {
        p.hasActed   = false;
        p.currentBet = 0;
    });
    lobby.currentBet = 0;

    const currentRoundIdx = ROUND_ORDER.indexOf(lobby.round);
    if (currentRoundIdx >= ROUND_ORDER.length - 1) {
        showdown(lobby);
        return;
    }

    lobby.round = ROUND_ORDER[currentRoundIdx + 1];

    if (lobby.round === 'flop') {
        lobby.communityCards = dealFromDeck(lobby, 3);
    } else {
        lobby.communityCards.push(...dealFromDeck(lobby, 1));
    }

    broadcastToLobby(lobby,
        `!{Green}[POKER] ══ ${lobby.round.toUpperCase()} ══ Cărți: ${lobby.communityCards.join(' ')}`
    );
    callToLobby(lobby, 'pokerUpdateState', [getLobbyStateForUI(lobby)]);

    lobby.currentPlayerIndex = (lobby.dealerIndex + 1) % lobby.players.length;
    startTurn(lobby);

    // ✅ FIX #2: lipsea _poker_afterTurn după nextRound — boții nu primeau semnalul să acționeze
    mp.events.call('_poker_afterTurn', lobby);
}

function processAction(player, action, raiseAmount = 0) {
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

    switch (action) {
        case 'fold':
            slot.hasFolded = true;
            slot.hasActed  = true;
            broadcastToLobby(lobby, `!{Red}[POKER] ${player.name} a dat Fold.`);
            break;

        case 'check':
            if (lobby.currentBet > slot.currentBet) {
                player.outputChatBox('!{Red}Nu poți da Check — există un bet activ!');
                return;
            }
            slot.hasActed = true;
            broadcastToLobby(lobby, `!{White}[POKER] ${player.name} a dat Check.`);
            break;

        case 'call': {
            const toCall = lobby.currentBet - slot.currentBet;
            if (toCall < 0) {
                player.outputChatBox('!{Red}Nu ai ce să call-uiești.');
                return;
            }
            if(toCall == 0)
            {
                slot.hasActed = true;
                broadcastToLobby(lobby, `!{White}[POKER] ${player.name} a dat Check.`);
                break;
            }
            const actualCall = Math.min(toCall, slot.chips);
            slot.chips      -= actualCall;
            slot.currentBet += actualCall;
            lobby.pot       += actualCall;
            slot.hasActed    = true;
            broadcastToLobby(lobby, `!{Cyan}[POKER] ${player.name} a dat Call ($${actualCall}). Pot: $${lobby.pot}`);
            break;
        }

        case 'raise': {
            const minRaise = lobby.currentBet + LOBBY_CONFIG.BIG_BLIND;
            const amount   = raiseAmount >= minRaise ? raiseAmount : minRaise;
            if (slot.chips < amount - slot.currentBet) {
                player.outputChatBox('!{Red}Nu ai destui chips!');
                return;
            }
            const toAdd      = amount - slot.currentBet;
            slot.chips      -= toAdd;
            lobby.pot       += toAdd;
            slot.currentBet  = amount;
            lobby.currentBet = amount;
            slot.hasActed    = true;
            lobby.players.forEach(p => { if (p !== slot && !p.hasFolded) p.hasActed = false; });
            broadcastToLobby(lobby, `!{Yellow}[POKER] ${player.name} a dat Raise la $${amount}. Pot: $${lobby.pot}`);
            break;
        }

        case 'allin': {
            const allInAmount = slot.chips + slot.currentBet;
            lobby.pot        += slot.chips;
            slot.currentBet  += slot.chips;
            slot.chips        = 0;
            if (slot.currentBet > lobby.currentBet) {
                lobby.currentBet = slot.currentBet;
                lobby.players.forEach(p => { if (p !== slot && !p.hasFolded) p.hasActed = false; });
            }
            slot.hasActed = true;
            broadcastToLobby(lobby, `!{Orange}[POKER] ${player.name} este ALL-IN ($${allInAmount})! Pot: $${lobby.pot}`);
            break;
        }

        default:
            player.outputChatBox('!{Red}Acțiune invalidă.');
            return;
    }
    updatePlayerDebugInfo(player, lobby, action, raiseAmount);
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
    for (const combo of combos) {
        const result = evaluate5Cards(combo);
        if (!best || compareHands(result, best) > 0) best = result;
    }
    return best;
}

function showdown(lobby) {
    broadcastToLobby(lobby, '!{Green}[POKER] ══ SHOWDOWN ══');

    const active = lobby.players.filter(p => !p.hasFolded);
    let bestResult = null;
    let winners    = [];

    active.forEach(slot => {
        const result = getBestHand(slot.cards, lobby.communityCards);
        broadcastToLobby(
            lobby,
            `!{White}${slot.player.name}: ${slot.cards.join(' ')} — ${HAND_NAMES[result.score]}`
        );
        const cmp = bestResult ? compareHands(result, bestResult) : 1;
        if (cmp > 0) {
            bestResult = result;
            winners    = [slot];
        } else if (cmp === 0) {
            winners.push(slot);
        }
    });

    const share = Math.floor(lobby.pot / winners.length);
    if (winners.length === 1) {
        broadcastToLobby(
            lobby,
            `!{Green}[POKER] 🏆 ${winners[0].player.name} a câștigat $${lobby.pot} cu ${HAND_NAMES[bestResult.score]}!`
        );
    } else {
        broadcastToLobby(
            lobby,
            `!{Green}[POKER] 🏆 Split pot (${HAND_NAMES[bestResult.score]})! ${winners.map(w => w.player.name).join(', ')} primesc $${share} fiecare.`
        );
    }

    winners.forEach(slot => { slot.chips += share; });
    endRound(lobby, winners[0], true);
}

function endRound(lobby, winnerSlot, chipsAlreadyAdded = false) {
    if (!chipsAlreadyAdded) {
        winnerSlot.chips += lobby.pot;
        broadcastToLobby(lobby, `!{Green}[POKER] 🏆 ${winnerSlot.player.name} a câștigat runda și $${lobby.pot}!`);
    }

    if (lobby.turnTimer) { clearInterval(lobby.turnTimer); lobby.turnTimer = null; }

    const eliminated = lobby.players.filter(p => p.chips <= 0);
    eliminated.forEach(slot => {
        slot.player.outputChatBox('!{Red}[POKER] Nu mai ai chips! Ai fost eliminat.');
        broadcastToLobby(lobby, `!{Red}[POKER] ${slot.player.name} a fost eliminat (0 chips).`);
    });
    lobby.players = lobby.players.filter(p => p.chips > 0);

    updateLobbyUI(lobby);

    lobby.state = 'waiting';
    if (lobby.players.length >= LOBBY_CONFIG.MIN_PLAYERS) {
        broadcastToLobby(lobby, '!{Yellow}[POKER] Runda nouă în 5 secunde...');
        setTimeout(() => {
            if (lobby.players.length >= LOBBY_CONFIG.MIN_PLAYERS) {
                lobby.dealerIndex = (lobby.dealerIndex + 1) % lobby.players.length;
                startGame(lobby);
            }
        }, 5000);
    } else {
        broadcastToLobby(lobby, '!{Red}[POKER] Nu sunt suficienți jucători pentru o nouă rundă.');
    }
}

function getLobbyStateForUI(lobby) {
    return {
        round:          lobby.round,
        pot:            lobby.pot,
        currentBet:     lobby.currentBet,
        communityCards: lobby.communityCards,
        currentPlayer:  lobby.players[lobby.currentPlayerIndex]?.player?.name || '',
        players: lobby.players.map(p => ({
            name:       p.player.name,
            chips:      p.chips,
            seat:       p.seat,
            hasFolded:  p.hasFolded,
            currentBet: p.currentBet,
        })),
    };
}

function updateLobbyUI(lobby) {
    let stateJson = JSON.stringify(getLobbyStateForUI(lobby));
    callToLobby(lobby, 'pokerUpdateState', stateJson);
    lobby.players.filter(p => p.player === lobby.players[lobby.currentPlayerIndex]?.player).forEach(slot => {
        //slot.player.outputChatBox(`!{Blue}[POKER] Lobby "${lobby.name}" actualizat.`);
    });
    console.log(`[POKER] Lobby "${lobby.name}" actualizat. Runda: ${lobby.round} Community cards: ${lobby.communityCards.join(' ')} Time: ${new Date().toLocaleTimeString()}`);

    // Updatează markerul cu starea curentă
    mp.events.call('_poker_updateMarker', lobby.id, lobby.state, lobby.players.length, LOBBY_CONFIG.MAX_PLAYERS);
}

mp.events.add('Server_ReceivePokerAction', (player, actionName, raiseAmount) => {
    console.log(`[POKER] ${player.name} -> ${actionName}`);
    processAction(player, actionName, raiseAmount || 0);
});

mp.events.add('Server_JoinPokerTable', (player, tableIndex, tableName) => {
    player.outputChatBox(`!{Green}[POKER] Încerci să te alături mesei "${tableName}"...`);
    joinLobby(player, tableIndex, tableName);
});

mp.events.add('Server_LeavePokerTable', (player) => {
    leaveLobby(player);
});

mp.events.add('playerQuit', (player) => {
    leaveLobby(player);
});

function generateDebugString(lobby, currentAction = "None", raiseAmount = 0) {
    if (!lobby) return "No active lobby.";

    let debugStr = `Lobby: ${lobby.name}\n`;
    debugStr += `Stare: ${lobby.state}\n`;
    debugStr += `Runda: ${lobby.round.toUpperCase()}\n`;
    debugStr += `Pot curent: $${lobby.pot}\n`;
    debugStr += `Bet curent (To Call): $${lobby.currentBet}\n`;
    debugStr += `Carti masa: ${lobby.communityCards.length > 0 ? lobby.communityCards.join(' ') : 'Niciuna'}\n`;

    if (currentAction !== "None") {
        debugStr += `Ultima actiune: ${currentAction} ${raiseAmount > 0 ? '($' + raiseAmount + ')' : ''}\n`;
    }

    debugStr += `\n--- JUCATORI ---\n`;

    if (lobby.players.length === 0) {
        debugStr += `Scaune libere: 10\n`;
    } else {
        lobby.players.forEach(slot => {
            const isTurn = lobby.players[lobby.currentPlayerIndex] === slot;
            const turnMarker = isTurn ? " <- RANDUL LUI" : "";
            const cardsStr = slot.cards.length > 0 ? `[${slot.cards.join(' ')}]` : '[ascunse/gol]';

            debugStr += `Scaun ${slot.seat + 1} (${slot.player.name}): ${turnMarker}\n`;

            let statusLines = [];
            statusLines.push(`  Chips: $${slot.chips}`);
            statusLines.push(`  Bet masa: $${slot.currentBet}`);

            if (slot.hasFolded) {
                statusLines.push(`  Stare: FOLDED`);
            } else {
                statusLines.push(`  Stare: ${slot.hasActed ? 'A actionat' : 'Asteaptand actiunea'}`);
            }

            statusLines.push(`  Carti: ${cardsStr}`);
            debugStr += statusLines.join('\n') + '\n\n';
        });
    }
    return debugStr;
}

module.exports = { joinLobby, leaveLobby, processAction, lobbies, updatePlayerDebugInfo, generateDebugString };