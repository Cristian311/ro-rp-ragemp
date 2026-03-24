console.log('[Commands client] loaded');
let paletteBrowser = null;

function ensurePalette(){
    if (paletteBrowser) return;
    try{ paletteBrowser = mp.browsers.new('package://commands/command_palette.html'); console.log('[Commands] palette browser created'); }catch(e){ console.error('[Commands] could not create browser', e); }
}

const BLOCKED_DEFAULT_CONTROLS = [37]; // INPUT_SELECT_WEAPON (TAB)

mp.events.add('render', () => {
    try {
        for (let group = 0; group <= 2; group++) {
            for (let i = 0; i < BLOCKED_DEFAULT_CONTROLS.length; i++) {
                mp.game.controls.disableControlAction(group, BLOCKED_DEFAULT_CONTROLS[i], true);
            }
        }
    } catch (_) {}
});

mp.keys.bind(0x09, false, () => { // Tab key
    try{
        if (global.chatInputActive) return;
        ensurePalette();
        mp.events.callRemote('RequestCommandList');
        setTimeout(()=>{ try{ paletteBrowser && paletteBrowser.execute('window.palette && window.palette.show()'); }catch(e){} }, 120);
    }catch(e){ console.error('[Commands] open error', e); }
});

mp.events.add('CommandList', (json) => {
    try{
        const list = JSON.parse(json || '[]');
        if (paletteBrowser) paletteBrowser.execute('window.palette && window.palette.setItems(' + JSON.stringify(list) + ')');
    }catch(e){ console.error('[Commands] parse list', e); }
});

mp.events.add('AdminTP:RequestWaypoint', () => {
    try {
        const waypointBlip = mp.game.ui.getFirstBlipInfoId(8);
        if (!waypointBlip || !mp.game.ui.doesBlipExist(waypointBlip)) {
            mp.events.callRemote('AdminTP:Waypoint', NaN, NaN, NaN);
            return;
        }

        const coord = mp.game.ui.getBlipInfoIdCoord(waypointBlip);
        const x = Number(coord && coord.x);
        const y = Number(coord && coord.y);
        const z = Number(coord && coord.z);

        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            mp.events.callRemote('AdminTP:Waypoint', NaN, NaN, NaN);
            return;
        }

        mp.events.callRemote('AdminTP:Waypoint', x, y, z);
    } catch (e) {
        console.error('[AdminTP] waypoint fetch failed', e);
        mp.events.callRemote('AdminTP:Waypoint', NaN, NaN, NaN);
    }
});
