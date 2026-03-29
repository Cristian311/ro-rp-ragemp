const slotsLog = require('./slots_logger');
const fs   = require('fs');
const path = require('path');

const slotsMachinesPath = path.join(process.cwd(), 'data', 'slots', 'slots_machines.json');

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
    TURBO_SPIN_TIME: 0.4,    // secunde animație turbo
    FREE_SPIN_SCATTER_COUNT: 3, // unused (no scatter)
    FREE_SPINS_AWARDED: 0,
    GAMBLE_MAX_AMOUNT: 50000,
};

// ──────────────────────────────────────────
// SYMBOLS — Shining Crown
// ──────────────────────────────────────────
const SYMBOLS = {
    star:       { id: 'star',       name: 'Star',        emoji: '⭐' },
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
     'orange','star','plum','bell','lemon','cherry','grapes','plum','orange','cherry',
     'seven','lemon','plum','cherry','watermelon','bell','orange','lemon','cherry','grapes'],
    // Reel 1
    ['lemon','cherry','bell','orange','plum','cherry','watermelon','grapes','lemon','seven',
     'cherry','orange','lemon','plum','lemon','bell','cherry','orange','grapes','cherry',
     'lemon','star','watermelon','plum','cherry','orange','lemon','bell','cherry','seven'],
    // Reel 2
    ['orange','lemon','cherry','grapes','bell','plum','cherry','lemon','watermelon','orange',
     'cherry','seven','lemon','plum','bell','orange','orange','cherry','grapes','lemon',
     'cherry','star','plum','bell','orange','cherry','lemon','watermelon','seven','cherry'],
    // Reel 3
    ['plum','cherry','lemon','orange','bell','cherry','grapes','lemon','watermelon','cherry',
     'orange','seven','plum','lemon','cherry','cherry','bell','orange','lemon','cherry',
     'grapes','star','plum','watermelon','cherry','lemon','orange','bell','cherry','seven'],
    // Reel 4
    ['cherry','orange','lemon','bell','plum','cherry','seven','grapes','lemon','orange',
     'cherry','watermelon','plum','lemon','bell','cherry','orange','grapes','lemon','cherry',
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
    //               3x    4x     5x
    seven:      [  135,  500,  2500 ],
    bell:       [   85,  335,  1350 ],
    grapes:     [   65,  275,  1000 ],
    watermelon: [   55,  200,   675 ],
    plum:       [   35,  135,   500 ],
    orange:     [   30,  100,   335 ],
    lemon:      [   16,   65,   250 ],
    cherry:     [   16,   55,   175 ],
};

// Scatter (crown) payouts: removed - no scatter in Sizzling Hot style
const SCATTER_PAY = {};

// ──────────────────────────────────────────
// BELL LINK CONFIG
// ──────────────────────────────────────────
const BELL_LINK = {
    TRIGGER_COUNT: 5,       // 5+ bells on grid to trigger bonus
    INITIAL_RESPINS: 3,
    CELL_BELL_CHANCE: 0.076, // 7.6% chance per empty cell per respin (tuned for ~95% total RTP)
    WIN_FACTOR: 0.841,      // base game win multiplier in belllink mode (balances RTP to ~95%)
    BOOST_BELL_CHANCE: 0.15, // 15% chance per bell to be a boost bell
    FULL_BOARD: 15,         // 3 rows * 5 reels
    // Multipliers:
    // No boost: full board = 2x
    // With boost: 12+ bells = 2x, full board = 4x
    BOOST_THRESHOLD: 12,    // minimum bells for 2x with reels boost
    VALUE_TABLE: [
        { mult: 1,   weight: 30 },
        { mult: 2,   weight: 25 },
        { mult: 3,   weight: 20 },
        { mult: 5,   weight: 15 },
        { mult: 10,  weight: 8 },
        { mult: 15,  weight: 5 },
        { mult: 20,  weight: 3 },
        { mult: 25,  weight: 2 },
        { mult: 50,  weight: 1 },
        { mult: 100, weight: 0.5 },
    ],
};

