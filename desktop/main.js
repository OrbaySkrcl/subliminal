/*
 * Eşikaltı masaüstü uygulaması (Electron ana süreç).
 *
 * Kontrol penceresi: index.html (tarayıcı sürümüyle aynı arayüz, "Ekran üstü" bölümü açık).
 * Ekran üstü (overlay): her seçili ekran için şeffaf, tıklamayı geçiren, her zaman en üstte duran,
 * odak almayan bir pencere. Oyun, film, tarayıcı... ne açıksa üstünde flaş gösterir.
 */
'use strict';

const { app, BrowserWindow, ipcMain, screen, globalShortcut, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('node:path');

// Odak almayan overlay penceresinde Chromium zamanlayıcıyı ve çizimi yavaşlatmasın:
// süreler ancak böyle doğru kalır.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

if (process.env.ESIKALTI_USER_DATA) app.setPath('userData', process.env.ESIKALTI_USER_DATA);

const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'build', 'icon.png');
const HOTKEY = 'CommandOrControl+Alt+S';
const HOTKEY_LABEL = process.platform === 'darwin' ? 'Cmd+Option+S' : 'Ctrl+Alt+S';
const KEEP_ON_TOP_MS = 1500; // bazı programlar "en üst" konumunu çalar: düzenli geri al
const STARTED_HIDDEN = process.argv.includes('--hidden');

let control = null;
let tray = null;
let config = null;
let running = false;
let quitting = false;
let autoStartDone = false;
let hotkeyOk = false;
let startedAt = 0;
let stopTimer = null;
let topTimer = null;
let statusTimer = null;
let lastReason = null;
/** webContents.id → { win, displayId, bounds, stats } */
const overlays = new Map();

// ---------- Ayar doğrulama (kontrol penceresinden gelen her şey sınırlanır) ----------
function num(v, lo, hi, d) {
  v = Number(v);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
}
function oneOf(v, list, d) {
  return list.indexOf(v) >= 0 ? v : d;
}
function hex(v, d) {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d;
}

function sanitize(p) {
  if (!p || typeof p !== 'object') return null;
  const s = p.settings || {};
  const o = p.overlay || {};
  return {
    sentences: Array.isArray(p.sentences)
      ? p.sentences.filter((x) => typeof x === 'string' && x.trim()).slice(0, 5000).map((x) => x.slice(0, 500))
      : [],
    settings: {
      mode: oneOf(s.mode, ['flash', 'flow', 'rain'], 'flash'),
      exposureMs: num(s.exposureMs, 1, 8000, 33),
      gapMs: num(s.gapMs, 0, 3600000, 0),
      burst: Math.round(num(s.burst, 1, 20, 1)),
      jitter: num(s.jitter, 0, 1, 0),
      position: oneOf(s.position, ['center', 'random', 'top', 'bottom'], 'center'),
      lanes: Math.round(num(s.lanes, 1, 6, 2)),
      direction: s.direction === 'up' ? 'up' : 'down',
      fontFamily: typeof s.fontFamily === 'string' ? s.fontFamily.slice(0, 200) : 'sans-serif',
      fontSize: num(s.fontSize, 8, 300, 46),
      fontWeight: num(s.fontWeight, 100, 900, 500),
      color: hex(s.color, '#ffffff'),
      opacity: num(s.opacity, 0, 1, 0.85),
      outlineWidth: num(s.outlineWidth, 0, 20, 0),
      outlineColor: hex(s.outlineColor, '#000000'),
      shuffle: !!s.shuffle
    },
    overlay: {
      display: String(o.display == null ? 'all' : o.display),
      hideCapture: !!o.hideCapture,
      sessionMin: num(o.sessionMin, 0, 1440, 0),
      autoStart: !!o.autoStart
    }
  };
}

// ---------- Ekranlar ----------
function displayList() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    primary: d.id === primary,
    label:
      'Ekran ' + (i + 1) + ' · ' + d.size.width + '×' + d.size.height +
      (d.displayFrequency ? ' · ' + Math.round(d.displayFrequency) + ' Hz' : '') +
      (d.id === primary ? ' · birincil' : '')
  }));
}

function targetDisplays() {
  const all = screen.getAllDisplays();
  const sel = config ? config.overlay.display : 'all';
  if (sel === 'all') return all;
  const found = all.find((d) => String(d.id) === sel);
  return [found || screen.getPrimaryDisplay()];
}

// ---------- Overlay pencereleri ----------
function overlaySettings() {
  return Object.assign({}, config.settings, { bgAlpha: 0, preview: false });
}

