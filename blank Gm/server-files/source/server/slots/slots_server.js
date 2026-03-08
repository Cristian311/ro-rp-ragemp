const slotsLog = require('./slots_logger');

// ──────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────
const SLOTS_CONFIG = {
    MAX_PLAYERS: 1,          // 1 jucător per aparat
    MIN_BET_PER_LINE: 1,
    MAX_BET_PER_LINE: 500,
    LINES: 10,               // 10 linii fixe
    REELS: 5,
    ROWS: 3,
    SPIN_TIME: 2.5,          // secunde animație reel spin
    FREE_SPIN_SCATTER_COUNT: 3, // 3+ scatter = free spins
    FREE_SPINS_AWARDED: 15,
    GAMBLE_MAX_AMOUNT: 50000,
};

// ──────────────────────────────────────────
// SYMBOLS — Shining Crown
// ──────────────────────────────────────────
const SYMBOLS = {
    crown:      { id: 'crown',      name: 'Crown',      emoji: '👑', isScatter: true },
    star:       { id: 'star',       name: 'Star',        emoji: '⭐', isWild: true },
    seven:      { id: 'seven',      name: 'Seven',       emoji: '7️⃣' },
    bell:       { id: 'bell',       name: 'Bell',        emoji: '🔔' },
    grapes:     { id: 'grapes',     name: 'Grapes',      emoji: '🍇' },
    watermelon: { id: 'watermelon', name: 'Watermelon',  emoji: '🍉' },
    plum:       { id: 'plum',       name: 'Plum',        emoji: '🍑' },
    orange:     { id: 'orange',     name: 'Orange',      emoji: '🍊' },
    lemon:      { id: 'lemon',      name: 'Lemon',       emoji: '🍋' },
    cherry:     { id: 'cherry',     name: 'Cherry',      emoji: '🍒' },
};

const SYMBOL_LIST = Object.keys(SYMBOLS);

// Reel strips — weighted distribution (some symbols rarer than others)
const REEL_STRIPS = [
    // Reel 0
    ['cherry','lemon','orange','plum','seven','bell','grapes','watermelon','lemon','cherry',
     'orange','star','plum','bell','lemon','cherry','grapes','crown','orange','cherry',
     'seven','lemon','plum','cherry','watermelon','bell','orange','lemon','cherry','grapes'],
    // Reel 1
    ['lemon','cherry','bell','orange','plum','cherry','watermelon','grapes','lemon','seven',
     'cherry','orange','crown','plum','lemon','bell','cherry','orange','grapes','cherry',
     'lemon','star','watermelon','plum','cherry','orange','lemon','bell','cherry','seven'],
    // Reel 2
    ['orange','lemon','cherry','grapes','bell','plum','cherry','lemon','watermelon','orange',
     'cherry','seven','lemon','plum','bell','crown','orange','cherry','grapes','lemon',
     'cherry','star','plum','bell','orange','cherry','lemon','watermelon','seven','cherry'],
    // Reel 3
    ['plum','cherry','lemon','orange','bell','cherry','grapes','lemon','watermelon','cherry',
     'orange','seven','plum','lemon','crown','cherry','bell','orange','lemon','cherry',
     'grapes','star','plum','watermelon','cherry','lemon','orange','bell','cherry','seven'],
    // Reel 4
    ['cherry','orange','lemon','bell','plum','cherry','seven','grapes','lemon','orange',
     'cherry','watermelon','plum','lemon','bell','cherry','orange','crown','lemon','cherry',
     'grapes','star','bell','plum','orange','lemon','cherry','watermelon','seven','cherry'],
];

// ──────────────────────────────────────────
// PAYLINES — 10 linii fixe (indexuri rând 0-2 pentru fiecare din cele 5 role)
// ──────────────────────────────────────────
const PAYLINES = [
    [1, 1, 1, 1, 1],  // Linia 1: mijloc
    [0, 0, 0, 0, 0],  // Linia 2: sus
    [2, 2, 2, 2, 2],  // Linia 3: jos
    [0, 1, 2, 1, 0],  // Linia 4: V
    [2, 1, 0, 1, 2],  // Linia 5: Λ (inv V)
    [1, 0, 0, 0, 1],  // Linia 6: din mijloc sus-sus-sus mijloc
    [1, 2, 2, 2, 1],  // Linia 7: din mijloc jos-jos-jos mijloc
    [0, 0, 1, 2, 2],  // Linia 8: diagonal ↘
    [2, 2, 1, 0, 0],  // Linia 9: diagonal ↗
    [0, 1, 1, 1, 0],  // Linia 10: ușor V sus
];

