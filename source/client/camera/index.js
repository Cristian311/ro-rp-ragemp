// client_packages/camera/index.js — Freecam system with position saving

let freecamActive = false;
let freecamCamera = null;
let freecamPos = { x: 0, y: 0, z: 0 };
let freecamRot = { x: 0, y: 0 }; // pitch, yaw
let moveSpeed = 0.5;
const SPEED_STEPS = [0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0];
let speedIndex = 3; // default 0.5
let savedPositions = [];
let hudVisible = true;
let camBrowser = null;
let playerStartPos = { x: 0, y: 0, z: 0 };
const MAX_DISTANCE = 50.0; // max distance from player
const COLLISION_OFFSET = 0.3; // offset from wall

// Screen effects
const SCREEN_EFFECTS = [
    'None',
    'FocusIn',
    'CamPushInNeutral',
    'PPFilter',
    'PPGreen',
    'PPOrange',
    'PPPink',
    'PPPurple',
    'InchOrange',
    'InchPurple',
    'InchPickup',
    'BikerFilter',
    'ChopVision',
    'SniperOverlay',
    'CrossLine',
    'DeadlineNeon',
    'DMT_flight',
    'DrugsDrivingIn',
    'HeistCelebPass',
    'HeistCelebPassBW',
    'LostTimeDay',
    'LostTimeNight',
    'MP_OrbitalCannon',
    'PeyoteIn',
    'Rampage',
    'RaceTurbo',
    'pennedIn',
    'MinigameTransitionIn',
    'SwitchHUDIn',
];
let currentEffectIndex = 0;
let activeEffect = null;

// ──────────────────────────────────────────
// TOGGLE FREECAM
// ──────────────────────────────────────────
mp.events.add('camera:toggle', () => {
    if (freecamActive) {
        stopFreecam();
    } else {
        startFreecam();
    }
});

function applyScreenEffect(index) {
    // Stop previous effect
    if (activeEffect && activeEffect !== 'None') {
        mp.game.graphics.stopScreenEffect(activeEffect);
    }
    currentEffectIndex = index;
    const name = SCREEN_EFFECTS[currentEffectIndex];
    activeEffect = name;
    if (name !== 'None') {
        mp.game.graphics.startScreenEffect(name, 0, true);
    }
    if (camBrowser) {
        camBrowser.execute(`updateEffect('${name}')`);
    }
}

function createHudBrowser() {
    if (camBrowser) return;
    camBrowser = mp.browsers.new('package://camera/hud.html');
    updateHudSpeed();
}

function destroyHudBrowser() {
    if (camBrowser) {
        camBrowser.destroy();
        camBrowser = null;
    }
}

function updateHudSpeed() {
    if (camBrowser) {
        camBrowser.execute(`updateSpeed(${moveSpeed})`);
    }
}

function startFreecam() {
    if (freecamActive) return;
    freecamActive = true;
    global.freecamActive = true;
    hudVisible = true;

    const player = mp.players.local;
    const pos = player.position;
    const heading = player.getHeading();

    freecamPos.x = pos.x;
    freecamPos.y = pos.y;
    freecamPos.z = pos.z + 2.0;
    freecamRot.x = -20;
    freecamRot.y = heading;
    playerStartPos.x = pos.x;
    playerStartPos.y = pos.y;
    playerStartPos.z = pos.z;

    freecamCamera = mp.cameras.new('default', new mp.Vector3(freecamPos.x, freecamPos.y, freecamPos.z),
        new mp.Vector3(0, 0, 0), 60);
    freecamCamera.setActive(true);
    mp.game.cam.renderScriptCams(true, false, 0, true, false);

    // Apply default screen effect
    currentEffectIndex = 0;
    activeEffect = null;

    mp.game.ui.displayRadar(false);
    mp.game.controls.disableAllControlActions(0);
    mp.players.local.freezePosition(true);

    createHudBrowser();
    mp.gui.chat.push('§{00FF00}[CAMERA] §{FFFFFF}Freecam activata! Click = ascunde/arata HUD');
}

function stopFreecam() {
    if (!freecamActive) return;
    freecamActive = false;
    global.freecamActive = false;

    if (freecamCamera) {
        freecamCamera.setActive(false);
        freecamCamera.destroy();
        freecamCamera = null;
    }
    mp.game.cam.renderScriptCams(false, false, 0, true, false);
    // Stop any active screen effect
    if (activeEffect && activeEffect !== 'None') {
        mp.game.graphics.stopScreenEffect(activeEffect);
        activeEffect = null;
    }
    mp.game.ui.displayRadar(true);
    mp.players.local.freezePosition(false);
    destroyHudBrowser();

    // Restore chat if it was hidden
    if (!hudVisible) {
        hudVisible = true;
        mp.events.call('camera:showChat', true);
    }

    mp.gui.chat.push('§{00FF00}[CAMERA] §{FFFFFF}Freecam dezactivata.');
}

