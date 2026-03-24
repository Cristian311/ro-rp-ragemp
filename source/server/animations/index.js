const fs = require('fs');

// Handle save position + animation request from client
mp.events.add('animations:savePosition', (player, dataStr) => {
    let data;
    try {
        data = JSON.parse(dataStr);
    } catch (e) {
        player.outputChatBox('Error saving position.');
        return;
    }

    let log = `${new Date().toISOString()}: ${player.name} saved position -${data.name}- at:
  X: ${data.x}  Y: ${data.y}  Z: ${data.z}  Rotation: ${data.rotation}
  Anim Dict: ${data.dict}  Anim Name: ${data.anim}  Flags: ${data.flags}`;

    if (data.tableType) {
        log += `\n  Table Type: ${data.tableType}  Offset F: ${data.offset_f}  R: ${data.offset_r}  U: ${data.offset_u}  Heading: ${data.offset_heading}`;
    }
    log += '\n';

    console.log(`[Animations] ${player.name} saved: ${data.name} | Pos: ${data.x}, ${data.y}, ${data.z} | Rot: ${data.rotation} | Anim: ${data.dict} ${data.anim}`);

    fs.appendFile('saved_positions.txt', log, (err) => {
        if (err) console.error('[Animations] Save error:', err);
    });
});
