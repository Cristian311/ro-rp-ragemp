/**
 * Moving Stalker Radar - Server Side
 * Comenzi: /stalker ON | OFF | LOCK | UNLOCK | FAST
 */

// ──────────────────────────────────────────
// /stalker COMMAND
// ──────────────────────────────────────────
mp.events.addCommand('stalker', (player, _, ...args) => {
    const subcmd = args[0] ? String(args[0]).toUpperCase().trim() : '';

    if (!subcmd || !['ON', 'OFF', 'LOCK', 'UNLOCK', 'FAST', 'FRONT', 'REAR'].includes(subcmd)) {
        global.chatSend(player, '!{f59e0b}[STALKER] !{FFFFFF}Comenzi:');
        global.chatSend(player, '!{9ca3af}/stalker ON !{FFFFFF}- Porneste radarul');
        global.chatSend(player, '!{9ca3af}/stalker OFF !{FFFFFF}- Opreste radarul');
        global.chatSend(player, '!{9ca3af}/stalker LOCK !{FFFFFF}- Blocheaza citirile curente');
        global.chatSend(player, '!{9ca3af}/stalker UNLOCK !{FFFFFF}- Deblocheaza citirile');
        global.chatSend(player, '!{9ca3af}/stalker FAST !{FFFFFF}- Toggle mod FAST (cel mai rapid)');
        global.chatSend(player, '!{9ca3af}/stalker FRONT !{FFFFFF}- Toggle antena fata');
        global.chatSend(player, '!{9ca3af}/stalker REAR !{FFFFFF}- Toggle antena spate');
        return;
    }

    switch (subcmd) {
        case 'ON': {
            if (!player.vehicle) {
                global.chatSend(player, '!{ef4444}[STALKER] !{FFFFFF}Trebuie sa fii intr-un vehicul!');
                return;
            }
            // Store state on player
            player._stalkerActive = true;
            player._stalkerFast = false;
            player._stalkerFrontXmit = true;
            player._stalkerRearXmit = true;
            player.call('stalker:toggle', [true]);
            global.chatSend(player, '!{f59e0b}[STALKER] !{FFFFFF}Radar Stalker !{22c55e}pornit!{FFFFFF}. Antene: Fata + Spate.');
            break;
        }

        case 'OFF': {
            player._stalkerActive = false;
            player.call('stalker:toggle', [false]);
            global.chatSend(player, '!{f59e0b}[STALKER] !{FFFFFF}Radar Stalker !{ef4444}oprit!{FFFFFF}.');
            break;
        }

        case 'LOCK': {
            if (!player._stalkerActive) {
                global.chatSend(player, '!{ef4444}[STALKER] !{FFFFFF}Radarul nu este pornit!');
                return;
            }
            player.call('stalker:lock', []);
            global.chatSend(player, '!{f59e0b}[STALKER] !{FFFFFF}Citiri !{ff5252}LOCKED!{FFFFFF}.');
            break;
        }

        case 'UNLOCK': {
            if (!player._stalkerActive) {
                global.chatSend(player, '!{ef4444}[STALKER] !{FFFFFF}Radarul nu este pornit!');
                return;
            }
            player.call('stalker:unlock', []);
            global.chatSend(player, '!{f59e0b}[STALKER] !{FFFFFF}Citiri !{22c55e}deblocate!{FFFFFF}.');
            break;
        }

        case 'FAST': {
            if (!player._stalkerActive) {
                global.chatSend(player, '!{ef4444}[STALKER] !{FFFFFF}Radarul nu este pornit!');
                return;
            }
            player._stalkerFast = !player._stalkerFast;
            player.call('stalker:fast', [player._stalkerFast]);
            const stateText = player._stalkerFast
                ? '!{22c55e}activat'
                : '!{ef4444}dezactivat';
            global.chatSend(player, `!{f59e0b}[STALKER] !{FFFFFF}Mod FAST ${stateText}!{FFFFFF}.`);
            break;
        }

        case 'FRONT': {
            if (!player._stalkerActive) {
                global.chatSend(player, '!{ef4444}[STALKER] !{FFFFFF}Radarul nu este pornit!');
                return;
            }
            player._stalkerFrontXmit = !player._stalkerFrontXmit;
            player.call('stalker:xmit', ['front', player._stalkerFrontXmit]);
            const stateText = player._stalkerFrontXmit
                ? '!{22c55e}activa'
                : '!{ef4444}dezactivata';
            global.chatSend(player, `!{f59e0b}[STALKER] !{FFFFFF}Antena fata ${stateText}!{FFFFFF}.`);
            break;
        }

        case 'REAR': {
            if (!player._stalkerActive) {
                global.chatSend(player, '!{ef4444}[STALKER] !{FFFFFF}Radarul nu este pornit!');
                return;
            }
            player._stalkerRearXmit = !player._stalkerRearXmit;
            player.call('stalker:xmit', ['rear', player._stalkerRearXmit]);
            const stateText = player._stalkerRearXmit
                ? '!{22c55e}activa'
                : '!{ef4444}dezactivata';
            global.chatSend(player, `!{f59e0b}[STALKER] !{FFFFFF}Antena spate ${stateText}!{FFFFFF}.`);
            break;
        }
    }
}, {
    description: 'Radar Moving Stalker — /stalker ON|OFF|LOCK|UNLOCK|FAST|FRONT|REAR'
});

// Cleanup on disconnect
mp.events.add('playerQuit', (player) => {
    player._stalkerActive = false;
});

// Keybind toggle notification from client (Numpad 0)
mp.events.add('stalker:notifyToggle', (player, state) => {
    if (state) {
        if (!player.vehicle) return;
        player._stalkerActive = true;
        global.chatSend(player, '!{f59e0b}[STALKER] !{FFFFFF}Radar Stalker !{22c55e}pornit!{FFFFFF}. Keybinds: Num0=ON/OFF, Num1=LOCK, Num2=FAST, Num4=Front, Num5=Rear');
    } else {
        player._stalkerActive = false;
        global.chatSend(player, '!{f59e0b}[STALKER] !{FFFFFF}Radar Stalker !{ef4444}oprit!{FFFFFF}.');
    }
});

console.log('[STALKER] Server-side loaded.');
