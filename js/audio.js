/*
 * Ses katmanı:
 *   Ambient — pembe / kahverengi gürültü, binaural vuruş (alfa/teta/delta) ya da kullanıcının ses dosyası
 *   Speaker — affirmasyonları tarayıcının konuşma sentezi (TTS) ile döngüde okur
 * Tarayıcı kuralı gereği ses ancak kullanıcı bir düğmeye bastıktan sonra başlar.
 */
(function (root) {
  'use strict';

  var BEATS = { alpha: 10, theta: 6, delta: 2.5 };
  var CARRIER = 200; // Hz

  function Ambient() {
    this.kind = 'off';
    this.volume = 0.4;
    this.ctx = null;
    this.master = null;
    this.nodes = [];
    this.playing = false;
    this.fileUrl = null;
    this.el = null;
  }

  Ambient.prototype._ensureCtx = function () {
    if (this.ctx) return this.ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  };

  /** Kesintisiz döngü için sonu başa çapraz geçişli gürültü tamponu. */
  Ambient.prototype._noiseBuffer = function (type) {
    var ctx = this.ctx;
    var sr = ctx.sampleRate;
    var n = sr * 8;
    var fade = Math.floor(sr * 0.5);
    var buf = ctx.createBuffer(2, n, sr);
    for (var ch = 0; ch < 2; ch++) {
      var a = new Float32Array(n + fade);
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (var i = 0; i < a.length; i++) {
        var w = Math.random() * 2 - 1;
        if (type === 'brown') {
          last = (last + 0.02 * w) / 1.02;
          a[i] = last * 3.5;
        } else {
          // Paul Kellet pembe gürültü filtresi
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          a[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        }
      }
      var out = buf.getChannelData(ch);
      for (var j = 0; j < n; j++) out[j] = a[j];
      for (var f = 0; f < fade; f++) {
        var t = f / fade;
        out[f] = a[f] * t + a[n + f] * (1 - t);
      }
    }
    return buf;
  };

  Ambient.prototype._startNodes = function () {
    var ctx = this._ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (this.kind === 'pink' || this.kind === 'brown') {
      var src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(this.kind);
      src.loop = true;
      src.connect(this.master);
      src.start();
      this.nodes.push(src);
    } else if (BEATS[this.kind]) {
      var merger = ctx.createChannelMerger(2);
      var g = ctx.createGain();
      g.gain.value = 0.35;
      merger.connect(g);
      g.connect(this.master);
      var beat = BEATS[this.kind];
      [CARRIER - beat / 2, CARRIER + beat / 2].forEach(function (freq, ch) {
        var osc = ctx.createOscillator();
        osc.frequency.value = freq;
        osc.connect(merger, 0, ch);
        osc.start();
        this.nodes.push(osc);
      }, this);
      this.nodes.push(merger, g);
    }
  };

  Ambient.prototype._stopNodes = function () {
    this.nodes.forEach(function (n) {
      try {
        if (n.stop) n.stop();
        n.disconnect();
      } catch (e) {
        /* zaten durmuş */
      }
    });
    this.nodes = [];
    if (this.el) this.el.pause();
  };

  Ambient.prototype.setKind = function (kind) {
    if (kind === this.kind) return;
    var was = this.playing;
    this.stop();
    this.kind = kind;
    if (was) this.start();
  };

  Ambient.prototype.setVolume = function (v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
    if (this.el) this.el.volume = v;
  };

  Ambient.prototype.setFile = function (file) {
    if (this.fileUrl) URL.revokeObjectURL(this.fileUrl);
    this.fileUrl = file ? URL.createObjectURL(file) : null;
    if (!this.el) {
      this.el = new Audio();
      this.el.loop = true;
    }
    this.el.src = this.fileUrl || '';
    this.el.volume = this.volume;
    if (this.playing && this.kind === 'file' && this.fileUrl) this.el.play().catch(function () {});
  };

  Ambient.prototype.start = function () {
    this.playing = true;
    if (this.kind === 'off') return;
    if (this.kind === 'file') {
      if (this.el && this.fileUrl) this.el.play().catch(function () {});
      return;
    }
    this._startNodes();
  };

  Ambient.prototype.stop = function () {
    this.playing = false;
    this._stopNodes();
  };

  // ---- Sesli okuma ----

  function Speaker() {
    this.synth = root.speechSynthesis || null;
    this.enabled = false;
    this.rate = 1.6;
    this.volume = 0.5;
    this.voiceURI = '';
    this.sentences = [];
    this.i = 0;
    this.active = false;
    this._gen = 0;
  }

  Speaker.prototype.supported = function () {
    return !!(this.synth && root.SpeechSynthesisUtterance);
  };

  Speaker.prototype.voices = function () {
    if (!this.supported()) return [];
    return this.synth.getVoices().slice().sort(function (a, b) {
      var ta = /^tr/i.test(a.lang) ? 0 : 1;
      var tb = /^tr/i.test(b.lang) ? 0 : 1;
      return ta - tb || a.name.localeCompare(b.name);
    });
  };

  Speaker.prototype.setSentences = function (list) {
    this.sentences = list.slice();
    if (this.i >= this.sentences.length) this.i = 0;
  };

  Speaker.prototype._speakNext = function (gen) {
    if (!this.active || gen !== this._gen || !this.sentences.length) return;
    var self = this;
    var u = new root.SpeechSynthesisUtterance(this.sentences[this.i % this.sentences.length]);
    this.i = (this.i + 1) % this.sentences.length;
    u.rate = this.rate;
    u.volume = this.volume;
    u.lang = 'tr-TR';
    var voice = this.voices().filter(function (v) {
      return v.voiceURI === self.voiceURI;
    })[0];
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.onend = u.onerror = function () {
      self._speakNext(gen);
    };
    this.synth.speak(u);
  };

  Speaker.prototype.start = function () {
    if (!this.enabled || !this.supported() || this.active) return;
    this.active = true;
    this._gen++;
    this.synth.cancel();
    this._speakNext(this._gen);
  };

  Speaker.prototype.stop = function () {
    this.active = false;
    this._gen++;
    if (this.supported()) this.synth.cancel();
  };

  /** Hız/ses/ses türü değişince sıradaki cümleden itibaren uygula. */
  Speaker.prototype.restart = function () {
    if (!this.active) return;
    this.stop();
    this.start();
  };

  root.SubAudio = { Ambient: Ambient, Speaker: Speaker, BEATS: BEATS };
})(typeof self !== 'undefined' ? self : this);
