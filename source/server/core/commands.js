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
        player.outputChatBox('Invalid amount.');
        return;
    }
    player.money += amount;
    player.outputChatBox(`Added $${amount} to your account. Current balance: $${player.money}`);
});

mp.events.addCommand('veh', (player, name) => {
    let pos = player.position;
    let heading = player.heading;
    let vehicle = mp.vehicles.new(mp.joaat(name), new mp.Vector3(pos.x + 3, pos.y, pos.z), {
        heading: heading,
        color: [[0, 0, 0], [0, 0, 0]],
        dimension: player.dimension
    });
    player.outputChatBox('O masina neagra a aparut langa tine!');
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
