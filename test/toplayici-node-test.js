/* Bulut toplayıcı testi: HaldeFiyat ve hal.gov.tr'yi taklit eden yerel sunucu.
   hal.gov.tr taklidi: alfabetik GridView, sayfa başına 25 satır, 10'luk sayfa blokları ("..." bağlantıları),
   oturum çerezi ve __VIEWSTATE zorunlu. Ardından hal-ajan.js çıktısı uygulamanın doğrulayıcısından geçirilir. */
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const KOK = path.join(__dirname, "..");
let gecti = 0, kaldi = 0;
const ok = (k, m) => { if (k) { gecti++; console.log("✓ " + m); } else { kaldi++; console.log("✗ " + m); } };

const hamHd = JSON.parse(fs.readFileSync(path.join(KOK, "ham", "2026-10-16.json"), "utf8"));
const API = { items: hamHd.items.filter(x => x.kanal === "api").map(x => ({ ...x, recordedDate: x.recordedDate + "T00:00:00.000Z" })), meta: {}, attribution: "HalDeFiyat test" };
const SAYFA = `<!doctype html><html><body><table class="data-table archive-price-table"><thead><tr><th>Ürün</th><th>Hal</th><th>Tarih</th><th>En düşük</th><th>Ort</th><th>En yüksek</th></tr></thead><tbody>
<tr data-provenance="true"><th scope="row"><a href="/urun/sarimsak-kuru">Sarımsak (Kuru)</a><small> · TL/<!-- -->kg</small></th><td><a href="/hal/istanbul-hal-ibb">İstanbul Bayrampaşa Toptancı Hali (İBB)</a><small data-source="true">İstanbul</small></td><td><time data-observed-date="true" dateTime="2026-09-11">11.09.2026</time></td><td>121,00 TL</td><td>136,00 TL<small>Hesaplanan orta değer</small></td><td>151,00 TL</td></tr>
</tbody></table></body></html>`;

/* hal.gov.tr ürün listesi */
const harf = "ABCÇDEFGHIİJKLMNOÖPRSŞTUÜVYZ";
const urunler = [];
for (const h of harf) for (let i = 0; i < 14; i++) urunler.push([`${h}ÜRÜN ${String(i).padStart(2, "0")}`, "X", "Geleneksel(Konvansiyonel)", "10,00", "100", "Kg"]);
const SAR = [["SARIMSAK KURU", "SARIMSAK KURU", "Geleneksel(Konvansiyonel)", "67,73", "107771", "Kg"],
  ["SARIMSAK KURU", "SARIMSAK KURU", "İyi Tarım", "104,96", "6123", "Kg"],
  ["SARIMSAK TAZE", "SARIMSAK TAZE", "Geleneksel(Konvansiyonel)", "19,49", "35385", "Kg"]];
