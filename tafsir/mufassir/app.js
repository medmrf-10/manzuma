/* المفسِّر — مصحف هاتف: الشاشة كلها صفحة المصحف، بلا إطار ولا هوامش.
   التقليب بالسحب · درج أيمن للفهرس · ضغط مطوّل على الآية لقائمة الخدمات · تفسير السعدي. */
const $ = (s) => document.querySelector(s);
const app = $("#app");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const AR_D = "٠١٢٣٤٥٦٧٨٩";
const arNum = (n) => String(n).replace(/\d/g, (d) => AR_D[+d]);
const TAF_NAME = "تفسير السعدي";
const JUZ_STARTS = [[1,1],[2,142],[2,253],[3,93],[4,24],[4,148],[5,82],[6,111],[7,88],[8,41],[9,93],[11,6],[12,53],[15,1],[17,1],[18,75],[21,1],[23,1],[25,21],[27,56],[29,46],[33,31],[36,28],[39,32],[41,47],[46,1],[51,31],[58,1],[67,1],[78,1]];
const TOTAL_PAGES = 604;

/* ---------- theme ---------- */
let toggleTheme = () => {};
(function () {
  const b = $("#lm");
  const set = (l) => {
    document.body.classList.toggle("light", l);
    if (b) b.textContent = l ? "🌙" : "☀";
    try { localStorage.setItem("lm", l ? "1" : "0"); } catch (e) {}
  };
  let s = null; try { s = localStorage.getItem("lm"); } catch (e) {}
  set(s === "1" || (s === null && matchMedia("(prefers-color-scheme: light)").matches));
  if (b) b.onclick = () => set(!document.body.classList.contains("light"));
  toggleTheme = () => set(!document.body.classList.contains("light"));
})();

/* ---------- data ---------- */
const cache = new Map();
const load = (url) => {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw r.status; return r.json(); }));
  return cache.get(url);
};
const surahData = (n) => load(`data/surah/${n}.json`);
const pagesData = () => load("data/pages.json");
const ahzabData = () => load("data/ahzab.json");
const tafsirSurah = (id, n) => load(`data/tafsir/${id}/${n}.json`);
let tafBooksCache = null;
const tafsirBooks = async () => { if (!tafBooksCache) tafBooksCache = await load("data/tafsir/books.json"); return tafBooksCache; };
let indexCache = null;
const surahsIndex = async () => { if (!indexCache) indexCache = await load("data/index.json"); return indexCache; };
const prefetchSurah = (n) => { if (n >= 1 && n <= 114) surahData(n).catch(() => {}); };
const idle = (f) => (window.requestIdleCallback ? window.requestIdleCallback(f) : setTimeout(f, 300));
async function pageOf(s, a) {
  const pg = await pagesData();
  for (const k in pg) for (const [ns, f, t] of pg[k]) if (ns === s && a >= f && a <= t) return +k;
  return 1;
}

/* ---------- tafsir panel ---------- */
let curSurah = null, curIdx = -1;
let curBook = "saadi";
try { curBook = localStorage.getItem("mufassir-book") || "saadi"; } catch (e) {}

async function renderTafBody(d, v) {
  const bid = curBook;
  if (bid === "saadi") {
    const g = d.groups[v.g];
    $("#panel-title").textContent = g ? `سورة ${d.ar} — ${groupLabel(g)} · السعدي` : `سورة ${d.ar} — الآية ${arNum(v.a)} · السعدي`;
    $("#panel-body").innerHTML = g ? "" : `<div class="panel-loading">لا يغطي تفسير السعدي هذه الآية مستقلاً.</div>`;
    if (g) $("#panel-body").textContent = g.x;
    return;
  }
  const books = await tafsirBooks();
  const bk = books.find((b) => b.id === bid) || { ar: "التفسير" };
  $("#panel-title").textContent = `سورة ${d.ar} — الآية ${arNum(v.a)} · ${bk.ar}`;
  $("#panel-body").innerHTML = `<div class="panel-loading">…</div>`;
  try {
    const t = await tafsirSurah(bid, d.n);
    if (bid !== curBook) return;
    const x = t[String(v.a)];
    $("#panel-body").textContent = x || "لا يغطي هذا التفسير هذه الآية.";
  } catch (e) {
    if (bid === curBook) $("#panel-body").innerHTML = `<div class="panel-loading">تعذّر تحميل التفسير.</div>`;
  }
}

