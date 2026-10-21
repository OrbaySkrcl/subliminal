/*
 * Arayüz bağlantıları: ayarlar, dosya yükleme, oynat/durdur, tam ekran, ses, oturum.
 */
(function () {
  'use strict';

  var Text = window.SubText;
  var Speed = window.SubSpeed;
  var SubAudio = window.SubAudio;

  var STORE_KEY = 'esikalti:v1';
  var ACK_KEY = 'esikalti:ack';

  var SAMPLE = [
    'Kendimi olduğum gibi seviyor ve kabul ediyorum.',
    'Her gün daha sakin, daha güçlü ve daha odaklıyım.',
    'Bedenim sağlıklı, zihnim berrak.',
    'Hak ettiğim bolluğu rahatça kabul ediyorum.',
    'Kararlarıma güveniyorum.',
    'İçimdeki huzur her geçen gün büyüyor.',
    'Hedeflerime kararlılıkla ilerliyorum.',
    'Yeni fırsatlara açığım ve onları fark ediyorum.',
    'Kendimi ifade etmek bana kolay geliyor.',
    'Geçmişi bırakıyor, şimdiye odaklanıyorum.',
    'Sevgiyi vermeye ve almaya değerim.',
    'Zorluklar beni daha da güçlendiriyor.',
    'Uykum derin ve dinlendirici.',
    'Her nefeste kendime biraz daha yaklaşıyorum.'
  ].join('\n');

  var FONTS = {
    plex: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    display: '"Bricolage Grotesque", system-ui, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace'
  };

  var DEFAULTS = {
    text: SAMPLE,
    append: false,
    split: false,
    dedupe: true,
    upper: false,
    shuffle: false,
    speedMode: 'auto',
    level: 'subliminal',
    slider: 100,
    mode: 'flow',
    lanes: 3,
    direction: 'down',
    flashGap: false,
    font: 'plex',
    fontSize: 30,
    bold: false,
    color: '#f2ece3',
    bg: '#0a0910',
    opacity: 92,
    dim: 55,
    ambient: 'off',
    ambientVol: 35,
    tts: false,
    voice: '',
    ttsRate: 1.6,
    ttsVol: 50,
    session: 0,
    wake: true
  };

  var LEVEL_NOTES = {
    readable: 'Cümle uzunluğuna göre rahat okunacak kadar yavaş.',
    fast: 'Göz ucuyla seçilir. Liste uzunsa tam tur 45 sn\'yi geçmesin diye hızlanır.',
    subliminal: '50 ms altı, bilinçli okunamaz. Liste uzadıkça tam tur 3 sn\'yi geçmesin diye 1 kareye kadar hızlanır.'
  };
  var MODE_NOTES = {
    flow: 'Cümleler şeritler halinde akar. Şerit arttıkça saniyede geçen cümle sayısı artar.',
    flash: 'Cümleler ortada tek tek yanıp söner (takistoskop). En yüksek hızda her cümle tek bir ekran karesi görünür.',
    rain: 'Cümleler farklı boyut ve konumlarda düşer. Yoğunluk ekrandaki cümle sayısını belirler.'
  };
  var AMBIENT_LABELS = {
    off: 'Kapalı',
    pink: 'Pembe gürültü',
    brown: 'Kahverengi gürültü',
    alpha: 'Alfa 10 Hz',
    theta: 'Teta 6 Hz',
    delta: 'Delta 2,5 Hz',
    file: 'Kendi dosyam'
  };

  // ---------- Kalıcı ayarlar ----------
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (e) {
      /* depolama kapalı olabilir */
    }
    return Object.assign({}, DEFAULTS);
  }
  var state = load();
  var saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
      } catch (e) {
        /* depolama kapalı olabilir */
      }
    }, 300);
  }

  // ---------- Yardımcılar ----------
  function $(id) {
    return document.getElementById(id);
  }
  var nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });

  function fmtMs(ms) {
    return ms >= 1000 ? nf1.format(ms / 1000) + ' sn' : nf0.format(ms) + ' ms';
  }
  function fmtDur(sec) {
    if (sec < 1) return nf0.format(sec * 1000) + ' ms';
    if (sec < 60) return nf1.format(sec) + ' sn';
    var m = Math.floor(sec / 60);
    var s = Math.round(sec % 60);
    return m + ' dk' + (s ? ' ' + s + ' sn' : '');
  }
  function fmtClock(ms) {
    var t = Math.floor(ms / 1000);
    var h = Math.floor(t / 3600);
    var m = Math.floor((t % 3600) / 60);
    var s = t % 60;
    var mm = (m < 10 ? '0' : '') + m;
    var ss = (s < 10 ? '0' : '') + s;
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }
  function fmtRate(sps) {
    return sps >= 10 ? nf0.format(sps) : nf1.format(sps);
  }

  var toastTimer = 0;
  function toast(msg, actionLabel, action) {
    var el = $('toast');
    el.textContent = msg;
    if (actionLabel) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-action';
      b.textContent = actionLabel;
      b.addEventListener('click', function () {
        el.hidden = true;
        action();
      });
      el.appendChild(b);
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.hidden = true;
    }, actionLabel ? 6000 : 3200);
  }

  // ---------- Çekirdek nesneler ----------
  var stage = $('stage');
  var engine = new window.SubEngine($('canvas'), onStats);
  var ambient = new SubAudio.Ambient();
  var speaker = new SubAudio.Speaker();

  var sentences = [];
  var textStats = Text.stats([]);
  var session = { elapsed: 0, last: 0, timer: 0, running: false, done: false, acked: false };
  var media = { url: null, kind: null };
  var lastFrameMs = engine.getFrameMs();

  // ---------- Metin ----------
  function rebuildText() {
    var list = Text.parse(state.text, { splitSentences: state.split, dedupe: state.dedupe });
    textStats = Text.stats(list);
    sentences = state.upper ? list.map(Text.upperTr) : list;
    engine.setSentences(sentences);
    speaker.setSentences(list);
    $('sampleChip').hidden = state.text.trim() !== SAMPLE;
    $('textStats').textContent = textStats.count
      ? nf0.format(textStats.count) + ' cümle · ortalama ' + nf0.format(textStats.avgChars) +
        ' karakter · en uzun ' + nf0.format(textStats.maxChars)
      : 'Henüz cümle yok';
    updateIdle();
    applySpeed();
  }

  var textTimer = 0;
  function setText(value) {
    state.text = value;
    $('text').value = value;
    save();
    rebuildText();
  }

  function encLabel(enc) {
    return enc === 'windows-1254' ? 'Türkçe Windows' : enc.toUpperCase();
  }

  function isTextFile(f) {
    return /\.txt$/i.test(f.name) || /^text\//.test(f.type);
  }

  function readTextFiles(files) {
    var list = Array.prototype.filter.call(files, isTextFile);
    if (!list.length) {
      toast('Yalnızca .txt dosyaları yüklenebilir.');
      return;
    }
    Promise.all(
      list.map(function (f) {
        return f.arrayBuffer().then(function (buf) {
          return { name: f.name, res: Text.decode(buf) };
        });
      })
    )
      .then(function (results) {
        var joined = results
          .map(function (r) {
            return r.res.text;
          })
          .join('\n');
        var count = Text.parse(joined, { splitSentences: state.split }).length;
        var base = state.append && state.text.trim() ? state.text.replace(/\s*$/, '\n') : '';
        setText(base + joined);
        $('fileStatus').textContent =
          results
            .map(function (r) {
              return r.name + ' (' + encLabel(r.res.encoding) + ')';
            })
            .join(', ') +
          (state.append ? ' eklendi' : ' yüklendi') +
          ' · ' +
          nf0.format(count) +
          ' cümle';
      })
      .catch(function () {
        toast('Dosya okunamadı. Düz metin (.txt) olduğundan emin ol.');
      });
  }

  function exportText() {
    var blob = new Blob([state.text], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'affirmasyonlar.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 1500);
  }

  // Bir çerçeve içinde (ör. paylaşılan sayfa) indirmeler engellenebilir: orada panoya kopyala.
  var embedded = (function () {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  })();

  function copyText() {
    var done = function () {
      toast('Metin panoya kopyalandı.');
    };
    var fallback = function () {
      $('text').select();
      toast('Metin seçildi; Ctrl+C ile kopyala.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(state.text).then(done, fallback);
    else fallback();
  }

  // ---------- Hız ----------
  var currentMs = 1000;
  function applySpeed() {
    var frame = engine.getFrameMs();
    var g = engine.geometry();
    var auto = state.speedMode === 'auto';
    var ms = auto
      ? Speed.autoExposure({
          avgChars: textStats.avgChars,
          count: textStats.count,
          slots: g.slots,
          level: state.level,
          frameMs: frame
        })
      : Speed.sliderToExposure(state.slider, frame);
    currentMs = ms;
    engine.configure({ exposureMs: ms, weighted: auto });
    if (auto) $('speed').value = Speed.exposureToSlider(ms, frame).toFixed(1);

    var hz = 1000 / frame;
    var sps = Speed.throughput(ms, g.slots);
    if (state.mode === 'flash') sps = Math.min(sps, hz * g.slots);
    var cls = Speed.classify(ms);
    $('roExposure').textContent = fmtMs(ms);
    $('roFrames').textContent = Speed.frames(ms, frame) + ' kare · ' + nf0.format(hz) + ' Hz';
    $('roRate').textContent = fmtRate(sps) + ' cümle/sn';
    $('roCycle').textContent = textStats.count ? fmtDur(textStats.count / sps) : '–';
    var pill = $('levelPill');
    pill.textContent = cls.label;
    pill.dataset.level = cls.key;
    $('hudExposure').textContent = fmtMs(ms);
    var fit = engine.fontFit();
    $('fontSizeOut').textContent =
      fit < 0.995 ? state.fontSize + ' → ' + Math.round(state.fontSize * fit) + ' px' : state.fontSize + ' px';
    $('fontSizeOut').title = fit < 0.995 ? 'Kelimeler bölünmesin diye şerit genişliğine göre küçültüldü' : '';
    if (!engine.running) $('hudRate').textContent = fmtRate(sps);

    $('autoBox').hidden = !auto;
    if (auto) {
      var atFloor = ms <= frame * 1.01;
      $('autoExplain').textContent = textStats.count
        ? nf0.format(textStats.count) + ' cümle × ortalama ' + nf0.format(textStats.avgChars) +
          ' karakter → cümle başı ' + fmtMs(ms) + '. ' +
          (atFloor ? 'Şu an en yüksek hızda: her cümle 1 kare. ' : '') +
          LEVEL_NOTES[state.level]
        : LEVEL_NOTES[state.level];
    }
  }

  function nudgeSpeed(delta) {
    if (state.speedMode !== 'manual') {
      state.slider = Number($('speed').value);
      setRadio('speedMode', 'manual');
      state.speedMode = 'manual';
    }
    state.slider = Speed.clamp(state.slider + delta, 0, 100);
    $('speed').value = state.slider;
    save();
    applySpeed();
    showUi();
  }

  // ---------- Görünüm ----------
  function engineConfig() {
    return {
      mode: state.mode,
      lanes: state.lanes,
      direction: state.direction,
      flashGap: state.flashGap,
      fontFamily: FONTS[state.font] || FONTS.plex,
      fontSize: state.fontSize,
      fontWeight: state.bold ? 700 : 500,
      color: state.color,
      opacity: state.opacity / 100,
      bgColor: state.bg,
      bgAlpha: media.kind ? state.dim / 100 : 1,
      shuffle: state.shuffle
    };
  }

  function canvasFont() {
    var c = engineConfig();
    return c.fontWeight + ' ' + c.fontSize + 'px ' + c.fontFamily;
  }

  function applyLook() {
    engine.configure(engineConfig());
    stage.style.backgroundColor = state.bg;
    var m = state.mode;
    $('fLanes').hidden = m === 'flash';
    $('fDirection').hidden = m === 'flash';
    $('fFlashGap').hidden = m !== 'flash';
    $('lanesLabel').textContent = m === 'rain' ? 'Yoğunluk' : 'Şerit sayısı';
    $('modeExplain').textContent = MODE_NOTES[m];
    applySpeed();
    // Canvas, DOM'da kullanılmayan web fontlarını kendisi yüklemez.
    if (document.fonts && document.fonts.load) {
      var font = canvasFont();
      if (!document.fonts.check(font, 'ÇĞİÖŞÜçğıöşü')) {
        document.fonts.load(font, 'ÇĞİÖŞÜçğıöşü').then(function () {
          engine.invalidateLayout();
          applySpeed();
        }, function () {});
      }
    }
  }

  function setMedia(file) {
    clearMedia(false);
    media.url = URL.createObjectURL(file);
    if (/^video\//.test(file.type)) {
      media.kind = 'video';
      var v = $('bgVideo');
      v.src = media.url;
      v.hidden = false;
      v.play().catch(function () {});
    } else {
      media.kind = 'image';
      $('bgImage').src = media.url;
      $('bgImage').hidden = false;
    }
    $('mediaName').textContent = file.name;
    $('btnMediaClear').hidden = false;
    $('fDim').hidden = false;
    applyLook();
  }

  function clearMedia(apply) {
    if (media.url) URL.revokeObjectURL(media.url);
    media.url = null;
    media.kind = null;
    var img = $('bgImage');
    var v = $('bgVideo');
    img.hidden = true;
    img.removeAttribute('src');
    v.pause();
    v.hidden = true;
    v.removeAttribute('src');
    v.load();
    $('mediaName').textContent = 'Yok';
    $('btnMediaClear').hidden = true;
    $('fDim').hidden = true;
    if (apply !== false) applyLook();
  }

  // ---------- Oynatma ----------
  var wakeLock = null;
  function requestWake() {
    if (!state.wake || wakeLock || !navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then(
      function (lock) {
        wakeLock = lock;
        lock.addEventListener('release', function () {
          wakeLock = null;
        });
      },
      function () {}
    );
  }
  function releaseWake() {
    if (wakeLock) wakeLock.release().catch(function () {});
    wakeLock = null;
  }

  function acknowledged() {
    try {
      return localStorage.getItem(ACK_KEY) === '1' || session.acked;
    } catch (e) {
      return !!session.acked;
    }
  }

  function updateIdle() {
    var label = !sentences.length ? 'Önce cümle ekle' : session.elapsed > 0 && !session.done ? 'Devam et' : 'Başlat';
    $('idleLabel').textContent = label;
    $('btnPlay').setAttribute('aria-label', engine.running ? 'Durdur' : label);
  }

  function play() {
    if (engine.running) return;
    if (!sentences.length) {
      toast('Önce en az bir cümle yaz ya da dosya yükle.');
      $('text').focus();
      return;
    }
    if (!acknowledged()) {
      openModal();
      return;
    }
    if (session.done) {
      session.done = false;
      session.elapsed = 0;
      engine.resetCounters();
    }
    if (!engine.start()) return;
    stage.classList.add('running');
    session.running = true;
    session.last = performance.now();
    session.timer = setInterval(tickSession, 250);
    ambient.start();
    speaker.enabled = state.tts;
    speaker.start();
    requestWake();
    updateIdle();
    showUi();
  }

  function pause() {
    if (!engine.running) return;
    accumulate();
    session.running = false;
    clearInterval(session.timer);
    engine.stop();
    renderClock();
    stage.classList.remove('running');
    ambient.stop();
    speaker.stop();
    releaseWake();
    updateIdle();
    showUi();
  }

  function toggle() {
    if (engine.running) pause();
    else play();
  }

  function accumulate() {
    var now = performance.now();
    if (session.running && !document.hidden) session.elapsed += now - session.last;
    session.last = now;
  }

  function renderClock() {
    var limit = state.session * 60000;
    $('hudTime').textContent = fmtClock(limit ? Math.max(0, limit - session.elapsed) : session.elapsed);
    $('hudTimeLabel').textContent = limit ? 'kalan' : 'süre';
  }

  function tickSession() {
    accumulate();
    renderClock();
    var limit = state.session * 60000;
    if (limit && session.running && session.elapsed >= limit) {
      session.done = true;
      pause();
      toast('Oturum tamamlandı · ' + nf0.format(engine.shown) + ' gösterim');
    }
  }

  function onStats(st) {
    $('hudShown').textContent = nf0.format(st.shown);
    if (st.running) $('hudRate').textContent = fmtRate(st.sps);
    if (Math.abs(st.frameMs - lastFrameMs) > 0.3) {
      lastFrameMs = st.frameMs;
      applySpeed();
    }
  }

  // ---------- Tam ekran ve sahne arayüzü ----------
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement) || stage.classList.contains('pseudo-fs');
  }
  function enterFullscreen() {
    var req = stage.requestFullscreen || stage.webkitRequestFullscreen;
    var fallback = function () {
      stage.classList.add('pseudo-fs');
    };
    if (!req) return fallback();
    try {
      var p = req.call(stage);
      if (p && p.catch) p.catch(fallback);
    } catch (e) {
      fallback();
    }
  }
  function exitFullscreen() {
    if (stage.classList.contains('pseudo-fs')) stage.classList.remove('pseudo-fs');
    else if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen().catch(function () {});
    else if (document.webkitExitFullscreen && document.webkitFullscreenElement) document.webkitExitFullscreen();
  }
  function toggleFullscreen() {
    if (isFullscreen()) exitFullscreen();
    else enterFullscreen();
  }

  var hideTimer = 0;
  function showUi() {
    stage.classList.remove('ui-hidden');
    clearTimeout(hideTimer);
    if (engine.running) {
      hideTimer = setTimeout(function () {
        stage.classList.add('ui-hidden');
      }, 2200);
    }
  }

  // ---------- Uyarı penceresi ----------
  var modalReturn = null;
  function openModal() {
    modalReturn = document.activeElement;
    $('modal').hidden = false;
    $('modalOk').focus();
  }
  function closeModal() {
    $('modal').hidden = true;
    if (modalReturn && modalReturn.focus) modalReturn.focus();
  }

  // ---------- Form bağlama ----------
  function setRadio(name, value) {
    var el = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (el) el.checked = true;
  }
  function bindRadio(name, key, after) {
    setRadio(name, state[key]);
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (el) {
      el.addEventListener('change', function () {
        if (!el.checked) return;
        state[key] = el.value;
        save();
        after();
      });
    });
  }
  function bindCheck(id, key, after) {
    var el = $(id);
    el.checked = !!state[key];
    el.addEventListener('change', function () {
      state[key] = el.checked;
      save();
      if (after) after();
    });
  }
  function bindRange(id, key, format, after, eventName) {
    var el = $(id);
    var out = $(id + 'Out');
    el.value = state[key];
    function show() {
      if (out) out.textContent = format(state[key]);
    }
    show();
    el.addEventListener(eventName || 'input', function () {
      state[key] = Number(el.value);
      show();
      save();
      if (after) after();
    });
    if (eventName === 'change' && out) {
      el.addEventListener('input', function () {
        out.textContent = format(Number(el.value));
      });
    }
  }
  function bindValue(id, key, after) {
    var el = $(id);
    el.value = String(state[key]);
    el.addEventListener('change', function () {
      state[key] = typeof DEFAULTS[key] === 'number' ? Number(el.value) : el.value;
      save();
      if (after) after();
    });
  }

  function pct(v) {
    return nf0.format(v) + '%';
  }

  function updateAudioUI() {
    var k = state.ambient;
    $('fAudioFile').hidden = k !== 'file';
    $('ambientNote').textContent = SubAudio.BEATS[k]
      ? 'Binaural vuruş iki kulağa farklı frekans verir; kulaklıkla dinle.'
      : k === 'file'
        ? 'Seçtiğin dosya akış boyunca döngüde çalar.'
        : '';
    $('ttsBox').hidden = !state.tts;
    $('audioSummary').textContent = AMBIENT_LABELS[k] + (state.tts ? ' + sesli okuma' : '');
  }

  function fillVoices() {
    var sel = $('voice');
    var voices = speaker.voices();
    sel.innerHTML = '';
    var def = document.createElement('option');
    def.value = '';
    def.textContent = voices.some(function (v) {
      return /^tr/i.test(v.lang);
    })
      ? 'Varsayılan Türkçe ses'
      : 'Varsayılan';
    sel.appendChild(def);
    voices.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = v.name + ' (' + v.lang + ')';
      sel.appendChild(o);
    });
    sel.value = state.voice;
    if (sel.value !== state.voice) sel.value = '';
  }

  function bindAll() {
    // Metin
    var ta = $('text');
    ta.value = state.text;
    ta.addEventListener('input', function () {
      state.text = ta.value;
      save();
      clearTimeout(textTimer);
      textTimer = setTimeout(rebuildText, 180);
    });
    $('fileInput').addEventListener('change', function (e) {
      if (e.target.files.length) readTextFiles(e.target.files);
      e.target.value = '';
    });
    $('btnSample').addEventListener('click', function () {
      setText(SAMPLE);
      $('fileStatus').textContent = '';
    });
    $('btnClear').addEventListener('click', function () {
      var prev = state.text;
      if (!prev.trim()) return;
      setText('');
      $('fileStatus').textContent = '';
      toast('Metin temizlendi.', 'Geri al', function () {
        setText(prev);
      });
      ta.focus();
    });
    if (embedded) $('btnExport').textContent = 'Kopyala';
    $('btnExport').addEventListener('click', embedded ? copyText : exportText);
    bindCheck('optAppend', 'append');
    bindCheck('optSplit', 'split', rebuildText);
    bindCheck('optDedupe', 'dedupe', rebuildText);
    bindCheck('optUpper', 'upper', rebuildText);
    bindCheck('optShuffle', 'shuffle', applyLook);

    // Hız
    bindRadio('speedMode', 'speedMode', function () {
      if (state.speedMode === 'manual') state.slider = Number($('speed').value);
      applySpeed();
    });
    bindRadio('level', 'level', applySpeed);
    var sp = $('speed');
    sp.value = state.slider;
    sp.addEventListener('input', function () {
      state.slider = Number(sp.value);
      if (state.speedMode !== 'manual') {
        state.speedMode = 'manual';
        setRadio('speedMode', 'manual');
      }
      save();
      applySpeed();
    });

    // Görünüm
    bindRadio('mode', 'mode', applyLook);
    bindRange('lanes', 'lanes', String, applyLook);
    bindValue('direction', 'direction', applyLook);
    bindCheck('flashGap', 'flashGap', applyLook);
    bindValue('font', 'font', applyLook);
    bindRange('fontSize', 'fontSize', function (v) {
      return v + ' px';
    }, applyLook);
    bindCheck('bold', 'bold', applyLook);
    ['color', 'bg'].forEach(function (key) {
      var el = $(key);
      el.value = state[key];
      el.addEventListener('input', function () {
        state[key] = el.value;
        save();
        applyLook();
      });
    });
    bindRange('opacity', 'opacity', pct, applyLook);
    bindRange('dim', 'dim', pct, applyLook);
    $('mediaInput').addEventListener('change', function (e) {
      if (e.target.files[0]) setMedia(e.target.files[0]);
      e.target.value = '';
    });
    $('btnMediaClear').addEventListener('click', function () {
      clearMedia();
    });

    // Ses
    ambient.setKind(state.ambient);
    ambient.setVolume(state.ambientVol / 100);
    bindValue('ambient', 'ambient', function () {
      ambient.setKind(state.ambient);
      updateAudioUI();
    });
    bindRange('ambientVol', 'ambientVol', pct, function () {
      ambient.setVolume(state.ambientVol / 100);
    });
    $('audioInput').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      ambient.setFile(f);
      $('audioName').textContent = f.name;
    });
    speaker.rate = state.ttsRate;
    speaker.volume = state.ttsVol / 100;
    speaker.voiceURI = state.voice;
    if (!speaker.supported()) {
      $('tts').disabled = true;
      state.tts = false;
      $('ttsNote').textContent = 'Bu tarayıcı sesli okumayı desteklemiyor.';
    }
    bindCheck('tts', 'tts', function () {
      speaker.enabled = state.tts;
      if (engine.running) {
        if (state.tts) speaker.start();
        else speaker.stop();
      }
      updateAudioUI();
    });
    bindRange('ttsRate', 'ttsRate', function (v) {
      return nf1.format(v) + '×';
    }, function () {
      speaker.rate = state.ttsRate;
      speaker.restart();
    }, 'change');
    bindRange('ttsVol', 'ttsVol', pct, function () {
      speaker.volume = state.ttsVol / 100;
      speaker.restart();
    }, 'change');
    fillVoices();
    if (speaker.supported() && 'onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', fillVoices);
    }
    $('voice').addEventListener('change', function () {
      state.voice = $('voice').value;
      speaker.voiceURI = state.voice;
      save();
      speaker.restart();
    });

    // Oturum
    bindValue('session', 'session', function () {
      updateSessionSummary();
      renderClock();
    });
    bindCheck('wake', 'wake', function () {
      if (!state.wake) releaseWake();
      else if (engine.running) requestWake();
    });
    $('btnResetCounters').addEventListener('click', function () {
      engine.resetCounters();
      session.elapsed = 0;
      session.done = false;
      session.last = performance.now();
      $('hudShown').textContent = '0';
      renderClock();
      updateIdle();
    });

    // Sahne
    stage.addEventListener('click', function (e) {
      if (e.target.closest('.hud')) return;
      toggle();
    });
    stage.addEventListener('pointermove', showUi);
    $('btnPlay').addEventListener('click', toggle);
    $('btnFullscreen').addEventListener('click', toggleFullscreen);

    // Pencere
    $('modalOk').addEventListener('click', function () {
      session.acked = true;
      try {
        localStorage.setItem(ACK_KEY, '1');
      } catch (e) {
        /* depolama kapalı olabilir */
      }
      closeModal();
      play();
    });
    $('modalCancel').addEventListener('click', closeModal);
    $('modal').addEventListener('click', function (e) {
      if (e.target === $('modal')) closeModal();
    });

    // Klavye
    document.addEventListener('keydown', function (e) {
      if (!$('modal').hidden) {
        if (e.key === 'Escape') closeModal();
        return;
      }
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'textarea' || tag === 'select' || (tag === 'input' && !/^(range|checkbox|radio|button|color|file)$/.test(e.target.type));
      // Odaklı düğme, kutucuk, kaydırıcı: Boşluk ve oklar onların kendi işini yapsın.
      var interactive = typing || /^(input|button|summary|a|label)$/.test(tag);
      if (e.key === 'Escape') {
        if (stage.classList.contains('pseudo-fs')) exitFullscreen();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (interactive && (e.key === ' ' || /^Arrow/.test(e.key))) return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        nudgeSpeed(2);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        nudgeSpeed(-2);
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        state.mode = ['flow', 'flash', 'rain'][Number(e.key) - 1];
        setRadio('mode', state.mode);
        save();
        applyLook();
      }
    });

    // Sürükle-bırak: .txt → metin, resim/video → arka plan
    var dragDepth = 0;
    function hasFiles(e) {
      return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0;
    }
    window.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth++;
      document.body.classList.add('dragging');
    });
    window.addEventListener('dragleave', function (e) {
      if (!hasFiles(e)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) document.body.classList.remove('dragging');
    });
    window.addEventListener('dragover', function (e) {
      if (hasFiles(e)) e.preventDefault();
    });
    window.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      document.body.classList.remove('dragging');
      var files = Array.prototype.slice.call(e.dataTransfer.files);
      var visual = files.filter(function (f) {
        return /^(image|video)\//.test(f.type);
      })[0];
      if (visual) setMedia(visual);
      var texts = files.filter(isTextFile);
      if (texts.length) readTextFiles(texts);
      else if (!visual) toast('Yalnızca .txt, resim ya da video dosyası bırakabilirsin.');
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && engine.running) requestWake();
    });
    document.addEventListener('fullscreenchange', showUi);
  }

  function updateSessionSummary() {
    $('sessionSummary').textContent = state.session ? state.session + ' dakika' : 'Sınırsız';
  }

  // ---------- Başlangıç ----------
  bindAll();
  updateAudioUI();
  updateSessionSummary();

  var resizeQueued = false;
  function onResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(function () {
      resizeQueued = false;
      engine.resize();
      applySpeed();
    });
  }
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage);
  else window.addEventListener('resize', onResize);

  engine.resize();
  applyLook();
  rebuildText();
  renderClock();
  engine.calibrate(function () {
    lastFrameMs = engine.getFrameMs();
    applySpeed();
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      engine.invalidateLayout();
      applySpeed();
    });
  }

  // Test ve hata ayıklama için
  window.esikalti = {
    engine: engine,
    state: state,
    play: play,
    pause: pause,
    currentExposure: function () {
      return currentMs;
    }
  };
})();
