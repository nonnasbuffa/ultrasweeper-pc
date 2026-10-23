const screens = {
  mode: document.querySelector('#mode-screen'),
  game: document.querySelector('#game-screen')
};
const dialogs = {
  custom: document.querySelector('#custom-screen'),
  settings: document.querySelector('#settings-screen'),
  admin: document.querySelector('#admin-screen'),
  stats: document.querySelector('#stats-screen'),
  duel: document.querySelector('#duel-screen'),
  pass: document.querySelector('#pass-screen'),
  tutorial: document.querySelector('#tutorial-screen'),
  options: document.querySelector('#options-screen'),
  account: document.querySelector('#account-screen')
};

const boardElement = document.querySelector('#board');
const statusElement = document.querySelector('#game-status');
const counterElement = document.querySelector('#mine-counter');
const timerElement = document.querySelector('#timer');
const faceButton = document.querySelector('#face-button');
const faceImage = faceButton.querySelector('img');
const assetList = document.querySelector('#asset-list');
const assetError = document.querySelector('#asset-error');
const assetStorageKey = 'offline-minesweeper-assets-v1';
const legacyStorageKey = 'offline-minesweeper-legacy-mode-v1';
const accentStorageKey = 'offline-minesweeper-accent-v1';
const arenaStorageKey = 'offline-minesweeper-arena-v1';
const legacyToggle = document.querySelector('#legacy-toggle');
const musicStorageKey = 'offline-minesweeper-music-v1';
const musicToggle = document.querySelector('#music-toggle');
const volumeStorageKey = 'offline-minesweeper-volume-v1';
const volumeInput = document.querySelector('#music-volume');
const gameMusicButton = document.querySelector('#game-music');
const songStorageKey = 'offline-minesweeper-songs-v1';
const songLooks = ['modern', 'legacy'];
const builtInSongNames = { modern: 'Clear Signal', legacy: 'Classic Click' };
const maxSongBytes = 40 * 1024 * 1024;
const songErrors = {};
const arenaElement = document.querySelector('#game-screen');
// In the modern look only the play area moves; in legacy the whole window does.
const arenaBox = document.querySelector('#arena');
const arenaLock = document.querySelector('#arena-lock');
const accentInput = document.querySelector('#accent-color');
const defaultAccent = '#ffffff';
// SHA-256 of the admin password, so the password itself is not stored in the app files.
const adminPasswordHash = '632ae2cf6f9c8624a43ff9cfa0e4a7847b64ef1185a74dbd6f1d58e948560458';
const adminToggle = document.querySelector('#admin-toggle');
const adminToolsButton = document.querySelector('#open-admin');
const adminPanel = document.querySelector('#admin-panel');
const adminNote = document.querySelector('#admin-note');
const adminPanelStorageKey = 'offline-minesweeper-admin-panel-v1';
const statsStorageKey = 'offline-minesweeper-stats-v1';
const leaderboardSize = 10;
// The classic Windows sizes (Beginner, Intermediate = Medium, Expert = Hard), plus our own Insane.
const namedBoards = { '9x9x10': 'Beginner', '16x16x40': 'Medium', '30x16x99': 'Hard', '30x24x180': 'Insane' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const longPressDelay = 420;
// How close (in pixels) the game window must get to the centre before it snaps there.
const snapDistance = 12;
const duelBar = document.querySelector('#duel-bar');
const duelPrimary = document.querySelector('#duel-primary');
const duelSecondary = document.querySelector('#duel-secondary');
const gameHint = document.querySelector('.game-hint');
const normalHint = gameHint.textContent;
const tutorialStorageKey = 'offline-minesweeper-tutorial-v1';
// Tutorial pictures: one 5 × 5 board shown at different moments. o = open, c = closed, f = flagged.
const tutorialMines = [3, 10, 17, 18];
const tutorialSteps = [
  { title: 'The Goal', board: 'ooofo ooooo foooo ooffo ooooo',
    text: () => "Open every tile that isn't hiding a mine. Open them all and you win, but open a mine and it's game over." },
  { title: 'Open a Tile', board: 'oooccoooccccccccccccccccc', mark: [0],
    text: tap => `${tap} a tile to open it. Your first one is always safe. Tiles with no mines around them open their neighbors for you, so one ${tap.toLowerCase()} can clear a whole area.` },
  { title: 'Read the Numbers', board: 'oooco ooooo ccccc ccccc ccccc', mark: [2], target: [3],
    text: () => 'A number tells you how many mines touch that tile, diagonals included. The highlighted 1 has only one closed tile next to it, so that tile must be a mine.' },
  { title: 'Flag the Mines', board: 'ooofo ooooo ccccc ccccc ccccc', mark: [3],
    text: (tap, touch) => `${touch ? 'Hold a tile to put a flag on it (your phone buzzes), and hold it again to take the flag off.' : 'Right-click a tile (or press F) to put a flag on it, and do it again to take the flag off.'} Flags mark mines, so you can't open them by accident.` },
  { title: 'Clear Around a Number', board: 'ooofo ooooo fcccc ccccc ccccc', mark: [5], target: [11],
    text: tap => `When a number already has all its mines flagged, ${tap.toLowerCase()} it to open all its other neighbors at once. This 1 has its flag, so the closed tile next to it is safe.` },
  { title: "You're ready!", board: 'ooofo ooooo foooo ooffo ooooo',
    text: () => 'In a game, the left counter shows how many mines are left to flag, the right one is your time, and the face starts a new game. Good luck!' }
];
let tutorialStep = 0;
// Accounts: what an account carries between devices is the stats plus the settings that make the game feel like yours.
// (Custom pictures and songs stay on each device: they're far too big to send around.)
const accountStorageKey = 'offline-minesweeper-account-v1';
const syncStorageKey = 'offline-minesweeper-sync-v1';
const syncedKeys = [statsStorageKey, legacyStorageKey, accentStorageKey, musicStorageKey, volumeStorageKey, tutorialStorageKey];
const accountRow = document.querySelector('#account-row');
// null = not asked yet, { guest: true }, or a signed-in player { username, uid, refreshToken }.
let account = loadAccount();
let accountView = 'choice';
let accountFirstLaunch = false;
let syncState = 'saved';
let syncTimer = null;
// True while a cloud save is being copied in, so copying it doesn't count as a new change.
let applyingCloud = false;

const assetDefinitions = [
  { id: 'face', name: 'Smiley face', hint: 'Default and in-progress face' },
  { id: 'faceWin', name: 'Winning face', hint: 'Shown after clearing the board' },
  { id: 'faceLose', name: 'Losing face', hint: 'Shown after hitting a mine' },
  { id: 'flag', name: 'Flag', hint: 'Shown when a tile is flagged' },
  { id: 'mine', name: 'Mine', hint: 'Shown when a mine is revealed' },
  { id: 'covered', name: 'Covered tile', hint: 'Background used for unrevealed tiles' }
];

const defaults = {
  face: 'assets/face.svg',
  faceWin: 'assets/face-win.svg',
  faceLose: 'assets/face-lose.svg',
  flag: 'assets/flag.svg',
  mine: 'assets/mine.svg',
  covered: 'assets/covered.svg'
};

let assets = loadAssets();
let legacyMode = storageGet(legacyStorageKey) === 'true';
let accentColor = storageGet(accentStorageKey) || defaultAccent;
let musicOn = storageGet(musicStorageKey) !== 'false';
let musicVolume = storageGet(volumeStorageKey) === null ? 100 : Number(storageGet(volumeStorageKey));
let songInfo = loadSongInfo();
let game = null;
let timerId = null;
let currentScreen = 'mode';
let openDialogName = null;
let dialogReturnFocus = null;
let tileButtons = [];
let longPress = null;
// Tile under the mouse, so F flags what you're pointing at rather than the last tile you clicked.
let hoveredTile = null;
let arena = loadArena();
let arenaGesture = null;
// Admin access is remembered on this device until "Lock admin" is pressed in the admin panel.
const adminStorageKey = 'offline-minesweeper-admin-v1';
const adminState = { unlocked: storageGet(adminStorageKey) === 'unlocked', xray: false, shield: false, freeze: false };
// Tapping the board picture's tiles in this order (row/column, 1-based) opens the admin password prompt.
const adminTilePattern = [[1, 1], [2, 1], [3, 1], [4, 1], [4, 2], [4, 3], [4, 4], [1, 4], [2, 3], [3, 2]].map(([row, column]) => (row - 1) * 4 + column);
let patternStep = 0;
let lastPatternTap = 0;
let adminPanelDrag = null;
let stats = loadStats();
let statsBoard = '9x9x10';
// Largest scale that still fits the window; not saved, so the player's size comes back when there is room.
let arenaFit = Infinity;

applyLegacyMode();
applyAccentColor();
loadCustomSongs();
applyVolume();
applyMusic();
setUpTouchDevice();
setUpAdminPattern();
updateAdminUi();
applyArena();
runLoadingScreen();
updateClock();
window.setInterval(updateClock, 15000);
updateAccountUi();
pullProgress();

document.querySelector('#normal-game').addEventListener('click', () => startGame(9, 9, 10));
document.querySelector('#custom-game').addEventListener('click', () => {
  markPreset();
  openDialog('custom');
});
document.querySelector('#custom-form').addEventListener('submit', startCustomGame);
document.querySelector('.preset-row').addEventListener('click', event => {
  const preset = event.target.closest('[data-preset]');
  if (!preset) return;
  const [width, height, mines] = preset.dataset.preset.split(',');
  document.querySelector('#board-width').value = width;
  document.querySelector('#board-height').value = height;
  document.querySelector('#mine-count').value = mines;
  document.querySelector('#custom-error').textContent = '';
  markPreset();
});
document.querySelector('#custom-form').addEventListener('input', markPreset);
document.querySelector('#duel-game').addEventListener('click', () => openDuelDialog());
document.querySelector('#duel-form').addEventListener('submit', startDuelSetup);
duelPrimary.addEventListener('click', () => {
  if (game.duel === 'setup') finishDuelSetup();
  else openDuelDialog();
});
duelSecondary.addEventListener('click', () => {
  if (game.duel === 'setup') startGame(game.width, game.height, 0, 'setup');
  else restartGame();
});
document.querySelector('#pass-start').addEventListener('click', closeDialog);
document.querySelector('#pass-back').addEventListener('click', () => {
  closeDialog();
  game.duel = 'setup';
  game.layout = null;
  refreshGameAppearance();
  showDuelStatus();
  applyDuelUi();
});
document.querySelector('#back-to-menu').addEventListener('click', backToMenu);
document.querySelector('#xp-close-game').addEventListener('click', backToMenu);
arenaLock.addEventListener('click', () => {
  arena.locked = !arena.locked;
  saveArena();
  applyArena();
});
arenaElement.addEventListener('pointerdown', startArenaGesture);
arenaElement.addEventListener('dblclick', event => {
  if (arena.locked || isArenaControl(event.target) || !movableArena().contains(event.target)) return;
  arena.x = 0;
  arena.y = 0;
  arena.scale = 1;
  saveArena();
  applyArena();
});
window.addEventListener('resize', () => {
  if (!adminPanel.classList.contains('hidden')) placeAdminPanel();
  if (currentScreen !== 'game') return;
  keepArenaOnScreen();
  makeRoomForAdminPanel();
});
faceButton.addEventListener('click', restartGame);
document.querySelector('#open-settings').addEventListener('click', openAppearance);
document.querySelector('#menu-appearance').addEventListener('click', openAppearance);
document.querySelector('#menu-help').addEventListener('click', () => openTutorial(false));
document.querySelector('#menu-options').addEventListener('click', () => {
  delete accountRow.dataset.confirm;
  updateAccountUi();
  openDialog('options');
});
accountRow.addEventListener('click', clickAccountRow);
document.querySelector('#account-signup').addEventListener('click', () => showAccountView('signup'));
document.querySelector('#account-login').addEventListener('click', () => showAccountView('login'));
document.querySelector('#account-guest').addEventListener('click', closeDialog);
document.querySelector('#account-back').addEventListener('click', () => showAccountView('choice'));
document.querySelector('#account-switch').addEventListener('click', () => showAccountView(accountView === 'signup' ? 'login' : 'signup'));
document.querySelector('#account-form').addEventListener('submit', submitAccount);
// Changes made offline go up as soon as the connection is back, and right away when the app is put away.
window.addEventListener('online', () => {
  if (signedIn() && loadSyncInfo().dirty) pushProgress();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && syncTimer) pushProgress();
});
document.querySelector('#tutorial-yes').addEventListener('click', closeDialog);
document.querySelector('#tutorial-no').addEventListener('click', () => {
  storageSet(tutorialStorageKey, 'seen');
  showTutorialStep(0);
  document.querySelector('#tutorial-next').focus();
});
document.querySelector('#tutorial-back').addEventListener('click', () => showTutorialStep(tutorialStep - 1));
document.querySelector('#tutorial-next').addEventListener('click', () => {
  if (tutorialStep < tutorialSteps.length - 1) {
    showTutorialStep(tutorialStep + 1);
    return;
  }
  closeDialog();
  startGame(9, 9, 10);
});
document.querySelector('#restore-assets').addEventListener('click', () => {
  assets = {};
  saveAssets();
  renderAssets();
  // Also brings back the built-in tune for the current look.
  resetSong();
  refreshGameAppearance();
});
legacyToggle.addEventListener('click', () => setLegacyMode(!legacyMode));
musicToggle.addEventListener('click', () => setMusic(!musicOn));
volumeInput.addEventListener('input', () => {
  musicVolume = Number(volumeInput.value);
  storageSet(volumeStorageKey, String(musicVolume));
  applyVolume();
});
document.querySelector('#song-link-use').addEventListener('click', useSongLink);
document.querySelector('#song-link').addEventListener('keydown', event => {
  if (event.key === 'Enter') useSongLink();
});
document.querySelector('#song-file-pick').addEventListener('click', () => document.querySelector('#song-file').click());
document.querySelector('#song-file').addEventListener('change', event => {
  useSongFile(event.target.files[0]);
  event.target.value = '';
});
window.UltraMusic.onCustomError((look, message) => {
  songErrors[look] = `${message} Playing the built-in tune for now.`;
  if (openDialogName === 'settings' && look === currentLook()) renderSongPicker();
});
gameMusicButton.addEventListener('click', () => setMusic(!musicOn));
accentInput.addEventListener('input', () => {
  accentColor = accentInput.value;
  storageSet(accentStorageKey, accentColor);
  applyAccentColor();
});
document.querySelector('#reset-accent').addEventListener('click', () => {
  accentColor = defaultAccent;
  storageRemove(accentStorageKey);
  applyAccentColor();
});
adminToggle.addEventListener('click', () => {
  // Once unlocked this is just a status badge; locking again is done from the in-game admin panel.
  if (adminState.unlocked) return;
  document.querySelector('#admin-password').value = '';
  document.querySelector('#admin-error').textContent = '';
  openDialog('admin');
});
document.querySelector('#admin-form').addEventListener('submit', unlockAdmin);
document.querySelector('#menu-stats').addEventListener('click', () => openStats());
document.querySelector('#open-stats').addEventListener('click', () => openStats());
document.querySelector('#clear-stats').addEventListener('click', clearBoardStats);
document.querySelector('#stats-boards').addEventListener('click', event => {
  const tab = event.target.closest('[data-board]');
  if (tab) renderStats(tab.dataset.board);
});
adminPanel.addEventListener('pointerdown', startAdminPanelDrag);
adminToolsButton.addEventListener('click', () => toggleAdminPanel());
document.querySelector('#close-admin').addEventListener('click', () => toggleAdminPanel(false));
document.querySelector('#lock-admin').addEventListener('click', lockAdmin);
adminPanel.addEventListener('click', event => {
  const cheat = event.target.closest('[data-cheat]');
  if (cheat) {
    setCheat(cheat.dataset.cheat, !adminState[cheat.dataset.cheat]);
    return;
  }
  const action = event.target.closest('[data-action]');
  if (action) runAdminAction(action.dataset.action);
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', closeDialog));
Object.values(dialogs).forEach(dialog => dialog.addEventListener('mousedown', event => {
  if (event.target === dialog) closeDialog();
}));
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (openDialogName) {
    closeDialog();
  } else if (!adminPanel.classList.contains('hidden')) {
    toggleAdminPanel(false);
  }
});

