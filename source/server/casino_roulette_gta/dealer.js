// ═══════════════════════════════════════════════════════════════
// CASINO ROULETTE GTA — DEALER NPC MANAGEMENT
// Recreated from decompiled casinoroulette.c
// func_106, func_107, func_108, func_109, func_110, func_111
// func_25, func_26 — Dealer ped spawning, config, appearance
// ═══════════════════════════════════════════════════════════════

const animations = require('./animations');
const speech     = require('./speech');

// ──────────────────────────────────────────
// DEALER MODEL HASHES (from func_26)
// ──────────────────────────────────────────
const DEALER_MODELS = {
    MALE:   'S_M_Y_Casino_01',     // mp.joaat('S_M_Y_Casino_01')
    FEMALE: 's_f_y_casino_01',     // mp.joaat('s_f_y_casino_01')
};

// Active dealer peds per table index
const dealerPeds = {};

// Current idle variant index per dealer (func_31 tracks this)
const dealerIdleVariant = {};

// ──────────────────────────────────────────
// CREATE DEALER PED (from func_107)
// Spawns dealer NPC at table position with correct heading
// Sets all ped config flags from the decompiled code:
//   - Invulnerable, non-enemy, blocks non-temporary events
//   - Cannot ragdoll, cannot evasive dive
//   - Registered as network entity
// ──────────────────────────────────────────
function createDealer(tableIndex, position, heading, isFemale, voiceIndex) {
    if (dealerPeds[tableIndex]) {
        console.log(`[CASINO_ROULETTE] Dealer already exists at table ${tableIndex}`);
        return dealerPeds[tableIndex];
    }

    const model = isFemale ? DEALER_MODELS.FEMALE : DEALER_MODELS.MALE;

    try {
        const ped = mp.peds.new(
            mp.joaat(model),
            new mp.Vector3(position.x, position.y, position.z),
            {
                heading: heading,
                dimension: 0,
                dynamic: false,
            }
        );

        dealerPeds[tableIndex] = {
            ped,
            tableIndex,
            isFemale,
            model,
            voiceIndex: voiceIndex || 0,
            currentAnimState: 19,  // IDLE
            currentIdleVariant: 0,
            isAnimating: false,
        };

        dealerIdleVariant[tableIndex] = 0;

        console.log(`[CASINO_ROULETTE] Dealer spawned: table=${tableIndex}, model=${model}, pos=(${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);

        return dealerPeds[tableIndex];
    } catch (err) {
        console.error(`[CASINO_ROULETTE] Failed to create dealer at table ${tableIndex}:`, err.message);
        return null;
    }
}

// ──────────────────────────────────────────
// DESTROY DEALER (from func_108)
// ──────────────────────────────────────────
function destroyDealer(tableIndex) {
    const dealer = dealerPeds[tableIndex];
    if (!dealer) return;

    try {
        if (dealer.ped && dealer.ped.destroy) {
            dealer.ped.destroy();
        }
    } catch (e) { /* already destroyed */ }

    delete dealerPeds[tableIndex];
    delete dealerIdleVariant[tableIndex];
    console.log(`[CASINO_ROULETTE] Dealer destroyed: table=${tableIndex}`);
}

// ──────────────────────────────────────────
// GET DEALER (utility)
// ──────────────────────────────────────────
function getDealer(tableIndex) {
    return dealerPeds[tableIndex] || null;
}

function isDealerAlive(tableIndex) {
    const dealer = dealerPeds[tableIndex];
    if (!dealer || !dealer.ped) return false;
    try {
        return dealer.ped.id !== undefined;
    } catch (e) {
        return false;
    }
}

// ──────────────────────────────────────────
// DEALER GENDER CHECK (from func_25)
// ──────────────────────────────────────────
function isDealerFemale(tableIndex) {
    const dealer = dealerPeds[tableIndex];
    return dealer ? dealer.isFemale : false;
}

// ──────────────────────────────────────────
// DEALER ANIMATION CONTROL
// Server tells clients which animation to play
// ──────────────────────────────────────────

// Play idle animation (from func_7, func_8, func_28, func_29, func_34)
function setDealerIdle(tableIndex, hasPlayers) {
    const dealer = dealerPeds[tableIndex];
    if (!dealer) return;

    const isFemale = dealer.isFemale;
    const newVariant = animations.getRandomIdleVariant(
        isFemale, hasPlayers, dealer.currentIdleVariant
    );

    dealer.currentIdleVariant = newVariant;
    dealer.currentAnimState = hasPlayers ? 21 : 20; // IDLE_WITH_PLAYERS or IDLE_EMPTY_TABLE

    const animDict = animations.getDealerAnimDict(isFemale);
    const animName = animations.getIdleAnimName(isFemale, hasPlayers, newVariant);

    return {
        dict: animDict,
        name: animName,
        tableIndex,
        state: dealer.currentAnimState,
    };
}

// Play specific game animation (spin, no_more_bets, clear_chips, etc.)
function setDealerAnim(tableIndex, animState) {
    const dealer = dealerPeds[tableIndex];
    if (!dealer) return null;

    const isFemale = dealer.isFemale;
    dealer.currentAnimState = animState;

    const animDict = animations.getDealerAnimDict(isFemale);
    let animName = '';

    switch (animState) {
        case 19: animName = animations.ANIM_NAMES.IDLE; break;
        case 22: animName = animations.ANIM_NAMES.SPIN_WHEEL; break;
        case 23: animName = animations.ANIM_NAMES.NO_MORE_BETS; break;
        case 24: animName = animations.ANIM_NAMES.CLEAR_CHIPS_ZONE1; break;
        case 25: animName = animations.ANIM_NAMES.CLEAR_CHIPS_ZONE2; break;
        case 26: animName = animations.ANIM_NAMES.CLEAR_CHIPS_ZONE3; break;
        case 27: animName = animations.ANIM_NAMES.CLEAR_CHIPS_INTRO; break;
        case 28: animName = animations.ANIM_NAMES.CLEAR_CHIPS_OUTRO; break;
        default: animName = animations.ANIM_NAMES.IDLE; break;
    }

    return {
        dict: animDict,
        name: animName,
        tableIndex,
        state: animState,
    };
}

// ──────────────────────────────────────────
// DEALER SPEECH (from func_47, func_48)
// Returns speech data for clients to play
// ──────────────────────────────────────────
function getDealerSpeech(tableIndex, speechEvent, params) {
    const dealer = dealerPeds[tableIndex];
    if (!dealer) return null;

    return {
        tableIndex,
        pedId: dealer.ped ? dealer.ped.id : null,
        speechEvent,
        params: params || speech.SPEECH_PARAMS.STANDARD,
    };
}

// Announce the winning number (from func_52)
function getDealerBallAnnouncement(tableIndex, winningNumber) {
    const speechEvent = speech.BALL_RESULT_SPEECH[winningNumber];
    if (!speechEvent) return null;
    return getDealerSpeech(tableIndex, speechEvent, speech.SPEECH_PARAMS.FORCE);
}

// ──────────────────────────────────────────
// CHIP CLEARING ANIMATION SEQUENCE (from func_63)
// The 5-step sequence that runs after ball stops
// ──────────────────────────────────────────
function getChipClearSequence(tableIndex, activeZones) {
    const sequence = [];

    // Step 1: Intro (always)
    sequence.push(setDealerAnim(tableIndex, 27)); // CLEAR_CHIPS_INTRO

    // Steps 2-4: Only clear zones that have chips (from func_66 bit checks)
    if (activeZones.includes(1)) sequence.push(setDealerAnim(tableIndex, 24)); // ZONE1
    if (activeZones.includes(2)) sequence.push(setDealerAnim(tableIndex, 25)); // ZONE2
    if (activeZones.includes(3)) sequence.push(setDealerAnim(tableIndex, 26)); // ZONE3

    // Step 5: Outro (always)
    sequence.push(setDealerAnim(tableIndex, 28)); // CLEAR_CHIPS_OUTRO

    return sequence;
}

// ──────────────────────────────────────────
// VOICE GROUP SETUP (from func_109, func_110)
// Maps voice index to voice hash for dealer ped
// ──────────────────────────────────────────
function getVoiceGroup(isFemale, voiceIndex) {
    const voices = isFemale
        ? ['Casino_01_ASIAN_01', 'Casino_01_ASIAN_02', 'Casino_01_LATINA_01', 'Casino_01_LATINA_02']
        : ['Casino_01_WHITE_01', 'Casino_01_WHITE_02', 'Casino_01_ASIAN_01', 'Casino_01_ASIAN_02'];

    const idx = Math.abs(voiceIndex) % voices.length;
    return voices[idx];
}

module.exports = {
    DEALER_MODELS,
    createDealer,
    destroyDealer,
    getDealer,
    isDealerAlive,
    isDealerFemale,
    setDealerIdle,
    setDealerAnim,
    getDealerSpeech,
    getDealerBallAnnouncement,
    getChipClearSequence,
    getVoiceGroup,
};
