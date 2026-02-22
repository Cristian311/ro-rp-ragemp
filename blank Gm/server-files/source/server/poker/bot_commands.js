// poker_bots.js — Simulare jucători fake pentru testare
// Comenzi disponibile:
//   /addbot [numar]     — adaugă 1 sau mai mulți boți la masa ta
//   /removebot [numar]  — elimină ultimul bot (sau un număr specific)
//   /botaction <seat> <action> [raiseAmount>]  — faci o acțiune în locul botului de pe scaunul X
//   /botfold <seat>     — bot fold
//   /botcheck <seat>    — bot check
//   /botcall <seat>     — bot call
//   /botraise <seat> <amount> — bot raise
//   /botallin <seat>    — bot all-in
//   /botstatus          — afișează toți boții la masa ta
//   /autobots           — boții joacă automat (random) până dai iar comanda

const { joinLobby, leaveLobby, processAction, lobbies } = require('./poker_server.js');

// ──────────────────────────────────────────
// Fake player factory
// ──────────────────────────────────────────
let botIdCounter = 1;

function createFakePlayer(name) {
    return {
        name,
        _isBot: true,
        _messages: [],       // stocăm mesajele pentru debug
        outputChatBox(msg) {
            // Trimite mesajul la toți adminii online sau logează
            console.log(`[BOT:${this.name}] ${msg}`);
        },
        call(eventName, ...args) {
            console.log(`[BOT:${this.name}] event "${eventName}" args: ${JSON.stringify(args)}`);
        },
    };
}

// Map: botPlayer → playerReal care îl controlează
const botOwner  = new Map();   // fakePlayer → realPlayer
const ownerBots = new Map();   // realPlayer.name → [fakePlayer, ...]
const autoMode  = new Set();   // realPlayer.name → auto play activ

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────
function getLobbyByPlayer(player) {
    for (const key in lobbies) {
        const found = lobbies[key].players.find(p => p.player === player);
        if (found) return lobbies[key];
    }
    return null;
}

function getPlayerBots(player) {
    return ownerBots.get(player.name) || [];
}

function getBotBySeat(lobby, seat) {
    return lobby.players.find(p => p.seat === parseInt(seat));
}

// ──────────────────────────────────────────
// Auto-play logic (random simplu)
// ──────────────────────────────────────────
function autoBotAction(lobby) {
    if (lobby.state !== 'playing') return;

    const currentSlot = lobby.players[lobby.currentPlayerIndex];
    if (!currentSlot) return;

    // E rândul unui bot în auto-mode?
    const owner = botOwner.get(currentSlot.player);
    if (!owner || !autoMode.has(owner.name)) return;

    // Delay mic ca să pară natural
    setTimeout(() => {
        // Verifică din nou că e tot rândul lui
        const slot = lobby.players[lobby.currentPlayerIndex];
        if (!slot || slot.player !== currentSlot.player) return;

        const canCheck = lobby.currentBet <= slot.currentBet;
        const roll     = Math.random();

        let action;
        if (canCheck) {
            // Check 50%, raise 30%, fold 20%
            if (roll < 0.5)       action = 'check';
            else if (roll < 0.8)  action = 'raise';
            else                   action = 'fold';
        } else {
            // Call 55%, fold 30%, raise 15%
            if (roll < 0.55)      action = 'call';
            else if (roll < 0.85) action = 'fold';
            else                   action = 'raise';
        }

        const raiseAmount = action === 'raise'
            ? lobby.currentBet + (Math.floor(Math.random() * 3) + 1) * 100
            : 0;

        processAction(currentSlot.player, action, raiseAmount);

        // Dacă mai e un bot la rând, continuăm auto
        setTimeout(() => autoBotAction(lobby), 500);
    }, 800 + Math.random() * 700);
}

// Hook în nextTurn pentru auto-mode — patches processAction indirect prin event
const originalProcessAction = processAction;
mp.events.add('_poker_afterTurn', (lobby) => {
    autoBotAction(lobby);
});

// ──────────────────────────────────────────
// /addbot [numar]
// ──────────────────────────────────────────
mp.events.addCommand('addbot', (player, _, countStr) => {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) {
        player.outputChatBox('!{Red}[BOT] Nu ești la nicio masă de poker!');
        return;
    }
    if (lobby.state === 'playing') {
        player.outputChatBox('!{Red}[BOT] Nu poți adăuga boți în timpul jocului!');
        return;
    }

    const count = Math.min(parseInt(countStr) || 1, LOBBY_CONFIG_MAX - lobby.players.length);
    if (count <= 0) {
        player.outputChatBox('!{Red}[BOT] Masa este plină sau număr invalid!');
        return;
    }

    const added = [];
    for (let i = 0; i < count; i++) {
        const botName   = `Bot_${botIdCounter++}`;
        const fakePlayer = createFakePlayer(botName);

        botOwner.set(fakePlayer, player);

        if (!ownerBots.has(player.name)) ownerBots.set(player.name, []);
        ownerBots.get(player.name).push(fakePlayer);

        joinLobby(fakePlayer, lobby.id, lobby.name);
        added.push(botName);
    }

    player.outputChatBox(`!{Green}[BOT] Adăugat: ${added.join(', ')}`);
    player.outputChatBox(`!{Yellow}[BOT] Folosește /botstatus să vezi scaunele. Controlezi tu acțiunile cu /botcall, /botfold etc.`);
});

const LOBBY_CONFIG_MAX = 10; // trebuie să coincidă cu LOBBY_CONFIG.MAX_PLAYERS

