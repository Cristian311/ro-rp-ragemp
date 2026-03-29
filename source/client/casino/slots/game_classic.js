// ══════════════════════════════════════════
// 7 LUCKY FRUITS — CLASSIC CONFIG
// ══════════════════════════════════════════

var CLASSIC_SYMBOLS = {
    star:       { emoji: '⭐', name: 'Star',        color: '#ffd700', img: 'icons/star.png' },
    seven:      { emoji: '7️⃣',  name: 'Seven',       color: '#e74c3c', img: 'icons/sapte.png' },
    bell:       { emoji: '🔔', name: 'Bell',        color: '#f39c12', img: 'icons/bell.png' },
    grapes:     { emoji: '🍇', name: 'Grapes',      color: '#8e44ad', img: 'icons/struguri.png' },
    watermelon: { emoji: '🍉', name: 'Watermelon',  color: '#27ae60', img: 'icons/pepene.png' },
    plum:       { emoji: '🍑', name: 'Plum',        color: '#e67e22', img: 'icons/pruna.png' },
    orange:     { emoji: '🍊', name: 'Orange',      color: '#f39c12', img: 'icons/portocala.png' },
    lemon:      { emoji: '🍋', name: 'Lemon',       color: '#f1c40f', img: 'icons/lamaie.png' },
    cherry:     { emoji: '🍒', name: 'Cherry',      color: '#c0392b', img: 'icons/cirese.png' },
};

var CLASSIC_PAYTABLE = {
    seven:      [135, 500, 2500],
    bell:       [85,  335, 1350],
    grapes:     [65,  275, 1000],
    watermelon: [55,  200, 675],
    plum:       [35,  135, 500],
    orange:     [30,  100, 335],
    lemon:      [16,  65,  250],
    cherry:     [16,  55,  175],
};

var CLASSIC_REEL_STRIPS = [
    ['cherry','lemon','orange','plum','seven','bell','grapes','watermelon','lemon','cherry',
     'orange','star','plum','bell','lemon','cherry','grapes','plum','orange','cherry',
     'seven','lemon','plum','cherry','watermelon','bell','orange','lemon','cherry','grapes'],
    ['lemon','cherry','bell','orange','plum','cherry','watermelon','grapes','lemon','seven',
     'cherry','orange','lemon','plum','lemon','bell','cherry','orange','grapes','cherry',
     'lemon','star','watermelon','plum','cherry','orange','lemon','bell','cherry','seven'],
    ['orange','lemon','cherry','grapes','bell','plum','cherry','lemon','watermelon','orange',
     'cherry','seven','lemon','plum','bell','orange','orange','cherry','grapes','lemon',
     'cherry','star','plum','bell','orange','cherry','lemon','watermelon','seven','cherry'],
    ['plum','cherry','lemon','orange','bell','cherry','grapes','lemon','watermelon','cherry',
     'orange','seven','plum','lemon','cherry','cherry','bell','orange','lemon','cherry',
     'grapes','star','plum','watermelon','cherry','lemon','orange','bell','cherry','seven'],
    ['cherry','orange','lemon','bell','plum','cherry','seven','grapes','lemon','orange',
     'cherry','watermelon','plum','lemon','bell','cherry','orange','grapes','lemon','cherry',
     'grapes','star','bell','plum','orange','lemon','cherry','watermelon','seven','cherry'],
];
