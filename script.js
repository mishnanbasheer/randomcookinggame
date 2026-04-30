// Game Configuration
const GAME_CONFIG = {
    fps: 60,
    maxHappiness: 100,
    baseSpawnRate: 8000,
    minSpawnRate: 3000,
    spawnRateDecay: 500,
    basePatienceTime: 40000,
    minPatienceTime: 18000,
    patienceDecay: 2000,
    maxCustomers: 4,
    minActiveCustomers: 2,
    cookTime: 8000,
    maxGrillSlots: 4,
    maxPrepSlots: 5,
    comboWindow: 4000,
    comboGrace: 500,
    maxMultiplier: 4
};

function getSpawnRate() {
    if (gameState.phase === 'TUTORIAL') return 999999;
    const elapsed = (performance.now() - gameState.startTimestamp) / 60000;
    return Math.max(GAME_CONFIG.minSpawnRate, GAME_CONFIG.baseSpawnRate - (elapsed * GAME_CONFIG.spawnRateDecay));
}
function getPatienceTime() {
    if (gameState.phase === 'TUTORIAL') return 999999;
    return Math.max(GAME_CONFIG.minPatienceTime, GAME_CONFIG.basePatienceTime - (gameState.day * GAME_CONFIG.patienceDecay));
}

// Game State
let gameState = {
    phase: 'MODE_SELECT',
    tutorialStep: 0,
    isRunning: false,
    lastTime: 0,
    score: 0,
    happiness: 50,
    day: 1,
    customers: [],
    lastCustomerSpawnTime: 0,
    steamer: [null, null],
    grill: [null, null],
    coffee: [null],
    prepBoard: [[], [], []],
    grillSlotCount: 2,
    prepSlotCount: 3,

    // Timer
    timeLimit: 300000,
    gameTimer: 300000,
    startTimestamp: 0,

    // Combo System
    combo: 0,
    comboTimer: 0,
    comboWindow: GAME_CONFIG.comboWindow,
    maxCombo: 0,
    lastServeTime: 0,
    totalServed: 0,

    // Progression State
    zen: 0,
    isGoldenHour: false,
    goldenHourTimer: 0,
    customersSpawnedThisDay: 0,
    customersServedThisDay: 0,
    mishnanTimer: 0,
    isShopOpen: false,
    upgrades: { fairyLights: false, cat: false, coffee: false, mishnan: false }
};

function getComboMultiplier() {
    return Math.min(GAME_CONFIG.maxMultiplier, 1 + gameState.combo * 0.2);
}


// DOM Elements
const ui = {
    levelDisplay: document.getElementById('level-display'),
    happinessScore: document.getElementById('happiness-score'),
    happinessBar: document.getElementById('happiness-bar'),
    zenBar: document.getElementById('zen-bar'),
    pauseBtn: document.getElementById('pause-btn'),
    customerArea: document.getElementById('customer-area'),
    gameContainer: document.getElementById('game-container'),
    shopModal: document.getElementById('shop-modal'),
    pauseModal: document.getElementById('pause-modal'),
    startModal: document.getElementById('start-modal'),
    startBtn: document.getElementById('start-btn'),
    resumeBtn: document.getElementById('resume-btn'),
    toggleBgmBtn: document.getElementById('toggle-bgm'),
    toggleSfxBtn: document.getElementById('toggle-sfx'),
    tutorialBubble: document.getElementById('tutorial-bubble')
};

class AudioManager {
    constructor() {
        this.sfxEnabled = true;
        this.bgmEnabled = true;
        
        // Synth for SFX (works without files)
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch(e) {}

        // HTML Audio for BGM (User requested specific local file)
        this.bgmMain = new Audio('Cooking music no copyright - Stealth - Aakash Gandhi.mp3');
        this.bgmMain.loop = true;
        this.bgmMain.volume = 0.3;
        
        this.bgmGolden = new Audio('Cooking music no copyright - Stealth - Aakash Gandhi.mp3');
        this.bgmGolden.loop = true;
        this.bgmGolden.volume = 0; 
    }

    playTone(freq, type, duration, vol=0.1) {
        if (!this.sfxEnabled || !this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
    }

    playSound(id) {
        if (!this.sfxEnabled) return;
        if (id === 'click' || id === 'grab') this.playTone(600, 'sine', 0.1, 0.05);
        if (id === 'drop') this.playTone(300, 'square', 0.1, 0.05);
        if (id === 'error') this.playTone(150, 'sawtooth', 0.3, 0.1);
        if (id === 'success') {
            this.playTone(523.25, 'sine', 0.2, 0.1); 
            setTimeout(() => this.playTone(659.25, 'sine', 0.3, 0.1), 100); 
            setTimeout(() => this.playTone(783.99, 'sine', 0.4, 0.1), 200); 
        }
        if (id === 'chime') this.playTone(880, 'sine', 0.3, 0.05); 
    }

    stopSound(id) {
        // Synth handles its own stops
    }

    playBGM() {
        if (!this.bgmEnabled) return;
        this.bgmMain.play().catch(e => console.warn(e));
    }

    stopBGM() {
        this.bgmMain.pause();
        this.bgmGolden.pause();
    }

    setGoldenHourBGM(active) {
        if (!this.bgmEnabled) return;
        if (active) {
            this.bgmGolden.volume = 0.3;
            this.bgmGolden.play().catch(e => {});
            this.bgmMain.volume = 0;
        } else {
            this.bgmMain.volume = 0.3;
            this.bgmGolden.volume = 0;
        }
    }

    toggleSFX() {
        this.sfxEnabled = !this.sfxEnabled;
        if (!this.sfxEnabled) {
            this.stopSound('sizzle');
            this.stopSound('steam');
        }
        return this.sfxEnabled;
    }

    toggleBGM() {
        this.bgmEnabled = !this.bgmEnabled;
        if (this.bgmEnabled) this.playBGM();
        else this.stopBGM();
        return this.bgmEnabled;
    }
}

const audioManager = new AudioManager();

// Classes
class CookingItem {
    constructor(type, station) {
        this.type = type;
        this.station = station;
        this.state = 'cooking';
        this.timer = GAME_CONFIG.cookTime;
        this.maxTimer = GAME_CONFIG.cookTime;
    }
}
class Customer {
    constructor(id) {
        this.id = id;
        this.patience = 100; // 100% to 0%
        this.state = 'bonus'; // 'bonus' or 'standard'
        
        // Orders
        let orders = ['🥟', '🍩', 'burger']; 
        if (gameState.upgrades.coffee) {
            orders.push('☕');
        }
        this.order = orders[Math.floor(Math.random() * orders.length)];
        
        this.element = this.createElement();
        
        // Make customer a dropzone
        this.element.classList.add('dropzone');
        this.element.dataset.zone = 'customer';
        this.element.dataset.id = this.id;
        this.element.addEventListener('dragover', handleDragOver);
        this.element.addEventListener('dragenter', handleDragEnter);
        this.element.addEventListener('dragleave', handleDragLeave);
        this.element.addEventListener('drop', handleDrop);
    }

