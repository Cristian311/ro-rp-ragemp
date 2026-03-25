/**
 * Get admin level from player
 */
function getAdminLevel(player) {
    try {
        if (!player || typeof player.getVariable !== 'function') return 0;
        const lvl = player.getVariable('adminLevel');
        const n = Number(lvl);
        return Number.isFinite(n) ? Math.floor(n) : 0;
    } catch (_) {
        return 0;
    }
}

/**
 * Check if player has admin level (+ optional duty check)
 */
function denyIfNoLevel(player, requiredLevel, skipDutyCheck) {
    const need = Math.floor(Number(requiredLevel) || 1);
    const has = getAdminLevel(player);

    if (has < need) {
        chat(player, `!{FF0000}Aceasta comanda necesita admin level ${need}+. Level-ul tau: ${has}.`);
        return true;
    }

    // Duty check — level 7 bypasses, /aduty and /adminlevel skip this
    if (!skipDutyCheck && has < 7) {
        const onDuty = player.getVariable('adminDuty') || false;
        if (!onDuty) {
            chat(player, '!{FF0000}Trebuie sa fii on-duty! Foloseste /aduty');
            return true;
        }
    }

    return false;
}

/**
 * Parse args from fullText safely (fallback if RAGE:MP doesn't split)
 */
function parseArgs(fullText) {
    if (!fullText || typeof fullText !== 'string') return [];
    return fullText.trim().split(/\s+/);
}

/**
 * Reliable chat — uses global.chatSend which calls player.call('chat:receive', ...)
 * directly, bypassing the potentially broken native outputChatBox.
 */
function chat(p, msg) {
    if (global.chatSend) global.chatSend(p, msg);
}
function chatAll(msg) {
    if (global.chatBroadcast) global.chatBroadcast(msg);
}

/**
 * Revive player command
 */
mp.events.addCommand('revive', (player, fullText, targetId) => {
    if (denyIfNoLevel(player, 1)) return;

    const args = parseArgs(fullText);
    const id = targetId || args[0];

    if (!id) {
        return chat(player, '!{8ab4ff}Foloseste: /revive [id]');
    }

    const target = mp.players.at(parseInt(id));
    if (!target) {
        return chat(player, '!{FF0000}Jucatorul nu a fost gasit.');
    }

    // Revive player
    target.spawn(target.position);
    target.health = 200;
    target.armour = 0;

    // Clear death screen
    try { mp.events.call('DeathScreen:ForceClear', target); } catch (e) {}
    try { target.call('setFreeze', [false]); } catch (e) {}

    chat(target, '!{6dffb0}[ADMIN] Ai fost inviat de un admin.');
    chat(player, `!{6dffb0}${target.name} a fost inviat.`);
}, {
    description: 'Inviaza un jucator. /revive [id]'
});

/**
 * Spawn vehicle command
 */
mp.events.addCommand('spawncar', (player, fullText, modelName) => {
    if (denyIfNoLevel(player, 1)) return;

    const args = parseArgs(fullText);
    const model = modelName || args[0];

    if (!model) {
        return chat(player, '!{8ab4ff}Foloseste: /spawncar [model]');
    }

    const normalizedModel = model.toLowerCase().trim();
    let modelHash = 0;

    try {
        modelHash = mp.joaat(normalizedModel);
    } catch (e) {
        modelHash = 0;
    }

    if (!modelHash) {
        return chat(player, `!{FF0000}Model invalid: ${model}`);
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
            return chat(player, `!{FF0000}Spawn esuat. Model: ${model}`);
        }

        veh.dimension = player.dimension;

        try {
            player.putIntoVehicle(veh, 0);
        } catch (_) {}

        chat(player, `!{6dffb0}Vehicul ${model} spawnat!`);
    } catch (e) {
        console.error('[spawncar] Error:', e);
        chat(player, '!{FF0000}Nu s-a putut spawna vehiculul.');
    }
}, {
    description: 'Spawneaza un vehicul. /spawncar [model]'
});

/**
 * Teleport to waypoint command
 */
const pendingTpRequests = new Set();

