/* المفسِّر — مصحف حقيقي (صفحات المصحف الـ604) + تفسير السعدي، بثيم المنظومة */
const $ = (s) => document.querySelector(s);
const app = $("#app");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const AR_D = "٠١٢٣٤٥٦٧٨٩";
const arNum = (n) => String(n).replace(/\d/g, (d) => AR_D[+d]);
const TAF_NAME = "تفسير السعدي";
const JUZ_STARTS = [[1,1],[2,142],[2,253],[3,93],[4,24],[4,148],[5,82],[6,111],[7,88],[8,41],[9,93],[11,6],[12,53],[15,1],[17,1],[18,75],[21,1],[23,1],[25,21],[27,56],[29,46],[33,31],[36,28],[39,32],[41,47],[46,1],[51,31],[58,1],[67,1],[78,1]];
const TOTAL_PAGES = 604;

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
const pagesData = () => load("data/pages.json");
let indexCache = null;
const surahsIndex = async () => { if (!indexCache) indexCache = await load("data/index.json"); return indexCache; };
const prefetchSurah = (n) => { if (n >= 1 && n <= 114) surahData(n).catch(() => {}); };
const idle = (f) => (window.requestIdleCallback ? window.requestIdleCallback(f) : setTimeout(f, 300));
async function pageOf(s, a) {
  const pg = await pagesData();
  for (const k in pg) for (const [ns, f, t] of pg[k]) if (ns === s && a >= f && a <= t) return +k;
  return 1;
}
async function surahPageList(s) {
  const d = await surahData(s);
  const seen = []; const set = new Set();
  for (const v of d.verses) if (!set.has(v.p)) { set.add(v.p); seen.push(v.p); }
  return { d, pages: seen };
}

/* ---------- shared chrome ---------- */
const header = () => `
<header class="site-head">
  <a class="brand" href="#/"><span class="brand-mark">م</span><span class="brand-txt">المفسِّر<br><small>المصحف · ${TAF_NAME}</small></span></a>
  <nav class="top-nav"><a href="#/">السور</a><a href="#/m/1">المصحف</a></nav>
</header>`;
const footer = `<footer class="site-foot">النص القرآني: Uthmani (QUL) · التفسير: ${TAF_NAME} «تيسير الكريم الرحمن» · بوابة التفسير — ساسي</footer>`;

function groupLabel(g) {
  const f = +g.f.split(":")[1], t = +g.t.split(":")[1];
  return f === t ? `الآية ${arNum(f)}` : `الآيات ${arNum(f)}–${arNum(t)}`;
}

/* ---------- tafsir panel ---------- */
let curSurah = null, curIdx = -1;
function openTafsir(d, verseKey) {
  const i = d.verses.findIndex((x) => x.k === verseKey);
  if (i < 0) return;
  curSurah = d; curIdx = i;
  const v = d.verses[i];
  const wasClosed = $("#tafsir-panel").classList.contains("hidden");
  $("#panel-title").textContent = `سورة ${d.ar}`;
  $("#panel-ayah").textContent = v.t;
  $("#panel-body").innerHTML = "";
  $("#tafsir-overlay").classList.remove("hidden");
  $("#tafsir-panel").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  if (wasClosed) { try { history.pushState({ mufassirPanel: 1 }, ""); } catch (e) {} }
  try { localStorage.setItem("mufassir-last", `${d.n}:${v.a}`); } catch (e) {}
  const g = d.groups[v.g];
  if (g) {
    $("#panel-title").textContent = `سورة ${d.ar} — ${groupLabel(g)}`;
    $("#panel-body").textContent = g.x;
  } else {
    $("#panel-body").innerHTML = `<div class="panel-loading">لا يغطي تفسير السعدي هذه الآية مستقلاً.</div>`;
  }
  $("#panel-prev").disabled = i <= 0;
  $("#panel-next").disabled = i >= d.verses.length - 1;
  $("#panel-ayah").scrollTop = 0; $("#panel-body").scrollTop = 0;
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
  }
});
function closeTafsir() {
  $("#tafsir-overlay").classList.add("hidden");
  $("#tafsir-panel").classList.add("hidden");
  document.body.style.overflow = "";
}
$("#tafsir-overlay").addEventListener("click", closeTafsir);
$("#panel-close").addEventListener("click", closeTafsir);
addEventListener("keydown", (e) => e.key === "Escape" && closeTafsir());
// phone back: closes the open panel first (one history level), else walks the hash history
addEventListener("popstate", (e) => {
  if (!$("#tafsir-panel").classList.contains("hidden")) { closeTafsir(); }
});

