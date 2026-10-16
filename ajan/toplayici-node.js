#!/usr/bin/env node
/*!
 * HAL AJANI · BULUT TOPLAYICI  ·  toplayici-node.js  ·  v2.0.0
 * Tarayıcıdaki toplayici.js ve toplayici-halgov.js'in sunucu (Node 22) karşılığı.
 * Aynı ham biçimi yazar; hal-ajan.js bunları --dosya ile işler.
 *
 *   node ajan/toplayici-node.js --cikti ham [--gun 400] [--bugun YYYY-AA-GG]
 *
 *   ham/YYYY-AA-GG.json         HaldeFiyat: resmî API + devralınan kayıt sayfası
 *   ham/YYYY-AA-GG-halgov.json  hal.gov.tr (HKS) Türkiye geneli bülten
 *
 * Son satırda "DOSYALAR=a,b" yazar (yalnız başarıyla yazılanlar).
 * Çıkış kodu: en az bir kaynak alındıysa 0, hiçbiri alınamadıysa 2.
 * İstek sayısı: HaldeFiyat 2, hal.gov.tr en çok 16, genelde 8–11 (istekler arası 400 ms).
 * Test için kaynak adresleri HALDEFIYAT_KOK ve HALGOV_URL ortam değişkenleriyle değiştirilebilir.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { parseHTML } = require("linkedom");

const SURUM = "2.0.0";
const UA = `sarimsak-app-hal-ajani/${SURUM} (+https://github.com; gunde 1-2 istek)`;
const HD = process.env.HALDEFIYAT_KOK || "https://haldefiyat.com";
const HG = process.env.HALGOV_URL || "https://www.hal.gov.tr/Sayfalar/FiyatDetaylari.aspx";

const arg = process.argv.slice(2);
const al = k => { const i = arg.indexOf(k); return i >= 0 ? arg[i + 1] : null; };
const CIKTI = path.resolve(al("--cikti") || "ham");
const GUN = Math.max(7, Math.min(1095, +(al("--gun") || 400)));
const istanbulBugun = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const BUGUN = al("--bugun") || istanbulBugun();

const bekle = ms => new Promise(r => setTimeout(r, ms));
async function getir(url, secenek = {}, ms = 45000) {
  const k = new AbortController(), zt = setTimeout(() => k.abort(), ms);
  try {
    const r = await fetch(url, { ...secenek, headers: { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9", ...(secenek.headers || {}) }, signal: k.signal, redirect: "follow" });
    return r;
  } finally { clearTimeout(zt); }
}
/* tekrar dene: ağ hatası ya da 5xx/429'da 2 kez daha */
async function dene(fn, ad) {
  let son;
  for (let i = 0; i < 3; i++) {
    try { return await fn(); } catch (e) { son = e; if (/HTTP 4(?!29)\d\d/.test(e.message)) break; await bekle(4000 * (i + 1)); }
  }
  throw new Error(`${ad}: ${son && son.message}`);
}
const sayi = s => { const m = String(s || "").replace(/\s|TL/g, "").replace(/\./g, "").replace(",", "."); const n = parseFloat(m); return isFinite(n) ? n : null; };
const hucreler = tr => [...tr.children].filter(c => /^(TD|TH)$/i.test(c.tagName));