mp.events.addCommand('tp', (player) => {
    if (denyIfNoLevel(player, 1)) return;

    pendingTpRequests.add(player.id);
    player.call('AdminTP:RequestWaypoint');
    chat(player, '!{8ab4ff}Se citeste waypoint-ul...');

    setTimeout(() => {
        pendingTpRequests.delete(player.id);
    }, 10000);
}, {
    description: 'Teleportare la waypoint. /tp'
});

mp.events.add('AdminTP:Waypoint', (player, x, y, z) => {
    if (!player || !pendingTpRequests.has(player.id)) return;
    pendingTpRequests.delete(player.id);

    if (denyIfNoLevel(player, 1)) return;

    const tx = Number(x);
    const ty = Number(y);
    const tz = Number(z);

    if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) {
        chat(player, '!{FF0000}Pune un waypoint pe harta si incearca din nou.');
        return;
    }

    const targetPos = new mp.Vector3(tx, ty, tz + 2.0);

    try {
        if (player.vehicle) {
            const veh = player.vehicle;
            veh.position = targetPos;
            veh.dimension = player.dimension;
            chat(player, '!{6dffb0}Vehicul teleportat la waypoint.');
            return;
        }

        player.position = targetPos;
        chat(player, '!{6dffb0}Teleportat la waypoint.');
    } catch (e) {
        console.error('[AdminTP] Error:', e);
        chat(player, '!{FF0000}Eroare la teleportare.');
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

    const args = parseArgs(fullText);
    const hour_ = hourStr || args[0];
    const min_  = minuteStr || args[1];

    if (!hour_) {
        const h = mp.world.time.hour;
        const m = mp.world.time.minute;
        chat(player, `!{8ab4ff}Ora curenta: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}. Foloseste: /time [ora] [minut]`);
        return;
    }

    const hour = parseInt(hour_);
    const minute = parseInt(min_) || 0;

    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
        return chat(player, '!{FF0000}Ora trebuie sa fie intre 0 si 23.');
    }
    if (minute < 0 || minute > 59) {
        return chat(player, '!{FF0000}Minutele trebuie sa fie intre 0 si 59.');
    }

    mp.world.time.hour = hour;
    mp.world.time.minute = minute;
    mp.world.time.second = 0;

    const timeStr = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
    chatAll(`!{6dffb0}[ADMIN] ${player.name} a setat ora la ${timeStr}.`);
}, {
    description: 'Seteaza ora in joc. /time [ora] [minut]'
});

console.log('[COMMANDS] Admin commands loaded!');

// ──────────────────────────────────────────
// ADMIN DUTY
// ──────────────────────────────────────────

/**
 * /aduty — Toggle admin duty (on/off)
 */
mp.events.addCommand('aduty', (player) => {
    if (denyIfNoLevel(player, 1, true)) return;

    const current = player.getVariable('adminDuty') || false;
    const newState = !current;
    player.setVariable('adminDuty', newState);

    const lvl = getAdminLevel(player);

    if (newState) {
        chat(player, '!{00FF88}[ADMIN] !{FFFFFF}Esti acum !{00FF88}ON-DUTY!{FFFFFF}. Comenzile admin sunt active.');
        chatAll(`!{FF4444}[ADMIN] !{FFD700}${player.name} !{FFFFFF}este acum !{00FF88}on-duty !{AAAAAA}(Level ${lvl})`);
        console.log(`[ADMIN] ${player.name} (level ${lvl}) went ON-DUTY`);
    } else {
        // Turn off fly mode if active
        player.call('admin:stopFly');

        chat(player, '!{FF4444}[ADMIN] !{FFFFFF}Esti acum !{FF4444}OFF-DUTY!{FFFFFF}. Comenzile admin sunt dezactivate.');
        chatAll(`!{FF4444}[ADMIN] !{FFD700}${player.name} !{FFFFFF}este acum !{FF4444}off-duty`);
        console.log(`[ADMIN] ${player.name} (level ${lvl}) went OFF-DUTY`);
    }
}, { description: 'Toggle admin duty. /aduty' });

// ──────────────────────────────────────────
// FLY MODE
// ──────────────────────────────────────────

/**
 * /fly — Toggle fly mode (admin only, on-duty)
 */
