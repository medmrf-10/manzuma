/* قائمة الضغط المطوّل على الآية — خدمات الآية القابلة للتوسعة
   API: window.MufassirCtx.open(ayahEl, surahData, verseKey) — verseKey "سورة:آية"
   يعتمد window.Mufassir (openTafsir/esc/arNum) */
(function () {
  const M = () => window.Mufassir;
  let ov = null, activeEl = null;

  /* بنود الخدمات — أضف بنداً هنا فقط:
     {n: العنوان, s: الوصف, icon, run: (d,k)=>{}} أو {.., off:true} لبند «قريباً» */
  const ITEMS = [
    { n: "التفسير", s: "تيسير الكريم الرحمن — السعدي", icon: "📖",
      run: (d, k) => M().openTafsir(d, k) },
    { n: "نسخ الآية", s: "نصّها إلى الحافظة", icon: "⧉",
      run: (d, k) => {
        const v = d.verses.find((x) => x.k === k);
        if (v && navigator.clipboard)
          navigator.clipboard.writeText(`﴿${v.t}﴾ [${d.ar} ${M().arNum(v.a)}]`).catch(() => {});
      } },
    { n: "علامة قراءة", s: "يُحفظ موضعك هنا", icon: "🔖",
      run: (d, k) => {
        const v = d.verses.find((x) => x.k === k);
        if (v) try { localStorage.setItem("mufassir-last", `${d.n}:${v.a}`); } catch (e) {}
      } },
    { n: "إعراب الآية", s: "إعرابها مفصّلاً", icon: "✒️", off: true },
    { n: "المعاني والمفردات", s: "غريب القرآن ومعاني الكلمات", icon: "📚", off: true },
    { n: "أسباب النزول", s: "ما ورد في سبب نزولها", icon: "🕋", off: true },
  ];

  function open(el, d, k) {
    close();
    const aNum = +k.split(":")[1];
    const v = d.verses.find((x) => x.k === k);
    const txt = v ? v.t : (el ? el.textContent : "");
    ov = document.createElement("div");
    ov.className = "ctx-overlay";
    ov.innerHTML = `<div class="ctx-sheet" role="dialog">
      <div class="ctx-grip"></div>
      <div class="ctx-ayah">${M().esc(txt.length > 160 ? txt.slice(0, 160) + "…" : txt)}</div>
      <div class="ctx-meta"><span>سورة ${M().esc(d.ar)} — الآية ${M().arNum(aNum)}</span><button class="ctx-x" aria-label="إغلاق">✕</button></div>
      <div class="ctx-ops">${ITEMS.map((it, i) => `
        <button class="ctx-item" data-i="${i}" ${it.off ? "disabled" : ""}>
          <span class="ctx-ic">${it.icon}</span>
          <span class="ctx-tx">${it.n}${it.s ? `<small>${it.s}</small>` : ""}</span>
          ${it.off ? '<span class="ctx-soon">قريباً</span>' : '<span class="ctx-go">‹</span>'}
        </button>`).join("")}
      </div>
    </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("on"));
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    ov.querySelector(".ctx-x").addEventListener("click", () => close());
    ov.querySelectorAll(".ctx-item:not([disabled])").forEach((b) =>
      b.addEventListener("click", () => {
        const it = ITEMS[+b.dataset.i];
        close();
        it.run(d, k);
      }));
    if (el) { activeEl = el; el.classList.add("ctx-marked"); }
    if (navigator.vibrate) navigator.vibrate(10);
    try { history.pushState({ ctx: 1 }, ""); } catch (e) {}
  }

  function close() {
    if (activeEl) { activeEl.classList.remove("ctx-marked"); activeEl = null; }
    if (ov) { ov.remove(); ov = null; }
  }

  addEventListener("popstate", () => close());
  addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  window.MufassirCtx = { open, close };
})();
