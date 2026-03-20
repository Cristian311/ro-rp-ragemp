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

// ── SPRAY ANIMATION STATE ──
let isSprayAnimating = false;
let pendingPlacement = null;
let sprayTimeout = null;
const SPRAY_DURATION = 5000; // 5 seconds

// ── GRAFFITI VIEW MODE ──
let isGraffitiViewMode = false;

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

// ──────────────────────────────────────────
// SPRAY ANIMATION (5s scenario with spray can)
// ──────────────────────────────────────────
function startSprayAnimation(placementData) {
    if (isSprayAnimating) return;
    isSprayAnimating = true;
    pendingPlacement = placementData;

    const player = mp.players.local;

    // Face the wall (opposite of surface normal)
    const nx = placementData.normal.x;
    const ny = placementData.normal.y;
    const heading = Math.atan2(-nx, ny) * (180 / Math.PI);
    player.setHeading(heading);

    // Use built-in spray graffiti scenario (includes spray can prop + animation)
    player.taskStartScenarioInPlace('WORLD_HUMAN_SPRAY_GRAFFITI', 0, true);

    // After 5 seconds, finish and place the graffiti
    sprayTimeout = setTimeout(() => {
        finishSprayAnimation();
    }, SPRAY_DURATION);
}

function finishSprayAnimation() {
    if (!isSprayAnimating) return;
    sprayTimeout = null;

    // Stop the scenario animation
    mp.players.local.clearTasks();

    // Send placement data to server
    if (pendingPlacement) {
        const meta = JSON.stringify({
            position: pendingPlacement.position,
            normal: pendingPlacement.normal,
            sizeW: previewSizeW,
            sizeH: previewSizeH
        });
        const imgData = pendingPlacement.imageData;
        const PLACE_CHUNK = 25000;
        const totalChunks = Math.ceil(imgData.length / PLACE_CHUNK);

        mp.events.callRemote('Server_GraffitiPlaceMeta', meta, '' + totalChunks);
        for (let i = 0; i < totalChunks; i++) {
            const chunk = imgData.substring(i * PLACE_CHUNK, (i + 1) * PLACE_CHUNK);
            mp.events.callRemote('Server_GraffitiPlaceChunk', '' + i, chunk);
        }
    }

    isSprayAnimating = false;
    pendingPlacement = null;
}

function cancelSprayAnimation() {
    if (!isSprayAnimating) return;
    if (sprayTimeout) { clearTimeout(sprayTimeout); sprayTimeout = null; }

    mp.players.local.clearTasks();

    isSprayAnimating = false;
    pendingPlacement = null;
}

// ──────────────────────────────────────────
// GRAFFITI VIEW/SELECT MODE (admin)
// ──────────────────────────────────────────
function findNearestGraffiti(hitPos) {
    let nearest = null;
    let nearestDist = Infinity;
    for (const id in graffitiData) {
        const g = graffitiData[id];
        const dx = g.position.x - hitPos.x;
        const dy = g.position.y - hitPos.y;
        const dz = g.position.z - hitPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // Detection radius scales with graffiti size (half-diagonal + margin)
        const gW = g.sizeW || g.size || GRAFFITI_SIZE;
        const gH = g.sizeH || g.size || GRAFFITI_SIZE;
        const radius = Math.sqrt(gW * gW + gH * gH) / 2 + 0.5;
        if (dist < radius && dist < nearestDist) {
            nearestDist = dist;
            nearest = g;
        }
    }
    return nearest;
}

mp.events.add('Graffiti_EnterViewMode', () => {
    if (isCanvasOpen || isPlacementMode || isSprayAnimating) return;
    isGraffitiViewMode = true;
    ensureOverlay();
    overlayBrowser.execute("showPlacementUI(true);");
    overlayBrowser.execute("document.getElementById('placementHint').innerHTML = '&#x1F50D; GRAFFITI VIEWER &nbsp;&#x2022;&nbsp; CLICK STANGA = Selecteaza &nbsp;&#x2022;&nbsp; CLICK DREAPTA / ESC = Iesire &nbsp;&#x2022;&nbsp; DEL = Sterge selectat';");
    mp.game.graphics.notify('~g~[GRAFFITI] Mod vizualizare activat.');
});