mp.events.addCommand('fly', (player) => {
    if (denyIfNoLevel(player, 1)) return;
    player.call('admin:toggleFly');
}, { description: 'Toggle fly mode. Backspace = iesire. /fly' });

// ──────────────────────────────────────────
// ADDITIONAL ADMIN COMMANDS
// ──────────────────────────────────────────

/**
 * /goto [id] — Teleport to another player
 */
mp.events.addCommand('goto', (player, fullText, targetId) => {
    if (denyIfNoLevel(player, 1)) return;

    const args = parseArgs(fullText);
    const id = targetId || args[0];

    if (!id) return chat(player, '!{8ab4ff}Foloseste: /goto [id]');

    const target = mp.players.at(parseInt(id));
    if (!target) return chat(player, '!{FF0000}Jucatorul nu a fost gasit.');

    const pos = target.position;
    player.position = new mp.Vector3(pos.x + 2, pos.y, pos.z);
    chat(player, `!{6dffb0}Te-ai teleportat la ${target.name}.`);
}, { description: 'Teleport la un jucator. /goto [id]' });

/**
 * /gethere [id] — Bring player to you
 */
mp.events.addCommand('gethere', (player, fullText, targetId) => {
    if (denyIfNoLevel(player, 2)) return;

    const args = parseArgs(fullText);
    const id = targetId || args[0];

    if (!id) return chat(player, '!{8ab4ff}Foloseste: /gethere [id]');

    const target = mp.players.at(parseInt(id));
    if (!target) return chat(player, '!{FF0000}Jucatorul nu a fost gasit.');

    const pos = player.position;
    target.position = new mp.Vector3(pos.x + 2, pos.y, pos.z);
    chat(target, `!{FFD700}[ADMIN] ${player.name} te-a adus la el.`);
    chat(player, `!{6dffb0}${target.name} a fost adus la tine.`);
}, { description: 'Aduce un jucator la tine. /gethere [id]' });

/**
 * /freeze [id] — Freeze a player
 */
mp.events.addCommand('freeze', (player, fullText, targetId) => {
    if (denyIfNoLevel(player, 2)) return;

    const args = parseArgs(fullText);
    const id = targetId || args[0];

    if (!id) return chat(player, '!{8ab4ff}Foloseste: /freeze [id]');

    const target = mp.players.at(parseInt(id));
    if (!target) return chat(player, '!{FF0000}Jucatorul nu a fost gasit.');

    target.call('setFreeze', [true]);
    target.setVariable('isFrozen', true);
    chat(target, '!{FF0000}[ADMIN] Ai fost inghetat de un admin.');
    chat(player, `!{6dffb0}${target.name} a fost inghetat.`);
}, { description: 'Ingheata un jucator. /freeze [id]' });

/**
 * /unfreeze [id] — Unfreeze a player
 */
mp.events.addCommand('unfreeze', (player, fullText, targetId) => {
    if (denyIfNoLevel(player, 2)) return;

    const args = parseArgs(fullText);
    const id = targetId || args[0];

    if (!id) return chat(player, '!{8ab4ff}Foloseste: /unfreeze [id]');

    const target = mp.players.at(parseInt(id));
    if (!target) return chat(player, '!{FF0000}Jucatorul nu a fost gasit.');

    target.call('setFreeze', [false]);
    target.setVariable('isFrozen', false);
    chat(target, '!{6dffb0}[ADMIN] Ai fost dezghetat de un admin.');
    chat(player, `!{6dffb0}${target.name} a fost dezghetat.`);
}, { description: 'Dezgheata un jucator. /unfreeze [id]' });

/**
 * /kick [id] [motiv] — Kick a player
 */
mp.events.addCommand('kick', (player, fullText) => {
    if (denyIfNoLevel(player, 3)) return;

    const args = parseArgs(fullText);
    const id = args[0];
    const reason = args.length > 1 ? args.slice(1).join(' ') : 'Fara motiv specificat';

    if (!id) return chat(player, '!{8ab4ff}Foloseste: /kick [id] [motiv]');

    const target = mp.players.at(parseInt(id));
    if (!target) return chat(player, '!{FF0000}Jucatorul nu a fost gasit.');

    const targetName = target.name;

    chatAll(`!{FF0000}[ADMIN] ${targetName} a fost dat kick de ${player.name}. Motiv: ${reason}`);

    target.kick(reason);
    console.log(`[ADMIN] ${player.name} a dat kick lui ${targetName}. Motiv: ${reason}`);
}, { description: 'Da kick unui jucator. /kick [id] [motiv]' });

