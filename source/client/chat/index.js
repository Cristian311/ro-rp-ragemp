'use strict';

mp.gui.chat.activate(false);
mp.gui.chat.show(false);

const chatBrowser = mp.browsers.new('package://chat/index.html');

mp.keys.bind(0x54, true, () => {
    chatBrowser.execute('setChatInputStatus(true)');
});

mp.keys.bind(0x21, true, () => {
    chatBrowser.execute('MESSAGE_LIST.scrollTop -= 150');
});

mp.keys.bind(0x22, true, () => {
    chatBrowser.execute('MESSAGE_LIST.scrollTop += 150');
});

mp.events.add('chat:receive', (payloadStr) => {
    let payload;
    try {
        payload = JSON.parse(payloadStr);
    } catch (_) {
        return;
    }

    const author = payload.author && payload.author.name ? String(payload.author.name) : '';
    const text   = String(payload.text || '');
    let displayText;

    switch (payload.type) {
        case 'system':
            displayText = `<span style="color:#FFD700">${text}</span>`;
            break;
        case 'global':
            displayText = `<span style="color:#FF8C00">[G] ${author}: ${text}</span>`;
            break;
        case 'nonrp':
            displayText = `<span style="color:#AAAAAA">(( ${author}: ${text} ))</span>`;
            break;
        default: // rp
            displayText = `${author}: ${text}`;
            break;
    }

    chatBrowser.execute(`chatAPI.push(${JSON.stringify(displayText)})`);
});
