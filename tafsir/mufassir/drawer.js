/* درج الفهرس الأيمن — السور/الأجزاء/الأحزاب/آيات السورة الحالية
   API: window.MufassirDrawer.open() / .close() — يعتمد window.Mufassir */
(function () {
  const M = () => window.Mufassir;
  let ov = null, currentTab = "s", pushed = false;
  let cache = null;

  async function data() {
    if (cache) return cache;
    const [idx, pg, hz] = await Promise.all([M().surahsIndex(), M().pagesData(), M().ahzabData()]);
    const firstPageOf = new Map();
    for (const k in pg) for (const [s] of pg[k]) if (!firstPageOf.has(s)) firstPageOf.set(s, +k);
    cache = { idx, firstPageOf, hz };
    return cache;
  }

  const row = (n, name, page, extra = "", cur = false) =>
    `<a class="drw-row${cur ? " cur" : ""}" href="#" data-p="${page}"${extra}><span class="drw-n">${M().arNum(n)}</span><span class="drw-name">${name}</span><span class="drw-p">ص ${M().arNum(page)}</span></a>`;

  async function render(tab, d) {
    const list = ov.querySelector("#drw-list");
    const st = M().state();
    if (tab === "s") {
      const q = (ov.querySelector("#drw-q").value || "").trim();
      const f = q ? d.idx.filter((s) => s.ar.includes(q) || s.en.toLowerCase().includes(q.toLowerCase()) || String(s.n) === q) : d.idx;
      const curS = Math.min(...Object.keys(st.surahs).map(Number));
      list.innerHTML = f.map((s) => {
        const p = d.firstPageOf.get(s.n) || 1;
        return row(s.n, `${M().esc(s.ar)}<small>${M().esc(s.en)} · ${M().arNum(s.ayahs)} آية</small>`, p, "", s.n === curS);
      }).join("") || '<div class="drw-empty">لا نتائج.</div>';
    } else if (tab === "j") {
      const starts = await Promise.all(M().JUZ_STARTS.map(([s, a]) => M().pageOf(s, a)));
      list.innerHTML = starts.map((p, i) =>
        row(i + 1, `الجزء ${M().arNum(i + 1)}`, p, "", st.page >= p && (i === 29 || st.page < starts[i + 1]))).join("");
    } else if (tab === "h") {
      const pairs = await Promise.all(
        Array.from({ length: 60 }, (_, i) => d.hz[String(i + 1)] ? M().pageOf(d.hz[String(i + 1)][0], d.hz[String(i + 1)][1]) : null));
      list.innerHTML = pairs.map((p, i) => p ? row(i + 1, `الحزب ${M().arNum(i + 1)}`, p, "", st.page === p) : "").join("");
    } else if (tab === "a") {
      const nums = Object.keys(st.surahs).map(Number);
      if (!nums.length) { list.innerHTML = '<div class="drw-empty">—</div>'; return; }
      const s0 = Math.min(...nums), dd = await M().surahData(s0);
      list.innerHTML = `<div class="drw-hd">سورة ${M().esc(dd.ar)} — ${M().arNum(dd.verses.length)} آية</div>` +
        dd.verses.map((v) =>
          `<a class="drw-row${v.p === st.page ? " cur" : ""}" href="#" data-p="${v.p}" data-a="${v.a}"><span class="drw-n">${M().arNum(v.a)}</span><span class="drw-name drw-ayah">${M().esc(v.t.slice(0, 44))}…</span><span class="drw-p">ص ${M().arNum(v.p)}</span></a>`).join("");
      const cur = list.querySelector(".drw-row.cur");
      if (cur) setTimeout(() => cur.scrollIntoView({ block: "center" }), 30);
    }
  }

  function syncSearch() {
    ov.querySelector("#drw-q").classList.toggle("hidden", currentTab !== "s");
  }

  function open() {
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "drw-ov"; ov.className = "drw-overlay hidden";
      ov.innerHTML = `
      <div class="drw-sheet" role="dialog" aria-label="فهرس المصحف">
        <div class="drw-top"><span class="drw-title">فهرس المصحف</span><button class="drw-x" id="drw-x" aria-label="إغلاق">✕</button></div>
        <input id="drw-q" type="search" placeholder="ابحث في السور…" autocomplete="off">
        <div class="drw-tabs">
          <button class="drw-tab on" data-t="s">السور</button>
          <button class="drw-tab" data-t="j">الأجزاء</button>
          <button class="drw-tab" data-t="h">الأحزاب</button>
          <button class="drw-tab" data-t="a">الآيات</button>
        </div>
        <div class="drw-list" id="drw-list"></div>
      </div>`;
      document.body.appendChild(ov);
      ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
      ov.querySelector("#drw-x").addEventListener("click", () => close());
      ov.querySelectorAll(".drw-tab").forEach((b) =>
        b.addEventListener("click", () => {
          ov.querySelectorAll(".drw-tab").forEach((x) => x.classList.remove("on"));
          b.classList.add("on"); currentTab = b.dataset.t; syncSearch();
          data().then((d) => render(currentTab, d));
        }));
      ov.querySelector("#drw-q").addEventListener("input", () => {
        if (currentTab !== "s") {
          currentTab = "s";
          ov.querySelectorAll(".drw-tab").forEach((x) => x.classList.toggle("on", x.dataset.t === "s"));
        }
        data().then((d) => render("s", d));
      });
      ov.addEventListener("click", (e) => {
        const r = e.target.closest(".drw-row");
        if (!r) return;
        e.preventDefault();
        close();
        if (r.dataset.a) location.hash = `#/m/${r.dataset.p}/a/${r.dataset.a}`;
        else M().goPage(+r.dataset.p);
      });
    }
    ov.classList.remove("hidden");
    syncSearch();
    try { history.pushState({ drw: 1 }, ""); pushed = true; } catch (e) {}
    data().then((d) => render(currentTab, d));
  }

  function close(fromPop) {
    if (!ov || ov.classList.contains("hidden")) return;
    ov.classList.add("hidden");
    if (pushed && !fromPop) { pushed = false; try { history.back(); } catch (e) {} }
    else pushed = false;
  }

  addEventListener("popstate", () => { if (pushed) close(true); else if (ov && !ov.classList.contains("hidden")) close(true); });
  window.MufassirDrawer = { open, close };
})();