boardElement.addEventListener('click', event => {
  const index = tileIndex(event.target);
  if (index === null) return;
  if (longPress && longPress.fired) {
    longPress = null;
    return;
  }
  const tile = game.tiles[index];
  if (tile.revealed) chord(index);
  else reveal(index);
});
boardElement.addEventListener('contextmenu', event => {
  const index = tileIndex(event.target);
  if (index === null) return;
  event.preventDefault();
  // Holding a tile on a phone also fires this, on top of the long-press timer: only the first of the two may flag.
  if (longPress) {
    if (longPress.fired) return;
    window.clearTimeout(longPress.timer);
    longPress.fired = true;
    if (navigator.vibrate) navigator.vibrate(25);
  }
  toggleFlag(index);
});
boardElement.addEventListener('auxclick', event => {
  const index = tileIndex(event.target);
  if (index !== null && event.button === 1) chord(index);
});
boardElement.addEventListener('pointermove', event => {
  if (event.pointerType === 'mouse') hoveredTile = tileIndex(event.target);
});
boardElement.addEventListener('pointerleave', () => { hoveredTile = null; });
document.addEventListener('keydown', handleArrowKeys);
boardElement.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch') {
    longPress = null;
    return;
  }
  const index = tileIndex(event.target);
  if (index === null) return;
  longPress = { index, fired: false, timer: window.setTimeout(() => {
    longPress.fired = true;
    toggleFlag(index);
    if (navigator.vibrate) navigator.vibrate(25);
  }, longPressDelay) };
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(type => boardElement.addEventListener(type, () => {
  if (longPress) window.clearTimeout(longPress.timer);
  if (longPress && !longPress.fired) longPress = null;
}));
boardElement.addEventListener('animationend', event => {
  const tile = event.target instanceof Element ? event.target.closest('.tile') : null;
  if (tile) tile.classList.remove('anim-reveal', 'anim-flag', 'anim-unflag', 'anim-mine');
});
['pointerdown', 'keydown'].forEach(type => boardElement.addEventListener(type, () => boardElement.classList.remove('board-enter')));
faceButton.addEventListener('animationend', () => faceButton.classList.remove('bump'));

function runLoadingScreen() {
  const loadingScreen = document.querySelector('#loading-screen');
  const progress = document.querySelector('#loading-progress');
  const text = document.querySelector('#loading-text');
  const sources = [...new Set(assetDefinitions.map(definition => asset(definition.id)).concat(Object.values(defaults)))];
  const minimumTime = reducedMotion.matches ? 0 : 1100;
  const startedAt = performance.now();
  let loaded = 0;

  const preload = sources.map(source => new Promise(resolve => {
    const image = new Image();
    const done = () => {
      loaded += 1;
      progress.style.transform = `scaleX(${loaded / sources.length})`;
      resolve();
    };
    image.onload = done;
    image.onerror = done;
    image.src = source;
  }));

  Promise.all([preload, document.fonts ? document.fonts.ready : null].flat()).then(() => {
    text.textContent = 'Ready';
    const wait = Math.max(0, minimumTime - (performance.now() - startedAt));
    window.setTimeout(() => {
      loadingScreen.classList.add('done');
      // First launch: sign up / log in / guest, then whether the player already knows the game.
      window.setTimeout(firstLaunchQuestions, 500);
      document.body.classList.remove('is-loading');
      screens.mode.classList.add('screen-enter');
      window.setTimeout(() => loadingScreen.remove(), 700);
    }, wait);
  });
}

function firstLaunchQuestions() {
  if (openDialogName || currentScreen !== 'mode') return;
  if (!account) openAccount('choice', true);
  else if (storageGet(tutorialStorageKey) !== 'seen') openTutorial(true);
}

function openTutorial(welcome) {
  document.querySelector('#tutorial-welcome').classList.toggle('hidden', !welcome);
  document.querySelector('#tutorial-steps').classList.toggle('hidden', welcome);
  if (!welcome) showTutorialStep(0);
  openDialog('tutorial');
  if (!welcome) window.setTimeout(() => document.querySelector('#tutorial-next').focus(), 60);
}