async function renderTafBooks() {
  const books = await tafsirBooks();
  const box = $("#taf-books");
  box.innerHTML = books.map((b) => `<button class="taf-chip${b.id === curBook ? " on" : ""}" data-id="${b.id}" title="${esc(b.desc)}">${esc(b.ar)}</button>`).join("");
  box.querySelectorAll(".taf-chip").forEach((c) =>
    c.addEventListener("click", () => {
      curBook = c.dataset.id;
      try { localStorage.setItem("mufassir-book", curBook); } catch (e) {}
      box.querySelectorAll(".taf-chip").forEach((x) => x.classList.toggle("on", x === c));
      if (curSurah && curIdx >= 0) renderTafBody(curSurah, curSurah.verses[curIdx]);
    }));
}

function openTafsir(d, verseKey) {
  const i = d.verses.findIndex((x) => x.k === verseKey);
  if (i < 0) return;
  curSurah = d; curIdx = i;
  const v = d.verses[i];
  const wasClosed = $("#tafsir-panel").classList.contains("hidden");
  $("#panel-ayah").textContent = v.t;
  $("#tafsir-overlay").classList.remove("hidden");
  $("#tafsir-panel").classList.remove("hidden");
  if (wasClosed) { try { history.pushState({ mufassirPanel: 1 }, ""); } catch (e) {} }
  try { localStorage.setItem("mufassir-last", `${d.n}:${v.a}`); } catch (e) {}
  renderTafBooks().catch(() => {});
  renderTafBody(d, v);
  $("#panel-prev").disabled = i <= 0;
  $("#panel-next").disabled = i >= d.verses.length - 1;
  $("#panel-ayah").scrollTop = 0; $("#panel-body").scrollTop = 0;
}
function groupLabel(g) {
  const f = +g.f.split(":")[1], t = +g.t.split(":")[1];
  return f === t ? `الآية ${arNum(f)}` : `الآيات ${arNum(f)}–${arNum(t)}`;
}
function panelStep(step) {
  const i = curIdx + step;
  if (curSurah && i >= 0 && i < curSurah.verses.length) openTafsir(curSurah, curSurah.verses[i].k);
}
$("#panel-prev").addEventListener("click", () => panelStep(-1));
$("#panel-next").addEventListener("click", () => panelStep(1));
addEventListener("keydown", (e) => {
  if (!$("#tafsir-panel").classList.contains("hidden")) {
    if (e.key === "ArrowLeft") panelStep(-1);
    if (e.key === "ArrowRight") panelStep(1);
    if (e.key === "Escape") closeTafsir();
  }
});
function closeTafsir() {
  $("#tafsir-overlay").classList.add("hidden");
  $("#tafsir-panel").classList.add("hidden");
}
$("#tafsir-overlay").addEventListener("click", closeTafsir);
addEventListener("popstate", () => { if (!$("#tafsir-panel").classList.contains("hidden")) closeTafsir(); });

