// ──────────────────────────────────────────
// GRAFFITI CLIENT CONTROLLER
// Uses game-textures/put + drawSpritePoly for native 3D wall textures
// ──────────────────────────────────────────

let canvasBrowser  = null;   // Drawing UI browser
let overlayBrowser = null;   // Texture manager + placement UI browser

let graffitiData       = {};  // id → { position, normal, imageData }
let uploadedTextures   = {};  // id → true (texture uploaded and ready)
let pendingImageData   = null;
let isPlacementMode    = false;
let isCanvasOpen       = false;
let overlayReady       = false;
let pendingUploads     = [];  // queued uploads until overlay is ready

const RENDER_DISTANCE = 50.0;
const FADE_START      = 40.0;
const GRAFFITI_SIZE   = 2.0; // world meters

const KEY_ESC         = 0x1B;
const KEY_E           = 0x45;

// ──────────────────────────────────────────
// 3D QUAD HELPERS — compute wall-aligned quad
// ──────────────────────────────────────────
function computeQuadVectors(normal) {
    // Compute right & up vectors perpendicular to the wall normal
    const worldUp = { x: 0, y: 0, z: 1 };
    const dot = Math.abs(normal.x * worldUp.x + normal.y * worldUp.y + normal.z * worldUp.z);
    const ref = dot > 0.9 ? { x: 0, y: 1, z: 0 } : worldUp;

    // right = normalize( cross(ref, normal) )
    let rx = ref.y * normal.z - ref.z * normal.y;
    let ry = ref.z * normal.x - ref.x * normal.z;
    let rz = ref.x * normal.y - ref.y * normal.x;
    const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
    rx /= rLen; ry /= rLen; rz /= rLen;

    // up = cross(normal, right)
    const ux = normal.y * rz - normal.z * ry;
    const uy = normal.z * rx - normal.x * rz;
    const uz = normal.x * ry - normal.y * rx;

    return { right: { x: rx, y: ry, z: rz }, up: { x: ux, y: uy, z: uz } };
}

// ──────────────────────────────────────────
// OVERLAY BROWSER (persistent)
// ──────────────────────────────────────────
function ensureOverlay() {
    if (overlayBrowser === null) {
        overlayBrowser = mp.browsers.new('package://graffiti/overlay.html');
        overlayReady = false;
    }
}

// ──────────────────────────────────────────
// DRAWING CANVAS
// ──────────────────────────────────────────
mp.events.add('openGraffitiCanvas', () => {
    if (isCanvasOpen || isPlacementMode) return;
    isCanvasOpen = true;
    canvasBrowser = mp.browsers.new('package://graffiti/index.html');
    mp.gui.cursor.show(true, true);
});

function closeCanvas() {
    if (canvasBrowser !== null) {
        canvasBrowser.destroy();
        canvasBrowser = null;
    }
    isCanvasOpen = false;
    mp.gui.cursor.show(false, false);
}

// Canvas ready → enter placement mode
mp.events.add('Graffiti_CanvasReady', (dataURL) => {
    pendingImageData = dataURL;
    closeCanvas();
    enterPlacementMode();
});

// Canvas cancelled
mp.events.add('Graffiti_CanvasCancel', () => {
    closeCanvas();
});

// ──────────────────────────────────────────
// PLACEMENT MODE
// ──────────────────────────────────────────
function enterPlacementMode() {
    isPlacementMode = true;
    ensureOverlay();
    overlayBrowser.execute(`showPlacementUI(true);`);
    // Show preview image on crosshair via chunked transfer
    sendChunkedPreview(pendingImageData);
}

function exitPlacementMode() {
    isPlacementMode = false;
    pendingImageData = null;
    if (overlayBrowser !== null) {
        overlayBrowser.execute(`showPlacementUI(false);`);
        overlayBrowser.execute(`setPlacementPreview(null);`);
    }
}

// Raycast from camera to find wall surface
function getCameraData() {
    // Get start position from player's head bone (close to actual camera pos)
    const startPos = mp.players.local.getBoneCoords(31086, 0.1, 0, 0);

    // Try to get camera rotation; fallback to player heading
    let rotX = 0, rotZ = 0;
    try {
        const camRot = mp.game.cam.getGameplayCamRot(2);
        rotX = camRot.x;
        rotZ = camRot.z;
    } catch (e) {
        rotZ = -mp.players.local.getHeading();
        rotX = mp.game.cam.getGameplayCamRelativePitch
            ? mp.game.cam.getGameplayCamRelativePitch()
            : 0;
    }

    return { startPos, rotX, rotZ };
}

