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

---

# İterasyon 2 — ms/süre ayarları + her uygulamanın üstünde flaş (masaüstü)

## Görev anlayışı
- **ms / süre**: görünme süresi ms olarak elle girilir; flaşlar arası **aralık** (ms), **seri**
  (art arda kaç cümle), **rastgelelik**; oturum süresi dakika olarak serbest girilir.
- **Ekran üstü (overlay)**: oyun/film/tarayıcı ne açıksa üstünde flaş. Tarayıcı başka pencerelerin
  üstüne çizemez → **Electron masaüstü uygulaması**: şeffaf, tıklamayı geçiren, hep üstte pencere.
- **Doğruluk**: monitör kare kare çizer (60 Hz = 16,7 ms adım). İstenen ms en yakın tam kareye
  yuvarlanır, **gerçek süre gösterilir**, her flaş rAF zaman damgalarıyla **ölçülür** ve sapma raporlanır.

## Mimari kararlar
- Flaş zamanlayıcısı motorda yeniden yazılır: süre **zaman tabanlı + yarım kare toleransı**
  (kare düşse bile süre uzamaz), görünme süresi kareye oturtulur, aralık bitişten itibaren ölçülür.
- Masaüstü kontrol penceresi = mevcut `index.html` (preload köprüsüyle "Ekran üstü" bölümü açılır).
  Overlay penceresi = `overlay.html` + aynı motor. Ayar kaynağı tek: kontrol penceresi.
- Chromium arka plan kısıtlamaları kapatılır (odaksız overlay'de rAF/timer yavaşlamasın).
- Üstte kalma her 1,5 sn yeniden uygulanır (bazı uygulamalar "en üst"ü çalar).

## Adımlar
- [x] `speed.js`: `snap(ms, frame)` → {kare, gerçek ms}
- [x] `engine.js`: yeni flaş zamanlayıcısı (aralık, seri, rastgelelik, konum), ölçüm istatistikleri,
      kontur (yazı çevresi), önizlemesiz mod (overlay için), devam ettirmede sahte ölçüm olmaması
- [x] Web arayüzü: ms giriş kutusu + kare kısayolları + "gerçek süre" notu, flaş zamanlaması alanları,
      ölçülen süre HUD'da, kontur, oturum süresi dakika girişi
- [x] Masaüstü: `desktop/main.js` (overlay pencereleri, ekran seçimi, kısayol Ctrl+Alt+S, tepsi,
      açılışta başlat, kayıtta gizle), `desktop/preload.js`, `desktop/overlay-preload.js`,
      `overlay.html`, `js/overlay.js`, `js/desktop.js` (kontrol bölümü)
- [x] Paketleme: electron-builder (Windows kurulum + taşınabilir, macOS, Linux), simge,
      GitHub Actions ile otomatik derleme
- [x] Testler: zamanlayıcı birim testleri; overlay.html'in Chromium'da şeffaflık + ölçüm testi;
      Electron'u Xvfb altında gerçekten açıp overlay penceresini ve ölçülen süreleri doğrulama
- [x] README, artifact güncelle, commit + push, CI'yi kontrol et

## Doğrulama
- `npm test`, `npm run test:e2e`, `npm run test:desktop` (Xvfb + Electron)

## Review / Results (iterasyon 2)
- **Birim**: 46/46 (`npm test`). Yeni: 60 Hz ve 144 Hz'de her ms değeri için flaşın tam kare
  sayısı kadar kaldığı ve ölçülen sürenin beklenenle birebir tuttuğu; aralık, seri, rastgelelik;
  kare düşmesi (ortada düşen süreyi uzatmaz, sonda düşen en fazla 1 kare uzatır ve "geç" sayılır);
  duraklat/devam et sahte ölçüm üretmez; çalışırken ms değişince eski flaş ölçüme karışmaz.
- **Tarayıcı e2e**: 16/16. 59,9 Hz'de 3 kare → ölçülen 49,96 ms (49,9–50,0), 500 ms aralık → 500,0 ms.
- **Masaüstü e2e (gerçek Electron, Xvfb)**: 10/10. Overlay penceresi şeffaf, her zaman üstte,
  odak almaz, ekranı kaplar; 50 ms → ölçülen 50,00 ms (49,9–50,1), geç 0/8; canlı ms değişimi;
  durdurma; oturum süresi dolunca kapanma; kısayol kaydı; ayarların kalıcılığı; konsol hatası yok.
- **Paketleme**: Windows taşınabilir .exe Linux'ta derlendi (109 MB, PE32). Kurulum (NSIS) Linux'ta
  Wine istediği için Windows/macOS/Linux paketleri GitHub Actions'ta derleniyor.
- Ekran görüntüleriyle bulunan ve düzeltilen: masaüstü genişliğinde sayfanın kendisinin kayması
  (gizli dosya kutuları panelden taşıyordu), ölçüm kutularında satır taşması.
