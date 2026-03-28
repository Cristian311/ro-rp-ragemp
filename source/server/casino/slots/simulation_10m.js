// ═══════════════════════════════════════════════════
// SLOTS SIMULATION — 10 Million Spins
// Normal Mode + Bell Link Mode
// ═══════════════════════════════════════════════════

const REELS = 5;
const ROWS = 3;
const LINES = 10;
const BET_PER_LINE = 10;
const TOTAL_BET = BET_PER_LINE * LINES; // 100
const SPINS = 10_000_000;

// ── REEL STRIPS ──
const REEL_STRIPS = [
    ['cherry','lemon','orange','plum','seven','bell','grapes','watermelon','lemon','cherry',
     'orange','star','plum','bell','lemon','cherry','grapes','plum','orange','cherry',
     'seven','lemon','plum','cherry','watermelon','bell','orange','lemon','cherry','grapes'],
    ['lemon','cherry','bell','orange','plum','cherry','watermelon','grapes','lemon','seven',
     'cherry','orange','lemon','plum','lemon','bell','cherry','orange','grapes','cherry',
     'lemon','star','watermelon','plum','cherry','orange','lemon','bell','cherry','seven'],
    ['orange','lemon','cherry','grapes','bell','plum','cherry','lemon','watermelon','orange',
     'cherry','seven','lemon','plum','bell','orange','orange','cherry','grapes','lemon',
     'cherry','star','plum','bell','orange','cherry','lemon','watermelon','seven','cherry'],
    ['plum','cherry','lemon','orange','bell','cherry','grapes','lemon','watermelon','cherry',
     'orange','seven','plum','lemon','cherry','cherry','bell','orange','lemon','cherry',
     'grapes','star','plum','watermelon','cherry','lemon','orange','bell','cherry','seven'],
    ['cherry','orange','lemon','bell','plum','cherry','seven','grapes','lemon','orange',
     'cherry','watermelon','plum','lemon','bell','cherry','orange','grapes','lemon','cherry',
     'grapes','star','bell','plum','orange','lemon','cherry','watermelon','seven','cherry'],
];

// ── PAYLINES ──
const PAYLINES = [
    [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],
    [0,1,2,1,0],[2,1,0,1,2],[1,0,0,0,1],
    [1,2,2,2,1],[0,0,1,2,2],[2,2,1,0,0],
    [0,1,1,1,0],
];

// ── PAYTABLE ──
const PAYTABLE = {
    seven:      [135, 500, 2500],
    bell:       [85,  335, 1350],
    grapes:     [65,  275, 1000],
    watermelon: [55,  200, 675],
    plum:       [35,  135, 500],
    orange:     [30,  100, 335],
    lemon:      [16,  65,  250],
    cherry:     [16,  55,  175],
};

