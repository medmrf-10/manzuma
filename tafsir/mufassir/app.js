/* المفسِّر — موقع التفسير بتفسير السعدي. SPA ثابت فوق data/*.json — ثيم المنظومة */
const $ = (s) => document.querySelector(s);
const app = $("#app");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const AR_D = "٠١٢٣٤٥٦٧٨٩";
const arNum = (n) => String(n).replace(/\d/g, (d) => AR_D[+d]);
const TAF_NAME = "تفسير السعدي";

/* ---------- theme (manzuma 'lm' convention) ---------- */
(function () {
  const b = $("#lm");
  const set = (l) => {
    document.body.classList.toggle("light", l);
    b.textContent = l ? "🌙 داكن" : "☀ فاتح";
    try { localStorage.setItem("lm", l ? "1" : "0"); } catch (e) {}
  };
  let s = null; try { s = localStorage.getItem("lm"); } catch (e) {}
  set(s === "1" || (s === null && matchMedia("(prefers-color-scheme: light)").matches));
  b.onclick = () => set(!document.body.classList.contains("light"));
})();

/* ---------- data ---------- */
const cache = new Map();
const load = (url) => {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw r.status; return r.json(); }));
  return cache.get(url);
};
const surahData = (n) => load(`data/surah/${n}.json`);
let indexCache = null;
const surahsIndex = async () => { if (!indexCache) indexCache = await load("data/index.json"); return indexCache; };
const prefetchSurah = (n) => { if (n >= 1 && n <= 114) surahData(n).catch(() => {}); };
const idle = (f) => (window.requestIdleCallback || setTimeout)(f, 300);

/* ---------- shared chrome ---------- */
const header = () => `
<header class="site-head">
  <a class="brand" href="#/"><span class="brand-mark">م</span><span class="brand-txt">المفسِّر<br><small>القرآن · ${TAF_NAME}</small></span></a>
  <nav class="top-nav"><a href="#/">السور</a><a href="../">بوابة التفسير</a></nav>
</header>`;
const footer = `<footer class="site-foot">النص القرآني: Uthmani (QUL) · التفسير: ${TAF_NAME} «تيسير الكريم الرحمن» · بوابة التفسير — ساسي</footer>`;

function groupLabel(g) {
  const f = +g.f.split(":")[1], t = +g.t.split(":")[1];
  return f === t ? `الآية ${arNum(f)}` : `الآيات ${arNum(f)}–${arNum(t)}`;
}

/* ---------- tafsir panel ---------- */
let panelSeq = 0;
function openTafsir(d, verseKey) {
  const v = d.verses.find((x) => x.k === verseKey);
  if (!v) return;
  $("#panel-title").textContent = `سورة ${d.ar}`;
  $("#panel-ayah").textContent = v.t;
  $("#panel-body").innerHTML = "";
  $("#tafsir-overlay").classList.remove("hidden");
  $("#tafsir-panel").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  const g = d.groups[v.g];
  if (g) {
    $("#panel-title").textContent = `سورة ${d.ar} — ${groupLabel(g)}`;
    $("#panel-body").textContent = g.x;
  } else {
    $("#panel-body").innerHTML = `<div class="panel-loading">لا يغطي تفسير السعدي هذه الآية مستقلاً.</div>`;
  }
}
function closeTafsir() {
  $("#tafsir-overlay").classList.add("hidden");
  $("#tafsir-panel").classList.add("hidden");
  document.body.style.overflow = "";
}
$("#tafsir-overlay").addEventListener("click", closeTafsir);
$("#panel-close").addEventListener("click", closeTafsir);
addEventListener("keydown", (e) => e.key === "Escape" && closeTafsir());

/* ---------- home: surah grid ---------- */
async function renderHome() {
  const idx = await surahsIndex();
  app.innerHTML = header() + `
  <section class="hero">
    <h1>القرآن بـ<span class="accent">تفسير السعدي</span></h1>
    <p>اختر سورة، تصفّح آياتها قائمةً أو مصحفاً، وانقر أي آية تقرأ تفسيرها في لوحة جانبية — بلا مغادرة الصفحة.</p>
    <input id="q" class="search" type="search" placeholder="ابحث عن سورة — بالاسم أو الرقم…" autocomplete="off">
  </section>
  <div class="surah-grid" id="grid"></div>` + footer;
  const grid = $("#grid");
  const draw = (q) => {
    q = (q || "").trim().toLowerCase();
    const list = idx.filter((c) => !q || c.ar.includes(q) || c.en.toLowerCase().includes(q) || String(c.n) === q);
    grid.innerHTML = list.map((c) => `
      <a class="surah-card" href="#/s/${c.n}">
        <span class="surah-num">${arNum(c.n)}</span>
        <span class="names"><span class="surah-ar">${esc(c.ar)}</span><span class="surah-en">${esc(c.en)}</span></span>
        <span class="surah-meta">${c.place} · ${arNum(c.ayahs)} آية</span>
      </a>`).join("") || `<div class="page-loading">لا نتائج.</div>`;
  };
  draw();
  $("#q").addEventListener("input", (e) => draw(e.target.value));
  document.title = `المفسِّر — ${TAF_NAME}`;
}

