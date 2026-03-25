/**
 * ALPR (Automatic License Plate Reader) - Client Side
 * Radar politie: detecteaza vehiculul din fata si afiseaza viteza + informatii.
 * Control: /alpr ON / /alpr OFF
 */

let alprActive = false;
let alprBrowser = null;
let scanInterval = null;

// Tracked target to avoid spamming server with identical requests
let lastScannedVehicle = null;
let lastScannedTime = 0;
const SCAN_COOLDOWN = 1500; // ms between server lookups for same vehicle
const RAYCAST_DISTANCE = 350.0; // how far ahead to scan (meters)

// ──────────────────────────────────────────
// BROWSER MANAGEMENT
// ──────────────────────────────────────────
function ensureBrowser() {
    if (alprBrowser) return;
    try {
        alprBrowser = mp.browsers.new('package://alpr/index.html');
    } catch (e) {
        mp.console.logError('[ALPR] Failed to create browser: ' + e);
    }
}

function destroyBrowser() {
    if (alprBrowser) {
        try { alprBrowser.destroy(); } catch (_) {}
        alprBrowser = null;
    }
}

function execBrowser(code) {
    if (alprBrowser) {
        try { alprBrowser.execute(code); } catch (_) {}
    }
}

// ──────────────────────────────────────────
// ALPR TOGGLE
// ──────────────────────────────────────────
function enableALPR() {
    if (alprActive) return;
    alprActive = true;
    lastScannedVehicle = null;

    ensureBrowser();
    setTimeout(() => execBrowser('show()'), 150);

    // Start scanning loop
    scanInterval = setInterval(scanForward, 200);

    mp.events.call('chat:receive', JSON.stringify({
        type: 'system',
        text: '!{3b82f6}[ALPR] !{FFFFFF}Sistem ALPR activat.'
    }));
}

function disableALPR() {
    if (!alprActive) return;
    alprActive = false;
    lastScannedVehicle = null;

    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }

    execBrowser('hide()');
    // Destroy browser after hide animation
    setTimeout(() => destroyBrowser(), 300);

    mp.events.call('chat:receive', JSON.stringify({
        type: 'system',
        text: '!{3b82f6}[ALPR] !{FFFFFF}Sistem ALPR dezactivat.'
    }));
}

