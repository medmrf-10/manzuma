#!/usr/bin/env python3
"""Build the tafsir site's static data from the local library.

Reads:
  - quran-metadata chapters            (surah names, counts, bismillah flag)
  - quran-script uthmani ayah-by-ayah  (mushaf text)
  - /Users/devin/wahy-data/normalized-tafsir/<slug>/tafsir.sqlite (all normalized tafsirs)

Emits:
  web/data/index.json                    — all 114 surahs
  web/data/surah/<n>.json                — surah metadata + verses (no tafsir data)
  web/data/tafsirs.json                  — every available tafsir (slug, name, coverage)
  web/data/tafsir/<slug>.json.gz         — one gzipped {groups, vg} per tafsir (lazy-loaded at
                                          tafsir granularity, decoded in the browser via
                                          DecompressionStream)
  web/data/hadith/books.json             — every book in «الجامع» (built ones flagged)
  web/data/hadith/<slug>.json.gz         — thin per-book hadith list (no+type+hukm+taraf)
  web/data/hadith/<slug>-det.json.gz     — lazy detail: matn, sanad chains, meaning groups
"""
import gzip, hashlib, json, re, shutil, sqlite3, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path("/Users/devin/wahy-data")
META = DATA/"qul/quran-metadata/70-surah-names-quran-metadata-surah-by-surah/quran-metadata-surah-name.sqlite"
UTH  = DATA/"qul/quran-script/88-uthmani-quran-script-ayah-by-ayah/uthmani.db"
NORM = DATA/"normalized-tafsir"
HKG  = DATA/"hadith-kg/hadith-kg.db"
HNORM = DATA/"normalized-hadith"
OUT  = ROOT/"web/data"

# الكتب الستة بترتيبها المعتاد — تتصدر فهرس الكتب
SIX_BOOKS = [1, 2, 3, 4, 5, 6]

# 563-ayah-dependency-graphs is a verse-graph dataset miscategorized as tafsir in QUL — skip it.
EXCLUDE = {"563-ayah-dependency-graphs"}

