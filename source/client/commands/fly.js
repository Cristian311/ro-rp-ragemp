// client_packages/commands/fly.js — Admin fly mode (player moves freely in air)
// Toggle: /fly (server sends admin:toggleFly)
// Exit: Backspace
// Controls: WASD = move, Space = up, Ctrl = down, Shift = fast, Mouse = look

let flyActive = false;
let flySpeed = 2.0;
const FLY_SPEED_NORMAL = 2.0;
const FLY_SPEED_FAST = 8.0;
const KEY_BACKSPACE = 0x08;

function startFly() {
    if (flyActive) return;
    flyActive = true;
    global.flyModeActive = true;

    const player = mp.players.local;
    player.freezePosition(true);
    mp.game.entity.setVisible(player.handle, true, false);

    mp.gui.chat.push('!{00FF88}[FLY] !{FFFFFF}Fly mode activat! WASD = miscare, Space = sus, Ctrl = jos, Shift = rapid, Backspace = iesire');
}

function stopFly() {
    if (!flyActive) return;
    flyActive = false;
    global.flyModeActive = false;

    const player = mp.players.local;
    player.freezePosition(false);

    mp.gui.chat.push('!{FF4444}[FLY] !{FFFFFF}Fly mode dezactivat.');
}

// Server events
mp.events.add('admin:toggleFly', () => {
    if (flyActive) stopFly();
    else startFly();
});

mp.events.add('admin:stopFly', () => {
    stopFly();
});

// Backspace = exit fly
mp.keys.bind(KEY_BACKSPACE, true, () => {
    if (!flyActive) return;
    stopFly();
});

// Render loop for fly movement
mp.events.add('render', () => {
    if (!flyActive) return;

    const player = mp.players.local;

    // Keep player frozen but visible
    player.freezePosition(true);
    mp.game.entity.setVisible(player.handle, true, false);

    // Disable controls that interfere
    mp.game.controls.disableControlAction(0, 24, true);  // attack
    mp.game.controls.disableControlAction(0, 25, true);  // aim
    mp.game.controls.disableControlAction(0, 44, true);  // cover
    mp.game.controls.disableControlAction(0, 37, true);  // select weapon

    // Speed: Shift = fast
    flySpeed = mp.game.controls.isDisabledControlPressed(0, 21) ? FLY_SPEED_FAST : FLY_SPEED_NORMAL;

    // Get camera direction for movement
    const camRot = mp.game.cam.getGameplayCamRot(2);
    const yawRad = camRot.z * Math.PI / 180;
    const pitchRad = camRot.x * Math.PI / 180;

    // Forward vector
    const fwdX = -Math.sin(yawRad) * Math.cos(pitchRad);
    const fwdY =  Math.cos(yawRad) * Math.cos(pitchRad);
    const fwdZ =  Math.sin(pitchRad);

    // Right vector
    const rightX = Math.cos(yawRad);
    const rightY = Math.sin(yawRad);

    let dx = 0, dy = 0, dz = 0;
    const speed = flySpeed * 0.03; // per-frame movement

    // W = forward
    if (mp.game.controls.isDisabledControlPressed(0, 32)) {
        dx += fwdX * speed; dy += fwdY * speed; dz += fwdZ * speed;
    }
    // S = backward
    if (mp.game.controls.isDisabledControlPressed(0, 33)) {
        dx -= fwdX * speed; dy -= fwdY * speed; dz -= fwdZ * speed;
    }
    // A = left
    if (mp.game.controls.isDisabledControlPressed(0, 34)) {
        dx -= rightX * speed; dy -= rightY * speed;
    }
    // D = right
    if (mp.game.controls.isDisabledControlPressed(0, 35)) {
        dx += rightX * speed; dy += rightY * speed;
    }
    // Space = up
    if (mp.game.controls.isDisabledControlPressed(0, 22)) {
        dz += speed;
    }
    // Ctrl = down
    if (mp.game.controls.isDisabledControlPressed(0, 36)) {
        dz -= speed;
    }

    if (dx !== 0 || dy !== 0 || dz !== 0) {
        const pos = player.position;
        player.position = new mp.Vector3(pos.x + dx, pos.y + dy, pos.z + dz);
    }

    // Set player heading to camera yaw so model faces movement direction
    const heading = -camRot.z;
    player.setHeading(heading);

    // HUD indicator
    const pos = player.position;
    mp.game.graphics.drawText(
        `~g~[FLY MODE] ~w~Speed: ${flySpeed === FLY_SPEED_FAST ? '~y~FAST' : '~w~Normal'}`,
        [0.5, 0.02],
        { font: 4, color: [255, 255, 255, 220], scale: [0.35, 0.35], outline: true, centre: true }
    );
    mp.game.graphics.drawText(
        `~w~${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}  ~y~Backspace~w~ = iesire`,
        [0.5, 0.05],
        { font: 4, color: [200, 200, 200, 180], scale: [0.25, 0.25], outline: true, centre: true }
    );
});

console.log('[Fly Mode] Loaded');