function showTutorialStep(index) {
  tutorialStep = Math.max(0, Math.min(tutorialSteps.length - 1, index));
  const step = tutorialSteps[tutorialStep];
  const touch = document.documentElement.classList.contains('touch-device');
  const last = tutorialStep === tutorialSteps.length - 1;
  document.querySelector('#tutorial-welcome').classList.add('hidden');
  document.querySelector('#tutorial-steps').classList.remove('hidden');
  document.querySelector('#tutorial-count').textContent = `Step ${tutorialStep + 1} of ${tutorialSteps.length}`;
  document.querySelector('#tutorial-step-title').textContent = step.title;
  document.querySelector('#tutorial-text').textContent = step.text(touch ? 'Tap' : 'Click', touch);
  document.querySelector('#tutorial-back').classList.toggle('invisible', tutorialStep === 0);
  document.querySelector('#tutorial-next').textContent = last ? 'Play a practice game' : 'Next';
  document.querySelector('#tutorial-dots').replaceChildren(...tutorialSteps.map((_, dot) => {
    const span = document.createElement('span');
    span.classList.toggle('active', dot === tutorialStep);
    return span;
  }));
  const near = index => tutorialMines.filter(mine => mine !== index && Math.abs((mine % 5) - (index % 5)) <= 1 && Math.abs(Math.floor(mine / 5) - Math.floor(index / 5)) <= 1).length;
  document.querySelector('#tutorial-board').replaceChildren(...[...step.board.replace(/ /g, '')].map((state, index) => {
    const tile = document.createElement('span');
    tile.className = 'tile';
    if (state === 'f') tile.append(icon('flag', ''));
    if (state === 'o') {
      const count = near(index);
      tile.classList.add('revealed');
      if (count) {
        tile.classList.add(`n${count}`);
        tile.textContent = count;
      }
    }
    if (step.mark && step.mark.includes(index)) tile.classList.add('tutorial-mark');
    if (step.target && step.target.includes(index)) tile.classList.add('tutorial-target');
    return tile;
  }));
}

const arrowMoves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function handleArrowKeys(event) {
  if (openDialogName || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.target instanceof Element && event.target.closest('input, textarea, select, #admin-panel')) return;
  const move = arrowMoves[event.key];
  const flagKey = event.key === 'f' || event.key === 'F';
  if (currentScreen === 'game' && game) {
    const focused = tileIndex(document.activeElement);
    if (flagKey) {
      const index = hoveredTile !== null ? hoveredTile : focused;
      if (index === null) return;
      event.preventDefault();
      toggleFlag(index);
      return;
    }
    if (!move) return;
    event.preventDefault();
    // Start from the focused tile, else the one under the mouse, else the middle of the board.
    let index = focused !== null ? focused : hoveredTile;
    if (index === null) {
      index = Math.floor(game.height / 2) * game.width + Math.floor(game.width / 2);
    } else {
      const x = Math.min(game.width - 1, Math.max(0, (index % game.width) + move[0]));
      const y = Math.min(game.height - 1, Math.max(0, Math.floor(index / game.width) + move[1]));
      index = y * game.width + x;
    }
    // Keyboard takes over from the mouse until it moves again.
    hoveredTile = null;
    tileButtons[index].focus();
  } else if (currentScreen === 'mode' && move) {
    event.preventDefault();
    moveMenuFocus(move);
  }
}

// Main menu: arrows jump to the nearest button in that direction, following the layout on screen.
function moveMenuFocus([dx, dy]) {
  const items = [...screens.mode.querySelectorAll('.menu-header button, .mode-card')].filter(item => item.offsetParent);
  const current = items.includes(document.activeElement) ? document.activeElement : null;
  if (!current) {
    document.querySelector('#normal-game').focus();
    return;
  }
  const from = current.getBoundingClientRect();
  const fromX = from.left + from.width / 2;
  const fromY = from.top + from.height / 2;
  let best = null;
  let bestScore = Infinity;
  items.forEach(item => {
    if (item === current) return;
    const rect = item.getBoundingClientRect();
    const along = dx ? (rect.left + rect.width / 2 - fromX) * dx : (rect.top + rect.height / 2 - fromY) * dy;
    if (along <= 1) return;
    // Left and right stay on the same row.
    if (dx && (rect.bottom <= from.top || rect.top >= from.bottom)) return;
    const across = dx ? Math.abs(rect.top + rect.height / 2 - fromY) : Math.abs(rect.left + rect.width / 2 - fromX);
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  });
  if (best) best.focus();
}

function backToMenu() {
  closeDialog();
  toggleAdminPanel(false);
  stopTimer();
  showScreen('mode');
}

function updateClock() {
  document.querySelector('#xp-clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function showScreen(name) {
  if (name === currentScreen) {
    screens[name].classList.remove('hidden');
    return;
  }
  const previous = screens[currentScreen];
  const next = screens[name];
  currentScreen = name;
  previous.classList.remove('screen-enter');
  previous.classList.add('hidden');
  next.classList.remove('hidden', 'screen-enter');
  void next.offsetWidth;
  next.classList.add('screen-enter');
  if (name === 'game') keepArenaOnScreen();
}

function setLegacyMode(value) {
  if (value === legacyMode) return;
  const change = () => {
    legacyMode = value;
    storageSet(legacyStorageKey, String(legacyMode));
    applyLegacyMode();
    if (currentScreen === 'game') keepArenaOnScreen();
  };
  if (document.startViewTransition && !reducedMotion.matches) document.startViewTransition(change);
  else change();
}

function loadArena() {
  const fallback = { x: 0, y: 0, scale: 1, locked: true };
  try {
    const stored = JSON.parse(localStorage.getItem(arenaStorageKey));
    if (!stored || typeof stored !== 'object') return fallback;
    return {
      x: Number.isFinite(stored.x) ? stored.x : 0,
      y: Number.isFinite(stored.y) ? stored.y : 0,
      scale: Number.isFinite(stored.scale) ? Math.min(2.4, Math.max(0.5, stored.scale)) : 1,
      locked: stored.locked !== false
    };
  } catch {
    return fallback;
  }
}

function saveArena() {
  storageSet(arenaStorageKey, JSON.stringify(arena));
}

function applyArena() {
  arenaElement.style.setProperty('--arena-x', `${Math.round(arena.x)}px`);
  arenaElement.style.setProperty('--arena-y', `${Math.round(arena.y)}px`);
  // On touch screens an un-resized board grows to fill the space for finger-sized tiles.
  const fillScreen = arena.scale === 1 && document.documentElement.classList.contains('touch-device');
  const scale = fillScreen ? Math.min(2.4, arenaFit) : Math.min(arena.scale, arenaFit);
  arenaElement.style.setProperty('--arena-scale', scale.toFixed(3));
  arenaElement.classList.toggle('unlocked', !arena.locked);
  arenaLock.setAttribute('aria-pressed', String(arena.locked));
  const label = arena.locked ? 'Unlock to move and resize the game' : 'Lock the game in place';
  arenaLock.setAttribute('aria-label', label);
  arenaLock.title = arena.locked ? 'Unlock to move and resize' : 'Lock in place';
  arenaLock.querySelector('use').setAttribute('href', arena.locked ? '#icon-lock' : '#icon-unlock');
}

function isArenaControl(target) {
  return Boolean(target.closest('button, input, a, .board')) && !target.closest('.arena-grip');
}

function movableArena() {
  return legacyMode ? arenaElement : arenaBox;
}

function startArenaGesture(event) {
  if (arena.locked || event.button !== 0 || isArenaControl(event.target) || !movableArena().contains(event.target)) return;
  const resizing = Boolean(event.target.closest('.arena-grip'));
  const baseTile = parseFloat(getComputedStyle(arenaElement).getPropertyValue('--tile-size')) || 32;
  arenaGesture = {
    pointerId: event.pointerId,
    resizing,
    startX: event.clientX,
    startY: event.clientY,
    x: arena.x,
    y: arena.y,
    scale: parseFloat(arenaElement.style.getPropertyValue('--arena-scale')) || arena.scale,
    baseTile
  };
  window.addEventListener('pointermove', moveArenaGesture);
  window.addEventListener('pointerup', endArenaGesture);
  window.addEventListener('pointercancel', endArenaGesture);
  arenaElement.classList.add(resizing ? 'resizing' : 'dragging');
  event.preventDefault();
}

function moveArenaGesture(event) {
  if (!arenaGesture || event.pointerId !== arenaGesture.pointerId) return;
  if (!(event.buttons & 1)) {
    endArenaGesture(event);
    return;
  }
  const dx = event.clientX - arenaGesture.startX;
  const dy = event.clientY - arenaGesture.startY;
  if (arenaGesture.resizing) {
    const columns = game ? game.width : 9;
    const rows = game ? game.height : 9;
    const startTile = arenaGesture.baseTile * arenaGesture.scale;
    const nextTile = Math.min(64, Math.max(16, startTile + (dx / columns + dy / rows) / 2));
    const before = movableArena().getBoundingClientRect();
    arena.scale = Math.min(2.4, arenaFit, Math.max(0.5, nextTile / arenaGesture.baseTile));
    applyArena();
    const after = movableArena().getBoundingClientRect();
    arena.x += before.left - after.left;
    arena.y += before.top - after.top;
    applyArena();
  } else {
    arena.x = arenaGesture.x + dx;
    arena.y = arenaGesture.y + dy;
    applyArena();
    snapArenaToCenter();
    keepArenaOnScreen(false);
  }
}

// The space the game window may move in: below the button bar (modern) or above the taskbar (legacy).
function arenaBounds() {
  const safe = safeArea();
  // Leave room for the modern dashed frame and resize grip around the arena.
  const pad = legacyMode ? 0 : 20;
  const width = document.documentElement.clientWidth;
  const top = legacyMode ? Math.max(pad, safe.top) : document.querySelector('.game-header').getBoundingClientRect().bottom + 16;
  const bottom = window.innerHeight - safe.bottom - (legacyMode ? 30 : pad);
  return { left: pad, right: width - pad, top, bottom };
}

// The centre of that space, where the game window snaps to.
function centerArea() {
  const bounds = arenaBounds();
  return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2, top: bounds.top, bottom: bounds.bottom };
}

// Like the smart guides in PowerPoint: near the exact centre, the window clicks into place and a guide line shows.
function snapArenaToCenter() {
  const rect = movableArena().getBoundingClientRect();
  const area = centerArea();
  const offsetX = area.x - (rect.left + rect.width / 2);
  const offsetY = area.y - (rect.top + rect.height / 2);
  const snapX = Math.abs(offsetX) <= snapDistance;
  const snapY = Math.abs(offsetY) <= snapDistance;
  if (snapX) arena.x += offsetX;
  if (snapY) arena.y += offsetY;
  if (snapX || snapY) applyArena();
  if ((snapX && !arenaGesture.snapX) || (snapY && !arenaGesture.snapY)) {
    // A tiny buzz on phones that support it, so the snap can be felt.
    if (navigator.vibrate && document.documentElement.classList.contains('touch-device')) navigator.vibrate(8);
  }
  arenaGesture.snapX = snapX;
  arenaGesture.snapY = snapY;
  showSnapGuides(snapX, snapY, area);
}

function showSnapGuides(vertical, horizontal, area) {
  const guides = snapGuides();
  guides.vertical.classList.toggle('visible', vertical);
  guides.horizontal.classList.toggle('visible', horizontal);
  if (vertical) Object.assign(guides.vertical.style, { left: `${area.x}px`, top: `${area.top}px`, height: `${area.bottom - area.top}px` });
  if (horizontal) guides.horizontal.style.top = `${area.y}px`;
}

