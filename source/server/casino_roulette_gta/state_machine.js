// ═══════════════════════════════════════════════════════════════
// CASINO ROULETTE GTA — STATE MACHINE & GAME LOGIC
// Recreated from decompiled casinoroulette.c
// func_39 (main state machine), func_40-func_43, func_45-func_46,
// func_54-func_56, func_62, func_76, func_80, func_102
// ═══════════════════════════════════════════════════════════════

const { CONFIG, BET_TYPES, RED_NUMBERS, BLACK_NUMBERS, getNumberColor, getBetNumbers } = require('./config');
const dealerMgr = require('./dealer');
const speech    = require('./speech');
const logger    = require('./logger');
const tables    = require('./tables');

// ──────────────────────────────────────────
// LOBBY / TABLE STATE
// Each table has its own lobby with players, state, etc.
// (from func_2 — iterates over 6 tables, each with 4 seats)
// ──────────────────────────────────────────
const lobbies = {};

function createLobby(tableIndex, tableName, casinoId) {
    return {
        id: tableIndex,
        name: tableName,
        casinoId: casinoId || null,

        // State machine (from func_39 switch)
        state: CONFIG.STATES.WAITING,
        subState: 0,           // sub-state for multi-step phases

        // Players (max 4 per table, from decompiled: SEATS_PER_TABLE = 4)
        players: [],

        // Timing
        betTimer: null,
        betTimeLeft: 0,
        payoutTimer: null,
        stateTimer: null,
        roundStartTime: 0,

        // Results
        lastResult: null,
        history: [],            // last ~20 results
        roundNumber: 0,

        // Dealer animation state
        dealerAnimQueue: [],
        chipClearStep: 0,

        // Flags (from decompiled bit operations)
        flags: 0,
    };
}

// ──────────────────────────────────────────
// PLAYER SLOT (from decompiled structure with 4 slots per table)
// ──────────────────────────────────────────
function createPlayerSlot(player, seatIndex) {
    return {
        player,
        seat: seatIndex,
        chips: player.money || 10000,
        bets: [],
        totalBet: 0,
        lastWin: 0,
        playerState: 0,     // per-player state within the round
        ready: false,        // ready for next round
        flags: 0,
    };
}

// ──────────────────────────────────────────
// LOBBY UTILITIES
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
        try { slot.player.outputChatBox(message); } catch (e) {}
    });
}

function callToLobby(lobby, eventName, ...args) {
    lobby.players.forEach(slot => {
        try { slot.player.call(eventName, ...args); } catch (e) {}
    });
}

// func_56 — Validate player: seat valid, player ID exists, active/participating
function isPlayerValid(slot) {
    if (!slot || !slot.player) return false;
    try {
        return slot.player.id !== undefined;
    } catch (e) {
        return false;
    }
}

// func_55 — Check if all seated players are in a specific state
function allPlayersInState(lobby, targetState) {
    for (const slot of lobby.players) {
        if (!isPlayerValid(slot)) continue;
        if (slot.playerState !== targetState) return false;
    }
    return true;
}

// func_46 — Get bet time based on player count
function getBetTimeForPlayerCount(count) {
    if (count <= 2) return CONFIG.BET_TIME_1_2_PLAYERS;
    if (count === 3) return CONFIG.BET_TIME_3_PLAYERS;
    return CONFIG.BET_TIME_4_PLAYERS;
}

