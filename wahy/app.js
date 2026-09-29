/* وحي — القرآن الكريم ومكتبة التفاسير. Static SPA over web/data/*.json[.gz] */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const arNum = (n) => String(n).replace(/\d/g, (d) => AR_DIGITS[+d]);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* fetch cache: resolved data or in-flight promise per URL */
const cache = new Map();
async function fetchGz(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const ds = new DecompressionStream("gzip");
  const text = await new Response(r.body.pipeThrough(ds)).text();
  return JSON.parse(text);
}
function load(url, gz = false) {
  if (!cache.has(url)) {
    const p = gz
      ? fetchGz(url)
      : fetch(url).then((r) => {
          if (!r.ok) throw new Error(`${r.status} ${url}`);
          return r.json();
        });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return cache.get(url);
}
const surahData = (n) => load(`data/surah/${n}.json`);
const tafsirData = (slug) => load(`data/tafsir/${slug}.json.gz`, true);
const booksIndex = () => load("data/hadith/books.json");
const bookData = (s) => load(`data/hadith/${s}.json.gz`, true);
const bookDetail = (s) => load(`data/hadith/${s}-det.json.gz`, true);
const topicsIndex = () => load("data/hadith/topics.json.gz", true);
const bookToc = (s) => load(`data/hadith/${s}-toc.json.gz`, true);

let indexCache = null;
async function surahIndex() {
  if (!indexCache) indexCache = await load("data/index.json");
  return indexCache;
}

/* selected tafsir */
const DEFAULT_TAFSIR = "22-ibn-kathir";
let tafsirSlug = localStorage.getItem("wahy-tafsir") || DEFAULT_TAFSIR;
let tafsirsCache = null;
async function tafsirsIndex() {
  if (!tafsirsCache) {
    tafsirsCache = await load("data/tafsirs.json");
    if (!tafsirsCache.some((t) => t.s === tafsirSlug)) setTafsir(DEFAULT_TAFSIR);
  }
  return tafsirsCache;
}

function prefetchSurah(n) {
  if (n >= 1 && n <= 114) surahData(n).catch(() => {});
}
const idle = (fn) => ("requestIdleCallback" in window ? requestIdleCallback(fn) : setTimeout(fn, 400));

/* ---------- theme ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("wahy-theme", t);
}
applyTheme(localStorage.getItem("wahy-theme") ||
  (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

/* ---------- shell ---------- */
function tafsirOptionsHtml() {
  const list = tafsirsCache || [];
  const ar = list.filter((t) => t.ar), rest = list.filter((t) => !t.ar);
  const opt = (t) =>
    `<option value="${t.s}" ${t.s === tafsirSlug ? "selected" : ""}>${esc(t.n)}${t.c ? "" : " (جزئي)"}</option>`;
  return `<optgroup label="التفاسير العربية">${ar.map(opt).join("")}</optgroup>` +
    `<optgroup label="بلغات أخرى">${rest.map(opt).join("")}</optgroup>`;
}
function tafsirSelect(id) {
  return `<select class="tafsir-pick" id="${id}" title="اختر التفسير" aria-label="اختر التفسير">${tafsirOptionsHtml()}</select>`;
}
function bindTafsirPicks() {
  document.querySelectorAll(".tafsir-pick").forEach((sel) =>
    sel.addEventListener("change", () => setTafsir(sel.value)));
}
function setTafsir(slug) {
  tafsirSlug = slug;
  localStorage.setItem("wahy-tafsir", slug);
  document.querySelectorAll(".tafsir-pick").forEach((s) => (s.value = slug));
  if (currentPanel && !$("#tafsir-panel").classList.contains("hidden")) {
    openTafsir(currentPanel.d, currentPanel.k);
  }
}
function header() {
  return `<header class="site-header"><div class="header-inner">
    <a class="brand" href="#/">
      <span class="brand-mark">و</span>
      <span><span class="brand-text">وحي</span><br>
      <span class="brand-sub">القرآن · الحديث · التفسير</span></span>
    </a>
    <nav class="site-nav">
      <a class="nav-link" href="#/">السور</a>
      <a class="nav-link" href="#/hadith">الحديث</a>
    </nav>
    <span class="header-spacer"></span>
    <button class="icon-btn" id="theme-btn" title="الوضع الليلي/النهاري">${document.documentElement.dataset.theme === "dark" ? "☀" : "☾"}</button>
  </div></header>`;
}
function bindTheme() {
  $("#theme-btn")?.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    render();
  });
}
const footer = `<footer class="site-footer">
  <b>وحي</b> — القرآن والحديث والتفسير · البيانات: QUL (Tarteel) و«الجامع» · بناء تجريبي
</footer>`;