// ──────────────────────────────────────────
// BOOK OF RA CONFIG
// ──────────────────────────────────────────
const BOR_SYMBOLS = {
    book:     { id: 'book',     name: 'Book',     emoji: '📕' },
    explorer: { id: 'explorer', name: 'Explorer', emoji: '🤠' },
    pharaoh:  { id: 'pharaoh',  name: 'Pharaoh',  emoji: '👑' },
    mummy:    { id: 'mummy',    name: 'Mummy',    emoji: '🧟' },
    scarab:   { id: 'scarab',   name: 'Scarab',   emoji: '🪲' },
    ace:      { id: 'ace',      name: 'Ace',      emoji: 'A' },
    king:     { id: 'king',     name: 'King',     emoji: 'K' },
    queen:    { id: 'queen',    name: 'Queen',    emoji: 'Q' },
    jack:     { id: 'jack',     name: 'Jack',     emoji: 'J' },
    ten:      { id: 'ten',      name: '10',       emoji: '10' },
};

const BOR_REEL_STRIPS = [
    ['ten','jack','queen','king','ace','scarab','ten','jack','queen','mummy',
     'king','ten','jack','queen','ace','pharaoh','ten','jack','king','book',
     'ten','jack','queen','ace','scarab','mummy','ten','queen','explorer','king'],
    ['jack','ten','king','queen','ace','mummy','jack','ten','queen','scarab',
     'king','ten','jack','ace','queen','ten','jack','book','king','pharaoh',
     'ten','queen','jack','ace','ten','king','scarab','queen','jack','explorer'],
    ['queen','ten','jack','king','ace','ten','scarab','jack','queen','mummy',
     'king','ten','jack','queen','ace','ten','pharaoh','jack','king','queen',
     'book','ten','jack','ace','scarab','king','ten','explorer','queen','jack'],
    ['king','ten','jack','queen','ace','scarab','ten','jack','king','queen',
     'mummy','ten','jack','ace','king','queen','ten','jack','pharaoh','queen',
     'ten','jack','book','king','ace','ten','scarab','queen','jack','explorer'],
    ['ace','ten','jack','queen','king','ten','mummy','jack','scarab','queen',
     'king','ten','jack','ace','queen','pharaoh','ten','jack','king','queen',
     'ten','jack','ace','book','king','ten','explorer','queen','jack','scarab'],
];

// Book of Ra paytable: [2x, 3x, 4x, 5x] multiply by betPerLine
const BOR_PAYTABLE = {
    explorer: [10, 100, 1000, 5000],
    pharaoh:  [5,  40,  400,  2000],
    mummy:    [5,  30,  100,  750],
    scarab:   [5,  30,  100,  750],
    ace:      [0,  5,   40,   150],
    king:     [0,  5,   40,   150],
    queen:    [0,  5,   25,   100],
    jack:     [0,  5,   25,   100],
    ten:      [0,  5,   25,   100],
};

const BOR_SCATTER_PAY = { 3: 2, 4: 20, 5: 200 }; // multiplier of total bet
const BOR_FREE_SPINS = 10;

function generateBellValue(totalBet) {
    const table = BELL_LINK.VALUE_TABLE;
    const totalWeight = table.reduce((s, v) => s + v.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const v of table) {
        rand -= v.weight;
        if (rand <= 0) return v.mult * totalBet;
    }
    return totalBet;
}

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
        gameMode: 'normal',    // 'normal' | 'belllink'
        state: 'idle',         // idle | spinning | gamble | belllink
        lastGrid: null,        // 3x5 result grid
        lastWin: 0,
        totalWin: 0,           // curent win (pentru gamble)
        freeSpinsLeft: 0,
        freeSpinsTotalWin: 0,
        history: [],           // ultimele ~15 spinuri
        gambleAmount: 0,
        gambleCount: 0,        // câte gamble-uri a făcut (max 5)
        turbo: false,          // turbo speed mode
        spinTimer: null,       // reference to state timeout
        bellLinkState: null,   // bell link bonus state
        reelsBoost: false,     // reels boost active for next bell link
        borFreeSpinsLeft: 0,
        borFreeSpinsTotalWin: 0,
        borExpandingSymbol: null,
        borBaseBet: 0,
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
    if (session.player) global.chatSend(session.player, message);
}

