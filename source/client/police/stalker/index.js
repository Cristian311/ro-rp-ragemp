/**
 * Moving Stalker Radar - Client Side
 * Stalker DSR 2X: front + rear antennas, patrol speed, SAME/OPP, FAST, LOCK.
 *
 * TWO MODES:
 *   NORMAL — Stable detection, ~200ms interval, ±1 mph noise, strong target lock
 *   FAST   — Rapid ~50ms interval, ±3 mph noise, jitter, occasional dropouts & target switching
 *
 * KEYBINDS (while radar is active):
 *   Numpad 0 — Toggle radar ON/OFF (must be in vehicle)
 *   Numpad 1 — Toggle LOCK (freeze current readings)
 *   Numpad 2 — Toggle FAST mode
 *   Numpad 4 — Toggle Front antenna XMIT
 *   Numpad 5 — Toggle Rear antenna XMIT
 */

// ══════════════════════════════════════════
// CONFIGURATION — tweak these for realism
// ══════════════════════════════════════════
const CFG = {
    scanDistance: 70.0,       // max detection range in meters

    // NORMAL mode
    normalInterval: 650,      // ms between scans
    normalNoise: 1,           // ±1 mph random fluctuation
    normalSticky: 0.90,       // 90% chance to keep tracking same vehicle over a closer one

    // FAST mode
    fastIntervalBase: 70,     // base ms between scans
    fastIntervalJitter: 25,   // ±25ms random jitter on top
    fastNoise: 3,             // ±3 mph random fluctuation
    fastSticky: 0.40,         // 40% target stickiness (weaker lock)
    fastDropoutChance: 0.08,  // 8% chance per tick to lose detection momentarily
    fastSwitchChance: 0.15,   // 15% chance to jump to a different nearby vehicle

    // Target timeout
    targetTimeout: 30000,     // 30s — clear display if vehicle not seen for this long

    // Ray configuration (35 horizontal × 1 height × 7 vertical = 245 per direction)
    hAngles: [
        0, 1.5, -1.5, 3.5, -3.5, 5.5, -5.5, 8, -8, 10.5, -10.5,
        13, -13, 16, -16, 19, -19, 22, -22, 26, -26, 30, -30,
        35, -35, 40, -40, 46, -46, 50, -50, 55, -55, 58, -58
    ],
    heights: [0.8],
    vAngles: [-8, -4, -1, 2, 6, 11, 17],
};

const MS_TO_MPH = 2.23694;

// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let stalkerActive = false;
let stalkerBrowser = null;
let scanTimer = null;

let xmitFront = true;
let xmitRear = true;
let fastMode = false;
let frontLocked = null;
let rearLocked = null;

// Per-antenna target tracking
let frontTrk = { handle: null, speed: null, dir: null, lastSeen: 0 };
let rearTrk  = { handle: null, speed: null, dir: null, lastSeen: 0 };

// ══════════════════════════════════════════
// BROWSER
// ══════════════════════════════════════════
function ensureBrowser() {
    if (stalkerBrowser) return;
    try { stalkerBrowser = mp.browsers.new('package://police/stalker/index.html'); }
    catch (e) { mp.console.logError('[STALKER] Browser error: ' + e); }
}

function destroyBrowser() {
    if (stalkerBrowser) { try { stalkerBrowser.destroy(); } catch (_) {} stalkerBrowser = null; }
}

function execBrowser(code) {
    if (stalkerBrowser) { try { stalkerBrowser.execute(code); } catch (_) {} }
}

// ══════════════════════════════════════════
// TOGGLE
// ══════════════════════════════════════════
function enableStalker() {
    if (stalkerActive) return;
    stalkerActive = true;
    resetState();

    ensureBrowser();
    setTimeout(() => {
        execBrowser('show()');
        execBrowser('showHelp()');
        execBrowser(`updateFrontAntenna({speed:null,direction:null,xmit:true})`);
        execBrowser(`updateRearAntenna({speed:null,direction:null,xmit:true})`);
        execBrowser('setFastIndicator(false)');
    }, 200);

    scheduleScan();
}

function disableStalker() {
    if (!stalkerActive) return;
    stalkerActive = false;
    cancelScan();
    resetState();
    execBrowser('hideHelp()');
    execBrowser('hide()');
    setTimeout(() => destroyBrowser(), 400);
}

function resetState() {
    frontLocked = null;
    rearLocked = null;
    xmitFront = true;
    xmitRear = true;
    fastMode = false;
    frontTrk = { handle: null, speed: null, dir: null, lastSeen: 0 };
    rearTrk  = { handle: null, speed: null, dir: null, lastSeen: 0 };
}

// ══════════════════════════════════════════
// DYNAMIC SCAN SCHEDULER (setTimeout chain, not setInterval)
// Interval changes dynamically based on mode
// ══════════════════════════════════════════
function getNextInterval() {
    if (fastMode) {
        const jitter = (Math.random() * 2 - 1) * CFG.fastIntervalJitter;
        return Math.max(30, Math.round(CFG.fastIntervalBase + jitter));
    }
    return CFG.normalInterval;
}

