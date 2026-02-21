const LOBBY_CONFIG = {
    MAX_PLAYERS: 10,
    MIN_PLAYERS: 2,
    TURN_TIME: 30,        // secunde per rând
    START_DELAY: 10,      // secunde să aștepte după ce s-au adunat MIN_PLAYERS
    SMALL_BLIND: 50,
    BIG_BLIND: 100,
};

function createLobby(tableIndex, tableName) {
    return {
        id: tableIndex,
        name: tableName,
        state: 'waiting',       // waiting | starting | playing | ended
        players: [],            // { player, seat, chips, cards, currentBet, hasFolded, hasActed }
        pot: 0,
        communityCards: [],
        currentPlayerIndex: 0,
        dealerIndex: 0,
        round: 'preflop',       // preflop | flop | turn | river
        currentBet: 0,
        startTimer: null,
        turnTimer: null,
        turnTimeLeft: 0,
    };
}

const lobbies = {};   // lobbies[tableIndex] = lobby

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────
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
    lobby.players.forEach(slot => {
        slot.player.outputChatBox(message);
    });
}

function callToLobby(lobby, eventName, ...args) {
    lobby.players.forEach(slot => {
        slot.player.call(eventName, ...args);
    });
}

// ──────────────────────────────────────────
// Join / Leave
// ──────────────────────────────────────────
function joinLobby(player, tableIndex, tableName) {
    // Verifică dacă jucătorul e deja într-un lobby
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
        chips: 1000,     // chips de start (poți lua din cont)
        cards: [],
        currentBet: 0,
        hasFolded: false,
        hasActed: false,
    });

    player.outputChatBox(`!{Green}[POKER] Te-ai așezat la masa "${lobby.name}" pe locul ${seat + 1}.`);
    broadcastToLobby(lobby, `!{Yellow}[POKER] ${player.name} s-a alăturat (${lobby.players.length}/${LOBBY_CONFIG.MAX_PLAYERS})`);
    
    player.call('openPokerUI');
    // Trimite UI-ul cu starea lobby-ului
    updateLobbyUI(lobby);

    // Dacă s-au adunat MIN_PLAYERS, pornește countdown
    if (lobby.players.length >= LOBBY_CONFIG.MIN_PLAYERS && lobby.state === 'waiting') {
        lobby.state = 'starting';
        startCountdown(lobby);
    }
}

function leaveLobby(player) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) return;

    lobby.players = lobby.players.filter(p => p.player !== player);
    player.outputChatBox('!{Yellow}[POKER] Ai părăsit masa.');
    broadcastToLobby(lobby, `!{Yellow}[POKER] ${player.name} a părăsit masa.`);

    // Anulează timere dacă nu mai sunt destui jucători
    if (lobby.players.length < LOBBY_CONFIG.MIN_PLAYERS) {
        if (lobby.startTimer) {
            clearInterval(lobby.startTimer);
            lobby.startTimer = null;
        }
        if (lobby.turnTimer) {
            clearInterval(lobby.turnTimer);
            lobby.turnTimer = null;
        }
        lobby.state = 'waiting';
        broadcastToLobby(lobby, '!{Red}[POKER] Nu mai sunt suficienți jucători. Jocul s-a oprit.');
    }

    updateLobbyUI(lobby);

    // Dacă era rândul lui, trece la următorul
    if (lobby.state === 'playing') {
        nextTurn(lobby);
    }
}

// ──────────────────────────────────────────
// Countdown înainte de start
// ──────────────────────────────────────────
function startCountdown(lobby) {
    let secondsLeft = LOBBY_CONFIG.START_DELAY;
    broadcastToLobby(lobby, `!{Green}[POKER] Jocul începe în ${secondsLeft} secunde!`);

    lobby.startTimer = setInterval(() => {
        secondsLeft--;

        if (secondsLeft <= 0) {
            clearInterval(lobby.startTimer);
            lobby.startTimer = null;
            startGame(lobby);
        } else if (secondsLeft <= 3) {
            broadcastToLobby(lobby, `!{Green}[POKER] ${secondsLeft}...`);
        }

        // Trimite countdown la UI
        callToLobby(lobby, 'pokerLobbyCountdown', secondsLeft);
    }, 1000);
}