function sendConfig(entry) {
  if (!entry.win.isDestroyed()) {
    entry.win.webContents.send('overlay:config', { sentences: config.sentences, settings: overlaySettings() });
  }
}

function createOverlay(display) {
  const b = display.bounds;
  const win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    enableLargerThanScreen: true,
    title: 'Eşikaltı ekran üstü',
    webPreferences: {
      preload: path.join(__dirname, 'overlay-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  });
  const entry = { win, displayId: display.id, bounds: JSON.stringify(b), stats: null };
  const id = win.webContents.id;
  overlays.set(id, entry);
  win.setIgnoreMouseEvents(true); // tıklamalar alttaki oyuna/programa geçer
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setContentProtection(config.overlay.hideCapture);
  win.webContents.on('did-finish-load', () => sendConfig(entry));
  win.once('ready-to-show', () => {
    win.setBounds(b);
    win.showInactive();
  });
  win.on('closed', () => overlays.delete(id));
  win.loadFile(path.join(ROOT, 'overlay.html'));
}

/** Seçili ekranlarla açık overlay'leri eşitle (ekran takılıp çıkarılınca da çağrılır). */
function syncOverlays() {
  const wanted = targetDisplays();
  for (const entry of overlays.values()) {
    const d = wanted.find((x) => x.id === entry.displayId);
    if (!d || JSON.stringify(d.bounds) !== entry.bounds) entry.win.destroy();
  }
  const have = new Set([...overlays.values()].map((e) => e.displayId));
  wanted.filter((d) => !have.has(d.id)).forEach(createOverlay);
}

function scheduleStop() {
  clearTimeout(stopTimer);
  stopTimer = null;
  const ms = config.overlay.sessionMin * 60000;
  if (ms > 0) stopTimer = setTimeout(() => stopOverlay('timer'), Math.max(0, ms - (Date.now() - startedAt)));
}

function canStart() {
  return !!(config && config.sentences.length);
}

function startOverlay() {
  if (running) return status();
  if (!canStart()) {
    lastReason = 'empty';
    broadcast();
    return status();
  }
  running = true;
  lastReason = null;
  startedAt = Date.now();
  syncOverlays();
  scheduleStop();
  topTimer = setInterval(() => {
    for (const e of overlays.values()) {
      if (e.win.isDestroyed()) continue;
      e.win.setAlwaysOnTop(true, 'screen-saver');
      e.win.moveTop();
    }
  }, KEEP_ON_TOP_MS);
  statusTimer = setInterval(broadcast, 1000);
  updateTray();
  broadcast();
  return status();
}

function stopOverlay(reason) {
  if (!running) return status();
  running = false;
  lastReason = reason || null;
  clearTimeout(stopTimer);
  clearInterval(topTimer);
  clearInterval(statusTimer);
  stopTimer = topTimer = statusTimer = null;
  for (const e of overlays.values()) e.win.destroy();
  overlays.clear();
  updateTray();
  broadcast();
  return status();
}

function toggleOverlay() {
  return running ? stopOverlay('user') : startOverlay();
}

// ---------- Durum ----------
function status() {
  const list = [...overlays.values()].map((e) => e.stats).filter(Boolean);
  const measured = list.filter((s) => s.count > 0);
  const sum = (k) => list.reduce((t, s) => t + (s[k] || 0), 0);
  return {
    running,
    displays: overlays.size,
    count: sum('count'),
    late: sum('late'),
    shown: sum('shown'),
    avgMs: measured.length ? measured.reduce((t, s) => t + s.avgMs, 0) / measured.length : 0,
    minMs: measured.length ? Math.min(...measured.map((s) => s.minMs)) : 0,
    maxMs: measured.length ? Math.max(...measured.map((s) => s.maxMs)) : 0,
    expectedMs: measured.length ? measured[0].expectedMs : 0,
    frameMs: list.length ? list[0].frameMs : 0,
    remainingMs: running && config && config.overlay.sessionMin > 0
      ? Math.max(0, config.overlay.sessionMin * 60000 - (Date.now() - startedAt))
      : null,
    hotkey: HOTKEY_LABEL,
    hotkeyOk,
    reason: lastReason,
    error: lastReason === 'empty' ? 'Önce en az bir cümle ekle.' : null
  };
}

function broadcast() {
  if (control && !control.isDestroyed()) control.webContents.send('overlay:status', status());
}

// ---------- Kontrol penceresi ve tepsi ----------
function showControl() {
  if (!control) createControl(true);
  else {
    if (control.isMinimized()) control.restore();
    control.show();
    control.focus();
  }
}

function createControl(show) {
  control = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    show: false,
    backgroundColor: '#121019',
    title: 'Eşikaltı',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  control.once('ready-to-show', () => {
    if (show) control.show();
  });
  control.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  control.webContents.on('will-navigate', (e, url) => {
    e.preventDefault();
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });
  // Ekran üstü çalışırken pencereyi kapatmak uygulamayı tepsiye indirir
  control.on('close', (e) => {
    if (!quitting && running && tray) {
      e.preventDefault();
      control.hide();
    }
  });
  control.on('closed', () => {
    control = null;
    if (!running || !tray) app.quit();
  });
  control.loadFile(path.join(ROOT, 'index.html'));
}

function createTray() {
  try {
    let img = nativeImage.createFromPath(ICON);
    if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.setToolTip('Eşikaltı');
    tray.on('click', showControl);
    updateTray();
  } catch (e) {
    tray = null; // sistem tepsisi olmayan masaüstü
  }
}

function updateTray() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: running ? 'Ekran üstünü durdur' : 'Ekran üstünde başlat', click: toggleOverlay, enabled: running || canStart() },
      { label: 'Ayarları aç', click: showControl },
      { type: 'separator' },
      {
        label: 'Çıkış',
        click: () => {
          quitting = true;
          app.quit();
        }
      }
    ])
  );
  tray.setToolTip(running ? 'Eşikaltı · ekran üstü çalışıyor' : 'Eşikaltı');
}

