let isDebugVisible = false;
let debugText = "Aștept date...";
let lineCount = 1;

const KEY_1 = 49;
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

mp.keys.bind(KEY_1, true, () => {
    isDebugVisible = !isDebugVisible;
    mp.gui.chat.push(`!{Grey}[Sistem] Debug HUD: ${isDebugVisible ? '!{Green}ON' : '!{Red}OFF'}`);
});

mp.events.add('Client_UpdateDebugHUD', (text) => {
    debugText = formatDebugText(text);
});

mp.events.add('render', () => {
    if (!isDebugVisible) return;

    // Setăm dimensiunile și poziția bazei (colțul stânga-sus al cutiei)
    const startX = 0.72; // L-am dat puțin mai în stânga ca să nu iasă de pe ecran
    const startY = 0.20; 
    const width = 0.25;  // Cutie un pic mai lată pentru a cuprinde tot textul

    // Spațiul real ocupat de un rând de text (Ajustat fix pentru scale 0.35)
    const LINE_HEIGHT = 0.020; 
    const PADDING_X = 0.005;
    const PADDING_Y = 0.010;

    // Împărțim textul în linii
    const debugLines = debugText.split('\n');

    // Înălțimea cutiei calculată exact pe baza numărului de linii
    const height = (debugLines.length * LINE_HEIGHT) + (PADDING_Y * 2);

    // GTA V cere coordonata centrului pentru a desena un dreptunghi (drawRect)
    const centerX = startX + (width / 2);
    const centerY = startY + (height / 2);

    // 1. Desenăm cutia neagră transparentă
    mp.game.graphics.drawRect(centerX, centerY, width, height, 15, 15, 15, 200);

    // 2. Desenăm textul, linie cu linie
    for (let i = 0; i < debugLines.length; i++) {
        // Calculăm poziția Y pentru fiecare linie
        // Am pus o mică corecție de -0.010 ca textul să nu pornească prea de jos
        let currentY = startY + PADDING_Y + (i * LINE_HEIGHT) - 0.010;

        mp.game.graphics.drawText(debugLines[i], [startX + PADDING_X, currentY], {
            font: 4,
            color: [255, 255, 255, 255],
            scale: [0.35, 0.35],
            outline: true,
            centre: false // <-- IMPORTANT: Asta forțează textul să se alinieze frumos la stânga!
        });
    }
});