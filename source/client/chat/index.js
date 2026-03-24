'use strict';

mp.gui.chat.activate(false);
mp.gui.chat.show(false);

const chatBrowser = mp.browsers.new('package://chat/index.html');

// Color map for named colors in !{ColorName} syntax
const _colorMap = {
    Red: '#FF0000', Green: '#00FF00', Blue: '#0000FF',
    White: '#FFFFFF', Yellow: '#FFFF00', Cyan: '#00FFFF',
    Orange: '#FF8C00', Pink: '#FF69B4', Purple: '#800080',
    Grey: '#808080', Gray: '#808080', Gold: '#FFD700'
};

function _clientColorize(text) {
    return text.replace(/!\{([0-9A-Fa-f]{6}|[A-Za-z]+)\}/g, (_, code) => {
        const hex = _colorMap[code] || ('#' + code);
        return `</span><span style="color:${hex}">`;
    });
}

// Global function for other client scripts to push colored messages to chat
// Usage: global.pushChatMessage('!{00FF00}[TAG] !{FFFFFF}Message text');
global.pushChatMessage = function(text) {
    const html = '<span>' + _clientColorize(String(text)) + '</span>';
    chatBrowser.execute(`chatAPI.push(${JSON.stringify(html)})`);
};

mp.keys.bind(0x54, true, () => {
    global.chatInputActive = true;
    chatBrowser.execute('setChatInputStatus(true)');
});

mp.keys.bind(0x21, true, () => {
    if (global.freecamActive) return;
    chatBrowser.execute('MESSAGE_LIST.scrollTop -= 150');
});

mp.keys.bind(0x22, true, () => {
    if (global.freecamActive) return;
    chatBrowser.execute('MESSAGE_LIST.scrollTop += 150');
});

mp.events.add('chat:open', () => {
    global.chatInputActive = true;
});

mp.events.add('chat:close', () => {
    global.chatInputActive = false;
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

// Camera system: show/hide chat
mp.events.add('camera:showChat', (visible) => {
    chatBrowser.execute(`document.body.style.display = ${visible ? "'block'" : "'none'"}`);
});
