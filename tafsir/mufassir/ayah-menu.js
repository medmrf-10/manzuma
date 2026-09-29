/* قائمة الآية — ضغطة مطوّلة على أي .m-ayah تفتح لوحة إجراءات
   (تفسير/إعراب/معاني/نسخ/مشاركة) — قطعة مستقلة تُركَّب بأي إطار.
   الاستعمال: AyahMenu.bind(containerEl, {onTafsir(s,k,el), onAction(name,s,k,el)})
*/
(function () {
  const css = `
  .am-scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:60;opacity:0;pointer-events:none;transition:opacity .18s}
  .am-scrim.on{opacity:1;pointer-events:auto}
  .am-sheet{position:fixed;left:0;right:0;bottom:0;z-index:61;background:var(--card,#171a21);border-top:1px solid var(--line,#2a2e38);border-radius:18px 18px 0 0;padding:8px 14px calc(14px + env(safe-area-inset-bottom));transform:translateY(110%);transition:transform .22s ease;max-width:560px;margin:0 auto;box-shadow:0 -8px 40px rgba(0,0,0,.4)}
  .am-sheet.on{transform:translateY(0)}
  .am-ayah{font-family:var(--quran,"Amiri Quran",serif);font-size:1.05rem;line-height:1.9;color:var(--ink,#e8e6e3);padding:8px 4px 12px;border-bottom:1px solid var(--line,#2a2e38);max-height:26vh;overflow:hidden}
  .am-ops{display:flex;flex-direction:column;padding-top:6px}
  .am-op{display:flex;align-items:center;gap:14px;width:100%;background:none;border:0;border-bottom:1px solid var(--line,#2a2e38);color:var(--ink,#e8e6e3);font-family:inherit;font-size:1.02rem;font-weight:600;padding:14px 6px;cursor:pointer;text-align:right}
  .am-op:last-child{border-bottom:0}
  .am-op:active{background:var(--card2,#10141b)}
  .am-op .ic{width:34px;height:34px;border-radius:10px;background:var(--card2,#10141b);border:1px solid var(--line,#2a2e38);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0}
  .am-op small{display:block;color:var(--dim,#9a958c);font-weight:400;font-size:.74rem;margin-top:2px}
  .am-op .soon{margin-right:auto;color:var(--dimmer,#6b675f);font-size:.72rem;border:1px solid var(--line,#2a2e38);border-radius:999px;padding:2px 10px}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const scrim = document.createElement("div");
  scrim.className = "am-scrim";
  const sheet = document.createElement("div");
  sheet.className = "am-sheet";
  sheet.innerHTML = `<div class="am-ayah" id="am-ayah"></div><div class="am-ops" id="am-ops"></div>`;
  document.body.append(scrim, sheet);

  let cfg = null, cur = null, pressT = null, moved = false;

  const OPS = [
    { id: "tafsir", ic: "📖", n: "التفسير", s: "تيسير الكريم الرحمن — السعدي" },
    { id: "irab", ic: "🧩", n: "الإعراب", s: "إعراب الآية مفصّلاً", soon: true },
    { id: "mean", ic: "📚", n: "معاني الكلمات", s: "غريب القرآن ومعاني المفردات", soon: true },
    { id: "copy", ic: "⧉", n: "نسخ الآية" },
    { id: "mark", ic: "🔖", n: "علامة قراءة", s: "يُحفظ موضعك هنا" },
  ];

  function open(s, k, text, el) {
    cur = { s, k, el };
    document.getElementById("am-ayah").textContent = text.length > 180 ? text.slice(0, 180) + "…" : text;
    document.getElementById("am-ops").innerHTML = OPS.map((o) =>
      `<button class="am-op" data-o="${o.id}"><span class="ic">${o.ic}</span><span>${o.n}${o.s ? `<small>${o.s}</small>` : ""}</span>${o.soon ? '<span class="soon">قريباً</span>' : ""}</button>`).join("");
    scrim.classList.add("on");
    sheet.classList.add("on");
    if (cfg && cfg.pushHistory !== false) history.pushState({ am: 1 }, "");
  }
  function close() {
    scrim.classList.remove("on");
    sheet.classList.remove("on");
    cur = null;
  }
  scrim.addEventListener("click", () => { history.state && history.state.am ? history.back() : close(); });
  addEventListener("popstate", () => { if (sheet.classList.contains("on")) close(); });
  addEventListener("keydown", (e) => e.key === "Escape" && close());

  sheet.addEventListener("click", (e) => {
    const b = e.target.closest(".am-op");
    if (!b || !cur) return;
    const o = b.dataset.o, { s, k, el } = cur;
    close();
    if (o === "tafsir" && cfg && cfg.onTafsir) return cfg.onTafsir(s, k, el);
    if (o === "copy") {
      const t = el ? el.textContent : "";
      if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {});
      return;
    }
    if (o === "mark") {
      try { localStorage.setItem("mufassir-last", k.replace(":", ":")); } catch (_) {}
      if (cfg && cfg.onMark) cfg.onMark(s, k, el);
      return;
    }
    if (cfg && cfg.onAction) cfg.onAction(o, s, k, el);
  });

  window.AyahMenu = {
    bind(el, opts) {
      cfg = opts || {};
      let sx = 0, sy = 0;
      el.addEventListener("touchstart", (e) => {
        const a = e.target.closest(".m-ayah");
        if (!a) return;
        moved = false;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY;
        pressT = setTimeout(() => {
          if (!moved) {
            const s = +a.dataset.s || (cfg.getSurah ? cfg.getSurah() : 0);
            open(s, a.dataset.k || a.id, a.textContent, a);
            if (navigator.vibrate) navigator.vibrate(10);
          }
        }, 480);
      }, { passive: true });
      el.addEventListener("touchmove", (e) => {
        if (Math.abs(e.touches[0].clientX - sx) > 12 || Math.abs(e.touches[0].clientY - sy) > 12) {
          moved = true; clearTimeout(pressT);
        }
      }, { passive: true });
      el.addEventListener("touchend", () => clearTimeout(pressT), { passive: true });
      el.addEventListener("contextmenu", (e) => {
        const a = e.target.closest(".m-ayah");
        if (a) { e.preventDefault(); const s = +a.dataset.s || (cfg.getSurah ? cfg.getSurah() : 0); open(s, a.dataset.k || a.id, a.textContent, a); }
      });
    },
    close,
  };
})();