/**
 * /sethp [id] [hp] — Set player health
 */
mp.events.addCommand('sethp', (player, fullText, targetId, hpStr) => {
    if (denyIfNoLevel(player, 1)) return;

    const args = parseArgs(fullText);
    const id = targetId || args[0];
    const hp_ = hpStr || args[1];

    if (!id || !hp_) return chat(player, '!{8ab4ff}Foloseste: /sethp [id] [hp]');

    const target = mp.players.at(parseInt(id));
    if (!target) return chat(player, '!{FF0000}Jucatorul nu a fost gasit.');

    const hp = Math.max(0, Math.min(200, parseInt(hp_) || 100));
    target.health = hp;
    chat(player, `!{6dffb0}HP-ul lui ${target.name} a fost setat la ${hp}.`);
    chat(target, `!{FFD700}[ADMIN] HP-ul tau a fost setat la ${hp}.`);
}, { description: 'Seteaza HP-ul unui jucator. /sethp [id] [hp]' });

/**
 * /setarmor [id] [armor] — Set player armor
 */
mp.events.addCommand('setarmor', (player, fullText, targetId, armorStr) => {
    if (denyIfNoLevel(player, 1)) return;

    const args = parseArgs(fullText);
    const id = targetId || args[0];
    const arm_ = armorStr || args[1];

    if (!id || !arm_) return chat(player, '!{8ab4ff}Foloseste: /setarmor [id] [armura]');

    const target = mp.players.at(parseInt(id));
    if (!target) return chat(player, '!{FF0000}Jucatorul nu a fost gasit.');

    const armor = Math.max(0, Math.min(100, parseInt(arm_) || 100));
    target.armour = armor;
    chat(player, `!{6dffb0}Armura lui ${target.name} a fost setata la ${armor}.`);
    chat(target, `!{FFD700}[ADMIN] Armura ta a fost setata la ${armor}.`);
}, { description: 'Seteaza armura unui jucator. /setarmor [id] [armura]' });

/**
 * /invisible — Toggle admin invisibility
 */
mp.events.addCommand('invisible', (player) => {
    if (denyIfNoLevel(player, 3)) return;

    const isInvis = player.getVariable('isInvisible') || false;
    if (isInvis) {
        player.alpha = 255;
        player.setVariable('isInvisible', false);
        chat(player, '!{6dffb0}[ADMIN] Esti din nou vizibil.');
    } else {
        player.alpha = 0;
        player.setVariable('isInvisible', true);
        chat(player, '!{6dffb0}[ADMIN] Esti invizibil acum.');
    }
}, { description: 'Devii invizibil/vizibil. /invisible' });

/**
 * /announce [mesaj] — Server announcement
 */
mp.events.addCommand('announce', (player, fullText) => {
    if (denyIfNoLevel(player, 3)) return;
    const msg = fullText ? fullText.trim() : '';
    if (!msg) return chat(player, '!{8ab4ff}Foloseste: /announce [mesaj]');

    chatAll(`!{FF4444}[ANUNT] !{FFFFFF}${msg}`);
    console.log(`[ANNOUNCE] ${player.name}: ${msg}`);
}, { description: 'Trimite un anunt pe server. /announce [mesaj]' });

/**
 * /weather [id] — Set weather
 */
mp.events.addCommand('weather', (player, fullText, weatherId) => {
    if (denyIfNoLevel(player, 2)) return;

    const args = parseArgs(fullText);
    const wid = weatherId || args[0];

    if (!wid) return chat(player, '!{8ab4ff}Foloseste: /weather [0-14]');

    const id = parseInt(wid);
    if (!Number.isFinite(id) || id < 0 || id > 14) {
        return chat(player, '!{FF0000}Weather ID trebuie sa fie intre 0 si 14.');
    }

    mp.world.weather = id;
    chatAll(`!{6dffb0}[ADMIN] ${player.name} a schimbat vremea la ID ${id}.`);
}, { description: 'Schimba vremea. /weather [0-14]' });