function scheduleScan() {
    cancelScan();
    if (!stalkerActive) return;
    scanTimer = setTimeout(() => {
        scanRadar();
        scheduleScan();
    }, getNextInterval());
}

function cancelScan() {
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function addNoise(speed) {
    const range = fastMode ? CFG.fastNoise : CFG.normalNoise;
    return speed + (Math.random() * 2 - 1) * range;
}

function getDirection(patrolVeh, targetVeh) {
    const pH = patrolVeh.getHeading();
    const tH = targetVeh.getHeading();
    let diff = Math.abs(pH - tH);
    if (diff > 180) diff = 360 - diff;
    return diff < 70 ? 'same' : (diff > 110 ? 'opp' : 'same');
}

// ══════════════════════════════════════════
// MAIN SCAN LOOP
// ══════════════════════════════════════════
function scanRadar() {
    if (!stalkerActive) return;

    // Debug
    if (global.radarDebug && global.radarDebug.isStalkerDebug()) global.radarDebug.clearStalkerRays();

    const player = mp.players.local;
    if (!player.vehicle) { execBrowser('resetRadar()'); return; }

    const veh = player.vehicle;
    execBrowser(`updatePatrolSpeed(${(veh.getSpeed() * MS_TO_MPH).toFixed(0)})`);

    const heading = veh.getHeading();
    const headingRad = (heading * Math.PI) / 180;
    const forwardX = -Math.sin(headingRad);
    const forwardY = Math.cos(headingRad);
    const pos = veh.position;
    const origin = new mp.Vector3(pos.x, pos.y, pos.z + 0.5);

    // ──── FRONT ANTENNA (scans even when locked — lock only freezes the lock display) ────
    if (xmitFront) {
        processAntenna(origin, forwardX, forwardY, pos.z, 1, veh, frontTrk, 'front');
    }

    // ──── REAR ANTENNA ────
    if (xmitRear) {
        processAntenna(origin, forwardX, forwardY, pos.z, -1, veh, rearTrk, 'rear');
    }
}

// ══════════════════════════════════════════
// PROCESS SINGLE ANTENNA (detection + targeting + display)
// ══════════════════════════════════════════
function processAntenna(origin, fwdX, fwdY, baseZ, direction, ownVeh, trk, antenna) {
    // FAST mode: random dropout — skip this tick entirely (keep last display)
    if (fastMode && Math.random() < CFG.fastDropoutChance) return;

    const allHits = scanCone(origin, fwdX, fwdY, baseZ, direction, ownVeh);

    if (allHits.length === 0) {
        // No vehicles detected — check 30s timeout (but never clear if LOCKed)
        if (trk.handle && (Date.now() - trk.lastSeen) > CFG.targetTimeout) {
            const isLocked = (antenna === 'front') ? (frontLocked !== null) : (rearLocked !== null);
            if (!isLocked) {
                trk.handle = null; trk.speed = null; trk.dir = null;
                if (antenna === 'front') execBrowser(`updateFrontAntenna({speed:null,direction:null,xmit:true})`);
                else execBrowser(`updateRearAntenna({speed:null,direction:null,xmit:true})`);
            }
        }
        return;
    }

    // Sort all hits by distance
    allHits.sort((a, b) => a.distance - b.distance);
    const closest = allHits[0];

    // ── Target selection with stickiness ──
    let chosen = closest;
    const sticky = fastMode ? CFG.fastSticky : CFG.normalSticky;

    if (trk.handle) {
        // We have an existing tracked vehicle — look for it in hits
        const tracked = allHits.find(h => h.vehicle.handle === trk.handle);

        if (tracked) {
            // Still seeing our tracked vehicle
            if (fastMode && allHits.length > 1 && Math.random() < CFG.fastSwitchChance) {
                // FAST: randomly jump to a different vehicle
                const others = allHits.filter(h => h.vehicle.handle !== trk.handle);
                chosen = others[Math.floor(Math.random() * others.length)];
            } else {
                // Sticky: keep tracking even if not the closest
                chosen = (Math.random() < sticky) ? tracked : closest;
            }
        }
        // else: tracked vehicle gone → chosen stays as closest (natural switch)
    }

    // Calculate speed with noise
    const rawSpeed = chosen.vehicle.getSpeed() * MS_TO_MPH;
    const noisySpeed = Math.max(0, Math.round(addNoise(rawSpeed)));
    const dir = getDirection(ownVeh, chosen.vehicle);

    // Update tracking state
    trk.handle = chosen.vehicle.handle;
    trk.speed = noisySpeed;
    trk.dir = dir;
    trk.lastSeen = Date.now();

    // Push to UI
    const data = JSON.stringify({ speed: noisySpeed, direction: dir, xmit: true });
    if (antenna === 'front') {
        execBrowser(`updateFrontAntenna(${data})`);
    } else {
        execBrowser(`updateRearAntenna(${data})`);
    }
}

// ══════════════════════════════════════════
// MULTI-RAY CONE SCAN — returns ALL hit vehicles
// 35 horizontal × 1 height × 7 vertical = 245 rays per direction
// ══════════════════════════════════════════
function scanCone(origin, forwardX, forwardY, baseZ, direction, ownVeh) {
    const dirX = forwardX * direction;
    const dirY = forwardY * direction;
    const antenna = direction === 1 ? 'front' : 'rear';
    const { hAngles, heights, vAngles, scanDistance } = CFG;

    const hitMap = new Map(); // handle → { vehicle, distance }
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
                const endZOffset = Math.tan(vRad) * scanDistance;
                const startPos = new mp.Vector3(origin.x, origin.y, z);
                const endPos = new mp.Vector3(
                    origin.x + rayDirX * scanDistance,
                    origin.y + rayDirY * scanDistance,
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

                            const existing = hitMap.get(result.entity.handle);
                            if (!existing || dist < existing.distance) {
                                hitMap.set(result.entity.handle, { vehicle: result.entity, distance: dist });
                            }

                            if (isDbg) dbg.pushStalkerRay(startPos, result.position, true, antenna);
                        }
                    }
                } catch (_) {}

                if (isDbg && !hitVehicle) dbg.pushStalkerRay(startPos, endPos, false, antenna);
            }
        }
    }

    const hits = Array.from(hitMap.values());

    // Debug log
    if (isDbg && dbg && hits.length > 0) {
        const best = hits.reduce((a, b) => a.distance < b.distance ? a : b);
        dbg.addDebugLog('stalker', {
            antenna,
            targets: hits.length,
            closestSpeed: Math.round(best.vehicle.getSpeed() * MS_TO_MPH),
            closestDist: Math.round(best.distance),
            totalRays: hAngles.length * heights.length * vAngles.length
        });
    }

    return hits;
}

