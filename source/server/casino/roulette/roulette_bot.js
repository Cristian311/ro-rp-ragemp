// roulette_bot.js — Bot system for roulette tables
// Commands:
//   /rbot add [count]   — add 1+ bots to your table (or specified table)
//   /rbot remove [count] — remove bots from your table
//   /rbot list           — list all active bots
//   /rbot stop           — remove all bots everywhere

const fs   = require('fs');
const path = require('path');
const {
    ROULETTE_CONFIG, joinLobby, leaveLobby, placeBet,
    lobbies, getLobbyByPlayer, getPlayerSlot,
    RED_NUMBERS, BLACK_NUMBERS, BET_TYPES,
} = require('./roulette_server.js');

const TABLES_SAVE_PATH = path.join(process.cwd(), 'data', 'roulette', 'roulette_tables.json');

// Seat local offsets (same as client SEAT_POSITIONS)
const SEAT_POSITIONS = [
    { f: -1.0436, r: -0.2434, u: 0.5201, heading: 354 },
    { f: -1.1104, r:  0.7752, u: 0.6101, heading: 379 },
    { f: -0.0841, r:  1.5364, u: 0.5601, heading: 440 },
    { f:  0.8431, r:  0.7731, u: 0.5601, heading: 174 },
];

const botPeds = new Map(); // botName → ped entity

function spawnBotPed(bot, table, seatIndex) {
    const hRad = (table.heading || 0) * Math.PI / 180;
    const seat = SEAT_POSITIONS[seatIndex] || SEAT_POSITIONS[0];
    const px = table.x + seat.f * (-Math.sin(hRad)) + seat.r * Math.cos(hRad);
    const py = table.y + seat.f * Math.cos(hRad) + seat.r * Math.sin(hRad);
    const pz = table.z + seat.u;
    const pedHeading = ((table.heading || 0) + seat.heading) % 360;

    const ped = mp.peds.new(bot.pedModel, new mp.Vector3(px, py, pz), {
        heading: pedHeading,
        dimension: 0,
    });
    ped.controller = undefined; // no AI
    botPeds.set(bot.name, ped);
    return ped;
}

function destroyBotPed(botName) {
    const ped = botPeds.get(botName);
    if (ped) {
        try { ped.destroy(); } catch(e) {}
        botPeds.delete(botName);
    }
}

// ──────────────────────────────────────────
// Random bot names
// ──────────────────────────────────────────
const BOT_FIRST_NAMES = [
    'Alex', 'Maria', 'Ion', 'Elena', 'Andrei', 'Cristina', 'Mihai', 'Ana',
    'Dan', 'Ioana', 'Vlad', 'Sofia', 'Radu', 'Diana', 'George', 'Laura',
    'Stefan', 'Alina', 'Bogdan', 'Camelia', 'Lucian', 'Bianca', 'Florin', 'Daria',
    'Viktor', 'Natalia', 'Sergiu', 'Irina', 'Marcel', 'Roxana', 'Pavel', 'Carmen',
];

const BOT_LAST_NAMES = [
    'Popescu', 'Ionescu', 'Popa', 'Stoica', 'Radu', 'Stan', 'Marin', 'Dumitru',
    'Nicolae', 'Gheorghe', 'Fratila', 'Barbu', 'Lazar', 'Moldovan', 'Rusu', 'Toma',
    'Kovacs', 'Nistor', 'Iacob', 'Matei', 'Dragomir', 'Dobre', 'Varga', 'Florea',
];

// Random ped models (common civilian models)
const BOT_PED_MODELS = [
    0xF6D1E04E, // a_m_y_bevhills_01
    0x98F65A5E, // a_m_y_bevhills_02
    0x7B9B4BC0, // a_m_y_business_01
    0x587B718C, // a_m_y_business_02
    0x3FB5C3D3, // a_m_y_downtown_01
    0xA1435105, // a_m_y_genstreet_01
    0xCE768B5F, // a_m_y_hipster_01
    0x5BE0CC96, // a_f_y_bevhills_01
    0x6D1FB02C, // a_f_y_bevhills_02
    0x49EA5685, // a_f_y_business_01
    0xF46B75D9, // a_f_y_business_02
    0x82BDB27E, // a_f_y_downtown_01
    0x2C89CDF5, // a_f_y_genstreet_01
    0x585703DC, // a_f_y_hipster_01
];