/**
 * /noclip — Toggle noclip for admin (uses freecam)
 */
mp.events.addCommand('noclip', (player) => {
    if (denyIfNoLevel(player, 2)) return;
    player.call('camera:toggle');
    chat(player, '!{6dffb0}[ADMIN] Noclip toggled.');
}, { description: 'Toggle noclip (freecam). /noclip' });

/**
 * /adminlevel [id] — Check a player admin level
 */
mp.events.addCommand('adminlevel', (player, fullText, targetId) => {
    if (denyIfNoLevel(player, 1, true)) return;

    const args = parseArgs(fullText);
    const id = targetId || args[0];

    let target;
    if (id) {
        target = mp.players.at(parseInt(id));
    } else {
        target = player;
    }
    if (!target) return chat(player, '!{FF0000}Jucatorul nu a fost gasit.');

    const lvl = getAdminLevel(target);
    chat(player, `!{8ab4ff}[ADMIN] ${target.name} — Admin Level: ${lvl}`);
}, { description: 'Verifica admin level. /adminlevel [id]' });

/**
 * /players — List all online players
 */
mp.events.addCommand('players', (player) => {
    if (denyIfNoLevel(player, 1)) return;

    let count = 0;
    chat(player, '!{8ab4ff}=== Jucatori Online ===');
    mp.players.forEach(p => {
        if (p && p.id !== undefined) {
            const aLvl = getAdminLevel(p);
            const tag = aLvl > 0 ? ` !{FFD700}[Admin ${aLvl}]` : '';
            chat(player, `!{CCCCCC}ID ${p.id}: !{FFFFFF}${p.name}${tag}`);
            count++;
        }
    });
    chat(player, `!{8ab4ff}Total: ${count} jucatori`);
}, { description: 'Lista jucatori online. /players' });

/**
 * /setadmin [id] [level] — Set admin level (saved to database)
 */
mp.events.addCommand('setadmin', (player, fullText, targetId, levelStr) => {
    if (denyIfNoLevel(player, 7)) return;

    const args = parseArgs(fullText);
    const id = targetId || args[0];
    const lvl_ = levelStr || args[1];

    if (!id || !lvl_) return chat(player, '!{8ab4ff}Foloseste: /setadmin [id] [level 0-7]');

    const target = mp.players.at(parseInt(id));
    if (!target) return chat(player, '!{FF0000}Jucatorul nu a fost gasit.');

    const level = parseInt(lvl_);
    if (!Number.isFinite(level) || level < 0 || level > 7) {
        return chat(player, '!{FF0000}Level-ul trebuie sa fie intre 0 si 7.');
    }

    // Save to database
    if (global.adminDb) {
        global.adminDb.setAdmin(target.name, level, player.name);
    }

    // Apply immediately
    target.setVariable('adminLevel', level);

    if (level > 0) {
        chat(target, `!{FFD700}[ADMIN] Ai primit admin level ${level} de la ${player.name}.`);
        chat(player, `!{6dffb0}[ADMIN] ${target.name} a primit admin level ${level}. Salvat in baza de date.`);
        console.log(`[ADMIN DB] ${player.name} i-a dat admin level ${level} lui ${target.name}`);
    } else {
        chat(target, `!{FF0000}[ADMIN] Ti-a fost revocat admin-ul de ${player.name}.`);
        chat(player, `!{6dffb0}[ADMIN] ${target.name} nu mai este admin. Sters din baza de date.`);
        console.log(`[ADMIN DB] ${player.name} i-a revocat admin-ul lui ${target.name}`);
    }
}, { description: 'Seteaza admin level (salvat in DB). /setadmin [id] [level 0-7]' });

/**
 * /removeadmin [id] — Remove admin (saved to database)
 */
