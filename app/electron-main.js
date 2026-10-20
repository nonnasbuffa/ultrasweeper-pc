const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');

// The layout is designed for this many CSS pixels; the window is zoomed to fit it.
// Saved data (stats, settings, songs) lives in the folder the game has always used,
// so renaming the app or switching between the folder and single-exe versions keeps it.
app.setPath('userData', path.join(app.getPath('appData'), 'Offline Minesweeper'));

const DESIGN_WIDTH = 900;
const DESIGN_HEIGHT = 660;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.5;

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 420,
    minHeight: 620,
    backgroundColor: '#11151c',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  Menu.setApplicationMenu(null);
  window.once('ready-to-show', () => window.show());

  // Scale the whole interface with the window, so it keeps the same proportions
  // at any size instead of floating small in a big window.
  const fitZoom = () => {
    if (window.isDestroyed() || window.isMinimized()) return;
    const { width, height } = window.getContentBounds();
    const factor = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT)));
    window.webContents.setZoomFactor(Math.round(factor * 100) / 100);
  };
  ['resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen'].forEach(event => window.on(event, fitZoom));
  window.webContents.on('did-finish-load', fitZoom);
  // Ctrl+scroll / pinch would fight the automatic scaling.
  window.webContents.setVisualZoomLevelLimits(1, 1);

  window.loadFile(path.join(__dirname, 'index.html'));
};

app.whenReady().then(() => {
  // YouTube's embedded player (custom songs) only plays when the request says which app it is in,
  // and pages loaded from local files send no Referer, so add one naming this app.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://*.youtube.com/*', 'https://*.googlevideo.com/*', 'https://*.ytimg.com/*'] }, (details, callback) => {
    if (!details.requestHeaders.Referer) details.requestHeaders.Referer = 'https://com.offlineminesweeper.app/';
    callback({ requestHeaders: details.requestHeaders });
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
