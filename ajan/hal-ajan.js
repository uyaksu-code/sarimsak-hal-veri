#!/usr/bin/env node
/*!
 * ═══════════════════════════════════════════════════════════════════════════
 *  HAL FİYATI AJANI  ·  hal-ajan.js  ·  v1.3.0
 *  Kuru sarımsak hal fiyatlarını işler, Sarımsak app'in Piyasa ekranının
 *  kullandığı HAL verisini üretir, geçmişi biriktirir.
 * ───────────────────────────────────────────────────────────────────────────
 *  Kaynak: HaldeFiyat (haldefiyat.com) — belediye hal müdürlüklerinin kayıtları.
 *  API ücretsiz, anahtarsız; dakikada 60 istek sınırı; kaynak gösterimi zorunlu.
 *  Site Eylül 2026'da ikiye ayrıldı:
 *    · API (/api/v1/prices/history/sarimsak-kuru) → yeni belediye akışı (az il)
 *    · ürün sayfası tabloları → devralınan çok illi kayıtlar
 *  toplayici.js ikisini de haldefiyat.com sekmesinde okur ve tek JSON verir.
 *  v1.2: toplayici-halgov.js resmî Hal Kayıt Sistemi bülteninden (hal.gov.tr)
 *  Türkiye geneli sarımsak ortalamasını ve işlem hacmini okur (il kırılımı yok).
 *  Birden çok dosya virgülle verilir:  --dosya ham/G.json,ham/G-halgov.json
 *  Bir dosya yoksa ya da bozuksa atlanır; diğerleriyle devam edilir.
 *
 *  Kullanım:
 *    node hal-ajan.js --dosya ham/2026-09-27.json            → günlük işleme
 *    node hal-ajan.js --dosya ham/2026-09-27.json --haftalik → + 3 yıl değişim, haftalık rapor
 *    node hal-ajan.js                                          → ağdan yalnız API (sayfa okunmaz)
 *    --klasor K   çıktı klasörü (varsayılan: betiğin klasörü)
 *    --bugun T    test için "bugün" (YYYY-AA-GG)
 *
 *  Birleştirme kuralı — "daha güncel veriyi bozma":
 *    Her il için önceki çalışmadaki (ilk çalışmada hal-tohum.json'daki) kayıt ile
 *    yeni kayıt karşılaştırılır; TARİHİ DAHA YENİ olan kalır. Yeni veri eskiyse
 *    hiçbir şey değişmez. En yeni kayda göre 7 günden eski iller "eski" işaretlenir
 *    (uygulamada ortalamaya ve nakliyeye girmez), 30 günden eskiler listeden çıkar.
 *
 *  Yazdığı dosyalar:
 *    hal-veri.js       → window.HAL_GUNCEL = {...}  (uygulama bunu okur)
 *    hal-guncel.json   → aynı veri
 *    hal-veri.json     → aynı veri, tek satır (v1.3: uygulama uzaktan bunu okur; GitHub Pages)
 *    hal-gecmis.csv    → her gün/hal/ürün bir satır (birikir; değişim buradan hesaplanır)
 *    rapor/gunluk-YYYY-AA-GG.md, rapor/haftalik-YYYY-AA-GG.md
 *    ajan-gunluk.log
 *
 *  Güvenlik: kayıt yoksa ya da birleştirme sonrası 3'ten az güncel il kalırsa
 *  hiçbir dosyanın üzerine yazılmaz. Ortalama %40'tan fazla oynarsa "supheli".
 *  Lisans: MIT
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";
const fs = require("fs");
const path = require("path");

const SURUM = "1.3.0";
const API = "https://haldefiyat.com/api/v1/prices/history/sarimsak-kuru";
const URUNLER = ["sarimsak-kuru", "sarimsak", "sarimsak-yerli"];   /* ithal, soyulmuş, yeşil ayrı ürün */
const ONCELIK = { "sarimsak-kuru": 0, "sarimsak": 1, "sarimsak-yerli": 2 };
const YORESEL = { "sarimsak-kastamonu": "Kastamonu sarımsağı", "sarimsak-taskopru": "Taşköprü sarımsağı" };
const GUNCEL_GUN = 7, SIL_GUN = 30, EN_AZ_IL = 3;

