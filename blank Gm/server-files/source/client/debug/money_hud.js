// Money HUD - Display player money on screen
let playerMoney = 0;
let isMoneyHudVisible = true;

// Event to update money from server
mp.events.add('Client_UpdateMoney', (amount) => {
    playerMoney = amount;
});

// Render money on screen
mp.events.add('render', () => {
    if (!isMoneyHudVisible) return;

    // Position: Left-Center
    const x = 0.05;  // 5% from left edge
    const y = 0.50;  // Center vertically

    // Format money with commas
    const formattedMoney = playerMoney.toLocaleString('en-US');

    // Draw background box
    const boxWidth = 0.12;
    const boxHeight = 0.035;
    mp.game.graphics.drawRect(
        x + (boxWidth / 2),
        y,
        boxWidth,
        boxHeight,
        10, 15, 10, 200  // Dark semi-transparent background
    );

    // Draw money text
    mp.game.graphics.drawText(
        `$${formattedMoney}`,
        [x + 0.01, y - 0.015],
        {
            font: 4,
            color: [46, 204, 113, 255],  // Green color
            scale: [0.5, 0.5],
            outline: true,
            centre: false
        }
    );

    // Draw label above
    mp.game.graphics.drawText(
        'BANI',
        [x + 0.01, y - 0.032],
        {
            font: 4,
            color: [200, 200, 200, 255],  // Light gray
            scale: [0.35, 0.35],
            outline: true,
            centre: false
        }
    );
});

// Toggle visibility (optional)
mp.events.add('Client_ToggleMoneyHud', (visible) => {
    isMoneyHudVisible = visible;
});

console.log('[Money HUD] Loaded successfully');
