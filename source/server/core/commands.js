const fs = require('fs');

mp.events.addCommand('hp', (player) => {
    player.health = 100;
});

mp.events.addCommand('armor', (player) => {
    player.armour = 100;
});

mp.events.addCommand('kill', (player) => {
    player.health = 0;
});

mp.events.addCommand('slap', (player) => {
    let pos = player.position;
    pos.z += 1.0; 
    player.setPosition(pos);
});


mp.events.addCommand('addmoney', (player, amount) => {
    amount = parseInt(amount);
    if (isNaN(amount)) {
        global.chatSend(player, 'Invalid amount.');
        return;
    }
    if (typeof player.money !== 'number' || isNaN(player.money)) player.money = 0;
    player.money += amount;
    global.chatSend(player, `!{6dffb0}+$${amount}. !{FFFFFF}Balanta: !{FFD700}$${player.money}`);
});

mp.events.addCommand('veh', (player, name) => {
    if (!name) return global.chatSend(player, '!{FF6B6B}Foloseste: /veh [model]');
    let pos = player.position;
    let heading = player.heading;
    let vehicle = mp.vehicles.new(mp.joaat(name), new mp.Vector3(pos.x + 3, pos.y, pos.z), {
        heading: heading,
        color: [[0, 0, 0], [0, 0, 0]],
        dimension: player.dimension
    });
    try { player.putIntoVehicle(vehicle, 0); } catch (_) {}
    global.chatSend(player, '!{6dffb0}Vehicul spawnat! Te-ai urcat automat.');
});

// ──────────────────────────────────────────
// WEAPON COMMAND
// ──────────────────────────────────────────
const WEAPON_ALIASES = {
    'pistol': 0x1B06D571,
    'combatpistol': 0x5EF9FEC4,
    'smg': 0x2BE6766B,
    'microsmg': 0x13532244,
    'assaultrifle': 0xBFEFFF6D,
    'carbinerifle': 0x83BF0278,
    'advancedrifle': 0xAF113F99,
    'mg': 0x9D07F764,
    'combatmg': 0x7FD62962,
    'pumpshotgun': 0x1D073A89,
    'sawnoffshotgun': 0x7846A318,
    'assaultshotgun': 0xE284C527,
    'bullpupshotgun': 0x9D61E50F,
    'sniperrifle': 0x05FC3C11,
    'heavysniper': 0x0C472FE2,
    'rpg': 0xB1CA77B1,
    'grenadelauncher': 0xA284510B,
    'minigun': 0x42BF8A85,
    'bat': 0x958A4A8F,
    'knife': 0x99B507EA,
    'machete': 0xDD5DF8D9,
    'hammer': 0x4E875F73,
    'crowbar': 0x84BD7BFD,
    'flashlight': 0x8BB05FD7,
    'dagger': 0x92A27487,
    'hatchet': 0xF9DCBF2D,
    'switchblade': 0xDFE37640,
    'grenade': 0x93E220BD,
    'molotov': 0x24B17070,
    'stickybomb': 0x2C3731D9,
    'smokegrenade': 0xFDBC8A50,
    'bzgas': 0xA0973D5E,
    'flare': 0x497FACC3,
    'petrolcan': 0x34A67B97,
    'fireextinguisher': 0x060EC506,
    'stungun': 0x3656C8C1,
    'ap_pistol': 0x22D8FE39,
    'heavypistol': 0xD205520E,
    'specialcarbine': 0xC0A3098D,
    'bullpuprifle': 0x7F229F94,
    'gusenberg': 0x61012683,
    'musket': 0xA89CB99E,
    'marksmanrifle': 0xC734385A,
    'heavyshotgun': 0x3AABBBAA,
    'dbshotgun': 0xEF951FBB,
    'compactrifle': 0x624FE830,
    'snspistol': 0xBFD21232,
    'vintagepistol': 0x083839C4,
    'firework': 0x7F7497E5,
    'railgun': 0x6D544C99,
    'hominglauncher': 0x63AB0442,
    'proxmine': 0xAB564B93,
    'snowball': 0x787F0BB,
    'combatpdw': 0x0A3D4D34,
    'marksmanpistol': 0xDC4DB296,
    'machinepistol': 0xDB1AA450,
    'revolver': 0xC1B3C3D1,
    'doubleaction': 0x97EA20B8,
    'ceramicpistol': 0x2B5EF5EC,
    'navyrevolver': 0x917F6C8C,
    'hazardcan': 0xBA536372,
};

mp.events.addCommand('weapon', (player, fullText) => {
    if (!fullText || !fullText.trim()) {
        global.chatSend(player, '!{8ab4ff}Foloseste: /weapon [nume] — ex: /weapon pistol, /weapon ak47');
        global.chatSend(player, '!{8ab4ff}Arme disponibile: ' + Object.keys(WEAPON_ALIASES).join(', '));
        return;
    }
    const name = fullText.trim().toLowerCase().replace(/\s+/g, '');

    // Try alias first
    let hash = WEAPON_ALIASES[name];

    // If not found, try joaat hash
    if (!hash) {
        try {
            hash = mp.joaat('weapon_' + name);
        } catch (_) {
            hash = 0;
        }
    }

    if (!hash) {
        global.chatSend(player, `!{FF0000}Arma "${name}" nu a fost gasita.`);
        return;
    }

    player.giveWeapon(hash, 9999);
    global.chatSend(player, `!{6dffb0}Ai primit arma: !{FFD700}${name} !{FFFFFF}(9999 munitie)`);
});

mp.events.addCommand('removeweapons', (player) => {
    player.removeAllWeapons();
    global.chatSend(player, '!{FF4444}Toate armele au fost scoase.');
});

mp.events.addCommand('savepos', (player, name) => {
    let position = player.position;
    let rotation = player.heading;
    position.x = position.x.toFixed(2);
    position.y = position.y.toFixed(2);
    position.z = position.z.toFixed(2);
    rotation = rotation.toFixed(2);

    console.log(`Saved position for ${player.name}: ${position.x}, ${position.y}, ${position.z}, Rotation: ${rotation}`);
    global.chatSend(player, `Position saved: ${position.x}, ${position.y}, ${position.z}, Rotation: ${rotation}`);
    const log = `${new Date().toISOString()}: ${player.name} saved position -${name}- at:\nX: ${position.x}\nY: ${position.y}\nZ: ${position.z}\nRotation: ${rotation}\n`;

    fs.appendFile("saved_positions.txt", log, (err) => {
        if (err) console.error("Log error:", err);
    });
});