// ──────────────────────────────────────────
// JOIN / LEAVE TABLE
// ──────────────────────────────────────────
function joinTable(player, tableIndex, tableName, casinoId) {
    if (getLobbyByPlayer(player)) {
        player.outputChatBox('!{Red}[CASINO ROULETTE] Ești deja la o masă!');
        return;
    }

    if (!lobbies[tableIndex]) {
        lobbies[tableIndex] = createLobby(tableIndex, tableName, casinoId);
    }

    const lobby = lobbies[tableIndex];

    if (lobby.players.length >= CONFIG.SEATS_PER_TABLE) {
        player.outputChatBox('!{Red}[CASINO ROULETTE] Masa este plină!');
        return;
    }

    // Find first available seat
    const usedSeats = new Set(lobby.players.map(p => p.seat));
    let seat = 0;
    while (usedSeats.has(seat)) seat++;

    const slot = createPlayerSlot(player, seat);
    lobby.players.push(slot);

    // Notify
    player.outputChatBox(`!{c9a84c}[CASINO ROULETTE] !{White}Te-ai așezat la masă pe locul ${seat + 1}.`);
    broadcastToLobby(lobby, `!{c9a84c}[CASINO ROULETTE] !{Cyan}${player.name} !{White}s-a alăturat (${lobby.players.length}/${CONFIG.SEATS_PER_TABLE})`);
    logger.onPlayerJoin(tableIndex, tableName, player.name, lobby.players.length, CONFIG.SEATS_PER_TABLE);

    // Client: open UI + lock input (func_249 equivalent)
    player.call('gtaRoulette:openUI');
    player.call('gtaRoulette:lockInput', [true]);

    // Dealer greeting speech (from func_50 — DEALER_GREET)
    const greetData = dealerMgr.getDealerSpeech(tableIndex, speech.DEALER_SPEECH.GREET);
    if (greetData) callToLobby(lobby, 'gtaRoulette:dealerSpeech', [JSON.stringify(greetData)]);

    // Update dealer idle animation (now has players)
    const idleAnim = dealerMgr.setDealerIdle(tableIndex, true);
    if (idleAnim) callToLobby(lobby, 'gtaRoulette:dealerAnim', [JSON.stringify(idleAnim)]);

    // Send state to all players
    updateLobbyUI(lobby);

    // Start betting if enough players (from func_105 logic)
    if (lobby.state === CONFIG.STATES.WAITING && lobby.players.length >= 1) {
        startBettingPhase(lobby);
    }
}

function leaveTable(player) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) return;

    const leavingIndex = lobby.players.findIndex(p => p.player === player);
    if (leavingIndex === -1) return;

    const slot = lobby.players[leavingIndex];
    logger.onPlayerLeave(lobby.id, lobby.name, player.name, lobby.state);

    // Return unresolved bets during betting phase
    if (lobby.state === CONFIG.STATES.BETTING && slot.totalBet > 0) {
        slot.chips += slot.totalBet;
        player.outputChatBox(`!{c9a84c}[CASINO ROULETTE] !{White}Pariurile tale ($${slot.totalBet}) au fost returnate.`);
    }

    // Update player money
    if (!player._isBot) {
        try { mp.events.call('casinoRouletteGTA:updateMoney', player, slot.chips); } catch (e) {}
    }

    // Unlock input + close UI (func_251 equivalent)
    try {
        player.call('gtaRoulette:closeUI');
        player.call('gtaRoulette:lockInput', [false]);
    } catch (e) {}

    // Dealer farewell speech
    const farewellData = dealerMgr.getDealerSpeech(lobby.id, speech.DEALER_SPEECH.FAREWELL);
    if (farewellData) callToLobby(lobby, 'gtaRoulette:dealerSpeech', [JSON.stringify(farewellData)]);

    player.outputChatBox('!{c9a84c}[CASINO ROULETTE] !{White}Ai părăsit masa.');
    lobby.players.splice(leavingIndex, 1);
    lobby.players.forEach((p, i) => { p.seat = i; });

    broadcastToLobby(lobby, `!{c9a84c}[CASINO ROULETTE] !{Cyan}${player.name} !{White}a părăsit masa.`);

    // Update dealer idle (maybe empty table now)
    const hasPlayers = lobby.players.length > 0;
    const idleAnim = dealerMgr.setDealerIdle(lobby.id, hasPlayers);
    if (idleAnim && hasPlayers) callToLobby(lobby, 'gtaRoulette:dealerAnim', [JSON.stringify(idleAnim)]);

    // Cancel betting if not enough players
    if (lobby.players.length < 1 && lobby.state === CONFIG.STATES.BETTING) {
        if (lobby.betTimer) { clearInterval(lobby.betTimer); lobby.betTimer = null; }
        lobby.state = CONFIG.STATES.WAITING;
        lobby.players.forEach(s => {
            if (s.totalBet > 0) {
                s.chips += s.totalBet;
                s.bets = [];
                s.totalBet = 0;
            }
        });
        broadcastToLobby(lobby, '!{Red}[CASINO ROULETTE] Nu mai sunt suficienți jucători. Pariurile au fost returnate.');
    }

    updateLobbyUI(lobby);
}