/* ── 1) HaldeFiyat ─────────────────────────────────────────────────────── */
async function haldefiyat() {
  const items = [], hatalar = []; let attribution = "";
  try {
    await dene(async () => {
      const r = await getir(`${HD}/api/v1/prices/history/sarimsak-kuru?range=${GUN}d`, { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json(); attribution = j.attribution || "";
      if (!Array.isArray(j.items)) throw new Error("beklenmeyen yanıt (items yok)");
      for (const x of j.items) items.push({ recordedDate: String(x.recordedDate).slice(0, 10), minPrice: x.minPrice, maxPrice: x.maxPrice,
        avgPrice: x.avgPrice, avgPriceMethod: x.avgPriceMethod, marketSlug: x.marketSlug, cityName: x.cityName, productSlug: x.productSlug, kanal: "api" });
    }, "api");
  } catch (e) { hatalar.push(e.message); }
  try {
    await bekle(1000);
    await dene(async () => {
      const r = await getir(`${HD}/fiyat/istanbul/sarimsak-kuru`, { headers: { Accept: "text/html" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const { document: d } = parseHTML(await r.text());
      for (const tr of d.querySelectorAll("table tbody tr")) {
        const td = hucreler(tr); if (td.length < 6) continue;
        const u = td[0].querySelector('a[href^="/urun/"]'), h = td[1].querySelector('a[href^="/hal/"]'), t = td[2].querySelector("time");
        const tarih = t && (t.getAttribute("datetime") || t.getAttribute("dateTime"));
        if (!u || !h || !tarih) continue;
        const urun = u.getAttribute("href").split("/").pop();
        if (!/^sarimsak/.test(urun)) continue;
        const halAdi = h.textContent.trim();
        const il = /ulusal/i.test(halAdi) ? "Türkiye" : halAdi.split(/\s+/)[0];
        const ilk = c => c.childNodes[0] && c.childNodes[0].textContent;
        items.push({ recordedDate: tarih.slice(0, 10), minPrice: sayi(ilk(td[3])), maxPrice: sayi(ilk(td[5])), avgPrice: sayi(ilk(td[4])),
          avgPriceMethod: /yayımlanan/i.test(td[4].textContent) ? "reported" : "midpoint", marketSlug: h.getAttribute("href").split("/").pop(),
          cityName: il, productSlug: urun, kanal: "sayfa" });
      }
    }, "sayfa");
  } catch (e) { hatalar.push(e.message); }
  return { toplandi: new Date().toISOString(), toplayici: "node " + SURUM, gun: GUN, attribution, hatalar, items };
}

/* ── 2) hal.gov.tr (ASP.NET GridView sayfalama) ────────────────────────── */
class Cerez {
  constructor() { this.m = new Map(); }
  al(r) { const s = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : []; for (const c of s) { const [kv] = c.split(";"); const i = kv.indexOf("="); if (i > 0) this.m.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); } }
  baslik() { return [...this.m].map(([k, v]) => `${k}=${v}`).join("; "); }
}
function formAlanlari(form) {
  const fd = new URLSearchParams();
  for (const e of form.querySelectorAll("input, select, textarea")) {
    const ad = e.getAttribute("name"); if (!ad) continue;
    const tag = e.tagName.toUpperCase(), tip = (e.getAttribute("type") || "text").toLowerCase();
    if (tag === "INPUT" && ["submit", "button", "image", "file", "reset"].includes(tip)) continue;
    if (tag === "INPUT" && (tip === "radio" || tip === "checkbox") && !e.hasAttribute("checked")) continue;
    if (tag === "SELECT") { const o = e.querySelector("option[selected]") || e.querySelector("option"); fd.append(ad, o ? (o.getAttribute("value") ?? o.textContent) : ""); continue; }
    if (tag === "TEXTAREA") { fd.append(ad, e.textContent); continue; }
    fd.append(ad, e.getAttribute("value") ?? (tip === "radio" || tip === "checkbox" ? "on" : ""));
  }
  return fd;
}
async function halgov() {
  const hatalar = [], HEDEF = "SARIMSAK", cmp = (a, b) => a.localeCompare(b, "tr");
  const cerez = new Cerez(); let istek = 0;
  const grid = d => d.querySelector("table[id$='_gvFiyatlar']");
  const satirlar = t => {
    if (!t) return [];
    const trs = [...t.children].flatMap(c => /^TBODY$/i.test(c.tagName) ? [...c.children] : [c]).filter(c => /^TR$/i.test(c.tagName));
    return trs.map(tr => hucreler(tr).map(c => c.textContent.replace(/\s+/g, " ").trim())).filter(x => x.length === 6 && x[0] !== "Ürün Adı");
  };
  const gorunen = d => [...d.querySelectorAll('a[href*="gvFiyatlar"]')].map(a => +((a.getAttribute("href").match(/Page\$(\d+)/) || [])[1])).filter(Boolean);
  const durum = (html, n) => { const { document: d } = parseHTML(html); return { n, d, form: d.querySelector("form"), rows: satirlar(grid(d)), sayfalar: gorunen(d) }; };
  const iste = async (yontem, govde) => {
    if (++istek > 16) throw new Error("istek sınırı (16) aşıldı");
    if (istek > 1) await bekle(400);
    const r = await getir(HG, { method: yontem, body: govde, headers: { Cookie: cerez.baslik(), ...(govde ? { "Content-Type": "application/x-www-form-urlencoded", Referer: HG, Origin: new URL(HG).origin } : {}), Accept: "text/html" } }, 60000);
    cerez.al(r);
    if (!r.ok) throw new Error("hal.gov.tr HTTP " + r.status);
    return await r.text();
  };
  let st, hedefAd = null, bulten = null, veriTarihi = null;
  const bulunan = [];
  try {
    st = durum(await iste("GET"), 1);
    if (!grid(st.d)) throw new Error("gvFiyatlar tablosu yok — sayfa yapısı değişmiş ya da erişim engellendi");
    const bag = st.d.querySelector('a[href*="gvFiyatlar"]');
    hedefAd = bag && (bag.getAttribute("href").match(/'([^']+)'/) || [])[1];
    if (!hedefAd) throw new Error("sayfalama bağlantısı bulunamadı");
    const metin = st.d.body ? st.d.body.textContent.replace(/\s+/g, " ") : "";
    const b = metin.match(/Bülten Tarihi\s*:\s*(\d\d\.\d\d\.\d{4})\s*\((\d\d\.\d\d\.\d{4}) Tarihli/) || [];
    bulten = b[1] || null; veriTarihi = b[2] || null;
    const git = async (s, n) => {
      if (!s.form) throw new Error("form yok");
      const fd = formAlanlari(s.form); fd.set("__EVENTTARGET", hedefAd); fd.set("__EVENTARGUMENT", "Page$" + n);
      return durum(await iste("POST", fd.toString()), n);
    };
    /* hedef sayfaya yaklaş: görünen sayfalarda ikili arama (tarayıcı sürümüyle aynı) */
    while (st.rows.length && cmp(st.rows.at(-1)[0], HEDEF) < 0) {
      const aday = st.sayfalar.filter(p => p > st.n).sort((a, b) => a - b);
      if (!aday.length) break;
      let lo = 0, hi = aday.length - 1, ileri = null;
      while (lo <= hi) {
        const m = (lo + hi) >> 1, s = await git(st, aday[m]);
        if (s.rows.length && cmp(s.rows[0][0], HEDEF) <= 0) { ileri = s; lo = m + 1; } else hi = m - 1;
      }
      if (!ileri) break;
      st = ileri;
    }
    for (let k = 0; k < 3; k++) {
      bulunan.push(...st.rows.filter(x => x[0].startsWith(HEDEF)));
      if (!st.rows.length || !st.rows.at(-1)[0].startsWith(HEDEF) && cmp(st.rows.at(-1)[0], HEDEF) > 0) break;
      st = await git(st, st.n + 1);
    }
  } catch (e) { hatalar.push(e.name === "AbortError" ? "hal.gov.tr zaman aşımı" : e.message); }
  const tekil = [...new Map(bulunan.map(x => [x.join("|"), x])).values()];
  return { kaynak: "halgov", toplandi: new Date().toISOString(), toplayici: "node " + SURUM, bulten, veriTarihi, istek, hatalar,
    satirlar: tekil.map(x => ({ urun: x[0], cins: x[1], tur: x[2], ort: sayi(x[3]), hacim: sayi(x[4]), birim: x[5] })) };
}

(async () => {
  fs.mkdirSync(CIKTI, { recursive: true });
  const ek = GUN >= 1000 ? "-haftalik" : "";
  /* Bir kaynak alınamazsa, diğeri alındıysa onun dosyası hata bilgisiyle yine yazılır:
     hal-ajan.js hatayı günlüğe "kaynak hatası" olarak geçirir. İkisi de yoksa hiçbir şey yazılmaz. */
  const [hd, hg] = await Promise.all([haldefiyat(), halgov()]);
  const hdVar = hd.items.length > 0, hgVar = hg.satirlar.length > 0 && !!hg.veriTarihi;
  const yazilan = [];
  if (hdVar || hgVar) {
    const f1 = path.join(CIKTI, `${BUGUN}${ek}.json`), f2 = path.join(CIKTI, `${BUGUN}-halgov.json`);
    if (hdVar || hd.hatalar.length) { fs.writeFileSync(f1, JSON.stringify(hd)); yazilan.push(f1); }
    if (hgVar || hg.hatalar.length) { fs.writeFileSync(f2, JSON.stringify(hg)); yazilan.push(f2); }
  }
  console.log(`HaldeFiyat: ${hd.items.length} kayıt${hd.hatalar.length ? " · hata: " + hd.hatalar.join(" / ") : ""}`);
  console.log(`hal.gov.tr: ${hg.satirlar.length} satır · bülten ${hg.bulten || "—"} · veri ${hg.veriTarihi || "—"} · ${hg.istek} istek${hg.hatalar.length ? " · hata: " + hg.hatalar.join(" / ") : ""}`);
  console.log("DOSYALAR=" + yazilan.map(f => path.relative(process.cwd(), f)).join(","));
  process.exitCode = hdVar || hgVar ? 0 : 2;
})();