function toggleHud() {
    hudVisible = !hudVisible;
    if (camBrowser) {
        camBrowser.execute(`setVisible(${hudVisible})`);
    }
    mp.game.ui.displayRadar(hudVisible ? false : false); // radar always off in freecam
    mp.events.call('camera:showChat', hudVisible);
}

// ──────────────────────────────────────────
// SAVE POSITION
// ──────────────────────────────────────────
function saveCurrentPosition() {
    if (!freecamActive || !freecamCamera) return;

    const camPos = {
        x: parseFloat(freecamPos.x.toFixed(4)),
        y: parseFloat(freecamPos.y.toFixed(4)),
        z: parseFloat(freecamPos.z.toFixed(4)),
        rotX: parseFloat(freecamRot.x.toFixed(4)),
        rotY: parseFloat(freecamRot.y.toFixed(4)),
        fov: 60
    };

    // Check if player is at a roulette table
    let rouletteInfo = null;
    if (global.tableData && global.tableData.roulette) {
        const td = global.tableData.roulette;
        const tablePos = { x: td.x, y: td.y, z: td.z };
        const tableHeading = td.heading;
        const hRad = tableHeading * Math.PI / 180;

        // Calculate camera position relative to table (local coordinates)
        const dx = camPos.x - tablePos.x;
        const dy = camPos.y - tablePos.y;
        const dz = camPos.z - tablePos.z;

        // Rotate into table local space (inverse rotation)
        const localX = dx * Math.cos(-hRad) - dy * Math.sin(-hRad);
        const localY = dx * Math.sin(-hRad) + dy * Math.cos(-hRad);

        rouletteInfo = {
            tablePosition: {
                x: parseFloat(tablePos.x.toFixed(4)),
                y: parseFloat(tablePos.y.toFixed(4)),
                z: parseFloat(tablePos.z.toFixed(4))
            },
            tableHeading: parseFloat(tableHeading.toFixed(4)),
            cameraRelativeToTable: {
                localForward: parseFloat(localX.toFixed(4)),
                localRight: parseFloat(localY.toFixed(4)),
                localUp: parseFloat(dz.toFixed(4))
            },
            cameraRotRelativeToTable: {
                pitch: parseFloat(freecamRot.x.toFixed(4)),
                yawOffset: parseFloat((freecamRot.y - tableHeading).toFixed(4))
            }
        };
    }

    const entry = {
        index: savedPositions.length,
        timestamp: new Date().toISOString(),
        camera: camPos,
        roulette: rouletteInfo
    };

    savedPositions.push(entry);

    // Send to server to save to file
    mp.events.callRemote('camera:savePosition', JSON.stringify(entry));

    mp.gui.chat.push(`§{00FF00}[CAMERA] §{FFFFFF}Pozitie #${entry.index} salvata!`);
    mp.gui.chat.push(`§{AAAAAA}  Pos: ${camPos.x}, ${camPos.y}, ${camPos.z}`);
    mp.gui.chat.push(`§{AAAAAA}  Rot: pitch=${camPos.rotX}, yaw=${camPos.rotY}`);

    if (rouletteInfo) {
        mp.gui.chat.push(`§{FFD700}  [RULETA] Masa la: ${rouletteInfo.tablePosition.x}, ${rouletteInfo.tablePosition.y}, ${rouletteInfo.tablePosition.z} heading=${rouletteInfo.tableHeading}`);
        mp.gui.chat.push(`§{FFD700}  [RULETA] Camera relativa: F=${rouletteInfo.cameraRelativeToTable.localForward}, R=${rouletteInfo.cameraRelativeToTable.localRight}, U=${rouletteInfo.cameraRelativeToTable.localUp}`);
        mp.gui.chat.push(`§{FFD700}  [RULETA] Rot relativa: pitch=${rouletteInfo.cameraRotRelativeToTable.pitch}, yawOffset=${rouletteInfo.cameraRotRelativeToTable.yawOffset}`);
    }
}

