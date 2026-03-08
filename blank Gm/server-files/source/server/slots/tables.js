const fs   = require('fs');
const path = require('path');
const server = require('./slots_server');

const savePath = path.join(process.cwd(), 'slots_machines.json');

// References by machineIndex
const machineLabels         = {};
const machineColshapes      = {};
const machineBlips          = {};
const machineLeaveColshapes = {};

function getMarkerText(index, state, occupied) {
    let statusLine;
    if (state === 'occupied' || occupied) {
        statusLine = `~r~Ocupat`;
    } else {
        statusLine = `~g~Liber`;
    }
    return `~y~Shining Crown ~w~#${index}\n${statusLine}\n~y~Apasa ~g~E ~w~pentru a juca`;
}

function updateMachineMarker(machineIndex, state, players, maxPlayers) {
    const old = machineLabels[machineIndex];
    if (!old) return;
    const pos = old.position;
    old.destroy();
    machineLabels[machineIndex] = mp.labels.new(
        getMarkerText(machineIndex, state, players > 0),
        pos,
        { los: true, font: 4, drawDistance: 10, dimension: 0 }
    );
}

// Load data on server start
function loadSlotsMachines() {
    if (!fs.existsSync(savePath)) return;

    const machines = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    console.log(`[SLOTS] S-au găsit ${machines.length} aparate salvate:`);

    machines.forEach((machine, index) => {
        createColshape(machine, index, machine.name);
        createLeaveColshape(machine, index);
        createMarker(machine, index);
        console.log(`  Aparat #${index}. ${machine.name}: X:${machine.x}, Y:${machine.y}, Z:${machine.z}`);
    });
}

loadSlotsMachines();

// Commands
mp.events.addCommand('createslots', (player, _, name) => {
    const pos = player.position;
    const rot = player.heading;

    const newMachine = {
        name:     name || `SlotMachine_${Date.now()}`,
        x:        parseFloat(pos.x.toFixed(2)),
        y:        parseFloat(pos.y.toFixed(2)),
        z:        parseFloat(pos.z.toFixed(2)),
        heading:  parseFloat(rot.toFixed(2)),
    };

    let machines = [];
    if (fs.existsSync(savePath)) {
        machines = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    }

    machines.push(newMachine);
    fs.writeFileSync(savePath, JSON.stringify(machines, null, 4));

    const newIndex = machines.length - 1;
    createMarker(newMachine, newIndex);
    createColshape(newMachine, newIndex, newMachine.name);
    createLeaveColshape(newMachine, newIndex);

    player.outputChatBox(`!{Green}[SLOTS] Aparatul "${newMachine.name}" salvat la: ${newMachine.x}, ${newMachine.y}, ${newMachine.z}`);
});

mp.events.addCommand('deleteslots', (player, _, idStr) => {
    const index = parseInt(idStr);
    if (isNaN(index)) {
        player.outputChatBox('!{Red}[SLOTS] Folosire: /deleteslots <id>');
        return;
    }

    if (machineLabels[index]) { machineLabels[index].destroy(); delete machineLabels[index]; }
    if (machineColshapes[index]) { machineColshapes[index].destroy(); delete machineColshapes[index]; }
    if (machineBlips[index]) { machineBlips[index].destroy(); delete machineBlips[index]; }
    if (machineLeaveColshapes[index]) { machineLeaveColshapes[index].destroy(); delete machineLeaveColshapes[index]; }

    if (fs.existsSync(savePath)) {
        const machines = JSON.parse(fs.readFileSync(savePath, 'utf8'));
        if (index < 0 || index >= machines.length) {
            player.outputChatBox(`!{Red}[SLOTS] Nu există aparatul cu ID-ul ${index}.`);
            return;
        }
        const removed = machines.splice(index, 1)[0];
        fs.writeFileSync(savePath, JSON.stringify(machines, null, 4));
        player.outputChatBox(`!{Green}[SLOTS] Aparatul #${index} "${removed.name}" a fost șters.`);
        mp.players.forEach(p => p.outputChatBox(`!{Red}[SLOTS] Aparatul #${index} "${removed.name}" a fost eliminat de un admin.`));
    } else {
        player.outputChatBox('!{Red}[SLOTS] Nu există aparate salvate.');
    }
});

// Events
mp.events.add('playerEnterColshape', (player, colshape) => {
    if (colshape.getVariable('isSlotsMachine')) {
        player.outputChatBox('!{Orange}[SLOTS]!{White} Ai ajuns la aparat. Apasă !{Green}E!{White} pentru a juca.');
        player.currentSlotsMachine = colshape;
    }
});

mp.events.add('playerExitColshape', (player, colshape) => {
    if (colshape.getVariable('isSlotsMachine')) {
        player.currentSlotsMachine = null;
    }

    if (colshape.getVariable('isSlotsLeaveZone')) {
        const { leaveMachine, getSessionByPlayer } = require('./slots_server');
        const session = getSessionByPlayer(player);

        if (session && session.id === colshape.getVariable('machineIndex')) {
            player.outputChatBox('!{Orange}[SLOTS] !{Red}Te-ai îndepărtat prea mult — ai fost scos automat.');
            leaveMachine(player);
        }
    }
});

mp.events.add('Server_PlayerAction', (player, actionName) => {
    if (actionName === 'interact') {
        if (player.currentSlotsMachine) {
            const machineIndex = player.currentSlotsMachine.getVariable('machineIndex');
            const machineName  = player.currentSlotsMachine.getVariable('machineName');

            mp.events.call('Server_JoinSlotsMachine', player, machineIndex, machineName);
        }
    }
});

// Util functions
function createBlip(position, index) {
    const blip = mp.blips.new(273, new mp.Vector3(position.x, position.y, position.z), {
        name: "Shining Crown",
        color: 46,
        shortRange: false,
        scale: 0.9
    });
    if (index !== undefined) machineBlips[index] = blip;
    return blip;
}

function createMarker(machine, index) {
    const label = mp.labels.new(
        getMarkerText(index, 'free', false),
        new mp.Vector3(machine.x, machine.y, machine.z + 1.1),
        { los: true, font: 4, drawDistance: 10, dimension: 0 }
    );
    machineLabels[index] = label;
    return label;
}

function createColshape(position, index, name) {
    const colShape = mp.colshapes.newCircle(position.x, position.y, 2.5, 0);
    colShape.setVariable('isSlotsMachine', true);
    colShape.setVariable('machineIndex', index);
    colShape.setVariable('machineName', name);
    machineColshapes[index] = colShape;
    return colShape;
}

function createLeaveColshape(position, index) {
    const colShape = mp.colshapes.newCircle(position.x, position.y, 8.0, 0);
    colShape.setVariable('isSlotsLeaveZone', true);
    colShape.setVariable('machineIndex', index);
    machineLeaveColshapes[index] = colShape;
    return colShape;
}

mp.events.add('_slots_updateMarker', (machineIndex, state, players, maxPlayers) => {
    updateMachineMarker(machineIndex, state, players, maxPlayers);
});

module.exports = { createBlip, createColshape, createLeaveColshape, createMarker, loadSlotsMachines };
