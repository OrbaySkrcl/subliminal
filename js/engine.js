/*
 * Canvas çizim motoru. Üç mod:
 *   flow  — şeritler halinde yukarıdan aşağı (veya aşağıdan yukarı) akan cümleler
 *   flash — tek tek yanıp sönen cümleler (takistoskop): görünme süresi, aralık, seri, konum
 *   rain  — rastgele konum/boyutta düşen cümleler
 *
 * Akan modlarda temel garanti: hız ne olursa olsun her cümle en az bir karede tamamen görünür
 * çizilir (kare başı kayma ekran yüksekliği − metin yüksekliği ile sınırlı).
 *
 * Flaş modunda zamanlama: ekran yalnızca kare sınırlarında değişebildiği için görünme süresi
 * en yakın tam kareye oturtulur (Speed.snap). Bitiş, sayılan karelerle değil requestAnimationFrame
 * zaman damgasıyla (yarım kare toleransla) belirlenir; böylece bir kare düşse bile süre uzamaz.
 * Her flaşın gerçek süresi ölçülür (flashSummary).
 */
(function (root) {
  'use strict';

  var Speed = root.SubSpeed;
  var Text = root.SubText;

  var LINE_H = 1.22; // satır yüksekliği / font boyutu
  var GAP = 0.8; // cümleler arası boşluk / font boyutu
  var FLASH_SCALE = 1.35; // flaş modunda yazı biraz daha büyük
  var RAIN_MAX = 1.35; // yağmurda en büyük öğe / temel boyut
  var MIN_SIZE = 10;
  var SAMPLE_WINDOW = 60; // ölçüm penceresi (son N flaş)

  function Sequencer(n, shuffle) {
    this.n = n;
    this.shuffle = shuffle;
    this.cycles = 0;
    this._build(-1);
  }
  Sequencer.prototype._build = function (lastIdx) {
    var order = [];
    for (var i = 0; i < this.n; i++) order.push(i);
    if (this.shuffle && this.n > 1) {
      order = Text.shuffle(order);
      if (order[0] === lastIdx) {
        order[0] = order[1];
        order[1] = lastIdx;
      }
    }
    this.order = order;
    this.pos = 0;
  };
  Sequencer.prototype.next = function () {
    if (!this.n) return -1;
    if (this.pos >= this.order.length) {
      this.cycles++;
      this._build(this.order[this.order.length - 1]);
    }
    return this.order[this.pos++];
  };

  /** En geniş tek kelimenin genişliği: bundan dar satır kelimeyi harf harf bölmek zorunda kalır. */
  function widestWord(ctx, sentences) {
    var seen = Object.create(null);
    var max = 0;
    for (var i = 0; i < sentences.length; i++) {
      var words = sentences[i].split(' ');
      for (var j = 0; j < words.length; j++) {
        var w = words[j];
        if (seen[w]) continue;
        seen[w] = true;
        var width = ctx.measureText(w).width;
        if (width > max) max = width;
      }
    }
    return max;
  }

  function wrap(ctx, text, maxW) {
    var lines = [];
    var cur = '';
    var words = text.split(' ');
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width <= maxW) {
        cur = test;
        continue;
      }
      if (cur) lines.push(cur);
      cur = '';
      if (ctx.measureText(w).width <= maxW) {
        cur = w;
        continue;
      }
      // Tek kelime satıra sığmıyor: harf harf böl
      var chars = Array.from(w);
      for (var c = 0; c < chars.length; c++) {
        if (cur && ctx.measureText(cur + chars[c]).width > maxW) {
          lines.push(cur);
          cur = chars[c];
        } else {
          cur += chars[c];
        }
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  function avg(list) {
    if (!list.length) return 0;
    var t = 0;
    for (var i = 0; i < list.length; i++) t += list[i];
    return t / list.length;
  }

  var DEFAULTS = {
    mode: 'flow',
    exposureMs: 1000,
    weighted: false,
    lanes: 3,
    direction: 'down',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 28,
    fontWeight: 500,
    color: '#ffffff',
    opacity: 1,
    outlineWidth: 0,
    outlineColor: '#000000',
    bgColor: '#000000',
    bgAlpha: 1,
    shuffle: false,
    // Flaş zamanlaması
    gapMs: 0, // bir flaş (veya seri) bittikten sonra boş ekran süresi
    burst: 1, // her flaşta art arda gösterilen cümle sayısı
    jitter: 0, // aralığın rastgele sapması (0–1, ±oran)
    position: 'center', // center | random | top | bottom
    preview: true // durağanken ekranı örnekle doldur (overlay'de kapalı)
  };
  var LAYOUT_KEYS = ['mode', 'lanes', 'fontFamily', 'fontSize', 'fontWeight'];
  var TIMING_KEYS = ['exposureMs', 'gapMs', 'burst', 'jitter', 'weighted'];

  function Engine(canvas, onStats) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onStats = onStats || function () {};
    this.s = Object.assign({}, DEFAULTS);
    this.sentences = [];
    this.avgChars = 0;
    this.W = 0;
    this.H = 0;
    this.dpr = 1;
    this.running = false;
    this.raf = 0;
    this.last = 0;
    this.frameMs = Speed.FRAME_60;
    this._dts = [];
    this._layout = null;
    this._stall = false;
    this._rand = Math.random;
    this.shown = 0;
    this._statT = 0;
    this._statShown = 0;
    this.sps = 0;
    this._tick = this._tick.bind(this);
    this._resetFlashStats();
    this._resetState();
  }

  Engine.prototype.setSentences = function (list) {
    this.sentences = list.slice();
    var total = 0;
    for (var i = 0; i < list.length; i++) total += list[i].length;
    this.avgChars = list.length ? total / list.length : 0;
    this._layout = null;
    this._resetState();
    if (!this.running) this.renderStill();
  };

  Engine.prototype.configure = function (patch) {
    var relayout = false;
    var reseq = false;
    var retime = false;
    for (var k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k) || this.s[k] === patch[k]) continue;
      if (LAYOUT_KEYS.indexOf(k) >= 0) relayout = true;
      if (TIMING_KEYS.indexOf(k) >= 0) retime = true;
      if (k === 'shuffle') reseq = true;
      this.s[k] = patch[k];
    }
    if (retime) this._resetFlashStats();
    if (relayout) {
      this._layout = null;
      this._resetState();
    } else if (reseq) {
      this.seq = new Sequencer(this.sentences.length, this.s.shuffle);
    }
    if (!this.running) {
      if (relayout || reseq) this.renderStill();
      else this._draw();
    }
  };

  Engine.prototype.resize = function () {
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var w = this.canvas.clientWidth;
    var h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (w === this.W && h === this.H && dpr === this.dpr) return;
    this.W = w;
    this.H = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this._layout = null;
    this._resetState();
    if (!this.running) this.renderStill();
  };

  /** Font yüklenince ölçüler değişir. */
  Engine.prototype.invalidateLayout = function () {
    this._layout = null;
    this._resetState();
    if (!this.running) this.renderStill();
  };

  Engine.prototype.start = function () {
    if (this.running || !this.sentences.length) return false;
    // Duraklatılmış bir flaş kaldığı yerden, yeni zaman damgasıyla baştan gösterilir:
    // eski başlangıç zamanıyla sahte (çok uzun) bir ölçüm yapılmaz.
    var f = this.flash;
    if (f.phase === 'show') f.previewIdx = f.cur;
    f.phase = 'idle';
    f.cur = -1;
    this.running = true;
    this.last = 0;
    this._statT = 0;
    this.raf = requestAnimationFrame(this._tick);
    return true;
  };

  Engine.prototype.stop = function () {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.sps = 0;
    this._emit();
  };

  Engine.prototype.resetCounters = function () {
    this.shown = 0;
    this._statShown = 0;
    if (this.seq) this.seq.cycles = 0;
    this._resetFlashStats();
  };

  /**
   * Otomatik hız için geometri: ekranda aynı anda akan "yuva" sayısı.
   * throughput = slots / görünme süresi.
   */
  Engine.prototype.geometry = function () {
    var L = this._ensureLayout();
    var H = this.H || 600;
    if (this.s.mode === 'flash') return { slots: 1, H: H };
    if (this.s.mode === 'rain') return { slots: L.rainCount * 0.7, H: H };
    return { slots: (this.s.lanes * (H + L.hRef)) / Math.max(L.avgH, 1), H: H };
  };

  /** Yazı sığdırma oranı: 1 = istenen boyut, < 1 = şeride sığsın diye küçültüldü. */
  Engine.prototype.fontFit = function () {
    var L = this._ensureLayout();
    return L.size / L.baseSize;
  };

  Engine.prototype.getFrameMs = function () {
    return this.frameMs;
  };

  /** Başlamadan önce ekran yenileme hızını ölç (60/120/144 Hz → en kısa görünme süresi). */
  Engine.prototype.calibrate = function (done) {
    var self = this;
    var last = 0;
    var n = 0;
    function step(t) {
      if (last) self._sampleFrame(t - last);
      last = t;
      if (++n < 50) requestAnimationFrame(step);
      else if (done) done(self.frameMs);
    }
    requestAnimationFrame(step);
  };

  /** Son flaşların ölçülen süreleri (ms). Beklenen = kareye oturtulmuş süre. */
  Engine.prototype.flashSummary = function () {
    var st = this.flashStats;
    var s = st.samples;
    return {
      count: st.count,
      late: st.late,
      lastMs: st.lastMs,
      expectedMs: st.expectedMs,
      avgMs: avg(s),
      minMs: s.length ? Math.min.apply(null, s) : 0,
      maxMs: s.length ? Math.max.apply(null, s) : 0,
      gapAvgMs: avg(st.gaps),
      gapPlannedMs: avg(st.gapPlans)
    };
  };

  // ---- dahili ----

  Engine.prototype._font = function (size) {
    return this.s.fontWeight + ' ' + size + 'px ' + this.s.fontFamily;
  };

  Engine.prototype._ensureLayout = function () {
    if (this._layout) return this._layout;
    var s = this.s;
    var W = this.W || 800;
    var baseSize = s.mode === 'flash' ? s.fontSize * FLASH_SCALE : s.fontSize;
    var laneW = s.mode === 'flow' ? W / s.lanes : W;
    var maxW = s.mode === 'flash' ? W * 0.86 : s.mode === 'rain' ? W * 0.55 : laneW - Math.min(28, laneW * 0.08) * 2;
    var ctx = this.ctx;
    // Dar şeritte kelimeler bölünmesin: en uzun kelime sığana kadar yazıyı küçült.
    var grow = s.mode === 'rain' ? RAIN_MAX : 1;
    ctx.font = this._font(baseSize * grow);
    var widest = widestWord(ctx, this.sentences);
    var size = baseSize;
    if (widest > maxW) size = Math.max(MIN_SIZE, Math.floor(((baseSize * maxW) / widest) * 0.98));
    var lineH = size * LINE_H;
    var gap = size * GAP;
    ctx.font = this._font(size);
    var items = [];
    var textHMax = lineH;
    var totalH = 0;
    if (s.mode !== 'rain') {
      for (var i = 0; i < this.sentences.length; i++) {
        var lines = wrap(ctx, this.sentences[i], Math.max(maxW, 20));
        var textH = lines.length * lineH;
        var w = 0;
        if (s.mode === 'flash') {
          for (var j = 0; j < lines.length; j++) w = Math.max(w, ctx.measureText(lines[j]).width);
        }
        if (textH > textHMax) textHMax = textH;
        totalH += textH + gap;
        items.push({ lines: lines, textH: textH, h: textH + gap, w: w });
      }
    }
    this._layout = {
      size: size,
      baseSize: baseSize,
      lineH: lineH,
      gap: gap,
      laneW: laneW,
      maxW: maxW,
      items: items,
      textHMax: textHMax,
      hRef: lineH + gap,
      avgH: items.length ? totalH / items.length : lineH + gap,
      rainCount: 3 + s.lanes * 4
    };
    return this._layout;
  };

  Engine.prototype._resetState = function () {
    this.seq = new Sequencer(this.sentences.length, this.s.shuffle);
    this.lanes = [];
    this.rain = [];
    this.flash = {
      phase: 'idle', // idle | show | gap
      cur: -1,
      previewIdx: -1,
      showT: 0,
      showMs: 0,
      gapT: 0,
      gapMs: 0,
      burstLeft: 0,
      x: 0,
      y: 0,
      counted: false
    };
  };

  Engine.prototype._resetFlashStats = function () {
    // Kuşak: ayar değişmeden önce başlamış flaş/aralık yeni ölçüm penceresine yazılmaz
    this._statsGen = (this._statsGen || 0) + 1;
    this.flashStats = { count: 0, late: 0, lastMs: 0, expectedMs: 0, samples: [], gaps: [], gapPlans: [] };
  };

  /** Akış hızı (px/sn): görünme süresi = ekranı boydan boya geçme süresi. */
  Engine.prototype._velocity = function (L) {
    return (this.H + L.hRef) / (Math.max(this.s.exposureMs, 1) / 1000);
  };

  Engine.prototype._spawnFlowLane = function (lane, L, prefilled) {
    var topY = lane.items.length ? lane.items[0].y : lane.seed;
    while (topY > 0) {
      var idx = this.seq.next();
      if (idx < 0) return;
      var lay = L.items[idx];
      var y = topY - lay.h;
      lane.items.unshift({ idx: idx, y: y, lay: lay, counted: !!prefilled });
      topY = y;
    }
  };

  Engine.prototype._flowStep = function (dt) {
    var L = this._ensureLayout();
    var H = this.H;
    var d = (this._velocity(L) * dt) / 1000;
    var cap = Math.max(1, H - L.textHMax);
    if (d > cap) d = cap;
    while (this.lanes.length < this.s.lanes) {
      this.lanes.push({ items: [], seed: ((this.lanes.length * 0.37) % 1) * L.hRef });
    }
    for (var li = 0; li < this.lanes.length; li++) {
      var lane = this.lanes[li];
      var kept = [];
      for (var i = 0; i < lane.items.length; i++) {
        var it = lane.items[i];
        it.y += d;
        if (it.y < H) kept.push(it);
      }
      lane.items = kept;
      this._spawnFlowLane(lane, L, false);
    }
  };

  // ---- flaş ----

  /** Cümlenin ekranda kalacağı süre: kareye oturtulmuş (otomatik modda uzunluğa göre ağırlıklı). */
  Engine.prototype._flashShowMs = function (idx) {
    var w = this.s.weighted ? Speed.lengthWeight(this.sentences[idx].length, this.avgChars) : 1;
    return Speed.snap(this.s.exposureMs * w, this.frameMs).ms;
  };

  Engine.prototype._nextGapMs = function () {
    var g = Math.max(0, Number(this.s.gapMs) || 0);
    var j = Speed.clamp(Number(this.s.jitter) || 0, 0, 1);
    if (g && j) g *= 1 + j * (this._rand() * 2 - 1);
    return g;
  };

  Engine.prototype._placeFlash = function (idx) {
    var lay = this._ensureLayout().items[idx];
    var f = this.flash;
    var W = this.W;
    var H = this.H;
    var m = Math.min(W, H) * 0.06;
    var pos = this.s.position;
    var top;
    if (pos === 'random') {
      f.x = m + lay.w / 2 + this._rand() * Math.max(0, W - lay.w - 2 * m);
      top = m + this._rand() * Math.max(0, H - lay.textH - 2 * m);
    } else {
      f.x = W / 2;
      top = pos === 'top' ? m : pos === 'bottom' ? H - m - lay.textH : (H - lay.textH) / 2;
    }
    f.y = Math.max(0, top);
  };

  Engine.prototype._flashBegin = function (now) {
    var f = this.flash;
    var idx = f.previewIdx >= 0 && f.previewIdx < this.sentences.length ? f.previewIdx : this.seq.next();
    f.previewIdx = -1;
    if (idx < 0) return;
    f.cur = idx;
    f.phase = 'show';
    f.showT = now;
    f.showMs = this._flashShowMs(idx);
    f.gen = this._statsGen;
    f.counted = false;
    this._placeFlash(idx);
  };

  Engine.prototype._recordFlash = function (actual, expected) {
    if (this._stall) return; // sekme gizliydi: ölçüm anlamsız
    var st = this.flashStats;
    st.samples.push(actual);
    if (st.samples.length > SAMPLE_WINDOW) st.samples.shift();
    st.count++;
    st.lastMs = actual;
    st.expectedMs = expected;
    if (actual > expected + this.frameMs / 2) st.late++;
  };

  Engine.prototype._recordGap = function (actual, planned) {
    if (this._stall) return;
    var st = this.flashStats;
    st.gaps.push(actual);
    st.gapPlans.push(planned);
    if (st.gaps.length > SAMPLE_WINDOW) {
      st.gaps.shift();
      st.gapPlans.shift();
    }
  };

  Engine.prototype._flashStep = function (now) {
    var f = this.flash;
    var half = this.frameMs / 2;
    var burst = Math.max(1, Math.round(Number(this.s.burst) || 1));
    if (f.phase === 'idle') {
      f.burstLeft = burst - 1;
      this._flashBegin(now);
      return;
    }
    if (f.phase === 'show') {
      if (now - f.showT < f.showMs - half) return;
      if (f.gen === this._statsGen) this._recordFlash(now - f.showT, f.showMs);
      if (f.burstLeft > 0) {
        f.burstLeft--;
        this._flashBegin(now);
        return;
      }
      var gap = this._nextGapMs();
      if (gap < half) {
        f.burstLeft = burst - 1;
        this._flashBegin(now);
        return;
      }
      f.phase = 'gap';
      f.cur = -1;
      f.gapT = now;
      f.gapMs = gap;
      f.gapGen = this._statsGen;
      return;
    }
    // aralık: ekran boş
    if (now - f.gapT < f.gapMs - half) return;
    if (f.gapGen === this._statsGen) this._recordGap(now - f.gapT, f.gapMs);
    f.burstLeft = burst - 1;
    this._flashBegin(now);
  };

  // ---- yağmur ----

  Engine.prototype._spawnRain = function (L, anywhere) {
    var size = L.size * (0.65 + this._rand() * (RAIN_MAX - 0.65));
    var idx = this.seq.next();
    if (idx < 0) return;
    var ctx = this.ctx;
    ctx.font = this._font(size);
    var lines = wrap(ctx, this.sentences[idx], Math.max(L.maxW, 20));
    var w = 0;
    for (var i = 0; i < lines.length; i++) w = Math.max(w, ctx.measureText(lines[i]).width);
    var lineH = size * LINE_H;
    var textH = lines.length * lineH;
    var pad = 12;
    var x = pad + w / 2 + this._rand() * Math.max(0, this.W - w - pad * 2);
    var y = anywhere ? this._rand() * Math.max(1, this.H - textH) : -textH - this._rand() * this.H * 0.6;
    this.rain.push({
      idx: idx,
      x: x,
      y: y,
      lines: lines,
      size: size,
      lineH: lineH,
      textH: textH,
      k: 0.75 + this._rand() * 0.5,
      alpha: 0.55 + this._rand() * 0.45,
      counted: !!anywhere
    });
  };

  Engine.prototype._rainStep = function (dt) {
    var L = this._ensureLayout();
    var v = this._velocity(L);
    var H = this.H;
    var kept = [];
    for (var i = 0; i < this.rain.length; i++) {
      var it = this.rain[i];
      var d = (v * it.k * dt) / 1000;
      var cap = Math.max(1, H - it.textH);
      it.y += d > cap ? cap : d;
      if (it.y < H) kept.push(it);
    }
    this.rain = kept;
    while (this.rain.length < L.rainCount) this._spawnRain(L, false);
  };

  // ---- çizim ----

  Engine.prototype._clear = function () {
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.W, this.H);
    if (this.s.bgAlpha > 0) {
      ctx.globalAlpha = this.s.bgAlpha;
      ctx.fillStyle = this.s.bgColor;
      ctx.fillRect(0, 0, this.W, this.H);
    }
  };

  Engine.prototype._markShown = function (it) {
    if (!it.counted) {
      it.counted = true;
      this.shown++;
    }
  };

  /** Satırları çizer; kontur açıksa önce çevre çizgisi (video/oyun üstünde okunurluk için). */
  Engine.prototype._lines = function (lines, x, top, lineH) {
    var ctx = this.ctx;
    var outline = this.s.outlineWidth > 0;
    for (var i = 0; i < lines.length; i++) {
      var y = top + i * lineH;
      if (outline) ctx.strokeText(lines[i], x, y);
      ctx.fillText(lines[i], x, y);
    }
  };

  Engine.prototype._draw = function () {
    if (!this.W || !this.H) return;
    this._clear();
    if (!this.sentences.length) return;
    var ctx = this.ctx;
    var s = this.s;
    var L = this._ensureLayout();
    var H = this.H;
    var up = s.direction === 'up';
    ctx.fillStyle = s.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (s.outlineWidth > 0) {
      ctx.strokeStyle = s.outlineColor;
      ctx.lineWidth = s.outlineWidth * 2; // çizgi ortalanır: yarısı dışarıda kalır
      ctx.lineJoin = 'round';
    }

    if (s.mode === 'flow') {
      ctx.font = this._font(L.size);
      ctx.globalAlpha = s.opacity;
      for (var li = 0; li < this.lanes.length; li++) {
        var cx = L.laneW * li + L.laneW / 2;
        var items = this.lanes[li].items;
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          var textH = it.lay.textH;
          if (it.y + textH <= 0 || it.y >= H) continue;
          if (it.y >= 0 && it.y + textH <= H) this._markShown(it);
          this._lines(it.lay.lines, cx, up ? H - it.y - textH : it.y, L.lineH);
        }
      }
    } else if (s.mode === 'flash') {
      var f = this.flash;
      var showing = f.phase === 'show' && f.cur >= 0;
      var idx = showing ? f.cur : !this.running && f.previewIdx >= 0 ? f.previewIdx : -1;
      if (idx >= 0 && idx < L.items.length) {
        var lay = L.items[idx];
        ctx.font = this._font(L.size);
        ctx.globalAlpha = s.opacity;
        this._lines(lay.lines, showing ? f.x : this.W / 2, showing ? f.y : (H - lay.textH) / 2, L.lineH);
        if (showing && this.running) this._markShown(f);
      }
    } else {
      for (var r = 0; r < this.rain.length; r++) {
        var d = this.rain[r];
        if (d.y + d.textH <= 0 || d.y >= H) continue;
        if (d.y >= 0 && d.y + d.textH <= H) this._markShown(d);
        ctx.font = this._font(d.size);
        ctx.globalAlpha = s.opacity * d.alpha;
        this._lines(d.lines, d.x, up ? H - d.y - d.textH : d.y, d.lineH);
      }
    }
    ctx.globalAlpha = 1;
  };

  /** Durağan önizleme: ekranı dolu gösterir, sayaçları artırmaz. */
  Engine.prototype.renderStill = function () {
    if (!this.W || !this.H) return;
    if (!this.s.preview) {
      this._clear();
      return;
    }
    var L = this._ensureLayout();
    if (this.sentences.length) {
      if (this.s.mode === 'flow' && !this.lanes.length) {
        for (var i = 0; i < this.s.lanes; i++) {
          var lane = { items: [], seed: ((i * 0.37) % 1) * L.hRef };
          lane.seed += this.H;
          this._spawnFlowLane(lane, L, true);
          lane.seed -= this.H;
          this.lanes.push(lane);
        }
      } else if (this.s.mode === 'flash' && this.flash.phase === 'idle' && this.flash.previewIdx < 0) {
        this.flash.previewIdx = this.seq.next();
      } else if (this.s.mode === 'rain' && !this.rain.length) {
        for (var r = 0; r < L.rainCount; r++) this._spawnRain(L, true);
      }
    }
    this._draw();
  };

  Engine.prototype._sampleFrame = function (dt) {
    if (dt <= 0 || dt > 60) return;
    this._dts.push(dt);
    if (this._dts.length >= 45) {
      var sorted = this._dts.slice().sort(function (a, b) {
        return a - b;
      });
      this.frameMs = Math.max(1000 / 240, sorted[sorted.length >> 1]);
      this._dts.length = 0;
    }
  };

  Engine.prototype._emit = function () {
    this.onStats({
      running: this.running,
      frameMs: this.frameMs,
      hz: 1000 / this.frameMs,
      shown: this.shown,
      sps: this.sps,
      cycles: this.seq ? this.seq.cycles : 0,
      flash: this.s.mode === 'flash' ? this.flashSummary() : null
    });
  };

  Engine.prototype._tick = function (now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._tick);
    var raw = this.last ? now - this.last : this.frameMs;
    this.last = now;
    // Sekme arka plandaydı: akışta zıplama yapma, flaşta sahte ölçüm kaydetme
    this._stall = raw > 250;
    var dt = this._stall ? this.frameMs : raw;
    this._sampleFrame(raw);
    if (this.s.mode === 'flow') this._flowStep(dt);
    else if (this.s.mode === 'flash') this._flashStep(now);
    else this._rainStep(dt);
    this._draw();
    if (!this._statT) {
      this._statT = now;
      this._statShown = this.shown;
    } else if (now - this._statT >= 500) {
      this.sps = ((this.shown - this._statShown) * 1000) / (now - this._statT);
      this._statT = now;
      this._statShown = this.shown;
      this._emit();
    }
  };

  root.SubEngine = Engine;
})(typeof self !== 'undefined' ? self : this);