// ──────────────────────────────────────────
// RENDER LOOP — camera movement + mouse look
// ──────────────────────────────────────────
mp.events.add('render', () => {
    if (!freecamActive || !freecamCamera) return;

    // Disable all controls so player doesn't move/shoot
    mp.game.controls.disableAllControlActions(0);

    // Arrow keys look (LEFT/RIGHT swapped to feel natural)
    const ARROW_SPEED = 1.5;
    if (mp.game.controls.isDisabledControlPressed(0, 172)) { // Arrow UP
        freecamRot.x += ARROW_SPEED;
    }
    if (mp.game.controls.isDisabledControlPressed(0, 173)) { // Arrow DOWN
        freecamRot.x -= ARROW_SPEED;
    }
    if (mp.game.controls.isDisabledControlPressed(0, 174)) { // Arrow LEFT
        freecamRot.y += ARROW_SPEED;
    }
    if (mp.game.controls.isDisabledControlPressed(0, 175)) { // Arrow RIGHT
        freecamRot.y -= ARROW_SPEED;
    }
    freecamRot.x = Math.max(-89, Math.min(89, freecamRot.x));

    // Normalize yaw
    if (freecamRot.y > 360) freecamRot.y -= 360;
    if (freecamRot.y < 0) freecamRot.y += 360;

    // Click = toggle HUD
    if (mp.game.controls.isDisabledControlJustPressed(0, 24)) { // LMB
        toggleHud();
    }

    // Movement direction based on yaw
    const yawRad = freecamRot.y * Math.PI / 180;
    const pitchRad = freecamRot.x * Math.PI / 180;
    const speed = moveSpeed;

    // Forward vector (based on yaw + pitch)
    const fwdX = -Math.sin(yawRad) * Math.cos(pitchRad);
    const fwdY = Math.cos(yawRad) * Math.cos(pitchRad);
    const fwdZ = Math.sin(pitchRad);

    // Right vector (perpendicular on XY plane)
    const rightX = Math.cos(yawRad);
    const rightY = Math.sin(yawRad);

    // Build movement delta
    let dx = 0, dy = 0, dz = 0;

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
    if (mp.game.controls.isDisabledControlPressed(0, 321)) {
        dz += speed;
    }
    // Ctrl = down
    if (mp.game.controls.isDisabledControlPressed(0, 326)) {
        dz -= speed;
    }

    // Apply movement with collision and distance check
    if (dx !== 0 || dy !== 0 || dz !== 0) {
        let newX = freecamPos.x + dx;
        let newY = freecamPos.y + dy;
        let newZ = freecamPos.z + dz;

        // Distance check from player start position
        const distFromPlayer = Math.sqrt(
            (newX - playerStartPos.x) ** 2 +
            (newY - playerStartPos.y) ** 2 +
            (newZ - playerStartPos.z) ** 2
        );

        if (distFromPlayer < MAX_DISTANCE) {
            // Wall collision raycast
            const startVec = new mp.Vector3(freecamPos.x, freecamPos.y, freecamPos.z);
            const endVec = new mp.Vector3(newX, newY, newZ);
            const rayResult = mp.raycasting.testPointToPoint(startVec, endVec, -1, mp.players.local.handle, 2 | 4 | 8 | 16);

            if (rayResult && rayResult.hit) {
                // Hit a wall — push back slightly from hit point
                const hitX = rayResult.position.x;
                const hitY = rayResult.position.y;
                const hitZ = rayResult.position.z;
                const moveLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (moveLen > 0) {
                    const normDx = dx / moveLen;
                    const normDy = dy / moveLen;
                    const normDz = dz / moveLen;
                    freecamPos.x = hitX - normDx * COLLISION_OFFSET;
                    freecamPos.y = hitY - normDy * COLLISION_OFFSET;
                    freecamPos.z = hitZ - normDz * COLLISION_OFFSET;
                }
            } else {
                // No collision, move freely
                freecamPos.x = newX;
                freecamPos.y = newY;
                freecamPos.z = newZ;
            }
        }
    }

    // Enter = save position
    if (mp.game.controls.isDisabledControlJustPressed(0, 18)) {
        saveCurrentPosition();
    }

    // Calculate distance for HUD
    const distDisplay = Math.sqrt(
        (freecamPos.x - playerStartPos.x) ** 2 +
        (freecamPos.y - playerStartPos.y) ** 2 +
        (freecamPos.z - playerStartPos.z) ** 2
    ).toFixed(1);

    // Update HUD with position
    if (camBrowser && hudVisible) {
        camBrowser.execute(`updatePos(${freecamPos.x.toFixed(2)}, ${freecamPos.y.toFixed(2)}, ${freecamPos.z.toFixed(2)}, ${freecamRot.x.toFixed(2)}, ${freecamRot.y.toFixed(2)}, ${distDisplay})`);
    }

    // Apply camera position and rotation
    freecamCamera.setCoord(freecamPos.x, freecamPos.y, freecamPos.z);
    freecamCamera.setRot(freecamRot.x, 0, freecamRot.y, 2);
});