const arg = process.argv.slice(2);
const al = k => { const i = arg.indexOf(k); return i >= 0 ? arg[i + 1] : null; };
const HAFTALIK = arg.includes("--haftalik");
const DOSYA = al("--dosya");
const KLASOR = al("--klasor") ? path.resolve(al("--klasor")) : __dirname;
const BUGUN = al("--bugun");
const TUR = HAFTALIK ? "haftalik" : "gunluk";

const yol = (...p) => path.join(KLASOR, ...p);
const logYaz = m => { const s = `${new Date().toISOString()}  ${m}\n`; fs.appendFileSync(yol("ajan-gunluk.log"), s); process.stdout.write(s); };
const gunFark = (a, b) => Math.round((new Date(a + "T12:00:00Z") - new Date(b + "T12:00:00Z")) / 864e5);
const trTarih = iso => iso.split("-").reverse().join(".");
const isoTarih = tr => tr.split(".").reverse().join("-");
const yuvarla = (n, k = 2) => Math.round(n * 10 ** k) / 10 ** k;
const sayi = v => { const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; };

async function veriAl() {
  if (DOSYA) {
    const items = [], hatalar = [];
    for (const f of DOSYA.split(",").map(x => x.trim()).filter(Boolean)) {
      let j; try { j = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { hatalar.push(`${path.basename(f)}: ${e.code === "ENOENT" ? "dosya yok" : "okunamadı"}`); continue; }
      if (j && j.kaynak === "halgov") items.push(...halgovKayitlari(j));
      else items.push(...((j && j.items) || []));
      if (j && Array.isArray(j.hatalar)) hatalar.push(...j.hatalar.map(h => `${path.basename(f)}: ${h}`));
    }
    return { items, hatalar };
  }
  const url = `${API}?range=${HAFTALIK ? "1095d" : "400d"}`;
  const kontrol = new AbortController(); const zt = setTimeout(() => kontrol.abort(), 60000);
  try {
    const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": `sarimsak-app-hal-ajani/${SURUM}` }, signal: kontrol.signal });
    if (!r.ok) throw new Error(`HaldeFiyat HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(zt); }
}

/* hal.gov.tr bülten satırları → ortak kayıt biçimi. Türkiye geneli; il yok. */
function halgovKayitlari(j) {
  const d = j.veriTarihi && /^\d\d\.\d\d\.\d{4}$/.test(j.veriTarihi) ? isoTarih(j.veriTarihi) : null;
  if (!d) return [];
  return (j.satirlar || []).filter(x => /^SARIMSAK/.test(x.urun) && x.birim === "Kg").map(x => {
    const kuru = /KURU/.test(x.urun), taze = /TAZE/.test(x.urun);
    const p = taze ? "sarimsak-taze" : kuru && /Geleneksel/i.test(x.tur) ? "sarimsak-kuru" : kuru && /İyi Tarım/i.test(x.tur) ? "sarimsak-kuru-iyi-tarim"
      : kuru && /Organik/i.test(x.tur) ? "sarimsak-kuru-organik" : null;
    return p && { recordedDate: d, avgPrice: x.ort, avgPriceMethod: "hks-agirlikli", marketSlug: "hal-gov-tr", cityName: "Türkiye", productSlug: p, hacim: x.hacim };
  }).filter(Boolean);
}

/* Ham kayıt → iç biçim; geçersizleri at, aynı gün/hal/ürün tekrarlarını birleştir */
function ayikla(ham) {
  const gor = new Set(), out = [];
  for (const x of (ham && ham.items) || []) {
    const r = { d: String(x.recordedDate || "").slice(0, 10), min: sayi(x.minPrice), max: sayi(x.maxPrice), avg: sayi(x.avgPrice),
      m: String(x.marketSlug || ""), c: String(x.cityName || ""), p: String(x.productSlug || ""), yon: x.avgPriceMethod || "",
      hacim: sayi(x.hacim) };
    if (!/^\d{4}-\d\d-\d\d$/.test(r.d) || !r.c || !r.p || !(r.avg > 0) || r.avg > 5000) continue;
    if (r.c !== "Türkiye" && !(r.min > 0 && r.max >= r.min)) continue;
    const k = r.d + "|" + r.m + "|" + r.p; if (gor.has(k)) continue;
    gor.add(k); out.push(r);
  }
  return out;
}

function csvOku() {
  const f = yol("hal-gecmis.csv"); if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").split("\n").slice(1).filter(Boolean).map(l => {
    const [d, c, m, p, min, max, avg, yon] = l.split(";");
    return { d, c, m, p, min: +min, max: +max, avg: +avg, yon };
  }).filter(x => x.avg > 0);
}
function csvEkle(satirlar) {
  const f = yol("hal-gecmis.csv");
  if (!fs.existsSync(f)) fs.writeFileSync(f, "tarih;il;hal;urun;min;max;ort;yontem\n");
  const var_ = new Set(csvOku().map(x => x.d + "|" + x.m + "|" + x.p));
  const yeni = satirlar.filter(x => !var_.has(x.d + "|" + x.m + "|" + x.p)).sort((a, b) => a.d < b.d ? -1 : 1);
  if (yeni.length) fs.appendFileSync(f, yeni.map(x => [x.d, x.c, x.m, x.p, x.min, x.max, x.avg, x.yon].join(";")).join("\n") + "\n");
  return yeni.length;
}

/* Önceki HAL'in illeri CSV'ye "derleme" satırı olarak girer — değişim hesabı ilk günden çalışsın */
const tohumSatirlari = h => h.iller.map(x => ({ d: isoTarih(x.t), c: x.il, m: "derleme-" + x.il,
  p: x.n === "Yerli" ? "sarimsak-yerli" : "sarimsak-kuru", min: x.alt, max: x.ust, avg: x.ort, yon: "derleme" }));

function birlestir(yeni, onceki, havuz) {
  const it = yeni.filter(x => URUNLER.includes(x.p) && x.c !== "Türkiye");
  /* il başına en yeni yeni kayıt */
  const taze = {};
  for (const x of it) { const s = taze[x.c]; if (!s || x.d > s.d || (x.d === s.d && ONCELIK[x.p] < ONCELIK[s.p])) taze[x.c] = x; }
  /* önceki illerle karşılaştır: tarihi yeni olan kalır */
  const secim = {}; const guncellenen = [];
  for (const x of (onceki ? onceki.iller : [])) secim[x.il] = { il: x.il, ust: x.ust, alt: x.alt, ort: x.ort, d: isoTarih(x.t), n: x.n || "", yeni: false };
  for (const [c, x] of Object.entries(taze)) {
    const e = secim[c];
    if (e && e.d >= x.d) continue;   /* eldeki kayıt aynı gün ya da daha yeni → dokunma */
    secim[c] = { il: c, ust: x.max, alt: x.min, ort: yuvarla(x.avg), d: x.d, n: x.p === "sarimsak-yerli" ? "Yerli" : "", yeni: true };
    guncellenen.push(c);
  }
  const hepsi = Object.values(secim);
  if (!hepsi.length) throw new Error("hiç il kaydı yok");
  const son = hepsi.reduce((a, x) => x.d > a ? x.d : a, "");
  const gun = d => gunFark(son, d);
  const iller = hepsi.filter(x => gun(x.d) <= SIL_GUN).map(x => {
    const o = { il: x.il, ust: x.ust, alt: x.alt, ort: x.ort, t: trTarih(x.d), n: x.n };
    if (gun(x.d) > GUNCEL_GUN) o.kaynak = "eski";
    return o;
  }).sort((a, b) => (a.kaynak ? 1 : 0) - (b.kaynak ? 1 : 0) || b.ust - a.ust);
  const guncel = iller.filter(x => !x.kaynak);
  if (guncel.length < EN_AZ_IL) throw new Error(`birleştirme sonrası yalnız ${guncel.length} güncel il (en az ${EN_AZ_IL})`);
  const ortalama = yuvarla(guncel.reduce((a, x) => a + x.ort, 0) / guncel.length);

  /* değişim: aynı il+ürünün son 7 günü ile k gün önceki pencere (havuz = CSV + yeni) */
  const pz = {}; havuz.filter(x => URUNLER.includes(x.p) && x.c !== "Türkiye").forEach(x => (pz[x.c + "|" + x.p] = pz[x.c + "|" + x.p] || []).push(x));
  const pencere = (r, bas, g) => { const v = r.filter(x => { const q = gun(x.d); return q >= bas && q < bas + g; }); return v.length ? v.reduce((a, x) => a + x.avg, 0) / v.length : null; };
  const degis = (k, g) => { let s0 = 0, s1 = 0, n = 0; for (const r of Object.values(pz)) { const a = pencere(r, 0, 7), b = pencere(r, k, g); if (a != null && b != null) { s0 += a; s1 += b; n++; } } return n >= 3 ? { yuzde: yuvarla((s0 / s1 - 1) * 100, 1), hal: n } : null; };
  const D = { hafta: degis(7, 7), ay: degis(30, 7), yil: degis(365, 14), ucYil: HAFTALIK ? degis(1088, 14) : null };
  const eD = (onceki && onceki.degisim) || {}, eH = (onceki && onceki.degisimHal) || {};
  const degisim = {}, degisimHal = {};
  for (const k of ["hafta", "ay", "yil", "ucYil"]) { degisim[k] = D[k] ? D[k].yuzde : (eD[k] ?? 0); degisimHal[k] = D[k] ? D[k].hal : (eH[k] ?? 0); }

  /* ulusal ortalama ve yöresel partiler — yalnız daha yeniyse */
  /* ulusal: hal.gov.tr kaydı aynı gün haldefiyat kopyasından önce gelir */
  const ulS = p => yeni.filter(x => x.c === "Türkiye" && x.p === p).sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : (a.m === "hal-gov-tr" ? -1 : 1))[0];
  const ul = ulS("sarimsak-kuru");
  const eUl = onceki && onceki.ulusal;
  let ulusal = eUl || null;
  if (ul && (!eUl || ul.d > isoTarih(eUl.t))) {
    ulusal = { ort: yuvarla(ul.avg), t: trTarih(ul.d) };
    if (ul.hacim) ulusal.hacimKg = ul.hacim;
    const it2 = ulS("sarimsak-kuru-iyi-tarim"); if (it2 && it2.d === ul.d) ulusal.iyiTarim = { ort: yuvarla(it2.avg), hacimKg: it2.hacim || null };
    const tz = ulS("sarimsak-taze"); if (tz && tz.d === ul.d) ulusal.taze = { ort: yuvarla(tz.avg), hacimKg: tz.hacim || null };
    ulusal.kaynak = ul.m === "hal-gov-tr" ? "hal.gov.tr (HKS)" : "hal.gov.tr (HaldeFiyat üzerinden)";
  }
  /* ulusal haftalık değişim: CSV'deki hal.gov.tr serisinden, 7 gün önceki en yakın kayıt */
  if (ulusal) {
    const seri = havuz.filter(x => x.c === "Türkiye" && x.p === "sarimsak-kuru").sort((a, b) => a.d < b.d ? -1 : 1);
    const t0 = isoTarih(ulusal.t), once = seri.filter(x => { const g = gunFark(t0, x.d); return g >= 6 && g <= 10; }).pop();
    if (once) ulusal.haftalik = { yuzde: yuvarla((ulusal.ort / once.avg - 1) * 100, 1), karsi: trTarih(once.d) };
  }
  const yoresel = Object.keys(YORESEL).map(p => {
    const r = yeni.filter(x => x.p === p).sort((a, b) => a.d < b.d ? 1 : -1)[0];
    const e = ((onceki && onceki.yoresel) || []).find(y => y.ad === YORESEL[p]);
    if (r && (!e || r.d > isoTarih(e.t))) return { ad: YORESEL[p], hal: r.c, alt: r.min, ust: r.max, t: trTarih(r.d) };
    return e || null;
  }).filter(Boolean);

  return { h: { tarih: trTarih(son), ortalama,
    min: Math.min(...guncel.map(x => x.alt)), max: Math.max(...guncel.map(x => x.ust)), ilSayisi: guncel.length,
    kaynak: "HaldeFiyat · belediye hal müdürlükleri",
    degisim, degisimHal, ulusal, yoresel, iller }, guncellenen };
}

function rapor(h, onceki, supheli, guncellenen) {
  const sat = [`# Sarımsak hal fiyatları — ${h.ajan.tur === "haftalik" ? "haftalık" : "günlük"} rapor`, "",
    `Veri tarihi: **${h.tarih}** · ${h.ilSayisi} güncel il · kaynak: HaldeFiyat — belediye hal müdürlükleri`, "",
    `- Güncellenen iller: ${guncellenen.length ? guncellenen.join(", ") : "yok (kaynaktaki kayıtlar eldekinden eski)"}`,
    `- Hal ortalaması: **${h.ortalama.toFixed(2)} TL/kg** (aralık ${h.min}–${h.max} TL)` +
      (onceki ? ` · önceki ${onceki.ortalama.toFixed(2)} TL/kg (${h.ortalama >= onceki.ortalama ? "+" : ""}${(h.ortalama - onceki.ortalama).toFixed(2)})` : ""),
    `- 1 hafta %${h.degisim.hafta} (${h.degisimHal.hafta} hal) · 1 ay %${h.degisim.ay} (${h.degisimHal.ay} hal) · 1 yıl %${h.degisim.yil} (${h.degisimHal.yil} hal)` +
      (h.ajan.tur === "haftalik" ? ` · 3 yıl %${h.degisim.ucYil} (${h.degisimHal.ucYil} hal)` : ""),
    h.ulusal ? `- hal.gov.tr ulusal ortalaması (kuru, konvansiyonel): ${h.ulusal.ort} TL/kg (${h.ulusal.t})` +
      (h.ulusal.hacimKg ? ` · işlem hacmi ${h.ulusal.hacimKg.toLocaleString("tr-TR")} kg` : "") +
      (h.ulusal.haftalik ? ` · 1 hafta %${h.ulusal.haftalik.yuzde} (${h.ulusal.haftalik.karsi}'e göre)` : "") +
      (h.ulusal.iyiTarim ? ` · iyi tarım ${h.ulusal.iyiTarim.ort} TL/kg` : "") + (h.ulusal.taze ? ` · taze ${h.ulusal.taze.ort} TL/kg` : "") +
      " — işlem kayıtlarından ağırlıklı ortalama; hal listesi ortalamasıyla aynı yöntem değil" : "",
    supheli ? `\n> ⚠️ Ortalama önceki çalışmaya göre %40'tan fazla oynadı. Veri yazıldı ama kaynağı kontrol et.` : "",
    "", "| İl | Alt | Üst | Ort. | Tarih | |", "|---|---:|---:|---:|---|---|",
    ...h.iller.map(x => `| ${x.il}${x.n ? " (" + x.n + ")" : ""} | ${x.alt} | ${x.ust} | ${x.ort} | ${x.t} | ${x.kaynak === "eski" ? "eski — ortalamaya girmez" : guncellenen.includes(x.il) ? "yeni" : ""} |`),
    "", h.yoresel.length ? "Yöresel partiler: " + h.yoresel.map(y => `${y.ad} — ${y.hal} halinde ${y.alt}–${y.ust} TL (${y.t})`).join("; ") : "",
    "", "Toptan hal fiyatıdır; perakende ya da tarlada alım fiyatı değildir. Ortalama, kaynak yalnız alt–üst verdiğinde aralığın orta noktasıdır."];
  return sat.join("\n") + "\n";
}

(async () => {
  fs.mkdirSync(yol("rapor"), { recursive: true });
  let onceki = null, tohum = false;
  try { onceki = JSON.parse(fs.readFileSync(yol("hal-guncel.json"), "utf8")); }
  catch (e) { try { onceki = JSON.parse(fs.readFileSync(yol("hal-tohum.json"), "utf8")); tohum = true; } catch (e2) { /* ilk çalışma, tohum yok */ } }
  try {
    const ham = await veriAl();
    const yeni = ayikla(ham);
    if (!yeni.length) throw new Error("kaynakta geçerli kayıt yok" + (ham && ham.hatalar && ham.hatalar.length ? " (" + ham.hatalar.join("; ") + ")" : ""));
    if (tohum) csvEkle(tohumSatirlari(onceki));
    const havuz = csvOku().concat(yeni);
    const { h, guncellenen } = birlestir(yeni, onceki, havuz);
    const eklenen = csvEkle(yeni.filter(x => URUNLER.includes(x.p) || x.c === "Türkiye"));
    const ulusalYeni = !!(h.ulusal && (!onceki || !onceki.ulusal || h.ulusal.t !== onceki.ulusal.t));
    const bugun = BUGUN || new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
    h.ajan = { surum: SURUM, calisma: new Date().toISOString(), kontrol: trTarih(bugun), tur: TUR, kayitSayisi: yeni.length, guncellenen };
    const supheli = !!(onceki && !tohum && Math.abs(h.ortalama / onceki.ortalama - 1) > 0.4);
    if (supheli) h.ajan.supheli = true;
    const degisti = tohum || !onceki || guncellenen.length > 0 || ulusalYeni || HAFTALIK;
    if (ham.hatalar && ham.hatalar.length) h.ajan.kaynakHatalari = ham.hatalar;
    /* "kontrol" tarihi her çalışmada güncellenir — uygulama verinin en son ne zaman denetlendiğini gösterir */
    fs.writeFileSync(yol("hal-guncel.json"), JSON.stringify(h, null, 1));
    fs.writeFileSync(yol("hal-veri.json"), JSON.stringify(h));
    fs.writeFileSync(yol("hal-veri.js"),
      `/* Hal fiyatı ajanı v${SURUM} — ${h.ajan.calisma}. Elle düzenleme; ajan her çalışmada üzerine yazar.\n` +
      `   Kaynak: HaldeFiyat (haldefiyat.com) — belediye hal müdürlüklerinin yayımladığı listeler. */\n` +
      `window.HAL_GUNCEL = ${JSON.stringify(h)};\n`);
    let rf = "";
    if (degisti) { rf = yol("rapor", `${TUR}-${bugun}.md`); fs.writeFileSync(rf, rapor(h, tohum ? null : onceki, supheli, guncellenen)); }
    logYaz(`TAMAM ${TUR} · veri ${h.tarih} · ${h.ilSayisi} güncel il · ort ${h.ortalama} TL/kg · güncellenen: ${guncellenen.length ? guncellenen.join(",") : "yok"}${ulusalYeni ? ` · ulusal ${h.ulusal.ort} (${h.ulusal.t})` : ""} · csv +${eklenen}${ham.hatalar && ham.hatalar.length ? " · kaynak hatası: " + ham.hatalar.join(" / ") : ""}${supheli ? " · ŞÜPHELİ" : ""}`);
    if (rf) process.stdout.write(`RAPOR ${rf}\n`);
  } catch (e) {
    logYaz(`HATA ${TUR} · ${e.message} · hal-veri.js değiştirilmedi`);
    process.exitCode = 1;
  }
})();
