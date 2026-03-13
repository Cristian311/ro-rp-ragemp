// ═══════════════════════════════════════════════════════════════
// CASINO ROULETTE GTA — CLIENT-SIDE
// Recreated from decompiled casinoroulette.c
// func_249 (input lockdown), func_250 (force unarmed),
// func_251 (unlock controls), func_257 (freeze position)
// ═══════════════════════════════════════════════════════════════

let casinoRouletteBrowser = null;
let isAtTable = false;
let inputLocked = false;

const KEY_E   = 0x45;
const KEY_ESC = 0x1B;

// ──────────────────────────────────────────
// CONTROL HASHES (from func_249 — controls to disable)
// These are GTA V control IDs
// ──────────────────────────────────────────
const DISABLED_CONTROLS = [
    // Weapons & attacks
    24,   // INPUT_ATTACK
    25,   // INPUT_AIM
    47,   // INPUT_WEAPON_SPECIAL
    58,   // INPUT_THROW_GRENADE
    140,  // INPUT_MELEE_ATTACK_LIGHT
    141,  // INPUT_MELEE_ATTACK_HEAVY
    142,  // INPUT_MELEE_ATTACK_ALTERNATE
    143,  // INPUT_MELEE_BLOCK
    263,  // INPUT_MELEE_ATTACK1
    264,  // INPUT_MELEE_ATTACK2

    // Cover & stealth
    44,   // INPUT_COVER

    // Vehicle
    59,   // INPUT_VEH_MOVE_LR
    71,   // INPUT_VEH_EXIT
    75,   // INPUT_VEH_HANDBRAKE

    // Radio
    85,   // INPUT_VEH_RADIO_WHEEL
    81,   // INPUT_VEH_NEXT_RADIO
    82,   // INPUT_VEH_PREV_RADIO

    // Movement restrictions
    21,   // INPUT_SPRINT
    22,   // INPUT_JUMP
    36,   // INPUT_DUCK

    // Phone / interaction
    27,   // INPUT_PHONE
    199,  // INPUT_FRONTEND_PAUSE
    200,  // INPUT_FRONTEND_PAUSE_ALTERNATE

    // Selection / scrolling
    14,   // INPUT_WEAPON_WHEEL_NEXT
    15,   // INPUT_WEAPON_WHEEL_PREV
    16,   // INPUT_SELECT_NEXT_WEAPON
    17,   // INPUT_SELECT_PREV_WEAPON
];

// ──────────────────────────────────────────
// INPUT LOCKING (func_249 / func_251 equivalent)
// Disables combat, vehicles, radio, jumping, etc.
// Uses RAGE MP 'render' event for per-frame control disabling
// ──────────────────────────────────────────

// Render handler — registered once, checks inputLocked flag each frame
function onRenderDisableControls() {
    if (!inputLocked) return;

    DISABLED_CONTROLS.forEach(control => {
        mp.game.controls.disable(0, control, false);   // group 0 = player
        mp.game.controls.disable(2, control, false);   // group 2 = frontend
    });

    // Disable phone (func_249)
    mp.game.invoke('0x015C4B3E2E3E1B79', false); // CELL_CAM_DISABLE_THIS_FRAME
}

mp.events.add('render', onRenderDisableControls);

function lockInput() {
    if (inputLocked) return;
    inputLocked = true;

    // Force unarmed (func_250)
    mp.game.invoke('0xADF692B254977C0C', mp.players.local.handle, 0xA2719263, true); // SET_CURRENT_PED_WEAPON (unarmed)
}

function unlockInput() {
    if (!inputLocked) return;
    inputLocked = false;

    // Enable all controls
    mp.game.controls.enable(0, true);
    mp.game.controls.enable(2, true);
}

// ──────────────────────────────────────────
// KEY BINDS
// E — interact with table
// ESC — leave table
// ──────────────────────────────────────────
/*
mp.keys.bind(KEY_E, true, () => {
    // Only forward if not at a table already
    if (!isAtTable) {
        mp.events.callRemote('Server_PlayerAction', 'interact');
    }
});
*/

mp.keys.bind(KEY_ESC, true, () => {
    if (isAtTable && casinoRouletteBrowser !== null) {
        closeCasinoRouletteUI();
        mp.events.callRemote('Server_LeaveCasinoRouletteGTA');
    }
});

// ──────────────────────────────────────────
// BROWSER / UI MANAGEMENT
// ──────────────────────────────────────────
function openCasinoRouletteUI() {
    if (casinoRouletteBrowser === null) {
        casinoRouletteBrowser = mp.browsers.new('package://casino_roulette_gta/index.html');
        mp.gui.cursor.show(true, true);
        isAtTable = true;
    }
}

function closeCasinoRouletteUI() {
    if (casinoRouletteBrowser !== null) {
        casinoRouletteBrowser.destroy();
        casinoRouletteBrowser = null;
        mp.gui.cursor.show(false, false);
        isAtTable = false;
        unlockInput();
    }
}

// ──────────────────────────────────────────
// SERVER → CLIENT EVENTS (prefixed gtaRoulette:)
// ──────────────────────────────────────────

// UI open/close
mp.events.add('gtaRoulette:openUI', () => {
    openCasinoRouletteUI();
});

mp.events.add('gtaRoulette:closeUI', () => {
    closeCasinoRouletteUI();
});

// Input lock/unlock (func_249/func_251)
mp.events.add('gtaRoulette:lockInput', (lock) => {
    if (lock) lockInput();
    else unlockInput();
});

// Game state update
mp.events.add('gtaRoulette:updateState', (state) => {
    if (casinoRouletteBrowser !== null) {
        const stateJson = JSON.stringify(state);
        casinoRouletteBrowser.execute(`updateGameState('${stateJson.replace(/'/g, "\\'")}');`);
    }
});

