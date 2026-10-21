/*
 * Uçtan uca duman testi: sayfayı gerçek Chromium'da file:// ile açar ve
 * yükleme, oynatma, en yüksek hız, mod değişimi, tam ekran, kalıcılık ve mobil yerleşimi dener.
 * Çalıştırma: npm run test:e2e   (ekran görüntüleri: SCREENSHOT_DIR, varsayılan ./screenshots)
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}
const { chromium } = loadPlaywright();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(path.join(root, 'index.html')).href;
const shots = path.resolve(process.env.SCREENSHOT_DIR || path.join(root, 'screenshots'));
fs.mkdirSync(shots, { recursive: true });

const launchOpts = {};
if (fs.existsSync('/opt/pw-browsers/chromium')) {
  // Ortamdaki önceden kurulu Chromium (sürüm uyuşmazlığında indirme yapmamak için)
  try {
    chromium.executablePath();
  } catch {
    launchOpts.executablePath = '/opt/pw-browsers/chromium';
  }
}

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

/** Canvas'ta arka plandan belirgin şekilde parlak piksel oranı. */
function litRatio(page) {
  return page.evaluate(() => {
    const c = document.getElementById('canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 300) lit++;
    return lit / (d.length / 16);
  });
}

const browser = await chromium.launch(launchOpts);
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  // Çevrimdışı ortamda Google Fonts'un yüklenememesi beklenen bir durum
  if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/ERR_(CONNECTION|NAME|TUNNEL|PROXY)/.test(m.text())) {
    errors.push('console: ' + m.text());
  }
});

await page.goto(url);
await page.waitForTimeout(600);

await step('açılış: başlık, örnek metin ve durağan önizleme', async () => {
  assert.equal(await page.title(), 'Eşikaltı Akış');
  assert.equal(await page.isVisible('#sampleChip'), true);
  assert.match(await page.textContent('#textStats'), /^14 cümle/);
  assert.ok((await litRatio(page)) > 0.002, 'canvas boş');
  await page.screenshot({ path: path.join(shots, '01-acilis.png') });
});

await step('.txt yükleme (UTF-8, numaralı liste)', async () => {
  await page.setInputFiles('#fileInput', path.join(root, 'examples', 'ornek-affirmasyonlar.txt'));
  await page.waitForFunction(() => /yüklendi/.test(document.getElementById('fileStatus').textContent));
  assert.match(await page.textContent('#fileStatus'), /UTF-8.*10 cümle/);
  assert.match(await page.textContent('#textStats'), /^10 cümle/);
  assert.equal(await page.isVisible('#sampleChip'), false);
});

await step('.txt yükleme (Türkçe Windows kodlaması, sona ekleme)', async () => {
  await page.check('#optAppend');
  const win1254 = Buffer.from([0xde, 0x65, 0x6b, 0x65, 0x72, 0x20, 0xfd, 0xf0, 0x64, 0xfd, 0x72, 0x2e, 0x0d, 0x0a]);
  await page.setInputFiles('#fileInput', { name: 'notepad.txt', mimeType: 'text/plain', buffer: win1254 });
  await page.waitForFunction(() => /eklendi/.test(document.getElementById('fileStatus').textContent));
  assert.match(await page.textContent('#fileStatus'), /Türkçe Windows/);
  assert.match(await page.inputValue('#text'), /Şeker ığdır\.\s*$/);
  assert.match(await page.textContent('#textStats'), /^11 cümle/);
  await page.uncheck('#optAppend');
});

await step('başlat: uyarı penceresi, sonra akış', async () => {
  await page.click('#idlePlay');
  assert.equal(await page.isVisible('#modal'), true);
  await page.click('#modalOk');
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => window.esikalti.engine.running), true);
  const shown = await page.evaluate(() => window.esikalti.engine.shown);
  assert.ok(shown > 5, `gösterim ${shown}`);
  assert.notEqual(await page.textContent('#hudShown'), '0');
});

await step('otomatik bilinçaltı hızı: 50 ms altında', async () => {
  const ms = await page.evaluate(() => window.esikalti.currentExposure());
  assert.ok(ms < 50, `${ms} ms`);
  assert.match(await page.textContent('#levelPill'), /Bilinçaltı/);
});

