// client_packages/hud/index.js — Player info HUD (name, money, online, time)

let hudBrowser = null;
let hudReady = false;

function createHud() {
    if (hudBrowser) return;
    hudBrowser = mp.browsers.new('package://hud/index.html');
    hudReady = true;
}

function destroyHud() {
    if (hudBrowser) {
        hudBrowser.destroy();
        hudBrowser = null;
        hudReady = false;
    }
}

// Create HUD when player is ready
mp.events.add('guiReady', () => {
    createHud();
});

// Fallback: create on first render if guiReady didn't fire + freecam visibility check
let hudCreated = false;
let lastHudDisplay = '';
mp.events.add('render', () => {
    if (!hudCreated) {
        hudCreated = true;
        createHud();
    }
    if (!hudBrowser) return;
    const shouldShow = !hudManualHidden && !global.freecamActive;
    const display = shouldShow ? 'flex' : 'none';
    if (display !== lastHudDisplay) {
        lastHudDisplay = display;
        hudBrowser.execute(`document.getElementById('hud-container').style.display = '${display}'`);
    }
});

// ── Server sends initial data ──
mp.events.add('hud:init', (name, money, playerCount) => {
    if (!hudBrowser) return;
    hudBrowser.execute(`setName('${name.replace(/'/g, "\\'")}')`);
    hudBrowser.execute(`setMoney(${Number(money) || 0})`);
    hudBrowser.execute(`setPlayers(${Number(playerCount) || 0})`);
});

// ── Money update ──
mp.events.add('hud:updateMoney', (amount) => {
    if (!hudBrowser) return;
    hudBrowser.execute(`setMoney(${Number(amount) || 0})`);
});

// ── Player count update ──
mp.events.add('hud:updatePlayers', (count) => {
    if (!hudBrowser) return;
    hudBrowser.execute(`setPlayers(${Number(count) || 0})`);
});

// ── Toggle visibility ──
let hudManualHidden = false; // F7 toggle state

function updateHudVisibility() {
    if (!hudBrowser) return;
    const shouldShow = !hudManualHidden && !global.freecamActive;
    hudBrowser.execute(`document.getElementById('hud-container').style.display = '${shouldShow ? 'flex' : 'none'}'`);
}

mp.events.add('hud:toggle', (visible) => {
    hudManualHidden = !visible;
    updateHudVisibility();
});

// F7 toggle — triggered from binds/index.js
mp.events.add('hud:f7toggle', () => {
    hudManualHidden = !hudManualHidden;
    updateHudVisibility();
});

console.log('[HUD] Client-side HUD loaded.');
