/*
 * "Ekran üstü" bölümü: masaüstü uygulamasında (Electron) diğer programların üstünde flaş.
 * Tarayıcıda yalnızca masaüstü uygulamasına yönlendiren açıklama görünür.
 * Köprü: desktop/preload.js → window.esikaltiDesktop
 */
(function () {
  'use strict';

  var app = window.esikalti;
  var bridge = window.esikaltiDesktop;
  var Speed = window.SubSpeed;
  if (!app) return;

  function $(id) {
    return document.getElementById(id);
  }

  if (!bridge) return; // tarayıcı: açıklama ve indirme bağlantısı yeterli

  var state = app.state;
  var o = state.overlay;
  var fmtMs = app.fmtMs;
  var nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
  var status = { running: false };

  $('overlayWeb').hidden = true;
  $('overlayDesk').hidden = false;
  $('overlayPill').textContent = 'Masaüstü';

  // ---------- Overlay'e gönderilen ayarlar ----------
  function payload() {
    return {
      sentences: app.getSentences(),
      settings: {
        mode: o.mode,
        exposureMs: o.exposureMs,
        gapMs: o.mode === 'flash' ? o.gapMs : 0,
        burst: o.burst,
        jitter: o.jitter / 100,
        position: o.position,
        lanes: o.lanes,
        direction: state.direction,
        fontFamily: app.fonts[state.font] || app.fonts.plex,
        fontSize: o.fontSize,
        fontWeight: state.bold ? 700 : 500,
        color: o.color,
        opacity: o.opacity / 100,
        outlineWidth: o.outline,
        outlineColor: o.outlineColor,
        shuffle: state.shuffle
      },
      overlay: {
        display: o.display,
        hideCapture: o.hideCapture,
        sessionMin: o.sessionMin,
        autoStart: o.autoStart
      }
    };
  }

  var pushTimer = 0;
  function push(now) {
    clearTimeout(pushTimer);
    var send = function () {
      return bridge.setConfig(payload());
    };
    if (now) return send();
    pushTimer = setTimeout(send, 150);
    return Promise.resolve();
  }

  function changed() {
    app.save();
    render();
    push();
  }

  // ---------- Görünüm ----------
  function frameMs() {
    return status.running && status.frameMs ? status.frameMs : app.engine.getFrameMs();
  }

  function render() {
    var flash = o.mode === 'flash';
    var f = frameMs();
    var hz = nf0.format(1000 / f);
    $('ovFlashFields').hidden = !flash;
    $('ovPositionField').hidden = !flash;
    $('ovRhythm').hidden = !flash;
    $('ovLanesField').hidden = flash;
    $('ovLanesLabel').textContent = o.mode === 'rain' ? 'Yoğunluk' : 'Şerit sayısı';
    $('ovMsLabel').textContent = flash ? 'Görünme süresi' : 'Ekranı geçme süresi';
    if (flash) {
      var snap = Speed.snap(o.exposureMs, f);
      $('ovSnapNote').textContent =
        Math.abs(snap.ms - o.exposureMs) > 0.05
          ? 'Ekranda ' + fmtMs(snap.ms) + ' = ' + snap.frames + ' kare (' + hz + ' Hz). ' + fmtMs(f) + '\'nin katları gösterilebilir.'
          : 'Ekranda tam ' + fmtMs(snap.ms) + ' = ' + snap.frames + ' kare (' + hz + ' Hz).';
      var gap = o.gapMs >= f / 2 ? Speed.snap(o.gapMs, f).ms : 0;
      var period = o.burst * snap.ms + gap;
      $('ovRhythm').textContent =
        (o.burst > 1 ? o.burst + ' cümlelik seri' : 'Bir cümle') + ' ' + fmtMs(o.burst * snap.ms) +
        ' görünür, ' + (gap ? fmtMs(gap) + (o.jitter ? ' (±%' + o.jitter + ')' : '') + ' boşluk' : 'boşluk yok') +
        ' → dakikada yaklaşık ' + nf0.format((60000 / period) * o.burst) + ' cümle.';
    } else {
      $('ovSnapNote').textContent = 'Bir cümlenin ekranı boydan boya geçme süresi. Yarı saydam görünürlük önerilir.';
    }
    $('ovLanesOut').textContent = o.lanes;
    $('ovSizeOut').textContent = o.fontSize + ' px';
    $('ovOpacityOut').textContent = '%' + o.opacity;
    $('ovOutlineOut').textContent = o.outline ? o.outline + ' px' : 'Yok';
    renderStatus();
  }

  function renderStatus() {
    var btn = $('ovToggle');
    btn.textContent = status.running ? 'Ekran üstünü durdur' : 'Ekran üstünde başlat';
    btn.classList.toggle('is-on', !!status.running);
    var hotkey = status.hotkey || 'Ctrl+Alt+S';
    var parts = [];
    if (status.running) {
      parts.push('Çalışıyor · ' + status.displays + ' ekran' + (status.frameMs ? ' · ' + nf0.format(1000 / status.frameMs) + ' Hz' : ''));
      if (status.remainingMs != null) parts.push('kalan ' + Math.ceil(status.remainingMs / 60000) + ' dk');
    } else if (status.reason === 'timer') {
      parts.push('Oturum süresi doldu, durdu.');
    } else if (status.error) {
      parts.push(status.error);
    }
    parts.push(status.hotkeyOk === false ? 'Kısayol ' + hotkey + ' başka bir program tarafından kullanılıyor.' : 'Her yerden aç/kapat: ' + hotkey);
    $('ovStatus').textContent = parts.join(' · ');
    var showRead = status.running && o.mode === 'flash' && status.count > 0;
    $('ovReadout').hidden = !showRead;
    if (showRead) {
      $('ovMeasured').textContent =
        fmtMs(status.avgMs) + ' · ' + status.minMs.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + '–' +
        status.maxMs.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
      $('ovExpected').textContent = fmtMs(status.expectedMs) + ' · ' + Speed.snap(status.expectedMs, status.frameMs).frames + ' kare';
      $('ovCount').textContent = nf0.format(status.count) + ' · ' + nf0.format(status.late);
    }
  }

  // ---------- Form bağlama ----------
  function num(id, key, min, max) {
    var el = $(id);
    el.value = o[key];
    function read() {
      var v = parseFloat(String(el.value).replace(',', '.'));
      return isNaN(v) ? null : v;
    }
    el.addEventListener('input', function () {
      var v = read();
      if (v === null || v < min || v > max) return;
      o[key] = v;
      changed();
    });
    el.addEventListener('change', function () {
      var v = read();
      o[key] = Speed.clamp(v === null ? o[key] : v, min, max);
      el.value = o[key];
      changed();
    });
  }
  function range(id, key) {
    var el = $(id);
    el.value = o[key];
    el.addEventListener('input', function () {
      o[key] = Number(el.value);
      changed();
    });
  }
  function value(id, key) {
    var el = $(id);
    el.value = o[key];
    el.addEventListener('input', function () {
      o[key] = el.value;
      changed();
    });
  }
  function check(id, key) {
    var el = $(id);
    el.checked = !!o[key];
    el.addEventListener('change', function () {
      o[key] = el.checked;
      changed();
    });
  }

  document.querySelectorAll('input[name="ovMode"]').forEach(function (el) {
    el.checked = el.value === o.mode;
    el.addEventListener('change', function () {
      if (!el.checked) return;
      o.mode = el.value;
      changed();
    });
  });
  num('ovMs', 'exposureMs', 1, 8000);
  num('ovGap', 'gapMs', 0, 3600000);
  num('ovBurst', 'burst', 1, 20);
  num('ovJitter', 'jitter', 0, 100);
  num('ovSession', 'sessionMin', 0, 1440);
  value('ovPosition', 'position');
  range('ovLanes', 'lanes');
  range('ovSize', 'fontSize');
  range('ovOpacity', 'opacity');
  range('ovOutline', 'outline');
  value('ovColor', 'color');
  value('ovOutlineColor', 'outlineColor');
  check('ovHideCapture', 'hideCapture');
  check('ovAutoStart', 'autoStart');

  var displaySel = $('ovDisplay');
  function loadDisplays() {
    return bridge.displays().then(function (list) {
      displaySel.innerHTML = '';
      var all = document.createElement('option');
      all.value = 'all';
      all.textContent = list.length > 1 ? 'Tüm ekranlar (' + list.length + ')' : 'Tüm ekranlar';
      displaySel.appendChild(all);
      list.forEach(function (d) {
        var opt = document.createElement('option');
        opt.value = String(d.id);
        opt.textContent = d.label;
        displaySel.appendChild(opt);
      });
      displaySel.value = o.display;
      if (displaySel.value !== String(o.display)) displaySel.value = 'all';
    });
  }
  displaySel.addEventListener('focus', loadDisplays);
  displaySel.addEventListener('change', function () {
    o.display = displaySel.value;
    changed();
  });

  var login = $('ovLogin');
  if (bridge.platform === 'linux') login.closest('label').hidden = true;
  bridge.getLogin().then(function (on) {
    login.checked = !!on;
  });
  login.addEventListener('change', function () {
    bridge.setLogin(login.checked);
  });

  $('ovToggle').addEventListener('click', function () {
    if (status.running) {
      bridge.stop();
      return;
    }
    if (!app.getSentences().length) {
      app.toast('Önce en az bir cümle yaz ya da dosya yükle.');
      return;
    }
    app.requireAck(function () {
      push(true).then(function () {
        return bridge.start();
      });
    });
  });

  bridge.onStatus(function (st) {
    var hzChanged = st.frameMs && Math.abs((status.frameMs || 0) - st.frameMs) > 0.3;
    status = st;
    if (hzChanged) render();
    else renderStatus();
  });

  // Metin ya da yazı tipi değişince overlay de güncellensin
  app.onChange(function () {
    push();
  });

  loadDisplays();
  render();
  push(true);
})();