// ──────────────────────────────────────────
// Start joc
// ──────────────────────────────────────────
function startGame(lobby) {
    lobby.state = 'playing';
    lobby.pot = 0;
    lobby.communityCards = [];
    lobby.currentBet = LOBBY_CONFIG.BIG_BLIND;
    lobby.round = 'preflop';

    // Reset jucători
    lobby.players.forEach(slot => {
        slot.cards = dealCards(2);
        slot.currentBet = 0;
        slot.hasFolded = false;
        slot.hasActed = false;
    });

    // Blinds
    const sbIndex = (lobby.dealerIndex + 1) % lobby.players.length;
    const bbIndex = (lobby.dealerIndex + 2) % lobby.players.length;
    const sbSlot = lobby.players[sbIndex];
    const bbSlot = lobby.players[bbIndex];

    sbSlot.chips -= LOBBY_CONFIG.SMALL_BLIND;
    sbSlot.currentBet = LOBBY_CONFIG.SMALL_BLIND;
    lobby.pot += LOBBY_CONFIG.SMALL_BLIND;

    bbSlot.chips -= LOBBY_CONFIG.BIG_BLIND;
    bbSlot.currentBet = LOBBY_CONFIG.BIG_BLIND;
    lobby.pot += LOBBY_CONFIG.BIG_BLIND;

    broadcastToLobby(lobby, `!{Green}====== POKER ROUND START ======`);
    broadcastToLobby(lobby, `!{Yellow}Small Blind: ${sbSlot.player.name} (-${LOBBY_CONFIG.SMALL_BLIND})`);
    broadcastToLobby(lobby, `!{Yellow}Big Blind: ${bbSlot.player.name} (-${LOBBY_CONFIG.BIG_BLIND})`);

    // Trimite cărțile fiecărui jucător privat
    lobby.players.forEach(slot => {
        slot.player.call('pokerDealCards', slot.cards);
    });

    updateLobbyUI(lobby);

    // Primul care acționează: după BB (la preflop)
    lobby.currentPlayerIndex = (bbIndex + 1) % lobby.players.length;
    startTurn(lobby);
}

// ──────────────────────────────────────────
// Deck simplu (poate fi înlocuit cu unul real)
// ──────────────────────────────────────────
function dealCards(count) {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const deck = [];
    for (const s of suits) for (const v of values) deck.push(`${v}${s}`);
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck.slice(0, count);
}

// ──────────────────────────────────────────
// Turn management
// ──────────────────────────────────────────
function startTurn(lobby) {
    // Sari peste jucătorii care au fold
    while (lobby.players[lobby.currentPlayerIndex]?.hasFolded) {
        lobby.currentPlayerIndex = (lobby.currentPlayerIndex + 1) % lobby.players.length;
    }

    const currentSlot = lobby.players[lobby.currentPlayerIndex];
    if (!currentSlot) return;

    lobby.turnTimeLeft = LOBBY_CONFIG.TURN_TIME;

    broadcastToLobby(lobby, `!{Cyan}[POKER] Rândul lui ${currentSlot.player.name} (${lobby.turnTimeLeft}s) | Pot: $${lobby.pot} | Bet curent: $${lobby.currentBet}`);

    // Notifică UI-ul
    callToLobby(lobby, 'pokerUpdateState', getLobbyStateForUI(lobby));
    currentSlot.player.call('pokerYourTurn', lobby.currentBet, currentSlot.currentBet, currentSlot.chips);

    // Timer per rând
    if (lobby.turnTimer) clearInterval(lobby.turnTimer);

    lobby.turnTimer = setInterval(() => {
        lobby.turnTimeLeft--;

        // Update timer pe UI
        callToLobby(lobby, 'pokerTurnTimer', currentSlot.player.name, lobby.turnTimeLeft);

        if (lobby.turnTimeLeft <= 0) {
            clearInterval(lobby.turnTimer);
            broadcastToLobby(lobby, `!{Red}[POKER] ${currentSlot.player.name} a picat timpul — Fold automat!`);
            currentSlot.hasFolded = true;
            currentSlot.hasActed = true;
            nextTurn(lobby);
        }
    }, 1000);
}