// ──────────────────────────────────────────
// Fake player factory
// ──────────────────────────────────────────
let botIdCounter = 1;
const allBots     = new Map();  // name → fakePlayer
const botTimers   = new Map();  // name → auto-bet timer

function createFakePlayer(customName) {
    const firstName = BOT_FIRST_NAMES[Math.floor(Math.random() * BOT_FIRST_NAMES.length)];
    const lastName  = BOT_LAST_NAMES[Math.floor(Math.random() * BOT_LAST_NAMES.length)];
    const name = customName || `${firstName}_${lastName}_${botIdCounter}`;
    botIdCounter++;

    const fakePlayer = {
        name,
        _isBot: true,
        money: 5000 + Math.floor(Math.random() * 15000),
        pedModel: BOT_PED_MODELS[Math.floor(Math.random() * BOT_PED_MODELS.length)],
        outputChatBox(msg) { /* silent */ },
        call(eventName, ...args) { /* silent */ },
    };

    allBots.set(name, fakePlayer);
    return fakePlayer;
}

// ──────────────────────────────────────────
// Auto-bet AI
// ──────────────────────────────────────────
const BET_STRATEGIES = [
    // Straight bets (single number)
    function straightBet(slot) {
        const num = Math.floor(Math.random() * 37); // 0-36
        return { type: 'straight', value: num };
    },
    // Color bet
    function colorBet() {
        return Math.random() > 0.5 ? { type: 'red', value: 'red' } : { type: 'black', value: 'black' };
    },
    // Odd/even
    function parityBet() {
        return Math.random() > 0.5 ? { type: 'odd', value: 'odd' } : { type: 'even', value: 'even' };
    },
    // Low/high
    function rangeBet() {
        return Math.random() > 0.5 ? { type: 'low', value: 'low' } : { type: 'high', value: 'high' };
    },
    // Dozen
    function dozenBet() {
        const d = Math.floor(Math.random() * 3) + 1;
        return { type: 'dozen', value: d };
    },
    // Column
    function columnBet() {
        const c = Math.floor(Math.random() * 3) + 1;
        return { type: 'column', value: c };
    },
];

function autoBet(botPlayer) {
    const lobby = getLobbyByPlayer(botPlayer);
    if (!lobby || lobby.state !== 'betting') return;

    const slot = getPlayerSlot(lobby, botPlayer);
    if (!slot || slot.chips < ROULETTE_CONFIG.MIN_BET) return;

    // Place 1-3 random bets
    const numBets = 1 + Math.floor(Math.random() * 3);

    for (let i = 0; i < numBets; i++) {
        if (slot.chips < ROULETTE_CONFIG.MIN_BET) break;

        const strategy = BET_STRATEGIES[Math.floor(Math.random() * BET_STRATEGIES.length)];
        const bet = strategy(slot);

        // Random amount: min bet to 20% of chips (capped at max bet)
        const maxAfford = Math.min(slot.chips, ROULETTE_CONFIG.MAX_BET);
        const twentyPct = Math.max(ROULETTE_CONFIG.MIN_BET, Math.floor(slot.chips * 0.2));
        const amount = Math.min(maxAfford, ROULETTE_CONFIG.MIN_BET + Math.floor(Math.random() * twentyPct));

        placeBet(botPlayer, bet.type, bet.value, amount);
    }
}

// ──────────────────────────────────────────
// Listen for betting phase to auto-bet
// ──────────────────────────────────────────
mp.events.add('_roulette_bettingPhaseStarted', (lobbyId) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;

    lobby.players.forEach(slot => {
        if (slot.player._isBot) {
            // Random delay 1-4s before placing bets
            const delay = 1000 + Math.floor(Math.random() * 3000);
            const timer = setTimeout(() => {
                autoBet(slot.player);
            }, delay);
            botTimers.set(slot.player.name, timer);
        }
    });
});

// ──────────────────────────────────────────
// Load table positions from file
// ──────────────────────────────────────────
function loadTables() {
    try {
        if (fs.existsSync(TABLES_SAVE_PATH)) {
            return JSON.parse(fs.readFileSync(TABLES_SAVE_PATH, 'utf8'));
        }
    } catch(e) {}
    return [];
}