    createElement() {
        const div = document.createElement('div');
        div.className = 'customer';
        div.id = `customer-${this.id}`;
        
        const faces = ['🧑', '👩', '👴', '👵', '👱‍♀️', '👨‍🦰'];
        const face = faces[Math.floor(Math.random() * faces.length)];

        div.innerHTML = `
            <div class="speech-bubble">${this.order}</div>
            <div class="customer-body">${face}</div>
            <div class="patience-bar-container">
                <div class="patience-bar" id="patience-bar-${this.id}"></div>
            </div>
        `;
        return div;
    }
}

// Main Game Loop
function gameLoop(timestamp) {
    if (!gameState.isRunning) return;

    const deltaTime = timestamp - gameState.lastTime;
    gameState.lastTime = timestamp;

    update(deltaTime);
    render();

    requestAnimationFrame(gameLoop);
}

// Update game logic
function update(deltaTime) {
    if (gameState.isShopOpen) return;

    // Game Timer countdown
    if (gameState.phase === 'PLAYING') {
        gameState.gameTimer -= deltaTime;
        if (gameState.gameTimer <= 0) {
            gameState.gameTimer = 0;
            endGame();
            return;
        }
    }

    // Basic happiness pulse
    gameState.happiness = 50 + Math.sin(gameState.lastTime / 500) * 5;

    // Golden Hour
    if (gameState.isGoldenHour) {
        gameState.goldenHourTimer -= deltaTime;
        if (gameState.goldenHourTimer <= 0) {
            gameState.isGoldenHour = false;
            ui.gameContainer.classList.remove('golden-hour');
            audioManager.setGoldenHourBGM(false);
        }
    }

    // Combo Decay (soft)
    if (gameState.combo > 0 && gameState.phase === 'PLAYING') {
        gameState.comboTimer += deltaTime;
        if (gameState.comboTimer > gameState.comboWindow + GAME_CONFIG.comboGrace) {
            gameState.combo = Math.max(0, gameState.combo - 2);
            gameState.comboTimer = 0;
            updateComboUI();
        }
    }

    // Customer Spawning — continuous in timed mode
    if (gameState.phase === 'PLAYING') {
        const needsMinimum = gameState.customers.length < GAME_CONFIG.minActiveCustomers;
        const spawnReady = gameState.lastTime - gameState.lastCustomerSpawnTime > getSpawnRate();
        if (needsMinimum || spawnReady) {
            if (gameState.customers.length < GAME_CONFIG.maxCustomers) {
                spawnCustomer();
            }
            gameState.lastCustomerSpawnTime = gameState.lastTime;
        }
    }

    // Mishnan Auto-Serve Logic (Step 6)
    if (gameState.upgrades.mishnan) {
        gameState.mishnanTimer += deltaTime;
        if (gameState.mishnanTimer >= 25000) { // 25 seconds
            if (gameState.customers.length > 0) {
                // Execute Auto-Serve
                gameState.mishnanTimer = 0;
                let firstCustomer = gameState.customers[0];
                
                // audioManager.playSound('mishnan-help');
                
                let points = 25; // Standard 10 + 15 bonus
                if (gameState.isGoldenHour) points *= 2;
                
                gameState.score += points;
                gameState.happiness = Math.min(GAME_CONFIG.maxHappiness, gameState.happiness + points);
                
                // Visuals for Mishnan
                const mishnanEl = document.getElementById('mishnan-sprite');
                mishnanEl.classList.add('mishnan-action');
                celebrate(mishnanEl); 
                
                setTimeout(() => {
                    mishnanEl.classList.remove('mishnan-action');
                }, 500);

                // Customer reaction
                celebrate(firstCustomer.element);
                firstCustomer.element.classList.add('served');
                
                const customerElement = firstCustomer.element;
                setTimeout(() => {
                    if (customerElement.parentNode) {
                        customerElement.parentNode.removeChild(customerElement);
                    }
                }, 500);
                gameState.customers.shift();
                gameState.customersServedThisDay++;
            } else {
                // Buffer the timer so he helps instantly when next customer arrives
                gameState.mishnanTimer = 24900; 
            }
        }
    }

    // Customer Patience Logic
    gameState.customers.forEach(customer => {
        if (customer.state === 'bonus') {
            // Drain patience: 100% over patienceTime (ms)
            const drainRate = 100 / (getPatienceTime() / 1000); 
            customer.patience -= drainRate * (deltaTime / 1000);

            if (customer.patience <= 0) {
                customer.patience = 0;
                customer.state = 'standard';
            }
        }
    });

    // Cooking Logic
    let activeGrills = 0;
    let activeSteamers = 0;

    ['steamer', 'grill', 'coffee'].forEach(station => {
        gameState[station].forEach(item => {
            if (item && item.state === 'cooking') {
                item.timer -= deltaTime;
                if (station === 'grill') activeGrills++;
                if (station === 'steamer' || station === 'coffee') activeSteamers++;

                if (item.timer <= 0) {
                    item.timer = 0;
                    item.state = 'cooked';
                    audioManager.playSound('chime');
                    
                    // Automatically advance tutorial when patty finishes cooking
                    if (gameState.phase === 'TUTORIAL' && gameState.tutorialStep === 2 && station === 'grill') {
                        advanceTutorial();
                    }
                }
            }
        });
    });

    // Looping audio handled by synth or removed
}

function spawnCustomer() {
    const customer = new Customer(Date.now());
    gameState.customers.push(customer);
    ui.customerArea.appendChild(customer.element);
}

// Update UI
function render() {
    ui.happinessScore.innerText = gameState.score;
    ui.levelDisplay.innerText = gameState.day;

    // Update happiness bar width
    const happinessPercent = Math.max(0, Math.min(100, gameState.happiness));
    ui.happinessBar.style.width = `${happinessPercent}%`;

    // Render Zen Meter
    const zenPercent = gameState.isGoldenHour ? 100 : gameState.zen;
    ui.zenBar.style.width = `${zenPercent}%`;

    // Render Timer
    const timerEl = document.getElementById('timer-display');
    if (timerEl && gameState.phase === 'PLAYING') {
        const secs = Math.ceil(gameState.gameTimer / 1000);
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        document.getElementById('timer-text').innerText = `${m}:${s.toString().padStart(2, '0')}`;
        timerEl.classList.toggle('timer-warning', secs <= 30);
    }

    // Render customer patience bars
    gameState.customers.forEach(customer => {
        const bar = document.getElementById(`patience-bar-${customer.id}`);
        if (bar) {
            const container = bar.parentElement;
            if (customer.state === 'bonus') {
                bar.style.width = `${customer.patience}%`;
            } else {
                bar.style.width = '0%';
                if (!container.classList.contains('standard')) {
                    container.classList.add('standard');
                }
            }
        }
    });

    // Render Cooking Stations
    ['steamer', 'grill', 'coffee'].forEach(station => {
        gameState[station].forEach((item, index) => {
            const slot = document.getElementById(`${station}-${index + 1}`);
            if (item) {
                if (item.state === 'cooking') {
                    slot.draggable = false;
                    slot.classList.add(`${station}-active`);
                    const progress = 100 - (item.timer / item.maxTimer * 100);
                    const secondsLeft = Math.ceil(item.timer / 1000);
                    slot.innerHTML = `
                        <div class="cooking-item" style="background: conic-gradient(var(--accent-pink) ${progress}%, #e0e0e0 0);">
                            <div class="item-icon">${item.type}</div>
                        </div>
                        <div style="position: absolute; bottom: -5px; right: -5px; background: white; color: black; font-weight: bold; border-radius: 50%; width: 22px; height: 22px; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.2); font-size: 12px; z-index: 10;">
                            ${secondsLeft}
                        </div>
                    `;
                } else {
                    slot.draggable = true;
                    slot.dataset.type = item.type;
                    slot.dataset.zone = station;
                    slot.dataset.index = index;
                    slot.classList.remove(`${station}-active`);
                    slot.innerHTML = `<div class="cooking-item ready"><div class="item-icon">${item.type}</div></div>`;
                }
            } else {
                slot.draggable = false;
                slot.classList.remove(`${station}-active`);
                slot.innerHTML = '';
            }
        });
    });

    // Render Prep Board
    gameState.prepBoard.forEach((stack, index) => {
        const slot = document.getElementById(`prep-${index + 1}`);
        if (stack.length > 0) {
            slot.draggable = true;
            slot.dataset.type = 'prep_stack';
            slot.dataset.zone = 'prep';
            slot.dataset.index = index;
            
            let html = '';
            stack.forEach((item, i) => {
                let emoji = item === '🍞bot' ? '🍞' : item === '🍔top' ? '🍔' : item;
                let bottomOffset = 5 + (i * 15);
                html += `<div style="position: absolute; bottom: ${bottomOffset}px; left: 50%; transform: translateX(-50%); font-size: 36px; z-index: ${i + 1}; pointer-events: none; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">${emoji}</div>`;
            });
            slot.innerHTML = html;
        } else {
            slot.draggable = false;
            slot.innerHTML = '';
        }
    });
}

// Initialization
function initGame() {
    // Mode selection buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            gameState.timeLimit = parseInt(btn.dataset.time);
            gameState.gameTimer = gameState.timeLimit;
            document.getElementById('start-modal').style.display = 'none';
            audioManager.playBGM();
            startGame();
        });
    });
}

