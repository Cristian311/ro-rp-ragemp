/**
 * Get admin level from player
 */
function getAdminLevel(player) {
    try {
        if (!player || typeof player.getVariable !== 'function') return 0;

        const levels = [
            player.getVariable('adminLevel'),
            player.getVariable('admin_level'),
            player.getVariable('staffLevel'),
            player.getVariable('staff_level'),
            player.getVariable('level')
        ];

        let maxLevel = 0;
        for (const level of levels) {
            const n = Number(level);
            if (Number.isFinite(n) && n > maxLevel) {
                maxLevel = Math.floor(n);
            }
        }

        const adminFlags = [
            player.getVariable('isAdmin'),
            player.getVariable('admin'),
            player.getVariable('staff')
        ];

        for (const flag of adminFlags) {
            if (flag === true || flag === 1 || flag === '1' || flag === 'true') {
                if (maxLevel < 1) maxLevel = 1;
                break;
            }
        }

        return maxLevel;
    } catch (_) {
        return 0;
    }
}

/**
 * Check if player has admin level
 */
function denyIfNoLevel(player, requiredLevel) {
    const need = Math.floor(Number(requiredLevel) || 1);
    const has = getAdminLevel(player);

    if (has >= need) return false;

    player.outputChatBox(`!{Red}This command requires admin level ${need}+ required. Your level: ${has}.`);
    return true;
}

/**
 * Revive player command
 */
mp.events.addCommand('revive', (player, fullText, targetId) => {
    if (denyIfNoLevel(player, 1)) return;

    if (!targetId) {
        return player.outputChatBox('USAGE: /revive <id>');
    }

    const target = mp.players.at(parseInt(targetId));
    if (!target) {
        return player.outputChatBox('Player not found.');
    }

    // Revive player
    target.spawn(target.position);
    target.health = 200;
    target.armour = 0;

    // Clear death screen
    try { mp.events.call('DeathScreen:ForceClear', target); } catch (e) {}
    try { target.call('setFreeze', [false]); } catch (e) {}

    target.outputChatBox('You have been revived by an admin.');
    player.outputChatBox(`${target.name} has been revived.`);
}, {
    description: 'Revives a player. Usage: /revive <id>'
});

/**
 * Spawn vehicle command
 */
mp.events.addCommand('spawncar', (player, fullText, modelName) => {
    if (denyIfNoLevel(player, 1)) return;

    if (!modelName) {
        return player.outputChatBox('USAGE: /spawncar <model>');
    }

    const normalizedModel = modelName.toLowerCase().trim();
    let modelHash = 0;

    try {
        modelHash = mp.joaat(normalizedModel);
    } catch (e) {
        modelHash = 0;
    }

    if (!modelHash) {
        return player.outputChatBox(`!{Red}Invalid model: ${modelName}`);
    }

    const heading = player.heading;
    const position = player.position;

    try {
        const spawnPos = new mp.Vector3(
            position.x + (3 * Math.sin(-heading * Math.PI / 180)),
            position.y + (3 * Math.cos(-heading * Math.PI / 180)),
            position.z
        );

        const veh = mp.vehicles.new(modelHash, spawnPos, {
            heading: heading,
            numberPlate: 'RAGEMP',
            color: [[255, 255, 255], [255, 255, 255]]
        });

        if (!veh || !mp.vehicles.exists(veh)) {
            return player.outputChatBox(`!{Red}Spawn failed. Model: ${modelName}`);
        }

        veh.dimension = player.dimension;

        try {
            player.putIntoVehicle(veh, 0);
        } catch (_) {}

        player.outputChatBox(`!{#6dffb0}${modelName} vehicle spawned!`);
    } catch (e) {
        console.error('[spawncar] Error:', e);
        player.outputChatBox('!{Red}Could not spawn vehicle.');
    }
}, {
    description: 'Spawns a vehicle. Usage: /spawncar <model>'
});

/**
 * Teleport to waypoint command
 */
const pendingTpRequests = new Set();

mp.events.addCommand('tp', (player) => {
    if (denyIfNoLevel(player, 1)) return;

    pendingTpRequests.add(player.id);
    player.call('AdminTP:RequestWaypoint');
    player.outputChatBox('!{#8ab4ff}Waypoint reading...');

    setTimeout(() => {
        pendingTpRequests.delete(player.id);
    }, 10000);
}, {
    description: 'Teleports to the waypoint location.'
});

mp.events.add('AdminTP:Waypoint', (player, x, y, z) => {
    if (!player || !pendingTpRequests.has(player.id)) return;
    pendingTpRequests.delete(player.id);

    if (denyIfNoLevel(player, 1)) return;

    const tx = Number(x);
    const ty = Number(y);
    const tz = Number(z);

    if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) {
        player.outputChatBox('!{Red}Mark a waypoint on the map and try again.');
        return;
    }

    const targetPos = new mp.Vector3(tx, ty, tz + 2.0);

    try {
        if (player.vehicle) {
            const veh = player.vehicle;
            veh.position = targetPos;
            veh.dimension = player.dimension;
            player.outputChatBox('!{#6dffb0}Vehicle teleported to waypoint position.');
            return;
        }

        player.position = targetPos;
        player.outputChatBox('!{#6dffb0}Teleported to waypoint position.');
    } catch (e) {
        console.error('[AdminTP] Error:', e);
        player.outputChatBox('!{Red}Error during teleportation.');
    }
});

/**
 * Clean up on player quit
 */
mp.events.add('playerQuit', (player) => {
    pendingTpRequests.delete(player.id);
});

/**
 * Set in-game time command
 */
mp.events.addCommand('time', (player, fullText, hourStr, minuteStr) => {
    if (denyIfNoLevel(player, 1)) return;

    if (!hourStr) {
        const h = mp.world.time.hour;
        const m = mp.world.time.minute;
        player.outputChatBox(`!{#8ab4ff}Current time: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}. Usage: /time <hour> [minute]`);
        return;
    }

    const hour = parseInt(hourStr);
    const minute = parseInt(minuteStr) || 0;

    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
        return player.outputChatBox('!{Red}Hour must be between 0 and 23.');
    }
    if (minute < 0 || minute > 59) {
        return player.outputChatBox('!{Red}Minute must be between 0 and 59.');
    }

    mp.world.time.hour = hour;
    mp.world.time.minute = minute;
    mp.world.time.second = 0;

    const timeStr = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
    mp.players.forEach(p => {
        if (p && p.id !== undefined) {
            p.outputChatBox(`!{#6dffb0}[ADMIN] ${player.name} set the time to ${timeStr}.`);
        }
    });
}, {
    description: 'Sets the in-game time. Usage: /time <hour> [minute]'
});

console.log('[COMMANDS] Admin commands loaded!');