/* ---------- home ---------- */
async function renderHome() {
  const idx = await surahIndex();
  const nTaf = (await tafsirsIndex()).length;
  app.innerHTML = header() + `
  <section class="hero">
    <h1>اقرأ القرآن مع <span class="accent">${arNum(nTaf)} تفسيراً</span></h1>
    <p>مكتبة تفاسير كاملة — تصفّح السور، اقرأ كتطبيق المصحف، افتح تفسير أي آية بلمسة واحدة، وبدّل بين التفاسير من داخل لوحة التفسير.</p>
  </section>
  <div class="search-wrap"><input class="search" id="q" placeholder="ابحث عن سورة…" autocomplete="off"></div>
  <div class="surah-grid" id="grid"></div>` + footer;

  const grid = $("#grid");
  const draw = (list) => {
    grid.innerHTML = list.map((s) => `
      <a class="surah-card" href="#/s/${s.n}">
        <span class="surah-num">${arNum(s.n)}</span>
        <span class="names">
          <span class="surah-ar">${esc(s.ar)}</span>
          <div class="surah-en">${esc(s.en)}</div>
        </span>
        <span class="surah-meta"><span class="pill">${s.place}</span><br>${arNum(s.ayahs)} آية</span>
      </a>`).join("");
  };
  draw(idx);
  $("#q").addEventListener("input", (e) => {
    const q = e.target.value.trim();
    draw(!q ? idx : idx.filter((s) => s.ar.includes(q) || s.en.toLowerCase().includes(q.toLowerCase()) || s.n == q));
  });
}

/* ---------- surah ---------- */
function groupLabel(g) {
  const [, fa] = g.f.split(":").map(Number), [, ta] = g.t.split(":").map(Number);
  return fa === ta ? `الآية ${arNum(fa)}` : `الآيات ${arNum(fa)}–${arNum(ta)}`;
}

let panelSeq = 0; /* guards late tafsir fetches racing a new selection */
let currentPanel = null; /* {d, k} of the open panel so switching tafsir reloads it */
async function openTafsir(d, verseKey) {
  const v = d.verses.find((x) => x.k === verseKey);
  if (!v) return;
  currentPanel = { d, k: verseKey };
  $("#tafsir-panel").classList.remove("hadith-mode");
  const seq = ++panelSeq;
  const slug = tafsirSlug;
  $("#panel-title").textContent = `سورة ${d.ar}`;
  $("#panel-ayah").textContent = v.t;
  $("#panel-body").innerHTML = '<div class="panel-loading"><span class="spinner"></span> يُحمَّل التفسير…</div>';
  $("#tafsir-overlay").classList.remove("hidden");
  $("#tafsir-panel").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  const sel = $("#panel-tafsir");
  if (sel) {
    await tafsirsIndex().catch(() => {});
    if (tafsirsCache && !sel.options.length) sel.innerHTML = tafsirOptionsHtml();
    if (tafsirsCache) sel.value = tafsirSlug;
  }
  try {
    const taf = await tafsirData(slug);
    if (seq !== panelSeq) return;
    const g = taf.groups[taf.vg?.[verseKey]];
    if (g) {
      $("#panel-title").textContent = `سورة ${d.ar} — ${groupLabel(g)}`;
      $("#panel-body").textContent = g.x;
    } else {
      const coversSurah = Object.keys(taf.vg || {}).some((k) => k.startsWith(d.n + ":"));
      $("#panel-body").innerHTML = `<div class="panel-loading">${coversSurah
        ? "لا يغطي هذا التفسير هذه الآية."
        : "هذا التفسير لا يغطي هذه السورة."}</div>`;
    }
  } catch (e) {
    if (seq !== panelSeq) return;
    $("#panel-body").innerHTML =
      '<div class="panel-loading">تعذّر تحميل التفسير — <button class="tafsir-btn" id="panel-retry">أعد المحاولة</button></div>';
    $("#panel-retry")?.addEventListener("click", () => openTafsir(d, verseKey));
  }
}
function closeTafsir() {
  currentPanel = null;
  $("#tafsir-panel").classList.remove("hadith-mode");
  $("#tafsir-overlay").classList.add("hidden");
  $("#tafsir-panel").classList.add("hidden");
  document.body.style.overflow = "";
}
$("#tafsir-overlay").addEventListener("click", closeTafsir);
$("#panel-close").addEventListener("click", closeTafsir);
$("#panel-tafsir").addEventListener("change", (e) => setTafsir(e.target.value));
addEventListener("keydown", (e) => e.key === "Escape" && closeTafsir());