// ──────────────────────────────────────────
// PAYTABLE — câștiguri per simbol pentru 3, 4, 5 pe linie
// Valori = multiplicator x bet_per_line
// ──────────────────────────────────────────
const PAYTABLE = {
    //               3x    4x    5x
    star:       [   50,  200, 1000 ],
    seven:      [   40,  150,  750 ],
    bell:       [   25,  100,  400 ],
    grapes:     [   20,   80,  300 ],
    watermelon: [   15,   60,  200 ],
    plum:       [   10,   40,  150 ],
    orange:     [    8,   30,  100 ],
    lemon:      [    5,   20,   75 ],
    cherry:     [    5,   15,   50 ],
};

// Scatter (crown) payouts: total_bet multiplier
const SCATTER_PAY = {
    3: 5,    // 3 crowns = 5x total bet
    4: 20,   // 4 crowns = 20x total bet
    5: 100,  // 5 crowns = 100x total bet
};

// ──────────────────────────────────────────
// SESSION MANAGEMENT (1 jucător per aparat)
// ──────────────────────────────────────────
function createSession(machineIndex, machineName) {
    return {
        id: machineIndex,
        name: machineName,
        player: null,
        chips: 0,
        betPerLine: 10,
        state: 'idle',         // idle | spinning | result | freespin | gamble
        lastGrid: null,        // 3x5 result grid
        lastWin: 0,
        totalWin: 0,           // curent win (pentru gamble)
        freeSpinsLeft: 0,
        freeSpinsTotalWin: 0,
        history: [],           // ultimele ~15 spinuri
        gambleAmount: 0,
    };
}

const sessions = {};

function getSessionByPlayer(player) {
    for (const key in sessions) {
        if (sessions[key].player === player) return sessions[key];
    }
    return null;
}

function broadcastToSession(session, message) {
    if (session.player) session.player.outputChatBox(message);
}

// ──────────────────────────────────────────
// JOIN / LEAVE
// ──────────────────────────────────────────
function joinMachine(player, machineIndex, machineName) {
    if (getSessionByPlayer(player)) {
        player.outputChatBox('!{Red}Ești deja la un aparat!');
        return;
    }

    if (!sessions[machineIndex]) {
        sessions[machineIndex] = createSession(machineIndex, machineName);
    }

    const session = sessions[machineIndex];

    if (session.player !== null) {
        player.outputChatBox('!{Red}Aparatul este ocupat!');
        return;
    }

    session.player = player;
    session.chips = player.money || 10000;
    session.betPerLine = 10;
    session.state = 'idle';
    session.lastGrid = null;
    session.lastWin = 0;
    session.totalWin = 0;
    session.freeSpinsLeft = 0;
    session.freeSpinsTotalWin = 0;

    player.outputChatBox(`!{Orange}[SLOTS] !{White}Te-ai așezat la aparatul "${machineName}".`);
    slotsLog.onPlayerJoin(machineIndex, machineName, player.name);

    player.call('openSlotsUI');
    sendFullState(session);
}

function leaveMachine(player) {
    const session = getSessionByPlayer(player);
    if (!session) return;

    console.log(`[SLOTS] LEAVE: ${player.name} părăsește aparatul "${session.name}"`);
    slotsLog.onPlayerLeave(session.id, session.name, player.name);

    // Dacă are câștig necashuit din gamble, îi dăm banii
    if (session.totalWin > 0) {
        session.chips += session.totalWin;
        session.totalWin = 0;
    }

    if (!player._isBot) {
        mp.events.call('slots:updatePlayerMoney', player, session.chips);
    }

    player.call('closeSlotsUI');
    player.outputChatBox('!{Orange}[SLOTS] !{White}Ai părăsit aparatul.');

    session.player = null;
    session.state = 'idle';

    mp.events.call('_slots_updateMarker', session.id, 'free', 0, 1);
}

// ──────────────────────────────────────────
// SET BET
// ──────────────────────────────────────────
function setBetPerLine(player, amount) {
    const session = getSessionByPlayer(player);
    if (!session || session.state !== 'idle') return;

    amount = Math.max(SLOTS_CONFIG.MIN_BET_PER_LINE, Math.min(SLOTS_CONFIG.MAX_BET_PER_LINE, amount));
    session.betPerLine = amount;

    player.call('slotsUpdateState', [JSON.stringify(getStateForUI(session))]);
}

