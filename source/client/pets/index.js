let myPet = null;

// ========== Event Handlers ==========

mp.events.add('pet:spawn', (pedRemoteId, name, state) => {
    myPet = {
        remoteId: pedRemoteId,
        name: name,
        state: state
    };

    // Wait for ped to stream in, then initialize
    setTimeout(() => {
        initPet();
    }, 1500);
});

mp.events.add('pet:updateName', (name) => {
    if (myPet) myPet.name = name;
});

mp.events.add('pet:order', (order) => {
    if (!myPet) return;
    myPet.state = order;
    applyOrder(order);
});

mp.events.add('pet:delete', () => {
    myPet = null;
});

// ========== Pet Helpers ==========

function getPed() {
    if (!myPet) return null;
    try {
        const ped = mp.peds.atRemoteId(myPet.remoteId);
        if (ped && ped.handle !== 0) return ped;
    } catch (e) {}
    return null;
}

function initPet() {
    const ped = getPed();
    if (!ped) {
        // Ped not streamed in yet, retry
        if (myPet) setTimeout(() => initPet(), 1000);
        return;
    }

    const handle = ped.handle;

    // Make pet invincible
    mp.game.invoke('0x3882114BDE571AD4', handle, true);

    // Block non-temporary events (prevent fleeing/reacting)
    mp.game.invoke('0x4F5F651ACCC9C4CF', handle, true);

    // Prevent pet from being targeted
    mp.game.invoke('0x63F58F7C80513AAD', handle, false);

    // Apply initial order
    applyOrder(myPet.state);
}

function applyOrder(order) {
    const ped = getPed();
    if (!ped) return;

    const handle = ped.handle;
    const playerHandle = mp.players.local.handle;

    // Clear current tasks
    mp.game.invoke('0xE1EF3C1216AFF2CD', handle);

    switch (order) {
        case 'follow':
        case 'come':
            // TASK_FOLLOW_TO_OFFSET_OF_ENTITY
            mp.game.invoke('0x304AE42E357B8C7E',
                handle,
                playerHandle,
                0.0, -1.0, 0.0,  // offset (behind player)
                2.0,              // movement speed
                -1,               // timeout (infinite)
                2.0,              // stopping range
                true              // persist following
            );
            break;

        case 'stay':
            // TASK_STAND_STILL
            mp.game.invoke('0x919BE13EED66F3FE', handle, -1);
            break;

        case 'sit':
            // TASK_START_SCENARIO_IN_PLACE - dog sitting
            mp.game.invoke('0x142A02425FF02BD9', handle, "WORLD_DOG_SITTING", 0, true);
            break;

        case 'lay':
            // TASK_START_SCENARIO_IN_PLACE - dog sleeping/lying
            mp.game.invoke('0x142A02425FF02BD9', handle, "WORLD_DOG_SLEEPING", 0, true);
            break;
    }
}

// ========== Follow Refresh & Teleport ==========

setInterval(() => {
    if (!myPet || myPet.state !== 'follow') return;

    const ped = getPed();
    if (!ped) return;

    const handle = ped.handle;
    const playerPos = mp.players.local.position;
    const pedPos = ped.position;

    const dx = playerPos.x - pedPos.x;
    const dy = playerPos.y - pedPos.y;
    const dz = playerPos.z - pedPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Teleport if too far away
    if (dist > 50.0) {
        mp.game.invoke('0x06843DA7060A026B', handle,
            playerPos.x + 2, playerPos.y + 2, playerPos.z,
            false, false, false, false);
        applyOrder('follow');
    }
    // Re-apply follow if pet seems stuck and far
    else if (dist > 8.0) {
        applyOrder('follow');
    }
}, 3000);

// ========== Render: Draw Pet Name Above Head ==========

mp.events.add('render', () => {
    if (!myPet) return;
    if (global.hudHidden || global.freecamActive) return;

    const ped = getPed();
    if (!ped) return;

    const pedPos = ped.position;
    const playerPos = mp.players.local.position;

    const dx = playerPos.x - pedPos.x;
    const dy = playerPos.y - pedPos.y;
    const dz = playerPos.z - pedPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > 20.0) return;

    // SET_DRAW_ORIGIN - project 3D coords to screen
    mp.game.invoke('0xAA0008F3BBB8F416', pedPos.x, pedPos.y, pedPos.z + 1.0, 0);

    mp.game.graphics.drawText(myPet.name, [0, 0], {
        font: 4,
        color: [255, 215, 0, 255],
        scale: [0.4, 0.4],
        outline: true,
        centre: true
    });

    // CLEAR_DRAW_ORIGIN
    mp.game.invoke('0xFF0B610F6BE0D7AF');
});