await step('manuel en yüksek hız: 1 kare, saniyede yüzlerce cümle', async () => {
  await page.$eval('#speed', (el) => {
    el.value = '100';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await page.isChecked('#smManual'), true);
  await page.waitForTimeout(2200);
  const { sps, ms, frame } = await page.evaluate(() => ({
    sps: window.esikalti.engine.sps,
    ms: window.esikalti.currentExposure(),
    frame: window.esikalti.engine.getFrameMs()
  }));
  assert.ok(Math.abs(ms - frame) < 0.01, `görünme ${ms} ms, kare ${frame} ms`);
  assert.ok(sps > 100, `ölçülen ${sps} cümle/sn`);
  assert.match(await page.textContent('#roFrames'), /^1 kare/);
  await page.screenshot({ path: path.join(shots, '02-akis-maks.png') });
});

await step('klavye: 2 = flaş, 3 = yağmur, ↓ yavaşlatır', async () => {
  await page.focus('#stage');
  await page.keyboard.press('2');
  await page.waitForTimeout(400);
  assert.equal(await page.isChecked('#mdFlash'), true);
  assert.ok((await litRatio(page)) >= 0);
  await page.screenshot({ path: path.join(shots, '03-flas.png') });
  await page.keyboard.press('3');
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(700);
  assert.equal(await page.isChecked('#mdRain'), true);
  const ms = await page.evaluate(() => window.esikalti.currentExposure());
  assert.ok(ms > 100, `${ms} ms`);
  await page.screenshot({ path: path.join(shots, '04-yagmur.png') });
});

await step('Boşluk ile durdur', async () => {
  await page.focus('#stage');
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.esikalti.engine.running), false);
  assert.match(await page.textContent('#idleLabel'), /Devam et/);
});

await step('tam ekran düğmesi ve çıkış', async () => {
  await page.click('#btnFullscreen');
  await page.waitForTimeout(400);
  const on = await page.evaluate(() => !!document.fullscreenElement || document.getElementById('stage').classList.contains('pseudo-fs'));
  assert.equal(on, true);
  await page.screenshot({ path: path.join(shots, '05-tam-ekran.png') });
  await page.click('#btnFullscreen');
  await page.waitForTimeout(400);
  const off = await page.evaluate(() => !document.fullscreenElement && !document.getElementById('stage').classList.contains('pseudo-fs'));
  assert.equal(off, true);
});

await step('ayarlar yeniden yüklemede korunur', async () => {
  await page.click('label[for="mdFlow"]');
  await page.fill('#text', 'Kalıcı cümle bir\nKalıcı cümle iki');
  await page.waitForTimeout(700);
  await page.reload();
  await page.waitForTimeout(500);
  assert.equal(await page.inputValue('#text'), 'Kalıcı cümle bir\nKalıcı cümle iki');
  assert.equal(await page.isChecked('#smManual'), true);
  assert.equal(await page.isChecked('#mdFlow'), true);
  // Uyarı onayı da hatırlanır: doğrudan başlar
  await page.click('#idlePlay');
  await page.waitForTimeout(300);
  assert.equal(await page.isVisible('#modal'), false);
  assert.equal(await page.evaluate(() => window.esikalti.engine.running), true);
  await page.keyboard.press('Space');
});

await step('Temizle + Geri al', async () => {
  await page.click('#btnClear');
  assert.match(await page.textContent('#textStats'), /Henüz cümle yok/);
  await page.click('.toast-action');
  assert.match(await page.textContent('#textStats'), /^2 cümle/);
});

await step('konsol / sayfa hatası yok', async () => {
  assert.deepEqual(errors, []);
});

// Telefon genişliği ve açık tema
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', deviceScaleFactor: 2, hasTouch: true });
const mp = await mobile.newPage();
mp.on('pageerror', (e) => errors.push('mobil pageerror: ' + e.message));
await mp.goto(url);
await mp.waitForTimeout(600);
await step('telefon: yatay kaydırma yok, sahne ve panel görünür', async () => {
  const { sw, iw } = await mp.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw, `scrollWidth ${sw} > ${iw}`);
  const box = await mp.locator('#stage').boundingBox();
  assert.ok(box.height > 300 && box.width > 340, JSON.stringify(box));
  assert.ok((await litRatio(mp)) > 0.002, 'canvas boş');
  await mp.screenshot({ path: path.join(shots, '06-telefon-acik-tema.png'), fullPage: true });
});

await browser.close();

const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} adım geçti · ekran görüntüleri: ${shots}`);
process.exit(failed.length ? 1 : 0);
