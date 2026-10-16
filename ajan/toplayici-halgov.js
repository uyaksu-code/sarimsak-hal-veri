/* HAL AJANI · TOPLAYICI (hal.gov.tr) v1.2 — https://www.hal.gov.tr/Sayfalar/FiyatDetaylari.aspx sekmesinde çalıştırılır.
   T.C. Ticaret Bakanlığı Hal Kayıt Sistemi "Ürün Fiyat Detayları" bülteni: ürün başına Türkiye geneli
   ortalama fiyat ve işlem hacmi (bir önceki günün verisi). İl kırılımı yoktur.
   Tablo alfabetik ve sayfalı (ASP.NET GridView, sarımsak ~15. sayfa). Pager'da görünen sayfalara
   atlanarak sarımsak sayfası 4–7 istekte bulunur; istekler arası 400 ms.
   İKİ ADIMDA ÇALIŞIR (sayfa yavaş, tek çağrı zaman aşımına uğrayabilir):
     1) bu dosyanın tamamını çalıştır → "başladı" döner, iş arka planda sürer
     2) birkaç saniye arayla  window.__halgov  değerini oku; "bekliyor" değilse JSON metnidir.
   Çıktı: {kaynak:"halgov", bulten, veriTarihi, hatalar, satirlar:[{urun,cins,tur,ort,hacim,birim}]} */
window.__halgov = "bekliyor";
(async () => {
  const hatalar = [];
  const sayi = s => { const n = parseFloat(String(s).replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : null; };
  const HEDEF = "SARIMSAK", cmp = (a, b) => a.localeCompare(b, "tr");
  const satirlar = t => t ? [...t.rows].map(tr => [...tr.cells].map(c => c.textContent.trim())).filter(x => x.length === 6 && x[0] !== "Ürün Adı") : [];
  const grid = d => d.querySelector("table[id$='_gvFiyatlar']");
  const G0 = grid(document); if (!G0) throw new Error("gvFiyatlar tablosu yok — sayfa yapısı değişmiş");
  const bag = document.querySelector(`a[href*="gvFiyatlar"]`);
  const hedefAd = bag && (bag.getAttribute("href").match(/'([^']+)'/) || [])[1];
  if (!hedefAd) throw new Error("sayfalama bağlantısı bulunamadı");
  const gorunen = d => [...d.querySelectorAll('a[href*="gvFiyatlar"]')].map(a => +((a.getAttribute("href").match(/Page\$(\d+)/) || [])[1])).filter(Boolean);
  let istek = 0;
  const git = async (form, n) => {
    if (++istek > 12) throw new Error("istek sınırı (12) aşıldı");
    await new Promise(r => setTimeout(r, 400));
    const fd = new URLSearchParams();
    for (const e of form.elements) {
      if (!e.name || ["submit", "button", "image"].includes(e.type)) continue;
      if ((e.type === "radio" || e.type === "checkbox") && !e.checked) continue;
      fd.append(e.name, e.value);
    }
    fd.set("__EVENTTARGET", hedefAd); fd.set("__EVENTARGUMENT", "Page$" + n);
    const r = await fetch(location.origin + location.pathname, { method: "POST", body: fd, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    if (!r.ok) throw new Error("hal.gov.tr HTTP " + r.status);
    const d = new DOMParser().parseFromString(await r.text(), "text/html");
    return { n, d, form: d.forms[0], rows: satirlar(grid(d)), sayfalar: gorunen(d) };
  };
  let st = { n: 1, d: document, form: document.forms[0], rows: satirlar(G0), sayfalar: gorunen(document) };
  const bulunan = [];
  try {
    /* 1) hedef sayfaya yaklaş: görünen sayfalar içinde ilk satırı HEDEF'ten küçük olan en büyük sayfaya geç */
    while (st.rows.length && cmp(st.rows.at(-1)[0], HEDEF) < 0) {
      let aday = st.sayfalar.filter(p => p > st.n).sort((a, b) => a - b);
      if (!aday.length) break;
      let lo = 0, hi = aday.length - 1, ileri = null;
      while (lo <= hi) {   /* bu durumdan erişilebilen sayfalarda ikili arama */
        const m = (lo + hi) >> 1, s = await git(st.form, aday[m]);
        if (s.rows.length && cmp(s.rows[0][0], HEDEF) <= 0) { ileri = s; lo = m + 1; } else hi = m - 1;
      }
      if (!ileri) break;
      st = ileri;
    }
    /* 2) sarımsak satırlarını topla; son satır sarımsaksa bir sonraki sayfaya da bak */
    for (let k = 0; k < 3; k++) {
      bulunan.push(...st.rows.filter(x => x[0].startsWith(HEDEF)));
      if (!st.rows.length || !st.rows.at(-1)[0].startsWith(HEDEF) && cmp(st.rows.at(-1)[0], HEDEF) > 0) break;
      st = await git(st.form, st.n + 1);
    }
  } catch (e) { hatalar.push(e.message); }
  const b = document.body.innerText.match(/Bülten Tarihi\s*:\s*(\d\d\.\d\d\.\d{4})\s*\((\d\d\.\d\d\.\d{4}) Tarihli/) || [];
  const tekil = [...new Map(bulunan.map(x => [x.join("|"), x])).values()];
  window.__halgov = JSON.stringify({ kaynak: "halgov", toplandi: new Date().toISOString(), bulten: b[1] || null, veriTarihi: b[2] || null, istek, hatalar,
    satirlar: tekil.map(x => ({ urun: x[0], cins: x[1], tur: x[2], ort: sayi(x[3]), hacim: sayi(x[4]), birim: x[5] })) });
})().catch(e => { window.__halgov = JSON.stringify({ kaynak: "halgov", hatalar: [e.message], satirlar: [] }); });
"başladı";
