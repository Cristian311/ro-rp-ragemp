// ══════════════════════════════════════════
// BOOK OF RA — CONFIG & LOGIC
// Simboluri, reel strips, free spins, animații
// ══════════════════════════════════════════

var BOR_SYMBOLS = {
    book:     { emoji: '📕', name: 'Book of Ra', color: '#c0392b', img: 'icons/book_of_ra/book.png' },
    explorer: { emoji: '🤠', name: 'Explorer',   color: '#e67e22', img: 'icons/book_of_ra/indiana_jones.png' },
    pharaoh:  { emoji: '👑', name: 'Pharaoh',    color: '#f1c40f', img: 'icons/book_of_ra/Totem.png' },
    mummy:    { emoji: '🧟', name: 'Mummy',      color: '#95a5a6', img: 'icons/book_of_ra/Mumie.png' },
    scarab:   { emoji: '🪲', name: 'Scarab',     color: '#27ae60', img: 'icons/book_of_ra/gandac.png' },
    ace:      { emoji: 'A',  name: 'Ace',        color: '#e74c3c', img: 'icons/book_of_ra/A.png' },
    king:     { emoji: 'K',  name: 'King',       color: '#3498db', img: 'icons/book_of_ra/K.png' },
    queen:    { emoji: 'Q',  name: 'Queen',      color: '#9b59b6', img: 'icons/book_of_ra/Q.png' },
    jack:     { emoji: 'J',  name: 'Jack',       color: '#2ecc71', img: 'icons/book_of_ra/J.png' },
    ten:      { emoji: '10', name: '10',         color: '#1abc9c', img: 'icons/book_of_ra/10.png' },
};

var BOR_PAYTABLE = {
    explorer: [10, 100, 1000, 5000],
    pharaoh:  [5,  40,  400,  2000],
    mummy:    [5,  30,  100,  750],
    scarab:   [5,  30,  100,  750],
    ace:      [0,  5,   40,   150],
    king:     [0,  5,   40,   150],
    queen:    [0,  5,   25,   100],
    jack:     [0,  5,   25,   100],
    ten:      [0,  5,   25,   100],
};

var BOR_REEL_STRIPS = [
    ['ten','jack','queen','king','ace','scarab','ten','jack','queen','mummy',
     'king','ten','jack','queen','ace','pharaoh','ten','jack','king','book',
     'ten','jack','queen','ace','scarab','mummy','ten','queen','explorer','king'],
    ['jack','ten','king','queen','ace','mummy','jack','ten','queen','scarab',
     'king','ten','jack','ace','queen','ten','jack','book','king','pharaoh',
     'ten','queen','jack','ace','ten','king','scarab','queen','jack','explorer'],
    ['queen','ten','jack','king','ace','ten','scarab','jack','queen','mummy',
     'king','ten','jack','queen','ace','ten','pharaoh','jack','king','queen',
     'book','ten','jack','ace','scarab','king','ten','explorer','queen','jack'],
    ['king','ten','jack','queen','ace','scarab','ten','jack','king','queen',
     'mummy','ten','jack','ace','king','queen','ten','jack','pharaoh','queen',
     'ten','jack','book','king','ace','ten','scarab','queen','jack','explorer'],
    ['ace','ten','jack','queen','king','ten','mummy','jack','scarab','queen',
     'king','ten','jack','ace','queen','pharaoh','ten','jack','king','queen',
     'ten','jack','ace','book','king','ten','explorer','queen','jack','scarab'],
];

// ── Book of Ra free spin state ──
var borFreeSpinActive = false;
var borExpandingSymbol = null;
var borFreeSpinAutoTimer = null;

// ══════════════════════════════════════════
// FREE SPIN REVEAL (trigger overlay)
// ══════════════════════════════════════════

