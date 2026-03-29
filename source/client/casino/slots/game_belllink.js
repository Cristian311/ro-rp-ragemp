// ══════════════════════════════════════════
// 7 LUCKY FRUITS — BELL LINK BONUS
// Logica specialei Bell Link + animații
// ══════════════════════════════════════════

var bellLinkActive = false;
var BL_RANDOM_FRUITS = ['cherry', 'lemon', 'orange', 'plum', 'grapes', 'watermelon', 'seven'];

function getRandomFruitImg() {
    var sym = BL_RANDOM_FRUITS[Math.floor(Math.random() * BL_RANDOM_FRUITS.length)];
    return SYMBOLS[sym] ? SYMBOLS[sym].img : '';
}

// ── Bell value badges on normal reel symbols ──

function showBellValueBadges(grid, bellPositions) {
    document.querySelectorAll('.bell-value-badge, .bell-boost-badge').forEach(function(b) { b.remove(); });

    for (var i = 0; i < bellPositions.length; i++) {
        var bp = bellPositions[i];
        var reel = document.querySelector('#reel-' + bp.reel + ' .reel-strip');
        if (!reel) continue;
        var stopIdx = currentReelPositions[bp.reel];
        var cellIdx = stopIdx + bp.row;
        var cells = reel.querySelectorAll('.sym-cell');
        if (cellIdx < cells.length) {
            var cell = cells[cellIdx];
            if (bp.isBoost) {
                var boostBadge = document.createElement('div');
                boostBadge.className = 'bell-boost-badge';
                boostBadge.textContent = 'REELS BOOST';
                cell.appendChild(boostBadge);
            } else {
                var badge = document.createElement('div');
                badge.className = 'bell-value-badge';
                badge.textContent = '$' + bp.value.toLocaleString('en-US');
                cell.appendChild(badge);
            }
        }
    }
}

function clearBellValueBadges() {
    document.querySelectorAll('.bell-value-badge, .bell-boost-badge').forEach(function(b) { b.remove(); });
}

// ── Bell Link grid builder ──

function buildBellLinkGrid(grid, boostCells) {
    var container = document.getElementById('belllink-grid');
    container.innerHTML = '';
    for (var row = 0; row < 3; row++) {
        for (var reel = 0; reel < 5; reel++) {
            var cell = document.createElement('div');
            cell.className = 'bl-cell';
            cell.dataset.row = row;
            cell.dataset.reel = reel;
            var val = grid[row][reel];
            if (val !== null) {
                cell.classList.add('has-bell');
                var isBoost = boostCells && boostCells[row] && boostCells[row][reel];
                if (isBoost) {
                    cell.classList.add('boost-bell');
                    cell.innerHTML =
                        '<img class="bl-cell-img" src="icons/bell-link.png" draggable="false">' +
                        '<div class="bl-boost-label">REELS BOOST</div>';
                } else {
                    cell.innerHTML =
                        '<img class="bl-cell-img" src="icons/bell-link.png" draggable="false">' +
                        '<div class="bl-cell-value">$' + val.toLocaleString('en-US') + '</div>';
                }
            } else {
                cell.innerHTML = '<img class="bl-cell-fruit" src="' + getRandomFruitImg() + '" draggable="false">';
            }
            container.appendChild(cell);
        }
    }
}

// ══ Bell Link SPIN state (use isSpinning from main) ══

var blSpinAnimTimer = null;

// Animate empty cells in bell link grid (shuffle random fruits) 
// to simulate reel spinning before result arrives
function blStartGridSpin() {
    var gridEl = document.getElementById('belllink-grid');
    if (!gridEl) return;
    // Rapidly shuffle fruit icons on non-bell cells
    blSpinAnimTimer = setInterval(function() {
        for (var i = 0; i < gridEl.children.length; i++) {
            var cell = gridEl.children[i];
            if (!cell.classList.contains('has-bell')) {
                cell.innerHTML = '<img class="bl-cell-fruit bl-cell-spinning" src="' + getRandomFruitImg() + '" draggable="false">';
            }
        }
    }, 80);
}