// ──────────────────────────────────────────
// JOIN / LEAVE
// ──────────────────────────────────────────
function joinMachine(player, machineIndex, machineName) {
    if (getSessionByPlayer(player)) {
        global.chatSend(player, '!{Red}Ești deja la un aparat!');
        return;
    }

    if (!sessions[machineIndex]) {
        sessions[machineIndex] = createSession(machineIndex, machineName);
    }

    const session = sessions[machineIndex];

    if (session.player !== null) {
        global.chatSend(player, '!{Red}Aparatul este ocupat!');
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

    global.chatSend(player, `!{Orange}[SLOTS] !{White}Te-ai așezat la aparatul "${machineName}".`);
    slotsLog.onPlayerJoin(machineIndex, machineName, player.name);

    // Send machine position to client for animation offset calculation
    try {
        const SLOT_PROPS = [null,'ch_prop_casino_slot_07a','vw_prop_casino_slot_02a','ch_prop_casino_slot_02a','vw_prop_casino_slot_05a','ch_prop_casino_slot_05a','vw_prop_casino_slot_08a','vw_prop_casino_slot_07a','ch_prop_casino_slot_06a','vw_prop_casino_slot_01a','vw_prop_casino_slot_04a','ch_prop_casino_slot_04b','ch_prop_casino_slot_04a','vw_prop_casino_slot_03a','ch_prop_casino_slot_08a','ch_prop_casino_slot_03a','vw_prop_casino_slot_06a','ch_prop_casino_slot_01a'];
        const machines = JSON.parse(fs.readFileSync(slotsMachinesPath, 'utf8'));
        if (machines[machineIndex]) {
            const m = machines[machineIndex];
            const propName = SLOT_PROPS[m.propModel || 0] || '';
            player.call('slotsSetTableData', [m.x, m.y, m.z, m.heading, propName]);
        }
    } catch(e) {}

    player.call('openSlotsUI');
    sendFullState(session);
}

function leaveMachine(player) {
    const session = getSessionByPlayer(player);
    if (!session) return;

    console.log(`[SLOTS] LEAVE: ${player.name} părăsește aparatul "${session.name}"`);
    slotsLog.onPlayerLeave(session.id, session.name, player.name);

    // Dacă e în gamble, pierde banii (nu a colectat)
    if (session.state === 'gamble') {
        session.gambleAmount = 0;
        session.gambleCount = 0;
        session.totalWin = 0;
    }

    if (!player._isBot) {
        mp.events.call('slots:updatePlayerMoney', player, session.chips);
    }

    player.call('closeSlotsUI');
    player.call('slotsClearTableData');
    global.chatSend(player, '!{Orange}[SLOTS] !{White}Ai părăsit aparatul.');

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

    if (session.gameMode === 'bookofra') return borSpin(player);

    const isFree = session.state === 'freespin' || session.freeSpinsLeft > 0;

    if (!isFree && session.state !== 'idle') {
        global.chatSend(player, '!{Red}Nu poți da spin acum!');
        return;
    }

    const totalBet = isFree ? 0 : session.betPerLine * SLOTS_CONFIG.LINES;

    if (!isFree && totalBet > session.chips) {
        global.chatSend(player, '!{Red}Nu ai suficienți bani!');
        return;
    }

    if (!isFree) {
        session.chips -= totalBet;
    }

    session.state = 'spinning';

    // Generează grid-ul
    const grid = generateGrid();

    // Lucky mode boost — 20x sanse de speciale
    if (player._slotsLucky > 0 && session.gameMode === 'belllink') {
        player._slotsLucky--;
        for (let row = 0; row < SLOTS_CONFIG.ROWS; row++) {
            for (let reel = 0; reel < SLOTS_CONFIG.REELS; reel++) {
                if (grid[row][reel] !== 'bell' && Math.random() < 0.33) {
                    grid[row][reel] = 'bell';
                }
            }
        }
        if (player._slotsLucky <= 0) {
            player.call('slotsLuckyExpired');
            global.chatSend(player, '!{FFD700}🍀 LUCKY MODE expirat!');
        } else {
            player.call('slotsLuckyUpdate', [player._slotsLucky]);
        }
    }

    session.lastGrid = grid;

    // Evaluează câștigurile
    const { lineWins, scatterCount, totalWin: rawWin, freeSpinsWon, winLines } =
        evaluateSpin(grid, session.betPerLine, totalBet);

    // In bell link mode, reduce base game wins to balance total RTP with bonus
    const isBellLink = session.gameMode === 'belllink';
    let totalWin = isBellLink ? Math.round(rawWin * BELL_LINK.WIN_FACTOR) : rawWin;
    if (isBellLink && lineWins.length > 0) {
        for (const lw of lineWins) lw.win = Math.round(lw.win * BELL_LINK.WIN_FACTOR);
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
        turbo: session.turbo,
        bellPositions: null,
        bellLinkTriggered: false,
        reelsBoost: false,
    };

    // Bell Link detection (only in belllink game mode)
    if (session.gameMode === 'belllink') {
        session.reelsBoost = false; // reset from previous bell link
        const bellPositions = [];
        let boostBellPlaced = false;
        for (let row = 0; row < SLOTS_CONFIG.ROWS; row++) {
            for (let reel = 0; reel < SLOTS_CONFIG.REELS; reel++) {
                if (grid[row][reel] === 'bell') {
                    const isBoost = !boostBellPlaced && Math.random() < BELL_LINK.BOOST_BELL_CHANCE;
                    if (isBoost) boostBellPlaced = true;
                    bellPositions.push({ row, reel, value: isBoost ? 0 : generateBellValue(session.betPerLine * SLOTS_CONFIG.LINES), isBoost });
                }
            }
        }
        spinData.bellPositions = bellPositions;
        if (bellPositions.length >= BELL_LINK.TRIGGER_COUNT) {
            spinData.bellLinkTriggered = true;
            // Reels Boost activates only if one of the triggering bells is a boost bell
            const hasBoostBell = bellPositions.some(bp => bp.isBoost);
            if (hasBoostBell) {
                session.reelsBoost = true;
                spinData.reelsBoost = true;
            }
            session._pendingBellLink = bellPositions;
        }
    }

    player.call('slotsSpinResult', [JSON.stringify(spinData), session.chips]);

    // Log in chat
    if (totalWin > 0) {
        global.chatSend(player, `!{Orange}[SLOTS] !{Green}Câștig: $${totalWin}!`);
    }

    // După animație, setăm starea corectă
    const spinTime = session.turbo ? SLOTS_CONFIG.TURBO_SPIN_TIME : SLOTS_CONFIG.SPIN_TIME;
    session.spinTimer = setTimeout(() => {
        if (session.player !== player) return; // a plecat
        finishSpin(session, player);
    }, spinTime * 1000 + 500);
}

function finishSpin(session, player) {
    if (session.state !== 'spinning') return;
    if (session.spinTimer) { clearTimeout(session.spinTimer); session.spinTimer = null; }

    session.state = 'idle';
    player.call('slotsUpdateState', [JSON.stringify(getStateForUI(session))]);
}

function skipAnimation(player) {
    const session = getSessionByPlayer(player);
    if (!session || session.state !== 'spinning') return;
    player.call('slotsSkipAnimation');
    finishSpin(session, player);
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

    // No scatter/free spins in Sizzling Hot style
    let scatterCount = 0;
    let freeSpinsWon = 0;

    return { lineWins, scatterCount, totalWin, freeSpinsWon, winLines };
}

function evaluateLine(symbols) {
    // Simple left-to-right matching (no wild substitution)
    let baseSymbol = null;
    let count = 0;

    for (let i = 0; i < symbols.length; i++) {
        const sym = symbols[i];

        if (baseSymbol === null) {
            baseSymbol = sym;
            count++;
        } else if (sym === baseSymbol) {
            count++;
        } else {
            break;
        }
    }

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
    if (session.gameMode === 'bookofra' && session.borFreeSpinsLeft > 0) return;
    if (session.totalWin <= 0) {
        global.chatSend(player, '!{Red}Nu ai nimic de dublat!');
        return;
    }
    if (session.totalWin > SLOTS_CONFIG.GAMBLE_MAX_AMOUNT) {
        global.chatSend(player, '!{Red}Suma este prea mare pentru gamble!');
        return;
    }

    session.state = 'gamble';
    session.gambleAmount = session.totalWin;
    session.gambleCount = 0;
    session.chips -= session.totalWin; // hold the amount (not in chips until collect)

    player.call('slotsGambleStart', [session.gambleAmount]);
}

function gambleChoice(player, choice) {
    // choice = 'red' sau 'black'
    const session = getSessionByPlayer(player);
    if (!session || session.state !== 'gamble') return;

    session.gambleCount++;

    const cardValue = Math.floor(Math.random() * 52);
    const isRed = (cardValue % 4) < 2; // hearts, diamonds red; clubs, spades black
    const resultColor = isRed ? 'red' : 'black';
    const won = (choice === resultColor);

    let maxReached = false;

    if (won) {
        session.gambleAmount *= 2;
        session.totalWin = session.gambleAmount;
        global.chatSend(player, `!{Orange}[SLOTS] !{Green}GAMBLE CÂȘTIG! $${session.gambleAmount} (${session.gambleCount}/5)!`);

        if (session.gambleCount >= 5) {
            // Max gambles reached — auto collect
            maxReached = true;
            session.chips += session.gambleAmount;
            global.chatSend(player, `!{Orange}[SLOTS] !{Yellow}Maxim 5 dublaje! Ai colectat $${session.gambleAmount}.`);
            session.state = 'idle';
            session.totalWin = 0;
            session.gambleAmount = 0;
            session.gambleCount = 0;
        }
        // else: state stays 'gamble', can gamble again
    } else {
        // LOSE — lose everything
        session.totalWin = 0;
        session.gambleAmount = 0;
        session.gambleCount = 0;
        session.state = 'idle';
        global.chatSend(player, `!{Orange}[SLOTS] !{Red}GAMBLE PIERDUT! Ai pierdut tot!`);
    }

    slotsLog.onGamble(session.id, session.name, player.name, session.gambleAmount, won, session.chips);

    player.call('slotsGambleResult', [JSON.stringify({
        won: won,
        resultColor: resultColor,
        cardValue: cardValue,
        newAmount: session.gambleAmount,
        chips: session.chips,
        gambleCount: session.gambleCount,
        maxReached: maxReached,
    })]);

    if (!player._isBot) {
        mp.events.call('slots:updatePlayerMoney', player, session.chips);
    }

    // Send updated UI state if gamble ended
    if (session.state === 'idle') {
        player.call('slotsUpdateState', [JSON.stringify(getStateForUI(session))]);
    }
}

function collectGamble(player) {
    const session = getSessionByPlayer(player);
    if (!session || session.state !== 'gamble') return;

    session.chips += session.gambleAmount;
    global.chatSend(player, `!{Orange}[SLOTS] !{White}Ai colectat $${session.gambleAmount}.`);
    session.totalWin = 0;
    session.gambleAmount = 0;
    session.gambleCount = 0;
    session.state = 'idle';

    if (!player._isBot) {
        mp.events.call('slots:updatePlayerMoney', player, session.chips);
    }

    player.call('slotsUpdateState', [JSON.stringify(getStateForUI(session))]);
}

// ──────────────────────────────────────────
// BELL LINK BONUS
// ──────────────────────────────────────────
function startBellLink(player) {
    const session = getSessionByPlayer(player);
    if (!session || session.state !== 'idle' || session.gameMode !== 'belllink') return;

    // Read bell positions from the last spin data stored in session
    // Client sends this after detecting trigger
    const bellPositions = session._pendingBellLink;
    if (!bellPositions || bellPositions.length < BELL_LINK.TRIGGER_COUNT) return;

    session.state = 'belllink';

    // Build 3x5 grid (null = empty, number = bell value)
    const blGrid = [[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null]];
    const boostCells = [[false,false,false,false,false],[false,false,false,false,false],[false,false,false,false,false]];
    let total = 0;
    for (const bp of bellPositions) {
        blGrid[bp.row][bp.reel] = bp.isBoost ? 'boost' : bp.value;
        if (bp.isBoost) boostCells[bp.row][bp.reel] = true;
        if (!bp.isBoost) total += bp.value;
    }

    session.bellLinkState = {
        grid: blGrid,
        respinsLeft: BELL_LINK.INITIAL_RESPINS,
        total: total,
        finished: false,
    };
    session._pendingBellLink = null;

    global.chatSend(player, `!{Orange}[SLOTS] !{Yellow}🔔 BELL LINK ACTIVAT! ${bellPositions.length} clopoturi!`);

    player.call('slotsBellLinkStart', [JSON.stringify({
        grid: blGrid,
        boostCells: boostCells,
        respinsLeft: BELL_LINK.INITIAL_RESPINS,
        total: total,
        reelsBoost: session.reelsBoost,
    })]);
}

function bellLinkSpin(player) {
    const session = getSessionByPlayer(player);
    if (!session || session.state !== 'belllink' || !session.bellLinkState) return;

    const bls = session.bellLinkState;
    const newBells = [];

    // For each empty cell, chance to place a bell
    for (let row = 0; row < SLOTS_CONFIG.ROWS; row++) {
        for (let reel = 0; reel < SLOTS_CONFIG.REELS; reel++) {
            if (bls.grid[row][reel] === null) {
                if (Math.random() < BELL_LINK.CELL_BELL_CHANCE) {
                    const value = generateBellValue(session.betPerLine * SLOTS_CONFIG.LINES);
                    bls.grid[row][reel] = value;
                    bls.total += value;
                    newBells.push({ row, reel, value });
                }
            }
        }
    }

    if (newBells.length > 0) {
        bls.respinsLeft = BELL_LINK.INITIAL_RESPINS; // reset
    } else {
        bls.respinsLeft--;
    }

    if (bls.respinsLeft <= 0) {
        bls.finished = true;

        // Count total bells on the grid
        let bellCount = 0;
        for (let r = 0; r < SLOTS_CONFIG.ROWS; r++)
            for (let c = 0; c < SLOTS_CONFIG.REELS; c++)
                if (bls.grid[r][c] !== null) bellCount++;

        // Apply multiplier
        let multiplier = 1;
        const isFullBoard = bellCount >= BELL_LINK.FULL_BOARD;
        const hasBoost = session.reelsBoost;

        if (hasBoost && isFullBoard) {
            multiplier = 4;
        } else if (hasBoost && bellCount >= BELL_LINK.BOOST_THRESHOLD) {
            multiplier = 2;
        } else if (isFullBoard) {
            multiplier = 2;
        }

        const finalTotal = bls.total * multiplier;
        bls.multiplier = multiplier;

        session.chips += finalTotal;
        session.totalWin = finalTotal;
        session.lastWin = finalTotal;
        session.state = 'idle';
        session.reelsBoost = false; // reset boost after bell link ends
        global.chatSend(player, `!{Orange}[SLOTS] !{Green}🔔 BELL LINK TOTAL: $${finalTotal}${multiplier > 1 ? ` (${multiplier}x!)` : ''}!`);
        if (!player._isBot) {
            mp.events.call('slots:updatePlayerMoney', player, session.chips);
        }
    }

    player.call('slotsBellLinkResult', [JSON.stringify({
        grid: bls.grid,
        newBells: newBells,
        respinsLeft: bls.respinsLeft,
        total: bls.total,
        finished: bls.finished,
        multiplier: bls.finished ? (bls.multiplier || 1) : 1,
        reelsBoost: session.reelsBoost,
    })]);

    if (bls.finished) {
        session.bellLinkState = null;
        player.call('slotsUpdateState', [JSON.stringify(getStateForUI(session))]);
    }
}

// ──────────────────────────────────────────
// BOOK OF RA — GAME LOGIC
// ──────────────────────────────────────────
function borSpin(player) {
    const session = getSessionByPlayer(player);
    if (!session) return;

    const isFree = session.borFreeSpinsLeft > 0;
    if (!isFree && session.state !== 'idle') {
        global.chatSend(player, '!{Red}Nu poți da spin acum!');
        return;
    }

    const totalBet = isFree ? 0 : session.betPerLine * SLOTS_CONFIG.LINES;
    if (!isFree && totalBet > session.chips) {
        global.chatSend(player, '!{Red}Nu ai suficienți bani!');
        return;
    }

    if (!isFree) session.chips -= totalBet;
    session.state = 'spinning';

    const grid = borGenerateGrid();

    // Lucky mode boost — 20x sanse de speciale
    if (player._slotsLucky > 0) {
        player._slotsLucky--;
        for (let row = 0; row < SLOTS_CONFIG.ROWS; row++) {
            for (let reel = 0; reel < SLOTS_CONFIG.REELS; reel++) {
                if (grid[row][reel] !== 'book' && Math.random() < 0.18) {
                    grid[row][reel] = 'book';
                }
            }
        }
        if (player._slotsLucky <= 0) {
            player.call('slotsLuckyExpired');
            global.chatSend(player, '!{FFD700}🍀 LUCKY MODE expirat!');
        } else {
            player.call('slotsLuckyUpdate', [player._slotsLucky]);
        }
    }

    session.lastGrid = grid;

    // Count books (scatter)
    let bookCount = 0;
    const bookPositions = [];
    for (let row = 0; row < SLOTS_CONFIG.ROWS; row++) {
        for (let reel = 0; reel < SLOTS_CONFIG.REELS; reel++) {
            if (grid[row][reel] === 'book') {
                bookCount++;
                bookPositions.push({ row, reel });
            }
        }
    }

    // Scatter win
    let scatterWin = 0;
    const betForScatter = isFree ? session.borBaseBet : totalBet;
    if (bookCount >= 3 && BOR_SCATTER_PAY[Math.min(bookCount, 5)]) {
        scatterWin = betForScatter * BOR_SCATTER_PAY[Math.min(bookCount, 5)];
    }

    // Free spins
    let freeSpinsWon = 0;
    let newExpandingSymbol = null;
    if (bookCount >= 3) {
        freeSpinsWon = BOR_FREE_SPINS;
    }

    // Evaluate normal line wins (with wild book)
    const normalResult = borEvaluateSpin(grid, session.betPerLine);
    let lineWins = normalResult.lineWins;
    let winLines = normalResult.winLines;
    let totalLineWin = normalResult.totalWin;
    let expandedReels = [];

    // Expanding symbol during free spins
    if (isFree && session.borExpandingSymbol) {
        const expandResult = borCheckExpansion(grid, session.borExpandingSymbol, session.betPerLine);
        if (expandResult && expandResult.totalWin > totalLineWin) {
            lineWins = expandResult.lineWins;
            winLines = expandResult.winLines;
            totalLineWin = expandResult.totalWin;
            expandedReels = expandResult.expandedReels;
        }
    }

    let totalWin = totalLineWin + scatterWin;

    // Free spins tracking
    if (isFree) {
        session.borFreeSpinsLeft--;
        session.borFreeSpinsTotalWin += totalWin;
    }

    // Award free spins
    if (freeSpinsWon > 0) {
        if (isFree) {
            session.borFreeSpinsLeft += freeSpinsWon;
        } else {
            session.borFreeSpinsLeft = freeSpinsWon;
            session.borFreeSpinsTotalWin = 0;
            session.borBaseBet = totalBet;
            const expandableSymbols = ['explorer','pharaoh','mummy','scarab','ace','king','queen','jack','ten'];
            newExpandingSymbol = expandableSymbols[Math.floor(Math.random() * expandableSymbols.length)];
            session.borExpandingSymbol = newExpandingSymbol;
        }
    }

    session.lastWin = totalWin;
    session.totalWin = totalWin;
    if (totalWin > 0) session.chips += totalWin;

    const gameId = slotsLog.onSpin(session.id, session.name, player.name,
        session.betPerLine, SLOTS_CONFIG.LINES, totalBet);
    slotsLog.onSpinResult(session.id, session.name, player.name, gameId,
        grid, totalWin, freeSpinsWon);

    session.history.unshift({ grid, bet: totalBet, win: totalWin, isFree });
    if (session.history.length > 15) session.history.pop();

    // Reel stops
    const reelStops = [];
    for (let r = 0; r < SLOTS_CONFIG.REELS; r++) {
        const col = [];
        for (let row = 0; row < SLOTS_CONFIG.ROWS; row++) col.push(grid[row][r]);
        reelStops.push(findStopIndex(BOR_REEL_STRIPS[r], col));
    }

    const spinData = {
        grid, reelStops, lineWins, winLines,
        scatterCount: bookCount,
        scatterWin,
        totalWin,
        freeSpinsWon,
        isFree,
        freeSpinsLeft: session.borFreeSpinsLeft,
        freeSpinsTotalWin: session.borFreeSpinsTotalWin,
        turbo: session.turbo,
        bookPositions,
        expandingSymbol: session.borExpandingSymbol,
        expandedReels,
        newExpandingSymbol,
        bellPositions: null,
        bellLinkTriggered: false,
        reelsBoost: false,
    };

    player.call('slotsSpinResult', [JSON.stringify(spinData), session.chips]);

    if (totalWin > 0) {
        global.chatSend(player, `!{Orange}[SLOTS] !{Green}Câștig: $${totalWin}!`);
    }

    const spinTime = session.turbo ? SLOTS_CONFIG.TURBO_SPIN_TIME : SLOTS_CONFIG.SPIN_TIME;
    session.spinTimer = setTimeout(() => {
        if (session.player !== player) return;
        borFinishSpin(session, player);
    }, spinTime * 1000 + 500);
}

function borFinishSpin(session, player) {
    if (session.state !== 'spinning') return;
    if (session.spinTimer) { clearTimeout(session.spinTimer); session.spinTimer = null; }
    session.state = 'idle';
    player.call('slotsUpdateState', [JSON.stringify(getStateForUI(session))]);
}

function borGenerateGrid() {
    const grid = [[], [], []];
    for (let reel = 0; reel < SLOTS_CONFIG.REELS; reel++) {
        const strip = BOR_REEL_STRIPS[reel];
        const stopIdx = Math.floor(Math.random() * strip.length);
        for (let row = 0; row < SLOTS_CONFIG.ROWS; row++) {
            grid[row][reel] = strip[(stopIdx + row) % strip.length];
        }
    }
    return grid;
}

function borEvaluateSpin(grid, betPerLine) {
    let totalWin = 0;
    const lineWins = [];
    const winLines = [];

    for (let lineIdx = 0; lineIdx < PAYLINES.length; lineIdx++) {
        const line = PAYLINES[lineIdx];
        const symbols = [];
        for (let reel = 0; reel < SLOTS_CONFIG.REELS; reel++) {
            symbols.push(grid[line[reel]][reel]);
        }
        const result = borEvaluateLine(symbols);
        if (result && result.pay > 0) {
            const win = betPerLine * result.pay;
            totalWin += win;
            lineWins.push({ line: lineIdx, symbol: result.symbol, count: result.count, win });
            winLines.push(lineIdx);
        }
    }

    return { lineWins, totalWin, winLines };
}

function borEvaluateLine(symbols) {
    // Book is wild — substitutes for all symbols
    let bestResult = null;
    const possibleSymbols = ['explorer','pharaoh','mummy','scarab','ace','king','queen','jack','ten'];

    for (const baseSym of possibleSymbols) {
        let count = 0;
        for (let i = 0; i < symbols.length; i++) {
            if (symbols[i] === baseSym || symbols[i] === 'book') {
                count++;
            } else {
                break;
            }
        }

        if (count >= 2 && BOR_PAYTABLE[baseSym]) {
            const payIdx = count - 2; // [2x, 3x, 4x, 5x]
            if (payIdx < BOR_PAYTABLE[baseSym].length) {
                const pay = BOR_PAYTABLE[baseSym][payIdx];
                if (pay > 0 && (!bestResult || pay > bestResult.pay)) {
                    bestResult = { symbol: baseSym, count, pay };
                }
            }
        }
    }

    return bestResult;
}

function borCheckExpansion(grid, expandingSymbol, betPerLine) {
    // Find reels that contain the expanding symbol
    const expandedReels = [];
    for (let reel = 0; reel < SLOTS_CONFIG.REELS; reel++) {
        for (let row = 0; row < SLOTS_CONFIG.ROWS; row++) {
            if (grid[row][reel] === expandingSymbol) {
                expandedReels.push(reel);
                break;
            }
        }
    }

    if (expandedReels.length === 0) return null;

    // Create expanded grid (expanding symbol fills entire reels where it appears)
    const expandedGrid = grid.map(row => [...row]);
    for (const reel of expandedReels) {
        for (let row = 0; row < SLOTS_CONFIG.ROWS; row++) {
            expandedGrid[row][reel] = expandingSymbol;
        }
    }

    const result = borEvaluateSpin(expandedGrid, betPerLine);
    if (result.totalWin > 0) {
        result.expandedReels = expandedReels;
        return result;
    }

    return null;
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
        gambleCount: session.gambleCount,
        turbo: session.turbo,
        gameMode: session.gameMode,
        borFreeSpinsLeft: session.borFreeSpinsLeft || 0,
        borExpandingSymbol: session.borExpandingSymbol || null,
        borFreeSpinsTotalWin: session.borFreeSpinsTotalWin || 0,
        config: {
            minBet: SLOTS_CONFIG.MIN_BET_PER_LINE,
            maxBet: SLOTS_CONFIG.MAX_BET_PER_LINE,
            lines: SLOTS_CONFIG.LINES,
            spinTime: SLOTS_CONFIG.SPIN_TIME,
            turboSpinTime: SLOTS_CONFIG.TURBO_SPIN_TIME,
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
    if (global.hudUpdateMoney) global.hudUpdateMoney(player, newAmount);
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

mp.events.add('Server_SlotsToggleTurbo', (player) => {
    const session = getSessionByPlayer(player);
    if (!session) return;
    session.turbo = !session.turbo;
    player.call('slotsUpdateState', [JSON.stringify(getStateForUI(session))]);
});

mp.events.add('Server_SlotsSkipAnimation', (player) => {
    skipAnimation(player);
});

mp.events.add('Server_SlotsSetGameMode', (player, mode) => {
    const session = getSessionByPlayer(player);
    if (!session) return;
    if (mode !== 'normal' && mode !== 'belllink' && mode !== 'bookofra') return;
    session.gameMode = mode;
    session.reelsBoost = false;
    session.borFreeSpinsLeft = 0;
    session.borFreeSpinsTotalWin = 0;
    session.borExpandingSymbol = null;
    session.borBaseBet = 0; // reset boost on mode change
    player.call('slotsUpdateState', [JSON.stringify(getStateForUI(session))]);
});

mp.events.add('Server_SlotsBellLinkStart', (player) => {
    startBellLink(player);
});

mp.events.add('Server_SlotsBellLinkSpin', (player) => {
    bellLinkSpin(player);
});

mp.events.add('Server_JoinSlotsMachine', (player, machineIndex, machineName) => {
    global.chatSend(player, `!{Green}[SLOTS] Te așezi la aparatul "${machineName}"...`);
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
