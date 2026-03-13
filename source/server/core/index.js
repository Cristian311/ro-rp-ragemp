require('./commands.js')
const fs = require('fs');

mp.events.add("playerJoin", (player) => {
    const log = `${player.name} joined at ${new Date().toISOString()}\n`;

    fs.appendFile("logs.txt", log, (err) => {
        if (err) console.error("Log error:", err);
    });
});