function nextTurn(lobby) {
    if (lobby.turnTimer) {
        clearInterval(lobby.turnTimer);
        lobby.turnTimer = null;
    }

    // Verifică dacă mai e un singur jucător rămas
    const activePlayers = lobby.players.filter(p => !p.hasFolded);
    if (activePlayers.length === 1) {
        endRound(lobby, activePlayers[0]);
        return;
    }

    // Verifică dacă toți au acționat și bet-urile sunt egale
    const allActed = lobby.players.every(p => p.hasFolded || (p.hasActed && p.currentBet === lobby.currentBet));
    if (allActed) {
        nextRound(lobby);
        return;
    }

    // Trecem la următorul jucător activ
    lobby.currentPlayerIndex = (lobby.currentPlayerIndex + 1) % lobby.players.length;
    startTurn(lobby);
}

// ──────────────────────────────────────────
// Runde (preflop → flop → turn → river)
// ──────────────────────────────────────────
const ROUND_ORDER = ['preflop', 'flop', 'turn', 'river'];

function nextRound(lobby) {
    // Reset acțiuni
    lobby.players.forEach(p => {
        p.hasActed = false;
        p.currentBet = 0;
    });
    lobby.currentBet = 0;

    const currentRoundIdx = ROUND_ORDER.indexOf(lobby.round);

    if (currentRoundIdx >= ROUND_ORDER.length - 1) {
        // Showdown
        showdown(lobby);
        return;
    }

    lobby.round = ROUND_ORDER[currentRoundIdx + 1];

    // Distribuie cărți comunitare
    if (lobby.round === 'flop') {
        lobby.communityCards = dealCards(3);
    } else if (lobby.round === 'turn' || lobby.round === 'river') {
        lobby.communityCards.push(...dealCards(1));
    }

    broadcastToLobby(lobby, `!{Green}[POKER] ══ ${lobby.round.toUpperCase()} ══ Cărți: ${lobby.communityCards.join(' ')}`);
    callToLobby(lobby, 'pokerUpdateState', getLobbyStateForUI(lobby));

    lobby.currentPlayerIndex = (lobby.dealerIndex + 1) % lobby.players.length;
    startTurn(lobby);
}

// ──────────────────────────────────────────
// Procesare acțiuni jucător
// ──────────────────────────────────────────
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
            slot.hasActed = true;
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
            if (toCall <= 0) {
                player.outputChatBox('!{Red}Nu ai ce să call-uiești.');
                return;
            }
            const actualCall = Math.min(toCall, slot.chips);
            slot.chips -= actualCall;
            slot.currentBet += actualCall;
            lobby.pot += actualCall;
            slot.hasActed = true;
            broadcastToLobby(lobby, `!{Cyan}[POKER] ${player.name} a dat Call ($${actualCall}). Pot: $${lobby.pot}`);
            break;
        }

        case 'raise': {
            const minRaise = lobby.currentBet + LOBBY_CONFIG.BIG_BLIND;
            const amount = raiseAmount >= minRaise ? raiseAmount : minRaise;
            if (slot.chips < amount) {
                player.outputChatBox('!{Red}Nu ai destui chips!');
                return;
            }
            const toAdd = amount - slot.currentBet;
            slot.chips -= toAdd;
            lobby.pot += toAdd;
            slot.currentBet = amount;
            lobby.currentBet = amount;
            slot.hasActed = true;
            // Resetăm hasActed la ceilalți (trebuie să răspundă)
            lobby.players.forEach(p => {
                if (p !== slot && !p.hasFolded) p.hasActed = false;
            });
            broadcastToLobby(lobby, `!{Yellow}[POKER] ${player.name} a dat Raise la $${amount}. Pot: $${lobby.pot}`);
            break;
        }

        case 'allin': {
            const allInAmount = slot.chips + slot.currentBet;
            lobby.pot += slot.chips;
            slot.currentBet += slot.chips;
            slot.chips = 0;
            if (slot.currentBet > lobby.currentBet) {
                lobby.currentBet = slot.currentBet;
                lobby.players.forEach(p => {
                    if (p !== slot && !p.hasFolded) p.hasActed = false;
                });
            }
            slot.hasActed = true;
            broadcastToLobby(lobby, `!{Orange}[POKER] ${player.name} este ALL-IN ($${allInAmount})! Pot: $${lobby.pot}`);
            break;
        }

        default:
            player.outputChatBox('!{Red}Acțiune invalidă.');
            return;
    }

    updateLobbyUI(lobby);
    nextTurn(lobby);
}