function snapGuides() {
  let vertical = document.querySelector('.snap-guide.vertical');
  let horizontal = document.querySelector('.snap-guide.horizontal');
  if (!vertical) {
    vertical = document.createElement('div');
    vertical.className = 'snap-guide vertical';
    horizontal = document.createElement('div');
    horizontal.className = 'snap-guide horizontal';
    document.body.append(vertical, horizontal);
  }
  return { vertical, horizontal };
}

function endArenaGesture(event) {
  if (!arenaGesture || event.pointerId !== arenaGesture.pointerId) return;
  arenaGesture = null;
  window.removeEventListener('pointermove', moveArenaGesture);
  window.removeEventListener('pointerup', endArenaGesture);
  window.removeEventListener('pointercancel', endArenaGesture);
  arenaElement.classList.remove('dragging', 'resizing');
  showSnapGuides(false, false);
  keepArenaOnScreen();
}

function fitArenaToWindow() {
  arenaFit = Infinity;
  applyArena();
  const rect = arenaElement.getBoundingClientRect();
  const boardRect = boardElement.getBoundingClientRect();
  if (!rect.width || !boardRect.width) return;
  // The board was just measured at this (uncapped) scale.
  const scale = parseFloat(arenaElement.style.getPropertyValue('--arena-scale')) || arena.scale;
  // Horizontal room taken by the board container's padding and borders (its width may be capped and scrolling).
  const wrapStyle = getComputedStyle(boardElement.parentElement);
  const wrapChrome = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((sum, key) => sum + parseFloat(wrapStyle[key]), 0);
  const availableWidth = document.documentElement.clientWidth - (legacyMode ? 52 : 64) - wrapChrome;
  const safe = safeArea();
  const availableHeight = window.innerHeight - safe.top - safe.bottom - (legacyMode ? 86 : 64) - (rect.height - boardRect.height);
  const fit = scale * Math.min(availableWidth / boardRect.width, availableHeight / boardRect.height);
  // Low enough that the tall Insane board still fits a short window.
  arenaFit = Math.max(0.4, fit);
  applyArena();
}

// Height of the screen areas the phone reserves (notch, Dynamic Island, home bar); zero on PC.
function safeArea() {
  let probe = document.querySelector('.safe-probe');
  if (!probe) {
    probe = document.createElement('div');
    probe.className = 'safe-probe';
    document.body.append(probe);
  }
  const style = getComputedStyle(probe);
  return { top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
}

function keepArenaOnScreen(save = true) {
  if (!arenaGesture) fitArenaToWindow();
  const rect = movableArena().getBoundingClientRect();
  if (!rect.width) return;
  const bounds = arenaBounds();
  // Only ever undo the player's own offset, so default layouts are never pushed around.
  if (rect.right > bounds.right && arena.x > 0) arena.x -= Math.min(arena.x, rect.right - bounds.right);
  if (rect.left < bounds.left && arena.x < 0) arena.x += Math.min(-arena.x, bounds.left - rect.left);
  if (rect.bottom > bounds.bottom && arena.y > 0) arena.y -= Math.min(arena.y, rect.bottom - bounds.bottom);
  // Modern: keep the play area below the button bar it no longer moves with.
  if (rect.top < bounds.top && arena.y < 0) arena.y += Math.min(-arena.y, bounds.top - rect.top);
  applyArena();
  if (save) saveArena();
}

function openDialog(name) {
  if (openDialogName) closeDialog();
  openDialogName = name;
  dialogReturnFocus = document.activeElement;
  const dialog = dialogs[name];
  dialog.classList.remove('hidden', 'closing');
  pauseTimer();
  const focusTarget = dialog.querySelector('input:not([type="range"]), .primary-button, .upload-button');
  if (focusTarget) window.setTimeout(() => focusTarget.focus(), 60);
}

function closeDialog() {
  if (!openDialogName) return;
  const dialog = dialogs[openDialogName];
  // Answering the first-launch question in any way (yes, no or closing it) means it's never asked again.
  if (openDialogName === 'tutorial') storageSet(tutorialStorageKey, 'seen');
  // Closing the first question without choosing means playing as a guest; the tutorial question comes next.
  const afterAccount = openDialogName === 'account' && accountFirstLaunch;
  if (openDialogName === 'account' && !account) {
    account = { guest: true };
    saveAccount();
    updateAccountUi();
  }
  openDialogName = null;
  if (afterAccount) {
    accountFirstLaunch = false;
    window.setTimeout(firstLaunchQuestions, 350);
  }
  dialog.classList.add('closing');
  const finish = () => {
    dialog.classList.add('hidden');
    dialog.classList.remove('closing');
  };
  if (reducedMotion.matches || legacyMode) finish();
  else window.setTimeout(finish, 180);
  resumeTimer();
  if (dialogReturnFocus && document.contains(dialogReturnFocus)) dialogReturnFocus.focus();
}

// Highlights the preset that matches the numbers in the form, if any.
function markPreset() {
  const current = ['#board-width', '#board-height', '#mine-count'].map(id => Number(document.querySelector(id).value)).join(',');
  document.querySelectorAll('.preset-button').forEach(button => {
    const active = button.dataset.preset === current;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
}

function startCustomGame(event) {
  event.preventDefault();
  const width = Number(document.querySelector('#board-width').value);
  const height = Number(document.querySelector('#board-height').value);
  const mines = Number(document.querySelector('#mine-count').value);
  const error = document.querySelector('#custom-error');
  const sizeValid = Number.isInteger(width) && Number.isInteger(height) && width >= 5 && width <= 50 && height >= 5 && height <= 50;
  if (!sizeValid) {
    error.textContent = 'Width and height must be whole numbers between 5 and 50.';
    return;
  }
  const maxMines = width * height - 9;
  if (!Number.isInteger(mines) || mines < 1 || mines > maxMines) {
    error.textContent = `A ${width} × ${height} board can hold 1–${maxMines} mines.`;
    return;
  }
  error.textContent = '';
  closeDialog();
  startGame(width, height, mines);
}

function restartGame() {
  if (!game) return;
  if (game.duel === 'setup') {
    startGame(game.width, game.height, 0, 'setup');
  } else if (game.duel) {
    // Player 2 tries the same board again.
    const layout = game.layout;
    startGame(game.width, game.height, layout.length, 'play');
    hideDuelMines(layout);
  } else {
    startGame(game.width, game.height, game.mines);
  }
}

// 2 players: Player 1 picks a size and hides the mines by hand, then Player 2 plays that board.
function openDuelDialog() {
  if (game && game.duel) {
    document.querySelector('#duel-width').value = game.width;
    document.querySelector('#duel-height').value = game.height;
  }
  document.querySelector('#duel-error').textContent = '';
  openDialog('duel');
}

function startDuelSetup(event) {
  event.preventDefault();
  const width = Number(document.querySelector('#duel-width').value);
  const height = Number(document.querySelector('#duel-height').value);
  const valid = [width, height].every(size => Number.isInteger(size) && size >= 5 && size <= 50);
  if (!valid) {
    document.querySelector('#duel-error').textContent = 'Width and height must be whole numbers between 5 and 50.';
    return;
  }
  closeDialog();
  startGame(width, height, 0, 'setup');
}

function toggleDuelMine(index) {
  const tile = game.tiles[index];
  tile.mine = !tile.mine;
  game.mines += tile.mine ? 1 : -1;
  paintTile(index, tileButtons[index], tile.mine ? 'anim-flag' : 'anim-unflag');
  showDuelStatus();
  updateHud();
}

function showDuelStatus() {
  const count = game.mines;
  statusElement.className = 'game-status';
  statusElement.textContent = count ? `Player 1: ${count} mine${count === 1 ? '' : 's'} hidden. Tap Done when you're ready.` : 'Player 1: tap tiles to hide your mines.';
}

function finishDuelSetup() {
  const total = game.width * game.height;
  if (!game.mines || game.mines >= total) {
    setStatus(game.mines ? 'Leave at least one tile without a mine.' : 'Hide at least one mine first.', 'lose');
    return;
  }
  game.duel = 'play';
  game.layout = game.tiles.map((tile, index) => (tile.mine ? index : -1)).filter(index => index >= 0);
  hideDuelMines(game.layout);
  document.querySelector('#pass-summary').textContent = `${game.mines} mine${game.mines === 1 ? '' : 's'} hidden on a ${game.width} × ${game.height} board. Player 1, no peeking!`;
  openDialog('pass');
}

function hideDuelMines(layout) {
  game.layout = layout;
  layout.forEach(index => { game.tiles[index].mine = true; });
  game.tiles.forEach((tile, index) => {
    tile.adjacent = neighbors(index).filter(next => game.tiles[next].mine).length;
  });
  refreshGameAppearance();
  setStatus('Player 2: clear the board without hitting a mine!');
  applyDuelUi();
}

function applyDuelUi() {
  const setup = Boolean(game && game.duel === 'setup');
  const over = Boolean(game && game.duel && game.ended);
  duelBar.classList.toggle('hidden', !setup && !over);
  duelSecondary.textContent = setup ? 'Clear' : 'Try again';
  duelPrimary.textContent = setup ? 'Done, pass it on' : 'New match';
  arenaElement.classList.toggle('duel-setup', setup);
  gameHint.textContent = setup ? 'Tap a tile to hide a mine there, tap it again to remove it' : normalHint;
  // The bar changes the game's height, so refit it to the window.
  if (currentScreen === 'game') keepArenaOnScreen(false);
}

function beginPlay() {
  game.started = true;
  if (adminState.xray) refreshGameAppearance();
  startTimer();
  game.startedAt = performance.now();
  game.pausedMs = 0;
}

function startGame(width, height, mines, duel = null) {
  stopTimer();
  game = {
    duel,
    width,
    height,
    mines,
    tiles: Array.from({ length: width * height }, () => ({ mine: false, revealed: false, flagged: false, exploded: false, wrongFlag: false, adjacent: 0 })),
    started: false,
    ended: false,
    won: false,
    seconds: 0,
    flags: 0,
    revealedSafe: 0
  };
  statusElement.textContent = 'Click any tile to start.';
  statusElement.className = 'game-status';
  if (duel === 'setup') showDuelStatus();
  showScreen('game');
  buildBoard();
  updateHud();
  applyDuelUi();
  keepArenaOnScreen();
}

function buildBoard() {
  boardElement.replaceChildren();
  boardElement.classList.remove('shake', 'won', 'lost');
  boardElement.style.setProperty('--columns', game.width);
  tileButtons = game.tiles.map((tile, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile';
    button.dataset.index = index;
    button.setAttribute('role', 'gridcell');
    button.style.setProperty('--x', index % game.width);
    button.style.setProperty('--y', Math.floor(index / game.width));
    return button;
  });
  tileButtons.forEach((button, index) => paintTile(index, button));
  boardElement.append(...tileButtons);
  boardElement.classList.remove('board-enter');
  void boardElement.offsetWidth;
  boardElement.classList.add('board-enter');
  const boardAtBuild = tileButtons;
  window.setTimeout(() => {
    if (tileButtons === boardAtBuild) boardElement.classList.remove('board-enter');
  }, 1300);
}

function tileIndex(target) {
  if (!game || !(target instanceof Element)) return null;
  const button = target.closest('.tile');
  if (!button || !boardElement.contains(button)) return null;
  return Number(button.dataset.index);
}

function tileState(tile) {
  if (game.duel === 'setup') return tile.mine ? 'planted' : 'covered';
  if (!tile.revealed) {
    if (tile.wrongFlag) return 'wrong';
    if (tile.flagged) return 'flag';
    return adminState.xray && tile.mine ? 'xray' : 'covered';
  }
  if (tile.mine) return tile.exploded ? 'exploded' : 'mine';
  return `n${tile.adjacent}`;
}

function paintTile(index, button = tileButtons[index], animation = null, delay = 0) {
  if (!button) return;
  const tile = game.tiles[index];
  const state = tileState(tile);
  if (button.dataset.state === state && !animation) return;
  const previous = button.dataset.state;
  button.dataset.state = state;
  button.className = 'tile';
  button.replaceChildren();
  button.setAttribute('aria-label', tileLabel(tile));
  button.style.backgroundImage = !tile.revealed && assets.covered ? `url("${assets.covered}")` : '';

  if (!tile.revealed) {
    if (tile.flagged) button.append(icon('flag', ''));
    if (tile.wrongFlag) button.classList.add('wrong-flag');
    if (state === 'planted') {
      button.classList.add('planted');
      button.append(icon('mine', ''));
    } else if (!tile.flagged && adminState.xray && tile.mine) {
      const ghost = icon('mine', '');
      ghost.className = 'xray-mine';
      button.append(ghost);
    }
  } else {
    button.classList.add('revealed');
    if (tile.mine) {
      if (tile.exploded) button.classList.add('exploded');
      button.append(icon('mine', ''));
    } else if (tile.adjacent) {
      button.classList.add(`n${tile.adjacent}`);
      button.textContent = tile.adjacent;
    }
  }

  if (animation && previous && motionEnabled()) {
    button.style.animationDelay = `${delay}ms`;
    button.classList.add(animation);
  } else {
    button.style.animationDelay = '';
  }
}

function reveal(index) {
  const tile = game.tiles[index];
  if (game.duel === 'setup') {
    toggleDuelMine(index);
    return;
  }
  if (game.ended || tile.revealed || tile.flagged) return;
  if (!game.started) {
    // In 2 players the mines are already hidden, so the first tap isn't made safe.
    if (!game.duel) plantMines(index);
    beginPlay();
    if (!game.duel) statusElement.textContent = 'Good luck!';
  }
  if (tile.mine) {
    if (adminState.shield) shieldMine(index);
    else loseGame(index);
    return;
  }
  const opened = revealArea(index);
  animateReveal(opened, index);
  checkWin();
  updateHud();
}

function chord(index) {
  const tile = game.tiles[index];
  if (game.ended || !tile.revealed || !tile.adjacent) return;
  const around = neighbors(index);
  const flagged = around.filter(next => game.tiles[next].flagged).length;
  if (flagged !== tile.adjacent) {
    around.forEach(next => {
      const button = tileButtons[next];
      if (!game.tiles[next].revealed && !game.tiles[next].flagged && motionEnabled()) {
        button.classList.remove('hint');
        void button.offsetWidth;
        button.classList.add('hint');
        window.setTimeout(() => button.classList.remove('hint'), 400);
      }
    });
    return;
  }
  const hitMine = around.find(next => game.tiles[next].mine && !game.tiles[next].flagged);
  if (hitMine !== undefined) {
    if (!adminState.shield) {
      loseGame(hitMine);
      return;
    }
    around.forEach(next => {
      if (game.tiles[next].mine && !game.tiles[next].flagged) shieldMine(next);
    });
  }
  const opened = [];
  around.forEach(next => {
    if (!game.tiles[next].revealed && !game.tiles[next].flagged) opened.push(...revealArea(next));
  });
  animateReveal(opened, index);
  checkWin();
  updateHud();
}

function revealArea(start) {
  const opened = [];
  const pending = [start];
  while (pending.length) {
    const index = pending.pop();
    const tile = game.tiles[index];
    if (tile.revealed || tile.flagged || tile.mine) continue;
    tile.revealed = true;
    game.revealedSafe += 1;
    opened.push(index);
    if (tile.adjacent === 0) neighbors(index).forEach(next => {
      if (!game.tiles[next].revealed) pending.push(next);
    });
  }
  return opened;
}

function animateReveal(indices, origin) {
  const ox = origin % game.width;
  const oy = Math.floor(origin / game.width);
  indices.forEach(index => {
    const distance = Math.max(Math.abs((index % game.width) - ox), Math.abs(Math.floor(index / game.width) - oy));
    paintTile(index, tileButtons[index], 'anim-reveal', Math.min(distance * 22, 520));
  });
}

function loseGame(explodedIndex) {
  const exploded = game.tiles[explodedIndex];
  exploded.revealed = true;
  exploded.exploded = true;
  game.ended = true;
  stopTimer();
  // 2 player boards are hand-made, so they stay off the leaderboard.
  if (!game.duel) recordResult(false);
  const ex = explodedIndex % game.width;
  const ey = Math.floor(explodedIndex / game.width);
  game.tiles.forEach((tile, index) => {
    if (tile.mine && !tile.flagged) tile.revealed = true;
    if (!tile.mine && tile.flagged) tile.wrongFlag = true;
    if (index === explodedIndex) return;
    if (tile.revealed && tile.mine || tile.wrongFlag) {
      const distance = Math.hypot((index % game.width) - ex, Math.floor(index / game.width) - ey);
      paintTile(index, tileButtons[index], 'anim-mine', 120 + Math.min(distance * 45, 900));
    }
  });
  paintTile(explodedIndex, tileButtons[explodedIndex], 'anim-mine', 0);
  if (motionEnabled()) boardElement.classList.add('shake');
  boardElement.classList.add('lost');
  setStatus(game.duel ? "Boom! Player 1's trap worked." : 'Game over. Try again?', 'lose');
  updateHud();
  applyDuelUi();
}

function checkWin() {
  if (game.ended || game.revealedSafe !== game.width * game.height - game.mines) return;
  game.ended = true;
  game.won = true;
  stopTimer();
  game.tiles.forEach((tile, index) => {
    if (tile.mine && !tile.flagged) {
      tile.flagged = true;
      game.flags += 1;
      paintTile(index, tileButtons[index], 'anim-flag', 300);
    }
  });
  boardElement.classList.add('won');
  const time = elapsedSeconds();
  if (game.duel) {
    setStatus(`Player 2 cleared the board in ${formatTime(time)}!`, 'win');
    applyDuelUi();
    return;
  }
  const record = recordResult(true, time);
  let message = `You cleared the board in ${formatTime(time)}!`;
  if (record.rank === 0) message = `New best time: ${formatTime(time)}!`;
  else if (record.rank > 0) message = `Cleared in ${formatTime(time)}, #${record.rank + 1} on the leaderboard!`;
  setStatus(message, 'win');
}

function toggleFlag(index) {
  if (game.duel === 'setup') {
    toggleDuelMine(index);
    return;
  }
  const tile = game.tiles[index];
  if (game.ended || tile.revealed) return;
  tile.flagged = !tile.flagged;
  game.flags += tile.flagged ? 1 : -1;
  paintTile(index, tileButtons[index], tile.flagged ? 'anim-flag' : 'anim-unflag');
  updateHud();
}

function plantMines(safeIndex) {
  const blocked = new Set([safeIndex, ...neighbors(safeIndex)]);
  const candidates = game.tiles.map((_, index) => index).filter(index => !blocked.has(index));
  for (let remaining = Math.min(game.mines, candidates.length); remaining; remaining -= 1) {
    const pick = Math.floor(Math.random() * candidates.length);
    const index = candidates.splice(pick, 1)[0];
    game.tiles[index].mine = true;
  }
  game.tiles.forEach((tile, index) => {
    tile.adjacent = neighbors(index).filter(next => game.tiles[next].mine).length;
  });
}

function neighbors(index) {
  const x = index % game.width;
  const y = Math.floor(index / game.width);
  const result = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX >= 0 && nextX < game.width && nextY >= 0 && nextY < game.height) result.push(nextY * game.width + nextX);
    }
  }
  return result;
}

