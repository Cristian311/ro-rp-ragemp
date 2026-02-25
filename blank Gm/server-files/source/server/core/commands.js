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

mp.events.addCommand('savepos', (player, name) => {
    let position = player.position;
    let rotation = player.heading;
    position.x = position.x.toFixed(2);
    position.y = position.y.toFixed(2);
    position.z = position.z.toFixed(2);
    rotation = rotation.toFixed(2);

    console.log(`Saved position for ${player.name}: ${position.x}, ${position.y}, ${position.z}, Rotation: ${rotation}`);
    player.outputChatBox(`Position saved: ${position.x}, ${position.y}, ${position.z}, Rotation: ${rotation}`);
    const log = `${new Date().toISOString()}: ${player.name} saved position -${name}- at:\nX: ${position.x}\nY: ${position.y}\nZ: ${position.z}\nRotation: ${rotation}\n`;

    fs.appendFile("saved_positions.txt", log, (err) => {
        if (err) console.error("Log error:", err);
    });
});
