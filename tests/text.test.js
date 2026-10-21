'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/text.js');

test('satırlara böler, boşlukları kırpar, boş satırları atar', () => {
  assert.deepEqual(T.parse('  Bir  \r\n\r\n İki\n\n\nÜç  '), ['Bir', 'İki', 'Üç']);
});

test('liste işaretlerini temizler', () => {
  assert.deepEqual(T.parse('1. Bir\n2) İki\n- Üç\n• Dört\n* Beş'), ['Bir', 'İki', 'Üç', 'Dört', 'Beş']);
});

test('isteğe bağlı olarak noktalama işaretlerinden cümlelere böler', () => {
  const raw = 'Güçlüyüm. Sakinim! Neden olmasın? Evet… Tamam';
  assert.deepEqual(T.parse(raw), [raw]);
  assert.deepEqual(T.parse(raw, { splitSentences: true }), ['Güçlüyüm.', 'Sakinim!', 'Neden olmasın?', 'Evet…', 'Tamam']);
});

test('tekrarları Türkçe büyük/küçük harf duyarsız çıkarır', () => {
  assert.deepEqual(T.parse('İyiyim\niyiyim\nIşık\nışık\nBaşka', { dedupe: true }), ['İyiyim', 'Işık', 'Başka']);
});

test('Türkçe büyük harf kuralı: i → İ, ı → I', () => {
  assert.equal(T.upperTr('istiyorum ışık'), 'İSTİYORUM IŞIK');
});

test('istatistik', () => {
  const s = T.stats(['ab', 'abcd']);
  assert.deepEqual(s, { count: 2, totalChars: 6, avgChars: 3, maxChars: 4 });
  assert.equal(T.stats([]).avgChars, 0);
});

test('kodlama: UTF-8 (BOM\'lu ve BOM\'suz)', () => {
  const body = Buffer.from('Şükür ğüçö İı', 'utf8');
  assert.deepEqual(T.decode(new Uint8Array(body)), { text: 'Şükür ğüçö İı', encoding: 'utf-8' });
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]);
  assert.deepEqual(T.decode(new Uint8Array(bom)), { text: 'Şükür ğüçö İı', encoding: 'utf-8' });
});

test('kodlama: UTF-16 LE/BE BOM', () => {
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Işık', 'utf16le')]);
  assert.deepEqual(T.decode(le), { text: 'Işık', encoding: 'utf-16le' });
  const leBody = Buffer.from('Işık', 'utf16le');
  const be = Buffer.alloc(leBody.length);
  for (let i = 0; i < leBody.length; i += 2) {
    be[i] = leBody[i + 1];
    be[i + 1] = leBody[i];
  }
  assert.deepEqual(T.decode(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), { text: 'Işık', encoding: 'utf-16be' });
});

test('kodlama: geçersiz UTF-8 → windows-1254 (Türkçe Windows/Notepad)', () => {
  // "Şeker ığdır" windows-1254 baytları: Ş=0xDE, ı=0xFD, ğ=0xF0
  const bytes = new Uint8Array([0xde, 0x65, 0x6b, 0x65, 0x72, 0x20, 0xfd, 0xf0, 0x64, 0xfd, 0x72]);
  assert.deepEqual(T.decode(bytes), { text: 'Şeker ığdır', encoding: 'windows-1254' });
});

test('karıştırma tüm elemanları korur ve kopyalar', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = T.shuffle(src, rng);
  assert.notEqual(out, src);
  assert.deepEqual([...out].sort((a, b) => a - b), src);
});
