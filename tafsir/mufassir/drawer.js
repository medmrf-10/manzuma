/* درج الفهرس الأيمن — سور/أجزاء/أحزاب/آيات · نسخة أولى (يحسّنها المنفذ)
   API: window.MufassirDrawer.open() / .close() — يعتمد window.Mufassir */
(function () {
  const $ = (s) => document.querySelector(s);
  const M = () => window.Mufassir;
  let built = false, ov = null, currentTab = "s";

  async function data() {
    const [idx, pg, hz] = await Promise.all([M().surahsIndex(), M().pagesData(), M().ahzabData()]);
    const firstPageOf = new Map();
    for (const k in pg) for (const [s] of pg[k]) if (!firstPageOf.has(s)) firstPageOf.set(s, +k);
    return { idx, firstPageOf, hz };
  }

  async function juzRows() {
    const starts = await Promise.all(M().JUZ_STARTS.map(([s, a]) => M().pageOf(s, a)));
    return starts.map((p, i) => `<a class="drw-row" href="#" data-p="${p}"><span class="drw-n">${M().arNum(i + 1)}</span><span class="drw-name">الجزء ${M().arNum(i + 1)}</span><span class="drw-p">ص ${M().arNum(p)}</span></a>`).join("");
  }

  async function render(tab, d) {
    const list = ov.querySelector("#drw-list");
    if (tab === "s") {
      const q = (ov.querySelector("#drw-q").value || "").trim();
      const f = q ? d.idx.filter((s) => s.ar.includes(q) || s.en.toLowerCase().includes(q.toLowerCase()) || String(s.n) === q) : d.idx;
      list.innerHTML = f.map((s) => `<a class="drw-row" href="#" data-p="${d.firstPageOf.get(s.n) || 1}"><span class="drw-n">${M().arNum(s.n)}</span><span class="drw-name">${M().esc(s.ar)}<small>${M().esc(s.en)}</small></span><span class="drw-p">ص ${M().arNum(d.firstPageOf.get(s.n) || 1)}</span></a>`).join("");
    } else if (tab === "j") {
      list.innerHTML = await juzRows();
    } else if (tab === "h") {
      const rows = [];
      for (let h = 1; h <= 60; h++) {
        const [s, a] = d.hz[String(h)] || [];
        if (!s) continue;
        const p = await M().pageOf(s, a);
        rows.push(`<a class="drw-row" href="#" data-p="${p}"><span class="drw-n">${M().arNum(h)}</span><span class="drw-name">الحزب ${M().arNum(h)}</span><span class="drw-p">ص ${M().arNum(p)}</span></a>`);
      }
      list.innerHTML = rows.join("");
    } else if (tab === "a") {
      const st = M().state();
      const nums = Object.keys(st.surahs).map(Number);
      if (!nums.length) { list.innerHTML = '<div class="drw-empty">—</div>'; return; }
      const s0 = Math.min(...nums), dd = await M().surahData(s0);
      list.innerHTML = dd.verses.filter((v) => v.p === st.page).map((v) =>
        `<a class="drw-row" href="#" data-p="${v.p}" data-a="${v.a}"><span class="drw-n">${M().arNum(v.a)}</span><span class="drw-name drw-ayah">${M().esc(v.t.slice(0, 46))}…</span></a>`).join("");
    }
  }

  function open() {
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "drw-ov"; ov.className = "drw-overlay hidden";
      ov.innerHTML = `
      <div class="drw-sheet">
        <input id="drw-q" type="search" placeholder="ابحث…" autocomplete="off">
        <div class="drw-tabs">
          <button class="drw-tab on" data-t="s">السور</button>
          <button class="drw-tab" data-t="j">الأجزاء</button>
          <button class="drw-tab" data-t="h">الأحزاب</button>
          <button class="drw-tab" data-t="a">الآيات</button>
        </div>
        <div class="drw-list" id="drw-list"></div>
        <div class="drw-foot"><button class="nav-btn" id="drw-theme">تبديل الوضع ☀/🌙</button></div>
      </div>`;
      document.body.appendChild(ov);
      ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
      ov.querySelectorAll(".drw-tab").forEach((b) =>
        b.addEventListener("click", () => {
          ov.querySelectorAll(".drw-tab").forEach((x) => x.classList.remove("on"));
          b.classList.add("on"); currentTab = b.dataset.t;
          data().then((d) => render(currentTab, d));
        }));
      ov.querySelector("#drw-q").addEventListener("input", () => {
        currentTab = "s"; ov.querySelectorAll(".drw-tab").forEach((x) => x.classList.remove("on"));
        ov.querySelector('.drw-tab[data-t="s"]').classList.add("on");
        data().then((d) => render("s", d));
      });
      ov.querySelector("#drw-theme").addEventListener("click", () => M().toggleTheme());
      ov.addEventListener("click", (e) => {
        const r = e.target.closest(".drw-row");
        if (r) { e.preventDefault(); M().goPage(+r.dataset.p); close(); }
      });
    }
    ov.classList.remove("hidden");
    try { history.pushState({ drw: 1 }, ""); } catch (e) {}
    data().then((d) => render(currentTab, d));
  }
  function close() { if (ov) ov.classList.add("hidden"); }
  addEventListener("popstate", () => { if (ov && !ov.classList.contains("hidden")) close(); });
  window.MufassirDrawer = { open, close };
})();