function exitGraffitiViewMode() {
    isGraffitiViewMode = false;
    viewHighlightId = null;
    viewerPanelOpen = false;
    if (overlayBrowser !== null) {
        overlayBrowser.execute("if(typeof closeViewerPanel==='function')closeViewerPanel();");
        overlayBrowser.execute("showPlacementUI(false);");
        // Restore original hint text
        overlayBrowser.execute("document.getElementById('placementHint').innerHTML = '&#x1F3AF; Tinteste un perete &#x2022; LEFT CLICK = Plaseaza &#x2022; SCROLL = Marime &#x2022; RIGHT CLICK / ESC = Anuleaza';");
    }
    mp.gui.cursor.show(false, false);
    mp.game.graphics.notify('~y~[GRAFFITI] Mod vizualizare dezactivat.');
}

// Track which graffiti is currently highlighted in view mode
let viewHighlightId  = null;
let viewerPanelOpen  = false;

// Receive graffiti info from server — show in CEF viewer panel
mp.events.add('Graffiti_ViewInfoResult', (jsonStr) => {
    try {
        const info = JSON.parse(jsonStr);
        if (info.error) {
            mp.game.graphics.notify('~r~Graffiti-ul nu a fost gasit.');
            return;
        }
        if (overlayBrowser) {
            const safe = JSON.stringify(info).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            overlayBrowser.execute(`showViewerPanel('${safe}');`);
        }
    } catch (e) {
        mp.game.graphics.notify('~r~Eroare la afisare info.');
    }
});

mp.events.add('Graffiti_ViewPanelOpened', () => {
    viewerPanelOpen = true;
    mp.gui.cursor.show(true, true);
});

mp.events.add('Graffiti_ViewPanelClosed', () => {
    viewerPanelOpen = false;
    mp.gui.cursor.show(false, false);
});

mp.events.add('Graffiti_DeleteRequest', (idStr) => {
    mp.events.callRemote('Server_GraffitiDeleteFromViewer', idStr);
});

mp.events.add('Graffiti_DeleteResult', (jsonStr) => {
    try {
        const data = JSON.parse(jsonStr);
        if (data.success) {
            mp.game.graphics.notify(`~g~[GRAFFITI] Graffiti #${data.id} sters cu succes!`);
        } else {
            mp.game.graphics.notify(`~r~[GRAFFITI] ${data.message || 'Eroare la stergere.'}`);
        }
    } catch (e) {}
});

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
    // Graffiti view mode click handling
    if (isGraffitiViewMode) {
        if (upOrDown === 'up') return;
        if (leftOrRight === 1) {
            exitGraffitiViewMode();
            return;
        }
        const ray = performRaycast();
        if (ray && ray.position) {
            const nearest = findNearestGraffiti(ray.position);
            if (nearest) {
                mp.events.callRemote('Server_GraffitiViewInfo', '' + nearest.id);
            } else {
                mp.game.graphics.notify('~r~Nu exista graffiti aproape.');
            }
        }
        return;
    }

    if (!isPlacementMode || !pendingImageData) return;
    if (isSprayAnimating) return;

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

    // Save data and hide placement UI
    const sprayData = {
        position: placementPos,
        normal: { x: normal.x, y: normal.y, z: normal.z },
        imageData: pendingImageData
    };

    isPlacementMode = false;
    previewTextureReady = false;
    if (overlayBrowser) overlayBrowser.execute("showPlacementUI(false);");
    pendingImageData = null;

    // Start spray animation — graffiti will be placed after 5 seconds
    startSprayAnimation(sprayData);
});

