/*
 * Metin işleme: cümle ayrıştırma, temizleme, dosya kodlaması çözümü.
 * Tarayıcıda window.SubText, Node'da require('./text.js') olarak kullanılır.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SubText = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Satır başındaki liste işaretleri: "- ", "* ", "• ", "1. ", "2) "
  var LIST_MARKER = /^(?:[-*•–—·]+|\d{1,3}[.)])\s+/;

  function splitSentences(line) {
    return line
      .replace(/([.!?…]+["'”’»)]*)\s+/g, '$1\n')
      .split('\n');
  }

  function normalize(s) {
    return s.replace(/\s+/g, ' ').trim().replace(LIST_MARKER, '').trim();
  }

  /**
   * Ham metni gösterilecek cümle listesine çevirir.
   * @param {string} raw
   * @param {{splitSentences?: boolean, dedupe?: boolean}} [opts]
   * @returns {string[]}
   */
  function parse(raw, opts) {
    opts = opts || {};
    var lines = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n').split('\n');
    var parts = [];
    for (var i = 0; i < lines.length; i++) {
      if (opts.splitSentences) parts.push.apply(parts, splitSentences(lines[i]));
      else parts.push(lines[i]);
    }
    var out = [];
    var seen = Object.create(null);
    for (var j = 0; j < parts.length; j++) {
      var s = normalize(parts[j]);
      if (!s) continue;
      if (opts.dedupe) {
        var key = s.toLocaleLowerCase('tr-TR');
        if (seen[key]) continue;
        seen[key] = true;
      }
      out.push(s);
    }
    return out;
  }

  /** Türkçe kurallarıyla büyük harf (i → İ, ı → I). */
  function upperTr(s) {
    return s.toLocaleUpperCase('tr-TR');
  }

  function stats(sentences) {
    var total = 0;
    var max = 0;
    for (var i = 0; i < sentences.length; i++) {
      var n = sentences[i].length;
      total += n;
      if (n > max) max = n;
    }
    return {
      count: sentences.length,
      totalChars: total,
      avgChars: sentences.length ? total / sentences.length : 0,
      maxChars: max
    };
  }

  /**
   * Dosya baytlarını metne çevirir. BOM varsa ona uyar; yoksa önce katı UTF-8 dener,
   * olmazsa Türkçe Windows kodlamasına (windows-1254) düşer.
   * @param {ArrayBuffer|Uint8Array} buf
   * @returns {{text: string, encoding: string}}
   */
  function decode(buf) {
    var b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
      return { text: new TextDecoder('utf-8').decode(b.subarray(3)), encoding: 'utf-8' };
    }
    if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) {
      return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 'utf-16le' };
    }
    if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
      return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 'utf-16be' };
    }
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'utf-8' };
    } catch (e) {
      return { text: new TextDecoder('windows-1254').decode(b), encoding: 'windows-1254' };
    }
  }

  /** Fisher–Yates; rng verilmezse Math.random. Yeni dizi döner. */
  function shuffle(arr, rng) {
    rng = rng || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  return {
    parse: parse,
    upperTr: upperTr,
    stats: stats,
    decode: decode,
    shuffle: shuffle
  };
});
