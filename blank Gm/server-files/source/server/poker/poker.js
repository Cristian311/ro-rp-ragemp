
const util = require('./util.js');
const fs = require('fs');
const path = require('path');
const savePath = path.join(process.cwd(), 'poker_tables.json');



// Events
mp.events.add('Server_ReceivePokerAction', (player, actionName) => {
    
    console.log(`Jucătorul ${player.name} a apăsat butonul: ${actionName}`);

    if (actionName === 'fold') {
        player.outputChatBox("Ai dat Fold. Așteaptă runda următoare.");
    } 
    else if (actionName === 'call') {
        player.outputChatBox("Ai dat Call.");ddsssssssssss
    } 
    else if (actionName === 'raise') {
        player.outputChatBox("Ai dat Raise.");
    }
    else if (actionName === 'check') {
        player.outputChatBox("Ai dat Check.");
    }
    else if (actionName === 'allin') {
        player.outputChatBox("Ai dat All-In.");
    }

});

mp.events.add('Server_PlayerAction', (player, actionName) => {
    
    console.log(`Jucătorul ${player.name} a acționat: ${actionName}`);
    if (actionName === 'interact') {
        if (player.currentTable) {
            player.outputChatBox("Interacționezi cu masa de poker.");
            player.call('openPokerUI');
        } else {
            player.outputChatBox("Nu ești lângă nicio masă de poker.");
        }
    }
});

mp.events.add("playerEnterColshape", (player, colshape) => {
    if (colshape.getVariable('isPokerTable')) {
        player.outputChatBox("!{Yellow}[POKER]!{White} Ai intrat în zona mesei. Apasă !{Green}E!{White} pentru a juca.");
        player.currentTable = colshape;
    }
});

mp.events.add("playerExitColshape", (player, colshape) => {
    if (colshape.getVariable('isPokerTable')) {
        player.outputChatBox("!{Yellow}[POKER]!{White} Ai părăsit zona mesei.");
        player.currentTable = null;
    }
});

// Comenzi
mp.events.addCommand('createpoker', (player, name) => {
    const pos = player.position;
    const rot = player.heading;

    mp.objects.new(mp.joaat('prop_poker_table_02'), pos, {
        rotation: new mp.Vector3(0, 0, rot),
        dimension: 0
    });

    const newTable = {
        name: name || `PokerTable_${Date.now()}`,
        x: parseFloat(pos.x.toFixed(2)),
        y: parseFloat(pos.y.toFixed(2)),
        z: parseFloat(pos.z.toFixed(2)),
        heading: parseFloat(rot.toFixed(2))
    };

    let tables = [];
    if (fs.existsSync(savePath)) {
        tables = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    }

    tables.push(newTable);
    fs.writeFileSync(savePath, JSON.stringify(tables, null, 4)); 

    util.createMarker(newTable, tables.length - 1);
    util.createColshape(newTable, tables.length - 1);
    util.createBlip(newTable);

    player.outputChatBox(`Masa de poker salvata la: ${newTable.x}, ${newTable.y}, ${newTable.z}`);
});


//Load async

function loadPokerTables() {
    if (!fs.existsSync(savePath)) return;

    const data = fs.readFileSync(savePath, 'utf8');
    const tables = JSON.parse(data);

    console.log(`[POKER] S-au găsit ${tables.length} mese salvate:`);

    tables.forEach((table, index) => {
        util.createBlip(table);
        util.createColshape(table, index);
        util.createMarker(table, index);   
        console.log(`Masa #${index}. ${table.name}: X:${table.x}, Y:${table.y}, Z:${table.z}`);
    });
}

loadPokerTables();