function setStatus(text, tone = '') {
  statusElement.textContent = text;
  statusElement.className = `game-status ${tone}`.trim();
  if (motionEnabled()) {
    statusElement.classList.remove('status-pop');
    void statusElement.offsetWidth;
    statusElement.classList.add('status-pop');
  }
}

function updateHud() {
  const remaining = game.mines - game.flags;
  counterElement.textContent = remaining < 0 ? `-${String(Math.min(99, -remaining)).padStart(2, '0')}` : String(Math.min(999, remaining)).padStart(3, '0');
  timerElement.textContent = String(Math.min(999, game.seconds)).padStart(3, '0');
  const face = asset(game.ended ? (game.won ? 'faceWin' : 'faceLose') : 'face');
  if (faceImage.getAttribute('src') !== face) {
    faceImage.src = face;
    if (motionEnabled() && game.ended) faceButton.classList.add('bump');
  }
}

function refreshGameAppearance() {
  if (!game) return;
  tileButtons.forEach(button => { button.dataset.state = ''; });
  tileButtons.forEach((button, index) => paintTile(index, button));
  faceImage.removeAttribute('src');
  updateHud();
}

function renderAssets() {
  assetList.replaceChildren();
  assetError.textContent = '';
  assetDefinitions.forEach(definition => {
    const row = document.createElement('div');
    row.className = 'asset-row';
    const preview = icon(definition.id, '');
    preview.className = 'asset-preview';
    const label = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'asset-name';
    name.textContent = definition.name;
    const hint = document.createElement('span');
    hint.className = 'asset-hint';
    hint.textContent = assets[definition.id] ? `${definition.hint} · custom` : definition.hint;
    label.append(name, hint);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png';
    input.addEventListener('change', () => saveAssetFile(definition.id, input.files[0]));
    const upload = document.createElement('button');
    upload.type = 'button';
    upload.className = 'upload-button';
    upload.textContent = 'Choose PNG';
    upload.addEventListener('click', () => input.click());
    row.append(preview, label, input, upload);
    assetList.append(row);
  });
}

