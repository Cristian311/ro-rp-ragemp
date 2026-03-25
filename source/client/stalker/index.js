/**
 * Moving Stalker Radar - Client Side
 * Stalker DSR 2X: front + rear antennas, patrol speed, SAME/OPP, FAST, LOCK.
 *
 * KEYBINDS (while radar is active):
 *   Numpad 1 — Toggle LOCK (freeze current readings)
 *   Numpad 2 — Toggle FAST mode (keep highest speed)
 *   Numpad 4 — Toggle Front antenna XMIT
 *   Numpad 5 — Toggle Rear antenna XMIT
 *   Numpad 0 — Toggle radar ON/OFF (must be in vehicle)
 */

let stalkerActive = false;
let stalkerBrowser = null;
let scanInterval = null;

// Radar state
let xmitFront = true;
let xmitRear = true;
let fastMode = false;
let frontLocked = null;
let rearLocked = null;

// Previous scan data
let lastFrontSpeed = null;
let lastRearSpeed = null;
let lastFrontDir = null;
let lastRearDir = null;

// Detection params
const SCAN_DISTANCE = 400.0;
const SCAN_INTERVAL = 150;

// Speed conversion: m/s to mph
const MS_TO_MPH = 2.23694;

// ──────────────────────────────────────────
// BROWSER
// ──────────────────────────────────────────
function ensureBrowser() {
    if (stalkerBrowser) return;
    try { stalkerBrowser = mp.browsers.new('package://stalker/index.html'); }
    catch (e) { mp.console.logError('[STALKER] Browser error: ' + e); }
}

function destroyBrowser() {
    if (stalkerBrowser) { try { stalkerBrowser.destroy(); } catch (_) {} stalkerBrowser = null; }
}

function execBrowser(code) {
    if (stalkerBrowser) { try { stalkerBrowser.execute(code); } catch (_) {} }
}

// ──────────────────────────────────────────
// TOGGLE
// ──────────────────────────────────────────
function enableStalker() {
    if (stalkerActive) return;
    stalkerActive = true;
    frontLocked = null;
    rearLocked = null;
    lastFrontSpeed = null;
    lastRearSpeed = null;
    xmitFront = true;
    xmitRear = true;
    fastMode = false;

    ensureBrowser();
    setTimeout(() => {
        execBrowser('show()');
        execBrowser('showHelp()');
        execBrowser(`updateFrontAntenna({speed:null,direction:null,xmit:true})`);
        execBrowser(`updateRearAntenna({speed:null,direction:null,xmit:true})`);
        execBrowser('setFastIndicator(false)');
    }, 200);

    scanInterval = setInterval(scanRadar, SCAN_INTERVAL);
}

function disableStalker() {
    if (!stalkerActive) return;
    stalkerActive = false;
    if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
    frontLocked = null;
    rearLocked = null;
    execBrowser('hideHelp()');
    execBrowser('hide()');
    setTimeout(() => destroyBrowser(), 400);
}

// ──────────────────────────────────────────
// SCAN LOGIC
// ──────────────────────────────────────────
function scanRadar() {
    if (!stalkerActive) return;

    // Clear debug rays for this frame
    if (global.radarDebug && global.radarDebug.isStalkerDebug()) global.radarDebug.clearStalkerRays();

    const player = mp.players.local;
    if (!player.vehicle) { execBrowser('resetRadar()'); return; }

    const veh = player.vehicle;
    const patrolSpeed = veh.getSpeed() * MS_TO_MPH;
    execBrowser(`updatePatrolSpeed(${patrolSpeed.toFixed(0)})`);

    const heading = veh.getHeading();
    const headingRad = (heading * Math.PI) / 180;
    const forwardX = -Math.sin(headingRad);
    const forwardY = Math.cos(headingRad);
    const pos = veh.position;
    const origin = new mp.Vector3(pos.x, pos.y, pos.z + 0.5);

    // ──── FRONT ANTENNA ────
    if (xmitFront && frontLocked === null) {
        const res = scanCone(origin, forwardX, forwardY, pos.z, 1, veh);
        if (res) {
            const dir = getDirection(veh, res.vehicle);
            const tSpeed = res.vehicle.getSpeed() * MS_TO_MPH;
            if (!(fastMode && lastFrontSpeed !== null && tSpeed < lastFrontSpeed)) {
                lastFrontSpeed = tSpeed;
                lastFrontDir = dir;
            }
            execBrowser(`updateFrontAntenna(${JSON.stringify({speed:Math.round(lastFrontSpeed),direction:lastFrontDir,xmit:true})})`);
        } else if (lastFrontSpeed !== null) {
            lastFrontSpeed = null; lastFrontDir = null;
            execBrowser(`updateFrontAntenna({speed:null,direction:null,xmit:true})`);
        }
    }

    // ──── REAR ANTENNA ────
    if (xmitRear && rearLocked === null) {
        const res = scanCone(origin, forwardX, forwardY, pos.z, -1, veh);
        if (res) {
            const dir = getDirection(veh, res.vehicle);
            const tSpeed = res.vehicle.getSpeed() * MS_TO_MPH;
            if (!(fastMode && lastRearSpeed !== null && tSpeed < lastRearSpeed)) {
                lastRearSpeed = tSpeed;
                lastRearDir = dir;
            }
            execBrowser(`updateRearAntenna(${JSON.stringify({speed:Math.round(lastRearSpeed),direction:lastRearDir,xmit:true})})`);
        } else if (lastRearSpeed !== null) {
            lastRearSpeed = null; lastRearDir = null;
            execBrowser(`updateRearAntenna({speed:null,direction:null,xmit:true})`);
        }
    }
}

