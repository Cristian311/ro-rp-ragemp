/**
 * Raytrace Tool - Arunca un ray din camera si pune un marker purple unde loveste.
 * Apasa tasta 2 (KEY_2) pentru a activa/dezactiva.
 * Cand e activ, arata un punct purple pe suprafata si coordonatele exacte pe ecran.
 */

let isRaytraceActive = false;
let hitPosition = null;
let hitNormal = null;
let hitEntity = null;

const KEY_2 = 50; // tasta '2'

// Toggle raytrace cu tasta 2
mp.keys.bind(KEY_2, true, () => {
    if (global.chatInputActive) return;
    isRaytraceActive = !isRaytraceActive;
    hitPosition = null;
    mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[Raytrace] ${isRaytraceActive ? 'ON' : 'OFF'}`}));
});

// Copiere coord in clipboard cu tasta 3 + trimite la server
const KEY_3 = 51;
mp.keys.bind(KEY_3, true, () => {
    if (global.chatInputActive) return;
    if (!isRaytraceActive || !hitPosition) return;
    const coordStr = `${hitPosition.x.toFixed(4)}, ${hitPosition.y.toFixed(4)}, ${hitPosition.z.toFixed(4)}`;
    mp.events.call('chat:receive', JSON.stringify({type: 'system', text: `[Raytrace] Coordonate: ${coordStr}`}));

    // Find nearest roulette table
    let nearestTable = null;
    let nearestDist = Infinity;
    mp.objects.forEachInStreamRange(obj => {
        try {
            const objPos = obj.position;
            const dx = objPos.x - hitPosition.x;
            const dy = objPos.y - hitPosition.y;
            const dz = objPos.z - hitPosition.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (dist < nearestDist && dist < 50) {
                nearestDist = dist;
                nearestTable = { x: objPos.x, y: objPos.y, z: objPos.z, dist: dist };
            }
        } catch(e) {}
    });

    const tableStr = nearestTable
        ? `${nearestTable.x.toFixed(4)}, ${nearestTable.y.toFixed(4)}, ${nearestTable.z.toFixed(4)} (dist: ${nearestTable.dist.toFixed(2)})`
        : 'none found';

    mp.events.callRemote('Raytrace:LogPosition', coordStr, tableStr);
});

mp.events.add('render', () => {
    if (!isRaytraceActive) return;

    try {
        const cam = mp.cameras.new('gameplay');
        const camPos = cam.getCoord();
        const camRot = cam.getRot(2);

        // Calculam directia din rotatia camerei
        // Offset usor la dreapta ca sa nu se vada characterul
        const offsetRight = 0.6; // grade offset la dreapta
        const adjustedYaw = camRot.z + offsetRight;

        const pitchRad = camRot.x * (Math.PI / 180.0);
        const yawRad = adjustedYaw * (Math.PI / 180.0);

        const dirX = -Math.sin(yawRad) * Math.cos(pitchRad);
        const dirY = Math.cos(yawRad) * Math.cos(pitchRad);
        const dirZ = Math.sin(pitchRad);

        const rayLength = 200.0; // distanta maxima in metri
        const endPos = new mp.Vector3(
            camPos.x + dirX * rayLength,
            camPos.y + dirY * rayLength,
            camPos.z + dirZ * rayLength
        );

        // Raycast: -1 = tot (perete, teren, obiecte, vehicule, peduri)
        // Flags: 1 = intersect map, 2 = vehicles, 4 = peds, 8 = objects, 16 = water
        // Folosim 1 | 2 | 4 | 8 | 16 = 31 (tot)
        const ray = mp.raycasting.testPointToPoint(camPos, endPos, [mp.players.local.handle], 31);

        if (ray && ray.position) {
            hitPosition = ray.position;
            hitNormal = ray.surfaceNormal || null;
            hitEntity = ray.entity || null;
        } else {
            hitPosition = null;
            hitNormal = null;
            hitEntity = null;
        }

        // Desenam marker purple la punctul de impact
        if (hitPosition) {
            // Marker mic purple (tip 28 = sphere mic)
            mp.game.graphics.drawMarker(
                28,                          // tip: DebugSphere
                hitPosition.x,
                hitPosition.y,
                hitPosition.z,
                0, 0, 0,                    // directie
                0, 0, 0,                    // rotatie
                0.05, 0.05, 0.05,           // scala (mic)
                128, 0, 255, 200,           // culoare purple (R, G, B, A)
                false,                       // bobUpAndDown
                false,                       // faceCamera
                2,                           // p19
                false,                       // rotate
                null, null,                  // textureDict, textureName
                false                        // drawOnEnts
            );

            // Linie subtire de la camera la punct (optional, vizualizare ray)
            mp.game.graphics.drawLine(
                camPos.x, camPos.y, camPos.z,
                hitPosition.x, hitPosition.y, hitPosition.z,
                128, 0, 255, 100  // purple semi-transparent
            );

            // Desenam text cu coordonatele pe ecran
            const x = hitPosition.x.toFixed(4);
            const y = hitPosition.y.toFixed(4);
            const z = hitPosition.z.toFixed(4);

            const screenX = 0.5;
            const screenY = 0.92;

            // Background rect
            mp.game.graphics.drawRect(screenX, screenY, 0.30, 0.055, 15, 15, 15, 180);

            // Titlu
            mp.game.graphics.drawText(
                `~p~RAYTRACE HIT`,
                [screenX, screenY - 0.020],
                {
                    font: 4,
                    color: [180, 80, 255, 255],
                    scale: [0.35, 0.35],
                    outline: true,
                    centre: true
                }
            );

            // Coordonate
            mp.game.graphics.drawText(
                `~w~X: ~p~${x}  ~w~Y: ~p~${y}  ~w~Z: ~p~${z}`,
                [screenX, screenY + 0.002],
                {
                    font: 4,
                    color: [255, 255, 255, 255],
                    scale: [0.30, 0.30],
                    outline: true,
                    centre: true
                }
            );

            // Hint pentru copiere
            mp.game.graphics.drawText(
                `~w~Apasa ~p~3 ~w~pentru a copia coordonatele in chat`,
                [screenX, screenY + 0.035],
                {
                    font: 4,
                    color: [200, 200, 200, 200],
                    scale: [0.25, 0.25],
                    outline: true,
                    centre: true
                }
            );

            // Crosshair mic purple in centrul ecranului
            mp.game.graphics.drawRect(0.5, 0.5, 0.004, 0.004, 128, 0, 255, 220);
        } else {
            // Daca nu loveste nimic, arata doar crosshair-ul
            mp.game.graphics.drawRect(0.5, 0.5, 0.004, 0.004, 128, 0, 255, 120);

            mp.game.graphics.drawText(
                `~p~RAYTRACE ~w~- Nimic in raza`,
                [0.5, 0.92],
                {
                    font: 4,
                    color: [180, 80, 255, 255],
                    scale: [0.30, 0.30],
                    outline: true,
                    centre: true
                }
            );
        }
    } catch (e) {
        // Silent fail in render loop
    }
});

console.log('[Raytrace] loaded');