// ──────────────────────────────────────────
// SPIN
// ──────────────────────────────────────────
function spin(player) {
    const session = getSessionByPlayer(player);
    if (!session) return;

    const isFree = session.state === 'freespin' || session.freeSpinsLeft > 0;

    if (!isFree && session.state !== 'idle') {
        player.outputChatBox('!{Red}Nu poți da spin acum!');
        return;
    }

    const totalBet = isFree ? 0 : session.betPerLine * SLOTS_CONFIG.LINES;

    if (!isFree && totalBet > session.chips) {
        player.outputChatBox('!{Red}Nu ai suficienți bani!');
        return;
    }

    if (!isFree) {
        session.chips -= totalBet;
    }

    session.state = 'spinning';

    // Generează grid-ul
    const grid = generateGrid();
    session.lastGrid = grid;

    // Evaluează câștigurile
    const { lineWins, scatterCount, totalWin: rawWin, freeSpinsWon, winLines } =
        evaluateSpin(grid, session.betPerLine, totalBet);

    let totalWin = rawWin;

    // Scatter free spins
    if (freeSpinsWon > 0 && !isFree) {
        session.freeSpinsLeft += freeSpinsWon;
        session.freeSpinsTotalWin = 0;
    } else if (freeSpinsWon > 0 && isFree) {
        // Re-trigger free spins during free spins
        session.freeSpinsLeft += freeSpinsWon;
    }

    if (isFree) {
        session.freeSpinsLeft = Math.max(0, session.freeSpinsLeft - 1);
        session.freeSpinsTotalWin += totalWin;
    }

    session.lastWin = totalWin;
    session.totalWin = totalWin; // Disponibil pentru gamble

    if (totalWin > 0) {
        session.chips += totalWin;
    }

    // Logging
    const gameId = slotsLog.onSpin(session.id, session.name, player.name,
        session.betPerLine, SLOTS_CONFIG.LINES, totalBet);
    slotsLog.onSpinResult(session.id, session.name, player.name, gameId,
        grid, totalWin, freeSpinsWon);

    // Istoric
    session.history.unshift({
        grid: grid,
        bet: totalBet,
        win: totalWin,
        isFree: isFree,
    });
    if (session.history.length > 15) session.history.pop();

    // Trimite la client — flat grid + reel stop positions
    const reelStops = [];
    for (let r = 0; r < SLOTS_CONFIG.REELS; r++) {
        const strip = REEL_STRIPS[r];
        // Găsește un index valid care produce coloana corectă
        const col = [];
        for (let row = 0; row < SLOTS_CONFIG.ROWS; row++) col.push(grid[row][r]);
        let stopIdx = findStopIndex(strip, col);
        reelStops.push(stopIdx);
    }

    const spinData = {
        grid: grid,
        reelStops: reelStops,
        lineWins: lineWins,
        winLines: winLines,
        scatterCount: scatterCount,
        totalWin: totalWin,
        freeSpinsWon: freeSpinsWon,
        isFree: isFree,
        freeSpinsLeft: session.freeSpinsLeft,
        freeSpinsTotalWin: session.freeSpinsTotalWin,
    };

    player.call('slotsSpinResult', [JSON.stringify(spinData), session.chips]);

    // Log in chat
    if (totalWin > 0) {
        player.outputChatBox(`!{Orange}[SLOTS] !{Green}Câștig: $${totalWin}!`);
    }
    if (freeSpinsWon > 0) {
        player.outputChatBox(`!{Orange}[SLOTS] !{Yellow}🎉 ${freeSpinsWon} ROTIRI GRATUITE!`);
    }

    // După animație, setăm starea corectă
    setTimeout(() => {
        if (session.player !== player) return; // a plecat

        if (session.freeSpinsLeft > 0) {
            session.state = 'freespin';
            player.call('slotsUpdateState', [JSON.stringify(getStateForUI(session))]);
        } else {
            if (totalWin > 0) {
                session.state = 'idle'; // Poate da gamble sau spin
            } else {
                session.state = 'idle';
            }
            player.call('slotsUpdateState', [JSON.stringify(getStateForUI(session))]);
        }
    }, SLOTS_CONFIG.SPIN_TIME * 1000 + 500);
}

// ──────────────────────────────────────────
// GRID GENERATION
// ──────────────────────────────────────────
function generateGrid() {
    const grid = [[], [], []]; // 3 rows x 5 cols
    for (let reel = 0; reel < SLOTS_CONFIG.REELS; reel++) {
        const strip = REEL_STRIPS[reel];
        const stopIdx = Math.floor(Math.random() * strip.length);
        for (let row = 0; row < SLOTS_CONFIG.ROWS; row++) {
            grid[row][reel] = strip[(stopIdx + row) % strip.length];
        }
    }
    return grid;
}