// ──────────────────────────────────────────
// MULTI-RAY CONE SCAN (3D)
// 19 horizontal × 4 heights × 7 vertical pitches = 532 rays per direction
// ──────────────────────────────────────────
function scanCone(origin, forwardX, forwardY, baseZ, direction, ownVeh) {
    const dirX = forwardX * direction;
    const dirY = forwardY * direction;
    const antenna = direction === 1 ? 'front' : 'rear';

    // Horizontal spread angles (degrees)
    const hAngles = [0, 2, -2, 5, -5, 9, -9, 14, -14, 20, -20, 28, -28, 37, -37, 46, -46, 55, -55];
    // Base height offsets from vehicle center
    const heights = [-0.3, 0.2, 0.8, 1.5];
    // Vertical pitch angles (degrees) — negative = downhill, positive = uphill
    const vAngles = [-8, -4, -1, 2, 6, 11, 17];

    let closestVeh = null;
    let closestDist = SCAN_DISTANCE + 1;

    // Debug: clear rays for this antenna direction
    const dbg = global.radarDebug;
    const isDbg = dbg && dbg.isStalkerDebug();

    for (let ai = 0; ai < hAngles.length; ai++) {
        const rad = (hAngles[ai] * Math.PI) / 180;
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        const rayDirX = dirX * cosA - dirY * sinA;
        const rayDirY = dirX * sinA + dirY * cosA;

        for (let hi = 0; hi < heights.length; hi++) {
            const z = baseZ + 0.5 + heights[hi];

            for (let vi = 0; vi < vAngles.length; vi++) {
                const vRad = (vAngles[vi] * Math.PI) / 180;
                const endZOffset = Math.tan(vRad) * SCAN_DISTANCE;
                const startPos = new mp.Vector3(origin.x, origin.y, z);
                const endPos = new mp.Vector3(
                    origin.x + rayDirX * SCAN_DISTANCE,
                    origin.y + rayDirY * SCAN_DISTANCE,
                    z + endZOffset
                );

                let hitVehicle = false;
                try {
                    const result = mp.raycasting.testPointToPoint(startPos, endPos, [1], 2 | 4 | 8);
                    if (result && result.entity && result.entity.type === 'vehicle') {
                        if (result.entity.handle !== ownVeh.handle) {
                            hitVehicle = true;
                            const dx = result.entity.position.x - origin.x;
                            const dy = result.entity.position.y - origin.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist < closestDist) { closestDist = dist; closestVeh = result.entity; }

                            if (isDbg) dbg.pushStalkerRay(startPos, result.position, true, antenna);
                        }
                    }
                } catch (_) {}

                if (isDbg && !hitVehicle) dbg.pushStalkerRay(startPos, endPos, false, antenna);
            }
        }
    }

    // Debug log
    if (isDbg && dbg && closestVeh) {
        dbg.addDebugLog('stalker', {
            antenna: antenna,
            targetSpeed: Math.round(closestVeh.getSpeed() * MS_TO_MPH),
            distance: Math.round(closestDist),
            totalRays: hAngles.length * heights.length * vAngles.length
        });
    }

    return closestVeh ? { vehicle: closestVeh, distance: closestDist } : null;
}

// ──────────────────────────────────────────
// DIRECTION DETECTION
// ──────────────────────────────────────────
function getDirection(patrolVeh, targetVeh) {
    const pH = patrolVeh.getHeading();
    const tH = targetVeh.getHeading();
    let diff = Math.abs(pH - tH);
    if (diff > 180) diff = 360 - diff;
    if (diff < 70) return 'same';
    if (diff > 110) return 'opp';
    return 'same';
}