// ──────────────────────────────────────────
// STATE 2: BETTING PHASE (from func_80)
// ──────────────────────────────────────────
function startBettingPhase(lobby) {
    lobby.state = CONFIG.STATES.BETTING;
    lobby.betTimeLeft = getBetTimeForPlayerCount(lobby.players.length);
    lobby.roundNumber++;
    lobby.roundStartTime = Date.now();

    // Reset bets
    lobby.players.forEach(slot => {
        slot.bets = [];
        slot.totalBet = 0;
        slot.lastWin = 0;
        slot.playerState = CONFIG.STATES.BETTING;
        slot.ready = false;
    });

    // Dealer "place your bets" speech (from func_50)
    const speechData = dealerMgr.getDealerSpeech(lobby.id, speech.DEALER_SPEECH.PLACE_BET);
    if (speechData) callToLobby(lobby, 'gtaRoulette:dealerSpeech', [JSON.stringify(speechData)]);

    broadcastToLobby(lobby, `!{c9a84c}[CASINO ROULETTE] !{White}Plasați pariurile! Aveți ${lobby.betTimeLeft} secunde.`);
    callToLobby(lobby, 'gtaRoulette:updateState', [getLobbyStateForUI(lobby)]);
    callToLobby(lobby, 'gtaRoulette:bettingStart', [lobby.betTimeLeft]);

    // Play sound effect
    callToLobby(lobby, 'gtaRoulette:playSound', [speech.SOUND_EFFECTS.CLICK]);

    lobby.betTimer = setInterval(() => {
        lobby.betTimeLeft--;
        callToLobby(lobby, 'gtaRoulette:betTimer', [lobby.betTimeLeft]);

        if (lobby.betTimeLeft <= 0) {
            clearInterval(lobby.betTimer);
            lobby.betTimer = null;

            // STATE 3: No more bets (from func_10 case 23)
            lobby.state = CONFIG.STATES.NO_MORE_BETS;

            const closedSpeech = dealerMgr.getDealerSpeech(lobby.id, speech.DEALER_SPEECH.CLOSED_BETS);
            if (closedSpeech) callToLobby(lobby, 'gtaRoulette:dealerSpeech', [JSON.stringify(closedSpeech)]);

            // Dealer "no_more_bets" animation
            const noMoreBetsAnim = dealerMgr.setDealerAnim(lobby.id, CONFIG.DEALER_ANIM_STATES.NO_MORE_BETS);
            if (noMoreBetsAnim) callToLobby(lobby, 'gtaRoulette:dealerAnim', [JSON.stringify(noMoreBetsAnim)]);

            broadcastToLobby(lobby, '!{c9a84c}[CASINO ROULETTE] !{Red}Nu se mai acceptă pariuri!');

            // Short delay then spin (like GTA V transition)
            setTimeout(() => { startSpin(lobby); }, 2000);
        }
    }, 1000);
}

// ──────────────────────────────────────────
// PLACE BET
// ──────────────────────────────────────────
function placeBet(player, betType, betValue, amount) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby || lobby.state !== CONFIG.STATES.BETTING) {
        player.outputChatBox('!{Red}[CASINO ROULETTE] Nu poți paria acum!');
        return;
    }

    const slot = getPlayerSlot(lobby, player);
    if (!slot) return;

    if (!BET_TYPES[betType]) {
        player.outputChatBox('!{Red}[CASINO ROULETTE] Tip de pariu invalid!');
        return;
    }

    if (amount < CONFIG.MIN_BET) {
        player.outputChatBox(`!{Red}[CASINO ROULETTE] Pariul minim este $${CONFIG.MIN_BET}!`);
        return;
    }

    if (amount > CONFIG.MAX_BET) {
        player.outputChatBox(`!{Red}[CASINO ROULETTE] Pariul maxim este $${CONFIG.MAX_BET}!`);
        return;
    }

    if (slot.bets.length >= CONFIG.MAX_BETS_PER_PLAYER) {
        player.outputChatBox(`!{Red}[CASINO ROULETTE] Ai atins numărul maxim de pariuri (${CONFIG.MAX_BETS_PER_PLAYER})!`);
        return;
    }

    if (amount > slot.chips) {
        // func_50 — REFUSE_BETS dealer speech
        const refuseSpeech = dealerMgr.getDealerSpeech(lobby.id, speech.DEALER_SPEECH.REFUSE_BETS);
        if (refuseSpeech) player.call('gtaRoulette:dealerSpeech', JSON.stringify(refuseSpeech));
        player.outputChatBox('!{Red}[CASINO ROULETTE] Nu ai suficienți chips!');
        return;
    }

    const numbers = getBetNumbers(betType, betValue);
    if (numbers.length === 0) {
        player.outputChatBox('!{Red}[CASINO ROULETTE] Pariu invalid!');
        return;
    }

    slot.chips -= amount;
    slot.totalBet += amount;
    slot.bets.push({
        type: betType,
        value: betValue,
        numbers: numbers,
        amount: amount,
        payout: BET_TYPES[betType].payout,
    });

    // Chip place sound
    player.call('gtaRoulette:playSound', [speech.SOUND_EFFECTS.CHIP_PLACE]);

    const label = BET_TYPES[betType].label;
    player.outputChatBox(`!{c9a84c}[CASINO ROULETTE] !{White}Pariu: !{Yellow}${label} !{White}— !{Green}$${amount} !{White}(Chips: $${slot.chips})`);

    player.call('gtaRoulette:updateBets', [JSON.stringify(slot.bets), slot.chips, slot.totalBet]);
    callToLobby(lobby, 'gtaRoulette:updateState', [getLobbyStateForUI(lobby)]);
}

