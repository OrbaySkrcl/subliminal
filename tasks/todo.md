# Subliminal Akış — Plan

## Görev anlayışı
- Metin kutusuna yazılan **veya** `.txt` dosyasından yüklenen affirmasyon cümleleri
  ekranda **yukarıdan aşağıya**, **sonsuz döngüde** akacak.
- Hız elle ayarlanabilir; en üst seviyede cümle başına **1 ekran karesi** (60 Hz'de ~17 ms)
  görünür → bilinçli olarak okunamaz.
- **Otomatik hız**: cümle sayısı + ortalama cümle uzunluğuna göre hız kendini ayarlar
  (liste uzadıkça hızlanır, uzun cümle daha uzun görünür; alt sınır 1 kare).
- Ekstra özellikler eklenebilir.

## Mimari kararlar
- Derleme adımı yok: düz HTML/CSS/JS. `index.html`'e çift tıklayınca (file://) çalışmalı
  → ES module **kullanılmıyor** (file:// altında CORS'a takılır); klasik script + UMD.
- Çizim `<canvas>` ile (DOM animasyonu bu hızlarda kare atlar).
- Saf mantık (`js/text.js`, `js/speed.js`) Node'da test edilebilir.

## Adımlar
- [x] Repo durumunu incele (boş repo, Node 22, Playwright + Chromium mevcut)
- [x] `js/text.js`: satır/cümle bölme, kırpma, tekrar silme, TR büyük harf,
      dosya kodlama çözümü (UTF-8 / UTF-16 BOM / Windows-1254 yedek)
- [x] `js/speed.js`: slider→görünme süresi (log ölçek), otomatik hız, okunabilirlik etiketi,
      döngü süresi / cümle-sn hesapları
- [x] `js/engine.js`: canvas motoru — Akış (çok şeritli), Flaş (merkez), Yağmur modları;
      kare atlamadan her cümlenin en az 1 karede çizilmesi garantisi; yenileme hızı ölçümü
- [x] `js/audio.js`: pembe/kahverengi gürültü, binaural (alfa/teta/delta), kendi ses dosyası
- [x] `js/app.js` + `index.html` + `css/style.css`: arayüz, dosya yükleme + sürükle-bırak,
      ayar kaydı (localStorage), tam ekran, kısayollar, oturum zamanlayıcı, sayaç,
      arka plan resim/video, ekran uyanık tutma, ışığa duyarlılık uyarısı
- [x] Birim testleri (`node --test`)
- [x] Playwright uçtan uca duman testi (file:// yükleme, dosya yükleme, 3 mod, max hız,
      konsol hatası yok) + ekran görüntüleri
- [x] README (Türkçe kullanım)
- [x] Commit + push → `claude/focused-wozniak-0m4qvd`

## Doğrulama
- `npm test` → birim testleri yeşil
- `npm run test:e2e` → gerçek Chromium'da sayfa açılır, akar, sayaç artar, hata yok

## Review / Results
- **Birim testleri**: `npm test` → 35/35 geçti (metin ayrıştırma, kodlama algılama, hız
  matematiği, motorun "hiçbir cümle tam görünmeden ekrandan çıkmaz" garantisi 3 modda,
  kare düşmesinde bile).
- **Uçtan uca**: `npm run test:e2e` → 13/13 adım geçti, gerçek Chromium'da file:// ile:
  UTF-8 ve windows-1254 dosya yükleme, uyarı penceresi, otomatik bilinçaltı hızı < 50 ms,
  manuel en yüksek hızda görünme = 1 kare ve ölçülen akış > 100 cümle/sn, klavye kısayolları,
  tam ekran, ayarların kalıcılığı, Temizle/Geri al, konsol hatası yok, 390 px telefonda yatay kaydırma yok.
- Ekran görüntüleriyle bulunan ve düzeltilen: telefonda 3 şeritte kelimelerin harf harf bölünmesi
  (motor artık en uzun kelime sığana kadar yazıyı küçültüyor), tek başına kalan "İndir" düğmesi,
  HUD'un alttaki metinle karışması.
- Tek dosyalık sürüm artifact olarak yayınlandı (gömülü çerçevede "İndir" → "Kopyala").