// ──────────────────────────────────────────
// /removebot [numar]
// ──────────────────────────────────────────
mp.events.addCommand('removebot', (player, _, countStr) => {
    const bots  = getPlayerBots(player);
    if (!bots.length) {
        player.outputChatBox('!{Red}[BOT] Nu ai niciun bot activ!');
        return;
    }

    const count    = Math.min(parseInt(countStr) || 1, bots.length);
    const removed  = bots.splice(bots.length - count, count);

    removed.forEach(bot => {
        leaveLobby(bot);
        botOwner.delete(bot);
        player.outputChatBox(`!{Yellow}[BOT] ${bot.name} a părăsit masa.`);
    });
});

// ──────────────────────────────────────────
// /botstatus
// ──────────────────────────────────────────
mp.events.addCommand('botstatus', (player) => {
    const lobby = getLobbyByPlayer(player);
    if (!lobby) { player.outputChatBox('!{Red}Nu ești la o masă!'); return; }

    const bots = getPlayerBots(player);
    if (!bots.length) {
        player.outputChatBox('!{Yellow}[BOT] Nu ai boți la masă.');
        return;
    }

    player.outputChatBox('!{Cyan}══ BOȚI ══');
    bots.forEach(bot => {
        const slot = lobby.players.find(p => p.player === bot);
        if (!slot) return;
        const isTurn = lobby.players[lobby.currentPlayerIndex]?.player === bot;
        const turnMark = isTurn ? ' !{Green}◄ RÂNDUL LUI' : '';
        player.outputChatBox(
            `!{White}Scaun ${slot.seat + 1} | ${bot.name} | Chips: $${slot.chips} | Bet: $${slot.currentBet} | Fold: ${slot.hasFolded}${turnMark}`
        );
    });

    if (lobby.state === 'playing') {
        const curSlot = lobby.players[lobby.currentPlayerIndex];
        player.outputChatBox(`!{Yellow}Rândul curent: ${curSlot?.player?.name || '?'} | Bet: $${lobby.currentBet} | Pot: $${lobby.pot}`);
    }
});

// ──────────────────────────────────────────
// Helper generic pentru acțiuni manuale
// ──────────────────────────────────────────
function doBotAction(player, seatStr, action, raiseAmount = 0) {
    const lobby = getLobbyByPlayer(player);
    if (!lobby || lobby.state !== 'playing') {
        player.outputChatBox('!{Red}[BOT] Nu există un joc activ!');
        return;
    }

    const seat     = parseInt(seatStr) - 1;   // user dă 1-based
    const slot     = getBotBySeat(lobby, seat);
    if (!slot) {
        player.outputChatBox(`!{Red}[BOT] Nu există niciun jucător pe scaunul ${seatStr}!`);
        return;
    }

    // Verifică că botul îți aparține
    if (botOwner.get(slot.player) !== player) {
        player.outputChatBox('!{Red}[BOT] Acel bot nu îți aparține!');
        return;
    }

    // Verifică că e rândul lui
    const currentSlot = lobby.players[lobby.currentPlayerIndex];
    if (!currentSlot || currentSlot !== slot) {
        player.outputChatBox(`!{Red}[BOT] Nu este rândul lui ${slot.player.name}! Rândul curent: ${currentSlot?.player?.name}`);
        return;
    }

    processAction(slot.player, action, raiseAmount);
}

// ──────────────────────────────────────────
// Comenzi individuale
// ──────────────────────────────────────────
mp.events.addCommand('botfold', (player, _, seat) => {
    doBotAction(player, seat, 'fold');
});

mp.events.addCommand('botcheck', (player, _, seat) => {
    doBotAction(player, seat, 'check');
});

mp.events.addCommand('botcall', (player, _, seat) => {
    doBotAction(player, seat, 'call');
});

mp.events.addCommand('botraise', (player, _, seat, amount) => {
    doBotAction(player, seat, 'raise', parseInt(amount) || 0);
});

mp.events.addCommand('botallin', (player, _, seat) => {
    doBotAction(player, seat, 'allin');
});

// ──────────────────────────────────────────
// /botaction <seat> <action> [amount]  — shorthand universal
// ──────────────────────────────────────────
mp.events.addCommand('botaction', (player, _, seat, action, amount) => {
    doBotAction(player, seat, action, parseInt(amount) || 0);
});

// ──────────────────────────────────────────
// /autobots — toggle auto-play pentru boții tăi
// ──────────────────────────────────────────
mp.events.addCommand('autobots', (player) => {
    if (autoMode.has(player.name)) {
        autoMode.delete(player.name);
        player.outputChatBox('!{Red}[BOT] Auto-play OPRIT. Controlezi tu boții manual.');
    } else {
        autoMode.add(player.name);
        player.outputChatBox('!{Green}[BOT] Auto-play PORNIT. Boții joacă singuri (random).');

        // Dacă e deja rândul unui bot, pornește imediat
        const lobby = getLobbyByPlayer(player);
        if (lobby) autoBotAction(lobby);
    }
});

// ──────────────────────────────────────────
// Cleanup la quit
// ──────────────────────────────────────────
mp.events.add('playerQuit', (player) => {
    const bots = getPlayerBots(player);
    bots.forEach(bot => {
        leaveLobby(bot);
        botOwner.delete(bot);
    });
    ownerBots.delete(player.name);
    autoMode.delete(player.name);
});

console.log('[POKER] poker_bots.js încărcat. Comenzi: /addbot /removebot /botfold /botcheck /botcall /botraise /botallin /botstatus /autobots');