# Display names. Missing slugs fall back to a prettified version of the slug.
# (name, lang) — lang "ar" renders in the Arabic optgroup first.
NAMES = {
    "22-ibn-kathir": ("تفسير ابن كثير", "ar"),
    "23-tafseer-al-qurtubi": ("الجامع لأحكام القرآن — القرطبي", "ar"),
    "24-tafseer-al-saadi-arabic": ("تيسير الكريم الرحمن — السعدي", "ar"),
    "25-al-tahrir-wa-al-tanwir": ("التحرير والتنوير — ابن عاشور", "ar"),
    "26-al-wasit": ("الوسيط في تفسير القرآن المجيد", "ar"),
    "27-tafseer-al-baghawi": ("معالم التنزيل — البغوي", "ar"),
    "28-fi-zilal-al-quran": ("في ظلال القرآن — سيد قطب (أردو)", "ur"),
    "29-bayan-ul-quran": ("بيان القرآن — أمرتسري (أردو)", "ur"),
    "30-ibn-kathir": ("تفسير ابن كثير (أردو)", "ur"),
    "31-tafseer-ibn-kathir": ("تفسير ابن كثير (بنغالي)", "bn"),
    "32-ahsanul-bayaan": ("أحسن البيان (بنغالي)", "bn"),
    "33-abu-bakr-zakaria": ("تفسير أبو بكر زكريا (بنغالي)", "bn"),
    "34-maarif-ul-quran": ("معارف القرآن — محمد شفيع (إنجليزي)", "en"),
    "35-ibn-kathir": ("تفسير ابن كثير (إنجليزي)", "en"),
    "36-tafseer-al-saadi-russian": ("تفسير السعدي (روسي)", "ru"),
    "37-al-tabari": ("جامع البيان — الطبري", "ar"),
    "38-muyassar": ("التفسير الميسّر", "ar"),
    "39-fathul-majid": ("فتح المجيد — عبد الرحمن بن حسن (بنغالي)", "bn"),
    "40-rebar-kurdish": ("تفسير ريبار (كردي)", "ku"),
    "42-tazkirul-quran-maulana-wahiduddin-khan": ("تذكير القرآن — وحيد الدين خان (إنجليزي)", "en"),
    "43-tazkirul-quran-maulana-wahiduddin-khan": ("تذكير القرآن — وحيد الدين خان (أردو)", "ur"),
    "250-asseraj-fi-bayan-gharib-alquran": ("السراج في بيان غريب القرآن — الخضيري", "ar"),
    "251-arabic-al-mukhtasar-in-interpreting-the-noble-quran": ("المختصر في تفسير القرآن الكريم", "ar"),
    "252-bosnian-abridged-explanation-of-the-quran": ("المختصر في تفسير القرآن (بوسني)", "bs"),
    "253-italian-al-mukhtasar-in-interpreting-the-noble-quran": ("المختصر في تفسير القرآن (إيطالي)", "it"),
    "254-filipino-tagalog-al-mukhtasar-in-interpreting-the-noble-quran-js": ("المختصر في تفسير القرآن (تاغالوغ)", "tl"),
    "255-assamese-abridged-explanation-of-the-quran": ("المختصر في تفسير القرآن (آسامي)", "as"),
    "256-malayalam-abridged-explanation-of-the-quran": ("المختصر في تفسير القرآن (مليالم)", "ml"),
    "257-khmer-abridged-explanation-of-the-quran": ("المختصر في تفسير القرآن (خميري)", "km"),
    "258-turkish-al-mukhtasar-in-interpreting-the-noble-quran": ("المختصر في تفسير القرآن (تركي)", "tr"),
    "259-french-abridged-explanation-of-the-quran": ("المختصر في تفسير القرآن (فرنسي)", "fr"),
    "260-indoniesua-al-mukhtasar-in-interpreting-the-noble-quran-dat": ("المختصر في تفسير القرآن (إندونيسي)", "id"),
    "261-vietnamese-al-mukhtasar-in-interpreting-the-noble-quran-dat": ("المختصر في تفسير القرآن (فيتنامي)", "vi"),
    "262-russian-al-mukhtasar": ("المختصر في تفسير القرآن (روسي)", "ru"),
    "263-persian-al-mukhtasar-in-interpreting-the-noble-quran": ("المختصر في تفسير القرآن (فارسي)", "fa"),
    "264-chinese-abridged-explanation-of-the-quran": ("المختصر في تفسير القرآن (صيني)", "zh"),
    "265-japanese-abridged-explanation-of-the-quran": ("المختصر في تفسير القرآن (ياباني)", "ja"),
    "266-english-al-mukhtasar": ("المختصر في تفسير القرآن (إنجليزي)", "en"),
    "267-bengali-abridged-explanation-of-the-quran": ("المختصر في تفسير القرآن (بنغالي)", "bn"),
    "268-spanish-abridged-explanation-of-the-quran": ("المختصر في تفسير القرآن (إسباني)", "es"),
    "283-as-saadi": ("تفسير السعدي (ألباني)", "sq"),
    "306-ibne-kathir": ("تفسير ابن كثير (تركي)", "tr"),
    "307-ibne-kathir": ("تفسير ابن كثير (روسي)", "ru"),
    "308-as-saadi": ("تفسير السعدي — تيسير الكريم الرحمن (نسخة ثانية)", "ar"),
    "309-as-saadi-urdu": ("تفسير السعدي (أردو)", "ur"),
    "310-as-saadi": ("تفسير السعدي (روسي)", "ru"),
    "453-sinhalese-mokhtasar": ("المختصر في تفسير القرآن (سنهالي)", "si"),
    "484-as-saadi-turkish": ("تفسير السعدي (تركي)", "tr"),
    "485-as-saadi-persian": ("تفسير السعدي (فارسي)", "fa"),
    "486-ibn-uthaymeen": ("تفسير ابن عثيمين", "ar"),
    "487-tahlil-kalimat-al-qur-an": ("تحليل كلمات القرآن الكريم", "ar"),
    "488-al-razi": ("مفاتيح الغيب (التفسير الكبير) — الرازي", "ar"),
    "489-al-wajiz-wahidi": ("الوجيز في تفسير الكتاب العزيز — الواحدي", "ar"),
    "490-makhi": ("الهداية إلى بلوغ النهاية — مكي بن أبي طالب", "ar"),
    "491-ibn-juzay": ("التسهيل لعلوم التنزيل — ابن جزي", "ar"),
    "492-mawsoo-at-al-al-ma-thoor": ("موسوعة التفسير بالمأثور", "ar"),
    "493-al-durr-al-manthur": ("الدر المنثور — السيوطي", "ar"),
    "494-fath-al-qadir-al-shawkani": ("فتح القدير — الشوكاني", "ar"),
    "495-fath-al-bayan-li-al-qanuji": ("فتح البيان في مقاصد القرآن — القانوجي", "ar"),
    "496-ibn-al-jawzi": ("زاد المسير في علم التفسير — ابن الجوزي", "ar"),
    "497-abi-al-suaood": ("إرشاد العقل السليم — أبو السعود", "ar"),
    "498-nazam-al-durar-al-biqa-i": ("نظم الدرر — البقاعي", "ar"),
    "499-ibn-abi-zamanin": ("تفسير ابن أبي زمنين", "ar"),
    "500-ibn-al-qayyim": ("تفسير ابن القيّم", "ar"),
    "501-al-alusi": ("روح المعاني — الآلوسي", "ar"),
    "502-ibn-abi-hatim": ("تفسير ابن أبي حاتم", "ar"),
    "503-as-saadi-indonesian": ("تفسير السعدي (إندونيسي)", "id"),
    "504-iraab-al-muyassar": ("إعراب القرآن الميسّر", "ar"),
    "505-al-dur-al-masun-lil-samin-al-halabi": ("الدر المصون في علوم الكتاب المكنون — السمين الحلبي", "ar"),
    "506-i-rab-al-quran-li-al-darwish": ("إعراب القرآن الكريم — الدرويش", "ar"),
    "507-abu-bakr-jabir-al-jazairi": ("أيسر التفاسير — أبو بكر الجزائري", "ar"),
    "508-jamia-al-bayan-aliji": ("جامع البيان — العيجي", "ar"),
    "509-al-muharrar-al-wajiz-ibn-atiyyah": ("المحرر الوجيز — ابن عطية", "ar"),
    "510-al-kashshaf-al-zamakhshari": ("الكشاف — الزمخشري", "ar"),
    "511-al-basit": ("البسيط — الواحدي", "ar"),
    "512-al-mawardi": ("النكت والعيون — الماوردي", "ar"),
    "513-al-samarqandi": ("بحر العلوم — السمرقندي", "ar"),
    "514-al-nasafi": ("مدارك التنزيل وحقائق التأويل — النسفي", "ar"),
    "515-alrab-al-quran-li-da-as": ("إعراب القرآن الكريم — دعاس", "ar"),
    "516-al-lubab-fi-ulum-al-kitab": ("اللباب في علوم الكتاب — ابن عادل", "ar"),
    "517-tadabbur-wa-amal": ("تدبر وعمل", "ar"),
    "518-al-baydawi": ("أنوار التنزيل وأسرار التأويل — البيضاوي", "ar"),
    "519-al-muyassar-fi-al-gharib": ("الميسّر في غريب القرآن الكريم — بلوي", "ar"),
    "520-al-jadwal-fi-i-rab-al-quran": ("الجدول في إعراب القرآن الكريم — محمود صافي", "ar"),
    "521-al-qira-at-al-mawsoo-ah-al-qur-aniyyah": ("الموسوعة القرآنية للقراءات", "ar"),
    "522-al-nashr-li-ibn-al-jazari": ("النشر في القراءات العشر — ابن الجزري", "ar"),
    "523-jalalayn": ("تفسير الجلالين", "ar"),
    "524-mahasin-al-ta-wil-al-qasimi": ("محاسن التأويل — القاسمي", "ar"),
    "525-adwa-al-bayan": ("أضواء البيان — الشنقيطي", "ar"),
    "526-al-bahr-al-muhit": ("البحر المحيط — أبو حيان", "ar"),
    "527-al-tha-alibi": ("الجواهر الحسان — الثعلبي", "ar"),
    "528-al-tha-alibi": ("الجواهر الحسان — الثعلبي (نسخة أخرى)", "ar"),
    "529-al-sam-ani": ("تفسير السمعاني", "ar"),
    "533-pashto-mokhtasar": ("المختصر في تفسير القرآن (بشتو)", "ps"),
    "534-fulani-mokhtasar": ("المختصر في تفسير القرآن (فولاني)", "ff"),
    "535-hindi-mokhtasar": ("المختصر في تفسير القرآن (هندي)", "hi"),
    "536-kyrgyz-mokhtasar": ("المختصر في تفسير القرآن (قيرغيزي)", "ky"),
    "537-azeri-mokhtasar": ("المختصر في تفسير القرآن (أذربيجاني)", "az"),
    "538-uzbek-mokhtasar": ("المختصر في تفسير القرآن (أوزبكي)", "uz"),
    "539-uyghur-mokhtasar": ("المختصر في تفسير القرآن (أويغوري)", "ug"),
    "540-telugu-mokhtasar": ("المختصر في تفسير القرآن (تيلوغو)", "te"),
    "541-thai-mokhtasar": ("المختصر في تفسير القرآن (تايلندي)", "th"),
    "542-kurdish-mokhtasar": ("المختصر في تفسير القرآن (كردي)", "ku"),
    "543-serbian-mokhtasar": ("المختصر في تفسير القرآن (صربي)", "sr"),
    "554-tamil-mokhtasar": ("المختصر في تفسير القرآن (تاميلي)", "ta"),
}

