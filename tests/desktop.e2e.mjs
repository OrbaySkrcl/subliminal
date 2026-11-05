/*
 * Masaüstü uygulaması uçtan uca testi: gerçek Electron'u açar (Linux'ta Xvfb altında),
 * kontrol penceresinden ekran üstünü başlatır ve overlay penceresini, zamanlamayı ve
 * oturum süresini doğrular.
 * Çalıştırma: npm run test:desktop
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}
const { _electron: electron } = loadPlaywright();
const electronPath = require('electron');

const userData = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'esikalti-'));
const args = [root];
// Yalnızca test: root olarak çalışan kapsayıcıda ve CI'ın Linux makinesinde Chromium sandbox'ı açılamaz
if ((process.getuid && process.getuid() === 0) || process.env.CI) args.push('--no-sandbox');

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(['ok', name]);
    console.log('ok   ', name);
  } catch (e) {
    results.push(['FAIL', name]);
    console.log('FAIL ', name, '\n     ', e.message.split('\n').join('\n      '));
  }
}

const errors = [];
function watch(page, label) {
  page.on('pageerror', (e) => errors.push(label + ' pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/fonts\.(googleapis|gstatic)|ERR_(CONNECTION|NAME|TUNNEL|PROXY|INTERNET)/.test(t)) return;
    errors.push(label + ' console: ' + t);
  });
}

const app = await electron.launch({
  executablePath: electronPath,
  args,
  env: Object.assign({}, process.env, { ESIKALTI_USER_DATA: userData })
});
const win = await app.firstWindow();
watch(win, 'kontrol');
await win.waitForSelector('#overlayDesk:not([hidden])', { timeout: 15000 });

async function overlayInfo() {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const list = BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().endsWith('overlay.html'));
    return {
      count: list.length,
      primary: screen.getPrimaryDisplay().bounds,
      wins: list.map((w) => ({
        top: w.isAlwaysOnTop(),
        focusable: w.isFocusable(),
        visible: w.isVisible(),
        bounds: w.getBounds(),
        protected: typeof w.isContentProtected === 'function' ? w.isContentProtected() : null
      }))
    };
  });
}

async function overlayPage() {
  for (let i = 0; i < 50; i++) {
    const p = app.windows().find((w) => w.url().endsWith('overlay.html'));
    if (p) return p;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('overlay sayfası açılmadı');
}

async function waitFor(fn, ms, label) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('zaman aşımı: ' + label);
}

await step('kontrol penceresi masaüstü modunda: Ekran üstü bölümü açık', async () => {
  assert.equal(await win.isVisible('#overlayWeb'), false);
  assert.equal(await win.textContent('#overlayPill'), 'Masaüstü');
  const opts = await win.$$eval('#ovDisplay option', (o) => o.map((x) => x.textContent));
  assert.ok(opts.some((t) => /^Ekran 1 · \d+×\d+/.test(t)), opts.join(' | '));
});

await step('genel kısayol kayıtlı (Ctrl+Alt+S)', async () => {
  const ok = await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CommandOrControl+Alt+S'));
  assert.equal(ok, true);
});

await step('ekran üstü başlar: şeffaf, en üstte, odak almayan, tüm ekranı kaplayan pencere', async () => {
  await win.fill('#ovMs', '50');
  await win.fill('#ovGap', '300');
  await win.selectOption('#ovPosition', 'center');
  await win.click('#ovToggle');
  assert.equal(await win.isVisible('#modal'), true, 'ışığa duyarlılık uyarısı');
  await win.click('#modalOk');
  await waitFor(async () => (await overlayInfo()).count === 1, 8000, 'overlay penceresi');
  const page = await overlayPage();
  watch(page, 'overlay');
  await waitFor(async () => (await overlayInfo()).wins[0].visible, 5000, 'görünür');
  const info = await overlayInfo();
  const w = info.wins[0];
  assert.equal(w.top, true, 'her zaman üstte');
  assert.equal(w.focusable, false, 'odak almaz');
  // Linux/X11'de Chromium, ekranla birebir aynı boyuttaki pencereyi 1 px küçültür (WM tam ekran sanmasın diye)
  const slack = process.platform === 'linux' ? 1 : 0;
  assert.equal(w.bounds.x, info.primary.x);
  assert.equal(w.bounds.y, info.primary.y);
  assert.ok(info.primary.width - w.bounds.width <= slack && info.primary.height - w.bounds.height <= slack, JSON.stringify(w.bounds));
  // Overlay başlamadan önce ~0,8 sn ekranın yenileme hızını ölçer
  await waitFor(() => page.evaluate(() => window.overlayTest.engine.running), 5000, 'overlay motoru');
  const look = await page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    bgAlpha: window.overlayTest.engine.s.bgAlpha,
    running: window.overlayTest.engine.running
  }));
  assert.deepEqual(look, { bg: 'rgba(0, 0, 0, 0)', bgAlpha: 0, running: true });
  assert.match(await win.textContent('#ovToggle'), /durdur/);
});

await step('zamanlama: ölçülen görünme süresi kareye oturtulmuş süreyle aynı (50 ms)', async () => {
  const page = await overlayPage();
  await waitFor(async () => (await page.evaluate(() => window.overlayTest.engine.flashSummary().count)) >= 8, 10000, '8 flaş');
  const sum = await page.evaluate(() => window.overlayTest.engine.flashSummary());
  const frame = await page.evaluate(() => window.overlayTest.engine.getFrameMs());
  const expected = Math.max(1, Math.round(50 / frame)) * frame;
  assert.ok(Math.abs(sum.expectedMs - expected) < 1e-6, `beklenen ${sum.expectedMs} / ${expected}`);
  assert.ok(Math.abs(sum.avgMs - expected) < 2, `ölçülen ort. ${sum.avgMs} ms, beklenen ${expected} ms`);
  // Varsayılan %20 rastgelelik: her aralık 240–360 ms; ölçülen, planlanana bir kare içinde uymalı
  assert.ok(Math.abs(sum.gapAvgMs - sum.gapPlannedMs) <= frame, `aralık ${sum.gapAvgMs} / plan ${sum.gapPlannedMs} ms`);
  assert.ok(sum.gapPlannedMs >= 240 && sum.gapPlannedMs <= 360, `plan ${sum.gapPlannedMs}`);
  console.log(`      ${(1000 / frame).toFixed(1)} Hz · ölçülen ${sum.avgMs.toFixed(2)} ms (${sum.minMs.toFixed(1)}–${sum.maxMs.toFixed(1)}) · aralık ${sum.gapAvgMs.toFixed(1)} ms (plan ${sum.gapPlannedMs.toFixed(1)}) · geç ${sum.late}/${sum.count}`);
  // Kontrol penceresindeki gösterge de ölçümü yansıtıyor
  await waitFor(async () => !(await win.$eval('#ovReadout', (e) => e.hidden)), 4000, 'gösterge');
  assert.match(await win.textContent('#ovMeasured'), /ms/);
  if (process.env.SCREENSHOT_DIR) {
    await win.locator('#overlayGroup').scrollIntoViewIfNeeded();
    await win.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, '08-masaustu-ekran-ustu.png') });
  }
});

await step('canlı güncelleme: çalışırken ms değişince overlay yeni süreye geçer', async () => {
  await win.fill('#ovMs', '100');
  const page = await overlayPage();
  await waitFor(async () => (await page.evaluate(() => window.overlayTest.engine.s.exposureMs)) === 100, 4000, 'ayar');
  await waitFor(async () => (await page.evaluate(() => window.overlayTest.engine.flashSummary().count)) >= 4, 8000, 'yeni ölçüm');
  const sum = await page.evaluate(() => window.overlayTest.engine.flashSummary());
  assert.ok(Math.abs(sum.avgMs - sum.expectedMs) < 2 && sum.expectedMs > 90, JSON.stringify(sum));
});

await step('durdur: overlay pencereleri kapanır', async () => {
  await win.click('#ovToggle');
  await waitFor(async () => (await overlayInfo()).count === 0, 5000, 'kapanma');
  assert.match(await win.textContent('#ovToggle'), /başlat/);
});

await step('kayıtta gizle: içerik koruması açılır (Windows/macOS; Linux desteklemez)', async () => {
  await win.check('#ovHideCapture');
  await win.click('#ovToggle');
  try {
    await waitFor(async () => (await overlayInfo()).count === 1, 8000, 'overlay');
    const info = await overlayInfo();
    if (process.platform !== 'linux' && info.wins[0].protected !== null) assert.equal(info.wins[0].protected, true);
  } finally {
    await win.click('#ovToggle');
    await waitFor(async () => (await overlayInfo()).count === 0, 5000, 'kapanma');
    await win.uncheck('#ovHideCapture');
  }
});

await step('oturum süresi dolunca kendiliğinden durur', async () => {
  await win.fill('#ovSession', '0.05'); // 3 saniye
  await win.click('#ovToggle');
  await waitFor(async () => (await overlayInfo()).count === 1, 8000, 'overlay');
  await waitFor(async () => (await overlayInfo()).count === 0, 8000, 'süre dolunca kapanma');
  await waitFor(async () => /süresi doldu/.test(await win.textContent('#ovStatus')), 3000, 'durum mesajı');
  await win.fill('#ovSession', '0');
});

await step('ayarlar kalıcı: yeniden açınca ms ve aralık korunur', async () => {
  await new Promise((r) => setTimeout(r, 600));
  const saved = await win.evaluate(() => JSON.parse(localStorage.getItem('esikalti:v1')).overlay);
  assert.equal(saved.exposureMs, 100);
  assert.equal(saved.gapMs, 300);
});

await step('konsol / sayfa hatası yok', async () => {
  assert.deepEqual(errors, []);
});

await app.close();
fs.rmSync(userData, { recursive: true, force: true });

const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} adım geçti`);
process.exit(failed.length ? 1 : 0);