mp.events.addCommand('removeadmin', (player, fullText, targetId) => {
    if (denyIfNoLevel(player, 7)) return;

    const args = parseArgs(fullText);
    const id = targetId || args[0];

    if (!id) return chat(player, '!{8ab4ff}Foloseste: /removeadmin [id]');

    const target = mp.players.at(parseInt(id));
    if (!target) return chat(player, '!{FF0000}Jucatorul nu a fost gasit.');

    if (global.adminDb) {
        global.adminDb.setAdmin(target.name, 0, player.name);
    }
    target.setVariable('adminLevel', 0);

    chat(target, `!{FF0000}[ADMIN] Ti-a fost revocat admin-ul de ${player.name}.`);
    chat(player, `!{6dffb0}[ADMIN] ${target.name} nu mai este admin. Sters din baza de date.`);
    console.log(`[ADMIN DB] ${player.name} i-a sters admin-ul lui ${target.name}`);
}, { description: 'Sterge admin (salvat in DB). /removeadmin [id]' });

/**
 * /admins — List all admins from database
 */
mp.events.addCommand('admins', (player) => {
    if (denyIfNoLevel(player, 1)) return;

    const db = global.adminDb ? global.adminDb.getAll() : {};
    const keys = Object.keys(db);

    if (keys.length === 0) {
        chat(player, '!{8ab4ff}[ADMIN] Nu exista admini in baza de date.');
        return;
    }

    chat(player, '!{8ab4ff}=== Admin Database ===');
    keys.forEach(name => {
        const entry = db[name];
        // Check if online
        let online = false;
        mp.players.forEach(p => {
            if (p && p.name && p.name.toLowerCase() === name) online = true;
        });
        const status = online ? '!{00FF88}[ONLINE]' : '!{888888}[OFFLINE]';
        chat(player, `${status} !{FFFFFF}${name} !{FFD700}(Level ${entry.level}) !{888888}adaugat de ${entry.addedBy}`);
    });
    chat(player, `!{8ab4ff}Total: ${keys.length} admini`);
}, { description: 'Lista adminilor din baza de date. /admins' });

/**
 * /setadminoffline [name] [level] — Set admin for offline player
 */
mp.events.addCommand('setadminoffline', (player, fullText, targetName, levelStr) => {
    if (denyIfNoLevel(player, 7)) return;

    const args = parseArgs(fullText);
    const name_ = targetName || args[0];
    const lvl_  = levelStr || args[1];

    if (!name_ || !lvl_) return chat(player, '!{8ab4ff}Foloseste: /setadminoffline [nume] [level 0-7]');

    const level = parseInt(lvl_);
    if (!Number.isFinite(level) || level < 0 || level > 7) {
        return chat(player, '!{FF0000}Level-ul trebuie sa fie intre 0 si 7.');
    }

    if (global.adminDb) {
        global.adminDb.setAdmin(name_, level, player.name);
    }

    // If target is online, apply immediately
    mp.players.forEach(p => {
        if (p && p.name && p.name.toLowerCase() === name_.toLowerCase()) {
            p.setVariable('adminLevel', level);
            if (level > 0) {
                chat(p, `!{FFD700}[ADMIN] Ai primit admin level ${level} de la ${player.name}.`);
            } else {
                chat(p, `!{FF0000}[ADMIN] Ti-a fost revocat admin-ul de ${player.name}.`);
            }
        }
    });

    if (level > 0) {
        chat(player, `!{6dffb0}[ADMIN] ${name_} a primit admin level ${level}. Salvat in baza de date.`);
    } else {
        chat(player, `!{6dffb0}[ADMIN] ${name_} a fost sters din baza de date.`);
    }
    console.log(`[ADMIN DB] ${player.name} a setat admin level ${level} pentru ${name_} (offline cmd)`);
}, { description: 'Seteaza admin pentru jucator offline. /setadminoffline [nume] [level]' });

/**
 * /reloadadmins — Reload admin database from file
 */
mp.events.addCommand('reloadadmins', (player) => {
    if (denyIfNoLevel(player, 7)) return;

    if (global.adminDb) {
        global.adminDb.reload();
        // Re-apply to all online players
        mp.players.forEach(p => {
            if (p && p.name) {
                const lvl = global.adminDb.getLevel(p.name);
                p.setVariable('adminLevel', lvl);
            }
        });
    }
    chat(player, '!{6dffb0}[ADMIN] Baza de date a fost reincarcata si aplicata.');
    console.log(`[ADMIN DB] Database reloaded by ${player.name}`);
}, { description: 'Reincarca baza de date admin. /reloadadmins' });
