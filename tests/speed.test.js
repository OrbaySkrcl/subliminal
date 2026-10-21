'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/speed.js');

const F60 = 1000 / 60;
const F120 = 1000 / 120;

test('slider uçları: 0 = 8 sn, 100 = tam 1 kare', () => {
  assert.equal(S.sliderToExposure(0, F60), 8000);
  assert.ok(Math.abs(S.sliderToExposure(100, F60) - F60) < 1e-9);
  assert.ok(Math.abs(S.sliderToExposure(100, F120) - F120) < 1e-9);
});

test('slider monoton: sağa kaydıkça süre kısalır', () => {
  let prev = Infinity;
  for (let p = 0; p <= 100; p += 5) {
    const ms = S.sliderToExposure(p, F60);
    assert.ok(ms < prev, `p=${p}`);
    prev = ms;
  }
});

test('slider ↔ süre dönüşümü birbirinin tersi', () => {
  for (const p of [0, 12.5, 50, 77, 100]) {
    assert.ok(Math.abs(S.exposureToSlider(S.sliderToExposure(p, F60), F60) - p) < 1e-9);
  }
});

test('otomatik: hiçbir zaman 1 karenin altına inmez', () => {
  const ms = S.autoExposure({ avgChars: 5, count: 100000, slots: 1, level: 'subliminal', frameMs: F60 });
  assert.equal(ms, F60);
});

test('otomatik bilinçaltı: 50 ms sınırını aşmaz (okunamaz kalır)', () => {
  const ms = S.autoExposure({ avgChars: 400, count: 3, slots: 1, level: 'subliminal', frameMs: F60 });
  assert.equal(ms, 50);
  assert.equal(S.classify(ms).key, 'subliminal');
});

test('otomatik: uzun cümleler daha uzun görünür', () => {
  const base = { count: 5, slots: 1, level: 'fast', frameMs: F60 };
  const short = S.autoExposure({ ...base, avgChars: 20 });
  const long = S.autoExposure({ ...base, avgChars: 80 });
  assert.ok(long > short);
});

test('otomatik: liste uzadıkça hızlanır, tam tur seviye sınırında kalır', () => {
  const base = { avgChars: 60, slots: 1, level: 'fast', frameMs: F60 };
  const few = S.autoExposure({ ...base, count: 10 });
  const many = S.autoExposure({ ...base, count: 500 });
  assert.ok(many < few);
  assert.ok(S.cycleSeconds(500, many, 1) <= S.LEVELS.fast.maxCycleSec + 1e-9);
});

test('otomatik: aynı anda daha çok yuva (şerit) varsa yavaşlamaya izin verir', () => {
  const base = { avgChars: 60, count: 500, level: 'fast', frameMs: F60 };
  assert.ok(S.autoExposure({ ...base, slots: 20 }) > S.autoExposure({ ...base, slots: 1 }));
});

test('otomatik okunabilir: bir cümleyi okumaya yetecek süre', () => {
  const ms = S.autoExposure({ avgChars: 40, count: 1000, slots: 1, level: 'readable', frameMs: F60 });
  assert.ok(ms >= 1800);
});

test('cümle uzunluğu çarpanı 0,5–2 arasında', () => {
  assert.equal(S.lengthWeight(10, 40), 0.5);
  assert.equal(S.lengthWeight(40, 40), 1);
  assert.equal(S.lengthWeight(400, 40), 2);
  assert.equal(S.lengthWeight(10, 0), 1);
});

test('kare sayısı ve sınıflandırma', () => {
  assert.equal(S.frames(F60, F60), 1);
  assert.equal(S.frames(5, F60), 1);
  assert.equal(S.frames(50, F60), 3);
  assert.equal(S.classify(17).key, 'subliminal');
  assert.equal(S.classify(200).key, 'threshold');
  assert.equal(S.classify(900).key, 'fast');
  assert.equal(S.classify(3000).key, 'readable');
});