// ──────────────────────────────────────────
// KEYBINDS — Numpad keys (client-side only, no server needed)
// ──────────────────────────────────────────

// Numpad 0 (0x60) — Toggle radar ON/OFF
mp.keys.bind(0x60, true, () => {
    if (global.chatInputActive) return;
    const player = mp.players.local;
    if (!stalkerActive) {
        if (!player.vehicle) return;
        enableStalker();
        mp.events.callRemote('stalker:notifyToggle', true);
    } else {
        disableStalker();
        mp.events.callRemote('stalker:notifyToggle', false);
    }
});

// Numpad 1 (0x61) — Toggle LOCK
mp.keys.bind(0x61, true, () => {
    if (global.chatInputActive || !stalkerActive) return;

    if (frontLocked !== null || rearLocked !== null) {
        // Unlock
        frontLocked = null; rearLocked = null;
        execBrowser('lockFront(null)'); execBrowser('lockRear(null)');
    } else {
        // Lock current readings
        if (lastFrontSpeed !== null) {
            frontLocked = Math.round(lastFrontSpeed);
            execBrowser(`lockFront(${frontLocked})`);
        }
        if (lastRearSpeed !== null) {
            rearLocked = Math.round(lastRearSpeed);
            execBrowser(`lockRear(${rearLocked})`);
        }
    }
});

// Numpad 2 (0x62) — Toggle FAST mode
mp.keys.bind(0x62, true, () => {
    if (global.chatInputActive || !stalkerActive) return;
    fastMode = !fastMode;
    execBrowser(`setFastIndicator(${fastMode})`);
});

// Numpad 4 (0x64) — Toggle Front antenna XMIT
mp.keys.bind(0x64, true, () => {
    if (global.chatInputActive || !stalkerActive) return;
    xmitFront = !xmitFront;
    if (!xmitFront) {
        lastFrontSpeed = null; lastFrontDir = null;
        execBrowser(`updateFrontAntenna({speed:null,direction:null,xmit:false})`);
    } else {
        execBrowser(`updateFrontAntenna({speed:null,direction:null,xmit:true})`);
    }
});

// Numpad 5 (0x65) — Toggle Rear antenna XMIT
mp.keys.bind(0x65, true, () => {
    if (global.chatInputActive || !stalkerActive) return;
    xmitRear = !xmitRear;
    if (!xmitRear) {
        lastRearSpeed = null; lastRearDir = null;
        execBrowser(`updateRearAntenna({speed:null,direction:null,xmit:false})`);
    } else {
        execBrowser(`updateRearAntenna({speed:null,direction:null,xmit:true})`);
    }
});

// ──────────────────────────────────────────
// SERVER EVENTS (kept for /stalker command compatibility)
// ──────────────────────────────────────────
mp.events.add('stalker:toggle', (state) => {
    if (state) enableStalker(); else disableStalker();
});

mp.events.add('stalker:lock', () => {
    if (!stalkerActive) return;
    if (lastFrontSpeed !== null && frontLocked === null) {
        frontLocked = Math.round(lastFrontSpeed);
        execBrowser(`lockFront(${frontLocked})`);
    }
    if (lastRearSpeed !== null && rearLocked === null) {
        rearLocked = Math.round(lastRearSpeed);
        execBrowser(`lockRear(${rearLocked})`);
    }
});

mp.events.add('stalker:unlock', () => {
    if (!stalkerActive) return;
    frontLocked = null; rearLocked = null;
    execBrowser('lockFront(null)'); execBrowser('lockRear(null)');
});

mp.events.add('stalker:fast', (state) => {
    if (!stalkerActive) return;
    fastMode = state;
    execBrowser(`setFastIndicator(${fastMode})`);
});

mp.events.add('stalker:xmit', (antenna, state) => {
    if (antenna === 'front') {
        xmitFront = state;
        if (!state) { lastFrontSpeed = null; lastFrontDir = null; }
        execBrowser(`updateFrontAntenna({speed:null,direction:null,xmit:${state}})`);
    } else if (antenna === 'rear') {
        xmitRear = state;
        if (!state) { lastRearSpeed = null; lastRearDir = null; }
        execBrowser(`updateRearAntenna({speed:null,direction:null,xmit:${state}})`);
    }
});

// Cleanup on exit vehicle
mp.events.add('playerLeaveVehicle', () => {
    if (stalkerActive) disableStalker();
});
