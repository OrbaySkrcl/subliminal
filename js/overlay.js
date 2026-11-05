/*
 * Ekran üstü (overlay) penceresi: şeffaf tuval, aynı motor, önizleme yok.
 * Ayarlar ana süreçten gelir (overlay-preload.js), ölçümler geri gönderilir.
 */
(function () {
  'use strict';

  var bridge = window.overlayBridge || null;
  var engine = new window.SubEngine(document.getElementById('canvas'), function (st) {
    if (!bridge) return;
    var f = st.flash || {};
    bridge.sendStats({
      frameMs: st.frameMs,
      shown: st.shown,
      count: f.count || 0,
      late: f.late || 0,
      avgMs: f.avgMs || 0,
      minMs: f.minMs || 0,
      maxMs: f.maxMs || 0,
      expectedMs: f.expectedMs || 0
    });
  });
  engine.configure({ preview: false, bgAlpha: 0 });

  var calibrated = false;
  var pending = null;
  var lastText = '';
  var lastFont = '';

  function apply(p) {
    if (!calibrated) {
      pending = p;
      return;
    }
    var s = Object.assign({}, p.settings, { preview: false, bgAlpha: 0 });
    engine.configure(s);
    var text = p.sentences.join('\n');
    if (text !== lastText) {
      lastText = text;
      engine.setSentences(p.sentences);
    }
    // Canvas web fontunu kendisi yüklemez; yüklenince ölçüleri yenile
    var font = s.fontWeight + ' ' + s.fontSize + 'px ' + s.fontFamily;
    if (font !== lastFont && document.fonts && document.fonts.load) {
      lastFont = font;
      document.fonts.load(font, 'ÇĞİÖŞÜçğıöşü').then(function (faces) {
        if (faces && faces.length) engine.invalidateLayout();
      }, function () {});
    }
    if (!engine.running) engine.start();
  }

  window.addEventListener('resize', function () {
    engine.resize();
  });
  engine.resize();

  // Süreler kareye oturtulduğu için başlamadan önce ekranın yenileme hızını ölç
  engine.calibrate(function () {
    calibrated = true;
    if (pending) apply(pending);
  });

  if (bridge) bridge.onConfig(apply);

  // Test ve hata ayıklama için
  window.overlayTest = { engine: engine, apply: apply };
})();