/* ---------- surah page ---------- */
async function renderSurah(n, mode, ayah) {
  app.innerHTML = header() + '<div class="page-loading"><span class="spinner"></span> يُحمَّل السورة…</div>';
  const d = await surahData(n);
  const bisLine = n === 9 || n === 1 ? "" : `<div class="bismillah">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</div>`;
  const prev = n > 1 ? `<a class="back-link" href="#/s/${n - 1}">→ السورة السابقة</a>` : "<span></span>";
  const next = n < 114 ? `<a class="back-link" href="#/s/${n + 1}" style="text-align:left">السورة التالية ←</a>` : "<span></span>";
  app.innerHTML = header() + `
  <div class="surah-head">
    <a class="back-link" href="#/">→ كل السور</a>
    <div class="surah-title-row">
      <h1 class="surah-title">${esc(d.ar)}</h1>
      <div class="surah-title-meta">${d.place} · ${arNum(d.verses.length)} آية · ${TAF_NAME}</div>
    </div>
    <div class="mode-toggle">
      <button data-mode="list" class="${mode === "list" ? "active" : ""}">قائمة الآيات</button>
      <button data-mode="mushaf" class="${mode === "mushaf" ? "active" : ""}">المصحف</button>
    </div>
  </div>
  ${bisLine}
  <div id="surah-body"></div>
  <div class="surah-nav">${prev}${next}</div>` + footer;

  document.querySelectorAll(".mode-toggle button").forEach((b) =>
    b.addEventListener("click", () => { location.hash = `#/s/${n}${b.dataset.mode === "mushaf" ? "/mushaf" : ""}`; }));

  const body = $("#surah-body");
  if (mode === "mushaf") {
    body.innerHTML = `<div class="mushaf">` + d.verses.map((v) =>
      `<span class="m-ayah" data-k="${v.k}" id="a-${v.a}">${v.t}<span class="ayah-marker">${arNum(v.a)}</span></span>`).join(" ") + `</div>`;
    body.querySelectorAll(".m-ayah").forEach((el) =>
      el.addEventListener("click", () => {
        body.querySelectorAll(".m-ayah.active").forEach((x) => x.classList.remove("active"));
        el.classList.add("active");
        openTafsir(d, el.dataset.k);
      }));
  } else {
    body.innerHTML = `<div class="ayah-list">` + d.verses.map((v) => `
      <div class="ayah-card" id="a-${v.a}" data-k="${v.k}" role="button" tabindex="0">
        <div class="ayah-text">${v.t}<span class="ayah-marker">${arNum(v.a)}</span></div>
        <div class="ayah-foot"><button class="tafsir-btn">قراءة التفسير</button></div>
      </div>`).join("") + `</div>`;
    body.querySelectorAll(".ayah-card").forEach((card) => {
      const open = () => openTafsir(d, card.dataset.k);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }
  if (ayah) {
    const el = $(`#a-${ayah}`);
    el?.scrollIntoView({ block: "center" });
    if (mode !== "mushaf") setTimeout(() => openTafsir(d, `${n}:${ayah}`), 150);
  }
  document.title = `المفسِّر — سورة ${d.ar}`;
  idle(() => { prefetchSurah(n - 1); prefetchSurah(n + 1); });
}

/* ---------- router ---------- */
async function route() {
  const h = location.hash || "#/";
  let m;
  if ((m = h.match(/^#\/s\/(\d+)(?:\/(mushaf|a\/(\d+)))?/))) {
    const n = Math.min(114, Math.max(1, +m[1]));
    const ayah = m[3] ? +m[3] : null;
    renderSurah(n, m[2] === "mushaf" ? "mushaf" : "list", ayah).catch(() => {
      app.innerHTML = header() + '<div class="page-loading">تعذّر تحميل السورة.</div>' + footer;
    });
  } else {
    renderHome().catch(() => {
      app.innerHTML = header() + '<div class="page-loading">تعذّر تحميل الفهرس.</div>' + footer;
    });
  }
}
addEventListener("hashchange", route);
route();