// ──────────────────────────────────────────
// CLEAR BETS
// ──────────────────────────────────────────
function clearBets(player) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby || lobby.state !== CONFIG.STATES.BETTING) {
        player.outputChatBox('!{Red}[CASINO ROULETTE] Nu poți șterge pariurile acum!');
        return;
    }

    const slot = getPlayerSlot(lobby, player);
    if (!slot) return;

    if (slot.totalBet > 0) {
        slot.chips += slot.totalBet;
        slot.bets = [];
        slot.totalBet = 0;

        player.call('gtaRoulette:playSound', [speech.SOUND_EFFECTS.CHIP_REMOVE]);
        player.outputChatBox(`!{c9a84c}[CASINO ROULETTE] !{White}Pariurile au fost șterse. Chips: $${slot.chips}`);
        player.call('gtaRoulette:updateBets', [JSON.stringify(slot.bets), slot.chips, slot.totalBet]);
        callToLobby(lobby, 'gtaRoulette:updateState', [getLobbyStateForUI(lobby)]);
    }
}

// ──────────────────────────────────────────
// STATE 4: SPINNING (from func_76)
// ──────────────────────────────────────────
function startSpin(lobby) {
    lobby.state = CONFIG.STATES.SPINNING;

    logger.onBetsPlaced(lobby);

    // Generate winning number (European roulette: 0-36)
    const winningNumber = Math.floor(Math.random() * 37);
    const winningColor = getNumberColor(winningNumber);
    lobby.lastResult = { number: winningNumber, color: winningColor };

    console.log(`[CASINO_ROULETTE_GTA] SPIN: Table "${lobby.name}" → ${winningNumber} (${winningColor})`);
    logger.onSpinResult(lobby, lobby.lastResult);
    logger.onSpinStart(lobby);

    // Dealer "spin_wheel" animation (from func_10 case 22)
    const spinAnim = dealerMgr.setDealerAnim(lobby.id, CONFIG.DEALER_ANIM_STATES.SPIN_WHEEL);
    if (spinAnim) callToLobby(lobby, 'gtaRoulette:dealerAnim', [JSON.stringify(spinAnim)]);

    // Ball loop sound
    callToLobby(lobby, 'gtaRoulette:playSound', [speech.SOUND_EFFECTS.BALL_LOOP]);

    broadcastToLobby(lobby, '!{c9a84c}[CASINO ROULETTE] !{White}Bila se învârte...');
    callToLobby(lobby, 'gtaRoulette:spinStart', [winningNumber, winningColor, CONFIG.SPIN_TIME]);

    // After spin time → result phase
    setTimeout(() => {
        spinComplete(lobby);
    }, CONFIG.SPIN_TIME * 1000);
}

// ──────────────────────────────────────────
// STATE 5: RESULT / ANNOUNCEMENT (from func_62, func_63)
// Ball stopped → dealer announces number → clear chips animation
// ──────────────────────────────────────────
function spinComplete(lobby) {
    lobby.state = CONFIG.STATES.RESULT;
    const { number, color } = lobby.lastResult;

    // Ball stop sound
    callToLobby(lobby, 'gtaRoulette:playSound', [speech.SOUND_EFFECTS.BALL_STOP]);

    // Dealer announces the winning number (from func_52)
    const ballSpeech = dealerMgr.getDealerBallAnnouncement(lobby.id, number);
    if (ballSpeech) callToLobby(lobby, 'gtaRoulette:dealerSpeech', [JSON.stringify(ballSpeech)]);

    // Chip clearing animation sequence (from func_63)
    // Determine which zones have chips (1, 2, 3 based on bet positions)
    const activeZones = determineActiveChipZones(lobby);
    const clearSequence = dealerMgr.getChipClearSequence(lobby.id, activeZones);
    if (clearSequence.length > 0) {
        callToLobby(lobby, 'gtaRoulette:dealerAnimSequence', [JSON.stringify(clearSequence)]);
    }

    // Short delay for announcement, then proceed to payout
    setTimeout(() => {
        evaluateResults(lobby);
    }, 3000);
}

