# Eşikaltı Akış

Affirmasyon cümlelerini ekranda **yukarıdan aşağıya, sonsuz döngüde** akıtan tarayıcı uygulaması.
Hız, rahat okunabilir seviyeden **cümle başına tek ekran karesine** (60 Hz ekranda ~17 ms) kadar
ayarlanır. En yüksek hızda cümleler bilinçli olarak okunamaz.

Kurulum ya da derleme gerekmez: `index.html` dosyasına çift tıkla, tarayıcıda açılır.

## Kullanım

1. **Cümleler**: Metin kutusuna her satıra bir affirmasyon yaz, ya da `.txt yükle` ile dosyanı seç.
   Dosyayı sayfanın üzerine sürükleyip bırakmak da olur. Birden çok dosya seçilebilir.
2. **Hız**:
   - **Otomatik**: Hedef seviyeyi seç (Okunabilir / Hızlı / Bilinçaltı). Uygulama cümle sayısına ve
     ortalama cümle uzunluğuna bakarak hızı kendisi ayarlar.
   - **Manuel**: Kaydırıcıyı sağa çektikçe hızlanır. En sağ = her cümle 1 ekran karesi.
3. **Başlat**: Sahneye tıkla ya da `Boşluk` tuşuna bas. `F` ile tam ekran.

Hız paneli her an şunları gösterir: cümle başına görünme süresi, kaç ekran karesine denk geldiği,
saniyede kaç cümle aktığı ve tüm listenin bir turunun ne kadar sürdüğü.

## Otomatik hız nasıl hesaplanır

| Seviye | Cümle başı süre | Tam tur sınırı |
| --- | --- | --- |
| Okunabilir | karakter × 70 ms (1,8–8 sn) | yok |
| Hızlı | karakter × 9 ms (160 ms–1,2 sn) | 45 sn |
| Bilinçaltı | karakter × 0,6 ms (en fazla 50 ms) | 3 sn |

- Uzun cümleler biraz daha uzun, kısa cümleler biraz daha kısa görünür.
- Liste uzayınca tüm cümlelerin bir turu seviyenin sınırını aşmasın diye hız artar.
- Süre hiçbir zaman 1 ekran karesinin altına inmez. Ekranın yenileme hızı (60/120/144 Hz)
  açılışta ölçülür, en kısa süre buna göre belirlenir.
- Flaş modunda her cümlenin süresi kendi uzunluğuna göre ayrı ayrı ayarlanır.

## Modlar

- **Akış**: Cümleler 1–6 şerit halinde yukarıdan aşağıya (veya aşağıdan yukarıya) akar.
- **Flaş**: Cümleler ortada tek tek yanıp söner. İsteğe bağlı olarak araya 1 boş kare (maskeleme) eklenir.
- **Yağmur**: Cümleler farklı boyut ve konumlarda düşer.

Motor, hız ne kadar yüksek olursa olsun **her cümlenin en az bir karede tamamen görünür çizilmesini**
garanti eder: akan modlarda kare başı kayma ekran yüksekliğiyle sınırlanır, flaş modunda her
karede en fazla bir cümle ilerlenir. Bu davranış `tests/engine.test.js` ile doğrulanır.

## Ek özellikler

- `.txt` kodlaması otomatik algılanır: UTF-8, UTF-16 ve Türkçe Windows (Notepad'in eski varsayılanı)
  dosyalarında ş, ğ, ı, İ doğru görünür. Satır başındaki `1.`, `-`, `•` gibi liste işaretleri temizlenir.
- Tekrar eden cümleleri çıkarma, satırları noktalama işaretlerinden cümlelere bölme,
  Türkçe kurallarıyla BÜYÜK HARF, her turda karışık sıra.
- Yazı tipi, boyut, kalınlık, renk, arka plan rengi ve yazı görünürlüğü (şeffaflık).
  Dar ekranda yazı, kelimeler bölünmeyecek şekilde otomatik küçülür.
- Arka plana resim ya da video koyup üzerine akış bindirme (karartma ayarıyla).
- Ses: pembe / kahverengi gürültü, binaural vuruş (alfa 10 Hz, teta 6 Hz, delta 2,5 Hz; kulaklıkla),
  kendi ses dosyan, ve cümleleri tarayıcı sesiyle döngüde sesli okuma (hız ve ses düzeyi ayarlı).
- Oturum süresi (5–60 dk) ve sayaçlar: geçen/kalan süre, toplam gösterim, ölçülen cümle/sn.
- Akış sürerken ekranın kapanmasını engelleme (destekleyen tarayıcılarda).
- Tüm ayarlar ve metin tarayıcıda saklanır; sayfayı yeniden açınca kaldığın yerden devam eder.
- Kısayollar: `Boşluk` başlat/durdur, `F` tam ekran, `↑`/`↓` hızlandır/yavaşlat,
  `1` `2` `3` mod değiştir, `Esc` tam ekrandan çık.

## Uyarı

Hızlı yanıp sönen görüntüler ışığa duyarlı epilepsisi olan kişilerde nöbeti tetikleyebilir.
Uygulama ilk başlatmada bu konuda uyarır. Rahatsızlık hissedersen akışı durdur.

## Geliştirme

Derleme adımı yoktur; düz HTML, CSS ve JavaScript. `file://` ile açılabilmesi için ES modülleri
yerine klasik `<script>` dosyaları kullanılır.

```
index.html          arayüz
css/style.css       stiller
js/text.js          metin ayrıştırma, dosya kodlaması çözümü
js/speed.js         hız hesapları (slider, otomatik hız)
js/engine.js        canvas çizim motoru (akış, flaş, yağmur)
js/audio.js         gürültü, binaural, sesli okuma
js/app.js           arayüz bağlantıları
tests/              birim testleri ve uçtan uca test
examples/           örnek affirmasyon dosyası
```

```sh
npm test            # birim testleri (Node 18+)
npm run test:e2e    # Chromium'da uçtan uca test (Playwright gerekir)
npm start           # yerel sunucu: http://localhost:8080
```