function startGame() {
    gameState.phase = 'TUTORIAL';
    gameState.tutorialStep = 0;
    gameState.isRunning = true;
    gameState.score = 0;
    gameState.happiness = 50;
    gameState.combo = 0;
    gameState.comboTimer = 0;
    gameState.comboWindow = GAME_CONFIG.comboWindow;
    gameState.maxCombo = 0;
    gameState.totalServed = 0;
    gameState.lastTime = performance.now();
    gameState.startTimestamp = performance.now();
    gameState.lastCustomerSpawnTime = gameState.lastTime;

    // Show timer + shop button
    document.getElementById('timer-display').style.display = 'block';
    document.getElementById('shop-toggle-btn').style.display = 'block';
    document.getElementById('combo-display').style.display = 'block';

    // Setup event listeners
    ui.pauseBtn.addEventListener('click', togglePause);
    ui.resumeBtn.addEventListener('click', togglePause);

    // Shop toggle (always accessible)
    document.getElementById('shop-toggle-btn').addEventListener('click', () => {
        audioManager.playSound('click');
        toggleShop();
    });
    document.getElementById('close-shop-btn').addEventListener('click', () => {
        audioManager.playSound('click');
        toggleShop();
    });

    // Play again
    document.getElementById('play-again-btn').addEventListener('click', () => {
        audioManager.playSound('click');
        document.getElementById('results-modal').style.display = 'none';
        resetGame();
    });

    ui.toggleBgmBtn.addEventListener('click', () => {
        audioManager.playSound('click');
        const isEnabled = audioManager.toggleBGM();
        ui.toggleBgmBtn.innerText = isEnabled ? '🎵 BGM: ON' : '🎵 BGM: OFF';
    });

    ui.toggleSfxBtn.addEventListener('click', () => {
        audioManager.playSound('click');
        const isEnabled = audioManager.toggleSFX();
        ui.toggleSfxBtn.innerText = isEnabled ? '🔊 SFX: ON' : '🔊 SFX: OFF';
    });

    setupInteractions();
    advanceTutorial();
    render();
    updateComboUI();
    requestAnimationFrame(gameLoop);
}