function liste(kaydir) {
  const l = urunler.concat(SAR).sort((a, b) => a[0].localeCompare(b[0], "tr") || 0);
  /* kaydir: sarımsak satırlarının sayfa sınırına denk gelmesi için başa dolgu */
  return Array.from({ length: kaydir }, (_, i) => [`AA DOLGU ${i}`, "X", "G", "1,00", "1", "Kg"]).concat(l);
}
function halgovSayfa(n, L) {
  const S = 25, top = Math.ceil(L.length / S), rows = L.slice((n - 1) * S, n * S);
  const blok = Math.floor((n - 1) / 10) * 10, pg = [];
  const bag = (p, m) => `<td><a href="javascript:__doPostBack('ctl00$ctl37$g_x$gvFiyatlar','Page$${p}')">${m}</a></td>`;
  if (blok > 0) pg.push(bag(blok, "..."));
  for (let p = blok + 1; p <= Math.min(blok + 10, top); p++) pg.push(p === n ? `<td><span>${p}</span></td>` : bag(p, p));
  if (blok + 10 < top) pg.push(bag(blok + 11, "..."));
  return `<!doctype html><html><body><form method="post" action="/Sayfalar/FiyatDetaylari.aspx" id="aspnetForm">
<input type="hidden" name="__EVENTTARGET" value=""><input type="hidden" name="__EVENTARGUMENT" value="">
<input type="hidden" name="__VIEWSTATE" value="VS${n}"><input type="hidden" name="__EVENTVALIDATION" value="EV">
<input type="text" name="ctl00$ctl37$g_x$dateControl$dateControlDate" value="16.10.2026">
<input type="submit" name="ctl00$ctl37$g_x$btnGet" value="Getir">
<input type="radio" name="ctl00$ctl37$g_x$rblExcelOptions" value="1" checked><input type="radio" name="ctl00$ctl37$g_x$rblExcelOptions" value="2">
<div>Bülten Tarihi : 16.10.2026
 (15.10.2026 Tarihli Veriler Kullanılmıştır.)</div>
<table id="ctl00_ctl37_g_x_gvFiyatlar"><tbody><tr><th scope="col">Ürün Adı</th><th>Ürün Cinsi</th><th>Ürün Türü</th><th>Ortalama Fiyat</th><th>İşlem Hacmi</th><th>Birim Adı</th></tr>
${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="numalignright"><span>${r[3]}</span></td><td><span>${r[4]}</span></td><td>${r[5]}</td></tr>`).join("\n")}
<tr><td colspan="6"><table><tbody><tr>${pg.join("")}</tr></tbody></table></td></tr></tbody></table></form></body></html>`;
}

function sunucu(o) {
  const say = { api: 0, sayfa: 0, halgov: 0, hata: [] };
  const L = liste(o.kaydir || 0);
  const s = http.createServer((q, r) => {
    let govde = ""; q.on("data", c => govde += c); q.on("end", () => {
      const u = new URL(q.url, "http://x");
      if (u.pathname === "/api/v1/prices/history/sarimsak-kuru") {
        say.api++;
        if (o.apiYok || (o.apiGecici && say.api === 1)) { r.writeHead(503); return r.end("yok"); }
        r.writeHead(200, { "Content-Type": "application/json" }); return r.end(JSON.stringify(API));
      }
      if (u.pathname === "/fiyat/istanbul/sarimsak-kuru") { say.sayfa++; if (o.apiYok) { r.writeHead(503); return r.end(); } r.writeHead(200, { "Content-Type": "text/html" }); return r.end(SAYFA); }
      if (u.pathname === "/Sayfalar/FiyatDetaylari.aspx") {
        say.halgov++;
        if (o.halgovYok) { r.writeHead(403); return r.end("Forbidden"); }
        if (q.method === "GET") { r.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": ["ASP.NET_SessionId=abc123; path=/; HttpOnly", "WSS=1; path=/"] }); return r.end(halgovSayfa(1, L)); }
        const f = new URLSearchParams(govde);
        if (!/ASP\.NET_SessionId=abc123/.test(q.headers.cookie || "")) say.hata.push("çerez yok");
        if (!/^VS\d+$/.test(f.get("__VIEWSTATE") || "")) say.hata.push("viewstate yok");
        if (f.get("ctl00$ctl37$g_x$rblExcelOptions") !== "1") say.hata.push("radyo yanlış");
        if (f.has("ctl00$ctl37$g_x$btnGet")) say.hata.push("submit düğmesi gönderildi");
        const n = +((f.get("__EVENTARGUMENT") || "").match(/Page\$(\d+)/) || [])[1];
        if (!n) { r.writeHead(500); return r.end(); }
        r.writeHead(200, { "Content-Type": "text/html" }); return r.end(halgovSayfa(n, L));
      }
      r.writeHead(404); r.end();
    });
  });
  return new Promise(res => s.listen(0, "127.0.0.1", () => res({ s, say, port: s.address().port })));
}

function calistir(port, cikti, ek = []) {
  return spawnAsync(process.execPath, [path.join(KOK, "ajan", "toplayici-node.js"), "--cikti", cikti, "--bugun", "2026-10-16", ...ek],
    { encoding: "utf8", cwd: path.dirname(cikti), env: { ...process.env, HALDEFIYAT_KOK: `http://127.0.0.1:${port}`, HALGOV_URL: `http://127.0.0.1:${port}/Sayfalar/FiyatDetaylari.aspx` }, timeout: 120000 });
}
function spawnAsync(cmd, args, o) {
  return new Promise(res => { const c = require("child_process").spawn(cmd, args, o); let out = "", err = "";
    c.stdout.on("data", d => out += d); c.stderr.on("data", d => err += d);
    const zt = setTimeout(() => c.kill(), o.timeout || 120000);
    c.on("close", st => { clearTimeout(zt); res({ status: st, stdout: out, stderr: err }); }); });
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "haln-"));