/* ---------- page flip (swipe + edge taps) ---------- */
function bindFlip(el, goPrev, goNext) {
  let x0 = 0, y0 = 0;
  el.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) { dx > 0 ? goPrev() : goNext(); }
  }, { passive: true });
  el.querySelectorAll(".flip-zone").forEach((z) =>
    z.addEventListener("click", (e) => { if (e.target === z) (z.dataset.dir === "prev" ? goPrev() : goNext()); }));
}

/* ---------- home ---------- */
async function renderHome() {
  const idx = await surahsIndex();
  let resume = "";
  try {
    const last = localStorage.getItem("mufassir-last");
    if (last) {
      const [s, a] = last.split(":").map(Number);
      const sIdx = idx.find((x) => x.n === s);
      const p = await pageOf(s, a);
      if (sIdx) resume = `<a class="resume" href="#/m/${p}">متابعة من آخر قراءة: ${esc(sIdx.ar)}، الآية ${arNum(a)} ←</a>`;
    }
  } catch (e) {}
  const juzPages = await Promise.all(JUZ_STARTS.map(([s, a]) => pageOf(s, a)));
  app.innerHTML = header() + `
  <section class="hero">
    <h1>القرآن بـ<span class="accent">تفسير السعدي</span></h1>
    <p>مصحف حقيقي — قلّب صفحاته كالكتاب، وانقر أي آية تقرأ تفسيرها.</p>
    <div class="quick">
      <input id="q" class="search" type="search" placeholder="ابحث عن سورة — بالاسم أو الرقم…" autocomplete="off">
      <input id="go" class="search goto" type="text" inputmode="numeric" placeholder="سورة:آية مثل 2:255">
    </div>
    ${resume}
    <div class="juz-row" id="juz"><span class="juz-lbl">الأجزاء:</span>${juzPages.map((p, i) =>
      `<a class="juz-chip" href="#/m/${p}" title="الجزء ${arNum(i + 1)} — صفحة ${arNum(p)}">${arNum(i + 1)}</a>`).join("")}</div>
  </section>
  <div class="surah-grid" id="grid"></div>` + footer;
  const draw = (list) => {
    $("#grid").innerHTML = list.map((s) => `
      <a class="surah-card" href="#/s/${s.n}">
        <span class="surah-num">${arNum(s.n)}</span>
        <span class="surah-name">${esc(s.ar)}<small>${esc(s.en)}</small></span>
        <span class="surah-meta">${s.place} · ${arNum(s.ayahs)} آية</span>
      </a>`).join("");
  };
  draw(idx);
  $("#q").addEventListener("input", (e) => {
    const t = e.target.value.trim();
    draw(idx.filter((s) => s.ar.includes(t) || s.en.toLowerCase().includes(t.toLowerCase()) || String(s.n) === t));
  });
  const gotoAyah = () => {
    const m = $("#go").value.match(/(\d{1,3})\s*[:/\s]\s*(\d{1,3})/);
    if (m && +m[1] >= 1 && +m[1] <= 114) location.hash = `#/s/${+m[1]}/a/${+m[2]}`;
  };
  $("#go").addEventListener("keydown", (e) => e.key === "Enter" && gotoAyah());
  document.title = "المفسِّر — القرآن بتفسير السعدي";
}