function findStopIndex(strip, column) {
    for (let i = 0; i < strip.length; i++) {
        let match = true;
        for (let r = 0; r < column.length; r++) {
            if (strip[(i + r) % strip.length] !== column[r]) { match = false; break; }
        }
        if (match) return i;
    }
    return 0;
}

// ──────────────────────────────────────────
// EVALUATE SPIN
// ──────────────────────────────────────────
function evaluateSpin(grid, betPerLine, totalBet) {
    let totalWin = 0;
    const lineWins = [];
    const winLines = [];

    // Evaluează fiecare linie
    for (let lineIdx = 0; lineIdx < PAYLINES.length; lineIdx++) {
        const line = PAYLINES[lineIdx];
        const symbols = [];
        for (let reel = 0; reel < SLOTS_CONFIG.REELS; reel++) {
            symbols.push(grid[line[reel]][reel]);
        }

        // Găsește cel mai lung run de la stânga la dreapta
        const result = evaluateLine(symbols);
        if (result) {
            const multiplier = PAYTABLE[result.symbol][result.count - 3]; // index 0=3match, 1=4match, 2=5match
            if (multiplier) {
                const win = betPerLine * multiplier;
                totalWin += win;
                lineWins.push({
                    line: lineIdx,
                    symbol: result.symbol,
                    count: result.count,
                    win: win,
                });
                winLines.push(lineIdx);
            }
        }
    }

    // Scatter count (crown)
    let scatterCount = 0;
    for (let row = 0; row < SLOTS_CONFIG.ROWS; row++) {
        for (let reel = 0; reel < SLOTS_CONFIG.REELS; reel++) {
            if (grid[row][reel] === 'crown') scatterCount++;
        }
    }

    let freeSpinsWon = 0;
    if (scatterCount >= SLOTS_CONFIG.FREE_SPIN_SCATTER_COUNT) {
        // Scatter payout
        if (SCATTER_PAY[scatterCount]) {
            totalWin += totalBet * SCATTER_PAY[scatterCount];
        }
        freeSpinsWon = SLOTS_CONFIG.FREE_SPINS_AWARDED;
    }

    return { lineWins, scatterCount, totalWin, freeSpinsWon, winLines };
}

function evaluateLine(symbols) {
    // Primul simbol non-wild
    let baseSymbol = null;
    let count = 0;

    for (let i = 0; i < symbols.length; i++) {
        const sym = symbols[i];
        const symDef = SYMBOLS[sym];

        if (symDef && symDef.isScatter) break; // scatter nu contează pe linii
        if (symDef && symDef.isWild) {
            count++;
            continue;
        }

        if (baseSymbol === null) {
            baseSymbol = sym;
            count++;
        } else if (sym === baseSymbol) {
            count++;
        } else {
            break;
        }
    }

    // Dacă totul e wild, folosim star ca simbol
    if (baseSymbol === null && count > 0) baseSymbol = 'star';

    if (count >= 3 && baseSymbol && PAYTABLE[baseSymbol]) {
        return { symbol: baseSymbol, count: Math.min(count, 5) };
    }
    return null;
}

// ──────────────────────────────────────────
// GAMBLE (DOUBLE OR NOTHING)
// ──────────────────────────────────────────
function startGamble(player) {
    const session = getSessionByPlayer(player);
    if (!session || session.state !== 'idle') return;
    if (session.totalWin <= 0) {
        player.outputChatBox('!{Red}Nu ai nimic de dublat!');
        return;
    }
    if (session.totalWin > SLOTS_CONFIG.GAMBLE_MAX_AMOUNT) {
        player.outputChatBox('!{Red}Suma este prea mare pentru gamble!');
        return;
    }

    session.state = 'gamble';
    session.gambleAmount = session.totalWin;
    session.chips -= session.totalWin; // hold the amount

    player.call('slotsGambleStart', [session.gambleAmount]);
}