// Determine which chip zones have bets (simplified from bit-flag checks in func_66)
function determineActiveChipZones(lobby) {
    const zones = new Set();
    lobby.players.forEach(slot => {
        slot.bets.forEach(bet => {
            bet.numbers.forEach(num => {
                if (num >= 1 && num <= 12) zones.add(1);
                if (num >= 13 && num <= 24) zones.add(2);
                if (num >= 25 && num <= 36) zones.add(3);
            });
        });
    });
    return Array.from(zones);
}

// ──────────────────────────────────────────
// STATE 6: PAYOUT (from func_43)
// ──────────────────────────────────────────
function evaluateResults(lobby) {
    lobby.state = CONFIG.STATES.PAYOUT;
    const { number, color } = lobby.lastResult;

    // Add to history
    lobby.history.unshift({ number, color });
    if (lobby.history.length > 20) lobby.history.pop();

    const colorName = color === 'red' ? 'Roșu' : color === 'black' ? 'Negru' : 'Verde';
    broadcastToLobby(lobby, `!{c9a84c}[CASINO ROULETTE] !{White}Numărul câștigător: !{${color === 'red' ? 'Red' : color === 'black' ? 'White' : 'Green'}}${number} (${colorName})`);

    let totalHouseProfit = 0;

    lobby.players.forEach(slot => {
        let totalWin = 0;

        slot.bets.forEach(bet => {
            if (bet.numbers.includes(number)) {
                const win = bet.amount + (bet.amount * bet.payout);
                totalWin += win;
            }
        });

        if (totalWin > 0) {
            slot.chips += totalWin;
            slot.lastWin = totalWin;
            slot.playerState = CONFIG.STATES.PAYOUT;

            // Win sound
            try { slot.player.call('gtaRoulette:playSound', [speech.SOUND_EFFECTS.WIN_CHIPS]); } catch (e) {}

            // Dealer win speech
            const winSpeech = totalWin >= 10000
                ? dealerMgr.getDealerSpeech(lobby.id, speech.DEALER_SPEECH.BIG_WIN)
                : dealerMgr.getDealerSpeech(lobby.id, speech.DEALER_SPEECH.PLAYER_WIN);
            if (winSpeech) callToLobby(lobby, 'gtaRoulette:dealerSpeech', [JSON.stringify(winSpeech)]);

            broadcastToLobby(lobby, `!{c9a84c}[CASINO ROULETTE] !{Yellow}${slot.player.name} !{White}a câștigat !{Green}$${totalWin}!{White}!`);
            logger.onPlayerWin(lobby, slot.player.name, totalWin, slot.totalBet);
        } else if (slot.totalBet > 0) {
            slot.lastWin = 0;
            totalHouseProfit += slot.totalBet;
            slot.playerState = CONFIG.STATES.PAYOUT;

            // Dealer lose speech
            const loseSpeech = dealerMgr.getDealerSpeech(lobby.id, speech.DEALER_SPEECH.PLAYER_LOSE);
            if (loseSpeech) {
                try { slot.player.call('gtaRoulette:dealerSpeech', [JSON.stringify(loseSpeech)]); } catch (e) {}
            }

            try { slot.player.outputChatBox(`!{c9a84c}[CASINO ROULETTE] !{Red}Ai pierdut $${slot.totalBet}.`); } catch (e) {}
            logger.onPlayerLose(lobby, slot.player.name, slot.totalBet);
        }

        // Update money
        if (!slot.player._isBot) {
            try { mp.events.call('casinoRouletteGTA:updateMoney', slot.player, slot.chips); } catch (e) {}
        }
    });

    logger.onGameEnd(lobby, totalHouseProfit);

    // Send result to UI
    callToLobby(lobby, 'gtaRoulette:showResult', [number, color, getLobbyStateForUI(lobby)]);

    // STATE 7: CLEANUP (from func_40)
    // After result delay, clean up and potentially start new round
    setTimeout(() => {
        cleanup(lobby);
    }, CONFIG.RESULT_DELAY * 1000);
}