function endGame() {
    gameState.isRunning = false;
    gameState.isShopOpen = false;
    ui.shopModal.style.display = 'none';
    audioManager.stopBGM();

    // Show results
    document.getElementById('result-score').innerText = gameState.score;
    document.getElementById('result-served').innerText = gameState.totalServed;
    document.getElementById('result-combo').innerText = gameState.maxCombo;
    document.getElementById('result-multiplier').innerText = `x${getComboMultiplier().toFixed(1)}`;
    document.getElementById('results-modal').style.display = 'flex';
}

function resetGame() {
    // Clear customers
    gameState.customers.forEach(c => { if (c.element.parentNode) c.element.parentNode.removeChild(c.element); });
    gameState.customers = [];
    gameState.steamer = [null, null];
    gameState.grill = [null, null];
    gameState.coffee = [null];
    gameState.prepBoard = [[], [], []];
    gameState.grillSlotCount = 2;
    gameState.prepSlotCount = 3;
    gameState.day = 1;
    gameState.gameTimer = gameState.timeLimit;
    gameState.zen = 0;
    gameState.isGoldenHour = false;
    gameState.mishnanTimer = 0;
    gameState.upgrades = { fairyLights: false, cat: false, coffee: false, mishnan: false };
    ui.gameContainer.classList.remove('golden-hour', 'has-fairy-lights');
    document.getElementById('sleeping-cat').style.display = 'none';
    document.getElementById('drink-station').style.display = 'none';
    document.getElementById('mishnan-sprite').classList.add('hidden');

    // Restart
    gameState.phase = 'TUTORIAL';
    gameState.tutorialStep = 0;
    gameState.isRunning = true;
    gameState.score = 0;
    gameState.combo = 0;
    gameState.maxCombo = 0;
    gameState.totalServed = 0;
    gameState.lastTime = performance.now();
    gameState.startTimestamp = performance.now();
    gameState.lastCustomerSpawnTime = gameState.lastTime;
    renderAllSlots();
    advanceTutorial();
    render();
    updateComboUI();
    requestAnimationFrame(gameLoop);
}

function toggleShop() {
    gameState.isShopOpen = !gameState.isShopOpen;
    if (gameState.isShopOpen) {
        ui.shopModal.style.display = 'flex';
        updateShopButtons();
    } else {
        ui.shopModal.style.display = 'none';
    }
}

// Combo UI
function updateComboUI() {
    const display = document.getElementById('combo-display');
    const countEl = document.getElementById('combo-count');
    const multEl = document.getElementById('combo-multiplier');
    if (!display) return;

    countEl.innerText = gameState.combo;
    multEl.innerText = `x${getComboMultiplier().toFixed(1)}`;

    display.classList.remove('combo-hot', 'combo-fire');
    if (gameState.combo >= 8) display.classList.add('combo-fire');
    else if (gameState.combo >= 4) display.classList.add('combo-hot');

    // Bump animation
    countEl.classList.remove('combo-bump');
    void countEl.offsetWidth; // force reflow
    if (gameState.combo > 0) countEl.classList.add('combo-bump');
}

