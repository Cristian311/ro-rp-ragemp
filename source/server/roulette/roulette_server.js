const rouletteLog = require('./roulette_logger');

// ──────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────
const ROULETTE_CONFIG = {
    MAX_PLAYERS: 4,
    MIN_PLAYERS: 1,
    BET_TIME: 10,           // secunde pentru plasarea pariurilor
    SPIN_TIME: 18,          // secunde — trebuie >= durata animației (intro+loop+exit)
    RESULT_DELAY: 6,        // secunde afișare rezultat înainte de runda nouă
    MIN_BET: 10,
    MAX_BET: 50000,
    MAX_BETS_PER_PLAYER: 20,
    HOUSE_CUT_PERCENT: 0,   // La ruletă casa câștigă din 0 (edge), nu rake
};

// ──────────────────────────────────────────
// ROULETTE NUMBERS & COLORS (American Roulette — 0 + 00)
// ──────────────────────────────────────────
const RED_NUMBERS  = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

// All possible numbers on the wheel (0, 00, 1-36)
const ALL_NUMBERS = [0, '00', 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36];

function getNumberColor(num) {
    if (num === 0 || num === '00') return 'green';
    if (RED_NUMBERS.includes(num)) return 'red';
    return 'black';
}

// ──────────────────────────────────────────
// BET TYPES & PAYOUTS
// ──────────────────────────────────────────
const BET_TYPES = {
    straight:  { payout: 35, label: 'Număr direct' },   // un singur număr
    split:     { payout: 17, label: 'Split' },           // 2 numere
    street:    { payout: 11, label: 'Street' },          // 3 numere (rând)
    corner:    { payout: 8,  label: 'Corner' },          // 4 numere
    line:      { payout: 5,  label: 'Line' },            // 6 numere (2 rânduri)
    column:    { payout: 2,  label: 'Coloană' },         // 12 numere (coloană)
    dozen:     { payout: 2,  label: 'Duzină' },          // 12 numere (1-12, 13-24, 25-36)
    red:       { payout: 1,  label: 'Roșu' },
    black:     { payout: 1,  label: 'Negru' },
    odd:       { payout: 1,  label: 'Impar' },
    even:      { payout: 1,  label: 'Par' },
    low:       { payout: 1,  label: '1-18' },
    high:      { payout: 1,  label: '19-36' },
};

// Returnează numerele acoperite de un pariu
function getBetNumbers(betType, betValue) {
    switch (betType) {
        case 'straight': return [betValue];
        case 'split':    return betValue; // array de 2
        case 'street':   return betValue; // array de 3
        case 'corner':   return betValue; // array de 4
        case 'line':     return betValue; // array de 6
        case 'column': {
            const col = betValue; // 1, 2 sau 3
            const nums = [];
            for (let i = col; i <= 36; i += 3) nums.push(i);
            return nums;
        }
        case 'dozen': {
            const d = betValue; // 1, 2 sau 3
            const start = (d - 1) * 12 + 1;
            const nums = [];
            for (let i = start; i < start + 12; i++) nums.push(i);
            return nums;
        }
        case 'red':   return [...RED_NUMBERS];
        case 'black': return [...BLACK_NUMBERS];
        case 'odd': {
            const nums = [];
            for (let i = 1; i <= 36; i += 2) nums.push(i);
            return nums;
        }
        case 'even': {
            const nums = [];
            for (let i = 2; i <= 36; i += 2) nums.push(i);
            return nums;
        }
        case 'low': {
            const nums = [];
            for (let i = 1; i <= 18; i++) nums.push(i);
            return nums;
        }
        case 'high': {
            const nums = [];
            for (let i = 19; i <= 36; i++) nums.push(i);
            return nums;
        }
        default: return [];
    }
}