// ──────────────────────────────────────────
// SCAN LOGIC
// ──────────────────────────────────────────
function scanForward() {
    if (!alprActive) return;

    const player = mp.players.local;

    // Must be in a vehicle
    if (!player.vehicle) {
        execBrowser('clearTarget()');
        execBrowser('updateSpeed(0)');
        lastScannedVehicle = null;
        return;
    }

    const veh = player.vehicle;

    // Show player's own speed
    const mySpeed = veh.getSpeed() * 2.23694; // m/s => mph
    execBrowser(`updateSpeed(${mySpeed.toFixed(0)})`);

    // Multi-ray scan: cast a fan of rays at different horizontal angles and heights
    // This detects vehicles even when not directly behind them
    const fwdVec = veh.getForwardVector();
    const vehPos = veh.getCoords(true);

    // Horizontal spread angles (degrees) — covers ~110° cone
    const hAngles = [0, -2, 2, -5, 5, -9, 9, -14, 14, -20, 20, -28, 28, -37, 37, -46, 46, -55, 55];
    // Base height offsets from vehicle center
    const zOffsets = [-0.3, 0.2, 0.8, 1.5];
    // Vertical pitch angles (degrees) — negative = downhill, positive = uphill
    const vAngles = [-8, -4, -1, 2, 6, 11, 17];

    let closestVeh = null;
    let closestDist = Infinity;

    // Debug
    const dbg = global.radarDebug;
    const isDbg = dbg && dbg.isAlprDebug();
    if (isDbg) dbg.clearAlprRays();

    for (const angleDeg of hAngles) {
        const angleRad = (angleDeg * Math.PI) / 180;
        const cosA = Math.cos(angleRad);
        const sinA = Math.sin(angleRad);
        const dirX = fwdVec.x * cosA - fwdVec.y * sinA;
        const dirY = fwdVec.x * sinA + fwdVec.y * cosA;

        for (const zOff of zOffsets) {
            const startZ = vehPos.z + zOff;

            for (const vDeg of vAngles) {
                const vRad = (vDeg * Math.PI) / 180;
                const endZOffset = Math.tan(vRad) * RAYCAST_DISTANCE;

                const startPos = new mp.Vector3(
                    vehPos.x + dirX * 3.0,
                    vehPos.y + dirY * 3.0,
                    startZ
                );
                const endPos = new mp.Vector3(
                    vehPos.x + dirX * RAYCAST_DISTANCE,
                    vehPos.y + dirY * RAYCAST_DISTANCE,
                    startZ + endZOffset
                );

                let hitVehicle = false;
                const ray = mp.raycasting.testPointToPoint(startPos, endPos, [player.vehicle], 2);

                if (ray && ray.entity && ray.entity.type === 'vehicle') {
                    hitVehicle = true;
                    const dx = ray.position.x - vehPos.x;
                    const dy = ray.position.y - vehPos.y;
                    const dz = ray.position.z - vehPos.z;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                    if (dist < closestDist) {
                        closestDist = dist;
                        closestVeh = ray.entity;
                    }

                    if (isDbg) dbg.pushAlprRay(startPos, ray.position, true);
                }

                if (isDbg && !hitVehicle) dbg.pushAlprRay(startPos, endPos, false);
            }
        }
    }

    if (closestVeh) {
        const targetSpeed = closestVeh.getSpeed() * 2.23694; // m/s => mph

        // Debug log
        if (isDbg && dbg) {
            dbg.addDebugLog('alpr', {
                targetSpeed: Math.round(targetSpeed),
                distance: Math.round(closestDist),
                plate: closestVeh.getNumberPlateText().trim(),
                totalRays: hAngles.length * zOffsets.length * vAngles.length
            });
        }

        // Update speed display to target vehicle speed
        execBrowser(`updateSpeed(${targetSpeed.toFixed(0)})`);

        const now = Date.now();
        const targetId = closestVeh.remoteId;

        // Only send to server if we haven't scanned this vehicle recently
        if (targetId !== lastScannedVehicle || (now - lastScannedTime) > SCAN_COOLDOWN) {
            lastScannedVehicle = targetId;
            lastScannedTime = now;

            // Get basic client-side info
            const plate = closestVeh.getNumberPlateText().trim();
            const modelHash = closestVeh.model;

            // Send to server — server handles ALL name resolution via hash lookup
            mp.events.callRemote('alpr:scan', targetId, plate, modelHash, targetSpeed.toFixed(0));
        }
    } else {
        // No vehicle detected
        if (lastScannedVehicle !== null) {
            execBrowser('clearTarget()');
            lastScannedVehicle = null;
        }
    }
}

// ──────────────────────────────────────────
// SERVER RESPONSE
// ──────────────────────────────────────────
mp.events.add('alpr:result', (jsonStr) => {
    if (!alprActive || !alprBrowser) return;
    try {
        const safeJson = JSON.stringify(JSON.parse(jsonStr));
        execBrowser(`updateVehicleData(${safeJson})`);
    } catch (e) {
        mp.console.logError('[ALPR] Failed to parse result: ' + e);
    }
});

// ──────────────────────────────────────────
// COMMAND HANDLING (from server)
// ──────────────────────────────────────────
mp.events.add('alpr:toggle', (state) => {
    if (state) {
        enableALPR();
    } else {
        disableALPR();
    }
});

// Cleanup on disconnect / resource stop
mp.events.add('playerLeaveVehicle', () => {
    if (alprActive) {
        execBrowser('clearTarget()');
        execBrowser('updateSpeed(0)');
        lastScannedVehicle = null;
    }
});

// ──────────────────────────────────────────
// NPC DRIVER — for testing ALPR
// ──────────────────────────────────────────
const npcPeds = [];