// Betting phase start
mp.events.add('gtaRoulette:bettingStart', (betTime) => {
    if (casinoRouletteBrowser !== null) {
        casinoRouletteBrowser.execute(`onBettingStart(${betTime});`);
    }
});

// Bet timer countdown
mp.events.add('gtaRoulette:betTimer', (timeLeft) => {
    if (casinoRouletteBrowser !== null) {
        casinoRouletteBrowser.execute(`updateBetTimer(${timeLeft});`);
    }
});

// Spin start
mp.events.add('gtaRoulette:spinStart', (number, color, spinTime) => {
    if (casinoRouletteBrowser !== null) {
        casinoRouletteBrowser.execute(`onSpinStart(${number}, '${color}', ${spinTime});`);
    }
});

// Show result
mp.events.add('gtaRoulette:showResult', (number, color, state) => {
    if (casinoRouletteBrowser !== null) {
        const stateJson = JSON.stringify(state);
        casinoRouletteBrowser.execute(`onShowResult(${number}, '${color}', '${stateJson.replace(/'/g, "\\'")}');`);
    }
});

// Update player's bets display
mp.events.add('gtaRoulette:updateBets', (betsJson, chips, totalBet) => {
    if (casinoRouletteBrowser !== null) {
        casinoRouletteBrowser.execute(`updateMyBets('${betsJson.replace(/'/g, "\\'")}', ${chips}, ${totalBet});`);
    }
});

// ──────────────────────────────────────────
// DEALER ANIMATIONS (from func_10 state machine)
// Passed to CEF which can display visual feedback
// ──────────────────────────────────────────
mp.events.add('gtaRoulette:dealerAnim', (animDataJson) => {
    if (casinoRouletteBrowser !== null) {
        casinoRouletteBrowser.execute(`onDealerAnimation('${animDataJson.replace(/'/g, "\\'")}');`);
    }
});

mp.events.add('gtaRoulette:dealerAnimSequence', (sequenceJson) => {
    if (casinoRouletteBrowser !== null) {
        casinoRouletteBrowser.execute(`onDealerAnimSequence('${sequenceJson.replace(/'/g, "\\'")}');`);
    }
});

// ──────────────────────────────────────────
// DEALER SPEECH (from func_50/52 speech system)
// ──────────────────────────────────────────
mp.events.add('gtaRoulette:dealerSpeech', (speechDataJson) => {
    if (casinoRouletteBrowser !== null) {
        casinoRouletteBrowser.execute(`onDealerSpeech('${speechDataJson.replace(/'/g, "\\'")}');`);
    }

    // Also try to play native audio if available
    try {
        const data = JSON.parse(speechDataJson);
        if (data && data.speechName) {
            // Use RAGE MP native to play ambient speech on nearby ped
            // This triggers the GTA V audio system for the dealer NPC
            mp.game.invoke(
                '0x8E04FEDD28D42462',  // PLAY_PED_AMBIENT_SPEECH_NATIVE
                data.pedHandle || 0,
                data.speechName,
                data.speechParam || 'SPEECH_PARAMS_STANDARD',
                0
            );
        }
    } catch (e) { /* no native speech available, UI text only */ }
});

// ──────────────────────────────────────────
// SOUND EFFECTS (from decompiled soundset names)
// ──────────────────────────────────────────
mp.events.add('gtaRoulette:playSound', (soundName) => {
    if (casinoRouletteBrowser !== null) {
        casinoRouletteBrowser.execute(`playUISoundEffect('${soundName}');`);
    }

    // Try native audio
    try {
        const soundSets = {
            'ROULETTE_BALL_LOOP':     { name: 'ROULETTE_BALL_LOOP',     set: 'DLC_VW_TABLE_GAMES_ROULETTE_SOUNDS' },
            'ROULETTE_BALL_STOP':     { name: 'ROULETTE_BALL_STOP',     set: 'DLC_VW_TABLE_GAMES_ROULETTE_SOUNDS' },
            'BET_HIGHLIGHT':          { name: 'BET_HIGHLIGHT',          set: 'DLC_VW_TABLE_GAMES_ROULETTE_SOUNDS' },
            'CHIP_PLACE':             { name: 'CHIP_PLACE',             set: 'DLC_VW_TABLE_GAMES_ROULETTE_SOUNDS' },
            'CHIP_REMOVE':            { name: 'CHIP_REMOVE',            set: 'DLC_VW_TABLE_GAMES_ROULETTE_SOUNDS' },
            'WIN_CHIPS':              { name: 'WIN_CHIPS',              set: 'DLC_VW_TABLE_GAMES_ROULETTE_SOUNDS' },
        };
        const snd = soundSets[soundName];
        if (snd) {
            mp.game.audio.playSoundFrontend(-1, snd.name, snd.set, false);
        }
    } catch (e) { /* fallback to UI audio only */ }
});

// ──────────────────────────────────────────
// CEF → SERVER EVENTS (from UI buttons)
// ──────────────────────────────────────────
mp.events.add('CasinoRouletteGTA_PlaceBet', (betType, betValue, amount) => {
    mp.events.callRemote('Server_CasinoRouletteGTA_Bet', betType, String(betValue), amount);
});

mp.events.add('CasinoRouletteGTA_ClearBets', () => {
    mp.events.callRemote('Server_CasinoRouletteGTA_ClearBets');
});

mp.events.add('CasinoRouletteGTA_LeaveTable', () => {
    closeCasinoRouletteUI();
    mp.events.callRemote('Server_LeaveCasinoRouletteGTA');
});