function showFloatingText(text, x, y) {
    const el = document.createElement('div');
    el.className = 'floating-text';
    el.innerText = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

function triggerScreenPulse() {
    ui.gameContainer.classList.remove('combo-screen-pulse');
    void ui.gameContainer.offsetWidth;
    ui.gameContainer.classList.add('combo-screen-pulse');
    setTimeout(() => ui.gameContainer.classList.remove('combo-screen-pulse'), 500);
}

// Pause logic
function togglePause() {
    audioManager.playSound('click');
    gameState.isRunning = !gameState.isRunning;
    if (gameState.isRunning) {
        ui.pauseModal.style.display = 'none';
        gameState.lastTime = performance.now();
        audioManager.playBGM();
        requestAnimationFrame(gameLoop);
    } else {
        ui.pauseModal.style.display = 'flex';
        audioManager.stopBGM();
        audioManager.stopSound('sizzle');
        audioManager.stopSound('steam');
    }
}

// Start the game when window loads
window.onload = initGame;

// ====== DYNAMIC SLOT RENDERING ======
function renderGrillSlots() {
    const container = document.getElementById('grill-slots-container');
    container.innerHTML = '';
    for (let i = 0; i < gameState.grillSlotCount; i++) {
        const slot = document.createElement('div');
        slot.className = 'grill-slot cooking-slot dropzone';
        slot.id = `grill-${i + 1}`;
        slot.dataset.zone = 'grill';
        slot.dataset.index = i;
        container.appendChild(slot);
    }
    while (gameState.grill.length < gameState.grillSlotCount) gameState.grill.push(null);
}

function renderSteamerSlots() {
    const container = document.getElementById('steamer-slots-container');
    container.innerHTML = '';
    for (let i = 0; i < gameState.steamer.length; i++) {
        const slot = document.createElement('div');
        slot.className = 'steamer-slot cooking-slot dropzone';
        slot.id = `steamer-${i + 1}`;
        slot.dataset.zone = 'steamer';
        slot.dataset.index = i;
        container.appendChild(slot);
    }
}

function renderPrepSlots() {
    const container = document.getElementById('prep-slots-container');
    container.innerHTML = '';
    for (let i = 0; i < gameState.prepSlotCount; i++) {
        const slot = document.createElement('div');
        slot.className = 'prep-slot dropzone';
        slot.id = `prep-${i + 1}`;
        slot.dataset.zone = 'prep';
        slot.dataset.index = i;
        container.appendChild(slot);
    }
    while (gameState.prepBoard.length < gameState.prepSlotCount) gameState.prepBoard.push([]);
}

function renderAllSlots() {
    renderGrillSlots();
    renderSteamerSlots();
    renderPrepSlots();
    rebindPointerEvents();
}

// ====== POINTER EVENT DRAG SYSTEM (Mobile + Desktop) ======
let draggedData = null;
let dragGhost = null;
let dragSourceEl = null;
let isDragging = false;

function createDragGhost() {
    if (document.getElementById('drag-ghost')) return document.getElementById('drag-ghost');
    const g = document.createElement('div');
    g.id = 'drag-ghost';
    document.body.appendChild(g);
    return g;
}

function getPointerXY(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
}

function onPointerDown(e) {
    if (gameState.isShopOpen || !gameState.isRunning) return;
    e.preventDefault();
    const el = e.currentTarget;
    let type = el.dataset.ingredient || el.dataset.type;
    let sourceZone = el.dataset.zone || 'bin';
    let sourceIndex = el.dataset.index || null;
    if (!type) return;

    // Tutorial gating
    if (gameState.phase === 'TUTORIAL') {
        if (gameState.tutorialStep === 1 && type !== '🥩') return;
        if (gameState.tutorialStep === 2) return;
        if (gameState.tutorialStep === 3 && type !== '🍞bot' && type !== '🥩') return;
        if (gameState.tutorialStep === 4 && type !== '🥬' && type !== '🍔top') return;
        if (gameState.tutorialStep === 5 && type !== 'prep_stack') return;
    }

    draggedData = { type, sourceZone, sourceIndex };
    dragSourceEl = el;
    isDragging = true;
    el.classList.add('dragging');
    audioManager.playSound('grab');

    // Show ghost
    dragGhost = createDragGhost();
    let emoji = type;
    if (type === 'prep_stack') emoji = '🍔';
    else if (type === '🍞bot') emoji = '🍞';
    else if (type === '🍔top') emoji = '🍔';
    dragGhost.textContent = emoji;
    dragGhost.style.display = 'block';
    const pos = getPointerXY(e);
    dragGhost.style.left = pos.x + 'px';
    dragGhost.style.top = pos.y + 'px';
}

function onPointerMove(e) {
    if (!isDragging || !dragGhost) return;
    e.preventDefault();
    const pos = getPointerXY(e);
    dragGhost.style.left = pos.x + 'px';
    dragGhost.style.top = pos.y + 'px';

    // Highlight drop zones
    document.querySelectorAll('.drop-active').forEach(el => el.classList.remove('drop-active'));
    const elUnder = document.elementFromPoint(pos.x, pos.y);
    if (elUnder) {
        const dropzone = elUnder.closest('.dropzone');
        if (dropzone && draggedData && isValidDrop(draggedData.type, dropzone.dataset.zone, dropzone.dataset.index)) {
            dropzone.classList.add('drop-active');
        }
    }
}

function onPointerUp(e) {
    if (!isDragging) return;
    e.preventDefault();
    isDragging = false;
    if (dragGhost) dragGhost.style.display = 'none';
    if (dragSourceEl) dragSourceEl.classList.remove('dragging');
    document.querySelectorAll('.drop-active').forEach(el => el.classList.remove('drop-active'));

    if (!draggedData) return;

    const pos = getPointerXY(e);
    const elUnder = document.elementFromPoint(pos.x, pos.y);
    let dropzone = null;
    if (elUnder) dropzone = elUnder.closest('.dropzone');

    if (dropzone && isValidDrop(draggedData.type, dropzone.dataset.zone, dropzone.dataset.index)) {
        let targetZone = dropzone.dataset.zone;
        let targetIndex = parseInt(dropzone.dataset.index);
        if (isNaN(targetIndex)) targetIndex = 0;
        executeDrop(draggedData, targetZone, targetIndex, dropzone);
        audioManager.playSound('drop');
    } else {
        audioManager.playSound('error');
    }

    draggedData = null;
    dragSourceEl = null;
}

function bindPointerToDraggable(el) {
    el.addEventListener('pointerdown', onPointerDown, { passive: false });
    el.addEventListener('touchstart', onPointerDown, { passive: false });
}

function rebindPointerEvents() {
    // Bins
    document.querySelectorAll('.bin').forEach(bindPointerToDraggable);
    // Cooking slots (for dragging cooked items)
    document.querySelectorAll('.cooking-slot').forEach(bindPointerToDraggable);
    // Prep slots
    document.querySelectorAll('.prep-slot').forEach(bindPointerToDraggable);
}

function setupInteractions() {
    // Create ghost element
    createDragGhost();
    
    // Global move/up listeners
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp, { passive: false });
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('touchend', onPointerUp, { passive: false });
    document.addEventListener('pointercancel', onPointerUp, { passive: false });
    document.addEventListener('touchcancel', onPointerUp, { passive: false });
    
    // Render dynamic slots and bind pointer events
    renderAllSlots();

    // Also keep HTML5 drag for desktop fallback
    document.querySelectorAll('.dropzone').forEach(zone => {
        zone.addEventListener('dragover', handleDragOver);
        zone.addEventListener('dragenter', handleDragEnter);
        zone.addEventListener('dragleave', handleDragLeave);
        zone.addEventListener('drop', handleDrop);
    });
    document.querySelectorAll('.bin').forEach(bin => {
        bin.addEventListener('dragstart', handleDragStart);
        bin.addEventListener('dragend', handleDragEnd);
    });
    document.querySelectorAll('.prep-slot').forEach(slot => {
        slot.addEventListener('dragstart', handleDragStart);
        slot.addEventListener('dragend', handleDragEnd);
    });
    document.querySelectorAll('.cooking-slot').forEach(slot => {
        slot.addEventListener('dragstart', handleDragStart);
        slot.addEventListener('dragend', handleDragEnd);
    });

    // Shop
    document.querySelectorAll('.buy-btn').forEach(btn => {
        btn.addEventListener('click', () => handleBuy(btn));
    });
}