// ──────────────────────────────────────────
// STATE 7: CLEANUP → BACK TO WAITING/BETTING (from func_40)
// ──────────────────────────────────────────
function cleanup(lobby) {
    lobby.state = CONFIG.STATES.CLEANUP;

    // Dealer "another go?" speech (from func_47)
    const anotherGoSpeech = dealerMgr.getDealerSpeech(lobby.id, speech.DEALER_SPEECH.ANOTHER_GO);
    if (anotherGoSpeech) callToLobby(lobby, 'gtaRoulette:dealerSpeech', [JSON.stringify(anotherGoSpeech)]);

    // Eliminate players with 0 chips
    const eliminated = lobby.players.filter(p => p.chips <= 0);
    eliminated.forEach(slot => {
        try {
            slot.player.outputChatBox('!{Red}[CASINO ROULETTE] Nu mai ai chips! Ai fost eliminat.');
            slot.player.call('gtaRoulette:closeUI');
            slot.player.call('gtaRoulette:lockInput', [false]);
        } catch (e) {}
        broadcastToLobby(lobby, `!{Red}[CASINO ROULETTE] ${slot.player.name} a fost eliminat (0 chips).`);
    });
    lobby.players = lobby.players.filter(p => p.chips > 0);
    lobby.players.forEach((p, i) => { p.seat = i; });

    // Reset flags (from func_42 — clear bit 1)
    lobby.flags = 0;
    lobby.chipClearStep = 0;
    lobby.dealerAnimQueue = [];

    // Return dealer to idle (from func_7, func_105)
    const hasPlayers = lobby.players.length > 0;
    const idleAnim = dealerMgr.setDealerIdle(lobby.id, hasPlayers);
    if (idleAnim && hasPlayers) callToLobby(lobby, 'gtaRoulette:dealerAnim', [JSON.stringify(idleAnim)]);

    updateLobbyUI(lobby);

    // Transition (from func_40 → state 1 or back to betting)
    if (lobby.players.length >= 1) {
        lobby.state = CONFIG.STATES.WAITING;
        broadcastToLobby(lobby, `!{c9a84c}[CASINO ROULETTE] !{White}Rundă nouă în ${CONFIG.RESULT_DELAY} secunde...`);

        setTimeout(() => {
            if (lobby.players.length >= 1) {
                startBettingPhase(lobby);
            } else {
                lobby.state = CONFIG.STATES.WAITING;
                broadcastToLobby(lobby, '!{Red}[CASINO ROULETTE] Nu sunt suficienți jucători.');
            }
        }, CONFIG.RESULT_DELAY * 1000);
    } else {
        lobby.state = CONFIG.STATES.WAITING;
    }
}

// ──────────────────────────────────────────
// UI STATE HELPER
// ──────────────────────────────────────────
function getLobbyStateForUI(lobby) {
    // Map internal state numbers to string names for UI
    const stateNames = {
        [CONFIG.STATES.IDLE]: 'waiting',
        [CONFIG.STATES.WAITING]: 'waiting',
        [CONFIG.STATES.BETTING]: 'betting',
        [CONFIG.STATES.NO_MORE_BETS]: 'spinning',
        [CONFIG.STATES.SPINNING]: 'spinning',
        [CONFIG.STATES.RESULT]: 'result',
        [CONFIG.STATES.PAYOUT]: 'result',
        [CONFIG.STATES.CLEANUP]: 'waiting',
    };

    return {
        state: stateNames[lobby.state] || 'waiting',
        stateCode: lobby.state,
        betTimeLeft: lobby.betTimeLeft || 0,
        lastResult: lobby.lastResult,
        history: lobby.history,
        roundNumber: lobby.roundNumber,
        players: lobby.players.map(p => ({
            name: p.player.name,
            chips: p.chips,
            seat: p.seat,
            totalBet: p.totalBet,
            lastWin: p.lastWin || 0,
            betsCount: p.bets.length,
        })),
    };
}

function updateLobbyUI(lobby) {
    callToLobby(lobby, 'gtaRoulette:updateState', [getLobbyStateForUI(lobby)]);
    tables.updateTableMarker(lobby.id, lobby.state, lobby.players.length, CONFIG.SEATS_PER_TABLE);
}

module.exports = {
    lobbies,
    createLobby,
    getLobbyByPlayer,
    getPlayerSlot,
    joinTable,
    leaveTable,
    startBettingPhase,
    placeBet,
    clearBets,
    startSpin,
    evaluateResults,
    cleanup,
    getLobbyStateForUI,
    updateLobbyUI,
    broadcastToLobby,
    callToLobby,
};