// ──────────────────────────────────────────
// LOBBY MANAGEMENT
// ──────────────────────────────────────────
function createLobby(tableIndex, tableName, casinoId, tablePos) {
    return {
        id: tableIndex,
        name: tableName,
        casinoId: casinoId || null,
        state: 'waiting',  // waiting | betting | spinning | result
        players: [],
        betTimer: null,
        betTimeLeft: 0,
        lastResult: null,
        history: loadTableHistory(tableIndex),  // persisted history
        tablePos: tablePos || null,
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
// JOIN / LEAVE
// ──────────────────────────────────────────
function joinLobby(player, tableIndex, tableName, casinoId, tableX, tableY, tableZ, tableHeading) {
    if (getLobbyByPlayer(player)) {
        player.outputChatBox('!{Red}Ești deja la o masă de ruletă!');
        return;
    }

    if (!lobbies[tableIndex]) {
        lobbies[tableIndex] = createLobby(tableIndex, tableName, casinoId, { x: tableX, y: tableY, z: tableZ, heading: tableHeading });
    }

    const lobby = lobbies[tableIndex];

    if (lobby.players.length >= ROULETTE_CONFIG.MAX_PLAYERS) {
        player.outputChatBox('!{Red}Masa este plină!');
        return;
    }

    const usedSeats = new Set(lobby.players.map(p => p.seat));
    let seat = 0;
    while (usedSeats.has(seat)) seat++;

    lobby.players.push({
        player,
        seat,
        chips: player.money || 10000,
        bets: [],
        totalBet: 0,
        lastWin: 0,
    });

    player.outputChatBox(`!{Orange}[RULETĂ] Te-ai așezat la masă pe locul ${seat + 1}.`);
    broadcastToLobby(lobby, `!{Orange}[RULETĂ] !{Cyan}${player.name} !{White}s-a alăturat (${lobby.players.length}/${ROULETTE_CONFIG.MAX_PLAYERS})`);
    rouletteLog.onPlayerJoin(tableIndex, tableName, player.name, lobby.players.length, ROULETTE_CONFIG.MAX_PLAYERS);

    player.call('openRouletteUI', [tableX || 0, tableY || 0, tableZ || 0, tableHeading || 0, tableIndex, seat]);

    // Send saved grid corners
    const corners = getGridCorners('global');
    if (corners) {
        player.call('rouletteLoadGridCorners', [JSON.stringify(corners)]);
    }

    // Send roulette config
    const rConfig = loadRouletteConfig();
    if (rConfig) {
        player.call('rouletteLoadConfig', [JSON.stringify(rConfig)]);
    }

    callToLobby(lobby, 'rouletteUpdateState', [getLobbyStateForUI(lobby)]);

    // Dacă masa e în waiting și acum avem destui jucători, pornim betting
    if (lobby.state === 'waiting' && lobby.players.length >= ROULETTE_CONFIG.MIN_PLAYERS && !lobby.paused) {
        startBettingPhase(lobby);
    }
}

function leaveLobby(player) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) return;

    const leavingIndex = lobby.players.findIndex(p => p.player === player);
    if (leavingIndex === -1) return;

    const slot = lobby.players[leavingIndex];
    console.log(`[RULETĂ] LEAVE: ${player.name} părăsește masa "${lobby.name}"`);
    rouletteLog.onPlayerLeave(lobby.id, lobby.name, player.name, lobby.state);

    // Returnează pariurile neevaluate dacă suntem în faza de betting
    if (lobby.state === 'betting' && slot.totalBet > 0) {
        slot.chips += slot.totalBet;
        player.outputChatBox(`!{Orange}[RULETĂ] !{White}Pariurile tale ($${slot.totalBet}) au fost returnate.`);
    }

    if (!player._isBot) {
        mp.events.call('roulette:updatePlayerMoney', player, slot.chips);
    }

    player.call('closeRouletteUI');
    player.outputChatBox('!{Orange}[RULETĂ] !{White}Ai părăsit masa.');

    lobby.players.splice(leavingIndex, 1);
    lobby.players.forEach((p, i) => { p.seat = i; });

    broadcastToLobby(lobby, `!{Orange}[RULETĂ] !{Cyan}${player.name} !{White}a părăsit masa.`);

    if (lobby.players.length < ROULETTE_CONFIG.MIN_PLAYERS && lobby.state === 'betting') {
        if (lobby.betTimer) { clearInterval(lobby.betTimer); lobby.betTimer = null; }
        lobby.state = 'waiting';
        // Returnează pariurile tuturor
        lobby.players.forEach(s => {
            if (s.totalBet > 0) {
                s.chips += s.totalBet;
                s.bets = [];
                s.totalBet = 0;
            }
        });
        broadcastToLobby(lobby, '!{Red}[RULETĂ] Nu mai sunt suficienți jucători. Pariurile au fost returnate.');
    }

    updateLobbyUI(lobby);
}

