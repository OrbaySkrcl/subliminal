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
  const strokes = [];
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
    },
    strokeText(t, x, y) {
      strokes.push({ t, x, y });
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
  const frameDt = (opts && opts.frameDt) || FRAME;
  function skip(ms) {
    now += ms;
  }
  function frames(n, dt) {
    for (let i = 0; i < n; i++) {
      now += dt || frameDt;
      draws.length = 0;
      engine._tick(now);
      if (opts && opts.onFrame) opts.onFrame(engine, draws.slice());
    }
  }
  return { engine, frames, skip, draws, strokes, W, H };
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

/** Flaş modunda her karede çizilen metni kaydeder ve ardışık aynı metinleri flaşlara gruplar. */
function flashRecorder(extra) {
  const frames = [];
  const h = makeEngine(Object.assign({ onFrame: (_, d) => frames.push(d.map((x) => x.t).join(' ')) }, extra));
  return {
    h,
    frames,
    /** [{text:'', frames:n}] — boş metin = aralık */
    runs(skipFirst) {
      const runs = [];
      for (const t of frames) {
        if (runs.length && runs[runs.length - 1].text === t) runs[runs.length - 1].frames++;
        else runs.push({ text: t, frames: 1 });
      }
      // Son grup yarım kalmış olabilir; ilk grup isteğe bağlı atlanır
      return runs.slice(skipFirst ? 1 : 0, -1);
    }
  };
}

test('flaş, en yüksek hız: her karede sıradaki cümle, hiçbiri atlanmaz', () => {
  const r = flashRecorder();
  const list = ['Bir', 'İki', 'Üç', 'Dört', 'Beş'];
  r.h.engine.setSentences(list);
  r.h.engine.configure({ mode: 'flash', exposureMs: 1 });
  r.h.engine.start();
  r.h.frames(20);
  for (let i = 1; i < r.frames.length; i++) {
    const a = list.indexOf(r.frames[i - 1]);
    const b = list.indexOf(r.frames[i]);
    assert.equal(b, (a + 1) % list.length, `kare ${i}: ${r.frames[i - 1]} → ${r.frames[i]}`);
  }
});

for (const [hz, cases] of [
  [60, [[1, 1], [17, 1], [25, 2], [33, 2], [50, 3], [100, 6], [250, 15]]],
  [144, [[1, 1], [7, 1], [25, 4], [50, 7], [100, 14]]]
]) {
  test(`flaş ${hz} Hz: görünme süresi tam kareye oturur ve ölçülen süre birebir tutar`, () => {
    const frame = 1000 / hz;
    for (const [ms, expectFrames] of cases) {
      const r = flashRecorder({ frameDt: frame });
      r.h.engine.frameMs = frame;
      r.h.engine.setSentences(sentences(7));
      r.h.engine.configure({ mode: 'flash', exposureMs: ms, fontSize: 10 });
      r.h.engine.start();
      r.h.frames(expectFrames * 12 + 5);
      const runs = r.runs(false);
      assert.ok(runs.length >= 8, `${ms} ms: ${runs.length} flaş`);
      for (const run of runs) assert.equal(run.frames, expectFrames, `${ms} ms @ ${hz} Hz`);
      const sum = r.h.engine.flashSummary();
      assert.ok(Math.abs(sum.expectedMs - expectFrames * frame) < 1e-9);
      assert.ok(Math.abs(sum.avgMs - sum.expectedMs) < 1e-6, `ölçülen ${sum.avgMs}, beklenen ${sum.expectedMs}`);
      assert.equal(sum.late, 0);
    }
  });
}

test('flaş: aralık (ms) — flaştan sonra ekran belirtilen süre boş kalır', () => {
  const r = flashRecorder();
  r.h.engine.setSentences(sentences(5));
  r.h.engine.configure({ mode: 'flash', exposureMs: 33, gapMs: 1000, fontSize: 10 });
  r.h.engine.start();
  r.h.frames(60 * 6);
  const runs = r.runs(false);
  const shows = runs.filter((x) => x.text);
  const gaps = runs.filter((x) => !x.text);
  assert.ok(shows.length >= 5 && gaps.length >= 4);
  for (const s of shows) assert.equal(s.frames, 2);
  for (const g of gaps) assert.equal(g.frames, 60, 'aralık 60 kare = 1000 ms olmalı');
  const sum = r.h.engine.flashSummary();
  assert.ok(Math.abs(sum.gapAvgMs - 1000) <= FRAME / 2, `ölçülen aralık ${sum.gapAvgMs}`);
});

test('flaş: seri — her flaşta art arda N farklı cümle, sonra aralık', () => {
  const r = flashRecorder();
  r.h.engine.setSentences(sentences(9));
  r.h.engine.configure({ mode: 'flash', exposureMs: 33, gapMs: 500, burst: 3, fontSize: 10 });
  r.h.engine.start();
  r.h.frames(60 * 5);
  const runs = r.runs(false);
  // Desen: 3 cümle (2'şer kare) + 1 boşluk (30 kare)
  for (let i = 0; i + 3 < runs.length; i += 4) {
    const group = runs.slice(i, i + 3);
    assert.ok(group.every((g) => g.text && g.frames === 2), JSON.stringify(group));
    assert.equal(new Set(group.map((g) => g.text)).size, 3);
    assert.deepEqual(runs[i + 3], { text: '', frames: 30 });
  }
});

test('flaş: rastgelelik — aralıklar ±oran içinde değişir', () => {
  const r = flashRecorder();
  r.h.engine.setSentences(sentences(5));
  r.h.engine.configure({ mode: 'flash', exposureMs: 17, gapMs: 1000, jitter: 0.5, fontSize: 10 });
  r.h.engine.start();
  r.h.frames(60 * 40);
  const gaps = r.runs(false).filter((x) => !x.text).map((g) => g.frames * FRAME);
  assert.ok(gaps.length >= 15);
  assert.ok(new Set(gaps.map(Math.round)).size > 5, 'aralıklar değişmiyor');
  for (const g of gaps) assert.ok(g >= 500 - FRAME && g <= 1500 + FRAME, `aralık ${g}`);
});

test('flaş: kare düşmesi — ortada düşen kare süreyi uzatmaz, sondaki en fazla 1 kare uzatır ve raporlanır', () => {
  const r = flashRecorder();
  r.h.engine.setSentences(sentences(5));
  r.h.engine.configure({ mode: 'flash', exposureMs: 100, fontSize: 10 });
  r.h.engine.start();
  // Her 7 karede bir kare düşer: 6 karelik (100 ms) flaşların neredeyse hepsine bir düşme denk gelir
  for (let i = 0; i < 420; i++) r.h.frames(1, i % 7 === 3 ? 2 * FRAME : FRAME);
  const samples = r.h.engine.flashStats.samples;
  const exact = samples.filter((x) => Math.abs(x - 100) < 1e-6).length;
  // Kare sayarak çalışan bir zamanlayıcıda düşme içeren her flaş 116,7 ms olurdu
  assert.ok(exact / samples.length > 0.6, `tam süreli flaş oranı ${exact}/${samples.length}`);
  for (const x of samples) assert.ok(x <= 100 + FRAME + 1e-6, `${x} ms`);
  const late = samples.filter((x) => x > 100 + FRAME / 2).length;
  assert.equal(r.h.engine.flashSummary().late, late);

  // Bitiş karesi düşerse ekran ancak bir sonraki karede değişebilir: 1 kare geç, ve raporlanır
  const e = flashRecorder();
  e.h.engine.setSentences(sentences(5));
  e.h.engine.configure({ mode: 'flash', exposureMs: 50, fontSize: 10 });
  e.h.engine.start();
  e.h.frames(3); // başla + 2 kare
  e.h.frames(1, 2 * FRAME); // 50. ms'deki kare düştü
  const sum = e.h.engine.flashSummary();
  assert.ok(Math.abs(sum.lastMs - 4 * FRAME) < 1e-6, `${sum.lastMs}`);
  assert.equal(sum.late, 1);
});

test('flaş: duraklat / devam et sahte ölçüm üretmez, cümle kaldığı yerden sürer', () => {
  const r = flashRecorder();
  r.h.engine.setSentences(sentences(5));
  r.h.engine.configure({ mode: 'flash', exposureMs: 100, fontSize: 10 });
  r.h.engine.start();
  r.h.frames(9);
  const before = r.frames[r.frames.length - 1];
  r.h.engine.stop();
  r.h.skip(5000);
  r.h.engine.start();
  r.h.frames(1);
  assert.equal(r.frames[r.frames.length - 1], before);
  r.h.frames(60);
  const sum = r.h.engine.flashSummary();
  assert.ok(sum.maxMs <= 100 + FRAME, `en uzun ${sum.maxMs}`);
  assert.equal(sum.late, 0);
});

test('flaş: çalışırken süre değişince ölçüm yalnızca yeni süreyle başlayan flaşları içerir', () => {
  const r = flashRecorder();
  r.h.engine.setSentences(sentences(5));
  r.h.engine.configure({ mode: 'flash', exposureMs: 50, gapMs: 100, fontSize: 10 });
  r.h.engine.start();
  r.h.frames(31); // bir flaş ekrandayken
  r.h.engine.configure({ exposureMs: 100 });
  r.h.frames(120);
  const samples = r.h.engine.flashStats.samples;
  assert.ok(samples.length >= 3);
  for (const x of samples) assert.ok(Math.abs(x - 100) < 1e-6, `eski süreden kalan ölçüm: ${x}`);
});

test('flaş: maskeleme — 1 karelik aralıkla cümleler arasında boş kare', () => {
  const seq = [];
  const h = makeEngine({ onFrame: (_, d) => seq.push(d.length) });
  h.engine.setSentences(sentences(4));
  h.engine.configure({ mode: 'flash', exposureMs: 1, gapMs: FRAME, fontSize: 10 });
  h.engine.start();
  h.frames(40);
  const pattern = seq.slice(4).map((n) => (n ? 'x' : '_')).join('');
  assert.match(pattern, /^(?:x_)+x?$|^(?:_x)+_?$/);
});

test('flaş: rastgele konum — yazı her zaman ekranın içinde, konum değişir', () => {
  const W = 1280;
  const H = 720;
  const spots = new Set();
  const h = makeEngine({
    W,
    H,
    onFrame: (e, d) => {
      for (const x of d) {
        const half = (Array.from(x.t).length * e._ensureLayout().size * 0.5) / 2;
        assert.ok(x.x - half >= -1e-6 && x.x + half <= W + 1e-6, `x=${x.x}`);
        assert.ok(x.y >= 0 && x.y + e._ensureLayout().lineH <= H, `y=${x.y}`);
        spots.add(Math.round(x.x) + ',' + Math.round(x.y));
      }
    }
  });
  h.engine.setSentences(sentences(6));
  h.engine.configure({ mode: 'flash', exposureMs: 33, position: 'random', fontSize: 40 });
  h.engine.start();
  h.frames(120);
  assert.ok(spots.size > 20, `${spots.size} farklı konum`);
});

test('kontur: açıkken metin önce çevre çizgisiyle çizilir', () => {
  const h = makeEngine();
  h.engine.setSentences(['Bir']);
  h.engine.configure({ mode: 'flash', exposureMs: 33, outlineWidth: 3 });
  h.engine.start();
  h.frames(2);
  assert.ok(h.strokes.length > 0);
});

test('önizlemesiz mod (overlay): durağanken hiçbir şey çizilmez', () => {
  const h = makeEngine();
  h.engine.configure({ mode: 'flash', preview: false, bgAlpha: 0 });
  h.engine.setSentences(['Bir', 'İki']);
  assert.equal(h.draws.length, 0);
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