/* uygulamanın doğrulayıcısı (halGecerli) — uygulama dosyasından alınır */
function uygulamaDogrulayici() {
  const yol = process.env.UYGULAMA_HTML;
  if (!yol || !fs.existsSync(yol)) return null;
  const h = fs.readFileSync(yol, "utf8");
  const a = h.indexOf("function halGecerli(g){"), b = h.indexOf("\nfunction halUlusalKopya", a);
  return new Function(h.slice(a, b) + "; return halGecerli;")();
}

module.exports = { sunucu };
if (require.main === module) (async () => {
  /* 1. normal */
  { const { s, say, port } = await sunucu({}); const d = tmp(), c = path.join(d, "ham");
    const r = await calistir(port, c); s.close();
    ok(r.status === 0, "normal: çıkış 0");
    const hd = JSON.parse(fs.readFileSync(path.join(c, "2026-10-16.json"), "utf8"));
    ok(hd.items.filter(x => x.kanal === "api").length === API.items.length, `API kayıtları: ${hd.items.length}`);
    ok(hd.items.every(x => /^\d{4}-\d\d-\d\d$/.test(x.recordedDate)), "tarih YYYY-AA-GG'ye kısaltıldı");
    const sy = hd.items.find(x => x.kanal === "sayfa");
    ok(sy && sy.cityName === "İstanbul" && sy.avgPrice === 136 && sy.minPrice === 121 && sy.maxPrice === 151 && sy.recordedDate === "2026-09-11" && sy.avgPriceMethod === "midpoint",
      "devralınan sayfa satırı (th hücreli) okundu: " + JSON.stringify(sy && [sy.cityName, sy.minPrice, sy.avgPrice, sy.maxPrice]));
    const hg = JSON.parse(fs.readFileSync(path.join(c, "2026-10-16-halgov.json"), "utf8"));
    ok(hg.bulten === "16.10.2026" && hg.veriTarihi === "15.10.2026", "bülten ve veri tarihi");
    ok(hg.satirlar.length === 3 && hg.satirlar[0].ort === 67.73 && hg.satirlar[0].hacim === 107771, "üç sarımsak satırı, sayılar doğru");
    ok(hg.istek <= 16 && say.halgov <= 16, `hal.gov.tr istek sayısı ${say.halgov}`);
    ok(!say.hata.length, "çerez, viewstate, radyo gönderildi; submit gönderilmedi " + say.hata.slice(0, 3).join(","));
    ok(/DOSYALAR=ham\/2026-10-16\.json,ham\/2026-10-16-halgov\.json/.test(r.stdout), "DOSYALAR satırı");
    /* hal-ajan ile işle */
    const k = path.join(d, "docs"); fs.mkdirSync(k);
    for (const f of ["hal-guncel.json", "hal-gecmis.csv"]) fs.copyFileSync(path.join(KOK, "docs", f), path.join(k, f));
    const once = JSON.parse(fs.readFileSync(path.join(k, "hal-guncel.json"), "utf8"));
    const a = spawnSync(process.execPath, [path.join(KOK, "ajan", "hal-ajan.js"), "--klasor", k, "--bugun", "2026-10-17", "--dosya",
      [path.join(c, "2026-10-16.json"), path.join(c, "2026-10-16-halgov.json")].join(",")], { encoding: "utf8" });
    ok(a.status === 0, "hal-ajan işledi: " + (a.stdout.trim().split("\n").pop() || a.stderr).slice(0, 160));
    const v = JSON.parse(fs.readFileSync(path.join(k, "hal-veri.json"), "utf8"));
    ok(v.tarih === "16.10.2026" && v.ajan.kontrol === "17.10.2026" && v.ajan.surum === "1.3.0", "hal-veri.json: veri 16.10, kontrol 17.10");
    ok(JSON.stringify(v) === JSON.stringify(JSON.parse(fs.readFileSync(path.join(k, "hal-guncel.json"), "utf8"))), "hal-veri.json = hal-guncel.json");
    ok(v.ortalama === once.ortalama, "aynı veri tekrar gelince ortalama değişmez");
    const G = uygulamaDogrulayici();
    if (G) ok(G(v) === true, "uygulamanın doğrulayıcısı (halGecerli) kabul ediyor");
  }
  /* 2. sarımsak satırları sayfa sınırında */
  for (const kd of [1, 18, 19, 20]) { const { s, port } = await sunucu({ kaydir: kd }); const c = path.join(tmp(), "ham");
    await calistir(port, c); s.close();
    const hg = JSON.parse(fs.readFileSync(path.join(c, "2026-10-16-halgov.json"), "utf8"));
    ok(hg.satirlar.length === 3, `sayfa kayması ${kd}: üç satır (${hg.istek} istek)`); }
  /* 3. hal.gov.tr engelli (yurtdışı IP vb.) */
  { const { s, port } = await sunucu({ halgovYok: true }); const c = path.join(tmp(), "ham");
    const r = await calistir(port, c); s.close();
    const hg = JSON.parse(fs.readFileSync(path.join(c, "2026-10-16-halgov.json"), "utf8"));
    ok(r.status === 0 && fs.existsSync(path.join(c, "2026-10-16.json")) && !hg.satirlar.length && /HTTP 403/.test(hg.hatalar.join()), "hal.gov.tr 403: HaldeFiyat yazıldı, halgov dosyası yalnız hata bilgisi taşıyor");
    ok(/hal\.gov\.tr HTTP 403/.test(r.stdout), "hata çıktıda görünüyor");
    const k = path.join(path.dirname(c), "docs"); fs.mkdirSync(k);
    for (const f of ["hal-guncel.json", "hal-gecmis.csv"]) fs.copyFileSync(path.join(KOK, "docs", f), path.join(k, f));
    const a = spawnSync(process.execPath, [path.join(KOK, "ajan", "hal-ajan.js"), "--klasor", k, "--bugun", "2026-10-17", "--dosya",
      [path.join(c, "2026-10-16.json"), path.join(c, "2026-10-16-halgov.json")].join(",")], { encoding: "utf8" });
    const son = fs.readFileSync(path.join(k, "ajan-gunluk.log"), "utf8").trim().split("\n").pop();
    ok(a.status === 0 && /TAMAM/.test(son) && /kaynak hatası: .*HTTP 403/.test(son), "ajan günlüğünde: " + son.slice(25, 160)); }
  /* 4. API geçici hata → yeniden deneme */
  { const { s, say, port } = await sunucu({ apiGecici: true }); const c = path.join(tmp(), "ham");
    await calistir(port, c); s.close();
    const hd = JSON.parse(fs.readFileSync(path.join(c, "2026-10-16.json"), "utf8"));
    ok(say.api === 2 && hd.items.some(x => x.kanal === "api") && !hd.hatalar.length, "API 503 sonra 200: yeniden denendi"); }
  /* 5. hiçbiri yok */
  { const { s, port } = await sunucu({ apiYok: true, halgovYok: true }); const c = path.join(tmp(), "ham");
    const r = await calistir(port, c); s.close();
    ok(r.status === 2 && (!fs.existsSync(c) || !fs.readdirSync(c).length) && /DOSYALAR=$/m.test(r.stdout), "iki kaynak da yok: çıkış 2, dosya yok"); }
  /* 6. haftalık */
  { const { s, port } = await sunucu({}); const c = path.join(tmp(), "ham");
    await calistir(port, c, ["--gun", "1095"]); s.close();
    ok(fs.existsSync(path.join(c, "2026-10-16-haftalik.json")), "haftalık: -haftalik.json"); }
  console.log(`\n${gecti} geçti, ${kaldi} kaldı`);
  process.exitCode = kaldi ? 1 : 0;
})();