/* ---------- mushaf: the real book ---------- */
function surahBanner(d) {
  const bis = d.bismillah ? `<div class="bismillah">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</div>` : "";
  return `<div class="surah-banner"><span class="ornament">﴾</span><span class="surah-banner-name">سورة ${esc(d.ar)}</span><span class="ornament">﴿</span></div>${bis}`;
}
async function renderMushafPage(k) {
  k = Math.min(TOTAL_PAGES, Math.max(1, k));
  app.innerHTML = header() + '<div class="page-loading"><span class="spinner"></span> يُحمَّل الصفحة…</div>';
  const pg = await pagesData();
  const ranges = pg[k];
  const surahs = {};
  await Promise.all([...new Set(ranges.map((r) => r[0]))].map(async (n) => { surahs[n] = await surahData(n); }));
  let html = "", juz = null;
  for (const [s, f, t] of ranges) {
    const d = surahs[s];
    if (f === 1) html += surahBanner(d);
    for (const v of d.verses) {
      if (v.a < f || v.a > t) continue;
      if (juz === null) juz = v.j;
      html += `<span class="m-ayah" data-s="${s}" data-k="${v.k}" id="a-${s}-${v.a}">${v.t}<span class="ayah-marker">${arNum(v.a)}</span></span> `;
    }
  }
  app.innerHTML = `
  <div class="mushaf-book">
    <div class="mushaf-page" id="mpage">
      <div class="mushaf-frame">
        <div class="frame-top">
          <span></span>
          <span class="mushaf-part">الجزء ${arNum(juz ?? "")}</span>
        </div>
        <div class="mushaf-text" id="mtext">${html}</div>
        <div class="frame-bottom">
          <a class="flip-btn" href="#/m/${k - 1}" ${k <= 1 ? 'style="visibility:hidden"' : ""}>‹</a>
          <span class="page-num">${arNum(k)}</span>
          <a class="flip-btn" href="#/m/${k + 1}" ${k >= TOTAL_PAGES ? 'style="visibility:hidden"' : ""}>›</a>
        </div>
      </div>
      <div class="flip-zone" data-dir="prev" aria-label="الصفحة السابقة"></div>
      <div class="flip-zone" data-dir="next" aria-label="الصفحة التالية"></div>
    </div>
  </div>`;
  fitText($("#mtext"));
  const mp = $("#mpage");
  document.body.style.overflow = "hidden";
  const mtext = $("#mtext");
  const frame = mp.querySelector(".mushaf-frame");
  let fs = 1.3;
  while (fs > 0.62 && (mtext.scrollHeight > mtext.clientHeight || mtext.scrollWidth > mtext.clientWidth)) {
    fs -= 0.02;
    frame.style.fontSize = fs + "rem";
  }
  mp.querySelectorAll(".m-ayah").forEach((el) =>
    el.addEventListener("click", () => {
      mp.querySelectorAll(".m-ayah.active").forEach((x) => x.classList.remove("active"));
      el.classList.add("active");
      openTafsir(surahs[+el.dataset.s], el.dataset.k);
    }));
  bindFlip(mp, () => { if (k > 1) location.hash = `#/m/${k - 1}`; }, () => { if (k < TOTAL_PAGES) location.hash = `#/m/${k + 1}`; });
  document.title = `المفسِّر — صفحة ${arNum(k)}`;
  idle(() => {
    const nx = pg[k + 1], pv = pg[k - 1];
    [...(nx || []), ...(pv || [])].forEach(([s]) => prefetchSurah(s));
  });
}

/* ---------- auto-fit: shrink text until the page fully fits — no scroll ever ---------- */
function fitText(el) {
  el.style.fontSize = "";
  let fs = parseFloat(getComputedStyle(el).fontSize);
  while (fs > 11 && el.scrollHeight > el.clientHeight) { fs -= 0.5; el.style.fontSize = fs + "px"; }
}

