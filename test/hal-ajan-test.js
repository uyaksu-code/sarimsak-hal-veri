/* hal-ajan.js senaryo testleri — geçici klasörlerde çalışır */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const AJAN = path.join(__dirname, "..", "ajan", "hal-ajan.js");
const TOHUM = path.join(__dirname, "..", "ajan", "hal-tohum.json");
const GERCEK = path.join(__dirname, "gercek-2026-09-27.json");
let gec = 0, kal = 0;
const ok = (k, m) => { if (k) { gec++; console.log("✓ " + m); } else { kal++; console.log("✗ " + m); } };
const klasor = (tohum = true) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "hal-")); if (tohum) fs.copyFileSync(TOHUM, path.join(d, "hal-tohum.json")); return d; };
const calis = (d, dosya, ...ek) => spawnSync("node", [AJAN, "--klasor", d, "--dosya", dosya, ...ek], { encoding: "utf8" });
const oku = (d, f) => JSON.parse(fs.readFileSync(path.join(d, f), "utf8"));
const yaz = (d, ad, items) => { const f = path.join(d, ad); fs.writeFileSync(f, JSON.stringify({ items })); return f; };
const kayit = (d, c, min, max, p = "sarimsak-kuru") => ({ recordedDate: d, minPrice: min, maxPrice: max, avgPrice: (min + max) / 2, avgPriceMethod: "midpoint", marketSlug: c.toLowerCase() + "-hal", cityName: c, productSlug: p });

