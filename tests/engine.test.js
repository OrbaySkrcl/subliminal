'use strict';
/*
 * Motoru sahte bir canvas ile Node'da çalıştırır ve temel garantiyi doğrular:
 * hız ne kadar yüksek olursa olsun hiçbir cümle tamamen görünür çizilmeden ekrandan çıkmaz.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRAME = 1000 / 60;

function makeEngine(opts) {
  const W = (opts && opts.W) || 800;
  const H = (opts && opts.H) || 600;
  const draws = [];
  const ctx = {
    font: '',
    fillStyle: '',
    globalAlpha: 1,
    textAlign: '',
    textBaseline: '',
    setTransform() {},
    clearRect() {},
    fillRect() {},
    measureText(t) {
      const size = parseFloat(String(this.font).split(' ')[1]) || 20;
      return { width: Array.from(t).length * size * 0.5 };
    },
    fillText(t, x, y) {
      draws.push({ t, x, y });
    }
  };
  const canvas = { clientWidth: W, clientHeight: H, width: 0, height: 0, getContext: () => ctx };
  const sandbox = { devicePixelRatio: 1, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, Math };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const f of ['text.js', 'speed.js', 'engine.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox, { filename: f });
  }
  const engine = new sandbox.SubEngine(canvas);
  engine.resize();
  let now = 1000;
  function frames(n, dt) {
    for (let i = 0; i < n; i++) {
      now += dt || FRAME;
      draws.length = 0;
      engine._tick(now);
      if (opts && opts.onFrame) opts.onFrame(engine, draws.slice());
    }
  }
  return { engine, frames, draws, W, H };
}

function sentences(n) {
  return Array.from({ length: n }, (_, i) => `Cümle numarası ${i} burada akıyor`);
}

/** Her kareden sonra canlı öğeleri toplar; ekrandan çıkan her öğe sayılmış olmalı. */
function assertNoneSkipped(getItems, h) {
  const seen = new Set();
  return {
    observe(engine) {
      for (const it of getItems(engine)) seen.add(it);
    },
    check(engine) {
      const alive = new Set(getItems(engine));
      let exited = 0;
      for (const it of seen) {
        if (alive.has(it)) continue;
        exited++;
        assert.ok(it.counted, `cümle ${it.idx} tamamen görünmeden ekrandan çıktı`);
      }
      return exited;
    }
  };
}

for (const lanes of [1, 3, 6]) {
  test(`akış (${lanes} şerit), en yüksek hız: atlanan cümle yok`, () => {
    let tracker;
    const h = makeEngine({ onFrame: (e) => tracker.observe(e) });
    tracker = assertNoneSkipped((e) => e.lanes.flatMap((l) => l.items));
    h.engine.setSentences(sentences(97));
    h.engine.configure({ mode: 'flow', lanes, exposureMs: 1, fontSize: 28 });
    assert.equal(h.engine.start(), true);
    h.frames(240);
    const exited = tracker.check(h.engine);
    assert.ok(exited > 200, `yeterince cümle akmadı: ${exited}`);
    // 4 saniyede (240 kare) yüzlerce gösterim: okunamayacak hız
    assert.ok(h.engine.shown / 4 > 100, `saniyede ${h.engine.shown / 4} cümle`);
  });
}

test('akış: kare düşmesi (100 ms takılma) olsa bile atlama yok', () => {
  let tracker;
  const h = makeEngine({ onFrame: (e) => tracker.observe(e) });
  tracker = assertNoneSkipped((e) => e.lanes.flatMap((l) => l.items));
  h.engine.setSentences(sentences(20));
  h.engine.configure({ mode: 'flow', lanes: 2, exposureMs: 1 });
  h.engine.start();
  for (let i = 0; i < 50; i++) h.frames(1, i % 5 === 0 ? 100 : FRAME);
  tracker.check(h.engine);
});

test('akış: uzun cümleler satıra sarılır ve hepsi ekrana sığar', () => {
  const long = 'Bu çok uzun bir affirmasyon cümlesidir ve tek satıra kesinlikle sığmaması gerekir çünkü şerit dar';
  const h = makeEngine({ W: 400, H: 500 });
  h.engine.setSentences([long]);
  h.engine.configure({ mode: 'flow', lanes: 2, exposureMs: 2000, fontSize: 24 });
  const L = h.engine._ensureLayout();
  assert.ok(L.items[0].lines.length > 1);
  for (const line of L.items[0].lines) assert.ok(Array.from(line).length * 12 <= L.maxW + 1e-9, line);
});

test('akış: yukarı yönde de tüm çizimler ekran içinde', () => {
  const ys = [];
  const h = makeEngine({ onFrame: (_, d) => d.forEach((x) => ys.push(x.y)) });
  h.engine.setSentences(sentences(10));
  h.engine.configure({ mode: 'flow', lanes: 1, exposureMs: 1500, direction: 'up', fontSize: 30 });
  h.engine.start();
  h.frames(120);
  assert.ok(ys.length > 0);
  // Satır üst kenarı en fazla bir satır yüksekliği kadar dışarıda olabilir (kısmi görünen)
  for (const y of ys) assert.ok(y > -40 && y < h.H, `y=${y}`);
});

