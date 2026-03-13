// ═══════════════════════════════════════════════════════════════
// CASINO ROULETTE GTA — ANIMATIONS
// Recreated from decompiled casinoroulette.c
// func_10, func_11–14, func_22 — Animation dictionaries & names
// ═══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────
// ANIMATION DICTIONARIES (from func_22)
// ──────────────────────────────────────────
const ANIM_DICTS = {
    PLAYER_ROULETTE:   'anim_casino_b@amb@casino@games@roulette@player',
    SHARED_PLAYER:     'anim_casino_b@amb@casino@games@shared@player',
    DEALER_MALE:       'anim_casino_b@amb@casino@games@roulette@dealer_male',
    DEALER_FEMALE:     'anim_casino_b@amb@casino@games@roulette@dealer_female',
    TABLE:             'anim_casino_b@amb@casino@games@roulette@table',
};

// Indexes matching the decompiled code
const ANIM_DICT_INDEX = {
    0: ANIM_DICTS.PLAYER_ROULETTE,
    1: ANIM_DICTS.SHARED_PLAYER,
    2: ANIM_DICTS.DEALER_MALE,
    3: ANIM_DICTS.DEALER_FEMALE,
    4: ANIM_DICTS.TABLE,
};

// ──────────────────────────────────────────
// ANIMATION NAMES (from func_10 switch)
// ──────────────────────────────────────────
const ANIM_NAMES = {
    // Core game anims (direct from func_10)
    IDLE:                'idle',
    SPIN_WHEEL:          'spin_wheel',
    NO_MORE_BETS:        'no_more_bets',
    CLEAR_CHIPS_INTRO:   'clear_chips_intro',
    CLEAR_CHIPS_ZONE1:   'clear_chips_zone1',
    CLEAR_CHIPS_ZONE2:   'clear_chips_zone2',
    CLEAR_CHIPS_ZONE3:   'clear_chips_zone3',
    CLEAR_CHIPS_OUTRO:   'clear_chips_outro',
};

// ──────────────────────────────────────────
// IDLE VARIANTS (from func_11–14)
// ──────────────────────────────────────────

// func_14 — Dealer with players (female dict): 6 variants
const IDLE_WITH_PLAYERS_FEMALE = [
    'IDLE_VAR01', 'IDLE_VAR02', 'IDLE_VAR03',
    'IDLE_VAR04', 'IDLE_VAR05', 'IDLE_VAR06',
];

// func_12 — Dealer with players (male dict): 5 variants
const IDLE_WITH_PLAYERS_MALE = [
    'IDLE_VAR01', 'IDLE_VAR02', 'IDLE_VAR03',
    'IDLE_VAR04', 'IDLE_VAR05',
];

// func_13 — Empty table idle (female dict): 4 variants
const IDLE_EMPTY_TABLE_FEMALE = [
    'EMPTY_TABLE_IDLE_VAR01', 'EMPTY_TABLE_IDLE_VAR02',
    'EMPTY_TABLE_IDLE_VAR03', 'EMPTY_TABLE_IDLE_VAR04',
];

// func_11 — Empty table idle (male dict): 2 variants
const IDLE_EMPTY_TABLE_MALE = [
    'EMPTY_TABLE_IDLE_VAR01', 'EMPTY_TABLE_IDLE_VAR02',
];

// ──────────────────────────────────────────
// CHIP CLEARING SEQUENCE (from func_63)
// The dealer clears chips in 5 animation steps:
//   INTRO → ZONE1/ZONE2/ZONE3 (based on where chips are) → OUTRO
// ──────────────────────────────────────────
const CLEAR_CHIPS_SEQUENCE = [
    'clear_chips_intro',
    'clear_chips_zone1',
    'clear_chips_zone2',
    'clear_chips_zone3',
    'clear_chips_outro',
];

// ──────────────────────────────────────────
// HELPER: Get random idle variant (from func_31, func_32, func_36)
// Picks a random variant different from the current one
// ──────────────────────────────────────────
function getRandomIdleVariant(isFemale, hasPlayers, currentIndex) {
    let variants;
    if (hasPlayers) {
        variants = isFemale ? IDLE_WITH_PLAYERS_FEMALE : IDLE_WITH_PLAYERS_MALE;
    } else {
        variants = isFemale ? IDLE_EMPTY_TABLE_FEMALE : IDLE_EMPTY_TABLE_MALE;
    }

    if (variants.length <= 1) return 0;

    // func_32 logic: random from [0, max) but different from current
    let newIndex;
    do {
        newIndex = Math.floor(Math.random() * variants.length);
    } while (newIndex === currentIndex && variants.length > 1);

    return newIndex;
}

function getIdleAnimName(isFemale, hasPlayers, variantIndex) {
    let variants;
    if (hasPlayers) {
        variants = isFemale ? IDLE_WITH_PLAYERS_FEMALE : IDLE_WITH_PLAYERS_MALE;
    } else {
        variants = isFemale ? IDLE_EMPTY_TABLE_FEMALE : IDLE_EMPTY_TABLE_MALE;
    }
    return variants[variantIndex] || variants[0];
}

function getDealerAnimDict(isFemale) {
    return isFemale ? ANIM_DICTS.DEALER_FEMALE : ANIM_DICTS.DEALER_MALE;
}

// ──────────────────────────────────────────
// ANIMATION BLEND VALUES (from func_8, func_23)
// ──────────────────────────────────────────
const BLEND_IN_SPEED  = 2.0;   // blend in rate (from uParam2->f_2 = 1090519040 = 8.0f, but used as 2.0 in scene)
const BLEND_OUT_SPEED = -2.0;  // blend out rate
const DEFAULT_SPEED   = 1.0;   // normal playback speed

module.exports = {
    ANIM_DICTS,
    ANIM_DICT_INDEX,
    ANIM_NAMES,
    IDLE_WITH_PLAYERS_FEMALE,
    IDLE_WITH_PLAYERS_MALE,
    IDLE_EMPTY_TABLE_FEMALE,
    IDLE_EMPTY_TABLE_MALE,
    CLEAR_CHIPS_SEQUENCE,
    BLEND_IN_SPEED,
    BLEND_OUT_SPEED,
    DEFAULT_SPEED,
    getRandomIdleVariant,
    getIdleAnimName,
    getDealerAnimDict,
};
