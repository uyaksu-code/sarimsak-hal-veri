/* HAL AJANI · TOPLAYICI v1.1 — haldefiyat.com sekmesinde (aynı köken) çalıştırılır.
   İki istek atar:
     1) /api/v1/prices/history/sarimsak-kuru?range=GUN   (resmî API; yeni belediye akışı)
     2) /fiyat/istanbul/sarimsak-kuru                     (ürün sayfası; devralınan çok illi kayıtlar)
   Çıktı: hal-ajan.js'in --dosya ile okuduğu JSON metni {items:[...], toplandi, attribution}.
   GUN değişkeni: günlük 400, haftalık 1095 (çalıştırmadan önce aşağıdaki satırı değiştir). */
const GUN = 400;
const sayi = s => { const m = String(s || "").replace(/\s|TL/g, "").replace(/\./g, "").replace(",", "."); const n = parseFloat(m); return isFinite(n) ? n : null; };
const items = []; const hatalar = []; let attribution = "";
try {
  const r = await fetch(`/api/v1/prices/history/sarimsak-kuru?range=${GUN}d`, { cache: "no-store" });
  if (!r.ok) throw new Error("API HTTP " + r.status);
  const j = await r.json(); attribution = j.attribution || "";
  for (const x of j.items || []) items.push({ recordedDate: String(x.recordedDate).slice(0, 10), minPrice: x.minPrice, maxPrice: x.maxPrice,
    avgPrice: x.avgPrice, avgPriceMethod: x.avgPriceMethod, marketSlug: x.marketSlug, cityName: x.cityName, productSlug: x.productSlug, kanal: "api" });
} catch (e) { hatalar.push("api: " + e.message); }
try {
  const r = await fetch("/fiyat/istanbul/sarimsak-kuru", { cache: "no-store" });
  if (!r.ok) throw new Error("sayfa HTTP " + r.status);
  const d = new DOMParser().parseFromString(await r.text(), "text/html");
  for (const tr of d.querySelectorAll("table tbody tr")) {
    const td = tr.children; if (td.length < 6) continue;
    const u = td[0].querySelector('a[href^="/urun/"]'), h = td[1].querySelector('a[href^="/hal/"]'), t = td[2].querySelector("time[datetime]");
    if (!u || !h || !t) continue;
    const urun = u.getAttribute("href").split("/").pop();
    if (!/^sarimsak/.test(urun)) continue;
    const halAdi = h.textContent.trim();
    const il = /ulusal/i.test(halAdi) ? "Türkiye" : halAdi.split(/\s+/)[0];
    const ortMetin = td[4].textContent;
    items.push({ recordedDate: t.getAttribute("datetime"), minPrice: sayi(td[3].childNodes[0] && td[3].childNodes[0].textContent),
      maxPrice: sayi(td[5].childNodes[0] && td[5].childNodes[0].textContent), avgPrice: sayi(td[4].childNodes[0] && td[4].childNodes[0].textContent),
      avgPriceMethod: /yayımlanan/i.test(ortMetin) ? "reported" : "midpoint", marketSlug: h.getAttribute("href").split("/").pop(),
      cityName: il, productSlug: urun, kanal: "sayfa" });
  }
} catch (e) { hatalar.push("sayfa: " + e.message); }
JSON.stringify({ toplandi: new Date().toISOString(), gun: GUN, attribution, hatalar, items });