function gambleChoice(player, choice) {
    // choice = 'red' sau 'black'
    const session = getSessionByPlayer(player);
    if (!session || session.state !== 'gamble') return;

    const cardValue = Math.floor(Math.random() * 52);
    const isRed = (cardValue % 4) < 2; // hearts, diamonds red; clubs, spades black
    const resultColor = isRed ? 'red' : 'black';
    const won = (choice === resultColor);

    if (won) {
        session.gambleAmount *= 2;
        session.chips += session.gambleAmount;
        session.totalWin = session.gambleAmount;
        player.outputChatBox(`!{Orange}[SLOTS] !{Green}GAMBLE CÂȘTIG! $${session.gambleAmount}!`);
    } else {
        session.totalWin = 0;
        session.gambleAmount = 0;
        player.outputChatBox(`!{Orange}[SLOTS] !{Red}GAMBLE PIERDUT!`);
    }

    slotsLog.onGamble(session.id, session.name, player.name, session.gambleAmount, won, session.chips);

    player.call('slotsGambleResult', [JSON.stringify({
        won: won,
        resultColor: resultColor,
        cardValue: cardValue,
        newAmount: session.gambleAmount,
        chips: session.chips,
    })]);

    if (!won || session.gambleAmount > SLOTS_CONFIG.GAMBLE_MAX_AMOUNT) {
        session.state = 'idle';
        session.gambleAmount = 0;
    }
    // Dacă a câștigat, rămâne în gamble (poate dubla din nou)

    if (!player._isBot) {
        mp.events.call('slots:updatePlayerMoney', player, session.chips);
    }
}

function collectGamble(player) {
    const session = getSessionByPlayer(player);
    if (!session || session.state !== 'gamble') return;

    session.chips += session.gambleAmount;
    player.outputChatBox(`!{Orange}[SLOTS] !{White}Ai colectat $${session.gambleAmount}.`);
    session.totalWin = 0;
    session.gambleAmount = 0;
    session.state = 'idle';

    if (!player._isBot) {
        mp.events.call('slots:updatePlayerMoney', player, session.chips);
    }

    player.call('slotsUpdateState', [JSON.stringify(getStateForUI(session))]);
}

// ──────────────────────────────────────────
// UI STATE
// ──────────────────────────────────────────
function getStateForUI(session) {
    return {
        state: session.state,
        chips: session.chips,
        betPerLine: session.betPerLine,
        totalBet: session.betPerLine * SLOTS_CONFIG.LINES,
        lines: SLOTS_CONFIG.LINES,
        lastWin: session.lastWin,
        totalWin: session.totalWin,
        freeSpinsLeft: session.freeSpinsLeft,
        freeSpinsTotalWin: session.freeSpinsTotalWin,
        lastGrid: session.lastGrid,
        history: session.history.slice(0, 10),
        gambleAmount: session.gambleAmount,
        config: {
            minBet: SLOTS_CONFIG.MIN_BET_PER_LINE,
            maxBet: SLOTS_CONFIG.MAX_BET_PER_LINE,
            lines: SLOTS_CONFIG.LINES,
            spinTime: SLOTS_CONFIG.SPIN_TIME,
        },
    };
}

function sendFullState(session) {
    if (!session.player) return;
    session.player.call('slotsUpdateState', [JSON.stringify(getStateForUI(session))]);
}

// ──────────────────────────────────────────
// EVENTS
// ──────────────────────────────────────────
mp.events.add('slots:updatePlayerMoney', (player, newAmount) => {
    player.money = newAmount;
    console.log(`[SLOTS] MONEY_SET: ${player.name} → $${newAmount}`);
});

mp.events.add('Server_SlotsSpin', (player) => {
    spin(player);
});

mp.events.add('Server_SlotsSetBet', (player, amount) => {
    setBetPerLine(player, parseInt(amount) || 10);
});

mp.events.add('Server_SlotsGamble', (player) => {
    startGamble(player);
});

mp.events.add('Server_SlotsGambleChoice', (player, choice) => {
    gambleChoice(player, choice);
});

mp.events.add('Server_SlotsCollectGamble', (player) => {
    collectGamble(player);
});

mp.events.add('Server_JoinSlotsMachine', (player, machineIndex, machineName) => {
    player.outputChatBox(`!{Green}[SLOTS] Te așezi la aparatul "${machineName}"...`);
    joinMachine(player, machineIndex, machineName);
});

mp.events.add('Server_LeaveSlotsMachine', (player) => {
    leaveMachine(player);
});

mp.events.add('playerQuit', (player) => {
    leaveMachine(player);
});

module.exports = {
    SLOTS_CONFIG,
    SYMBOLS,
    PAYTABLE,
    PAYLINES,
    SCATTER_PAY,
    joinMachine,
    leaveMachine,
    spin,
    sessions,
    getSessionByPlayer,
};
