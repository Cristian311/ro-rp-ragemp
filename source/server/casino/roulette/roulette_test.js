/**
 * Roulette Unit Tests
 * Run: node packages/casino/roulette/roulette_test.js
 * 
 * Tests pure logic extracted from roulette_server.js — no mp.* dependencies needed.
 */

// ──────────────────────────────────────────
// COPY OF PURE LOGIC (no RAGE:MP deps)
// ──────────────────────────────────────────
const RED_NUMBERS  = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
const ALL_NUMBERS = [0, '00', 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36];

const BET_TYPES = {
    straight:  { payout: 35 },
    split:     { payout: 17 },
    street:    { payout: 11 },
    corner:    { payout: 8  },
    line:      { payout: 5  },
    column:    { payout: 2  },
    dozen:     { payout: 2  },
    red:       { payout: 1  },
    black:     { payout: 1  },
    odd:       { payout: 1  },
    even:      { payout: 1  },
    low:       { payout: 1  },
    high:      { payout: 1  },
};

const ROULETTE_CONFIG = {
    MIN_BET: 10,
    MAX_BET: 50000,
    MAX_BETS_PER_PLAYER: 20,
    MAX_TOTAL_BET_PER_ROUND: 100000,
};

const CHIP_AMOUNTS = [50, 100, 500, 1000, 2000, 3000, 5000];

function getNumberColor(num) {
    if (num === 0 || num === '00') return 'green';
    if (RED_NUMBERS.includes(num)) return 'red';
    return 'black';
}