// ── BELL LINK CONFIG ──
const BELL_LINK = {
    TRIGGER_COUNT: 5,
    INITIAL_RESPINS: 3,
    CELL_BELL_CHANCE: 0.076,
    WIN_FACTOR: 0.841,
    BOOST_BELL_CHANCE: 0.15,
    FULL_BOARD: 15,
    BOOST_THRESHOLD: 12,
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

const BL_TOTAL_WEIGHT = BELL_LINK.VALUE_TABLE.reduce((s, v) => s + v.weight, 0);

function generateBellValue(totalBet) {
    let rand = Math.random() * BL_TOTAL_WEIGHT;
    for (const v of BELL_LINK.VALUE_TABLE) {
        rand -= v.weight;
        if (rand <= 0) return v.mult * totalBet;
    }
    return totalBet;
}

// ── GRID GENERATION ──
function generateGrid() {
    const grid = [[], [], []];
    for (let reel = 0; reel < REELS; reel++) {
        const strip = REEL_STRIPS[reel];
        const stopIdx = Math.floor(Math.random() * strip.length);
        for (let row = 0; row < ROWS; row++) {
            grid[row][reel] = strip[(stopIdx + row) % strip.length];
        }
    }
    return grid;
}

// ── EVALUATE LINE ──
function evaluateLine(symbols) {
    let baseSymbol = symbols[0];
    let count = 1;
    for (let i = 1; i < symbols.length; i++) {
        if (symbols[i] === baseSymbol) count++;
        else break;
    }
    if (count >= 3 && PAYTABLE[baseSymbol]) {
        return { symbol: baseSymbol, count: Math.min(count, 5) };
    }
    return null;
}

// ── EVALUATE SPIN ──
function evaluateSpin(grid) {
    let totalWin = 0;
    let lineWinCount = 0;

    for (let lineIdx = 0; lineIdx < PAYLINES.length; lineIdx++) {
        const line = PAYLINES[lineIdx];
        const symbols = [];
        for (let reel = 0; reel < REELS; reel++) {
            symbols.push(grid[line[reel]][reel]);
        }
        const result = evaluateLine(symbols);
        if (result) {
            const multiplier = PAYTABLE[result.symbol][result.count - 3];
            if (multiplier) {
                totalWin += BET_PER_LINE * multiplier;
                lineWinCount++;
            }
        }
    }
    return { totalWin, lineWinCount };
}

// ── COUNT BELLS ON GRID ──
function countBells(grid) {
    let count = 0;
    for (let row = 0; row < ROWS; row++)
        for (let reel = 0; reel < REELS; reel++)
            if (grid[row][reel] === 'bell') count++;
    return count;
}

// ── SIMULATE BELL LINK BONUS ──
function simulateBellLink(grid, hasBoostBell) {
    // Build initial bell positions
    const blGrid = [[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null]];
    let total = 0;

    for (let row = 0; row < ROWS; row++) {
        for (let reel = 0; reel < REELS; reel++) {
            if (grid[row][reel] === 'bell') {
                const val = generateBellValue(TOTAL_BET);
                blGrid[row][reel] = val;
                total += val;
            }
        }
    }

    let respinsLeft = BELL_LINK.INITIAL_RESPINS;
    let totalRespins = 0;

    while (respinsLeft > 0) {
        totalRespins++;
        let gotNew = false;
        for (let row = 0; row < ROWS; row++) {
            for (let reel = 0; reel < REELS; reel++) {
                if (blGrid[row][reel] === null) {
                    if (Math.random() < BELL_LINK.CELL_BELL_CHANCE) {
                        const val = generateBellValue(TOTAL_BET);
                        blGrid[row][reel] = val;
                        total += val;
                        gotNew = true;
                    }
                }
            }
        }
        if (gotNew) {
            respinsLeft = BELL_LINK.INITIAL_RESPINS;
        } else {
            respinsLeft--;
        }
    }

    // Count final bells
    let bellCount = 0;
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < REELS; c++)
            if (blGrid[r][c] !== null) bellCount++;

    // Multiplier
    let multiplier = 1;
    const isFullBoard = bellCount >= BELL_LINK.FULL_BOARD;
    if (hasBoostBell && isFullBoard) multiplier = 4;
    else if (hasBoostBell && bellCount >= BELL_LINK.BOOST_THRESHOLD) multiplier = 2;
    else if (isFullBoard) multiplier = 2;

    return { total: total * multiplier, bellCount, multiplier, totalRespins };
}

// ═══════════════════════════════════════════════════
// RUN SIMULATION
// ═══════════════════════════════════════════════════
console.log(`\n${'='.repeat(60)}`);
console.log(`  SLOTS SIMULATION — ${(SPINS/1e6).toFixed(0)}M SPINS`);
console.log(`  Bet: ${BET_PER_LINE}/line × ${LINES} lines = $${TOTAL_BET}/spin`);
console.log(`${'='.repeat(60)}\n`);

// ─── NORMAL MODE ───
console.log('>>> Simulating NORMAL mode...');
let normalTotalBet = 0;
let normalTotalWin = 0;
let normalWinSpins = 0;
let normalSymbolHits = {};
let normalMatchCounts = { 3: 0, 4: 0, 5: 0 };
let normalBigWins = 0; // win >= 10x bet
let normalMegaWins = 0; // win >= 50x bet

const t0 = Date.now();

for (let i = 0; i < SPINS; i++) {
    normalTotalBet += TOTAL_BET;
    const grid = generateGrid();
    const { totalWin, lineWinCount } = evaluateSpin(grid);

    if (totalWin > 0) {
        normalWinSpins++;
        normalTotalWin += totalWin;
    }
    if (totalWin >= TOTAL_BET * 10) normalBigWins++;
    if (totalWin >= TOTAL_BET * 50) normalMegaWins++;

    // Track per-symbol stats (detailed)
    for (let lineIdx = 0; lineIdx < PAYLINES.length; lineIdx++) {
        const line = PAYLINES[lineIdx];
        const symbols = [];
        for (let reel = 0; reel < REELS; reel++) symbols.push(grid[line[reel]][reel]);
        const result = evaluateLine(symbols);
        if (result && PAYTABLE[result.symbol]) {
            const key = result.symbol;
            if (!normalSymbolHits[key]) normalSymbolHits[key] = { '3': 0, '4': 0, '5': 0 };
            normalSymbolHits[key][result.count]++;
            normalMatchCounts[result.count]++;
        }
    }

    if ((i + 1) % 2_000_000 === 0) {
        const pct = ((i + 1) / SPINS * 100).toFixed(0);
        process.stdout.write(`  Normal: ${pct}%\r`);
    }
}