/* ---------- gestures: swipe flip + long-press ---------- */
let swipeMoved = false;
function bindGestures(el, goPrev, goNext, onLongPress) {
  let x0 = 0, y0 = 0, lpT = null, lpEl = null, edgeX0 = -1, drag = false;
  const page = el.querySelector(".mushaf-page");
  const snapBack = () => { if (page) { page.style.transition = "transform .25s ease-out"; page.style.transform = ""; } };
  el.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY; swipeMoved = false; drag = false;
    edgeX0 = x0 > innerWidth - 26 ? x0 : -1; // right-edge pull
    lpEl = e.target.closest ? e.target.closest(".m-ayah") : null;
    if (lpEl) {
      lpT = setTimeout(() => {
        lpT = null;
        if (!swipeMoved && lpEl) { swipeMoved = true; onLongPress(lpEl); }
      }, 500);
    }
  }, { passive: true });
  el.addEventListener("touchmove", (e) => {
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) { swipeMoved = true; if (lpT) { clearTimeout(lpT); lpT = null; } }
    if (page && edgeX0 < 0 && Math.abs(dx) > Math.abs(dy)) {
      drag = true;
      page.style.transition = "none";
      page.style.transform = `translateX(${Math.max(-150, Math.min(150, dx * 0.55))}px)`;
    }
  }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (lpT) { clearTimeout(lpT); lpT = null; }
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (edgeX0 > 0 && dx < -40 && Math.abs(dy) < 60) { // pull from right edge → drawer
      snapBack();
      if (window.MufassirDrawer) window.MufassirDrawer.open();
      return;
    }
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      const dir = dx > 0 ? 1 : -1;
      if (page) { page.style.transition = "transform .2s ease-out"; page.style.transform = `translateX(${dir * 110}%)`; }
      flipDir = -dir; // الصفحة الجديدة تدخل من الجهة المقابلة
      dx > 0 ? goNext() : goPrev(); // سحب يمين = التالية، سحب يسار = السابقة (مصحف RTL)
    } else if (drag) snapBack();
  }, { passive: true });
  el.addEventListener("touchcancel", () => { if (lpT) { clearTimeout(lpT); lpT = null; } snapBack(); });
  el.addEventListener("contextmenu", (e) => {
    const a = e.target.closest ? e.target.closest(".m-ayah") : null;
    if (a) { e.preventDefault(); onLongPress(a); }
  });
}

/* ---------- auto-fit ---------- */
function fitMushaf() {
  const box = $("#mtext");
  if (!box) return;
  let s = 1.22, guard = 80;
  box.style.fontSize = s + "rem";
  while (guard-- > 0 && s > 0.6 && (box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1)) {
    s -= 0.04; box.style.fontSize = s + "rem";
  }
}
addEventListener("resize", () => { if ($("#mtext")) fitMushaf(); });

/* ---------- the mushaf: screen IS the page ---------- */
let curPage = 1, curSurahs = {}, flipDir = 0;
function surahBanner(d) {
  const bis = d.bismillah ? `<div class="bismillah">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</div>` : "";
  return `<div class="surah-banner"><span class="ornament">﴾</span><span class="surah-banner-name">سورة ${esc(d.ar)}</span><span class="ornament">﴿</span></div>${bis}`;
}
async function renderMushafPage(k) {
  k = Math.min(TOTAL_PAGES, Math.max(1, k));
  curPage = k;
  document.body.classList.add("book-mode");
  const ov = $(".menu-overlay"); if (ov) ov.remove();
  try { localStorage.setItem("mufassir-page", String(k)); } catch (e) {}
  app.innerHTML = '<div class="mushaf-book"><div class="page-loading"><span class="spinner"></span></div></div>';
  const pg = await pagesData();
  const ranges = pg[k] || [];
  const surahs = {};
  await Promise.all([...new Set(ranges.map((r) => r[0]))].map(async (n) => { surahs[n] = await surahData(n); }));
  curSurahs = surahs;
  let html = "", juz = null;
  const firstSurah = ranges.length ? ranges[0][0] : 1;
  for (const [s, f, t] of ranges) {
    const d = surahs[s];
    if (f === 1) html += surahBanner(d);
    for (const v of d.verses) {
      if (v.a < f || v.a > t) continue;
      if (juz === null) juz = v.j;
      html += `<span class="m-ayah" data-s="${s}" data-k="${v.k}">${v.t}<span class="ayah-marker">${arNum(v.a)}${v.sd ? " ۩" : ""}</span></span> `;
    }
  }
  const sName = surahs[firstSurah] ? surahs[firstSurah].ar : "";
  app.innerHTML = `
  <div class="mushaf-book" id="mbook">
    <div class="mushaf-page">
      <div class="m-edge m-top" id="mtop">
        <span class="m-corner" id="surah-name">${esc(sName)}</span>
        <span class="m-corner">الجزء ${arNum(juz ?? "")}</span>
      </div>
      <div class="mushaf-text" id="mtext">${html}</div>
      <div class="m-edge m-bot">
        <span class="page-num">${arNum(k)}</span>
      </div>
    </div>
    <button class="edge-grip" id="grip" type="button" aria-label="الفهرس"><i></i><i></i><i></i></button>
  </div>`;
  fitMushaf();
  const book = $("#mbook"), mt = $("#mtext");
  if (flipDir) { // الصفحة تنساب من الجهة المقابلة لاتجاه السحب
    const pg = book.querySelector(".mushaf-page");
    pg.style.transform = `translateX(${flipDir * 100}%)`;
    requestAnimationFrame(() => { pg.style.transition = "transform .24s ease-out"; pg.style.transform = ""; });
    flipDir = 0;
  }
  mt.addEventListener("click", () => { // لمسة على النص: إخفاء/إظهار الحواف للقراءة الغامرة
    if (swipeMoved) return;
    book.classList.toggle("chrome-hidden");
  });
  bindGestures(book,
    () => { if (k > 1) location.hash = `#/m/${k - 1}`; },
    () => { if (k < TOTAL_PAGES) location.hash = `#/m/${k + 1}`; },
    (a) => { // long-press → context menu (component hook)
      mt.querySelectorAll(".m-ayah.active").forEach((x) => x.classList.remove("active"));
      a.classList.add("active");
      if (window.MufassirCtx) window.MufassirCtx.open(a, surahs[+a.dataset.s], a.dataset.k);
      else openTafsir(surahs[+a.dataset.s], a.dataset.k);
    });
  const openDrawer = () => { if (window.MufassirDrawer) window.MufassirDrawer.open(); };
  $("#grip").addEventListener("click", openDrawer);
  $("#mtop").addEventListener("click", openDrawer);
  document.title = `المفسِّر — صفحة ${arNum(k)}`;
  idle(() => {
    const nx = pg[k + 1], pv = pg[k - 1];
    [...(nx || []), ...(pv || [])].forEach(([s]) => prefetchSurah(s));
  });
}

