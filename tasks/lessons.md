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
- **Kare sayarak süre ölçme.** Bir kare düşünce süre uzar. Bitişi rAF zaman damgasıyla ve yarım kare
  toleransla belirle. Düşen kare tam bitişe denk gelirse gecikme kaçınılmazdır; gizleme, raporla.
- **Eşitlik sınırındaki test değerleri.** 60 Hz'de 25 ms tam 1,5 kare: ölçüm gürültüsü yuvarlamayı
  çevirir. Testlerde sınırda olmayan değer seç (30 ms).
- **Ayar değişince ölçüm penceresini sıfırlamak yetmez.** O an ekranda olan flaş eski ayarla başlamıştır.
  Her flaşa kuşak numarası ver, eski kuşağı kaydetme.
- **`position: absolute` + kaydırılan panel.** Konumlandırılmış bir ata yoksa gizli öğe panelden
  kaçar ve sayfayı uzatır. Kaydırma kapsayıcısına `position: relative` ver.
- **Electron/Linux:** ekranla birebir aynı boyuttaki pencere 1 px küçültülür (Chromium X11). Root
  olarak `--no-sandbox` gerekir. İçerik koruması yalnızca Windows/macOS'ta vardır.
- **Electron 44** ikili dosyayı `npm install` sırasında değil ilk kullanımda indiriyor.
- **NSIS kurulumu Linux'ta Wine ister.** Taşınabilir exe istemez. Kurulum dosyasını Windows CI'da derle.