// DEL key — delete currently selected/highlighted graffiti in view mode
const KEY_DELETE = 0x2E;
mp.keys.bind(KEY_DELETE, true, () => {
    if (!isGraffitiViewMode) return;
    if (viewerPanelOpen) {
        // Panel open: trigger delete through the CEF panel
        if (overlayBrowser) overlayBrowser.execute("requestDelete();");
    } else if (viewHighlightId !== null) {
        // Graffiti highlighted, no panel: delete directly
        mp.events.callRemote('Server_GraffitiDeleteFromViewer', '' + viewHighlightId);
    }
});

// ESC cancels canvas, spray animation, placement, or view mode
mp.keys.bind(KEY_ESC, true, () => {
    if (isCanvasOpen) {
        closeCanvas();
        return;
    }
    if (isSprayAnimating) {
        cancelSprayAnimation();
        return;
    }
    if (isPlacementMode) {
        exitPlacementMode();
        return;
    }
    if (isGraffitiViewMode) {
        exitGraffitiViewMode();
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
function drawHighlightBorder(pos, normal, sizeW, sizeH, rotation, r, g, b, alpha) {
    const borderThickness = 0.06;
    const ofsW = sizeW / 2 + borderThickness;
    const ofsH = sizeH / 2 + borderThickness;
    const iW = sizeW / 2;
    const iH = sizeH / 2;
    const { right, up } = computeQuadVectors(normal, rotation);
    const nOfs = { x: normal.x * 0.01, y: normal.y * 0.01, z: normal.z * 0.01 };
    const p = { x: pos.x + nOfs.x, y: pos.y + nOfs.y, z: pos.z + nOfs.z };

    // Outer corners
    const obl = { x: p.x - right.x*ofsW - up.x*ofsH, y: p.y - right.y*ofsW - up.y*ofsH, z: p.z - right.z*ofsW - up.z*ofsH };
    const obr = { x: p.x + right.x*ofsW - up.x*ofsH, y: p.y + right.y*ofsW - up.y*ofsH, z: p.z + right.z*ofsW - up.z*ofsH };
    const otl = { x: p.x - right.x*ofsW + up.x*ofsH, y: p.y - right.y*ofsW + up.y*ofsH, z: p.z - right.z*ofsW + up.z*ofsH };
    const otr = { x: p.x + right.x*ofsW + up.x*ofsH, y: p.y + right.y*ofsW + up.y*ofsH, z: p.z + right.z*ofsW + up.z*ofsH };
    // Inner corners
    const ibl = { x: p.x - right.x*iW - up.x*iH, y: p.y - right.y*iW - up.y*iH, z: p.z - right.z*iW - up.z*iH };
    const ibr = { x: p.x + right.x*iW - up.x*iH, y: p.y + right.y*iW - up.y*iH, z: p.z + right.z*iW - up.z*iH };
    const itl = { x: p.x - right.x*iW + up.x*iH, y: p.y - right.y*iW + up.y*iH, z: p.z - right.z*iW + up.z*iH };
    const itr = { x: p.x + right.x*iW + up.x*iH, y: p.y + right.y*iW + up.y*iH, z: p.z + right.z*iW + up.z*iH };

    // Draw 4 border sides as colored polys (both winding orders for double-sided)
    // Bottom
    mp.game.graphics.drawPoly(obl.x,obl.y,obl.z, obr.x,obr.y,obr.z, ibl.x,ibl.y,ibl.z, r,g,b,alpha);
    mp.game.graphics.drawPoly(ibl.x,ibl.y,ibl.z, obr.x,obr.y,obr.z, obl.x,obl.y,obl.z, r,g,b,alpha);
    mp.game.graphics.drawPoly(ibl.x,ibl.y,ibl.z, obr.x,obr.y,obr.z, ibr.x,ibr.y,ibr.z, r,g,b,alpha);
    mp.game.graphics.drawPoly(ibr.x,ibr.y,ibr.z, obr.x,obr.y,obr.z, ibl.x,ibl.y,ibl.z, r,g,b,alpha);
    // Top
    mp.game.graphics.drawPoly(otl.x,otl.y,otl.z, otr.x,otr.y,otr.z, itl.x,itl.y,itl.z, r,g,b,alpha);
    mp.game.graphics.drawPoly(itl.x,itl.y,itl.z, otr.x,otr.y,otr.z, otl.x,otl.y,otl.z, r,g,b,alpha);
    mp.game.graphics.drawPoly(itl.x,itl.y,itl.z, otr.x,otr.y,otr.z, itr.x,itr.y,itr.z, r,g,b,alpha);
    mp.game.graphics.drawPoly(itr.x,itr.y,itr.z, otr.x,otr.y,otr.z, itl.x,itl.y,itl.z, r,g,b,alpha);
    // Left
    mp.game.graphics.drawPoly(obl.x,obl.y,obl.z, otl.x,otl.y,otl.z, ibl.x,ibl.y,ibl.z, r,g,b,alpha);
    mp.game.graphics.drawPoly(ibl.x,ibl.y,ibl.z, otl.x,otl.y,otl.z, obl.x,obl.y,obl.z, r,g,b,alpha);
    mp.game.graphics.drawPoly(ibl.x,ibl.y,ibl.z, otl.x,otl.y,otl.z, itl.x,itl.y,itl.z, r,g,b,alpha);
    mp.game.graphics.drawPoly(itl.x,itl.y,itl.z, otl.x,otl.y,otl.z, ibl.x,ibl.y,ibl.z, r,g,b,alpha);
    // Right
    mp.game.graphics.drawPoly(obr.x,obr.y,obr.z, otr.x,otr.y,otr.z, ibr.x,ibr.y,ibr.z, r,g,b,alpha);
    mp.game.graphics.drawPoly(ibr.x,ibr.y,ibr.z, otr.x,otr.y,otr.z, obr.x,obr.y,obr.z, r,g,b,alpha);
    mp.game.graphics.drawPoly(ibr.x,ibr.y,ibr.z, otr.x,otr.y,otr.z, itr.x,itr.y,itr.z, r,g,b,alpha);
    mp.game.graphics.drawPoly(itr.x,itr.y,itr.z, otr.x,otr.y,otr.z, ibr.x,ibr.y,ibr.z, r,g,b,alpha);
}

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
            const scale = 1.1;
            previewSizeW = Math.min(previewSizeW * scale, 12.0);
            previewSizeH = Math.min(previewSizeH * scale, 12.0);
        }
        if (mp.game.controls.isDisabledControlJustPressed(0, 15)) {
            const scale = 0.9;
            previewSizeW = Math.max(previewSizeW * scale, 0.3);
            previewSizeH = Math.max(previewSizeH * scale, 0.3);
        }
    }

    // Handle graffiti view mode — find hovered graffiti for highlight
    if (isGraffitiViewMode) {
        mp.game.controls.disableControlAction(0, 14, true);
        mp.game.controls.disableControlAction(0, 15, true);
        mp.game.controls.disableControlAction(0, 37, true);

        if (!viewerPanelOpen) {
            // Detect right-click via native controls (more reliable than CEF click event)
            mp.game.controls.disableControlAction(0, 25, true);
            if (mp.game.controls.isDisabledControlJustPressed(0, 25)) {
                exitGraffitiViewMode();
            } else {
                const viewRay = performRaycast();
                if (viewRay && viewRay.position) {
                    const hovered = findNearestGraffiti(viewRay.position);
                    viewHighlightId = hovered ? hovered.id : null;
                } else {
                    viewHighlightId = null;
                }
            }
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

        const gSizeW = g.sizeW || g.size || GRAFFITI_SIZE;
        const gSizeH = g.sizeH || g.size || GRAFFITI_SIZE;
        drawGraffitiQuad(pos, g.normal, gSizeW, gSizeH, g.rotation || 0, dictName, texName, alpha);

        // Green highlight border for hovered graffiti in view mode
        if (isGraffitiViewMode && viewHighlightId !== null && parseInt(id) === viewHighlightId) {
            const pulse = Math.floor(180 + 75 * Math.sin(Date.now() / 200));
            drawHighlightBorder(pos, g.normal, gSizeW, gSizeH, g.rotation || 0, 0, 255, 100, pulse);
        }
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