// ══════════════════════════════════════════
// KEYBINDS
// ══════════════════════════════════════════

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
        frontLocked = null; rearLocked = null;
        execBrowser('lockFront(null)'); execBrowser('lockRear(null)');
    } else {
        if (frontTrk.speed !== null) {
            frontLocked = frontTrk.speed;
            execBrowser(`lockFront(${frontLocked})`);
        }
        if (rearTrk.speed !== null) {
            rearLocked = rearTrk.speed;
            execBrowser(`lockRear(${rearLocked})`);
        }
    }
});

// Numpad 2 (0x62) — Toggle FAST mode
mp.keys.bind(0x62, true, () => {
    if (global.chatInputActive || !stalkerActive) return;
    fastMode = !fastMode;
    execBrowser(`setFastIndicator(${fastMode})`);
    // Re-schedule with new interval timing
    scheduleScan();
});

// Numpad 4 (0x64) — Toggle Front antenna XMIT
mp.keys.bind(0x64, true, () => {
    if (global.chatInputActive || !stalkerActive) return;
    xmitFront = !xmitFront;
    if (!xmitFront) {
        frontTrk = { handle: null, speed: null, dir: null, lastSeen: 0 };
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
        rearTrk = { handle: null, speed: null, dir: null, lastSeen: 0 };
        execBrowser(`updateRearAntenna({speed:null,direction:null,xmit:false})`);
    } else {
        execBrowser(`updateRearAntenna({speed:null,direction:null,xmit:true})`);
    }
});

// ══════════════════════════════════════════
// SERVER EVENTS (for /stalker command compatibility)
// ══════════════════════════════════════════
mp.events.add('stalker:toggle', (state) => {
    if (state) enableStalker(); else disableStalker();
});

mp.events.add('stalker:lock', () => {
    if (!stalkerActive) return;
    if (frontTrk.speed !== null && frontLocked === null) {
        frontLocked = frontTrk.speed;
        execBrowser(`lockFront(${frontLocked})`);
    }
    if (rearTrk.speed !== null && rearLocked === null) {
        rearLocked = rearTrk.speed;
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
    scheduleScan();
});

mp.events.add('stalker:xmit', (antenna, state) => {
    if (antenna === 'front') {
        xmitFront = state;
        if (!state) frontTrk = { handle: null, speed: null, dir: null, lastSeen: 0 };
        execBrowser(`updateFrontAntenna({speed:null,direction:null,xmit:${state}})`);
    } else if (antenna === 'rear') {
        xmitRear = state;
        if (!state) rearTrk = { handle: null, speed: null, dir: null, lastSeen: 0 };
        execBrowser(`updateRearAntenna({speed:null,direction:null,xmit:${state}})`);
    }
});

// Cleanup on exit vehicle
mp.events.add('playerLeaveVehicle', () => {
    if (stalkerActive) disableStalker();
});