// ──────────────────────────────────────────
// Showdown & End Round
// ──────────────────────────────────────────
function showdown(lobby) {
    broadcastToLobby(lobby, '!{Green}[POKER] ══ SHOWDOWN ══');
    const active = lobby.players.filter(p => !p.hasFolded);
    active.forEach(slot => {
        broadcastToLobby(lobby, `${slot.player.name}: ${slot.cards.join(' ')}`);
    });

    // Câștigătorul e ales random (înlocuiește cu evaluare hand reală)
    const winner = active[Math.floor(Math.random() * active.length)];
    endRound(lobby, winner);
}

function endRound(lobby, winnerSlot) {
    winnerSlot.chips += lobby.pot;
    broadcastToLobby(lobby, `!{Green}[POKER] 🏆 ${winnerSlot.player.name} a câștigat runda și $${lobby.pot}!`);

    if (lobby.turnTimer) {
        clearInterval(lobby.turnTimer);
        lobby.turnTimer = null;
    }

    // Elimină jucătorii fără chips
    const eliminated = lobby.players.filter(p => p.chips <= 0);
    eliminated.forEach(slot => {
        slot.player.outputChatBox('!{Red}[POKER] Nu mai ai chips! Ai fost eliminat.');
        broadcastToLobby(lobby, `!{Red}[POKER] ${slot.player.name} a fost eliminat (0 chips).`);
    });
    lobby.players = lobby.players.filter(p => p.chips > 0);

    updateLobbyUI(lobby);

    // Runda nouă după 5 secunde
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

// ──────────────────────────────────────────
// UI Helpers
// ──────────────────────────────────────────
function getLobbyStateForUI(lobby) {
    return {
        round: lobby.round,
        pot: lobby.pot,
        currentBet: lobby.currentBet,
        communityCards: lobby.communityCards,
        currentPlayer: lobby.players[lobby.currentPlayerIndex]?.player?.name || '',
        players: lobby.players.map(p => ({
            name: p.player.name,
            chips: p.chips,
            seat: p.seat,
            hasFolded: p.hasFolded,
            currentBet: p.currentBet,
        })),
    };
}

function updateLobbyUI(lobby) {
    callToLobby(lobby, 'pokerUpdateState', getLobbyStateForUI(lobby));
}

// ──────────────────────────────────────────
// Events RAGE:MP
// ──────────────────────────────────────────
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

// Trigger join din colshape
mp.events.add('Server_PlayerAction', (player, actionName, tableIndex, tableName) => {
    if (actionName === 'interact') {
        if (player.currentTable) {
            const idx = player.currentTable.getVariable('tableIndex');
            const name = player.currentTable.getVariable('tableName');
            joinLobby(player, idx, name);
        } else {
            player.outputChatBox('Nu ești lângă nicio masă de poker.');
        }
    }
});

module.exports = { joinLobby, leaveLobby, processAction, lobbies };