// ──────────────────────────────────────────
// BETTING PHASE
// ──────────────────────────────────────────
function startBettingPhase(lobby) {
    lobby.state = 'betting';
    lobby.betTimeLeft = ROULETTE_CONFIG.BET_TIME;

    // Reset pariuri
    lobby.players.forEach(slot => {
        slot.bets = [];
        slot.totalBet = 0;
        slot.lastWin = 0;
    });

    broadcastToLobby(lobby, `!{Orange}[RULETĂ] !{White}Plasați pariurile! Aveți ${ROULETTE_CONFIG.BET_TIME} secunde.`);
    callToLobby(lobby, 'rouletteUpdateState', [getLobbyStateForUI(lobby)]);
    callToLobby(lobby, 'rouletteBettingStart', [ROULETTE_CONFIG.BET_TIME]);

    // Internal event for bots
    mp.events.call('_roulette_bettingPhaseStarted', lobby.id);

    lobby.betTimer = setInterval(() => {
        lobby.betTimeLeft--;
        callToLobby(lobby, 'rouletteBetTimer', [lobby.betTimeLeft]);

        if (lobby.betTimeLeft <= 0) {
            clearInterval(lobby.betTimer);
            lobby.betTimer = null;
            broadcastToLobby(lobby, '!{Orange}[RULETĂ] !{Red}Nu se mai acceptă pariuri!');
            startSpin(lobby);
        }
    }, 1000);
}

// ──────────────────────────────────────────
// PLACE BET
// ──────────────────────────────────────────
function placeBet(player, betType, betValue, amount) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby || lobby.state !== 'betting') {
        player.outputChatBox('!{Red}Nu poți paria acum!');
        return;
    }

    const slot = getPlayerSlot(lobby, player);
    if (!slot) return;

    if (!BET_TYPES[betType]) {
        player.outputChatBox('!{Red}Tip de pariu invalid!');
        return;
    }

    if (amount < ROULETTE_CONFIG.MIN_BET) {
        player.outputChatBox(`!{Red}Pariul minim este $${ROULETTE_CONFIG.MIN_BET}!`);
        return;
    }

    if (amount > ROULETTE_CONFIG.MAX_BET) {
        player.outputChatBox(`!{Red}Pariul maxim este $${ROULETTE_CONFIG.MAX_BET}!`);
        return;
    }

    if (slot.bets.length >= ROULETTE_CONFIG.MAX_BETS_PER_PLAYER) {
        player.outputChatBox(`!{Red}Ai atins numărul maxim de pariuri (${ROULETTE_CONFIG.MAX_BETS_PER_PLAYER})!`);
        return;
    }

    if (amount > slot.chips) {
        player.outputChatBox('!{Red}Nu ai suficienți bani!');
        return;
    }

    const numbers = getBetNumbers(betType, betValue);
    if (numbers.length === 0) {
        player.outputChatBox('!{Red}Pariu invalid!');
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

    const label = BET_TYPES[betType].label;
    player.outputChatBox(`!{Orange}[RULETĂ] !{White}Pariu plasat: !{Yellow}${label} !{White}— !{Green}$${amount} !{White}(Chips: $${slot.chips})`);

    // Update UI
    player.call('rouletteUpdateBets', [JSON.stringify(slot.bets), slot.chips, slot.totalBet]);
    callToLobby(lobby, 'rouletteUpdateState', [getLobbyStateForUI(lobby)]);
}

// ──────────────────────────────────────────
// CLEAR BETS
// ──────────────────────────────────────────
function clearBets(player) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby || lobby.state !== 'betting') {
        player.outputChatBox('!{Red}Nu poți șterge pariurile acum!');
        return;
    }

    const slot = getPlayerSlot(lobby, player);
    if (!slot) return;

    if (slot.totalBet > 0) {
        slot.chips += slot.totalBet;
        slot.bets = [];
        slot.totalBet = 0;
        player.outputChatBox('!{Orange}[RULETĂ] !{White}Pariurile au fost șterse. Chips: $' + slot.chips);
        player.call('rouletteUpdateBets', [JSON.stringify(slot.bets), slot.chips, slot.totalBet]);
        callToLobby(lobby, 'rouletteUpdateState', [getLobbyStateForUI(lobby)]);
    }
}

