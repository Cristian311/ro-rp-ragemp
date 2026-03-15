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
const PREVIEW_TEX_ID  = 99999;

let previewSizeW       = GRAFFITI_SIZE;
let previewSizeH       = GRAFFITI_SIZE;
let previewRotation    = 0;
let previewTextureReady = false;

// ──────────────────────────────────────────
// 3D QUAD HELPERS — compute wall-aligned quad
// ──────────────────────────────────────────
function computeQuadVectors(normal, rotation) {
    const worldUp = { x: 0, y: 0, z: 1 };
    const dot = Math.abs(normal.x * worldUp.x + normal.y * worldUp.y + normal.z * worldUp.z);
    const ref = dot > 0.9 ? { x: 0, y: 1, z: 0 } : worldUp;

    let rx = ref.y * normal.z - ref.z * normal.y;
    let ry = ref.z * normal.x - ref.x * normal.z;
    let rz = ref.x * normal.y - ref.y * normal.x;
    const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
    rx /= rLen; ry /= rLen; rz /= rLen;

    const ux = normal.y * rz - normal.z * ry;
    const uy = normal.z * rx - normal.x * rz;
    const uz = normal.x * ry - normal.y * rx;

    if (rotation) {
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        return {
            right: { x: rx * cos + ux * sin, y: ry * cos + uy * sin, z: rz * cos + uz * sin },
            up:    { x: -rx * sin + ux * cos, y: -ry * sin + uy * cos, z: -rz * sin + uz * cos }
        };
    }

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

// Canvas ready — chunked receive from CEF (avoids mp.trigger size limits)
let canvasChunks = null;
let pendingAspectW = GRAFFITI_SIZE;
let pendingAspectH = GRAFFITI_SIZE;

mp.events.add('Graffiti_CanvasStart', (totalStr, wStr, hStr) => {
    const total = parseInt(totalStr);
    canvasChunks = { total, chunks: new Array(total), received: 0 };
    pendingAspectW = parseFloat(wStr) || GRAFFITI_SIZE;
    pendingAspectH = parseFloat(hStr) || GRAFFITI_SIZE;
});

mp.events.add('Graffiti_CanvasChunk', (idxStr, data) => {
    if (!canvasChunks) return;
    const idx = parseInt(idxStr);
    canvasChunks.chunks[idx] = data;
    canvasChunks.received++;
    if (canvasChunks.received >= canvasChunks.total) {
        const fullData = canvasChunks.chunks.join('');
        canvasChunks = null;
        pendingImageData = fullData;
        closeCanvas();
        enterPlacementMode();
    }
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
    previewSizeW = pendingAspectW;
    previewSizeH = pendingAspectH;
    previewTextureReady = false;
    ensureOverlay();
    overlayBrowser.execute(`showPlacementUI(true);`);
    uploadPreviewTexture(pendingImageData);
}

function exitPlacementMode() {
    isPlacementMode = false;
    pendingImageData = null;
    previewTextureReady = false;
    if (overlayBrowser !== null) {
        overlayBrowser.execute(`showPlacementUI(false);`);
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

// Left click during placement → place graffiti, Right click → cancel
mp.events.add('click', (x, y, upOrDown, leftOrRight) => {
    if (!isPlacementMode || !pendingImageData) return;

    if (upOrDown === 'up') return;

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

    const hitPos = ray.position;
    const normal = ray.surfaceNormal;

    if (!hitPos || !normal) {
        mp.game.graphics.notify('~r~Nu s-a gasit o suprafata!');
        return;
    }

    const placementPos = {
        x: hitPos.x + normal.x * 0.02,
        y: hitPos.y + normal.y * 0.02,
        z: hitPos.z + normal.z * 0.02
    };

    // Send metadata first, then image in chunks (callRemote has ~32KB limit)
    const meta = JSON.stringify({
        position: placementPos,
        normal: { x: normal.x, y: normal.y, z: normal.z },
        sizeW: previewSizeW,
        sizeH: previewSizeH
    });
    const imgData = pendingImageData;
    const PLACE_CHUNK = 25000;
    const totalChunks = Math.ceil(imgData.length / PLACE_CHUNK);

    mp.events.callRemote('Server_GraffitiPlaceMeta', meta, '' + totalChunks);
    for (let i = 0; i < totalChunks; i++) {
        const chunk = imgData.substring(i * PLACE_CHUNK, (i + 1) * PLACE_CHUNK);
        mp.events.callRemote('Server_GraffitiPlaceChunk', '' + i, chunk);
    }

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
const CHUNK_SIZE = 15000; // 15KB per browser.execute() call
const CHUNK_DELAY = 15;  // ms between chunk sends

function sendChunkedTexture(id, imageData) {
    const totalChunks = Math.ceil(imageData.length / CHUNK_SIZE);
    overlayBrowser.execute(`startTextureUpload(${id}, ${totalChunks});`);
    for (let i = 0; i < totalChunks; i++) {
        const chunk = imageData.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const safe = chunk.replace(/'/g, "\\'");
        const idx = i;
        setTimeout(() => {
            if (overlayBrowser) {
                overlayBrowser.execute(`addTextureChunk(${id}, ${idx}, '${safe}');`);
            }
        }, idx * CHUNK_DELAY);
    }
}

function sendChunkedPreview(imageData) {
    const totalChunks = Math.ceil(imageData.length / CHUNK_SIZE);
    overlayBrowser.execute(`startPreview(${totalChunks});`);
    for (let i = 0; i < totalChunks; i++) {
        const chunk = imageData.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const safe = chunk.replace(/'/g, "\\'");
        const idx = i;
        setTimeout(() => {
            if (overlayBrowser) {
                overlayBrowser.execute(`addPreviewChunk(${idx}, '${safe}');`);
            }
        }, idx * CHUNK_DELAY);
    }
}

function uploadPreviewTexture(imageData) {
    previewTextureReady = false;
    // Route through the same upload queue to prevent concurrent chunk sends
    uploadQueue.unshift({ id: PREVIEW_TEX_ID, imageData: imageData });
    processUploadQueue();
}

// ──────────────────────────────────────────
// UPLOAD QUEUE (sequential, one at a time)
// ──────────────────────────────────────────
let uploadQueue = [];
let isUploading = false;
let uploadSafetyTimer = null;

function processUploadQueue() {
    if (isUploading || uploadQueue.length === 0) return;
    isUploading = true;
    if (uploadSafetyTimer) clearTimeout(uploadSafetyTimer);
    // Safety: if upload doesn't complete in 15s, force-unlock queue
    uploadSafetyTimer = setTimeout(() => {
        isUploading = false;
        uploadSafetyTimer = null;
        processUploadQueue();
    }, 15000);
    const { id, imageData } = uploadQueue.shift();
    sendChunkedTexture(id, imageData);
}

mp.events.add('Graffiti_TextureUploaded', (idStr) => {
    const numId = parseInt(idStr);
    if (numId === PREVIEW_TEX_ID) {
        previewTextureReady = true;
    } else {
        uploadedTextures[numId] = true;
    }
    if (uploadSafetyTimer) { clearTimeout(uploadSafetyTimer); uploadSafetyTimer = null; }
    isUploading = false;
    processUploadQueue();
});

mp.events.add('Graffiti_TextureError', (msg) => {
    if (uploadSafetyTimer) { clearTimeout(uploadSafetyTimer); uploadSafetyTimer = null; }
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
// GRAFFITI SYNC EVENTS (chunked server→client)
// ──────────────────────────────────────────
let pendingGraffiti = {}; // id → { meta, totalChunks, chunks[], received }

// Receive graffiti metadata (without imageData)
mp.events.add('graffitiMeta', (metaJson, totalStr) => {
    try {
        const meta = JSON.parse(metaJson);
        const total = parseInt(totalStr) || 1;
        pendingGraffiti[meta.id] = {
            meta,
            totalChunks: total,
            chunks: new Array(total),
            received: 0
        };
        // Safety cleanup after 60s
        setTimeout(() => { delete pendingGraffiti[meta.id]; }, 60000);
    } catch (e) {}
});

// Receive image data chunk
mp.events.add('graffitiImgChunk', (idStr, idxStr, chunk) => {
    const id = parseInt(idStr);
    const idx = parseInt(idxStr);
    const pending = pendingGraffiti[id];
    if (!pending) return;
    pending.chunks[idx] = chunk;
    pending.received++;
    if (pending.received >= pending.totalChunks) {
        const imageData = pending.chunks.join('');
        const g = pending.meta;
        g.imageData = imageData;
        delete pendingGraffiti[id];
        graffitiData[g.id] = g;
        uploadGraffitiTexture(g.id, g.imageData);
    }
});

// Legacy single-call (backward compat)
mp.events.add('graffitiCreated', (jsonStr) => {
    try {
        const g = JSON.parse(jsonStr);
        if (g.imageData) {
            graffitiData[g.id] = g;
            uploadGraffitiTexture(g.id, g.imageData);
        }
    } catch (e) {}
});

// Legacy chunk load
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
// RENDER HELPERS
// ──────────────────────────────────────────
function drawGraffitiQuad(pos, normal, sizeW, sizeH, rotation, dictName, texName, alpha) {
    const hsW = sizeW / 2;
    const hsH = sizeH / 2;
    const { right, up } = computeQuadVectors(normal, rotation);

    const bl = {
        x: pos.x - right.x * hsW - up.x * hsH,
        y: pos.y - right.y * hsW - up.y * hsH,
        z: pos.z - right.z * hsW - up.z * hsH
    };
    const br = {
        x: pos.x + right.x * hsW - up.x * hsH,
        y: pos.y + right.y * hsW - up.y * hsH,
        z: pos.z + right.z * hsW - up.z * hsH
    };
    const tl = {
        x: pos.x - right.x * hsW + up.x * hsH,
        y: pos.y - right.y * hsW + up.y * hsH,
        z: pos.z - right.z * hsW + up.z * hsH
    };
    const tr = {
        x: pos.x + right.x * hsW + up.x * hsH,
        y: pos.y + right.y * hsW + up.y * hsH,
        z: pos.z + right.z * hsW + up.z * hsH
    };

    mp.game.graphics.drawSpritePoly(
        bl.x, bl.y, bl.z,
        br.x, br.y, br.z,
        tl.x, tl.y, tl.z,
        255, 255, 255, alpha,
        dictName, texName,
        0, 1, 1,
        1, 1, 1,
        0, 0, 1
    );

    mp.game.graphics.drawSpritePoly(
        tl.x, tl.y, tl.z,
        br.x, br.y, br.z,
        tr.x, tr.y, tr.z,
        255, 255, 255, alpha,
        dictName, texName,
        0, 0, 1,
        1, 1, 1,
        1, 0, 1
    );
}

// ──────────────────────────────────────────
// RENDER LOOP — native drawSpritePoly on walls
// ──────────────────────────────────────────
mp.events.add('render', () => {
    const playerPos = mp.players.local.position;

    // Handle placement mode controls (scroll to resize, disable weapon wheel)
    if (isPlacementMode) {
        mp.game.controls.disableControlAction(0, 14, true);
        mp.game.controls.disableControlAction(0, 15, true);
        mp.game.controls.disableControlAction(0, 37, true);

        if (mp.game.controls.isDisabledControlJustPressed(0, 14)) {
            previewSizeW = Math.min(previewSizeW + 0.2, 12.0);
            previewSizeH = Math.min(previewSizeH + 0.2, 12.0);
        }
        if (mp.game.controls.isDisabledControlJustPressed(0, 15)) {
            previewSizeW = Math.max(previewSizeW - 0.2, 0.3);
            previewSizeH = Math.max(previewSizeH - 0.2, 0.3);
        }
    }

    // Render existing graffiti
    for (const id in graffitiData) {
        if (!uploadedTextures[id]) continue;

        const g   = graffitiData[id];
        const pos = g.position;

        const dx = pos.x - playerPos.x;
        const dy = pos.y - playerPos.y;
        const dz = pos.z - playerPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > RENDER_DISTANCE) continue;

        const dictName = 'crtxd_graffiti_' + id;
        const texName  = 'sprite';

        if (!mp.game.graphics.hasStreamedTextureDictLoaded(dictName)) {
            mp.game.graphics.requestStreamedTextureDict(dictName, true);
            continue;
        }

        let alpha = 255;
        if (dist > FADE_START) {
            alpha = Math.floor(255 * (1.0 - (dist - FADE_START) / (RENDER_DISTANCE - FADE_START)));
        }
        if (alpha <= 0) continue;

        drawGraffitiQuad(pos, g.normal, g.sizeW || g.size || GRAFFITI_SIZE, g.sizeH || g.size || GRAFFITI_SIZE, g.rotation || 0, dictName, texName, alpha);
    }

    // 3D Preview on wall during placement mode
    if (isPlacementMode && previewTextureReady) {
        const previewDict = 'crtxd_graffiti_' + PREVIEW_TEX_ID;
        const previewTex = 'sprite';

        if (!mp.game.graphics.hasStreamedTextureDictLoaded(previewDict)) {
            mp.game.graphics.requestStreamedTextureDict(previewDict, true);
        } else {
            const ray = performRaycast();
            if (ray && ray.position && ray.surfaceNormal) {
                const hitPos = {
                    x: ray.position.x + ray.surfaceNormal.x * 0.03,
                    y: ray.position.y + ray.surfaceNormal.y * 0.03,
                    z: ray.position.z + ray.surfaceNormal.z * 0.03
                };
                drawGraffitiQuad(hitPos, ray.surfaceNormal, previewSizeW, previewSizeH, 0, previewDict, previewTex, 180);
            }
        }
    }
});
