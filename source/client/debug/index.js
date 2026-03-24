let isDebugVisible = false;
let debugText = "Astept date...";
let lineCount = 1;

const KEY_1 = 49;
const LINE_HEIGHT = 0.028; 
const PADDING_X = 0.008;
const PADDING_Y = 0.006;

function formatDebugText(rawText) {
    let lines = rawText.replace(/\\n/g, '\n').split('\n');
    lineCount = lines.length;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let colonIdx = line.indexOf(':');

        if (colonIdx !== -1) {
            let prefix = line.substring(0, colonIdx + 1);
            let suffix = line.substring(colonIdx + 1);
            lines[i] = `~y~${prefix}~w~${suffix}`;
        } else {
            lines[i] = `~w~${line}`;
        }
    }

    return lines.join('\n');
}

mp.keys.bind(KEY_1, true, () => {
    if (global.chatInputActive) return;
    isDebugVisible = !isDebugVisible;
    mp.gui.chat.push(`!{Grey}[Sistem] Debug HUD: ${isDebugVisible ? '!{Green}ON' : '!{Red}OFF'}`);
});

mp.events.add('Client_UpdateDebugHUD', (text) => {
    debugText = formatDebugText(text);
});

mp.events.add('render', () => {
    if (!isDebugVisible) return;

    const startX = 0.72; 
    const startY = 0.20; 
    const width = 0.25;  

    const LINE_HEIGHT = 0.020; 
    const PADDING_X = 0.005;
    const PADDING_Y = 0.010;

    const debugLines = debugText.split('\n');

    const height = (debugLines.length * LINE_HEIGHT) + (PADDING_Y * 2);

    const centerX = startX + (width / 2);
    const centerY = startY + (height / 2);

    mp.game.graphics.drawRect(centerX, centerY, width, height, 15, 15, 15, 200);

    for (let i = 0; i < debugLines.length; i++) {
        let currentY = startY + PADDING_Y + (i * LINE_HEIGHT) - 0.010;

        mp.game.graphics.drawText(debugLines[i], [startX + PADDING_X, currentY], {
            font: 4,
            color: [255, 255, 255, 255],
            scale: [0.35, 0.35],
            outline: true,
            centre: false 
        });
    }
});