async function renderSurah(n, mode, ayah) {
  app.innerHTML = header() + '<div class="surah-head"><div class="page-loading"><span class="spinner"></span> يُحمَّل السورة…</div></div>';
  bindTheme();
  const [d] = await Promise.all([surahData(n), tafsirsIndex()]);
  const pick = tafsirSelect("surah-tafsir");
  const bisLine = n === 9 ? "" :
    n === 1 ? "" : `<div class="bismillah">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</div>`;
  const prev = n > 1 ? `<a class="back-link" href="#/s/${n - 1}">→ السورة السابقة</a>` : "";
  const next = n < 114 ? `<a class="back-link" href="#/s/${n + 1}" style="text-align:left">السورة التالية ←</a>` : "";

  app.innerHTML = header() + `
  <div class="surah-head">
    <a class="back-link" href="#/">→ كل السور</a>
    <div class="surah-title-row">
      <h1 class="surah-title">${esc(d.ar)}</h1>
      <div class="surah-title-meta">${d.place} · ${arNum(d.verses.length)} آية</div>
    </div>
    <div class="mode-toggle">
      <button data-mode="list" class="${mode === "list" ? "active" : ""}">قائمة الآيات</button>
      <button data-mode="mushaf" class="${mode === "mushaf" ? "active" : ""}">المصحف</button>
    </div>
    <div class="tafsir-row"><label class="tafsir-row-label" for="surah-tafsir">التفسير:</label>${pick}</div>
  </div>
  ${bisLine}
  <div id="surah-body"></div>
  <div style="max-width:880px;margin:0 auto;padding:0 24px 40px;display:flex;justify-content:space-between">${prev}${next}</div>` + footer;
  bindTheme();
  bindTafsirPicks();

  document.querySelectorAll(".mode-toggle button").forEach((b) =>
    b.addEventListener("click", () => { location.hash = `#/s/${n}${b.dataset.mode === "mushaf" ? "/mushaf" : ""}`; }));

  const body = $("#surah-body");
  if (mode === "mushaf") {
    const parts = d.verses.map((v) =>
      `<span class="m-ayah" data-k="${v.k}" id="a-${v.a}">${v.t}<span class="ayah-marker">${arNum(v.a)}</span></span>`);
    body.innerHTML = `<div class="mushaf">${parts.join(" ")}</div>`;
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
        <div class="ayah-foot">
          <button class="tafsir-btn">قراءة التفسير</button>
        </div>
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
  document.title = `وحي — سورة ${d.ar}`;
  idle(() => {
    prefetchSurah(n - 1); prefetchSurah(n + 1);
    tafsirData(tafsirSlug).catch(() => {});
  });
}

/* ---------- hadith ---------- */
const HUKM_CLASS = {
  "صحيح": "h-sahih", "حسن": "h-hasan",
  "ضعيف": "h-daif", "شديد الضعف": "h-daif",
  "موضوع": "h-mawdu", "متهم بالوضع": "h-mawdu",
};
const hukmPill = (h) => `<span class="hukm-pill ${HUKM_CLASS[h] || "h-other"}">${esc(h)}</span>`;

async function renderHadithHome() {
  const books = await booksIndex();
  const six = books.filter((b) => b.d || b.i <= 6);
  const rest = books.filter((b) => !(b.d || b.i <= 6));
  const total = books.reduce((s, b) => s + b.q, 0);
  const card = (b) => {
    const inner = `<span class="names"><span class="book-name">${esc(b.n)}</span>
      <div class="surah-en">${esc(b.a)}</div></span>
      <span class="surah-meta"><span class="pill">${esc(b.t)}</span><br>
      ${arNum(b.q)} حديثاً${b.m ? ` · ${arNum(b.m)} معنى` : ""}</span>`;
    return b.d
      ? `<a class="surah-card book-card" href="#/h/${b.s}">${inner}</a>`
      : `<div class="surah-card book-card disabled"><span class="names"><span class="book-name">${esc(b.n)}</span>
        <div class="surah-en">${esc(b.a)}</div></span>
        <span class="surah-meta"><span class="pill pill-dim">قريباً</span><br>${arNum(b.q)} حديثاً</span></div>`;
  };
  app.innerHTML = header() + `
  <section class="hero">
    <h1>قسم <span class="accent">الحديث</span></h1>
    <p>مكتبة «الجامع» — ${arNum(books.length)} كتاباً يضم ${arNum(total)} وردة حديث تجميعها بمعانيها الفريدة. ابدأ بالكتب الستة.</p>
  </section>
  <a class="topics-cta" href="#/hadith/topics">
    <span class="topics-cta-t">🗂 الفهرس الموضوعي الموحد</span>
    <span class="topics-cta-s">تصفّح موضوعات الحديث — الإيمان، العبادات، المعاملات، السيرة… — واعرف مَن قال فيها من الكتب الستة</span>
  </a>
  <h2 class="books-h">الكتب الستة</h2>
  <div class="surah-grid">${six.map(card).join("")}</div>
  <h2 class="books-h">بقية الكتب (${arNum(rest.length)})</h2>
  <div class="surah-grid books-rest">${rest.map(card).join("")}</div>` + footer;
  document.title = "وحي — قسم الحديث";
}

let bookCtx = null; /* {slug, b} while a book page is shown */
let hPanelSeq = 0;

/* unified topical index (al-Jami topics tree × the six books' meanings) */
let TIDX = null;           /* topics.json: {t:{id:{n,p,l,b}}, g:{leafTid:[gid]}} */
let TCHILD = null;         /* parent -> [child ids] */
let BSLUG = null;          /* book_id -> {s, n} */
async function topics() {
  if (!TIDX) {
    TIDX = await topicsIndex();
    TCHILD = {};
    for (const [id, t] of Object.entries(TIDX.t))
      (TCHILD[t.p] ??= []).push(+id);
    const books = await booksIndex();
    BSLUG = {};
    for (const b of books) if (b.d) BSLUG[b.i] = b;
  }
  return TIDX;
}
/* all leaf group ids under a topic node (own + descendants') */
function topicGids(tid) {
  const out = [];
  const stack = [tid];
  while (stack.length) {
    const id = stack.pop();
    if (TIDX.g[id]) out.push(...TIDX.g[id]);
    for (const c of TCHILD[id] || []) stack.push(c);
  }
  return out;
}
const topicCrumb = (tid) => {
  const names = [];
  for (let j = tid; j && TIDX.t[j]; j = TIDX.t[j].p) names.unshift(TIDX.t[j].n);
  return names.join(" ‹ ");
};

async function renderTopics(tid) {
  app.innerHTML = header() + '<div class="page-loading"><span class="spinner"></span> يُحمَّل الفهرس…</div>';
  bindTheme();
  await topics();
  const kids = (TCHILD[tid ?? 1] || []).filter((c) => TIDX.t[c]);
  kids.sort((a, b) => TIDX.t[a].n.localeCompare(TIDX.t[b].n, "ar"));
  const cur = tid ? TIDX.t[tid] : null;
  const leafGids = tid && TIDX.g[tid] ? TIDX.g[tid] : null;
  const booksHtml = cur ? await (async () => {
    const cov = Object.entries(cur.b || {}).filter(([, c]) => c > 0);
    if (!cov.length) return "";
    cov.sort((a, b) => b[1] - a[1]);
    return `<h2 class="books-h">مَن قال في هذا الموضوع</h2>
      <div class="surah-grid">${cov.map(([bid, c]) => {
        const bk = BSLUG[bid]; if (!bk) return "";
        return `<a class="surah-card book-card" href="#/t/${tid}/${bk.s}">
          <span class="names"><span class="book-name">${esc(bk.n)}</span>
          <div class="surah-en">${arNum(c)} معنى في هذا الموضوع</div></span>
          <span class="surah-meta"><span class="pill">تصفّح</span></span></a>`;
      }).join("")}</div>`;
  })() : "";
  app.innerHTML = header() + `
  <div class="surah-head">
    <a class="back-link" href="${cur ? `#/hadith/topics/${cur.p || ""}` : "#/hadith"}">→ ${cur ? "أعلى" : "قسم الحديث"}</a>
    <h1 class="book-title" style="font-size:clamp(26px,4.5vw,40px)">${cur ? esc(cur.n) : "الفهرس الموضوعي الموحد"}</h1>
    ${cur ? `<div class="surah-title-meta">${esc(topicCrumb(tid))}</div>` :
      `<p class="hero-sub">شجرة موضوعات «الجامع» فوق مجموعات المعاني — اختر الموضوع لتجد مَن قال فيه من الكتب الستة.</p>`}
  </div>
  ${kids.length ? `<div class="topic-list">${kids.map((k) => {
    const t = TIDX.t[k];
    const nb = Object.keys(t.b || {}).length;
    return `<a class="topic-row" href="#/hadith/topics/${k}">
      <span class="topic-name">${esc(t.n)}</span>
      <span class="topic-meta">${nb ? `${arNum(nb)} كتب` : ""} ${TIDX.g[k] ? "◈" : "›"}</span></a>`;
  }).join("")}</div>` : ""}
  ${booksHtml}` + footer;
  document.title = cur ? `وحي — ${cur.n}` : "وحي — الفهرس الموضوعي";
}

/* book's meaning-groups under a topic — "اختر الكتاب واقرأ نص المؤلف" */
async function renderTopicBook(tid, slug) {
  app.innerHTML = header() + '<div class="page-loading"><span class="spinner"></span> يُحمَّل الموضوع…</div>';
  bindTheme();
  await topics();
  const [b, det] = await Promise.all([bookData(slug), bookDetail(slug)]);
  const gids = new Set(topicGids(tid).map(String));
  const rows = Object.entries(det.g).filter(([gid]) => gids.has(gid))
    .sort((x, y) => x[1].hs[0] - y[1].hs[0]);
  app.innerHTML = header() + `
  <div class="surah-head">
    <a class="back-link" href="#/hadith/topics/${tid}">→ ${esc(TIDX.t[tid]?.n || "الموضوع")}</a>
    <h1 class="book-title" style="font-size:clamp(24px,4vw,36px)">${esc(b.n)}</h1>
    <div class="surah-title-meta">${esc(topicCrumb(tid))} · ${arNum(rows.length)} معنى</div>
  </div>
  <div class="hadith-list">${rows.map(([gid, g]) => `
    <div class="ayah-card hadith-card meaning-card" data-no="${g.hs[0]}" role="button" tabindex="0">
      <div class="hadith-head">${hukmPill(g.h)}
        <span class="pill">${arNum(g.hs.length)} وروداً</span>
        <span class="pill">${arNum(g.s)} صحابياً</span></div>
      <div class="hadith-text">${esc(g.t)}</div>
      <div class="group-hs">${g.hs.map((n) => `<a class="h-link" href="#/h/${slug}/${n}">${arNum(n)}</a>`).join(" ")}</div>
    </div>`).join("")}</div>` + footer;
  document.title = `وحي — ${b.n}`;
  bookCtx = { slug, b };
  $("#app .hadith-list").addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    const c = e.target.closest(".hadith-card");
    if (c) openHadith(slug, +c.dataset.no);
  });
}
const H_PAGE = 200;
const hCard = (h) => `
  <div class="ayah-card hadith-card" data-no="${h.n}" role="button" tabindex="0">
    <div class="hadith-head"><span class="hadith-num">${arNum(h.n)}</span>
      ${hukmPill(h.h)}<span class="pill pill-type">${esc(h.y)}</span></div>
    <div class="hadith-text">${esc(h.x)}</div>
  </div>`;

async function renderBook(slug, openNo) {
  app.innerHTML = header() + '<div class="page-loading"><span class="spinner"></span> يُحمَّل الكتاب…</div>';
  bindTheme();
  let b;
  try { b = await bookData(slug); } catch { location.hash = "#/hadith"; return; }
  bookCtx = { slug, b };
  document.title = `وحي — ${b.n}`;
  app.innerHTML = header() + `
  <div class="surah-head">
    <a class="back-link" href="#/hadith">→ كل الكتب</a>
    <div class="surah-title-row">
      <h1 class="book-title">${esc(b.n)}</h1>
      <div class="surah-title-meta">${esc(b.a)} · ${arNum(b.q)} حديثاً · ${arNum(b.m)} معنى</div>
    </div>
    <div class="mode-toggle" id="book-modes">
      <button data-mode="hadiths" class="active">الأحاديث</button>
      <button data-mode="meanings">المعاني</button>
      <button data-mode="topics">الموضوعات</button>
    </div>
    <div class="book-search"><input class="search" id="hq" placeholder="ابحث في أحاديث الكتاب…" autocomplete="off"></div>
  </div>
  <div class="hadith-list" id="hlist"></div>` + footer;
  bindTheme();

  const list = $("#hlist");
  let cur = b.h, shown = 0, mode = "hadiths";
  const drawChunk = (reset) => {
    if (reset) { shown = 0; list.innerHTML = ""; }
    const slice = cur.slice(shown, shown + H_PAGE);
    shown += slice.length;
    list.querySelector(".more-wrap")?.remove();
    list.insertAdjacentHTML("beforeend", slice.map(hCard).join("") +
      (shown < cur.length
        ? `<div class="more-wrap"><button class="tafsir-btn" id="hmore">عرض المزيد — بقي ${arNum(cur.length - shown)}</button></div>`
        : ""));
  };
  const drawMeanings = async () => {
    list.innerHTML = '<div class="panel-loading"><span class="spinner"></span> تُجمَّع المعاني…</div>';
    const det = await bookDetail(slug);
    const gs = Object.entries(det.g).sort((x, y) => x[1].hs[0] - y[1].hs[0]);
    list.innerHTML = gs.map(([gid, g]) => `
      <div class="ayah-card hadith-card meaning-card" data-no="${g.hs[0]}" role="button" tabindex="0">
        <div class="hadith-head">${hukmPill(g.h)}
          <span class="pill">${arNum(g.hs.length)} وروداً</span>
          <span class="pill">${arNum(g.s)} صحابياً</span></div>
        <div class="hadith-text">${esc(g.t)}</div>
        <div class="group-hs">${g.hs.map((n) => `<a class="h-link" href="#/h/${slug}/${n}">${arNum(n)}</a>`).join(" ")}</div>
      </div>`).join("");
  };
  /* in-book topical browse: book's own toc tree over its meaning groups */
  const drawTopics = async (tid = null) => {
    list.innerHTML = '<div class="panel-loading"><span class="spinner"></span> تُحمَّل موضوعات الكتاب…</div>';
    const [toc, det] = await Promise.all([bookToc(slug), bookDetail(slug)]);
    const nodes = toc.t, lg = toc.g;
    const kids = {};
    const roots = [];
    for (const [id, t] of Object.entries(nodes)) {
      if (t.p && nodes[t.p]) (kids[t.p] ??= []).push(+id);
      else roots.push(+id);
    }
    const row = (k) => {
      const t = nodes[k];
      const hasKids = kids[k]?.length;
      const gids = collectGids(k, kids, lg);
      return `<a class="topic-row" href="#" data-t="${k}">
        <span class="topic-name">${esc(t.n)}</span>
        <span class="topic-meta">${gids.size ? `${arNum(gids.size)} معنى` : ""} ${hasKids ? "›" : "◈"}</span></a>`;
    };
    function collectGids(id, ch, lg) {
      const out = new Set(lg[id] || []);
      for (const c of ch[id] || []) for (const g of collectGids(c, ch, lg)) out.add(g);
      return out;
    }
    const cur = tid ? nodes[tid] : null;
    const items = cur ? (kids[tid] || [])
      : (roots.length === 1 && kids[roots[0]] ? kids[roots[0]] : roots);
    items.sort((a, b) => nodes[a].n.localeCompare(nodes[b].n, "ar"));
    const gids = cur ? collectGids(tid, kids, lg) : new Set();
    const cards = cur && gids.size
      ? Object.entries(det.g).filter(([gid]) => gids.has(+gid))
          .sort((x, y) => x[1].hs[0] - y[1].hs[0]).slice(0, 120)
          .map(([gid, g]) => `
        <div class="ayah-card hadith-card meaning-card" data-no="${g.hs[0]}" role="button" tabindex="0">
          <div class="hadith-head">${hukmPill(g.h)}
            <span class="pill">${arNum(g.hs.length)} وروداً</span></div>
          <div class="hadith-text">${esc(g.t)}</div>
          <div class="group-hs">${g.hs.map((n) => `<a class="h-link" href="#/h/${slug}/${n}">${arNum(n)}</a>`).join(" ")}</div>
        </div>`).join("") : "";
    list.innerHTML =
      (cur ? `<a class="back-link" href="#" data-t="${cur.p && nodes[cur.p] ? cur.p : ""}">→ أعلى</a>
              <h3 class="books-h" style="padding:4px 0 10px">${esc(cur.n)}</h3>` : "") +
      items.map(row).join("") + cards;
    list.querySelectorAll(".topic-row, .back-link").forEach((el) =>
      el.addEventListener("click", (e) => { e.preventDefault(); drawTopics(el.dataset.t || null); }));
  };
  drawChunk();
  $("#hq").addEventListener("input", (e) => {
    const q = e.target.value.trim();
    if (mode !== "hadiths") return;
    cur = q ? b.h.filter((h) => h.x.includes(q)) : b.h;
    drawChunk(true);
  });
  $("#book-modes").querySelectorAll("button").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.mode === mode) return;
      mode = btn.dataset.mode;
      $("#book-modes").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === btn));
      if (mode === "meanings") drawMeanings();
      else if (mode === "topics") drawTopics();
      else { cur = b.h; drawChunk(true); }
    }));
  list.addEventListener("click", (e) => {
    if (e.target.id === "hmore") return drawChunk();
    if (e.target.closest("a")) return;
    const c = e.target.closest(".hadith-card");
    if (c) location.hash = `#/h/${slug}/${c.dataset.no}`;
  });
  list.addEventListener("keydown", (e) => {
    const c = e.target.closest(".hadith-card");
    if (c && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      location.hash = `#/h/${slug}/${c.dataset.no}`;
    }
  });
  if (openNo) openHadith(slug, openNo);
  idle(() => bookDetail(slug).catch(() => {}));
}

