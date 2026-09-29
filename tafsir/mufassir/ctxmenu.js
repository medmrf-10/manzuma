/* قائمة الضغط المطوّل على الآية — خدمات الآية القابلة للتوسعة · نسخة أولى (تحسّنها المؤرشف)
   API: window.MufassirCtx.open(ayahEl, surahData, verseKey) — يعتمد window.Mufassir */
(function () {
  const M = () => window.Mufassir;
  let ov = null;
  /* بنود الخدمات — أضف بنداً هنا فقط: {n: العنوان, icon, run: (d,k)=>{} أو off:true} */
  const ITEMS = [
    { n: "التفسير", icon: "📖", run: (d, k) => M().openTafsir(d, k) },
    { n: "إعراب الآية", icon: "✒️", off: true },
    { n: "المعاني والمفردات", icon: "📚", off: true },
    { n: "أسباب النزول", icon: "🕋", off: true },
  ];
  function open(el, d, k) {
    close();
    ov = document.createElement("div");
    ov.className = "ctx-overlay";
    ov.innerHTML = `<div class="ctx-sheet">
      <div class="ctx-head">الآية ${M().arNum(+k.split(":")[1])} — سورة ${M().esc(d.ar)}</div>
      ${ITEMS.map((it, i) => `<button class="ctx-item" data-i="${i}" ${it.off ? "disabled" : ""}>
        <span class="ctx-ic">${it.icon}</span><span class="ctx-n">${it.n}</span>
        ${it.off ? '<span class="ctx-soon">قريباً</span>' : '<span class="ctx-go">‹</span>'}
      </button>`).join("")}
    </div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    ov.querySelectorAll(".ctx-item:not([disabled])").forEach((b) =>
      b.addEventListener("click", () => { const it = ITEMS[+b.dataset.i]; close(); it.run(d, k); }));
    try { history.pushState({ ctx: 1 }, ""); } catch (e) {}
  }
  function close() { if (ov) { ov.remove(); ov = null; } }
  addEventListener("popstate", () => close());
  window.MufassirCtx = { open, close };
})();
