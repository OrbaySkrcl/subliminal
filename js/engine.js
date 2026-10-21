/*
 * Canvas çizim motoru. Üç mod:
 *   flow  — şeritler halinde yukarıdan aşağı (veya aşağıdan yukarı) akan cümleler
 *   flash — ortada tek tek yanıp sönen cümleler (takistoskop)
 *   rain  — rastgele konum/boyutta düşen cümleler
 *
 * Temel garanti: hız ne olursa olsun her cümle en az bir karede tamamen görünür çizilir.
 * Akan modlarda kare başı yer değiştirme (ekran yüksekliği − metin yüksekliği) ile sınırlanır,
 * flaş modunda her karede en fazla bir cümle ilerlenir.
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
    bgColor: '#000000',
    bgAlpha: 1,
    shuffle: false,
    flashGap: false
  };
  var LAYOUT_KEYS = ['mode', 'lanes', 'fontFamily', 'fontSize', 'fontWeight'];

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
    this.shown = 0;
    this._statT = 0;
    this._statShown = 0;
    this.sps = 0;
    this._tick = this._tick.bind(this);
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
    for (var k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k) || this.s[k] === patch[k]) continue;
      if (LAYOUT_KEYS.indexOf(k) >= 0) relayout = true;
      if (k === 'shuffle') reseq = true;
      this.s[k] = patch[k];
    }
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
  };

  /**
   * Otomatik hız için geometri: ekranda aynı anda akan "yuva" sayısı.
   * throughput = slots / görünme süresi.
   */
  Engine.prototype.geometry = function () {
    var L = this._ensureLayout();
    var H = this.H || 600;
    if (this.s.mode === 'flash') {
      return { slots: this.s.flashGap ? 0.5 : 1, H: H };
    }
    if (this.s.mode === 'rain') {
      return { slots: L.rainCount * 0.7, H: H };
    }
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
        if (textH > textHMax) textHMax = textH;
        totalH += textH + gap;
        items.push({ lines: lines, textH: textH, h: textH + gap });
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
    this.flash = { cur: -1, t: 0, dur: 0, drawn: false, blank: false, counted: false };
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

  Engine.prototype._flashNext = function () {
    var f = this.flash;
    f.cur = this.seq.next();
    var w = this.s.weighted ? Speed.lengthWeight(this.sentences[f.cur].length, this.avgChars) : 1;
    f.dur = Math.max(this.s.exposureMs * w, this.frameMs);
    f.drawn = false;
    f.counted = false;
    f.blank = false;
  };

  Engine.prototype._flashStep = function (dt) {
    var f = this.flash;
    if (f.cur < 0) {
      this._flashNext();
      return;
    }
    f.t += dt;
    // Çizilmemiş cümle asla atlanmaz; 1 kare tolerans payı çeyrek kare.
    if (!f.drawn || f.t < f.dur - this.frameMs * 0.25) return;
    f.t -= f.dur;
    if (f.t < 0 || f.t > this.frameMs) f.t = 0;
    if (this.s.flashGap && !f.blank) {
      f.blank = true;
      f.dur = this.frameMs;
      f.drawn = false;
    } else {
      this._flashNext();
    }
  };

  Engine.prototype._spawnRain = function (L, anywhere) {
    var size = L.size * (0.65 + Math.random() * (RAIN_MAX - 0.65));
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
    var x = pad + w / 2 + Math.random() * Math.max(0, this.W - w - pad * 2);
    var y = anywhere ? Math.random() * Math.max(1, this.H - textH) : -textH - Math.random() * this.H * 0.6;
    this.rain.push({
      idx: idx,
      x: x,
      y: y,
      lines: lines,
      size: size,
      lineH: lineH,
      textH: textH,
      k: 0.75 + Math.random() * 0.5,
      alpha: 0.55 + Math.random() * 0.45,
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
          var y = up ? H - it.y - textH : it.y;
          for (var j = 0; j < it.lay.lines.length; j++) ctx.fillText(it.lay.lines[j], cx, y + j * L.lineH);
        }
      }
    } else if (s.mode === 'flash') {
      var f = this.flash;
      if (f.cur >= 0 && !f.blank) {
        var lay = L.items[f.cur];
        ctx.font = this._font(L.size);
        ctx.globalAlpha = s.opacity;
        var top = (H - lay.textH) / 2;
        for (var k = 0; k < lay.lines.length; k++) ctx.fillText(lay.lines[k], this.W / 2, top + k * L.lineH);
        if (this.running) this._markShown(f);
      }
      f.drawn = true;
    } else {
      for (var r = 0; r < this.rain.length; r++) {
        var d = this.rain[r];
        if (d.y + d.textH <= 0 || d.y >= H) continue;
        if (d.y >= 0 && d.y + d.textH <= H) this._markShown(d);
        ctx.font = this._font(d.size);
        ctx.globalAlpha = s.opacity * d.alpha;
        var ry = up ? H - d.y - d.textH : d.y;
        for (var q = 0; q < d.lines.length; q++) ctx.fillText(d.lines[q], d.x, ry + q * d.lineH);
      }
    }
    ctx.globalAlpha = 1;
  };

  /** Durağan önizleme: ekranı dolu gösterir, sayaçları artırmaz. */
  Engine.prototype.renderStill = function () {
    if (!this.W || !this.H) return;
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
      } else if (this.s.mode === 'flash' && this.flash.cur < 0) {
        this._flashNext();
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
      cycles: this.seq ? this.seq.cycles : 0
    });
  };

  Engine.prototype._tick = function (now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._tick);
    var dt = this.last ? now - this.last : this.frameMs;
    this.last = now;
    if (dt > 250) dt = this.frameMs; // sekme arka plandaydı: zıplama yapma
    this._sampleFrame(dt);
    if (this.s.mode === 'flow') this._flowStep(dt);
    else if (this.s.mode === 'flash') this._flashStep(dt);
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