function blStopGridSpin() {
    if (blSpinAnimTimer) {
        clearInterval(blSpinAnimTimer);
        blSpinAnimTimer = null;
    }
}

// ── Bell Dance Animation ──
// Toate clopotele din grid dansează (bounce + wiggle)

function bellDanceAnimation() {
    var imgs = document.querySelectorAll('#belllink-grid .bl-cell.has-bell .bl-cell-img');
    imgs.forEach(function(img, i) {
        img.classList.remove('bell-dance');
        void img.offsetWidth; // force reflow to restart animation
        setTimeout(function() {
            img.classList.add('bell-dance');
            setTimeout(function() { img.classList.remove('bell-dance'); }, 1200);
        }, i * 80);
    });
}

// Animație bell-uri specială la triggerarea bonusului pe rolele normale
function bellTriggerCelebration(bellPositions) {
    for (var i = 0; i < bellPositions.length; i++) {
        var bp = bellPositions[i];
        var reel = document.querySelector('#reel-' + bp.reel + ' .reel-strip');
        if (!reel) continue;
        var stopIdx = currentReelPositions[bp.reel];
        var cellIdx = stopIdx + bp.row;
        var cells = reel.querySelectorAll('.sym-cell');
        if (cellIdx < cells.length) {
            cells[cellIdx].classList.add('bell-highlight');
            if (bp.isBoost) cells[cellIdx].classList.add('boost-bell-highlight');
            // Adaugă dans pe imagine
            var img = cells[cellIdx].querySelector('.sym-img');
            if (img) {
                img.classList.add('bell-dance');
                (function(el) {
                    setTimeout(function() { el.classList.remove('bell-dance'); }, 1200);
                })(img);
            }
        }
    }
}

function clearBellTriggerHighlights() {
    document.querySelectorAll('.bell-highlight, .boost-bell-highlight').forEach(function(el) {
        el.classList.remove('bell-highlight');
        el.classList.remove('boost-bell-highlight');
    });
}

// ══════════════════════════════════════════
// BELL LINK START (server → client)
// ══════════════════════════════════════════

function onBellLinkStart(dataJson) {
    var data = JSON.parse(dataJson);
    bellLinkActive = true;

    // Hide reels, show bell link overlay
    document.getElementById('reels-area').style.display = 'none';
    document.getElementById('belllink-overlay').classList.add('visible');

    // Update header
    document.getElementById('bl-respins').textContent = data.respinsLeft;
    document.getElementById('bl-total').textContent = data.total.toLocaleString('en-US');

    // Reels Boost indicator
    var boostEl = document.getElementById('bl-boost');
    var rulesEl = document.getElementById('bl-rules');
    if (data.reelsBoost) {
        boostEl.style.display = '';
        rulesEl.textContent = '12🔔 = 2x  ·  15🔔 = 4x  REELS BOOST';
    } else {
        boostEl.style.display = 'none';
        rulesEl.textContent = '15🔔 = 2x';
    }

    // Build grid
    buildBellLinkGrid(data.grid, data.boostCells);

    // Update info bar
    document.getElementById('win-line-text').textContent = '🔔 BELL LINK — RESPINS: ' + data.respinsLeft;
    document.getElementById('win-info-bar').classList.add('winning');

    SFX.freeSpins();
    showToast('🔔 BELL LINK ACTIVAT!', 2500);

    // Animație dans inițială pentru clopotele existente
    setTimeout(function() { bellDanceAnimation(); }, 300);

    // ★ MANUAL SPIN — jucătorul dă spin cu butonul principal
    isSpinning = false;
    renderUI();
}

// ══════════════════════════════════════════
// BELL LINK RESULT (server → client)
// ══════════════════════════════════════════