mp.events.add('alpr:spawnNpcDriver', (vehicleId) => {
    try {
        // Find the server vehicle by remoteId
        let targetVeh = null;
        mp.vehicles.forEachInStreamRange(v => {
            if (v.remoteId === vehicleId) targetVeh = v;
        });

        if (!targetVeh) {
            // Vehicle not yet streamed, retry after a short delay
            setTimeout(() => {
                mp.vehicles.forEachInStreamRange(v => {
                    if (v.remoteId === vehicleId) targetVeh = v;
                });
                if (targetVeh) createNpcDriver(targetVeh);
            }, 2000);
            return;
        }

        createNpcDriver(targetVeh);
    } catch (e) {
        mp.console.logError('[ALPR] NPC spawn error: ' + e);
    }
});

function createNpcDriver(vehicle) {
    try {
        const vehHandle = vehicle.handle;
        const vehPos = vehicle.position;

        // Random civilian ped models
        const pedModels = [
            mp.game.joaat('a_m_y_business_01'),
            mp.game.joaat('a_m_y_downtown_01'),
            mp.game.joaat('a_m_m_business_01'),
            mp.game.joaat('a_f_y_business_01'),
            mp.game.joaat('a_m_y_stwhi_02'),
            mp.game.joaat('a_m_m_afriamer_01'),
            mp.game.joaat('s_m_y_cop_01')
        ];
        const modelHash = pedModels[Math.floor(Math.random() * pedModels.length)];

        // Request the model
        mp.game.streaming.requestModel(modelHash);

        let attempts = 0;
        const waitForModel = setInterval(() => {
            attempts++;
            if (mp.game.streaming.hasModelLoaded(modelHash) || attempts > 50) {
                clearInterval(waitForModel);

                if (!mp.game.streaming.hasModelLoaded(modelHash)) {
                    mp.console.logError('[ALPR] Failed to load ped model');
                    return;
                }

                // CREATE_PED native (0xD49F9B0955C367DE)
                const ped = mp.game.invoke('0xD49F9B0955C367DE',
                    4,            // pedType: civilian
                    modelHash,
                    vehPos.x, vehPos.y, vehPos.z,
                    0.0,          // heading
                    false,        // isNetwork
                    true          // bScriptHostPed
                );

                if (!ped || ped === 0) {
                    mp.console.logError('[ALPR] Failed to create NPC ped');
                    return;
                }

                // SET_PED_INTO_VEHICLE native (0xF75B0D629E1C063D)
                mp.game.invoke('0xF75B0D629E1C063D', ped, vehHandle, -1);

                // TASK_VEHICLE_DRIVE_WANDER native (0x480142959D337D00)
                // drivingStyle 786603 = normal driving, obeys traffic lights
                mp.game.invoke('0x480142959D337D00', ped, vehHandle, 15.0, 786603);

                // SET_PED_CONFIG_FLAG native (0x1913FE4CBF41C463)
                mp.game.invoke('0x1913FE4CBF41C463', ped, 35, false);

                // Store reference for cleanup
                npcPeds.push(ped);

                // Release model
                mp.game.streaming.setModelAsNoLongerNeeded(modelHash);

                mp.events.call('chat:receive', JSON.stringify({
                    type: 'system',
                    text: '!{3b82f6}[TEST] !{FFFFFF}NPC driver a pornit la drum!'
                }));
            }
        }, 100);
    } catch (e) {
        mp.console.logError('[ALPR] createNpcDriver error: ' + e);
    }
}

// Cleanup NPC peds when vehicles are cleaned
mp.events.add('alpr:cleanNpcs', () => {
    for (const ped of npcPeds) {
        try {
            // DOES_ENTITY_EXIST native (0x7239B21A38F536BA)
            if (mp.game.invoke('0x7239B21A38F536BA', ped)) {
                // SET_ENTITY_AS_MISSION_ENTITY then DELETE_PED
                mp.game.invoke('0xAD738C3085FE7E11', ped, true, true); // SET_ENTITY_AS_MISSION_ENTITY
                mp.game.invoke('0x9614299DCB53E54B', ped); // DELETE_PED (passing by value)
            }
        } catch (_) {}
    }
    npcPeds.length = 0;
});

console.log('[ALPR] Client-side loaded.');