function saveAssetFile(id, file) {
  if (!file) return;
  if (file.type !== 'image/png') {
    assetError.textContent = 'Please choose a PNG image.';
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const previous = assets[id];
    assets[id] = reader.result;
    if (!saveAssets()) {
      if (previous) assets[id] = previous;
      else delete assets[id];
      renderAssets();
      assetError.textContent = 'That image is too large to store. Try a smaller PNG.';
      return;
    }
    renderAssets();
    refreshGameAppearance();
  });
  reader.readAsDataURL(file);
}

function asset(id) {
  return assets[id] || defaults[id];
}

function icon(id, alt) {
  const image = new Image();
  image.src = asset(id);
  image.alt = alt;
  image.draggable = false;
  return image;
}

function tileLabel(tile) {
  if (game.duel === 'setup') return tile.mine ? 'Hidden mine' : 'Empty tile';
  if (tile.wrongFlag) return 'Wrongly flagged tile';
  if (tile.flagged) return 'Flagged tile';
  if (!tile.revealed) return 'Covered tile';
  if (tile.mine) return 'Mine';
  return tile.adjacent ? `${tile.adjacent} adjacent mine${tile.adjacent === 1 ? '' : 's'}` : 'Empty tile';
}

function loadAssets() {
  try {
    const stored = JSON.parse(localStorage.getItem(assetStorageKey));
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
}

function saveAssets() {
  return storageSet(assetStorageKey, JSON.stringify(assets));
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    if (syncedKeys.includes(key)) progressChanged();
    return true;
  } catch {
    return false;
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
    if (syncedKeys.includes(key)) progressChanged();
  } catch {
    // Storage unavailable; nothing to remove.
  }
}

// ---- Accounts and cloud saves (the server side is in cloud.js) ----
function loadAccount() {
  try {
    const stored = JSON.parse(storageGet(accountStorageKey));
    return stored && (stored.guest || stored.uid) ? stored : null;
  } catch {
    return null;
  }
}

function saveAccount() {
  if (!account) {
    storageRemove(accountStorageKey);
    return;
  }
  const saved = account.guest ? { guest: true } : { username: account.username, uid: account.uid, refreshToken: account.refreshToken };
  storageSet(accountStorageKey, JSON.stringify(saved));
}

function signedIn() {
  return Boolean(account && account.uid);
}

// When this device's progress last changed, and whether the account has that change yet.
function loadSyncInfo() {
  try {
    return JSON.parse(localStorage.getItem(syncStorageKey)) || { updatedAt: 0, dirty: false };
  } catch {
    return { updatedAt: 0, dirty: false };
  }
}

function saveSyncInfo(info) {
  try {
    localStorage.setItem(syncStorageKey, JSON.stringify(info));
  } catch {
    // Storage unavailable; the next change will try again.
  }
}

function progressChanged() {
  if (applyingCloud) return;
  saveSyncInfo({ updatedAt: Date.now(), dirty: true });
  if (!signedIn()) return;
  // Wait a moment so a burst of changes (a game ending, a slider being dragged) goes up as one save.
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(pushProgress, 1500);
}

function collectProgress() {
  return Object.fromEntries(syncedKeys.map(key => [key, storageGet(key)]));
}

async function pushProgress() {
  window.clearTimeout(syncTimer);
  syncTimer = null;
  if (!signedIn()) return;
  const session = account;
  const sync = loadSyncInfo();
  const updatedAt = sync.updatedAt || Date.now();
  setSyncState('saving');
  try {
    await window.UltraCloud.save(session, { username: session.username, data: JSON.stringify(collectProgress()), updatedAt });
    if (account !== session) return;
    saveAccount();
    // Only mark it saved if nothing else changed while it was uploading.
    if (loadSyncInfo().updatedAt === sync.updatedAt) saveSyncInfo({ updatedAt, dirty: false });
    setSyncState('saved');
  } catch (error) {
    cloudFailed(error, session);
  }
}

// On launch the newer of the two saves wins. Right after logging in, the account's save always wins.
async function pullProgress(justLoggedIn = false) {
  if (!signedIn()) return;
  const session = account;
  setSyncState('saving');
  try {
    const cloud = await window.UltraCloud.load(session);
    if (account !== session) return;
    if (cloud && cloud.username) session.username = cloud.username;
    saveAccount();
    const sync = loadSyncInfo();
    if (!cloud || (!justLoggedIn && sync.dirty && sync.updatedAt > cloud.updatedAt)) {
      await pushProgress();
      return;
    }
    if (justLoggedIn || cloud.updatedAt !== sync.updatedAt) applyProgress(cloud);
    setSyncState('saved');
  } catch (error) {
    cloudFailed(error, session);
  }
}

function applyProgress(cloud) {
  let data = {};
  try {
    data = JSON.parse(cloud.data) || {};
  } catch {
    // A damaged save is treated as empty.
  }
  applyingCloud = true;
  syncedKeys.forEach(key => {
    if (typeof data[key] === 'string') storageSet(key, data[key]);
    else storageRemove(key);
  });
  applyingCloud = false;
  saveSyncInfo({ updatedAt: cloud.updatedAt, dirty: false });
  reloadProgress();
}

// Re-reads everything an account carries, after it was replaced by a cloud save or a log out.
function reloadProgress() {
  stats = loadStats();
  legacyMode = storageGet(legacyStorageKey) === 'true';
  accentColor = storageGet(accentStorageKey) || defaultAccent;
  musicOn = storageGet(musicStorageKey) !== 'false';
  musicVolume = storageGet(volumeStorageKey) === null ? 100 : Number(storageGet(volumeStorageKey));
  applyLegacyMode();
  applyAccentColor();
  applyVolume();
  applyMusic();
  if (currentScreen === 'game') keepArenaOnScreen();
  if (openDialogName === 'stats') renderStats();
}

function cloudFailed(error, session) {
  if (account !== session) return;
  if (error.kind === 'signed-out') {
    const username = session.username;
    logOut();
    openAccount('login');
    document.querySelector('#account-username').value = username;
    document.querySelector('#account-error').textContent = error.message;
    return;
  }
  setSyncState(error.kind === 'offline' ? 'offline' : 'error');
}

function logOut() {
  window.clearTimeout(syncTimer);
  syncTimer = null;
  account = null;
  saveAccount();
  // The stats belong to the account, so they leave with it. Settings stay as they are.
  applyingCloud = true;
  storageRemove(statsStorageKey);
  applyingCloud = false;
  saveSyncInfo({ updatedAt: 0, dirty: false });
  stats = loadStats();
  syncState = 'saved';
  updateAccountUi();
}

function setSyncState(state) {
  syncState = state;
  updateAccountUi();
}

function updateAccountUi() {
  const action = accountRow.querySelector('b');
  const status = document.querySelector('#account-status');
  if (signedIn()) {
    document.querySelector('#account-name').textContent = account.username;
    status.textContent = {
      saving: 'Saving…',
      saved: 'Progress saved to your account',
      offline: "Offline. Saves when you're back online",
      error: "Couldn't save. Trying again soon"
    }[syncState];
    action.textContent = accountRow.dataset.confirm ? 'Sure?' : 'Log Out';
  } else {
    document.querySelector('#account-name').textContent = 'Guest';
    status.textContent = 'Progress only saved on this device';
    action.textContent = 'Sign In';
  }
}

async function clickAccountRow() {
  if (!signedIn()) {
    openAccount('choice');
    return;
  }
  if (!accountRow.dataset.confirm) {
    accountRow.dataset.confirm = 'yes';
    updateAccountUi();
    return;
  }
  // Send any last change up before leaving.
  if (loadSyncInfo().dirty) await pushProgress();
  logOut();
  openAccount('choice', true);
}

function openAccount(view, firstLaunch = false) {
  accountFirstLaunch = firstLaunch;
  showAccountView(view);
  openDialog('account');
}

function showAccountView(view) {
  accountView = view;
  const choice = view === 'choice';
  document.querySelector('#account-choice').classList.toggle('hidden', !choice);
  document.querySelector('#account-form').classList.toggle('hidden', choice);
  if (choice) {
    window.setTimeout(() => document.querySelector('#account-signup').focus(), 60);
    return;
  }
  const signup = view === 'signup';
  document.querySelector('#account-form-eyebrow').textContent = signup ? 'New Account' : 'Welcome Back';
  document.querySelector('#account-form-title').textContent = signup ? 'Create Account' : 'Log In';
  document.querySelector('#account-submit').textContent = signup ? 'Sign Up' : 'Log In';
  document.querySelector('#account-switch-text').textContent = signup ? 'Already have an account?' : 'New here?';
  document.querySelector('#account-switch').textContent = signup ? 'Log In' : 'Sign Up';
  document.querySelector('#account-password').autocomplete = signup ? 'new-password' : 'current-password';
  document.querySelector('#account-password').value = '';
  document.querySelector('#account-error').textContent = '';
  window.setTimeout(() => document.querySelector('#account-username').focus(), 60);
}

async function submitAccount(event) {
  event.preventDefault();
  const username = document.querySelector('#account-username').value.trim();
  const password = document.querySelector('#account-password').value;
  const error = document.querySelector('#account-error');
  const button = document.querySelector('#account-submit');
  if (button.disabled) return;
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    error.textContent = 'Usernames are 3 to 20 letters, numbers or _ (no spaces).';
    return;
  }
  if (password.length < 6) {
    error.textContent = 'Your password needs at least 6 characters.';
    return;
  }
  const signup = accountView === 'signup';
  error.textContent = '';
  button.disabled = true;
  button.textContent = signup ? 'Creating…' : 'Logging in…';
  try {
    const session = await (signup ? window.UltraCloud.signUp(username, password) : window.UltraCloud.logIn(username, password));
    account = { ...session, username };
    saveAccount();
    // A new account starts with whatever was played on this device; logging in brings the account's progress here.
    if (signup) await pushProgress();
    else await pullProgress(true);
    if (openDialogName === 'account') closeDialog();
  } catch (problem) {
    error.textContent = problem.message;
  } finally {
    button.disabled = false;
    button.textContent = signup ? 'Sign Up' : 'Log In';
  }
}

function applyLegacyMode() {
  document.body.classList.toggle('legacy-mode', legacyMode);
  legacyToggle.setAttribute('aria-pressed', String(legacyMode));
  legacyToggle.querySelector('b').textContent = legacyMode ? 'On' : 'Off';
  window.UltraMusic.setTrack(legacyMode ? 'legacy' : 'modern');
}

function openAppearance() {
  renderAssets();
  renderSongPicker();
  openDialog('settings');
}

function setMusic(value) {
  musicOn = value;
  storageSet(musicStorageKey, String(musicOn));
  applyMusic();
}

// ---- Custom songs: one per look. Files live in IndexedDB (too big for localStorage), the rest in localStorage.
function currentLook() {
  return legacyMode ? 'legacy' : 'modern';
}