// ---------- IPC ----------
function fromControl(e) {
  return !!control && !control.isDestroyed() && e.sender === control.webContents;
}

ipcMain.handle('overlay:set-config', (e, p) => {
  if (!fromControl(e)) return false;
  const next = sanitize(p);
  if (!next) return false;
  const prevDisplay = config && config.overlay.display;
  const prevSession = config && config.overlay.sessionMin;
  config = next;
  if (running) {
    if (prevDisplay !== config.overlay.display) syncOverlays();
    if (prevSession !== config.overlay.sessionMin) scheduleStop();
    for (const entry of overlays.values()) {
      if (entry.win.isDestroyed()) continue;
      entry.win.setContentProtection(config.overlay.hideCapture);
      sendConfig(entry);
    }
    if (!config.sentences.length) stopOverlay('empty');
  }
  if (!autoStartDone) {
    autoStartDone = true;
    if (config.overlay.autoStart && canStart()) startOverlay();
  }
  updateTray();
  return true;
});
ipcMain.handle('overlay:start', (e) => (fromControl(e) ? startOverlay() : null));
ipcMain.handle('overlay:stop', (e) => (fromControl(e) ? stopOverlay('user') : null));
ipcMain.handle('overlay:displays', (e) => (fromControl(e) ? displayList() : []));
ipcMain.handle('app:get-login', (e) => (fromControl(e) ? app.getLoginItemSettings().openAtLogin : false));
ipcMain.handle('app:set-login', (e, on) => {
  if (!fromControl(e)) return false;
  app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.on('overlay:stats', (e, st) => {
  const entry = overlays.get(e.sender.id);
  if (!entry || !st || typeof st !== 'object') return;
  entry.stats = {
    frameMs: num(st.frameMs, 1, 100, 1000 / 60),
    shown: num(st.shown, 0, 1e12, 0),
    count: num(st.count, 0, 1e12, 0),
    late: num(st.late, 0, 1e12, 0),
    avgMs: num(st.avgMs, 0, 1e7, 0),
    minMs: num(st.minMs, 0, 1e7, 0),
    maxMs: num(st.maxMs, 0, 1e7, 0),
    expectedMs: num(st.expectedMs, 0, 1e7, 0)
  };
});

// ---------- Yaşam döngüsü ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showControl);

  app.whenReady().then(() => {
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
    createTray();
    createControl(!STARTED_HIDDEN || !tray);
    hotkeyOk = globalShortcut.register(HOTKEY, toggleOverlay);
    ['display-added', 'display-removed', 'display-metrics-changed'].forEach((ev) =>
      screen.on(ev, () => {
        if (running) syncOverlays();
      })
    );
  });

  app.on('activate', showControl);
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  // Overlay pencereleri kapanınca uygulama kapanmasın; çıkışı kontrol penceresi ve tepsi yönetir
  app.on('window-all-closed', () => {});
}