const t1 = Date.now();
const normalRTP = (normalTotalWin / normalTotalBet * 100).toFixed(4);

console.log(`\n--- NORMAL MODE RESULTS ---`);
console.log(`  Spins: ${SPINS.toLocaleString()}`);
console.log(`  Total Bet: $${normalTotalBet.toLocaleString()}`);
console.log(`  Total Win: $${normalTotalWin.toLocaleString()}`);
console.log(`  RTP: ${normalRTP}%`);
console.log(`  Win Rate: ${(normalWinSpins / SPINS * 100).toFixed(2)}% (${normalWinSpins.toLocaleString()} winning spins)`);
console.log(`  Big Wins (>=10x): ${normalBigWins.toLocaleString()} (1 in ${Math.round(SPINS / normalBigWins)})`);
console.log(`  Mega Wins (>=50x): ${normalMegaWins.toLocaleString()} (1 in ${normalMegaWins > 0 ? Math.round(SPINS / normalMegaWins) : 'N/A'})`);
console.log(`  3-match: ${normalMatchCounts[3].toLocaleString()}, 4-match: ${normalMatchCounts[4].toLocaleString()}, 5-match: ${normalMatchCounts[5].toLocaleString()}`);
console.log(`  Time: ${((t1 - t0) / 1000).toFixed(1)}s`);

console.log(`\n  Per-Symbol Hit Rates (per ${SPINS.toLocaleString()} spins):`);
const symOrder = ['seven','bell','grapes','watermelon','plum','orange','lemon','cherry'];
for (const sym of symOrder) {
    const h = normalSymbolHits[sym] || { '3': 0, '4': 0, '5': 0 };
    console.log(`    ${sym.padEnd(12)} 3x: ${h['3'].toLocaleString().padStart(9)}  4x: ${h['4'].toLocaleString().padStart(7)}  5x: ${h['5'].toLocaleString().padStart(6)}`);
}

// ─── BELL LINK MODE ───
console.log(`\n>>> Simulating BELL LINK mode...`);
let blTotalBet = 0;
let blBaseWin = 0;
let blBonusWin = 0;
let blWinSpins = 0;
let blBigWins = 0;
let blMegaWins = 0;
let blTriggers = 0;
let blBoostTriggers = 0;
let blTotalBellsOnTrigger = 0;
let blBonusBellCounts = {};
let blMultiplierCounts = { 1: 0, 2: 0, 4: 0 };
let blBonusTotalRespins = 0;
let blMaxBonusWin = 0;
let blBellCountOnGrid = {};  // distribution of bell counts per spin

const t2 = Date.now();

for (let i = 0; i < SPINS; i++) {
    blTotalBet += TOTAL_BET;
    const grid = generateGrid();

    // Base game evaluation with WIN_FACTOR
    const { totalWin: rawWin } = evaluateSpin(grid);
    const baseWin = Math.round(rawWin * BELL_LINK.WIN_FACTOR);

    let spinTotalWin = baseWin;
    if (baseWin > 0) blWinSpins++;

    blBaseWin += baseWin;

    // Count bells on grid
    const bellCount = countBells(grid);
    blBellCountOnGrid[bellCount] = (blBellCountOnGrid[bellCount] || 0) + 1;

    // Check bell link trigger
    if (bellCount >= BELL_LINK.TRIGGER_COUNT) {
        blTriggers++;
        blTotalBellsOnTrigger += bellCount;

        // Boost bell check (same as server: iterate bells, first has 15% chance)
        let hasBoostBell = false;
        for (let row = 0; row < ROWS; row++) {
            for (let reel = 0; reel < REELS; reel++) {
                if (grid[row][reel] === 'bell' && !hasBoostBell) {
                    if (Math.random() < BELL_LINK.BOOST_BELL_CHANCE) hasBoostBell = true;
                }
            }
        }
        if (hasBoostBell) blBoostTriggers++;

        const blResult = simulateBellLink(grid, hasBoostBell);
        blBonusWin += blResult.total;
        spinTotalWin += blResult.total;
        blBonusTotalRespins += blResult.totalRespins;
        if (blResult.total > blMaxBonusWin) blMaxBonusWin = blResult.total;

        blBonusBellCounts[blResult.bellCount] = (blBonusBellCounts[blResult.bellCount] || 0) + 1;
        blMultiplierCounts[blResult.multiplier] = (blMultiplierCounts[blResult.multiplier] || 0) + 1;
    }

    if (spinTotalWin >= TOTAL_BET * 10) blBigWins++;
    if (spinTotalWin >= TOTAL_BET * 50) blMegaWins++;

    if ((i + 1) % 2_000_000 === 0) {
        const pct = ((i + 1) / SPINS * 100).toFixed(0);
        process.stdout.write(`  Bell Link: ${pct}%\r`);
    }
}

