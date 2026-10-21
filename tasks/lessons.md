# Dersler

- **Testin varsayımını kodun davranışına karşı doğrula.** "4 şerit = 4× yuva" testi düştü; motor
  doğruydu (dar şeritte cümleler sarılıp uzuyor). Önce hangisinin yanlış olduğunu belirle.
- **Zamanlayıcı başlangıç değeri.** `last = 0` iken `now - last` biriktirmek süreyi uçurur; süre
  yalnızca çalışırken ve `last` gerçek bir zaman damgasıyken biriktirilmeli. Durdurma fonksiyonu,
  kendini tetikleyebilecek bir "tick"i çağırmamalı (özyineleme).
- **Boşluk tuşu küresel kısayolu**, odaklı düğme/kutucuk üzerinde tarayıcının kendi davranışıyla
  çakışır (çift tetikleme). Etkileşimli öğelerde Boşluk ve okları onlara bırak.
- **Canvas web fontunu kendisi yüklemez**; `document.fonts.load()` ile yükleyip ölçüleri yenile.
- **Dar ekranı ekran görüntüsüyle kontrol et.** Masaüstünde iyi görünen şerit düzeni telefonda
  kelimeleri harf harf böldü; yalnızca görsel kontrolle yakalandı.
- **`node --test tests/`** Node 22'de dizin kabul etmiyor; glob kullan: `tests/*.test.js`.
- **file:// altında ES modülleri çalışmaz** (CORS). Çift tıkla açılacak uygulamalarda klasik script.