// ──────────────────────────────────────────
// SPIN
// ──────────────────────────────────────────
function startSpin(lobby) {
    lobby.state = 'spinning';

    rouletteLog.onBetsPlaced(lobby);

    // Generează numărul câștigător (American: 0, 00, 1-36 = 38 outcomes)
    const rng = Math.floor(Math.random() * 38);
    const winningNumber = rng === 37 ? '00' : rng; // 0-36 normal, 37 = "00"
    const winningColor = getNumberColor(winningNumber);

    lobby.lastResult = { number: winningNumber, color: winningColor };

    console.log(`[RULETĂ] SPIN: Masa "${lobby.name}" → ${winningNumber} (${winningColor})`);
    rouletteLog.onSpinResult(lobby, lobby.lastResult);
    rouletteLog.onSpinStart(lobby);

    broadcastToLobby(lobby, '!{Orange}[RULETĂ] !{White}Bila se învârte...');
    callToLobby(lobby, 'rouletteSpinStart', [winningNumber === '00' ? '00' : winningNumber, winningColor, ROULETTE_CONFIG.SPIN_TIME]);

    // Broadcast spin to all nearby players (spectators)
    const tablePos = lobby.tablePos;
    if (tablePos) {
        mp.players.forEachInRange(new mp.Vector3(tablePos.x, tablePos.y, tablePos.z), 50, (nearPlayer) => {
            if (!getPlayerSlot(lobby, nearPlayer)) {
                nearPlayer.call('rouletteNearbySpinStart', [
                    tablePos.x, tablePos.y, tablePos.z, tablePos.heading || 0,
                    winningNumber === '00' ? '00' : winningNumber, winningColor, ROULETTE_CONFIG.SPIN_TIME,
                    lobby.id
                ]);
            }
        });
    }

    // După animație, evaluează rezultatele
    setTimeout(() => {
        evaluateResults(lobby);
    }, ROULETTE_CONFIG.SPIN_TIME * 1000);
}

// ──────────────────────────────────────────
// EVALUATE RESULTS
// ──────────────────────────────────────────
function evaluateResults(lobby) {
    lobby.state = 'result';
    const { number, color } = lobby.lastResult;

    broadcastToLobby(lobby, `!{Orange}[RULETĂ] !{White}Numărul câștigător: !{${color === 'red' ? 'Red' : color === 'black' ? 'White' : 'Green'}}${number} (${color === 'red' ? 'Roșu' : color === 'black' ? 'Negru' : 'Verde'})`);

    // Adaugă la istoric
    lobby.history.unshift({ number, color });
    if (lobby.history.length > 20) lobby.history.pop();
    saveTableHistory(lobby.id, lobby.history);

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
            broadcastToLobby(lobby,
                `!{Orange}[RULETĂ] !{Yellow}${slot.player.name} !{White}a câștigat !{Green}$${totalWin}!{White}!`
            );
            rouletteLog.onPlayerWin(lobby, slot.player.name, totalWin, slot.totalBet);
            console.log(`[RULETĂ] WIN: ${slot.player.name} → $${totalWin} (pariu: $${slot.totalBet})`);
        } else if (slot.totalBet > 0) {
            slot.lastWin = 0;
            totalHouseProfit += slot.totalBet;
            slot.player.outputChatBox(`!{Orange}[RULETĂ] !{Red}Ai pierdut $${slot.totalBet}.`);
            rouletteLog.onPlayerLose(lobby, slot.player.name, slot.totalBet);
            console.log(`[RULETĂ] LOSE: ${slot.player.name} → -$${slot.totalBet}`);
        }

        // Update bani
        if (!slot.player._isBot) {
            mp.events.call('roulette:updatePlayerMoney', slot.player, slot.chips);
        }
    });

    rouletteLog.onGameEnd(lobby, totalHouseProfit);

    // Trimite rezultat la UI
    callToLobby(lobby, 'rouletteShowResult', [number, color, getLobbyStateForUI(lobby)]);

    // Elimină jucătorii fără chips
    setTimeout(() => {
        const eliminated = lobby.players.filter(p => p.chips <= 0);
        eliminated.forEach(slot => {
            slot.player.outputChatBox('!{Red}[RULETĂ] Nu mai ai chips! Ai fost eliminat.');
            slot.player.call('closeRouletteUI');
            broadcastToLobby(lobby, `!{Red}[RULETĂ] ${slot.player.name} a fost eliminat (0 chips).`);
        });
        lobby.players = lobby.players.filter(p => p.chips > 0);
        lobby.players.forEach((p, i) => { p.seat = i; });

        // Runda nouă sau așteptare
        if (lobby.players.length >= ROULETTE_CONFIG.MIN_PLAYERS && !lobby.paused) {
            broadcastToLobby(lobby, `!{Orange}[RULETĂ] !{White}Rundă nouă în ${ROULETTE_CONFIG.RESULT_DELAY} secunde...`);
            setTimeout(() => {
                if (lobby.players.length >= ROULETTE_CONFIG.MIN_PLAYERS && !lobby.paused) {
                    startBettingPhase(lobby);
                } else if (lobby.paused) {
                    lobby.state = 'waiting';
                    broadcastToLobby(lobby, '!{Red}[RULETĂ] Masa este pe pauză.');
                } else {
                    lobby.state = 'waiting';
                    broadcastToLobby(lobby, '!{Red}[RULETĂ] Nu sunt suficienți jucători.');
                }
            }, ROULETTE_CONFIG.RESULT_DELAY * 1000);
        } else {
            lobby.state = 'waiting';
            broadcastToLobby(lobby, '!{Red}[RULETĂ] Nu sunt suficienți jucători pentru o nouă rundă.');
        }

        updateLobbyUI(lobby);
    }, 2000);
}