async function openHadith(slug, no) {
  const seq = ++hPanelSeq;
  $("#tafsir-panel").classList.add("hadith-mode");
  $("#panel-title").textContent = `${bookCtx?.b?.n || ""} — الحديث ${arNum(no)}`;
  $("#panel-ayah").textContent = "";
  $("#panel-body").innerHTML = '<div class="panel-loading"><span class="spinner"></span> يُحمَّل الحديث…</div>';
  $("#tafsir-overlay").classList.remove("hidden");
  $("#tafsir-panel").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  try {
    const det = await bookDetail(slug);
    if (seq !== hPanelSeq) return;
    const d = det.d[String(no)];
    const ss = det.s[String(no)] || [];
    const g = d && d.g != null ? det.g[String(d.g)] : null;
    const thin = bookCtx?.b?.h.find((x) => x.n === no);
    $("#panel-ayah").textContent = thin ? thin.x : "";
    let body = "";
    if (thin) {
      body += `<div class="h-badges">${hukmPill(thin.h)}<span class="pill pill-type">${esc(thin.y)}</span></div>`;
    }
    if (d && d.m) body += `<div class="h-sec-h">المتن</div><div class="h-body-matn">${esc(d.m)}</div>`;
    if (ss.length) {
      body += `<div class="h-sec-h">الإسناد (${arNum(ss.length)} ${ss.length === 1 ? "طريق" : "طرق"})</div>`;
      ss.forEach(([hukum, chain], i) => {
        body += `<div class="sanad-block">` +
          (ss.length > 1 ? `<div class="sanad-n">طريق ${arNum(i + 1)}</div>` : "") +
          `<div class="sanad-hukm">${esc(hukum)}</div>
           <div class="sanad-chain">${chain.map((n) => `<span class="rawi-chip">${esc(n)}</span>`).join('<span class="chain-arrow">←</span>')}</div>
        </div>`;
      });
    }
    if (g) {
      const allBooks = (await booksIndex().catch(() => [])) || [];
      const bookName = Object.fromEntries(allBooks.map((x) => [x.s, x.n]));
      const also = g.x ? Object.entries(g.x)
        .filter(([s]) => s !== slug && bookName[s])
        .map(([s, n]) => `<a class="h-link h-link-book" href="#/h/${s}/${n}">${esc(bookName[s])}</a>`).join(" ") : "";
      body += `<div class="h-sec-h">المعنى</div><div class="group-box">
        <div class="group-taraf">${esc(g.t)}</div>
        <div class="group-meta">${hukmPill(g.h)} رواه ${arNum(g.s)} من الصحابة · يتكرر ${arNum(g.r)} مرة في المكتبة</div>
        ${g.hs.length > 1 ? `<div class="group-hs">وروده في ${esc(bookCtx?.b?.n || "الكتاب")}: ${g.hs.map((n) => `<a class="h-link" href="#/h/${slug}/${n}">${arNum(n)}</a>`).join(" ")}</div>` : ""}
        ${also ? `<div class="group-hs">رواه أيضاً في: ${also}</div>` : ""}
      </div>`;
    }
    $("#panel-body").innerHTML = body || '<div class="panel-loading">لا تفاصيل إضافية.</div>';
  } catch {
    if (seq !== hPanelSeq) return;
    $("#panel-body").innerHTML =
      '<div class="panel-loading">تعذّر تحميل التفاصيل — <button class="tafsir-btn" id="h-retry">أعد المحاولة</button></div>';
    $("#h-retry")?.addEventListener("click", () => openHadith(slug, no));
  }
}
/* ---------- router ---------- */
async function render() {
  const h = location.hash || "#/";
  const hm = h.match(/^#\/h\/([a-z0-9-]+?)(?:\/(\d+))?$/);
  if (hm) {
    if (bookCtx?.slug === hm[1] && $("#hlist")) {
      /* same book — only toggle the panel, no re-render */
      if (hm[2]) openHadith(hm[1], +hm[2]);
      else closeTafsir();
      return;
    }
    bookCtx = null;
    closeTafsir();
    await renderBook(hm[1], hm[2] ? +hm[2] : null);
    scrollTo(0, 0);
    return;
  }
  bookCtx = null;
  closeTafsir();
  const tb = h.match(/^#\/t\/(\d+)\/([a-z0-9-]+)$/);
  if (tb) { await renderTopicBook(+tb[1], tb[2]); scrollTo(0, 0); return; }
  const tp = h.match(/^#\/hadith\/topics(?:\/(\d+))?$/);
  if (tp) { await renderTopics(tp[1] ? +tp[1] : null); scrollTo(0, 0); return; }
  const m = h.match(/^#\/s\/(\d+)(\/(mushaf|a\/(\d+)))?$/);
  if (!m?.[4]) scrollTo(0, 0);
  if (m) {
    const n = Math.min(114, Math.max(1, +m[1]));
    const mode = m[3] === "mushaf" ? "mushaf" : "list";
    await renderSurah(n, mode, m[4] ? +m[4] : null);
  } else if (h === "#/hadith") {
    document.title = "وحي — قسم الحديث";
    scrollTo(0, 0);
    await renderHadithHome();
    bindTheme();
  } else {
    document.title = "وحي — القرآن والحديث والتفسير";
    await renderHome();
    bindTheme();
  }
}
addEventListener("hashchange", render);
render();