/* ---------- shared API for components (drawer / ctxmenu) ---------- */
window.Mufassir = {
  goPage: (k) => { location.hash = `#/m/${Math.min(TOTAL_PAGES, Math.max(1, k))}`; },
  pageOf, surahData, surahsIndex, pagesData, ahzabData, openTafsir, toggleTheme,
  JUZ_STARTS, TOTAL_PAGES, arNum, esc,
  state: () => ({ page: curPage, surahs: curSurahs }),
};

/* ---------- router ---------- */
async function route() {
  closeTafsir();
  const h = location.hash || "#/";
  let m = h.match(/^#\/m\/(\d+)\/a\/(\d+)$/);
  if (m) {
    const k = +m[1], a = +m[2];
    renderMushafPage(k).then(async () => {
      const pg = await pagesData();
      const rg = (pg[k] || []).find(([s, f, t]) => a >= f && a <= t);
      if (rg) { const d = await surahData(rg[0]); openTafsir(d, `${rg[0]}:${a}`); }
    }).catch(() => {});
    return;
  }
  m = h.match(/^#\/m\/(\d+)/);
  if (m) {
    renderMushafPage(+m[1]).catch(() => {
      app.innerHTML = '<div class="mushaf-book"><div class="page-loading">تعذّر تحميل الصفحة.</div></div>';
    });
    return;
  }
  m = h.match(/^#\/s\/(\d+)/);
  if (m) {
    const n = Math.min(114, Math.max(1, +m[1]));
    surahData(n).then((d) => {
      const am = h.match(/\/a\/(\d+)/);
      const v = am ? d.verses.find((x) => x.a === +am[1]) : null;
      const p = v ? v.p : (d.verses[0] ? d.verses[0].p : 1);
      location.replace(`#/m/${p}${v ? `/a/${v.a}` : ""}`);
    }).catch(() => location.replace("#/m/1"));
    return;
  }
  let r = 1;
  try { r = Math.min(TOTAL_PAGES, Math.max(1, +localStorage.getItem("mufassir-page") || 1)); } catch (e) {}
  location.replace(`#/m/${r}`);
}
addEventListener("hashchange", route);
route();
