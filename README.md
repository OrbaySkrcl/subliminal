# Eşikaltı Akış

Affirmasyon cümlelerini ekranda **akıtan** ya da **flaş** olarak gösteren uygulama. İki şekilde çalışır:

- **Tarayıcıda**: `index.html` dosyasına çift tıkla. Kurulum gerekmez. Cümleler uygulamanın kendi
  sahnesinde akar veya yanıp söner.
- **Masaüstü uygulaması** (Windows, macOS, Linux): aynı arayüz, artı **Ekran üstü**. Oyun, film,
  tarayıcı, ne açıksa onun **üstünde** flaş gösterir. Pencere şeffaftır, tıklamaları alttaki programa
  geçirir ve her zaman en üstte kalır.

## Süre ayarları (ms) ve doğruluğu

| Ayar | Anlamı |
| --- | --- |
| **Görünme süresi** (ms) | Bir cümlenin ekranda kaldığı süre |
| **Aralık** (ms) | Bir flaştan (veya seriden) sonra ekranın boş kaldığı süre. 0 = arka arkaya |
| **Seri** (cümle) | Her flaşta art arda gösterilen cümle sayısı |
| **Rastgelelik** (%) | Aralığın her seferinde ± bu oranda değişmesi (ör. 3000 ms ±%20 → 2400–3600 ms) |
| **Oturum süresi** (dk) | Bu süre dolunca akış kendiliğinden durur. 0 = sınırsız |

**Ekran kare kare çizilir.** 60 Hz bir monitör görüntüyü saniyede 60 kez, yani 16,7 ms'de bir
yeniler. Bir yazı bu yüzden ancak 16,7 ms'nin katları kadar görünebilir: 16,7 · 33,3 · 50 · 66,7 ms…
144 Hz monitörde adım 6,9 ms'dir. Hiçbir yazılım bunun arasındaki bir süreyi gösteremez.
Eşikaltı bunu gizlemez:

- Yazdığın ms en yakın tam kareye oturtulur ve **ekranda gerçekten kalacağı süre** yazılır:
  *"İstenen 40 ms → ekranda 33,3 ms (2 kare)"*. Kare kısayolları (1, 2, 3, 4, 6, 12 kare) tam değerleri tek tıkla seçer.
- Ekranın yenileme hızı açılışta **ölçülür**, hesap ona göre yapılır.
- Her flaşın gerçek süresi ekranın kare zaman damgalarıyla **ölçülür**. "Ölçülen" kutusunda son 60
  flaşın ortalaması, en kısası, en uzunu ve geç kalanların sayısı görünür.
- Bitiş, kare sayarak değil zaman damgasıyla belirlenir. Böylece arada bir kare düşse bile süre uzamaz.
  Düşen kare tam bitiş anına denk gelirse yazı en fazla bir kare geç kalkar ve bu "geç kalan" olarak sayılır.

Test ortamındaki ölçümler (60 Hz): 50 ms istendi → **ölçülen 50,0 ms (49,9–50,1)**, 300 ms aralık →
**ölçülen 297,6 ms (plan 295,3, rastgelelik açık)**, geç kalan 0.

## Masaüstü uygulaması

### İndirme

Her güncellemede GitHub Actions Windows, macOS ve Linux paketlerini otomatik derler:

1. Depoda **Actions → Masaüstü derlemesi** sekmesine gir, en son başarılı çalışmayı aç.
2. Sayfanın altındaki **Artifacts** bölümünden sistemine uygun paketi indir:
   - **Windows**: `Esikalti-Kurulum-….exe` (kurulum) ya da `Esikalti-Tasinabilir-….exe` (kurmadan çalışır)
   - **macOS**: `Esikalti-….dmg`
   - **Linux**: `Esikalti-….AppImage`

`v1.1.0` gibi bir sürüm etiketi gönderildiğinde paketler **Releases** sayfasına da eklenir.

Paketler imzasız olduğu için ilk açılışta uyarı çıkabilir:
Windows'ta *"Ek bilgi → Yine de çalıştır"*, macOS'ta uygulamaya sağ tıklayıp *"Aç"*.

### Kullanım

1. Cümlelerini yaz ya da `.txt` yükle (tarayıcı sürümüyle aynı).
2. **Ekran üstü** bölümünde süreleri ayarla. Önerilen başlangıç: görünme 33 ms, aralık 3000 ms, rastgelelik %20, konum rastgele.
3. **Ekran üstünde başlat**'a bas ya da her yerden **Ctrl+Alt+S** (macOS: Cmd+Option+S) kısayolunu kullan.
4. Oyununa veya filmine geç. Flaşlar her şeyin üstünde görünür. Fare ve klavye normal çalışmaya devam eder.

Ek özellikler:

