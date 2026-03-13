// ═══════════════════════════════════════════════════════════════
// CASINO ROULETTE GTA — SPEECH / AUDIO
// Recreated from decompiled casinoroulette.c
// func_47, func_48, func_49, func_50, func_51, func_52
// ═══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────
// SPEECH PARAMS (from func_49)
// Used as the last parameter in PLAY_PED_AMBIENT_SPEECH_NATIVE
// ──────────────────────────────────────────
const SPEECH_PARAMS = {
    STANDARD:           'SPEECH_PARAMS_STANDARD',
    FORCE:              'SPEECH_PARAMS_FORCE',
    INTERRUPT:          'SPEECH_PARAMS_FORCE_FRONTEND',
    SHOUTED:            'SPEECH_PARAMS_FORCE_SHOUTED',
    SHOUTED_CRITICAL:   'SPEECH_PARAMS_FORCE_SHOUTED_CRITICAL',
    FORCE_PRESET:       'SPEECH_PARAMS_FORCE_PRESET_PARAMS',
    FORCE_NO_REPEAT:    'SPEECH_PARAMS_FORCE_NO_REPEAT_FRONTEND',
};

// ──────────────────────────────────────────
// DEALER SPEECH EVENTS (from func_50)
// These are the actual voiceline event names used by GTA V
// ──────────────────────────────────────────
const DEALER_SPEECH = {
    // Greetings & social
    GREET:              'MINIGAME_DEALER_GREET',
    FAREWELL:           'MINIGAME_DEALER_FAREWELL',
    ANOTHER_GO:         'MINIGAME_DEALER_ANOTHER_GO',  // "Another round?"

    // Game flow
    PLACE_BET:          'MINIGAME_DEALER_PLACE_BET',
    CLOSED_BETS:        'MINIGAME_DEALER_CLOSED_BETS',   // "No more bets"
    REFUSE_BETS:        'MINIGAME_DEALER_REFUSE_BETS',

    // Win/loss reactions
    PLAYER_WIN:         'MINIGAME_DEALER_PLAYER_WIN',
    PLAYER_LOSE:        'MINIGAME_DEALER_PLAYER_LOSE',
    BIG_WIN:            'MINIGAME_DEALER_BIG_WIN',
};

// ──────────────────────────────────────────
// BALL RESULT SPEECH (from func_52)
// Dealer announces which number the ball landed on
// ──────────────────────────────────────────
const BALL_RESULT_SPEECH = {};
for (let i = 0; i <= 36; i++) {
    BALL_RESULT_SPEECH[i] = `MINIGAME_ROULETTE_BALL_${i}`;
}
BALL_RESULT_SPEECH[37] = 'MINIGAME_ROULETTE_BALL_00'; // Double zero (American variant)

// ──────────────────────────────────────────
// UI SOUND EFFECTS (from func_50 sound cases)
// Frontend audio names used by PLAY_SOUND_FRONTEND
// ──────────────────────────────────────────
const SOUND_EFFECTS = {
    BET_HIGHLIGHT:      'DLC_VW_BET_HIGHLIGHT',
    BET_UP:             'DLC_VW_BET_UP',
    BET_DOWN:           'DLC_VW_BET_DOWN',
    CHIP_PLACE:         'DLC_VW_CHIP_DRAG_POT_PLACE',
    CHIP_REMOVE:        'DLC_VW_CHIP_DRAG_POT_REMOVE',
    CHIP_SLIDE:         'DLC_VW_CHIP_DRAG_POT_SLIDE',
    BALL_LOOP:          'DLC_VW_ROULETTE_BALL_LOOP',
    BALL_STOP:          'DLC_VW_ROULETTE_BALL_STOP',
    WIN_CHIPS:          'DLC_VW_WIN_CHIPS',
    CLICK:              'DLC_VW_CLICK',
};

// ──────────────────────────────────────────
// EXIT SOUNDS (from func_51)
// Sound names for roulette exit animations
// ──────────────────────────────────────────
const EXIT_SOUNDS = [];
for (let i = 1; i <= 38; i++) {
    EXIT_SOUNDS.push(`dlc_vw_roulette_exit_${i}`);
}

// ──────────────────────────────────────────
// SOUNDSET / AUDIO BANK NAMES
// ──────────────────────────────────────────
const SOUNDSETS = {
    ROULETTE:           'DLC_VW_CASINO_ROULETTE_SOUNDS',
    FRONTEND:           'HUD_FRONTEND_DEFAULT_SOUNDSET',
    BET:                'DLC_VW_BET_SOUNDS',
};

module.exports = {
    SPEECH_PARAMS,
    DEALER_SPEECH,
    BALL_RESULT_SPEECH,
    SOUND_EFFECTS,
    EXIT_SOUNDS,
    SOUNDSETS,
};