function handleDragStart(e) {
    if (gameState.isShopOpen) return;
    
    let el = e.currentTarget;
    let type = el.dataset.ingredient || el.dataset.type;
    let sourceZone = el.dataset.zone || 'bin';
    let sourceIndex = el.dataset.index || null;

    if (gameState.phase === 'TUTORIAL') {
        if (gameState.tutorialStep === 1 && type !== '🥩') { e.preventDefault(); return; }
        if (gameState.tutorialStep === 2) { e.preventDefault(); return; } // Completely block dragging while waiting
        if (gameState.tutorialStep === 3 && type !== '🍞bot' && type !== '🥩') { e.preventDefault(); return; }
        if (gameState.tutorialStep === 4 && type !== '🥬' && type !== '🍔top') { e.preventDefault(); return; }
        if (gameState.tutorialStep === 5 && type !== 'prep_stack') { e.preventDefault(); return; }
    }

    draggedData = { type, sourceZone, sourceIndex };
    e.dataTransfer.setData('text/plain', type);
    el.classList.add('dragging');
    audioManager.playSound('grab');
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    draggedData = null;
    document.querySelectorAll('.drop-active').forEach(el => el.classList.remove('drop-active'));
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDragEnter(e) {
    e.preventDefault();
    if (draggedData && isValidDrop(draggedData.type, e.currentTarget.dataset.zone, e.currentTarget.dataset.index)) {
        e.currentTarget.classList.add('drop-active');
    }
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drop-active');
}

function handleDrop(e) {
    e.preventDefault();
    let target = e.currentTarget;
    target.classList.remove('drop-active');

    if (!draggedData) return;

    let targetZone = target.dataset.zone;
    let targetIndex = parseInt(target.dataset.index);
    if (isNaN(targetIndex)) targetIndex = 0; // Fallback to prevent sparse arrays

    if (isValidDrop(draggedData.type, targetZone, targetIndex)) {
        executeDrop(draggedData, targetZone, targetIndex, target);
        audioManager.playSound('drop');
    } else {
        audioManager.playSound('error');
    }
}

function isValidDrop(draggedType, targetZone, targetIndex) {
    if (gameState.phase === 'TUTORIAL') {
        let isAllowed = false;
        if (gameState.tutorialStep === 1 && targetZone === 'grill' && draggedType === '🥩') isAllowed = true;
        if (gameState.tutorialStep === 3 && targetZone === 'prep' && (draggedType === '🍞bot' || draggedType === '🥩')) isAllowed = true;
        if (gameState.tutorialStep === 4 && targetZone === 'prep' && (draggedType === '🥬' || draggedType === '🍔top')) isAllowed = true;
        if (gameState.tutorialStep === 5 && targetZone === 'customer' && draggedType === 'prep_stack') isAllowed = true;

        if (!isAllowed) return false;
        
        // Still enforce strict assembly stack rules during tutorial
        if (targetZone === 'prep') {
            let stack = gameState.prepBoard[targetIndex];
            if (stack.length === 0) return draggedType === '🍞bot'; // ONLY bot bun on empty
            let topItem = stack[stack.length - 1];
            if (topItem === '🍞bot' && draggedType === '🥩') return true;
            if (topItem === '🥩' && ['🥬', '🍔top'].includes(draggedType)) return true;
            if (topItem === '🥬' && draggedType === '🍔top') return true;
            return false;
        }
        return true;
    }

    if (targetZone === 'grill') {
        return (draggedType === '🥩' || draggedType === '🍩') && gameState.grill[targetIndex] === null;
    }
    if (targetZone === 'steamer') {
        return draggedType === '🥟' && gameState.steamer[targetIndex] === null;
    }
    if (targetZone === 'coffee') {
        return draggedType === '☕' && gameState.coffee[targetIndex] === null;
    }
    if (targetZone === 'prep') {
        let stack = gameState.prepBoard[targetIndex];
        if (stack.length === 0) {
            return ['🥟', '🍩', '☕', '🍞bot'].includes(draggedType);
        }
        let topItem = stack[stack.length - 1];
        if (topItem === '🍞bot' && draggedType === '🥩') return true;
        if (topItem === '🥩' && ['🥬', '🍅', '🍔top'].includes(draggedType)) return true;
        if (['🥬', '🍅'].includes(topItem) && ['🥬', '🍅', '🍔top'].includes(draggedType)) return true;
        return false;
    }
    if (targetZone === 'customer') {
        return draggedType === 'prep_stack'; 
    }
    return false;
}

function executeDrop(data, targetZone, targetIndex, targetElement) {
    // 1. Remove from source
    let draggedItemValue = data.type;
    if (data.sourceZone !== 'bin') {
        if (data.sourceZone === 'prep') {
            draggedItemValue = [...gameState.prepBoard[data.sourceIndex]];
            gameState.prepBoard[data.sourceIndex] = [];
        } else {
            draggedItemValue = gameState[data.sourceZone][data.sourceIndex].type;
            gameState[data.sourceZone][data.sourceIndex] = null;
        }
    }

    // 2. Add to target
    if (targetZone === 'prep') {
        gameState.prepBoard[targetIndex].push(draggedItemValue);
    } else if (targetZone === 'grill' || targetZone === 'steamer' || targetZone === 'coffee') {
        gameState[targetZone][targetIndex] = new CookingItem(draggedItemValue, targetZone);
    } else if (targetZone === 'customer') {
        let customerId = parseInt(targetElement.dataset.id);
        let customerIndex = gameState.customers.findIndex(c => c.id === customerId);
        if (customerIndex !== -1) {
            let customer = gameState.customers[customerIndex];
            let isMatch = false;
            let order = customer.order;
            
            if (order === 'burger' && isBurger(draggedItemValue)) isMatch = true;
            else if (draggedItemValue.length === 1 && draggedItemValue[0] === order) isMatch = true;
            
            if (isMatch) {
                if (gameState.phase !== 'TUTORIAL') {
                    // Update combo state
                    gameState.combo++;
                    gameState.comboTimer = 0;
                    if (gameState.combo > gameState.maxCombo) gameState.maxCombo = gameState.combo;
                    
                    // Serve time calculations for Combo Window adjustment
                    const serveTime = performance.now() - customer.id;
                    if (serveTime < 5000) {
                        gameState.comboWindow = Math.min(6000, gameState.comboWindow + 500);
                        showFloatingText('FAST!', targetElement.getBoundingClientRect().left, targetElement.getBoundingClientRect().top - 20);
                    } else if (serveTime > 15000) {
                        gameState.comboWindow = Math.max(2500, gameState.comboWindow - 500);
                    }
                    
                    // Calculate multiplier
                    const multiplier = getComboMultiplier();
                    
                    // Pitch bending sound
                    const baseFreq = 523.25; // C5
                    const pitchFreq = baseFreq + (gameState.combo * 40);
                    audioManager.playTone(pitchFreq, 'sine', 0.2, 0.1);
                    if (gameState.combo % 5 === 0) {
                        audioManager.playSound('success');
                        triggerScreenPulse();
                        celebrate(ui.gameContainer);
                    }
                    
                    // Update stats
                    let points = Math.floor(10 * multiplier);
                    if (customer.state === 'bonus') points += Math.floor((customer.patience / 10) * multiplier); 
                    if (gameState.isGoldenHour) points *= 2; 
                    
                    gameState.score += points;
                    gameState.happiness = Math.min(GAME_CONFIG.maxHappiness, gameState.happiness + points);
                    gameState.totalServed++;
                    gameState.customersServedThisDay++;
                    
                    // Zen integration
                    if (!gameState.isGoldenHour) {
                        gameState.zen += gameState.combo * 5; 
                        if (gameState.zen >= 100) {
                            gameState.zen = 100;
                            gameState.isGoldenHour = true;
                            gameState.goldenHourTimer = 15000;
                            ui.gameContainer.classList.add('golden-hour');
                            audioManager.setGoldenHourBGM(true);
                            gameState.zen = 0; 
                        }
                    }
                    
                    // Adrenaline Unlocks (Free)
                    if (gameState.combo === 5 && !gameState.unlocks?.extraGrill) {
                        gameState.unlocks = gameState.unlocks || {};
                        gameState.unlocks.extraGrill = true;
                        if (gameState.grillSlotCount < GAME_CONFIG.maxGrillSlots) {
                            gameState.grillSlotCount++;
                            gameState.grill.push(null);
                            renderGrillSlots();
                            rebindPointerEvents();
                            showFloatingText('UNLOCK: EXTRA GRILL!', window.innerWidth / 2 - 100, window.innerHeight / 2 - 50);
                        }
                    }
                    if (gameState.combo === 8 && !gameState.unlocks?.extraPrep) {
                        gameState.unlocks = gameState.unlocks || {};
                        gameState.unlocks.extraPrep = true;
                        if (gameState.prepSlotCount < GAME_CONFIG.maxPrepSlots) {
                            gameState.prepSlotCount++;
                            gameState.prepBoard.push([]);
                            renderPrepSlots();
                            rebindPointerEvents();
                            showFloatingText('UNLOCK: EXTRA PREP!', window.innerWidth / 2 - 100, window.innerHeight / 2 - 50);
                        }
                    }
                    
                    updateComboUI();
                } else {
                    audioManager.playSound('success');
                }
                
                celebrate(customer.element);
                customer.element.classList.add('served');
                const cEl = customer.element;
                setTimeout(() => { if (cEl.parentNode) cEl.parentNode.removeChild(cEl); }, 500);
                gameState.customers.splice(customerIndex, 1);
            } else {
                audioManager.playSound('error');
                if (data.sourceZone === 'prep') {
                    gameState.prepBoard[data.sourceIndex] = draggedItemValue; // Put back
                } else if (data.sourceZone === 'grill' || data.sourceZone === 'steamer' || data.sourceZone === 'coffee') {
                    // Put it back on the cooking slot it came from so we don't lose it
                    gameState[data.sourceZone][data.sourceIndex] = new CookingItem(draggedItemValue, data.sourceZone);
                    gameState[data.sourceZone][data.sourceIndex].state = 'cooked';
                    gameState[data.sourceZone][data.sourceIndex].timer = 0;
                }
            }
        }
    }

    // 3. Tutorial Advance
    if (gameState.phase === 'TUTORIAL') {
        if (gameState.tutorialStep === 1 && targetZone === 'grill') advanceTutorial();
        if (gameState.tutorialStep === 3 && targetZone === 'prep' && data.type === '🥩') advanceTutorial();
        if (gameState.tutorialStep === 4 && targetZone === 'prep' && data.type === '🍔top') advanceTutorial();
        if (gameState.tutorialStep === 5 && targetZone === 'customer') advanceTutorial();
    }
}

function isBurger(stack) {
    if (!Array.isArray(stack)) return false;
    if (stack.length < 3) return false;
    return stack[0] === '🍞bot' && stack[stack.length - 1] === '🍔top' && stack.includes('🥩');
}

function advanceTutorial() {
    gameState.tutorialStep++;
    const bubble = ui.tutorialBubble;
    if (gameState.tutorialStep === 1) {
        document.getElementById('mishnan-sprite').classList.remove('hidden');
        bubble.style.display = 'block';
        bubble.innerText = "Welcome to the Cafe! Let's make a burger. Drag a raw patty to the grill.";
    } else if (gameState.tutorialStep === 2) {
        bubble.innerText = "Great! Now wait for it to cook.";
    } else if (gameState.tutorialStep === 3) {
        bubble.innerText = "Perfect! Drag a Bottom Bun to the prep board, then drag the cooked patty onto it.";
    } else if (gameState.tutorialStep === 4) {
        bubble.innerText = "Now stack some Cabbage, and finish with a Top Bun!";
    } else if (gameState.tutorialStep === 5) {
        bubble.innerText = "A customer! Drag the finished burger to them!";
        let tutCustomer = new Customer(Date.now());
        tutCustomer.order = 'burger';
        gameState.customers.push(tutCustomer);
        ui.customerArea.appendChild(tutCustomer.element);
    } else if (gameState.tutorialStep === 6) {
        bubble.innerText = "You're a natural!";
        setTimeout(() => {
            bubble.style.display = 'none';
            document.getElementById('mishnan-sprite').classList.add('hidden');
            gameState.phase = 'PLAYING';
            gameState.lastCustomerSpawnTime = performance.now();
        }, 3000);
    }
}

function celebrate(element) {
    const rect = element.getBoundingClientRect();
    const colors = ['#A8E6CF', '#FFD3B6', '#FFAAA5', '#D0E1F9', '#FFDFD3'];
    
    for (let i = 0; i < 15; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        particle.style.left = `${rect.left + rect.width / 2}px`;
        particle.style.top = `${rect.top + rect.height / 2}px`;
        
        const angle = Math.random() * Math.PI * 2;
        const velocity = 30 + Math.random() * 50;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity;
        
        particle.style.setProperty('--tx', `${tx}px`);
        particle.style.setProperty('--ty', `${ty}px`);
        
        document.body.appendChild(particle);
        
        setTimeout(() => particle.remove(), 600);
    }
}

// Shop Logic
function openShop() {
    gameState.isShopOpen = true;
    ui.shopModal.style.display = 'flex';
    updateShopButtons();
}

function updateShopButtons() {
    document.querySelectorAll('.buy-btn').forEach(btn => {
        const upgradeId = btn.dataset.upgrade;
        const cost = parseInt(btn.dataset.cost);

        if (upgradeId === 'extraGrill') {
            if (gameState.grillSlotCount >= GAME_CONFIG.maxGrillSlots) {
                btn.innerText = 'MAX (4/4)';
                btn.disabled = true;
            } else {
                btn.innerText = `Buy (${cost} 💖) [${gameState.grillSlotCount}/${GAME_CONFIG.maxGrillSlots}]`;
                btn.disabled = gameState.score < cost;
            }
        } else if (upgradeId === 'expandPrep') {
            if (gameState.prepSlotCount >= GAME_CONFIG.maxPrepSlots) {
                btn.innerText = 'MAX (5/5)';
                btn.disabled = true;
            } else {
                btn.innerText = `Buy (${cost} 💖) [${gameState.prepSlotCount}/${GAME_CONFIG.maxPrepSlots}]`;
                btn.disabled = gameState.score < cost;
            }
        } else if (gameState.upgrades[upgradeId]) {
            btn.innerText = 'Owned';
            btn.disabled = true;
        } else {
            btn.disabled = gameState.score < cost;
        }
    });
}

function handleBuy(btn) {
    audioManager.playSound('click');
    const upgradeId = btn.dataset.upgrade;
    const cost = parseInt(btn.dataset.cost);

    // Handle repeatable infrastructure upgrades
    if (upgradeId === 'extraGrill') {
        if (gameState.score >= cost && gameState.grillSlotCount < GAME_CONFIG.maxGrillSlots) {
            audioManager.playSound('success');
            gameState.score -= cost;
            gameState.grillSlotCount++;
            gameState.grill.push(null);
            renderGrillSlots();
            rebindPointerEvents();
            // Flash the new slot
            const newSlot = document.getElementById(`grill-${gameState.grillSlotCount}`);
            if (newSlot) newSlot.classList.add('new-slot-flash');
            updateShopButtons();
            ui.happinessScore.innerText = gameState.score;
        }
        return;
    }
    if (upgradeId === 'expandPrep') {
        if (gameState.score >= cost && gameState.prepSlotCount < GAME_CONFIG.maxPrepSlots) {
            audioManager.playSound('success');
            gameState.score -= cost;
            gameState.prepSlotCount++;
            gameState.prepBoard.push([]);
            renderPrepSlots();
            rebindPointerEvents();
            const newSlot = document.getElementById(`prep-${gameState.prepSlotCount}`);
            if (newSlot) newSlot.classList.add('new-slot-flash');
            updateShopButtons();
            ui.happinessScore.innerText = gameState.score;
        }
        return;
    }

    // One-time upgrades
    if (gameState.score >= cost && !gameState.upgrades[upgradeId]) {
        audioManager.playSound('success');
        gameState.score -= cost;
        gameState.upgrades[upgradeId] = true;

        if (upgradeId === 'fairyLights') {
            ui.gameContainer.classList.add('has-fairy-lights');
        } else if (upgradeId === 'cat') {
            document.getElementById('sleeping-cat').style.display = 'inline-block';
        } else if (upgradeId === 'coffee') {
            document.getElementById('drink-station').style.display = 'flex';
        } else if (upgradeId === 'mishnan') {
            document.getElementById('mishnan-sprite').classList.remove('hidden');
        }

        updateShopButtons();
        ui.happinessScore.innerText = gameState.score;
    }
}

// ===== Mobile Layout & Scaling =====

function scaleGame() {
    const baseWidth = 390;
    const baseHeight = 780;

    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;

    const scale = Math.min(vw / baseWidth, vh / baseHeight);

    const game = document.querySelector(".game-container");
    if (game) {
        game.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
}

function checkOrientation() {
    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    // Show overlay when LANDSCAPE (width > height) — we want portrait play
    const isLandscape = vw > vh;
    const overlay = document.getElementById('portrait-overlay');
    if (!overlay) return;

    if (isLandscape) {
        overlay.style.display = 'flex';
        if (gameState.isRunning) {
            gameState.wasRunning = true;
            gameState.isRunning = false;
        }
    } else {
        overlay.style.display = 'none';
        if (gameState.wasRunning) {
            gameState.isRunning = true;
            gameState.lastTime = performance.now();
            gameState.wasRunning = false;
        }
        // Re-scale after returning to portrait
        scaleGame();
    }
}

// Resize & orientation listeners
window.addEventListener("resize", () => {
    scaleGame();
    checkOrientation();
});

window.addEventListener("orientationchange", () => {
    setTimeout(() => {
        scaleGame();
        checkOrientation();
    }, 150);
});

// Visual viewport (handles address bar show/hide on mobile)
if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
        scaleGame();
        checkOrientation();
    });
}

// Script is at end of <body> so DOM is already ready — call directly
scaleGame();
checkOrientation();

// Also call on window load (images/fonts loaded, final layout settled)
window.addEventListener("load", () => {
    scaleGame();
    checkOrientation();
});

// ===== Mobile Touch Hardening =====

// Prevent pinch zoom only (safe - doesn't affect game drags)
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

// Prevent pull-to-refresh ONLY when touch starts at the very top of body
// (not on game elements)
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) e.preventDefault(); // block multi-touch zoom
}, { passive: false });