- **Ekran seçimi**: tüm ekranlar ya da tek bir monitör.
- **Kontur**: yazının çevresine çizgi çeker, değişken oyun ve video görüntüsü üstünde okunurluk sağlar.
- **Ekran kaydında ve yayında gizle**: flaşlar sende görünür, ama OBS, Discord ve ekran görüntülerinde
  görünmez (Windows 10 2004+ ve macOS).
- **Sistem tepsisi**: ekran üstü çalışırken pencereyi kapatınca uygulama tepsiye iner. Tepsi menüsünden
  başlat/durdur yapabilir ya da çıkabilirsin.
- **Bilgisayar açılınca başlat** ve **uygulama açılınca ekran üstünü başlat**.
- Ayarlar çalışırken anında uygulanır, durdurup yeniden başlatmak gerekmez.

**Oyunlar hakkında:** Oyunun görüntü ayarını **Kenarlıksız pencere / Borderless** yap. "Özel tam ekran"
(exclusive fullscreen) modunda oyun ekranı tamamen kendisi yönetir. O modda Discord ya da Steam
dahil hiçbir programın penceresi oyunun üstüne çıkamaz. Filmler, YouTube, tarayıcı ve kenarlıksız
pencere modundaki oyunlar sorunsuzdur.

## Tarayıcı sürümü

1. **Cümleler**: Metin kutusuna her satıra bir affirmasyon yaz, ya da `.txt yükle` ile dosyanı seç
   (sürükle-bırak da olur). UTF-8, UTF-16 ve Türkçe Windows kodlaması otomatik algılanır.
   Satır başındaki `1.`, `-`, `•` gibi işaretler temizlenir.
2. **Hız**: *Otomatik* (Okunabilir / Hızlı / Bilinçaltı) seçersen cümle sayısına ve uzunluğuna göre
   hız kendiliğinden ayarlanır. *Manuel*de kaydırıcıyı kullan ya da ms yaz.
3. **Mod**: *Akış* (şeritler halinde yukarıdan aşağı), *Flaş* (tek tek, konum seçilebilir),
   *Yağmur* (rastgele boyut ve konumda düşen cümleler).
4. **Başlat**: sahneye tıkla ya da `Boşluk`. `F` tam ekran.

Otomatik hız tablosu:

| Seviye | Cümle başı süre | Tam tur sınırı |
| --- | --- | --- |
| Okunabilir | karakter × 70 ms (1,8–8 sn) | yok |
| Hızlı | karakter × 9 ms (160 ms–1,2 sn) | 45 sn |
| Bilinçaltı | karakter × 0,6 ms (en fazla 50 ms) | 3 sn |

Diğer özellikler:

- Yazı tipi, boyut, renk, kontur, görünürlük ve arka plan rengi; arkaya resim ya da video koyabilirsin.
- Pembe/kahverengi gürültü, binaural sesler (alfa, teta, delta), kendi ses dosyan, cümlelerin sesli okunması.
- Sayaçlar, ekranın kapanmasını engelleme, ayarların kalıcılığı.
- Kısayollar: `Boşluk` başlat/durdur, `F` tam ekran, `↑`/`↓` hız, `1` `2` `3` mod, `Esc` tam ekrandan çık.

## Uyarı

Hızlı yanıp sönen görüntüler ışığa duyarlı epilepsisi olan kişilerde nöbeti tetikleyebilir.
Uygulama ilk başlatmada bu konuda uyarır. Rahatsızlık hissedersen akışı durdur.

## Geliştirme

Tarayıcı sürümünün derleme adımı yoktur. `file://` ile açılabilmesi için ES modülleri yerine klasik
`<script>` dosyaları kullanılır. Masaüstü sürümü aynı dosyaları Electron ile paketler.

```
index.html            arayüz (tarayıcı + masaüstü kontrol penceresi)
overlay.html          ekran üstü penceresi (şeffaf)
css/style.css         stiller
js/text.js            metin ayrıştırma, dosya kodlaması
js/speed.js           hız hesapları, kareye oturtma
js/engine.js          canvas motoru: akış, flaş zamanlayıcısı ve ölçümü, yağmur
js/audio.js           gürültü, binaural, sesli okuma
js/app.js             arayüz bağlantıları
js/desktop.js         "Ekran üstü" bölümü (masaüstü)
js/overlay.js         ekran üstü penceresinin betiği
desktop/main.js       Electron ana süreç: overlay pencereleri, kısayol, tepsi
desktop/preload.js    kontrol penceresi köprüsü
desktop/overlay-preload.js
tests/                birim, tarayıcı ve masaüstü testleri
```

```sh
npm install           # bağımlılıklar
npm run desktop       # masaüstü uygulamasını geliştirme modunda aç
npm test              # birim testleri
npm run test:e2e      # tarayıcı uçtan uca testi (Chromium)
npm run test:desktop  # masaüstü uçtan uca testi (Electron, Linux'ta Xvfb)
npm run dist:win      # Windows paketi (dist/)
```