// ──────────────────────────────────────────
// COMMAND REGISTRATION
// ──────────────────────────────────────────
mp.events.add('camera:startFromServer', () => {
    if (freecamActive) {
        stopFreecam();
    } else {
        startFreecam();
    }
});

// Also register as client command for convenience
mp.events.addCommand('camera', () => {
    if (freecamActive) {
        stopFreecam();
    } else {
        startFreecam();
    }
});

mp.events.addCommand('camsave', () => {
    if (!freecamActive) {
        mp.gui.chat.push('§{FF0000}[CAMERA] §{FFFFFF}Trebuie sa fii in freecam! Foloseste /camera');
        return;
    }
    saveCurrentPosition();
});

mp.events.addCommand('camlist', () => {
    if (savedPositions.length === 0) {
        mp.gui.chat.push('§{FFFF00}[CAMERA] §{FFFFFF}Nu ai salvat nicio pozitie inca.');
        return;
    }
    mp.gui.chat.push(`§{00FF00}[CAMERA] §{FFFFFF}Pozitii salvate (${savedPositions.length}):`);
    savedPositions.forEach(p => {
        const c = p.camera;
        const rouletteTag = p.roulette ? ' §{FFD700}[RULETA]' : '';
        mp.gui.chat.push(`§{AAAAAA}  #${p.index}: ${c.x}, ${c.y}, ${c.z} (pitch=${c.rotX}, yaw=${c.rotY})${rouletteTag}`);
    });
});

mp.events.addCommand('camgoto', (idx) => {
    const index = parseInt(idx);
    if (isNaN(index) || index < 0 || index >= savedPositions.length) {
        mp.gui.chat.push('§{FF0000}[CAMERA] §{FFFFFF}Index invalid. Foloseste /camlist pentru lista.');
        return;
    }
    if (!freecamActive) {
        startFreecam();
    }
    const p = savedPositions[index].camera;
    freecamPos.x = p.x;
    freecamPos.y = p.y;
    freecamPos.z = p.z;
    freecamRot.x = p.rotX;
    freecamRot.y = p.rotY;
    mp.gui.chat.push(`§{00FF00}[CAMERA] §{FFFFFF}Teleportat la pozitia #${index}`);
});

// ──────────────────────────────────────────
// KEY BINDS for [ and ]
// ──────────────────────────────────────────
mp.keys.bind(0xDB, true, () => { // [ key
    if (!freecamActive) return;
    speedIndex = Math.max(speedIndex - 1, 0);
    moveSpeed = SPEED_STEPS[speedIndex];
    updateHudSpeed();
    mp.gui.chat.push(`§{00FF00}[CAMERA] §{FFFFFF}Viteza: ${moveSpeed}`);
});

mp.keys.bind(0xDD, true, () => { // ] key
    if (!freecamActive) return;
    speedIndex = Math.min(speedIndex + 1, SPEED_STEPS.length - 1);
    moveSpeed = SPEED_STEPS[speedIndex];
    updateHudSpeed();
    mp.gui.chat.push(`§{00FF00}[CAMERA] §{FFFFFF}Viteza: ${moveSpeed}`);
});

// Effect cycling: PageUp = next effect, PageDown = previous effect
mp.keys.bind(0x21, true, () => { // PageUp
    if (!freecamActive) return;
    const next = (currentEffectIndex + 1) % SCREEN_EFFECTS.length;
    applyScreenEffect(next);
    mp.gui.chat.push(`§{00FF00}[CAMERA] §{FFFFFF}Efect: §{FFD700}${SCREEN_EFFECTS[currentEffectIndex]}`);
});

mp.keys.bind(0x22, true, () => { // PageDown
    if (!freecamActive) return;
    const prev = (currentEffectIndex - 1 + SCREEN_EFFECTS.length) % SCREEN_EFFECTS.length;
    applyScreenEffect(prev);
    mp.gui.chat.push(`§{00FF00}[CAMERA] §{FFFFFF}Efect: §{FFD700}${SCREEN_EFFECTS[currentEffectIndex]}`);
});