function onBellLinkResult(dataJson) {
    var data = JSON.parse(dataJson);

    // Stop grid spin animation
    blStopGridSpin();
    isSpinning = false;

    // Update header
    document.getElementById('bl-respins').textContent = data.respinsLeft;
    document.getElementById('bl-total').textContent = data.total.toLocaleString('en-US');

    // Re-randomize fruit icons on empty (non-bell) cells (final state)
    var gridEl = document.getElementById('belllink-grid');
    var newBellSet = new Set(data.newBells.map(function(nb) { return nb.row * 5 + nb.reel; }));
    for (var i = 0; i < gridEl.children.length; i++) {
        var cell = gridEl.children[i];
        if (!cell.classList.contains('has-bell') && !newBellSet.has(i)) {
            cell.innerHTML = '<img class="bl-cell-fruit" src="' + getRandomFruitImg() + '" draggable="false">';
        }
    }

    // Animate new bells cu dans!
    if (data.newBells.length > 0) {
        SFX.bellChime();
        for (var j = 0; j < data.newBells.length; j++) {
            var nb = data.newBells[j];
            var idx = nb.row * 5 + nb.reel;
            var newCell = gridEl.children[idx];
            if (newCell) {
                newCell.className = 'bl-cell has-bell new-bell';
                newCell.innerHTML =
                    '<img class="bl-cell-img" src="icons/bell-link.png" draggable="false">' +
                    '<div class="bl-cell-value">$' + nb.value.toLocaleString('en-US') + '</div>';
                (function(c) {
                    setTimeout(function() { c.classList.remove('new-bell'); }, 600);
                })(newCell);
            }
        }
        // După ce apar bell-urile noi, toate dansează!
        setTimeout(function() { bellDanceAnimation(); }, 700);
    }

    document.getElementById('win-line-text').textContent = '🔔 BELL LINK — RESPINS: ' + data.respinsLeft;

    if (data.finished) {
        // Bonusul s-a terminat
        bellLinkActive = false;

        var mult = data.multiplier || 1;
        var finalTotal = data.total * mult;

        if (mult > 1) {
            document.getElementById('win-line-text').textContent =
                '🔔 BELL LINK WIN: $' + data.total.toLocaleString('en-US') + ' × ' + mult + ' = $' + finalTotal.toLocaleString('en-US');
            showToast(mult + 'x MULTIPLIER!', 2500);
        } else {
            document.getElementById('win-line-text').textContent = '🔔 BELL LINK WIN: $' + finalTotal.toLocaleString('en-US');
        }

        // Show total win in win counter
        animateWinCounter(finalTotal);
        document.getElementById('win-display').classList.remove('hidden-win');
        if (finalTotal >= state.betPerLine * state.lines * 10) {
            document.getElementById('win-display').classList.add('big-win');
            spawnConfetti(80);
            SFX.winBig();
        }

        // Dans final de celebrare!
        bellDanceAnimation();

        // Dezactivăm spin

        // După un delay, ascundem bell link și arătăm rolele
        setTimeout(function() {
            document.getElementById('belllink-overlay').classList.remove('visible');
            document.getElementById('reels-area').style.display = '';
            document.getElementById('win-info-bar').classList.remove('winning');
            renderUI();
        }, turboMode ? 1500 : 3000);
    } else {
        // ★ MANUAL SPIN — jucătorul poate da iar spin
        renderUI();
    }
}

// ══════════════════════════════════════════
// BELL LINK SPIN (player action)
// ══════════════════════════════════════════

function doBellLinkSpin() {
    if (!bellLinkActive) return;
    if (isSpinning) return;
    // Set spinning state so main button blocks
    isSpinning = true;
    SFX.spinStart();
    // Start grid reel animation
    blStartGridSpin();
    renderUI();
    if (typeof mp !== 'undefined') {
        mp.trigger('Slots_BellLinkSpin');
    }
}
