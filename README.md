# Sarımsak hal fiyatı ajanı (bulut)

Kuru sarımsak toptan hal fiyatlarını **her gün iki kez** toplar, işler ve GitHub Pages'te yayınlar.
Sarımsak App'in Piyasa ekranı bu yayını okur. Bilgisayarın açık olması gerekmez.

```
GitHub Actions (10:10 ve 18:10, İstanbul)
  ├─ ajan/toplayici-node.js   HaldeFiyat API + devralınan sayfa, hal.gov.tr bülteni → ham/GÜN.json
  ├─ ajan/hal-ajan.js         birleştir, eskit, değişim hesapla, doğrula           → docs/hal-veri.json
  └─ git commit + push        GitHub Pages docs/ klasörünü yayınlar
                                   ↓
https://<kullanıcı>.github.io/sarimsak-hal-veri/hal-veri.json  ←  uygulama açılışta ve her 3 saatte okur
```

## Kurulum (bir kez)

1. GitHub'da **herkese açık** yeni depo: `sarimsak-hal-veri`. Bu klasörün içeriğini yükle. `.github` klasörü dahil.
2. **Settings › Pages:** Source = *Deploy from a branch*, Branch = `main`, klasör = `/docs` › Save.
3. **Settings › Actions › General › Workflow permissions:** *Read and write permissions* › Save.
4. **Actions** sekmesi › *Hal fiyatı ajanı* › **Run workflow**. Yaklaşık 1 dakikada biter.
5. `https://<kullanıcı>.github.io/sarimsak-hal-veri/` adresini aç. Fiyat tablosu görünmeli.
6. Uygulamada `halVeriUrl` bu adres + `hal-veri.json` olmalı. Mobil projede `yapilandirma.json` dosyasına yazılır.

## Çalışma

| | |
|---|---|
| Günlük | 10:10 ve 18:10 (İstanbul). HaldeFiyat gün içinde, hal.gov.tr bir önceki günün bültenini sabah yayınlar |
| Haftalık | Pazar 18:10. 3 yıllık geçmiş, `docs/rapor/haftalik-*.md` |
| Kaynak isteği | HaldeFiyat 2 istek, hal.gov.tr 8–11 istek (400 ms arayla). İki kaynak da ücretsiz ve herkese açık |
| Bir kaynak alınamazsa | Diğeriyle güncellenir. Günlükte "kaynak hatası" görünür, iş uyarı verir |
| İkisi de alınamazsa | `hal-veri.json` değişmez, uygulama son geçerli veriyi gösterir. İş **başarısız** görünür; GitHub sana e-posta atar |
| Şüpheli veri | Ortalama %40'tan fazla oynarsa yazılır ama `ajan.supheli` işaretlenir |
| 3'ten az güncel il | Hiçbir dosyanın üzerine yazılmaz |

GitHub, 60 gün hiç değişiklik olmayan depolarda zamanlanmış işleri durdurur. Ajan her çalışmada günlüğe satır
eklediği için depo hep etkin kalır.

## Dosyalar

| Dosya | Ne |
|---|---|
| `docs/hal-veri.json` | Uygulamanın okuduğu veri (doğrulanmış, tek satır) |
| `docs/hal-guncel.json` | Aynı veri, okunaklı. Bir sonraki çalışmada "eldeki veri" budur |
| `docs/hal-gecmis.csv` | Her gün, hal ve ürün için bir satır. Değişim yüzdeleri buradan hesaplanır |
| `docs/ajan-gunluk.log` | Her çalışmanın sonucu |
| `docs/rapor/` | Günlük ve haftalık raporlar |
| `docs/index.html` | Durum sayfası |
| `ham/` | Kaynaklardan gelen ham yanıtlar |
| `ajan/toplayici.js`, `ajan/toplayici-halgov.js` | Tarayıcı toplayıcıları (yedek; elle çalıştırma için) |

## Elle çalıştırma ve test

```bash
npm ci
npm run topla              # ham/GÜN.json, ham/GÜN-halgov.json
node ajan/hal-ajan.js --klasor docs --dosya ham/GÜN.json,ham/GÜN-halgov.json
npm test                   # ajan 49 kontrol + bulut toplayıcı 24 kontrol (taklit sunucuyla, ağ gerekmez)
```

## Kaynak ve kullanım

- **HaldeFiyat** (haldefiyat.com): belediye hal müdürlüklerinin yayımladığı listeler. API ücretsiz, anahtarsız,
  dakikada 60 istek. Kaynak gösterimi zorunludur; uygulamada ve durum sayfasında yazar.
- **hal.gov.tr:** T.C. Ticaret Bakanlığı Hal Kayıt Sistemi bülteni. Türkiye geneli ortalama ve işlem hacmi; il kırılımı yoktur.
- Toptan hal fiyatıdır; perakende ya da tarlada alım fiyatı değildir.
- Lisans: MIT.