/* ---------- surah view (real page numbers) ---------- */
async function renderSurah(n, ayah, pageK) {
  app.innerHTML = header() + '<div class="page-loading"><span class="spinner"></span> يُحمَّل السورة…</div>';
  const { d, pages } = await surahPageList(n);
  let k = null;
  if (pageK) {
    k = pageK;
  } else if (ayah) {
    const v = d.verses.find((x) => x.a === ayah);
    k = v ? v.p : pages[0];
  } else if (pageK != null) k = pages.includes(pageK) ? pageK : pages[0];
  else k = pages[0];
  const slice = d.verses.filter((v) => v.p === k);
  const first = slice[0], last = slice[slice.length - 1];
  const pos = pages.indexOf(k);
  const bisLine = first.a === 1 && d.bismillah ? `<div class="bismillah">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</div>` : "";
  app.innerHTML = `
  <div class="mushaf-book">
    <div class="mushaf-page" id="mpage">
      <div class="mushaf-frame">
        <div class="frame-top">
          <span class="mushaf-part">سورة ${esc(d.ar)} · ${d.place}</span>
        </div>
        <div class="mushaf-text" id="mtext">${bisLine}${slice.map((v) =>
          `<span class="m-ayah" data-k="${v.k}" id="a-${v.a}">${v.t}<span class="ayah-marker">${arNum(v.a)}</span></span>`).join(" ")}</div>
        <div class="frame-bottom">
          <a class="flip-btn" href="#/s/${n}/p/${k - 1}" ${pos <= 0 ? 'style="visibility:hidden"' : ""}>‹</a>
          <span class="page-num">${arNum(k)}</span>
          <a class="flip-btn" href="#/s/${n}/p/${k + 1}" ${pos >= pages.length - 1 ? 'style="visibility:hidden"' : ""}>›</a>
        </div>
      </div>
      <div class="flip-zone" data-dir="prev" aria-label="الصفحة السابقة"></div>
      <div class="flip-zone" data-dir="next" aria-label="الصفحة التالية"></div>
    </div>
  </div>`;
  fitText($("#mtext"));
  const mp = $("#mpage");
  mp.querySelectorAll(".m-ayah").forEach((el) =>
    el.addEventListener("click", () => {
      mp.querySelectorAll(".m-ayah.active").forEach((x) => x.classList.remove("active"));
      el.classList.add("active");
      openTafsir(d, el.dataset.k);
    }));
  bindFlip(mp, () => { if (pos > 0) location.hash = `#/s/${n}/p/${k - 1}`; }, () => { if (pos < pages.length - 1) location.hash = `#/s/${n}/p/${k + 1}`; });
  if (ayah) setTimeout(() => openTafsir(d, `${n}:${ayah}`), 150);
  document.title = `المفسِّر — سورة ${d.ar}`;
  idle(() => { prefetchSurah(n - 1); prefetchSurah(n + 1); });
}

/* ---------- router ---------- */
async function route() {
  const h = location.hash || "#/";
  if (!/^#\/m\//.test(h)) document.body.style.overflow = "";
  let m = h.match(/^#\/m\/(\d+)/);
  if (m) { closeTafsir(); renderMushafPage(+m[1]).catch(() => { app.innerHTML = header() + '<div class="page-loading">تعذّر تحميل الصفحة.</div>' + footer; }); return; }
  m = h.match(/^#\/s\/(\d+)/);
  if (m) {
    if (!/a\/\d+/.test(h)) closeTafsir();
    const n = Math.min(114, Math.max(1, +m[1]));
    const pm = h.match(/\/p\/(\d+)/), am = h.match(/\/a\/(\d+)/);
    if (pm) {
      // real mushaf page number within this surah
      (async () => {
        const { pages } = await surahPageList(n);
        const k = +pm[1];
        if (pages.includes(k)) renderSurah(n, null, k); else renderSurah(n, null);
      })().catch(() => { app.innerHTML = header() + '<div class="page-loading">تعذّر تحميل السورة.</div>' + footer; });
      return;
    }
    renderSurah(n, am ? +am[1] : null).catch(() => {
      app.innerHTML = header() + '<div class="page-loading">تعذّر تحميل السورة.</div>' + footer;
    });
  } else {
    closeTafsir();
    renderHome().catch(() => {
      app.innerHTML = header() + '<div class="page-loading">تعذّر تحميل الفهرس.</div>' + footer;
    });
  }
}
function renderSurahAt(n, k) {
  // render surah page by real mushaf page number — page turn, no auto-tafsir
  renderSurah(n, null, k).then(() => {});
}
addEventListener("hashchange", route);
route();