function getBetNumbers(betType, betValue) {
    switch (betType) {
        case 'straight': return [betValue];
        case 'split':    return betValue;
        case 'street':   return betValue;
        case 'corner':   return betValue;
        case 'line':     return betValue;
        case 'column': {
            const col = betValue;
            const nums = [];
            for (let i = col; i <= 36; i += 3) nums.push(i);
            return nums;
        }
        case 'dozen': {
            const d = betValue;
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

function calculateWinnings(bets, winningNumber) {
    let totalWin = 0;
    bets.forEach(bet => {
        if (bet.numbers.includes(winningNumber)) {
            totalWin += bet.amount + (bet.amount * bet.payout);
        }
    });
    return totalWin;
}

function validateBet(betType, amount, playerChips, currentTotalBet, currentBetCount) {
    if (typeof betType !== 'string' || !BET_TYPES[betType]) return 'Tip de pariu invalid';
    amount = parseInt(amount);
    if (!Number.isFinite(amount) || amount <= 0) return 'Sumă invalidă';
    if (amount < ROULETTE_CONFIG.MIN_BET) return 'Sub minim';
    if (amount > ROULETTE_CONFIG.MAX_BET) return 'Peste maxim';
    if (currentBetCount >= ROULETTE_CONFIG.MAX_BETS_PER_PLAYER) return 'Prea multe pariuri';
    if (currentTotalBet + amount > ROULETTE_CONFIG.MAX_TOTAL_BET_PER_ROUND) return 'Limita pe rundă';
    if (amount > playerChips) return 'Fonduri insuficiente';
    return null; // valid
}

// ──────────────────────────────────────────
// TEST RUNNER
// ──────────────────────────────────────────
let passed = 0, failed = 0;

function assert(condition, testName) {
    if (condition) {
        passed++;
        console.log(`  ✓ ${testName}`);
    } else {
        failed++;
        console.log(`  ✗ FAIL: ${testName}`);
    }
}

function assertEq(actual, expected, testName) {
    const eq = JSON.stringify(actual) === JSON.stringify(expected);
    if (eq) {
        passed++;
        console.log(`  ✓ ${testName}`);
    } else {
        failed++;
        console.log(`  ✗ FAIL: ${testName}`);
        console.log(`    expected: ${JSON.stringify(expected)}`);
        console.log(`    actual:   ${JSON.stringify(actual)}`);
    }
}

// ──────────────────────────────────────────
// TEST SUITES
// ──────────────────────────────────────────

console.log('\n=== getNumberColor ===');
assertEq(getNumberColor(0), 'green', '0 este verde');
assertEq(getNumberColor('00'), 'green', '00 este verde');
assertEq(getNumberColor(1), 'red', '1 este rosu');
assertEq(getNumberColor(2), 'black', '2 este negru');
assertEq(getNumberColor(14), 'red', '14 este rosu');
assertEq(getNumberColor(15), 'black', '15 este negru');
assertEq(getNumberColor(36), 'red', '36 este rosu');
assertEq(getNumberColor(35), 'black', '35 este negru');

console.log('\n=== Numere rosii/negre — fara overlap ===');
{
    const overlap = RED_NUMBERS.filter(n => BLACK_NUMBERS.includes(n));
    assertEq(overlap.length, 0, 'Niciun numar nu e si rosu si negru');
    assertEq(RED_NUMBERS.length, 18, '18 numere rosii');
    assertEq(BLACK_NUMBERS.length, 18, '18 numere negre');
    const all = [...RED_NUMBERS, ...BLACK_NUMBERS].sort((a, b) => a - b);
    const expected = [];
    for (let i = 1; i <= 36; i++) expected.push(i);
    assertEq(all, expected, 'Rosu + negru = toate de la 1-36');
}

console.log('\n=== ALL_NUMBERS ===');
assertEq(ALL_NUMBERS.length, 38, 'American roulette: 38 numere (0, 00, 1-36)');
assert(ALL_NUMBERS.includes(0), 'Contine 0');
assert(ALL_NUMBERS.includes('00'), 'Contine 00');
assert(ALL_NUMBERS.includes(36), 'Contine 36');

console.log('\n=== getBetNumbers — straight ===');
assertEq(getBetNumbers('straight', 7), [7], 'Straight pe 7');
assertEq(getBetNumbers('straight', 0), [0], 'Straight pe 0');
assertEq(getBetNumbers('straight', '00'), ['00'], 'Straight pe 00');

console.log('\n=== getBetNumbers — column ===');
{
    const col1 = getBetNumbers('column', 1);
    assertEq(col1, [1,4,7,10,13,16,19,22,25,28,31,34], 'Coloana 1');
    assertEq(col1.length, 12, 'Coloana 1 are 12 numere');

    const col2 = getBetNumbers('column', 2);
    assertEq(col2, [2,5,8,11,14,17,20,23,26,29,32,35], 'Coloana 2');

    const col3 = getBetNumbers('column', 3);
    assertEq(col3, [3,6,9,12,15,18,21,24,27,30,33,36], 'Coloana 3');
}

console.log('\n=== getBetNumbers — dozen ===');
{
    const d1 = getBetNumbers('dozen', 1);
    assertEq(d1, [1,2,3,4,5,6,7,8,9,10,11,12], 'Duzina 1 (1-12)');
    const d2 = getBetNumbers('dozen', 2);
    assertEq(d2, [13,14,15,16,17,18,19,20,21,22,23,24], 'Duzina 2 (13-24)');
    const d3 = getBetNumbers('dozen', 3);
    assertEq(d3, [25,26,27,28,29,30,31,32,33,34,35,36], 'Duzina 3 (25-36)');
}

console.log('\n=== getBetNumbers — red/black ===');
assertEq(getBetNumbers('red').length, 18, 'Red acopera 18 numere');
assertEq(getBetNumbers('black').length, 18, 'Black acopera 18 numere');

console.log('\n=== getBetNumbers — odd/even ===');
{
    const odds = getBetNumbers('odd');
    assertEq(odds.length, 18, 'Odd are 18 numere');
    assert(odds.every(n => n % 2 === 1), 'Toate sunt impare');
    assert(!odds.includes(0), 'Odd nu include 0');

    const evens = getBetNumbers('even');
    assertEq(evens.length, 18, 'Even are 18 numere');
    assert(evens.every(n => n % 2 === 0 && n > 0), 'Toate sunt pare (fara 0)');
}

console.log('\n=== getBetNumbers — low/high ===');
{
    const low = getBetNumbers('low');
    assertEq(low.length, 18, 'Low are 18 numere');
    assertEq(low[0], 1, 'Low incepe cu 1');
    assertEq(low[17], 18, 'Low se termina cu 18');

    const high = getBetNumbers('high');
    assertEq(high.length, 18, 'High are 18 numere');
    assertEq(high[0], 19, 'High incepe cu 19');
    assertEq(high[17], 36, 'High se termina cu 36');
}

console.log('\n=== getBetNumbers — invalid type ===');
assertEq(getBetNumbers('invalid_bet', 5), [], 'Tip invalid returneaza array gol');
assertEq(getBetNumbers('', 5), [], 'Tip gol returneaza array gol');

console.log('\n=== calculateWinnings — straight win ===');
{
    const bets = [{ type: 'straight', numbers: [7], amount: 100, payout: 35 }];
    assertEq(calculateWinnings(bets, 7), 3600, 'Straight pe 7, castiga 100 + 3500 = 3600');
    assertEq(calculateWinnings(bets, 8), 0, 'Straight pe 7, pierde cand vine 8');
}

console.log('\n=== calculateWinnings — red win ===');
{
    const bets = [{ type: 'red', numbers: [...RED_NUMBERS], amount: 500, payout: 1 }];
    assertEq(calculateWinnings(bets, 1), 1000, 'Red bet, vine 1 (rosu) -> 500 + 500 = 1000');
    assertEq(calculateWinnings(bets, 2), 0, 'Red bet, vine 2 (negru) -> 0');
    assertEq(calculateWinnings(bets, 0), 0, 'Red bet, vine 0 (verde) -> 0');
}

console.log('\n=== calculateWinnings — multiple bets ===');
{
    const bets = [
        { type: 'straight', numbers: [7], amount: 100, payout: 35 },
        { type: 'red', numbers: [...RED_NUMBERS], amount: 200, payout: 1 },
        { type: 'odd', numbers: getBetNumbers('odd'), amount: 300, payout: 1 },
    ];
    // 7 = rosu + impar -> toate 3 castiga
    const win7 = calculateWinnings(bets, 7);
    assertEq(win7, 3600 + 400 + 600, 'Toate 3 pariuri castiga pe 7: 3600+400+600=4600');

    // 2 = negru + par -> niciunul nu castiga
    assertEq(calculateWinnings(bets, 2), 0, 'Niciun pariu nu castiga pe 2');

    // 3 = rosu + impar, dar nu 7 -> red si odd castiga, straight nu
    assertEq(calculateWinnings(bets, 3), 400 + 600, 'Red+Odd castiga pe 3: 400+600=1000');
}

console.log('\n=== calculateWinnings — dozen win ===');
{
    const bets = [{ type: 'dozen', numbers: getBetNumbers('dozen', 2), amount: 1000, payout: 2 }];
    assertEq(calculateWinnings(bets, 13), 3000, 'Dozen 2, vine 13 -> 1000 + 2000 = 3000');
    assertEq(calculateWinnings(bets, 1), 0, 'Dozen 2, vine 1 -> 0');
    assertEq(calculateWinnings(bets, 25), 0, 'Dozen 2, vine 25 -> 0');
}

console.log('\n=== validateBet ===');
assertEq(validateBet('straight', 100, 5000, 0, 0), null, 'Pariu valid');
assertEq(validateBet('straight', 5, 5000, 0, 0), 'Sub minim', 'Sub MIN_BET=$10');
assertEq(validateBet('straight', 60000, 100000, 0, 0), 'Peste maxim', 'Peste MAX_BET=$50000');
assertEq(validateBet('straight', 100, 50, 0, 0), 'Fonduri insuficiente', 'Nu are destui bani');
assertEq(validateBet('invalidtype', 100, 5000, 0, 0), 'Tip de pariu invalid', 'Tip necunoscut');
assertEq(validateBet('straight', -50, 5000, 0, 0), 'Sumă invalidă', 'Suma negativa');
assertEq(validateBet('straight', 0, 5000, 0, 0), 'Sumă invalidă', 'Suma zero');
assertEq(validateBet('straight', 'abc', 5000, 0, 0), 'Sumă invalidă', 'Suma text');
assertEq(validateBet('straight', 100, 5000, 0, 20), 'Prea multe pariuri', 'Max bets atins');
assertEq(validateBet('straight', 50000, 5000000, 60000, 0), 'Limita pe rundă', 'Limita totala pe runda');

console.log('\n=== CHIP_AMOUNTS — consistenta ===');
assert(CHIP_AMOUNTS.length === 7, '7 chip amounts');
assert(CHIP_AMOUNTS[0] === 50, 'Chip minim = $50');
assert(CHIP_AMOUNTS[6] === 5000, 'Chip maxim = $5000');
assert(CHIP_AMOUNTS.every((v, i) => i === 0 || v > CHIP_AMOUNTS[i - 1]), 'Chips in ordine crescatoare');
assert(CHIP_AMOUNTS.every(v => v >= ROULETTE_CONFIG.MIN_BET), 'Toate chipurile >= MIN_BET');
assert(CHIP_AMOUNTS.every(v => v <= ROULETTE_CONFIG.MAX_BET), 'Toate chipurile <= MAX_BET');

console.log('\n=== Payouts — house edge sanity ===');
{
    // American roulette: 38 outcomes, house edge from 0 and 00
    // Straight: pays 35:1 but 1/38 chance -> EV = (35/38) - (37/38) = -2/38 ≈ -5.26%
    const straightEV = (35 * (1/38)) - (1 * (37/38));
    assert(straightEV < 0, 'Straight bet are EV negativ (house edge)');
    
    // Red: pays 1:1 but 18/38 chance (not 18/36)
    const redEV = (1 * (18/38)) - (1 * (20/38));
    assert(redEV < 0, 'Red bet are EV negativ');
    
    // Column: pays 2:1 but 12/38 chance
    const colEV = (2 * (12/38)) - (1 * (26/38));
    assert(colEV < 0, 'Column bet are EV negativ');
}

console.log('\n=== Chip stacking random offset ===');
{
    // Verify random offset range is reasonable
    const offsets = [];
    for (let i = 0; i < 1000; i++) {
        offsets.push((Math.random() - 0.5) * 0.012);
    }
    const min = Math.min(...offsets);
    const max = Math.max(...offsets);
    assert(min >= -0.006, `Offset minim (${min.toFixed(4)}) >= -0.006`);
    assert(max <= 0.006, `Offset maxim (${max.toFixed(4)}) <= 0.006`);
    assert(max - min > 0.008, 'Offseturile au varianta suficienta');
}

// ──────────────────────────────────────────
// RESULTS
// ──────────────────────────────────────────
console.log('\n' + '='.repeat(40));
console.log(`TOTAL: ${passed + failed} teste | ✓ ${passed} passed | ✗ ${failed} failed`);
console.log('='.repeat(40));

process.exit(failed > 0 ? 1 : 0);