function loadSongInfo() {
  try {
    return JSON.parse(localStorage.getItem(songStorageKey)) || {};
  } catch {
    return {};
  }
}

function saveSongInfo() {
  storageSet(songStorageKey, JSON.stringify(songInfo));
}

function songStore(mode, action) {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('no storage'));
      return;
    }
    const request = indexedDB.open('ultrasweeper-songs', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('songs');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('songs', mode);
      const result = action(transaction.objectStore('songs'));
      transaction.oncomplete = () => {
        db.close();
        resolve(result.result);
      };
      transaction.onerror = transaction.onabort = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}

function youtubeId(link) {
  const match = String(link).trim().match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

// Hand the saved songs to the music player.
function loadCustomSongs() {
  songLooks.forEach(look => {
    const info = songInfo[look];
    if (!info) return;
    if (info.kind === 'youtube') {
      window.UltraMusic.setCustomSong(look, { kind: 'youtube', id: info.id });
      return;
    }
    songStore('readonly', store => store.get(look))
      .then(file => {
        if (file && songInfo[look] && songInfo[look].kind === 'file') {
          window.UltraMusic.setCustomSong(look, { kind: 'file', url: URL.createObjectURL(file) });
        }
      })
      .catch(() => {});
  });
}

function renderSongPicker(message = '', ok = false) {
  const look = currentLook();
  const info = songInfo[look];
  document.querySelector('#song-title').textContent = look === 'legacy' ? 'Song (legacy)' : 'Song';
  const current = document.querySelector('#song-current');
  if (!info) current.textContent = `Built-in tune: ${builtInSongNames[look]}`;
  else if (info.kind === 'file') current.textContent = `Your file: ${info.name}`;
  else current.textContent = 'YouTube video (needs an internet connection)';
  document.querySelector('#song-link').value = info && info.kind === 'youtube' ? info.url : '';
  const error = document.querySelector('#song-error');
  error.textContent = message || songErrors[look] || '';
  error.classList.toggle('ok', ok);
}

function useSongLink() {
  const look = currentLook();
  const link = document.querySelector('#song-link').value;
  const id = youtubeId(link);
  if (!id) {
    renderSongPicker('That doesn\'t look like a YouTube link. Copy it from the Share button on YouTube.');
    return;
  }
  delete songErrors[look];
  songStore('readwrite', store => store.delete(look)).catch(() => {});
  songInfo[look] = { kind: 'youtube', id, url: link.trim() };
  saveSongInfo();
  window.UltraMusic.setCustomSong(look, { kind: 'youtube', id });
  renderSongPicker(musicOn ? 'Playing your YouTube song.' : 'Saved. Turn music on to hear it.', true);
}

function useSongFile(file) {
  if (!file) return;
  const look = currentLook();
  const isAudio = (file.type && file.type.startsWith('audio/')) || /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus)$/i.test(file.name);
  if (!isAudio) {
    renderSongPicker('Please choose an audio file, like an MP3.');
    return;
  }
  if (file.size > maxSongBytes) {
    renderSongPicker('That file is too big. Choose a song under 40 MB.');
    return;
  }
  songStore('readwrite', store => store.put(file, look))
    .then(() => {
      delete songErrors[look];
      songInfo[look] = { kind: 'file', name: file.name };
      saveSongInfo();
      window.UltraMusic.setCustomSong(look, { kind: 'file', url: URL.createObjectURL(file) });
      renderSongPicker(musicOn ? 'Playing your song.' : 'Saved. Turn music on to hear it.', true);
    })
    .catch(() => renderSongPicker('The song could not be saved on this device.'));
}

function resetSong() {
  const look = currentLook();
  delete songInfo[look];
  delete songErrors[look];
  saveSongInfo();
  songStore('readwrite', store => store.delete(look)).catch(() => {});
  window.UltraMusic.setCustomSong(look, null);
  renderSongPicker();
}

function applyMusic() {
  musicToggle.setAttribute('aria-pressed', String(musicOn));
  musicToggle.querySelector('b').textContent = musicOn ? 'On' : 'Off';
  gameMusicButton.setAttribute('aria-pressed', String(musicOn));
  gameMusicButton.title = musicOn ? 'Music on' : 'Music off';
  [musicToggle, gameMusicButton].forEach(button => button.querySelector('use').setAttribute('href', musicOn ? '#icon-music' : '#icon-music-off'));
  window.UltraMusic.setEnabled(musicOn);
}

function applyVolume() {
  volumeInput.value = musicVolume;
  volumeInput.style.setProperty('--fill', `${musicVolume}%`);
  document.querySelector('#music-volume-value').textContent = `${musicVolume}%`;
  window.UltraMusic.setVolume(musicVolume / 100);
}

function applyAccentColor() {
  document.documentElement.style.setProperty('--accent', accentColor);
  accentInput.value = accentColor;
}

function motionEnabled() {
  return !reducedMotion.matches && !legacyMode;
}

function startTimer() {
  stopTimer();
  timerId = window.setInterval(() => {
    if (adminState.freeze) return;
    game.seconds += 1;
    updateHud();
  }, 1000);
}

function pauseTimer() {
  if (timerId === null) return;
  stopTimer();
  game.paused = true;
  game.pausedAt = performance.now();
}

function resumeTimer() {
  if (!game || !game.paused) return;
  game.paused = false;
  game.pausedMs += performance.now() - game.pausedAt;
  if (game.started && !game.ended && currentScreen === 'game') startTimer();
}

function stopTimer() {
  window.clearInterval(timerId);
  timerId = null;
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function unlockAdmin(event) {
  event.preventDefault();
  const input = document.querySelector('#admin-password');
  const error = document.querySelector('#admin-error');
  let matches = false;
  try {
    matches = (await sha256(input.value)) === adminPasswordHash;
  } catch {
    error.textContent = 'Admin access is not available on this device.';
    return;
  }
  if (!matches) {
    error.textContent = 'Wrong password.';
    input.select();
    const card = input.closest('.dialog-card');
    card.classList.remove('denied');
    void card.offsetWidth;
    card.classList.add('denied');
    return;
  }
  input.value = '';
  error.textContent = '';
  adminState.unlocked = true;
  storageSet(adminStorageKey, 'unlocked');
  closeDialog();
  updateAdminUi();
}

function lockAdmin() {
  adminState.unlocked = false;
  storageRemove(adminStorageKey);
  adminState.xray = false;
  adminState.shield = false;
  adminState.freeze = false;
  toggleAdminPanel(false);
  updateAdminUi();
  refreshGameAppearance();
}

function updateAdminUi() {
  adminToggle.setAttribute('aria-pressed', String(adminState.unlocked));
  // The menu badge only exists while admin is unlocked.
  adminToggle.classList.toggle('hidden', !adminState.unlocked);
  adminToolsButton.classList.toggle('hidden', !adminState.unlocked);
  adminPanel.querySelectorAll('[data-cheat]').forEach(button => {
    button.setAttribute('aria-pressed', String(adminState[button.dataset.cheat]));
  });
}

function toggleAdminPanel(open = adminPanel.classList.contains('hidden')) {
  if (open && !adminState.unlocked) return;
  adminPanel.classList.toggle('hidden', !open);
  adminToolsButton.setAttribute('aria-expanded', String(open));
  adminToolsButton.classList.toggle('active', open);
  if (open) {
    placeAdminPanel();
    adminNote.textContent = '';
    adminPanel.querySelector('[data-cheat]').focus({ preventScroll: true });
  }
  makeRoomForAdminPanel();
}

function makeRoomForAdminPanel() {
  // Slide the game sideways so the admin panel does not cover it; not saved.
  arenaElement.style.setProperty('--admin-shift', '0px');
  if (adminPanel.classList.contains('hidden') || currentScreen !== 'game') return;
  // Use layout boxes (no translate) so an in-progress slide does not skew the numbers.
  const screenLeft = arenaElement.offsetLeft - window.scrollX;
  const screenTop = arenaElement.offsetTop - window.scrollY;
  let left = screenLeft + arena.x;
  let top = screenTop + arena.y;
  let right = left + arenaElement.offsetWidth;
  let bottom = top + arenaElement.offsetHeight;
  if (!legacyMode) {
    // Modern: the buttons stay put and only the play area is offset.
    const boxLeft = screenLeft + arenaBox.offsetLeft + arena.x;
    const boxTop = screenTop + arenaBox.offsetTop + arena.y;
    left = Math.min(screenLeft, boxLeft);
    top = Math.min(screenTop, boxTop);
    right = Math.max(screenLeft + arenaElement.offsetWidth, boxLeft + arenaBox.offsetWidth);
    bottom = Math.max(screenTop + arenaElement.offsetHeight, boxTop + arenaBox.offsetHeight);
  }
  const panel = adminPanel.getBoundingClientRect();
  const gap = 12;
  const overlaps = panel.left < right + gap && panel.right > left - gap && panel.top < bottom && panel.bottom > top;
  if (!overlaps) return;
  const panelOnRight = panel.left + panel.width / 2 > (left + right) / 2;
  const shift = panelOnRight
    ? Math.min(right + gap - panel.left, Math.max(0, left - gap))
    : -Math.min(panel.right + gap - left, Math.max(0, document.documentElement.clientWidth - right - gap));
  arenaElement.style.setProperty('--admin-shift', `${Math.round(shift)}px`);
}

function placeAdminPanel(position = loadAdminPanelPosition()) {
  if (!position) {
    adminPanel.style.left = '';
    adminPanel.style.top = '';
    adminPanel.style.right = '';
    return;
  }
  const maxLeft = Math.max(0, window.innerWidth - adminPanel.offsetWidth);
  const maxTop = Math.max(0, window.innerHeight - (legacyMode ? 30 : 0) - 48);
  adminPanel.style.left = `${Math.round(Math.min(maxLeft, Math.max(0, position.x)))}px`;
  adminPanel.style.top = `${Math.round(Math.min(maxTop, Math.max(0, position.y)))}px`;
  adminPanel.style.right = 'auto';
}

function loadAdminPanelPosition() {
  try {
    const stored = JSON.parse(localStorage.getItem(adminPanelStorageKey));
    return stored && Number.isFinite(stored.x) && Number.isFinite(stored.y) ? stored : null;
  } catch {
    return null;
  }
}

function startAdminPanelDrag(event) {
  const handle = event.target.closest('.admin-panel-header, .admin-panel-titlebar');
  if (!handle || event.button !== 0 || event.target.closest('button')) return;
  const rect = adminPanel.getBoundingClientRect();
  adminPanelDrag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
  adminPanel.classList.add('dragging');
  window.addEventListener('pointermove', moveAdminPanel);
  window.addEventListener('pointerup', endAdminPanelDrag);
  window.addEventListener('pointercancel', endAdminPanelDrag);
  event.preventDefault();
}

function moveAdminPanel(event) {
  if (!adminPanelDrag || event.pointerId !== adminPanelDrag.pointerId) return;
  if (!(event.buttons & 1)) {
    endAdminPanelDrag(event);
    return;
  }
  placeAdminPanel({ x: event.clientX - adminPanelDrag.offsetX, y: event.clientY - adminPanelDrag.offsetY });
}

function endAdminPanelDrag(event) {
  if (!adminPanelDrag || event.pointerId !== adminPanelDrag.pointerId) return;
  adminPanelDrag = null;
  adminPanel.classList.remove('dragging');
  window.removeEventListener('pointermove', moveAdminPanel);
  window.removeEventListener('pointerup', endAdminPanelDrag);
  window.removeEventListener('pointercancel', endAdminPanelDrag);
  const rect = adminPanel.getBoundingClientRect();
  storageSet(adminPanelStorageKey, JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }));
  makeRoomForAdminPanel();
}

