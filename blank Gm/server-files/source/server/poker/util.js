function createBlip(position) {
    mp.blips.new(602, new mp.Vector3(position.x, position.y, position.z), {
        name: "Masa Poker",
        color: 2,    // 2 este Verde
        shortRange: false, // Apare doar când ești aproape de ea pe minimap
        scale: 1.0
    });
}

function createMarker(table, index) {
    mp.labels.new(`~g~Masa Poker ~w~#${index}\n~y~Apasa E pentru joc`, new mp.Vector3(table.x, table.y, table.z + 1.1), {
        los: true,
        font: 4,
        drawDistance: 10,
        dimension: 0
    });
}

function createColshape(position, index) {
    const colShape = mp.colshapes.newCircle(position.x, position.y, 2.0, 0); // 2.0 este raza in metri
    colShape.setVariable('isPokerTable', true);
    colShape.setVariable('tableID', index);
}



module.exports = {
    createBlip,
    createMarker,
    createColshape
};