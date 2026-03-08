// ═══════════════════════════════════════════════════════════════
// CASINO ROULETTE GTA — CONFIG
// Recreated from decompiled GTA V casinoroulette.c
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
    // Table layout (from decompiled: 6 tables, 4 player slots each)
    MAX_TABLES: 6,
    SEATS_PER_TABLE: 4,

    // Bet limits (GTA V Diamond Casino values)
    MIN_BET: 500,           // minimum chip bet
    MAX_BET: 50000,         // maximum chip bet
    MAX_BETS_PER_PLAYER: 20,

    // Timing (from func_45/func_46 — durations based on player count)
    BET_TIME_1_2_PLAYERS: 40,   // 40 seconds for 1-2 players
    BET_TIME_3_PLAYERS: 50,     // 50 seconds for 3 players
    BET_TIME_4_PLAYERS: 60,     // 60 seconds for 4 players

    SPIN_TIME: 10,              // wheel spin animation duration (seconds)
    RESULT_DELAY: 6,            // show result before next round (seconds)
    PAYOUT_TIMEOUT: 30,         // max wait for payout phase (seconds)

    // State machine states (from func_39 switch cases)
    STATES: {
        IDLE: 0,                // table empty / initializing
        WAITING: 1,             // waiting for players (func_102)
        BETTING: 2,             // betting phase (func_80)
        NO_MORE_BETS: 3,       // "no more bets" transition
        SPINNING: 4,            // wheel spinning (func_76)
        RESULT: 5,              // result announcement / dealer animations (func_62)
        PAYOUT: 6,              // payout / round end (func_43)
        CLEANUP: 7,             // cleanup / transition (func_40)
    },

    // Dealer animation states (from func_10 switch cases)
    DEALER_ANIM_STATES: {
        IDLE: 19,
        IDLE_EMPTY_TABLE: 20,
        IDLE_WITH_PLAYERS: 21,
        SPIN_WHEEL: 22,
        NO_MORE_BETS: 23,
        CLEAR_CHIPS_ZONE1: 24,
        CLEAR_CHIPS_ZONE2: 25,
        CLEAR_CHIPS_ZONE3: 26,
        CLEAR_CHIPS_INTRO: 27,
        CLEAR_CHIPS_OUTRO: 28,
    },

    // Dealer voice groups (from func_110)
    DEALER_VOICES: {
        MALE: [
            'Casino_01_WHITE_01',
            'Casino_01_WHITE_02',
            'Casino_01_ASIAN_01',
            'Casino_01_ASIAN_02',
        ],
        FEMALE: [
            'Casino_01_ASIAN_01',
            'Casino_01_ASIAN_02',
            'Casino_01_LATINA_01',
            'Casino_01_LATINA_02',
        ],
    },

    // Colshape radii
    TABLE_INTERACT_RADIUS: 3.0,
    TABLE_LEAVE_RADIUS: 10.0,

    // Interior room names (from func_111/112)
    INTERIOR_ROOMS: {
        GAMING_FLOOR_02: 'rm_GamingFloor_02',  // tables 2-5
        GAMING_FLOOR_03: 'rm_GamingFloor_03',  // tables 0,1
    },
};

// ═══════════════════════════════════════════════════════════════
// ROULETTE NUMBERS & COLORS
// (Standard European roulette — single zero)
// ═══════════════════════════════════════════════════════════════
const RED_NUMBERS  = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

// European wheel order (same as GTA V)
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

function getNumberColor(num) {
    if (num === 0) return 'green';
    if (RED_NUMBERS.includes(num)) return 'red';
    return 'black';
}

// ═══════════════════════════════════════════════════════════════
// BET TYPES & PAYOUTS
// (Standard roulette payouts — same odds as GTA V Diamond Casino)
// ═══════════════════════════════════════════════════════════════
const BET_TYPES = {
    straight:  { payout: 35, label: 'Straight Up',   description: 'Single number' },
    split:     { payout: 17, label: 'Split',          description: '2 numbers' },
    street:    { payout: 11, label: 'Street',         description: '3 numbers (row)' },
    corner:    { payout: 8,  label: 'Corner',         description: '4 numbers' },
    line:      { payout: 5,  label: 'Six Line',       description: '6 numbers (2 rows)' },
    column:    { payout: 2,  label: 'Column',         description: '12 numbers (column)' },
    dozen:     { payout: 2,  label: 'Dozen',          description: '12 numbers (1-12, 13-24, 25-36)' },
    red:       { payout: 1,  label: 'Red',            description: 'All red numbers' },
    black:     { payout: 1,  label: 'Black',          description: 'All black numbers' },
    odd:       { payout: 1,  label: 'Odd',            description: 'All odd numbers' },
    even:      { payout: 1,  label: 'Even',           description: 'All even numbers' },
    low:       { payout: 1,  label: '1-18',           description: 'Numbers 1-18' },
    high:      { payout: 1,  label: '19-36',          description: 'Numbers 19-36' },
};

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

module.exports = {
    CONFIG,
    RED_NUMBERS,
    BLACK_NUMBERS,
    WHEEL_ORDER,
    BET_TYPES,
    getNumberColor,
    getBetNumbers,
};
