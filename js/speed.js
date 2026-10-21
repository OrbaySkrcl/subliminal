/*
 * Hız hesapları. Tüm hızlar "görünme süresi" (ms) cinsindendir:
 * bir cümlenin ekranda kaldığı süre. En kısa süre 1 ekran karesidir.
 * Tarayıcıda window.SubSpeed, Node'da require('./speed.js').
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SubSpeed = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FRAME_60 = 1000 / 60;
  var MAX_MS = 8000; // slider'ın en yavaş ucu

  // Otomatik hız seviyeleri. msPerChar: karakter başına süre,
  // maxCycleSec: tüm listenin bir kez gösterilmesi için izin verilen en uzun süre.
  var LEVELS = {
    readable: { label: 'Okunabilir', msPerChar: 70, minMs: 1800, maxMs: 8000, maxCycleSec: Infinity },
    fast: { label: 'Hızlı', msPerChar: 9, minMs: 160, maxMs: 1200, maxCycleSec: 45 },
    subliminal: { label: 'Bilinçaltı', msPerChar: 0.6, minMs: 0, maxMs: 50, maxCycleSec: 3 }
  };

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /** Slider konumu (0–100) → görünme süresi. Logaritmik: 0 = 8 sn, 100 = 1 kare. */
  function sliderToExposure(pos, frameMs) {
    var f = frameMs || FRAME_60;
    var p = clamp(Number(pos) || 0, 0, 100) / 100;
    return MAX_MS * Math.pow(f / MAX_MS, p);
  }

  function exposureToSlider(ms, frameMs) {
    var f = frameMs || FRAME_60;
    var m = clamp(ms, f, MAX_MS);
    return (100 * Math.log(m / MAX_MS)) / Math.log(f / MAX_MS);
  }

  /** Saniyede gösterilen cümle sayısı. slots: ekranda aynı anda kaç cümle aktığı. */
  function throughput(exposureMs, slots) {
    return ((slots || 1) * 1000) / Math.max(exposureMs, 0.001);
  }

  function cycleSeconds(count, exposureMs, slots) {
    return count / throughput(exposureMs, slots);
  }

  /**
   * Metne göre otomatik görünme süresi.
   * 1) Ortalama cümle uzunluğu × seviye katsayısı (uzun cümle → biraz daha uzun süre)
   * 2) Liste uzunsa, tam döngü seviyenin sınırını aşmasın diye hızlandırır
   * 3) Hiçbir zaman 1 karenin altına inmez
   * @param {{avgChars:number, count:number, slots?:number, level?:string, frameMs?:number}} p
   */
  function autoExposure(p) {
    var L = LEVELS[p.level] || LEVELS.subliminal;
    var frame = p.frameMs || FRAME_60;
    var ms = clamp((p.avgChars || 0) * L.msPerChar, Math.max(L.minMs, frame), Math.max(L.maxMs, frame));
    var slots = p.slots || 1;
    if (isFinite(L.maxCycleSec) && p.count > 0 && cycleSeconds(p.count, ms, slots) > L.maxCycleSec) {
      ms = (L.maxCycleSec * 1000 * slots) / p.count;
    }
    return Math.max(ms, frame);
  }

  /** Flaş modunda cümle bazlı süre çarpanı: uzun cümleye daha fazla, kısaya daha az. */
  function lengthWeight(chars, avgChars) {
    if (!avgChars) return 1;
    return clamp(chars / avgChars, 0.5, 2);
  }

  function frames(ms, frameMs) {
    return Math.max(1, Math.round(ms / (frameMs || FRAME_60)));
  }

  function classify(ms) {
    if (ms < 60) return { key: 'subliminal', label: 'Bilinçaltı · okunamaz' };
    if (ms < 400) return { key: 'threshold', label: 'Eşikte · zor seçilir' };
    if (ms < 1800) return { key: 'fast', label: 'Hızlı · göz ucuyla' };
    return { key: 'readable', label: 'Okunabilir' };
  }

  return {
    FRAME_60: FRAME_60,
    MAX_MS: MAX_MS,
    LEVELS: LEVELS,
    clamp: clamp,
    sliderToExposure: sliderToExposure,
    exposureToSlider: exposureToSlider,
    throughput: throughput,
    cycleSeconds: cycleSeconds,
    autoExposure: autoExposure,
    lengthWeight: lengthWeight,
    frames: frames,
    classify: classify
  };
});