function performRaycast() {
    const { startPos, rotX, rotZ } = getCameraData();

    // Direction from rotation
    const rX = rotX * Math.PI / 180;
    const rZ = rotZ * Math.PI / 180;

    const dir = {
        x: -Math.sin(rZ) * Math.abs(Math.cos(rX)),
        y:  Math.cos(rZ) * Math.abs(Math.cos(rX)),
        z:  Math.sin(rX)
    };

    const distance = 15.0; // max placement distance
    const endPos = new mp.Vector3(
        startPos.x + dir.x * distance,
        startPos.y + dir.y * distance,
        startPos.z + dir.z * distance
    );

    const ray = mp.raycasting.testPointToPoint(
        startPos,
        endPos,
        [1, 16]  // Intersect with map geometry and objects
    );

    return ray;
}

// Left click during placement → place graffiti
mp.events.add('click', (x, y, upOrDown, leftOrRight) => {
    if (!isPlacementMode || !pendingImageData) return;

    // leftOrRight: 0 = left, 1 = right
    if (upOrDown === 'up') return; // only act on mouse down

    if (leftOrRight === 1) {
        // Right click → cancel
        exitPlacementMode();
        return;
    }

    // Left click → try to place
    const ray = performRaycast();
    if (!ray) {
        mp.game.graphics.notify('~r~Tinteste un perete!');
        return;
    }

    // Extract hit data
    const hitPos = ray.position;
    const normal = ray.surfaceNormal;

    if (!hitPos || !normal) {
        mp.game.graphics.notify('~r~Nu s-a gasit o suprafata!');
        return;
    }

    // Offset slightly from wall to prevent z-fighting
    const placementPos = {
        x: hitPos.x + normal.x * 0.02,
        y: hitPos.y + normal.y * 0.02,
        z: hitPos.z + normal.z * 0.02
    };

    const data = JSON.stringify({
        imageData: pendingImageData,
        position: placementPos,
        normal: { x: normal.x, y: normal.y, z: normal.z }
    });

    mp.events.callRemote('Server_GraffitiPlace', data);
    exitPlacementMode();
});

// ESC cancels canvas or placement
mp.keys.bind(KEY_ESC, true, () => {
    if (isCanvasOpen) {
        closeCanvas();
        return;
    }
    if (isPlacementMode) {
        exitPlacementMode();
        return;
    }
});

// ──────────────────────────────────────────
// CHUNKED TRANSFER TO CEF OVERLAY
// ──────────────────────────────────────────
const CHUNK_SIZE = 20000; // 20KB per browser.execute() call