// ──────────────────────────────────────────
// Commands
// ──────────────────────────────────────────
mp.events.addCommand('rbot', (player, fullText, ...args) => {
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'add') {
        const count = Math.min(parseInt(args[1]) || 1, 3);
        // Get the table the player is at, or use args[2] as tableIndex
        let tableIndex = args[2] !== undefined ? parseInt(args[2]) : -1;
        const tables = loadTables();

        if (tableIndex === -1) {
            // Try player's current table
            const myLobby = getLobbyByPlayer(player);
            if (myLobby) {
                tableIndex = myLobby.id;
            } else {
                global.chatSend(player, '!{Red}[RBOT] Nu esti la o masa! Foloseste: /rbot add [count] [tableIndex]');
                return;
            }
        }

        if (tableIndex < 0 || tableIndex >= tables.length) {
            global.chatSend(player, `!{Red}[RBOT] Index masa invalid: ${tableIndex}`);
            return;
        }

        const table = tables[tableIndex];
        let added = 0;

        for (let i = 0; i < count; i++) {
            const bot = createFakePlayer();
            joinLobby(bot, tableIndex, table.name, table.casinoId, table.x, table.y, table.z, table.heading);

            const lobby = getLobbyByPlayer(bot);
            if (lobby) {
                added++;
                const slot = getPlayerSlot(lobby, bot);
                if (slot) spawnBotPed(bot, table, slot.seat);
                console.log(`[RBOT] Bot "${bot.name}" adaugat la masa #${tableIndex} (seat: ${slot ? slot.seat : '?'})`);
            } else {
                allBots.delete(bot.name);
            }
        }

        global.chatSend(player, `!{Green}[RBOT] !{White}${added} bot(i) adaugat(i) la masa #${tableIndex}.`);
    }

    else if (sub === 'remove') {
        const count = parseInt(args[1]) || 1;
        const myLobby = getLobbyByPlayer(player);
        let tableIndex = args[2] !== undefined ? parseInt(args[2]) : (myLobby ? myLobby.id : -1);

        if (tableIndex === -1) {
            global.chatSend(player, '!{Red}[RBOT] Nu esti la o masa! Foloseste: /rbot remove [count] [tableIndex]');
            return;
        }

        const lobby = lobbies[tableIndex];
        if (!lobby) {
            global.chatSend(player, '!{Red}[RBOT] Masa nu exista sau nu are lobby.');
            return;
        }

        let removed = 0;
        const botsAtTable = lobby.players.filter(p => p.player._isBot);

        for (let i = 0; i < Math.min(count, botsAtTable.length); i++) {
            const botSlot = botsAtTable[i];
            const timer = botTimers.get(botSlot.player.name);
            if (timer) { clearTimeout(timer); botTimers.delete(botSlot.player.name); }
            destroyBotPed(botSlot.player.name);
            leaveLobby(botSlot.player);
            allBots.delete(botSlot.player.name);
            removed++;
        }

        global.chatSend(player, `!{Green}[RBOT] !{White}${removed} bot(i) eliminat(i) de la masa #${tableIndex}.`);
    }

    else if (sub === 'list') {
        if (allBots.size === 0) {
            global.chatSend(player, '!{Yellow}[RBOT] Niciun bot activ.');
            return;
        }

        global.chatSend(player, `!{Green}[RBOT] !{White}Boti activi: ${allBots.size}`);
        allBots.forEach((bot, name) => {
            const lobby = getLobbyByPlayer(bot);
            const tableName = lobby ? `masa "${lobby.name}" (#${lobby.id})` : 'fara masa';
            const slot = lobby ? getPlayerSlot(lobby, bot) : null;
            const chips = slot ? `$${slot.chips}` : '-';
            global.chatSend(player, `  !{Cyan}${name} !{White}— ${tableName} — Chips: ${chips}`);
        });
    }

    else if (sub === 'stop') {
        let removed = 0;
        allBots.forEach((bot, name) => {
            const timer = botTimers.get(name);
            if (timer) { clearTimeout(timer); botTimers.delete(name); }
            destroyBotPed(name);
            leaveLobby(bot);
            removed++;
        });
        allBots.clear();
        global.chatSend(player, `!{Green}[RBOT] !{White}Toti ${removed} boti au fost eliminati.`);
    }

    else {
        global.chatSend(player, '!{Orange}[RBOT] Comenzi: /rbot add [count] [table] | /rbot remove [count] [table] | /rbot list | /rbot stop');
    }
});