/* 1 — gerçek veri (27.09): kaynaktaki kayıtlar uygulamadakinden eski → hiçbir il değişmez */
{
  const d = klasor(); const r = calis(d, GERCEK, "--bugun", "2026-09-27");
  ok(r.status === 0, "gerçek veri: çıkış 0");
  const h = oku(d, "hal-guncel.json"), t = JSON.parse(fs.readFileSync(TOHUM, "utf8"));
  ok(h.ajan.guncellenen.length === 0, "gerçek veri: eldeki 24.09 verisi daha yeni, hiçbir il güncellenmedi");
  ok(h.tarih === "24.09.2026" && h.ortalama === t.ortalama && h.ilSayisi === 16, `gerçek veri: ortalama korunur (${h.ortalama}, ${h.ilSayisi} il)`);
  ok(h.iller.find(x => x.il === "Manisa").ust === 200, "gerçek veri: Manisa 24.09 kaydı (200 TL) 12.09 kaydıyla ezilmedi");
  ok(h.ulusal.ort === 63.72 && h.ulusal.t === "26.09.2026", "gerçek veri: ulusal HKS 26.09 değeri korunur (HaldeFiyat'taki 82,9 TL 12.09 tarihli)");
  const js = fs.readFileSync(path.join(d, "hal-veri.js"), "utf8");
  ok(/^\/\*[\s\S]*window\.HAL_GUNCEL = \{/.test(js) && /HaldeFiyat/.test(js), "hal-veri.js window.HAL_GUNCEL ve kaynak satırı içerir");
  const csv = fs.readFileSync(path.join(d, "hal-gecmis.csv"), "utf8").trim().split("\n");
  ok(csv.length - 1 === 21 + 22, `CSV: 21 tohum + 22 geçerli (tekrarsız) kaynak satırı (${csv.length - 1}); ithal/soyulmuş yok`);
  ok(!/ithal|soyulmus/.test(csv.join("\n")), "CSV'de ithal ve soyulmuş sarımsak yok");
  ok(fs.existsSync(path.join(d, "rapor", "gunluk-2026-09-27.md")), "ilk çalışmada rapor yazıldı");
  /* aynı veriyle ikinci çalışma: CSV büyümez */
  calis(d, GERCEK, "--bugun", "2026-09-28");
  ok(fs.readFileSync(path.join(d, "hal-gecmis.csv"), "utf8").trim().split("\n").length === csv.length, "aynı veri ikinci kez: CSV tekrar yazmaz");
  ok(!fs.existsSync(path.join(d, "rapor", "gunluk-2026-09-28.md")), "değişiklik yoksa günlük rapor yazılmaz");
  ok(oku(d, "hal-guncel.json").ajan.kontrol === "28.09.2026", "kontrol tarihi her çalışmada güncellenir");
}

/* 2 — yeni veri (02.10): 6 il güncellenir, 7 günden eskiler "eski" olur */
{
  const d = klasor(); calis(d, GERCEK, "--bugun", "2026-09-27");
  const iller = [["Manisa", 60, 140], ["İzmir", 120, 170], ["Bursa", 50, 160], ["Konya", 70, 140], ["Ankara", 60, 120], ["İstanbul", 120, 140]];
  const f = yaz(d, "y.json", iller.map(([c, a, b]) => kayit("2026-10-02", c, a, b)));
  const r = calis(d, f, "--bugun", "2026-10-02");
  const h = oku(d, "hal-guncel.json");
  ok(r.status === 0 && h.tarih === "02.10.2026", "yeni veri: tarih 02.10.2026");
  ok(h.ajan.guncellenen.length === 6, "yeni veri: 6 il güncellendi");
  ok(h.iller.find(x => x.il === "Manisa").ust === 140, "Manisa yeni kayıtla güncellendi (140)");
  ok(h.iller.find(x => x.il === "Adana").kaynak === "eski", "Adana 24.09 kaydı (8 gün) → eski, ortalamaya girmez");
  ok(h.ilSayisi === 6, `güncel il sayısı 6 (${h.ilSayisi})`);
  const bekl = Math.round(iller.reduce((a, [, x, y]) => a + (x + y) / 2, 0) / 6 * 100) / 100;
  ok(h.ortalama === bekl, `ortalama yalnız güncel illerden: ${h.ortalama} = ${bekl}`);
  ok(h.min === 50 && h.max === 170, "alt–üst yalnız güncel illerden");
  ok(h.iller.find(x => x.il === "Elazığ").kaynak === "eski", "Elazığ 14.09 (18 gün) eski olarak listede kalır");
  ok(h.iller.slice(0, 6).every(x => !x.kaynak), "liste sırası: önce güncel iller");
  ok(h.degisimHal.hafta >= 3, `haftalık değişim CSV'den hesaplandı (${h.degisim.hafta}%, ${h.degisimHal.hafta} hal)`);
  ok(fs.readFileSync(path.join(d, "rapor", "gunluk-2026-10-02.md"), "utf8").includes("| Manisa | 60 | 140 |"), "rapor yeni satırı içerir");
}

/* 3 — bozuk / boş kaynak: dosyaların üzerine yazılmaz */
{
  const d = klasor(); calis(d, GERCEK, "--bugun", "2026-09-27");
  const once = fs.readFileSync(path.join(d, "hal-veri.js"), "utf8");
  const r1 = calis(d, yaz(d, "bos.json", []));
  ok(r1.status === 1 && fs.readFileSync(path.join(d, "hal-veri.js"), "utf8") === once, "boş kaynak: çıkış 1, hal-veri.js aynı");
  const r2 = calis(d, yaz(d, "bozuk.json", [{ recordedDate: "x", avgPrice: "abc" }, kayit("2026-10-02", "Bursa", 300, 100)]));
  ok(r2.status === 1 && fs.readFileSync(path.join(d, "hal-veri.js"), "utf8") === once, "geçersiz satırlar (tarih yok, alt>üst) elenir, dosya değişmez");
  ok(/HATA .*hal-veri\.js değiştirilmedi/.test(fs.readFileSync(path.join(d, "ajan-gunluk.log"), "utf8")), "hata günlüğe yazıldı");
  /* çok ileri tarihli tek il: diğerleri eskir, 3'ten az güncel il → yazılmaz */
  const r3 = calis(d, yaz(d, "tek.json", [kayit("2026-10-20", "Bursa", 80, 120)]));
  ok(r3.status === 1 && fs.readFileSync(path.join(d, "hal-veri.js"), "utf8") === once, "tek il çok ileri tarihli: 3'ten az güncel il → yazılmaz");
}

/* 4 — sıçrama: %40'tan fazla oynarsa şüpheli */
{
  const d = klasor(); calis(d, GERCEK, "--bugun", "2026-09-27");
  const f = yaz(d, "s.json", ["Manisa", "İzmir", "Bursa", "Konya"].map(c => kayit("2026-09-26", c, 300, 400)));
  calis(d, f);
  const h = oku(d, "hal-guncel.json");
  ok(h.ajan.supheli === true, `ortalama ${h.ortalama} TL → şüpheli işaretlendi`);
}

/* 5 — tohumsuz ilk çalışma ve haftalık kip */
{
  const d = klasor(false);
  const r = calis(d, GERCEK, "--haftalik", "--bugun", "2026-09-27");
  const h = oku(d, "hal-guncel.json");
  ok(r.status === 0 && h.tarih === "18.09.2026", `tohumsuz: kaynaktaki en yeni tarih (${h.tarih})`);
  ok(h.iller.find(x => x.il === "Ankara").t === "18.09.2026", "tohumsuz: Ankara'da API'nin 18.09 kaydı sayfanın 12.09 kaydını yener");
  ok(h.iller.find(x => x.il === "Kütahya").kaynak === "eski", "tohumsuz: Kütahya 08.09 (10 gün) eski");
  ok(h.ulusal && h.ulusal.ort === 82.9, "tohumsuz: ulusal ortalama 82,9");
  ok(h.ajan.tur === "haftalik" && fs.existsSync(path.join(d, "rapor", "haftalik-2026-09-27.md")), "haftalık rapor yazıldı");
}

/* 6 — toplayici.js sözdizimi: tarayıcıda üst düzey await ile çalışır */
{
  const src = fs.readFileSync(path.join(__dirname, "..", "ajan", "toplayici.js"), "utf8");
  let hata = null; try { new (Object.getPrototypeOf(async function () {}).constructor)(src.replace(/\n(JSON\.stringify\(\{[^\n]+\);)\s*$/, "\nreturn $1")); } catch (e) { hata = e; }
  ok(!hata, "toplayici.js async gövde olarak derlenir" + (hata ? ": " + hata.message : ""));
  ok(/const GUN = 400;/.test(src), "toplayici.js GUN satırı haftalıkta değiştirilebilir");
}
process.on("exit", () => { console.log(`\n${gec} geçti, ${kal} kaldı`); if (kal) process.exitCode = 1; });

/* 7 — v1.2: hal.gov.tr bülteni (ulusal ortalama + hacim), çoklu dosya */
{
  const HG = path.join(__dirname, "halgov-2026-09-27.json");
  const d = klasor();
  const r = calis(d, GERCEK + "," + HG, "--bugun", "2026-09-27");
  const h = oku(d, "hal-guncel.json");
  ok(r.status === 0, "iki dosya birlikte: çıkış 0");
  ok(h.ulusal.ort === 63.72 && h.ulusal.t === "26.09.2026", `ulusal hal.gov.tr 26.09 değeri (${h.ulusal.ort})`);
  ok(h.ulusal.hacimKg === 155204 && h.ulusal.iyiTarim.ort === 115.33 && h.ulusal.taze.ort === 43.14, "hacim, iyi tarım ve taze ayrı tutuldu");
  ok(h.ulusal.kaynak === "hal.gov.tr (HKS)", "ulusal kaynak etiketi");
  ok(h.ortalama === 114.26 && h.ilSayisi === 16, "ulusal güncelleme il ortalamasını değiştirmez");
  ok(!/iyi-tarim|taze/.test(h.iller.map(x => x.il).join()), "iyi tarım/taze il listesine karışmadı");
  ok(/işlem hacmi 155\.204 kg/.test(fs.readFileSync(path.join(d, "rapor", "gunluk-2026-09-27.md"), "utf8")), "rapor hacmi gösterir");
  /* yalnız ulusal yenilendiğinde de rapor yazılır */
  const hg2 = JSON.parse(fs.readFileSync(HG, "utf8")); hg2.veriTarihi = "03.10.2026"; hg2.satirlar[0].ort = 60;
  const f2 = path.join(d, "hg2.json"); fs.writeFileSync(f2, JSON.stringify(hg2));
  calis(d, f2, "--bugun", "2026-10-04");
  const h2 = oku(d, "hal-guncel.json");
  ok(h2.ulusal.ort === 60 && fs.existsSync(path.join(d, "rapor", "gunluk-2026-10-04.md")), "yalnız ulusal yenilenince rapor yazıldı");
  ok(h2.ulusal.haftalik && h2.ulusal.haftalik.karsi === "26.09.2026" && h2.ulusal.haftalik.yuzde === -5.8, `ulusal haftalık değişim ${JSON.stringify(h2.ulusal.haftalik)}`);
  /* bir dosya yok: diğeriyle devam, hata günlükte */
  const r3 = calis(d, path.join(d, "yok.json") + "," + GERCEK, "--bugun", "2026-10-05");
  ok(r3.status === 0 && /kaynak hatası: yok\.json: dosya yok/.test(fs.readFileSync(path.join(d, "ajan-gunluk.log"), "utf8")), "eksik dosya atlandı, günlüğe yazıldı");
  /* sayfa yapısı değişmiş: boş halgov → tek başına verilirse yazılmaz */
  const bos = path.join(d, "bos-hg.json"); fs.writeFileSync(bos, JSON.stringify({ kaynak: "halgov", veriTarihi: null, hatalar: ["gvFiyatlar tablosu yok"], satirlar: [] }));
  const once = fs.readFileSync(path.join(d, "hal-veri.js"), "utf8");
  const r4 = calis(d, bos);
  ok(r4.status === 1 && fs.readFileSync(path.join(d, "hal-veri.js"), "utf8") === once, "boş hal.gov.tr çıktısı: dosyalar değişmez");
}

/* 8 — toplayici-halgov.js: iki adımlı çalışma, sözdizimi */
{
  const src = fs.readFileSync(path.join(__dirname, "..", "ajan", "toplayici-halgov.js"), "utf8");
  let hata = null; try { new (Object.getPrototypeOf(async function () {}).constructor)(src); } catch (e) { hata = e; }
  ok(!hata, "toplayici-halgov.js derlenir" + (hata ? ": " + hata.message : ""));
  ok(/window\.__halgov = "bekliyor"/.test(src) && /"başladı";\s*$/.test(src), "arka planda çalışır, sonucu window.__halgov'a yazar");
  ok(/istek sınırı \(12\)/.test(src), "hal.gov.tr'ye en çok 12 istek");
}