const t3 = Date.now();
const blTotalWin = blBaseWin + blBonusWin;
const blRTP = (blTotalWin / blTotalBet * 100).toFixed(4);
const blBaseRTP = (blBaseWin / blTotalBet * 100).toFixed(4);
const blBonusRTP = (blBonusWin / blTotalBet * 100).toFixed(4);
const blTriggerChance = (blTriggers / SPINS * 100).toFixed(4);

console.log(`\n--- BELL LINK MODE RESULTS ---`);
console.log(`  Spins: ${SPINS.toLocaleString()}`);
console.log(`  Total Bet: $${blTotalBet.toLocaleString()}`);
console.log(`  Total Win: $${blTotalWin.toLocaleString()}`);
console.log(`  RTP Total: ${blRTP}%`);
console.log(`    Base Game RTP: ${blBaseRTP}%`);
console.log(`    Bonus RTP: ${blBonusRTP}%`);
console.log(`  Win Rate (base): ${(blWinSpins / SPINS * 100).toFixed(2)}%`);
console.log(`  Big Wins (>=10x): ${blBigWins.toLocaleString()} (1 in ${Math.round(SPINS / blBigWins)})`);
console.log(`  Mega Wins (>=50x): ${blMegaWins.toLocaleString()} (1 in ${blMegaWins > 0 ? Math.round(SPINS / blMegaWins) : 'N/A'})`);

console.log(`\n  --- BELL LINK SPECIAL ---`);
console.log(`  Triggers: ${blTriggers.toLocaleString()} / ${SPINS.toLocaleString()}`);
console.log(`  Trigger Chance: ${blTriggerChance}% (1 in ${Math.round(SPINS / blTriggers)})`);
console.log(`  Avg Bells on Trigger: ${(blTotalBellsOnTrigger / blTriggers).toFixed(2)}`);
console.log(`  Boost Bell Triggers: ${blBoostTriggers.toLocaleString()} (${(blBoostTriggers / blTriggers * 100).toFixed(1)}% of triggers)`);
console.log(`  Total Bonus Win: $${blBonusWin.toLocaleString()}`);
console.log(`  Avg Bonus Win: $${Math.round(blBonusWin / blTriggers).toLocaleString()}`);
console.log(`  Max Bonus Win: $${blMaxBonusWin.toLocaleString()}`);
console.log(`  Avg Respins per Bonus: ${(blBonusTotalRespins / blTriggers).toFixed(1)}`);

console.log(`\n  Bell Count Distribution (per spin):`);
for (const [count, freq] of Object.entries(blBellCountOnGrid).sort((a, b) => a[0] - b[0])) {
    console.log(`    ${count} bells: ${freq.toLocaleString()} (${(freq / SPINS * 100).toFixed(3)}%)`);
}

console.log(`\n  Final Bell Count in Bonus (after respins):`);
for (const [count, freq] of Object.entries(blBonusBellCounts).sort((a, b) => a[0] - b[0])) {
    console.log(`    ${count} bells: ${freq.toLocaleString()} (${(freq / blTriggers * 100).toFixed(1)}%)`);
}

console.log(`\n  Multiplier Distribution:`);
for (const [mult, freq] of Object.entries(blMultiplierCounts).sort((a, b) => a[0] - b[0])) {
    console.log(`    ${mult}x: ${freq.toLocaleString()} (${(freq / blTriggers * 100).toFixed(2)}%)`);
}

console.log(`\n  Time: ${((t3 - t2) / 1000).toFixed(1)}s`);

console.log(`\n${'='.repeat(60)}`);
console.log(`  SUMMARY`);
console.log(`${'='.repeat(60)}`);
console.log(`  Normal Mode RTP:    ${normalRTP}%`);
console.log(`  Bell Link Mode RTP: ${blRTP}% (base: ${blBaseRTP}% + bonus: ${blBonusRTP}%)`);
console.log(`  Bell Link Trigger:  ${blTriggerChance}% (1 in ${Math.round(SPINS / blTriggers)} spins)`);
console.log(`${'='.repeat(60)}\n`);