function borShowFreeSpinReveal(expandingSymbol, freeSpinsLeft) {
    var s = SYMBOLS[expandingSymbol];
    if (!s) return;

    var revealEl = document.getElementById('bor-freespin-reveal');
    var revealImg = document.getElementById('bor-reveal-img');
    var revealName = document.getElementById('bor-reveal-name');

    if (s.img) {
        revealImg.src = s.img;
        revealImg.style.display = '';
    } else {
        revealImg.style.display = 'none';
    }
    revealName.textContent = s.name;
    revealEl.style.display = 'flex';

    SFX.freeSpins();
    showToast('📕 10 JOCURI GRATUITE!', 3000);

    // After reveal (3 seconds), hide reveal and start free spinning
    setTimeout(function() {
        revealEl.style.display = 'none';

        // Show free spin banner
        document.getElementById('bor-freespin-banner').style.display = 'flex';
        var symIcon = document.getElementById('bor-fs-sym-icon');
        if (s.img) {
            symIcon.src = s.img;
            symIcon.style.display = '';
        } else {
            symIcon.style.display = 'none';
        }
        document.getElementById('bor-fs-sym-name').textContent = s.name;
        borUpdateFreeSpinBanner(freeSpinsLeft, 0);

        // Start first free spin
        borFreeSpinAutoTimer = setTimeout(function() {
            doSpin();
        }, turboMode ? 400 : 1000);
    }, 3000);
}

// ══════════════════════════════════════════
// FREE SPIN BANNER UPDATE
// ══════════════════════════════════════════

function borUpdateFreeSpinBanner(spinsLeft, totalWin) {
    document.getElementById('bor-fs-count').textContent = spinsLeft;
    document.getElementById('bor-fs-total').textContent = (totalWin || 0).toLocaleString('en-US');
}

// ══════════════════════════════════════════
// FREE SPINS END
// ══════════════════════════════════════════

function borEndFreeSpins(totalWin) {
    if (borFreeSpinAutoTimer) { clearTimeout(borFreeSpinAutoTimer); borFreeSpinAutoTimer = null; }

    borFreeSpinActive = false;
    borExpandingSymbol = null;

    if (totalWin > 0) {
        showToast('📕 JOCURI GRATUITE — TOTAL: $' + totalWin.toLocaleString('en-US'), 3500);
        if (totalWin >= state.betPerLine * state.lines * 5) {
            spawnConfetti(80);
            SFX.winBig();
        }
    }

    // Hide banner after delay
    setTimeout(function() {
        document.getElementById('bor-freespin-banner').style.display = 'none';
        renderUI();
    }, turboMode ? 1500 : 3000);
}

// ══════════════════════════════════════════
// EXPANDING SYMBOL ANIMATION
// Animație dramatică când simbolul expandabil
// umple rolele — dans + glow + pulsare
// ══════════════════════════════════════════

function borAnimateExpansion(expandedReels, expandingSymbol) {
    var s = SYMBOLS[expandingSymbol];
    if (!s) return;

    for (var ri = 0; ri < expandedReels.length; ri++) {
        var reelIdx = expandedReels[ri];
        var strip = document.querySelector('#reel-' + reelIdx + ' .reel-strip');
        if (!strip) continue;
        var stopIdx = currentReelPositions[reelIdx];

        for (var row = 0; row < 3; row++) {
            var cellIdx = stopIdx + row;
            var cells = strip.querySelectorAll('.sym-cell');
            if (cellIdx < cells.length) {
                var cell = cells[cellIdx];
                cell.classList.add('bor-expanding');
                // Replace image cu simbol expandabil + animație de dans
                if (s.img) {
                    cell.innerHTML = '<img class="sym-img bor-expand-dance" src="' + s.img + '" alt="' + s.name + '" draggable="false">';
                } else {
                    cell.innerHTML = '<span class="sym-emoji bor-expand-dance">' + s.emoji + '</span>';
                }
            }
        }
    }

    // Sunet celebrare
    SFX.bellChime();

    // Animația persistă apoi se oprește
    setTimeout(function() {
        document.querySelectorAll('.bor-expanding').forEach(function(el) {
            el.classList.remove('bor-expanding');
        });
        document.querySelectorAll('.bor-expand-dance').forEach(function(el) {
            el.classList.remove('bor-expand-dance');
        });
    }, 1800);
}
