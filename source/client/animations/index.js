// ============================================
// Animation Position Adjustment System
// ============================================
// /anim <dict> <name> [flags]  - Play animation & enter adjust mode
// /stopanim                     - Stop animation & exit adjust mode
// /saveanimpos <name>           - Save current position + animation to file
// /animstep <size>              - Change position step size
// 
// While in adjust mode:
//   Arrow Up/Down    = Move forward/backward (based on heading)
//   Arrow Left/Right = Move left/right (based on heading)
//   Page Up/Down     = Move up/down (Z axis)
//   Numpad +/-       = Rotate left/right
//   [ / ]            = Decrease/Increase step size
// ============================================

let currentAnim = null;  // { dict, name, flags }
let adjustMode = false;
let stepSize = 0.01;
let rotStep = 1.0;
let animBrowser = null;
let animMenuOpen = false;

function chatMsg(text) {
    mp.events.call('chat:receive', JSON.stringify({ type: 'system', text }));
}

// Track pressed keys for smooth movement in render
const keysDown = {};

function loadAnimDict(dict) {
    return new Promise((resolve) => {
        mp.game.streaming.requestAnimDict(dict);
        const interval = setInterval(() => {
            if (mp.game.streaming.hasAnimDictLoaded(dict)) {
                clearInterval(interval);
                resolve();
            }
        }, 10);
    });
}

function replayAnim() {
    if (!currentAnim) return;
    const player = mp.players.local;
    player.taskPlayAnim(currentAnim.dict, currentAnim.name, 8.0, -8.0, -1, currentAnim.flags, 0, false, false, false);
}

async function playAnimation(dict, name, flags) {
    flags = parseInt(flags) || 2;
    await loadAnimDict(dict);

    const player = mp.players.local;
    player.taskPlayAnim(dict, name, 8.0, -8.0, -1, flags, 0, false, false, false);
    player.freezePosition(true);

    currentAnim = { dict, name, flags };
    adjustMode = true;

    chatMsg('Animation playing! Adjust mode ON.');
    chatMsg('Arrow keys: Move | PgUp/Dn: Up/Down | Num+/-: Rotate | [/]: Step');
    chatMsg('/stopanim to stop | /saveanimpos <name> to save');
}

function openAnimMenu() {
    if (!animBrowser) {
        animBrowser = mp.browsers.new('package://animations/index.html');
    }
    animBrowser.execute('openMenu()');
    animMenuOpen = true;
    mp.gui.cursor.show(true, true);
}

function closeAnimMenu() {
    if (animBrowser) {
        animBrowser.execute('closeMenu()');
    }
    animMenuOpen = false;
    mp.gui.cursor.show(false, false);
}

// Event from HTML menu when user clicks an animation
mp.events.add('animations:playFromMenu', async (dict, name, animName) => {
    closeAnimMenu();
    chatMsg(`Playing: ${animName} (${dict} / ${name})`);
    await playAnimation(dict, name, 2);
});

// ESC to close menu
mp.keys.bind(0x1B, true, () => {
    if (animMenuOpen) closeAnimMenu();
});

// ===== COMMANDS =====

// /anim [dict] [name] [flags] — no args = open menu, with args = play directly
mp.events.addCommand('anim', async (dict, name, flags) => {
    if (!dict) {
        openAnimMenu();
        return;
    }
    if (!name) {
        chatMsg('Usage: /anim <dict> <name> [flags]  or  /anim  (to open menu)');
        return;
    }
    await playAnimation(dict, name, flags);
});

// /stopanim
mp.events.addCommand('stopanim', () => {
    const player = mp.players.local;

    if (currentAnim) {
        player.stopAnimTask(currentAnim.dict, currentAnim.name, 1.0);
    }
    player.freezePosition(false);

    currentAnim = null;
    adjustMode = false;
    chatMsg('Animation stopped. Adjust mode OFF.');
});