function setCheat(name, value) {
  adminState[name] = value;
  updateAdminUi();
  if (name === 'xray') refreshGameAppearance();
  const labels = { xray: 'X-ray vision', shield: 'Mine shield', freeze: 'Timer freeze' };
  adminNote.textContent = `${labels[name]} ${value ? 'on' : 'off'}.`;
}

function shieldMine(index) {
  const tile = game.tiles[index];
  tile.flagged = true;
  game.flags += 1;
  paintTile(index, tileButtons[index], 'anim-flag');
  tileButtons[index].classList.add('shielded');
  window.setTimeout(() => tileButtons[index] && tileButtons[index].classList.remove('shielded'), 700);
  setStatus('The mine shield blocked a mine!', '');
  updateHud();
}

function startWithAdmin() {
  // Cheats that need mines start the game from the center tile.
  if (game.started) return true;
  if (game.duel) {
    // Hand-placed mines could sit in the center, so just start the clock.
    beginPlay();
    return true;
  }
  const center = Math.floor(game.height / 2) * game.width + Math.floor(game.width / 2);
  reveal(center);
  return game.started;
}

function runAdminAction(action) {
  if (!game || currentScreen !== 'game') {
    adminNote.textContent = 'Start a game first.';
    return;
  }
  if (game.duel === 'setup') {
    adminNote.textContent = 'Finish hiding the mines first.';
    return;
  }
  if (game.ended && action !== 'time') {
    adminNote.textContent = 'This game is over. Start a new one.';
    return;
  }
  if (action === 'time') {
    game.seconds = 0;
    updateHud();
    adminNote.textContent = 'Timer reset.';
  } else if (action === 'safe') {
    if (!game.started && !game.duel) {
      startWithAdmin();
      adminNote.textContent = 'Opened the center of the board.';
      return;
    }
    startWithAdmin();
    const safe = game.tiles.map((tile, index) => index).filter(index => !game.tiles[index].mine && !game.tiles[index].revealed && !game.tiles[index].flagged);
    if (!safe.length) {
      adminNote.textContent = 'No hidden safe tiles left.';
      return;
    }
    const pick = safe[Math.floor(Math.random() * safe.length)];
    reveal(pick);
    tileButtons[pick].classList.add('admin-hint');
    window.setTimeout(() => tileButtons[pick] && tileButtons[pick].classList.remove('admin-hint'), 1200);
    adminNote.textContent = 'Revealed a safe tile.';
  } else if (action === 'flags') {
    startWithAdmin();
    let placed = 0;
    game.tiles.forEach((tile, index) => {
      if (tile.mine && !tile.flagged && !tile.revealed) {
        tile.flagged = true;
        game.flags += 1;
        placed += 1;
        paintTile(index, tileButtons[index], 'anim-flag', placed * 25);
      }
    });
    updateHud();
    adminNote.textContent = placed ? `Flagged ${placed} mine${placed === 1 ? '' : 's'}.` : 'Every mine is already flagged.';
  } else if (action === 'win') {
    startWithAdmin();
    if (game.ended) return;
    const opened = [];
    game.tiles.forEach((tile, index) => {
      if (tile.mine || tile.revealed) return;
      if (tile.flagged) {
        tile.flagged = false;
        game.flags -= 1;
      }
      opened.push(...revealArea(index));
    });
    const center = Math.floor(game.height / 2) * game.width + Math.floor(game.width / 2);
    animateReveal(opened, center);
    checkWin();
    updateHud();
    adminNote.textContent = 'Board cleared.';
  }
}

function elapsedSeconds() {
  if (!game.startedAt) return game.seconds;
  const ms = performance.now() - game.startedAt - (game.pausedMs || 0);
  return Math.max(0, Math.round(ms / 10) / 100);
}

function formatTime(seconds) {
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, '0')}`;
}

function boardKey(width, height, mines) {
  return `${width}x${height}x${mines}`;
}

function boardLabel(key) {
  const [width, height, mines] = key.split('x');
  return `${width} × ${height} · ${mines} mines`;
}

function loadStats() {
  try {
    const stored = JSON.parse(localStorage.getItem(statsStorageKey));
    return stored && typeof stored.boards === 'object' ? stored : { boards: {} };
  } catch {
    return { boards: {} };
  }
}

function boardStats(key) {
  if (!stats.boards[key]) stats.boards[key] = { played: 0, won: 0, streak: 0, bestStreak: 0, totalTime: 0, times: [] };
  return stats.boards[key];
}

function recordResult(won, time = 0) {
  // Every started game counts, including ones played with admin tools (those are for developers only).
  if (!game || !game.started) return { rank: -1 };
  const entry = boardStats(boardKey(game.width, game.height, game.mines));
  entry.played += 1;
  let rank = -1;
  if (won) {
    entry.won += 1;
    entry.streak += 1;
    entry.bestStreak = Math.max(entry.bestStreak, entry.streak);
    entry.totalTime += time;
    const record = { time, date: Date.now() };
    entry.times.push(record);
    entry.times.sort((a, b) => a.time - b.time || a.date - b.date);
    entry.times = entry.times.slice(0, leaderboardSize);
    rank = entry.times.indexOf(record);
  } else {
    entry.streak = 0;
  }
  storageSet(statsStorageKey, JSON.stringify(stats));
  return { rank };
}

function openStats() {
  const preferred = game ? boardKey(game.width, game.height, game.mines) : statsBoard;
  renderStats(preferred);
  openDialog('stats');
}

function renderStats(key = statsBoard) {
  statsBoard = key;
  const clear = document.querySelector('#clear-stats');
  clear.textContent = "Clear this board's stats";
  delete clear.dataset.confirm;

  const keys = Object.keys(stats.boards);
  ['9x9x10', key].forEach(required => {
    if (!keys.includes(required)) keys.push(required);
  });
  const order = ['9x9x10', '16x16x40', '30x16x99'];
  keys.sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b, undefined, { numeric: true });
  });
  const tabs = document.querySelector('#stats-boards');
  tabs.replaceChildren(...keys.map(boardId => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'stats-tab';
    tab.dataset.board = boardId;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(boardId === key));
    const name = document.createElement('b');
    name.textContent = namedBoards[boardId] || 'Custom';
    const size = document.createElement('small');
    size.textContent = boardLabel(boardId);
    tab.append(name, size);
    return tab;
  }));

  const entry = stats.boards[key] || { played: 0, won: 0, streak: 0, bestStreak: 0, totalTime: 0, times: [] };
  const best = entry.times.length ? formatTime(entry.times[0].time) : '—';
  const average = entry.won ? formatTime(Math.round(entry.totalTime / entry.won * 100) / 100) : '—';
  const items = [
    ['Played', entry.played],
    ['Won', entry.won],
    ['Win rate', entry.played ? `${Math.round(entry.won / entry.played * 100)}%` : '—'],
    ['Best time', best],
    ['Average', average],
    ['Streak', `${entry.streak} (best ${entry.bestStreak})`]
  ];
  document.querySelector('#stats-summary').replaceChildren(...items.map(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'stats-item';
    const name = document.createElement('span');
    name.textContent = label;
    const number = document.createElement('strong');
    number.textContent = value;
    item.append(name, number);
    return item;
  }));

  const list = document.querySelector('#stats-times');
  list.replaceChildren(...entry.times.map((record, index) => {
    const row = document.createElement('li');
    row.className = index === 0 ? 'stats-row first' : 'stats-row';
    const place = document.createElement('span');
    place.className = 'stats-rank';
    place.textContent = `#${index + 1}`;
    const time = document.createElement('strong');
    time.textContent = formatTime(record.time);
    const date = document.createElement('small');
    date.textContent = new Date(record.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    row.append(place, time, date);
    return row;
  }));
  document.querySelector('#stats-empty').classList.toggle('hidden', entry.times.length > 0);
  clear.disabled = !stats.boards[key];
}

function clearBoardStats() {
  const button = document.querySelector('#clear-stats');
  if (!button.dataset.confirm) {
    button.dataset.confirm = 'true';
    button.textContent = 'Click again to clear';
    return;
  }
  delete stats.boards[statsBoard];
  storageSet(statsStorageKey, JSON.stringify(stats));
  renderStats(statsBoard);
}

function setUpTouchDevice() {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  document.documentElement.classList.toggle('touch-device', touch);
  if (touch) document.querySelector('.game-hint').textContent = 'Long-press to flag · Tap a number to clear its neighbors';

  setUpBackButton();
}

function setUpAdminPattern() {
  const tiles = [...document.querySelectorAll('.board-art span')];
  tiles.forEach((tile, index) => tile.addEventListener('pointerdown', () => {
    const position = index + 1;
    const now = performance.now();
    // A pause of more than 3 seconds starts over.
    if (now - lastPatternTap > 3000) patternStep = 0;
    lastPatternTap = now;
    tile.classList.remove('art-press');
    void tile.offsetWidth;
    tile.classList.add('art-press');
    if (position === adminTilePattern[patternStep]) patternStep += 1;
    else patternStep = position === adminTilePattern[0] ? 1 : 0;
    if (patternStep < adminTilePattern.length) return;
    patternStep = 0;
    if (adminState.unlocked || openDialogName || currentScreen !== 'mode') return;
    document.querySelector('#admin-password').value = '';
    document.querySelector('#admin-error').textContent = '';
    openDialog('admin');
  }));
}

function setUpBackButton() {
  // Android back button inside the app: step back through the UI instead of quitting straight away.
  const nativeApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (!nativeApp) return;
  nativeApp.addListener('backButton', () => {
    if (openDialogName) closeDialog();
    else if (!adminPanel.classList.contains('hidden')) toggleAdminPanel(false);
    else if (currentScreen === 'game') backToMenu();
    else nativeApp.exitApp();
  });
}