def prettify(slug):
    return re.sub(r"-+", " ", re.sub(r"^\d+-", "", slug)).title()

def main():
    (OUT/"surah").mkdir(parents=True, exist_ok=True)
    chapters = sqlite3.connect(META).execute(
        "select id, name_arabic, name_simple, verses_count, revelation_place, bismillah_pre from chapters order by id").fetchall()
    uth = dict(sqlite3.connect(UTH).execute("select verse_key, text from verses"))

    # wipe stale flat tafsir/<n>.json from the single-tafsir layout
    tafdir = OUT/"tafsir"
    if tafdir.exists():
        shutil.rmtree(tafdir)
    tafdir.mkdir(parents=True, exist_ok=True)

    index = []
    for cid, ar, simple, n_verses, place, bis in chapters:
        index.append({"n": cid, "ar": ar, "en": simple, "ayahs": n_verses,
                      "place": "مكية" if place == "makkah" else "مدنية",
                      "bismillah": bool(bis)})
        verses = [{"k": f"{cid}:{a}", "a": a, "t": uth[f"{cid}:{a}"]}
                  for a in range(1, n_verses + 1)]
        (OUT/"surah"/f"{cid}.json").write_text(json.dumps(
            {"n": cid, "ar": ar, "en": simple, "place": "مكية" if place == "makkah" else "مدنية",
             "bismillah": bool(bis), "verses": verses},
            ensure_ascii=False), encoding="utf-8")
    (OUT/"index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")

    tafsirs = []
    for tdir in sorted(NORM.iterdir()):
        if not tdir.is_dir() or tdir.name in EXCLUDE:
            continue
        dbp = tdir/"tafsir.sqlite"
        meta = json.loads((tdir/"metadata.json").read_text(encoding="utf-8"))
        slug = tdir.name
        name, lang = NAMES.get(slug, (prettify(slug), "ar"))
        tc = sqlite3.connect(dbp)
        groups = {k: (f, t, x) for k, f, t, x in tc.execute(
            "select group_ayah_key, from_ayah, to_ayah, text from tafsir_group")}
        vg_all = dict(tc.execute("select verse_key, group_ayah_key from tafsir_ayah"))
        tc.close()
        gs = {g: {"f": groups[g][0], "t": groups[g][1], "x": groups[g][2]}
              for g in set(vg_all.values()) if g in groups}
        payload = json.dumps({"groups": gs, "vg": vg_all}, ensure_ascii=False).encode("utf-8")
        (tafdir/f"{slug}.json.gz").write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
        tafsirs.append({"s": slug, "n": name, "ar": lang == "ar",
                        "a": meta["total_ayahs"], "g": meta["distinct_groups"],
                        "c": bool(meta["complete"]),
                        "z": len(payload) // 1024})
        print(f"{slug}: {meta['total_ayahs']} ayahs, {meta['distinct_groups']} groups", flush=True)

    # arabic tafsirs first (complete before partial), then translations
    tafsirs.sort(key=lambda t: (not t["ar"], not t["c"], t["n"]))
    (OUT/"tafsirs.json").write_text(json.dumps(tafsirs, ensure_ascii=False), encoding="utf-8")

    # ---- hadith section ----
    hadir = OUT/"hadith"
    if hadir.exists():
        shutil.rmtree(hadir)
    hadir.mkdir(parents=True, exist_ok=True)

    # pass 1: collect per-book structures + global group→books map
    built = {}       # book_id -> {"s": slug, "m": meaning_groups}
    per_book = {}    # slug -> dict(thin, detail, sanads, groups)
    group_books = {}  # gid -> {slug: min no_inbook}
    for hdir in sorted(HNORM.iterdir()):
        if not hdir.is_dir():
            continue
        meta = json.loads((hdir/"metadata.json").read_text(encoding="utf-8"))
        slug = hdir.name.removeprefix("hadith-")
        hc = sqlite3.connect(hdir/"hadith.sqlite")
        thin, detail, sanads, groups, by_group = [], {}, {}, {}, {}
        for hid, no, typ, hukm, gid, taraf, matn in hc.execute(
                "select id, no_inbook, type, hukm, group_id, taraf, matn from hadith"):
            thin.append({"n": no, "y": typ, "h": hukm, "x": taraf})
            detail[str(no)] = {"m": matn, "g": gid}
            sanads[str(no)] = []
            if gid is not None:
                by_group.setdefault(gid, []).append(no)
                gb = group_books.setdefault(gid, {})
                if slug not in gb or no < gb[slug]:
                    gb[slug] = no
        for sid, no, hukum in hc.execute(
                "select s.id, h.no_inbook, s.hukum from sanad s join hadith h on h.id=s.hadith_id"):
            chain = [r[0] for r in hc.execute(
                "select r.name from sanad_rawi sr join rawi r on r.id=sr.rawi_id "
                "where sr.sanad_id=? order by sr.pos", (sid,))]
            sanads[str(no)].append([hukum, chain])
        for gid, taraf, hukm, sq, rq in hc.execute(
                "select id, taraf, hukm, sahaba_qty, repeat_qty from meaning_group"):
            groups[str(gid)] = {"t": taraf, "h": hukm, "s": sq, "r": rq,
                                "hs": sorted(by_group.get(gid, []))}
        hc.close()
        thin.sort(key=lambda h: h["n"])
        per_book[slug] = {"meta": meta, "thin": thin, "detail": detail,
                          "sanads": sanads, "groups": groups, "by_group": by_group}
        built[meta["book_id"]] = {"s": slug, "m": meta["meaning_groups"]}
        print(f"hadith {slug}: {meta['total_hadiths']} hadiths, {meta['meaning_groups']} meanings",
              flush=True)

    # pass 2: write bundles — group payloads get `x`: other books' first occurrence
    for slug, pb in per_book.items():
        for gid_s, g in pb["groups"].items():
            gid = int(gid_s)
            others = {s: n for s, n in group_books.get(gid, {}).items() if s != slug}
            if others:
                g["x"] = others
        meta = pb["meta"]
        (hadir/f"{slug}.json.gz").write_bytes(gzip.compress(
            json.dumps({"n": meta["book"], "a": meta["author"], "q": meta["total_hadiths"],
                        "m": meta["meaning_groups"], "h": pb["thin"]}, ensure_ascii=False).encode("utf-8"),
            compresslevel=9, mtime=0))
        (hadir/f"{slug}-det.json.gz").write_bytes(gzip.compress(
            json.dumps({"d": pb["detail"], "s": pb["sanads"], "g": pb["groups"]},
                       ensure_ascii=False).encode("utf-8"),
            compresslevel=9, mtime=0))

    books = sqlite3.connect(HKG).execute(
        "select id, name, author_name, tasnif, hadith_qty from books").fetchall()
    blist = [{"s": built[bid]["s"] if bid in built else f"book-{bid}", "i": bid,
              "n": name, "a": author, "t": tasnif, "q": qty,
              "d": bid in built, "m": built.get(bid, {}).get("m", 0)}
             for bid, name, author, tasnif, qty in books]
    blist.sort(key=lambda b: (b["i"] not in SIX_BOOKS,
                              SIX_BOOKS.index(b["i"]) if b["i"] in SIX_BOOKS else 0,
                              -b["q"]))
    (hadir/"books.json").write_text(json.dumps(blist, ensure_ascii=False), encoding="utf-8")

    # ---- unified topical index (al-Jami topics tree × six books' meaning groups) ----
    hk = sqlite3.connect(HKG)
    trows = hk.execute(
        "select id, name, parent_id, level, group_id from topics").fetchall()
    used_gids = set(group_books)  # meaning groups present in built books
    nodes = {i: {"n": n, "p": p or 0, "l": lv, "g": g}
             for i, n, p, lv, g in trows}
    active = set()         # topics whose subtree reaches a used meaning group
    leaf_groups = {}       # topic_id -> [group_ids] (a leaf may link several)
    for i, t in nodes.items():
        if t["g"] and t["g"] in used_gids:
            leaf_groups.setdefault(i, []).append(t["g"])
            j = i
            while j and j not in active:
                active.add(j)
                j = nodes[j]["p"]
    # per-topic book coverage: distinct descendant groups present per book
    # computed on the ACTIVE tree only (walk leaves up, union into ancestors)
    tbooks = {i: {} for i in active}          # tid -> {book_id: distinct groups}
    for tid, gids in leaf_groups.items():
        for gid in gids:
            for slug in group_books.get(gid, {}):
                bid = next(b["i"] for b in blist if b["s"] == slug)
                s = tbooks[tid].setdefault(bid, set())
                s.add(gid)
    for tid in sorted(active, key=lambda i: -nodes[i]["l"]):  # children first
        for bid, gs in tbooks[tid].items():
            p = nodes[tid]["p"]
            if p and p in active:
                tbooks.setdefault(p, {}).setdefault(bid, set()).update(gs)
    tj = {"t": {str(i): {"n": nodes[i]["n"], "p": nodes[i]["p"],
                         "l": nodes[i]["l"],
                         "b": {str(b): len(gs) for b, gs in tbooks.get(i, {}).items()}}
                for i in active},
          "g": {str(t): sorted(set(g)) for t, g in leaf_groups.items()}}
    (hadir/"topics.json.gz").write_bytes(gzip.compress(
        json.dumps(tj, ensure_ascii=False).encode("utf-8"), compresslevel=9, mtime=0))
    print(f"topics: {len(active)} active nodes, {len(leaf_groups)} group-linked leaves")

    # per-book topical TOC: same tree restricted to that book's groups
    for slug, pb in per_book.items():
        bid = next(b["i"] for b in blist if b["s"] == slug)
        book_gids = set(pb["by_group"])
        bleaves = {t: [g for g in gs if g in book_gids]
                   for t, gs in leaf_groups.items()}
        bleaves = {t: gs for t, gs in bleaves.items() if gs}
        bactive = set()
        for t in bleaves:
            j = t
            while j and j not in bactive:
                bactive.add(j)
                j = nodes[j]["p"]
        btj = {"t": {str(i): {"n": nodes[i]["n"], "p": nodes[i]["p"], "l": nodes[i]["l"]}
                     for i in bactive},
               "g": {str(t): sorted(set(gs)) for t, gs in bleaves.items()}}
        (hadir/f"{slug}-toc.json.gz").write_bytes(gzip.compress(
            json.dumps(btj, ensure_ascii=False).encode("utf-8"), compresslevel=9, mtime=0))
    hk.close()

    # cache-bust: stamp index.html asset refs with content hashes
    html = (ROOT/"web/index.html")
    src = html.read_text(encoding="utf-8")
    for asset in ("styles.css", "app.js"):
        h = hashlib.md5((ROOT/"web"/asset).read_bytes()).hexdigest()[:8]
        src = re.sub(rf'{asset}(\?v=[0-9a-f]+)?', f'{asset}?v={h}', src)
    html.write_text(src, encoding="utf-8")

    total = sum(p.stat().st_size for p in tafdir.rglob("*.gz"))
    htotal = sum(p.stat().st_size for p in hadir.rglob("*.gz"))
    print(f"index + 114 surah files; {len(tafsirs)} tafsirs; tafsir payload {total/1e6:.0f} MB gzipped; "
          f"{len(built)} hadith books of {len(blist)}; hadith payload {htotal/1e6:.0f} MB gzipped")

if __name__ == "__main__":
    sys.exit(main())