// /saveanimpos <name>
mp.events.addCommand('saveanimpos', (name) => {
    const player = mp.players.local;
    const pos = player.position;
    const rot = player.getHeading();

    const data = {
        name: name || 'unnamed',
        x: parseFloat(pos.x.toFixed(4)),
        y: parseFloat(pos.y.toFixed(4)),
        z: parseFloat(pos.z.toFixed(4)),
        rotation: parseFloat(rot.toFixed(2)),
        dict: currentAnim ? currentAnim.dict : 'none',
        anim: currentAnim ? currentAnim.name : 'none',
        flags: currentAnim ? currentAnim.flags : 0
    };

    // Calculate relative offset from roulette table if at one
    const rt = global.tableData && global.tableData.roulette;
    if (rt) {
        const dx = pos.x - rt.x;
        const dy = pos.y - rt.y;
        const dz = pos.z - rt.z;
        const hRad = rt.heading * Math.PI / 180;
        data.tableType = 'roulette';
        data.offset_f = parseFloat((dx * (-Math.sin(hRad)) + dy * Math.cos(hRad)).toFixed(4));
        data.offset_r = parseFloat((dx * Math.cos(hRad) + dy * Math.sin(hRad)).toFixed(4));
        data.offset_u = parseFloat(dz.toFixed(4));
        data.offset_heading = parseFloat((rot - rt.heading).toFixed(2));
        chatMsg(`Roulette offset: F=${data.offset_f} R=${data.offset_r} U=${data.offset_u} H=${data.offset_heading}`);
    }

    // Calculate relative offset from slots machine if at one
    const sl = global.tableData && global.tableData.slots;
    if (sl) {
        const dx = pos.x - sl.x;
        const dy = pos.y - sl.y;
        const dz = pos.z - sl.z;
        const hRad = sl.heading * Math.PI / 180;
        data.tableType = 'slots';
        data.offset_f = parseFloat((dx * (-Math.sin(hRad)) + dy * Math.cos(hRad)).toFixed(4));
        data.offset_r = parseFloat((dx * Math.cos(hRad) + dy * Math.sin(hRad)).toFixed(4));
        data.offset_u = parseFloat(dz.toFixed(4));
        data.offset_heading = parseFloat((rot - sl.heading).toFixed(2));
        chatMsg(`Slots offset: F=${data.offset_f} R=${data.offset_r} U=${data.offset_u} H=${data.offset_heading}`);
    }

    mp.events.callRemote('animations:savePosition', JSON.stringify(data));
    chatMsg(`Position + animation saved as "${name || 'unnamed'}"`);
});

// /animstep <size>
mp.events.addCommand('animstep', (size) => {
    size = parseFloat(size);
    if (isNaN(size) || size <= 0) {
        chatMsg('Usage: /animstep <size> (e.g. 0.01, 0.05, 0.1)');
        return;
    }
    stepSize = size;
    chatMsg(`Step size set to ${stepSize}`);
});

// ===== KEY BINDINGS =====

// Key codes
const KEY_UP     = 0x26; // 38
const KEY_DOWN   = 0x28; // 40
const KEY_LEFT   = 0x25; // 37
const KEY_RIGHT  = 0x27; // 39
const KEY_PGUP   = 0x21; // 33
const KEY_PGDOWN = 0x22; // 34
const KEY_ADD    = 0x6B; // Numpad +
const KEY_SUB    = 0x6D; // Numpad -
const KEY_LBRACK = 0xDB; // [
const KEY_RBRACK = 0xDD; // ]

// Track key down/up
[KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_PGUP, KEY_PGDOWN, KEY_ADD, KEY_SUB].forEach(key => {
    mp.keys.bind(key, true, () => { if (!global.chatInputActive) keysDown[key] = true; });
    mp.keys.bind(key, false, () => { keysDown[key] = false; });
});

// Step size adjustment (single press only)
mp.keys.bind(KEY_LBRACK, true, () => {
    if (global.chatInputActive) return;
    if (!adjustMode) return;
    stepSize = Math.max(0.001, stepSize / 2);
    chatMsg(`Step size: ${stepSize}`);
});

mp.keys.bind(KEY_RBRACK, true, () => {
    if (global.chatInputActive) return;
    if (!adjustMode) return;
    stepSize = Math.min(1.0, stepSize * 2);
    chatMsg(`Step size: ${stepSize}`);
});

// ===== RENDER LOOP (smooth movement) =====

mp.events.add('render', () => {
    if (!adjustMode) return;

    // Disable player controls so arrow keys don't interfere with GTA controls
    mp.game.controls.disableAllControlActions(0);

    const player = mp.players.local;
    let pos = player.position;
    let heading = player.getHeading();
    let moved = false;
    let rotated = false;

    // Convert heading to radians for directional movement
    const headingRad = (heading * Math.PI) / 180.0;

    // Forward/Backward (relative to heading)
    if (keysDown[KEY_UP]) {
        pos.x += stepSize * (-Math.sin(headingRad));
        pos.y += stepSize * (Math.cos(headingRad));
        moved = true;
    }
    if (keysDown[KEY_DOWN]) {
        pos.x -= stepSize * (-Math.sin(headingRad));
        pos.y -= stepSize * (Math.cos(headingRad));
        moved = true;
    }

    // Left/Right strafe (relative to heading)
    if (keysDown[KEY_LEFT]) {
        pos.x += stepSize * (Math.cos(headingRad));
        pos.y += stepSize * (Math.sin(headingRad));
        moved = true;
    }
    if (keysDown[KEY_RIGHT]) {
        pos.x -= stepSize * (Math.cos(headingRad));
        pos.y -= stepSize * (Math.sin(headingRad));
        moved = true;
    }

    // Up/Down (Z axis)
    if (keysDown[KEY_PGUP]) {
        pos.z += stepSize;
        moved = true;
    }
    if (keysDown[KEY_PGDOWN]) {
        pos.z -= stepSize;
        moved = true;
    }

    // Rotation
    if (keysDown[KEY_ADD]) {
        heading -= rotStep;
        rotated = true;
    }
    if (keysDown[KEY_SUB]) {
        heading += rotStep;
        rotated = true;
    }

    if (moved) {
        player.position = pos;
        // Re-freeze and replay animation
        player.freezePosition(true);
        replayAnim();
    }

    if (rotated) {
        player.setHeading(heading);
        replayAnim();
    }
});