// ──────────────────────────────────────────
// UI HELPERS
// ──────────────────────────────────────────
function getLobbyStateForUI(lobby) {
    return {
        state: lobby.state,
        betTimeLeft: lobby.betTimeLeft || 0,
        lastResult: lobby.lastResult,
        history: lobby.history,
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
    callToLobby(lobby, 'rouletteUpdateState', [getLobbyStateForUI(lobby)]);
    const visibleCount = lobby.players.length;
    mp.events.call('_roulette_updateMarker', lobby.id, lobby.state, visibleCount, ROULETTE_CONFIG.MAX_PLAYERS);
}

// ──────────────────────────────────────────
// EVENTS
// ──────────────────────────────────────────
mp.events.add('roulette:updatePlayerMoney', (player, newAmount) => {
    player.money = newAmount;
    if (global.hudUpdateMoney) global.hudUpdateMoney(player, newAmount);
    console.log(`[RULETĂ] MONEY_SET: ${player.name} → $${newAmount}`);
});

mp.events.add('Server_ReceiveRouletteBet', (player, betType, betValueJson, amount, chipX, chipY, chipZ) => {
    let betValue;
    if (betValueJson === '00') {
        betValue = '00';
    } else {
        try {
            betValue = JSON.parse(betValueJson);
        } catch (e) {
            betValue = parseInt(betValueJson);
            if (isNaN(betValue)) betValue = betValueJson;
        }
    }
    console.log(`[RULETĂ] BET: ${player.name} → ${betType} [${JSON.stringify(betValue)}] $${amount}`);
    placeBet(player, betType, betValue, parseInt(amount) || 0);

    // Broadcast chip position to other players at the table
    if (chipX !== undefined && chipY !== undefined && chipZ !== undefined) {
        const lobby = getLobbyByPlayer(player);
        if (lobby) {
            lobby.players.forEach(slot => {
                if (slot.player !== player) {
                    slot.player.call('rouletteOtherPlayerChip', [chipX, chipY, chipZ, parseInt(amount) || 10]);
                }
            });
        }
    }
});

mp.events.add('Server_ClearRouletteBets', (player) => {
    clearBets(player);
});

mp.events.add('Server_JoinRouletteTable', (player, tableIndex, tableName, casinoId, tableX, tableY, tableZ, tableHeading) => {
    player.outputChatBox(`!{Green}[RULETĂ] Încerci să te alături mesei "${tableName}"...`);
    joinLobby(player, tableIndex, tableName, casinoId, tableX, tableY, tableZ, tableHeading);
});

mp.events.add('Server_LeaveRouletteTable', (player) => {
    leaveLobby(player);
});

// ──────────────────────────────────────────
// SAVE HUD SETTINGS TO FILE
// ──────────────────────────────────────────
const fs   = require('fs');
const path = require('path');

const settingsDumpPath = path.join(process.cwd(), 'data', 'roulette', 'hud_positions.json');
fs.mkdirSync(path.dirname(settingsDumpPath), { recursive: true });

mp.events.add('Server_SaveRouletteSettings', (player, settingsJson) => {
    try {
        const settings = JSON.parse(settingsJson);
        const data = {
            savedBy: player.name,
            savedAt: new Date().toISOString(),
            wheel: {
                x: settings.wheelX,
                y: settings.wheelY,
                scale: settings.wheelScale
            },
            board: {
                x: settings.boardX,
                y: settings.boardY,
                scale: settings.boardScale,
                btnW: settings.btnW,
                btnH: settings.btnH
            },
            camera: {
                height: settings.camHeight,
                fov: settings.camFov,
                rotation: settings.camRot,
                offsetX: settings.camOx,
                offsetY: settings.camOy
            }
        };
        fs.writeFileSync(settingsDumpPath, JSON.stringify(data, null, 4));
        player.outputChatBox('!{Green}[RULETĂ] Pozițiile au fost salvate în data/roulette/hud_positions.json!');
        console.log(`[RULETĂ] HUD positions dumped by ${player.name}: ${settingsDumpPath}`);
    } catch (e) {
        player.outputChatBox('!{Red}[RULETĂ] Eroare la salvare!');
        console.log(`[RULETĂ] Error saving positions: ${e.message}`);
    }
});

// ──────────────────────────────────────────
// PAUSE / RESUME TABLE
// ──────────────────────────────────────────
mp.events.addCommand('pauseroulette', (player, _, idStr) => {
    const index = parseInt(idStr);
    if (isNaN(index)) {
        player.outputChatBox('!{Red}[RULETĂ] Folosire: /pauseroulette <id>');
        return;
    }

    const lobby = lobbies[index];
    if (!lobby) {
        player.outputChatBox(`!{Red}[RULETĂ] Nu există lobby activ pentru masa #${index}.`);
        return;
    }

    if (lobby.paused) {
        player.outputChatBox(`!{Yellow}[RULETĂ] Masa #${index} este deja pe pauză.`);
        return;
    }

    lobby.paused = true;

    // Oprește timer-ul de betting dacă e activ
    if (lobby.betTimer) {
        clearInterval(lobby.betTimer);
        lobby.betTimer = null;
    }

    // Returnează pariurile dacă suntem în betting
    if (lobby.state === 'betting') {
        lobby.players.forEach(slot => {
            if (slot.totalBet > 0) {
                slot.chips += slot.totalBet;
                slot.bets = [];
                slot.totalBet = 0;
                slot.player.call('rouletteUpdateBets', [JSON.stringify(slot.bets), slot.chips, slot.totalBet]);
            }
        });
    }

    lobby.state = 'waiting';
    broadcastToLobby(lobby, '!{Red}[RULETĂ] ⏸ Masa a fost pusă pe pauză de un admin.');
    callToLobby(lobby, 'rouletteUpdateState', [getLobbyStateForUI(lobby)]);
    updateLobbyUI(lobby);
    player.outputChatBox(`!{Green}[RULETĂ] Masa #${index} "${lobby.name}" a fost pusă pe pauză.`);
    console.log(`[RULETĂ] PAUSE: Masa #${index} "${lobby.name}" paused by ${player.name}`);
});

mp.events.addCommand('resumeroulette', (player, _, idStr) => {
    const index = parseInt(idStr);
    if (isNaN(index)) {
        player.outputChatBox('!{Red}[RULETĂ] Folosire: /resumeroulette <id>');
        return;
    }

    const lobby = lobbies[index];
    if (!lobby) {
        player.outputChatBox(`!{Red}[RULETĂ] Nu există lobby activ pentru masa #${index}.`);
        return;
    }

    if (!lobby.paused) {
        player.outputChatBox(`!{Yellow}[RULETĂ] Masa #${index} nu este pe pauză.`);
        return;
    }

    lobby.paused = false;
    broadcastToLobby(lobby, '!{Green}[RULETĂ] ▶ Masa a fost repornită de un admin.');

    // Dacă sunt destui jucători, pornește runda
    if (lobby.players.length >= ROULETTE_CONFIG.MIN_PLAYERS) {
        startBettingPhase(lobby);
    }

    updateLobbyUI(lobby);
    player.outputChatBox(`!{Green}[RULETĂ] Masa #${index} "${lobby.name}" a fost repornită.`);
    console.log(`[RULETĂ] RESUME: Masa #${index} "${lobby.name}" resumed by ${player.name}`);
});

// ──────────────────────────────────────────
// GRID CORNERS SAVE / LOAD
// ──────────────────────────────────────────
const gridCornersPath = path.join(process.cwd(), 'data', 'roulette', 'grid_corners.json');
const rouletteConfigPath = path.join(process.cwd(), 'data', 'roulette', 'roulette_config.json');

// Load roulette config from JSON
function loadRouletteConfig() {
    try {
        if (fs.existsSync(rouletteConfigPath)) {
            return JSON.parse(fs.readFileSync(rouletteConfigPath, 'utf8'));
        }
    } catch (e) {
        console.log(`[RULETĂ] Error loading config: ${e.message}`);
    }
    return null;
}

// Save roulette config
mp.events.add('Roulette:SaveConfig', (player, configJson) => {
    try {
        const newConfig = JSON.parse(configJson);
        let existing = loadRouletteConfig() || {};
        Object.assign(existing, newConfig);
        fs.writeFileSync(rouletteConfigPath, JSON.stringify(existing, null, 4));
        player.outputChatBox('!{Green}[RULETĂ] Config salvat!');
        console.log(`[RULETĂ] Config saved by ${player.name}`);
    } catch (e) {
        player.outputChatBox('!{Red}[RULETĂ] Eroare la salvare config!');
        console.log(`[RULETĂ] Error saving config: ${e.message}`);
    }
});

mp.events.add('Roulette:SaveGridCorners', (player, key, cornersJson) => {
    try {
        const corners = JSON.parse(cornersJson);
        let allCorners = {};
        if (fs.existsSync(gridCornersPath)) {
            allCorners = JSON.parse(fs.readFileSync(gridCornersPath, 'utf8'));
        }
        allCorners[key] = corners;
        fs.writeFileSync(gridCornersPath, JSON.stringify(allCorners, null, 4));
        player.outputChatBox('!{Green}[RULETĂ] Grid corners salvate!');
        console.log(`[RULETĂ] Grid corners saved by ${player.name} (key: ${key})`);
    } catch (e) {
        player.outputChatBox('!{Red}[RULETĂ] Eroare la salvare grid corners!');
        console.log(`[RULETĂ] Error saving grid corners: ${e.message}`);
    }
});

function getGridCorners(key) {
    try {
        if (fs.existsSync(gridCornersPath)) {
            const all = JSON.parse(fs.readFileSync(gridCornersPath, 'utf8'));
            return all[key] || all['global'] || null;
        }
    } catch (e) {}
    return null;
}

const rouletteHistoryPath = path.join(process.cwd(), 'data', 'roulette', 'table_history.json');

// Load persisted history for a table
function loadTableHistory(tableIndex) {
    try {
        if (fs.existsSync(rouletteHistoryPath)) {
            const all = JSON.parse(fs.readFileSync(rouletteHistoryPath, 'utf8'));
            return all[String(tableIndex)] || [];
        }
    } catch (e) {
        console.log(`[RULETĂ] Error loading history: ${e.message}`);
    }
    return [];
}

// Save history for a table
function saveTableHistory(tableIndex, history) {
    try {
        let all = {};
        if (fs.existsSync(rouletteHistoryPath)) {
            all = JSON.parse(fs.readFileSync(rouletteHistoryPath, 'utf8'));
        }
        all[String(tableIndex)] = history;
        fs.writeFileSync(rouletteHistoryPath, JSON.stringify(all, null, 2));
    } catch (e) {
        console.log(`[RULETĂ] Error saving history: ${e.message}`);
    }
}

mp.events.add('playerQuit', (player) => {
    leaveLobby(player);
});

module.exports = {
    ROULETTE_CONFIG,
    joinLobby,
    leaveLobby,
    placeBet,
    clearBets,
    lobbies,
    getLobbyByPlayer,
    getPlayerSlot,
    getGridCorners,
    RED_NUMBERS,
    BLACK_NUMBERS,
    ALL_NUMBERS,
    getNumberColor,
    BET_TYPES,
};