test('flaş, en yüksek hız: her karede sıradaki cümle, hiçbiri atlanmaz', () => {
  const seq = [];
  const h = makeEngine({ onFrame: (_, d) => seq.push(d.map((x) => x.t).join(' ')) });
  const list = ['Bir', 'İki', 'Üç', 'Dört', 'Beş'];
  h.engine.setSentences(list);
  h.engine.configure({ mode: 'flash', exposureMs: 1 });
  h.engine.start();
  h.frames(20);
  // Görünme süresi 1 karenin altında: her kare bir sonraki cümleye geçer
  const tail = seq.slice(0, 12);
  for (let i = 1; i < tail.length; i++) {
    const a = list.indexOf(tail[i - 1]);
    const b = list.indexOf(tail[i]);
    assert.equal(b, (a + 1) % list.length, `kare ${i}: ${tail[i - 1]} → ${tail[i]}`);
  }
});

test('flaş: 25 ms görünme 60 Hz\'de ortalama 1,5 kareye denk gelir', () => {
  const seq = [];
  const h = makeEngine({ onFrame: (_, d) => seq.push(d.map((x) => x.t).join(' ')) });
  h.engine.setSentences(sentences(7));
  h.engine.configure({ mode: 'flash', exposureMs: 25, fontSize: 10 });
  h.engine.start();
  h.frames(600);
  let changes = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) changes++;
  const avgFrames = seq.length / changes;
  assert.ok(avgFrames > 1.35 && avgFrames < 1.65, `ortalama ${avgFrames} kare`);
});

test('flaş: maskeleme açıkken cümleler arasında boş kare var', () => {
  const seq = [];
  const h = makeEngine({ onFrame: (_, d) => seq.push(d.length) });
  h.engine.setSentences(sentences(4));
  h.engine.configure({ mode: 'flash', exposureMs: 1, flashGap: true, fontSize: 10 });
  h.engine.start();
  h.frames(40);
  const pattern = seq.slice(4).map((n) => (n ? 'x' : '_')).join('');
  assert.match(pattern, /^(?:x_)+x?$|^(?:_x)+_?$/);
});

test('yağmur, en yüksek hız: atlanan cümle yok', () => {
  let tracker;
  const h = makeEngine({ onFrame: (e) => tracker.observe(e) });
  tracker = assertNoneSkipped((e) => e.rain);
  h.engine.setSentences(sentences(50));
  h.engine.configure({ mode: 'rain', lanes: 4, exposureMs: 1 });
  h.engine.start();
  h.frames(240);
  assert.ok(tracker.check(h.engine) > 100);
});

test('karışık sıra: her tur tüm cümleleri bir kez gösterir', () => {
  const h = makeEngine();
  h.engine.setSentences(sentences(9));
  h.engine.configure({ shuffle: true });
  const seq = h.engine.seq;
  for (let round = 0; round < 5; round++) {
    const got = Array.from({ length: 9 }, () => seq.next()).sort((a, b) => a - b);
    assert.deepEqual(got, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  }
  assert.equal(seq.cycles, 4);
});

test('geometri: şerit arttıkça yuva sayısı artar', () => {
  const h = makeEngine();
  // Kısa cümleler: dar şeritte de tek satır kalır, böylece yalnızca şerit etkisi ölçülür
  h.engine.setSentences(['Bir', 'İki', 'Üç', 'Huzur', 'Güç']);
  h.engine.configure({ mode: 'flow', lanes: 1 });
  const one = h.engine.geometry().slots;
  h.engine.configure({ lanes: 4 });
  const four = h.engine.geometry().slots;
  assert.ok(four > one * 3.5, `${one} → ${four}`);
  h.engine.configure({ mode: 'flash' });
  assert.equal(h.engine.geometry().slots, 1);
});

test('dar ekran (telefon, 3 şerit): yazı küçülür, hiçbir kelime bölünmez', () => {
  const list = ['Kendimi olduğum gibi seviyor ve kabul ediyorum.', 'Kararlarıma güveniyorum.', 'İçimdeki huzur büyüyor.'];
  for (const mode of ['flow', 'flash']) {
    const h = makeEngine({ W: 360, H: 400 });
    h.engine.setSentences(list);
    h.engine.configure({ mode, lanes: 3, fontSize: 30 });
    const L = h.engine._ensureLayout();
    assert.ok(h.engine.fontFit() < 1 || mode === 'flash', `${mode}: küçülmedi`);
    const words = new Set(list.join(' ').split(' '));
    for (const it of L.items) {
      for (const line of it.lines) {
        for (const w of line.split(' ')) assert.ok(words.has(w), `${mode}: bölünmüş kelime "${w}"`);
      }
    }
  }
});

test('geniş ekranda yazı istenen boyutta kalır', () => {
  const h = makeEngine({ W: 1400, H: 800 });
  h.engine.setSentences(['Kısa cümle', 'Bir tane daha']);
  h.engine.configure({ mode: 'flow', lanes: 2, fontSize: 30 });
  assert.equal(h.engine.fontFit(), 1);
});
