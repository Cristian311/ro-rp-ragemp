let isDebugVisible = false;
let debugText = "Aștept date...";
let lineCount = 1;

const KEY_R = 82;
const LINE_HEIGHT = 0.028; // Înălțimea reală a unei linii la scale 0.35
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

mp.keys.bind(KEY_R, true, () => {
    isDebugVisible = !isDebugVisible;
    mp.gui.chat.push(`!{Grey}[Sistem] Debug HUD: ${isDebugVisible ? '!{Green}ON' : '!{Red}OFF'}`);
});

mp.events.add('Client_UpdateDebugHUD', (text) => {
    debugText = formatDebugText(text);
});

mp.events.add('render', () => {
    if (!isDebugVisible) return;

    const startX = 0.78;
    const startY = 0.75;

    const width = 0.20;
    // Înălțimea calculată din numărul de linii + padding vertical (sus + jos)
    const height = (lineCount * LINE_HEIGHT) + (PADDING_Y * 2);

    // drawRect vrea centrul, nu colțul
    const centerX = startX + (width / 2);
    const centerY = startY + (height / 2);

    mp.game.graphics.drawRect(centerX, centerY, width, height, 15, 15, 15, 200);

    // Textul pornește din colțul stânga-sus + padding
    mp.game.graphics.drawText(debugText, [startX + PADDING_X, startY + PADDING_Y], {
        font: 4,
        color: [255, 255, 255, 255],
        scale: [0.35, 0.35],
        outline: true
    });
});