function sendChunkedTexture(id, imageData) {
    const totalChunks = Math.ceil(imageData.length / CHUNK_SIZE);
    overlayBrowser.execute(`startTextureUpload(${id}, ${totalChunks});`);
    for (let i = 0; i < totalChunks; i++) {
        const chunk = imageData.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const safe = chunk.replace(/'/g, "\\'");
        overlayBrowser.execute(`addTextureChunk(${id}, ${i}, '${safe}');`);
    }
}

function sendChunkedPreview(imageData) {
    const totalChunks = Math.ceil(imageData.length / CHUNK_SIZE);
    overlayBrowser.execute(`startPreview(${totalChunks});`);
    for (let i = 0; i < totalChunks; i++) {
        const chunk = imageData.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const safe = chunk.replace(/'/g, "\\'");
        overlayBrowser.execute(`addPreviewChunk(${i}, '${safe}');`);
    }
}

// ──────────────────────────────────────────
// UPLOAD QUEUE (sequential, one at a time)
// ──────────────────────────────────────────
let uploadQueue = [];
let isUploading = false;

function processUploadQueue() {
    if (isUploading || uploadQueue.length === 0) return;
    isUploading = true;
    const { id, imageData } = uploadQueue.shift();
    sendChunkedTexture(id, imageData);
}

mp.events.add('Graffiti_TextureUploaded', (idStr) => {
    const numId = parseInt(idStr);
    uploadedTextures[numId] = true;
    isUploading = false;
    processUploadQueue();
});

mp.events.add('Graffiti_TextureError', (msg) => {
    isUploading = false;
    processUploadQueue();
});

// ──────────────────────────────────────────
// OVERLAY READY EVENT
// ──────────────────────────────────────────
mp.events.add('Graffiti_OverlayReady', () => {
    overlayReady = true;
    for (const pending of pendingUploads) {
        doUploadTexture(pending.id, pending.imageData);
    }
    pendingUploads = [];
});

function doUploadTexture(id, imageData) {
    uploadQueue.push({ id, imageData });
    processUploadQueue();
}

function uploadGraffitiTexture(id, imageData) {
    ensureOverlay();
    if (overlayReady) {
        doUploadTexture(id, imageData);
    } else {
        pendingUploads.push({ id, imageData });
    }
}

// ──────────────────────────────────────────
// GRAFFITI SYNC EVENTS
// ──────────────────────────────────────────

// Receive a single new graffiti (broadcast)
mp.events.add('graffitiCreated', (jsonStr) => {
    try {
        const g = JSON.parse(jsonStr);
        graffitiData[g.id] = g;
        uploadGraffitiTexture(g.id, g.imageData);
    } catch (e) {}
});

// Receive chunk of graffiti on join
mp.events.add('graffitiLoadChunk', (jsonStr) => {
    try {
        const chunk = JSON.parse(jsonStr);
        for (const g of chunk) {
            graffitiData[g.id] = g;
            uploadGraffitiTexture(g.id, g.imageData);
        }
    } catch (e) {}
});

mp.events.add('graffitiLoadComplete', () => {
    // All graffiti loaded and textures uploading
});

// Single graffiti deleted
mp.events.add('graffitiDeleted', (jsonStr) => {
    try {
        const data = JSON.parse(jsonStr);
        delete graffitiData[data.id];
        delete uploadedTextures[data.id];
    } catch (e) {}
});

// All graffiti cleared
mp.events.add('graffitiClearAll', () => {
    graffitiData = {};
    uploadedTextures = {};
});

// ──────────────────────────────────────────
// RENDER LOOP — native drawSpritePoly on walls
// ──────────────────────────────────────────
mp.events.add('render', () => {
    const playerPos = mp.players.local.position;
    const hs = GRAFFITI_SIZE / 2;

    for (const id in graffitiData) {
        // Skip if texture not uploaded yet
        if (!uploadedTextures[id]) continue;

        const g   = graffitiData[id];
        const pos = g.position;

        // Distance check
        const dx = pos.x - playerPos.x;
        const dy = pos.y - playerPos.y;
        const dz = pos.z - playerPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > RENDER_DISTANCE) continue;

        const dictName = 'crtxd_graffiti_' + id;
        const texName  = 'sprite';

        // Request texture dict loading (RAGE:MP adds crtxd_ prefix to custom textures)
        if (!mp.game.graphics.hasStreamedTextureDictLoaded(dictName)) {
            mp.game.graphics.requestStreamedTextureDict(dictName, true);
            continue; // Skip drawing until texture is loaded
        }

        // Opacity fade at distance
        let alpha = 255;
        if (dist > FADE_START) {
            alpha = Math.floor(255 * (1.0 - (dist - FADE_START) / (RENDER_DISTANCE - FADE_START)));
        }
        if (alpha <= 0) continue;

        // Compute wall-aligned quad corners from position + surface normal
        const { right, up } = computeQuadVectors(g.normal);

        const bl = {
            x: pos.x - right.x * hs - up.x * hs,
            y: pos.y - right.y * hs - up.y * hs,
            z: pos.z - right.z * hs - up.z * hs
        };
        const br = {
            x: pos.x + right.x * hs - up.x * hs,
            y: pos.y + right.y * hs - up.y * hs,
            z: pos.z + right.z * hs - up.z * hs
        };
        const tl = {
            x: pos.x - right.x * hs + up.x * hs,
            y: pos.y - right.y * hs + up.y * hs,
            z: pos.z - right.z * hs + up.z * hs
        };
        const tr = {
            x: pos.x + right.x * hs + up.x * hs,
            y: pos.y + right.y * hs + up.y * hs,
            z: pos.z + right.z * hs + up.z * hs
        };

        // Triangle 1: bottomLeft, bottomRight, topLeft
        mp.game.graphics.drawSpritePoly(
            bl.x, bl.y, bl.z,
            br.x, br.y, br.z,
            tl.x, tl.y, tl.z,
            255, 255, 255, alpha,
            dictName, texName,
            0, 1, 1,    // BL: u=0, v=1, w=1
            1, 1, 1,    // BR: u=1, v=1, w=1
            0, 0, 1     // TL: u=0, v=0, w=1
        );

        // Triangle 2: topLeft, bottomRight, topRight
        mp.game.graphics.drawSpritePoly(
            tl.x, tl.y, tl.z,
            br.x, br.y, br.z,
            tr.x, tr.y, tr.z,
            255, 255, 255, alpha,
            dictName, texName,
            0, 0, 1,    // TL: u=0, v=0, w=1
            1, 1, 1,    // BR: u=1, v=1, w=1
            1, 0, 1     // TR: u=1, v=0, w=1
        );
    }
});
