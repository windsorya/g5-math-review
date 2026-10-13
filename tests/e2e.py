#!/usr/bin/env python3
"""五上數學複習 e2e：本機 index.html（或 --base 正式網址）；Chromium 桌機／手機 390、WebKit iPad。
用 python3.12 執行：python3.12 tests/e2e.py [--base https://windsorya.github.io/g5-math-review/]
題目答案從頁面上的 window.G5MathBank 依題目文字查（題庫本身另有 tests/mathbank.test.js 獨立驗算）。"""
import json
import math
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = sys.argv[sys.argv.index("--base") + 1].rstrip("/") + "/" if "--base" in sys.argv else ROOT.as_uri() + "/"
URL = BASE + "index.html"
RESULTS = []


def check(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  ← {detail}"))


def open_page(browser, device=None, init=None):
    ctx = browser.new_context(**(device or {}))
    if init:
        ctx.add_init_script(init)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_selector("#main .btn, #main .done")
    return ctx, page, errors


def current_card(page):
    q = page.locator("#main .q").inner_text()
    return page.evaluate("(q)=>{var c=G5MathBank.CARDS.find(function(x){return x.q===q;});return c?{id:c.id,a:c.a,opts:c.opts,concept:c.concept}:null;}", q)


def answer(page, right=True):
    c = current_card(page)
    assert c, "頁面上的題目在題庫裡找不到"
    i = c["a"] if right else (c["a"] + 1) % len(c["opts"])
    page.locator(f'#main .opt[data-i="{i}"]').click()
    return c, i


def no_overflow(page):
    return page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")


# ===== 三站共通「標準 DOM」判準（主閘）：自然站 tests/e2e_v3.py 與數學站 tests/e2e.py 這一段逐字相同 =====
# 由來：tests/standard.test.js 的②④⑤用正規表達式讀 HTML，Codex 連 3 輪找到假通過與誤判（title=' href="網址"'、
# <meta name="robots" title=" content='noindex'">、data-href／data-content、<path d="M0 0"/>、<path d="M10 10"/>、
# <rect width="0.0">、<circle r="0.0"/> 判有圖、合法 <line x1="50" y1="50" x2="0" y2="50"> 判沒圖）。
# 根因是用文字猜瀏覽器怎麼解析、怎麼畫；這裡直接問瀏覽器：a.href、meta.content 是解析後的真屬性，
# 圖用 getBBox／getBoundingClientRect／getComputedStyle／getTotalLength／isPointInFill 量「真的畫出了東西」。
# 每條判準在 std_selftest() 都有自檢：把頁面 DOM 改成報告的反例，斷言抓得到（合法線段不誤判）。
STD_SITES = {"sci": ("https://windsorya.github.io/g5-sci-review/", "五上自然複習"),
             "math": ("https://windsorya.github.io/g5-math-review/", "五上數學複習"),
             "help": ("https://windsorya.github.io/g5-help/", "難題解說"),
             "chi": ("https://windsorya.github.io/g5-chinese-review/", "五上國語複習"),
             "soc": ("https://windsorya.github.io/g5-social-review/", "五上社會複習"),
             "wrong": ("https://windsorya.github.io/g5-wrong-review/", "錯題複習")}
# ④切換列：#siteNav 恰一個；裡面每個 <a> 的 a.href（瀏覽器解析後）恰為另外兩站、看得見；恰一個 aria-current="page" 且字是本站名。
STD_NAV_JS = """() => { const navs = document.querySelectorAll('#siteNav'), nav = navs[0];
  if (navs.length !== 1) return {navs: navs.length};
  // 看得見＝有大小、visibility 是 visible，而且一路往上每一層都沒 display:none、透明度相乘 >0（Codex 審 f0422ce／b1ae271：上層 opacity:0 假通過）
  const seen = (e) => { const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0) || getComputedStyle(e).visibility !== 'visible') return false;
    let op = 1; for (let n = e; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none') return false; op *= parseFloat(cs.opacity); } return op > 0; };
  const as = [...nav.querySelectorAll('a')];
  return {navs: 1, hrefs: as.map((a) => a.href), hidden: as.filter((a) => !seen(a)).map((a) => a.href || a.outerHTML.slice(0, 80)),
          current: [...nav.querySelectorAll('[aria-current="page"]')].filter(seen).map((e) => (e.textContent || '').trim())}; }   // 本站標記也要看得見"""
# ⑤收錄：<head> 裡的 meta[name=robots]，用真屬性 meta.content，逗號／空白切開後有 noindex。
STD_ROBOTS_JS = """() => [...document.querySelectorAll('meta[name="robots" i]')].map((m) => ({content: m.content, inHead: !!document.head && document.head.contains(m)}))"""
# ②圖：sel 選到的每個容器（一步／一種說法）至少一張 svg[role=img]；每張都要有 aria-label（去空白後 ≥4 字）、本身看得見，
# 而且裡面至少一個繪圖元素真的畫出東西：不在 defs 等不畫的區塊、沒被 display／visibility／opacity 藏起來、getBBox 與畫面上的框
# 有大小且落在圖框內；描邊要 stroke 不是 none、寬度 >0、路徑長度 >0；填色要 fill 不是 none、寬高都 >0、內部取樣點真的在填色區。
# 蓋滿整張圖的 <rect> 是底色，不算「畫了東西」。
STD_FIG_JS = """(sel) => {
  const SKIP = 'defs,clipPath,mask,marker,pattern,symbol,linearGradient,radialGradient,filter';
  const GEO = new Set(['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse']), AREA = new Set(['rect', 'circle', 'ellipse']);
  const num = (x) => { const v = parseFloat(x); return Number.isFinite(v) ? v : 0; };
  const noPaint = (c) => !c || c === 'none' || c === 'transparent' || /^rgba\\(.*,\\s*0(\\.0*)?\\)$/.test(c);
  const shown = (el, svg) => { let op = 1;
    for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none') return false; op *= num(cs.opacity); }   // 一路查到最外層：圖的容器被設成透明也算看不見
    return getComputedStyle(el).visibility === 'visible' && op > 0; };
  function drawn(el, svg, vb, box) {
    const tag = el.tagName.toLowerCase(), cs = getComputedStyle(el);
    if (el.closest(SKIP) || !shown(el, svg)) return '';
    let bb; try { bb = el.getBBox(); } catch (e) { return ''; }
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 || r.height > 0)) return '';
    if (r.right < box.left - 1 || r.left > box.right + 1 || r.bottom < box.top - 1 || r.top > box.bottom + 1) return '';
    if (tag === 'rect' && vb.width > 0 && vb.height > 0 && bb.x <= vb.x + vb.width * 0.02 && bb.y <= vb.y + vb.height * 0.02 &&
        bb.x + bb.width >= vb.x + vb.width * 0.98 && bb.y + bb.height >= vb.y + vb.height * 0.98) return '';
    const fillOn = !noPaint(cs.fill) && num(cs.fillOpacity) > 0, strokeOn = !noPaint(cs.stroke) && num(cs.strokeWidth) > 0 && num(cs.strokeOpacity) > 0;
    if (tag === 'text') return (el.textContent || '').trim() && bb.width > 0 && bb.height > 0 && (fillOn || strokeOn) ? 'text' : '';
    if (tag === 'image' || tag === 'use') return bb.width > 0 && bb.height > 0 ? tag : '';
    if (!GEO.has(tag) || (AREA.has(tag) && !(bb.width > 0 && bb.height > 0))) return '';
    if (strokeOn && typeof el.getTotalLength === 'function' && el.getTotalLength() > 0) return tag + '描邊';
    if (fillOn && tag !== 'line' && bb.width > 0 && bb.height > 0)
      for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++)
        if (el.isPointInFill({x: bb.x + bb.width * (i + 0.5) / 9, y: bb.y + bb.height * (j + 0.5) / 9})) return tag + '填色';
    return '';
  }
  return [...document.querySelectorAll(sel)].map((c) => ({
    where: (c.innerText || c.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30),
    figs: [...c.querySelectorAll('svg[role="img"]')].map((svg) => {
      const box = svg.getBoundingClientRect(), v = svg.viewBox && svg.viewBox.baseVal;
      const vb = v && v.width > 0 ? v : {x: 0, y: 0, width: svg.width.baseVal.value, height: svg.height.baseVal.value};
      const kinds = box.width > 0 && box.height > 0 && shown(svg, svg) ? [...svg.querySelectorAll('*')].map((el) => drawn(el, svg, vb, box)).filter(Boolean) : [];
      return {label: (svg.getAttribute('aria-label') || '').replace(/\\s/g, ''), seen: box.width > 0 && box.height > 0, n: kinds.length, kinds: [...new Set(kinds)].slice(0, 4)};
    })}));
}"""


def std_nav_problems(st, self_key):
    if not isinstance(st, dict) or st.get("navs") != 1:
        return [f"#siteNav 應恰一個，實際：{st.get('navs') if isinstance(st, dict) else st!r}"]
    want, bad = sorted(u for k, (u, _) in STD_SITES.items() if k != self_key), []
    if sorted(st["hrefs"]) != want:
        bad.append(f"siteNav 連結應恰為 {want}，瀏覽器讀到 {st['hrefs']}")
    if st["hidden"]:
        bad.append(f"siteNav 有看不見的連結：{st['hidden']}")
    if st["current"] != [STD_SITES[self_key][1]]:
        bad.append(f"siteNav 應恰一個 aria-current=\"page\" 寫「{STD_SITES[self_key][1]}」，實際：{st['current']}")
    return bad


def std_robots_ok(metas):
    return any(m.get("inHead") and "noindex" in re.split(r"[\s,]+", str(m.get("content") or "").lower()) for m in (metas or []))


def std_fig_problems(conts, min_conts=1):
    """STD_FIG_JS 的結果 → 問題清單。容器數不足、某容器沒有 svg[role=img]、某張圖缺 aria-label／看不見／沒有畫出東西都算。"""
    bad = [] if len(conts) >= min_conts else [f"只找到 {len(conts)} 個容器（至少要 {min_conts}）"]
    for i, c in enumerate(conts):
        if not c["figs"]:
            bad.append(f"第 {i + 1} 格「{c['where']}」沒有 svg[role=img]")
        for f in c["figs"]:
            if len(f["label"]) < 4 or not f["seen"] or f["n"] < 1:
                bad.append(f"第 {i + 1} 格「{c['where']}」的圖：aria-label「{f['label']}」、看得見={f['seen']}、畫出 {f['n']} 個元素")
    return bad


def std_page_check(page, label, self_key):
    """④⑤：在真頁面上量切換列與 noindex。"""
    nav = std_nav_problems(page.evaluate(STD_NAV_JS), self_key)
    check(f"{label} 標準DOM④ 切換列：a.href 恰為另外兩站、看得見、恰一個 aria-current 是本站名", not nav, nav)
    metas = page.evaluate(STD_ROBOTS_JS)
    check(f"{label} 標準DOM⑤ <head> 的 meta[name=robots] 真屬性 content 含 noindex", std_robots_ok(metas), metas)


# 自檢反例（出自 Codex 報告 g5-sci-review-4b559c4a／63b048db、g5-math-review-9545348b）：True＝判準應判「有圖」。
STD_FIG_CASES = [
    ("空圖", "", False), ("只有註解", "<!-- <rect width='10' height='10'/> -->", False), ("<path/>", "<path/>", False),
    ('<path d="M0 0"/>', '<path d="M0 0" stroke="black" stroke-width="4"/>', False),
    ('<path d="M10 10"/>', '<path d="M10 10" stroke="black" stroke-width="4"/>', False),
    ('<rect width="0.0" height="10">', '<rect x="10" y="10" width="0.0" height="10" fill="black"/>', False),
    ('<circle r="0.0"/>', '<circle cx="50" cy="50" r="0.0" fill="black" stroke="black" stroke-width="2"/>', False),
    ("只有底色（蓋滿整張的 rect）", '<rect width="100%" height="100%" fill="black"/>', False),
    ("fill、stroke 都是 none", '<rect x="10" y="10" width="50" height="50" fill="none" stroke="none"/>', False),
    ("opacity=0", '<rect x="10" y="10" width="50" height="50" fill="black" opacity="0"/>', False),
    ("只在 <defs> 裡", '<defs><rect x="10" y="10" width="50" height="50" fill="black"/></defs>', False),
    ("畫在圖框外", '<rect x="-5000" y="-5000" width="50" height="50" fill="black"/>', False),
    ("只有填色的斜直線（沒有面積）", '<path d="M10 10 L60 60" fill="black"/>', False),
    ("transform=scale(0)", '<rect x="10" y="10" width="50" height="50" fill="black" transform="scale(0)"/>', False),
    ('合法線段 <line x1="50" y1="50" x2="0" y2="50">', '<line x1="50" y1="50" x2="0" y2="50" stroke="black" stroke-width="4"/>', True),
    ("合法小方塊", '<rect x="10" y="10" width="40" height="30" fill="black"/>', True),
    ("合法圓", '<circle cx="50" cy="50" r="10" fill="black"/>', True),
    ("合法文字", '<text x="20" y="40" font-size="20" fill="black">字</text>', True),
]
STD_MUTATE_JS = """([mode, sel, html]) => {
  window.__stdSaved = window.__stdSaved || {};
  if (mode === 'fig') { const svg = document.querySelector(sel); window.__stdSaved.fig = [svg, svg.innerHTML, svg.getAttribute('aria-label')];
    if (html === null) svg.removeAttribute('aria-label'); else svg.innerHTML = html; return; }
  if (mode === 'figback') { const [svg, inner, lab] = window.__stdSaved.fig; svg.innerHTML = inner; svg.setAttribute('aria-label', lab); return; }
  if (mode === 'nav') { const nav = document.getElementById('siteNav'); window.__stdSaved.nav = nav.innerHTML; (new Function('nav', html))(nav); return; }
  if (mode === 'navback') { const nv = document.getElementById('siteNav'); nv.style.opacity = ''; if (nv.parentElement) nv.parentElement.style.opacity = '';
    nv.innerHTML = window.__stdSaved.nav; document.querySelectorAll('[data-std-extra]').forEach((e) => e.remove()); return; }
  if (mode === 'robots') { const ms = [...document.querySelectorAll('meta[name="robots" i]')]; window.__stdSaved.robots = ms.map((m) => m.cloneNode());
    ms.forEach((m) => m.remove());
    if (html.startsWith('<!--')) window.__stdSaved.cmt = document.head.appendChild(document.createComment(html.slice(4, -3)));
    else document.head.insertAdjacentHTML('beforeend', html.replace('<meta', '<meta data-std-extra'));
    return; }
  if (mode === 'robotsback') { document.querySelectorAll('meta[data-std-extra]').forEach((e) => e.remove());
    if (window.__stdSaved.cmt) { window.__stdSaved.cmt.remove(); window.__stdSaved.cmt = null; }
    window.__stdSaved.robots.forEach((m) => document.head.appendChild(m)); return; }
}"""


def std_selftest(page, label, self_key, fig_sel):
    """自檢：在真頁面上把 DOM 改成報告的反例，斷言主閘判準抓得到；改完立刻復原。fig_sel＝要拿來改的那張 svg（第一張），其容器也要給。"""
    svg_sel, cont_sel = fig_sel
    # ②
    wrong = []
    for name, html, want in STD_FIG_CASES + [("拿掉 aria-label", None, False)]:
        page.evaluate(STD_MUTATE_JS, ["fig", svg_sel, html])
        got = not std_fig_problems(page.evaluate(STD_FIG_JS, cont_sel)[:1])
        page.evaluate(STD_MUTATE_JS, ["figback", svg_sel, ""])
        if got != want:
            wrong.append(f"{name}：應判{'有' if want else '沒有'}圖，判成{'有' if got else '沒有'}")
    check(f"{label} 標準DOM自檢② {len(STD_FIG_CASES) + 1} 個圖的反例／正例都判對（含 <path d=\"M0 0\"/>、<rect width=\"0.0\">、<circle r=\"0.0\"/>、合法 <line x2=\"0\">）", not wrong, wrong)
    # 圖的容器（例如 .sfig）設成透明：圖本身完好也要判看不見（Codex 審 f0422ce／b1ae271）
    page.evaluate("(sel) => { const s = document.querySelector(sel + ' svg[role=img]'); s.parentElement.dataset.stdOp = s.parentElement.style.opacity; s.parentElement.style.opacity = '0'; }", cont_sel)
    outer_hidden = bool(std_fig_problems(page.evaluate(STD_FIG_JS, cont_sel)[:1]))
    page.evaluate("(sel) => { const s = document.querySelector(sel + ' svg[role=img]'); s.parentElement.style.opacity = s.parentElement.dataset.stdOp || ''; }", cont_sel)
    check(f"{label} 標準DOM自檢② 圖的外層透明要判成看不見", outer_hidden)
    check(f"{label} 標準DOM自檢② 改完復原後真圖仍判有圖", not std_fig_problems(page.evaluate(STD_FIG_JS, cont_sel)[:1]))
    # ④（JS 片段：參數 nav＝#siteNav 元素）
    other = [u for k, (u, _) in STD_SITES.items() if k != self_key]
    nav_cases = [
        ("href 移進 title（title=' href=\"網址\"'）", "nav.querySelectorAll('a').forEach((a) => { a.setAttribute('title', ' href=\"' + a.getAttribute('href') + '\"'); a.removeAttribute('href'); });"),
        ("href 改成 data-href", "nav.querySelectorAll('a').forEach((a) => { a.setAttribute('data-href', a.getAttribute('href')); a.removeAttribute('href'); });"),
        ("一個連結改指本站", f"nav.querySelector('a').setAttribute('href', {json.dumps(STD_SITES[self_key][0])});"),
        ("移除兩個 <a>、網址留在別處", "nav.querySelectorAll('a').forEach((a) => a.remove()); const s = document.createElement('script'); s.type = 'text/plain'; s.dataset.stdExtra = 1; s.textContent = " + json.dumps(" ".join(other)) + "; document.body.appendChild(s);"),
        ("連結藏起來（display:none）", "nav.querySelectorAll('a').forEach((a) => { a.style.display = 'none'; });"),
        ("連結透明（opacity:0）", "nav.querySelectorAll('a').forEach((a) => { a.style.opacity = '0'; });"),
        ("整個切換列的外層透明", "nav.parentElement.style.opacity = '0';"),
        ("本站標記藏起來（display:none）", "nav.querySelector('[aria-current]').style.display = 'none';"),
        ("拿掉 aria-current", "nav.querySelectorAll('[aria-current]').forEach((e) => e.removeAttribute('aria-current'));"),
        ("aria-current 字不是本站名", "nav.querySelector('[aria-current]').textContent = '別站';"),
        ("多一個 #siteNav", "const d = nav.cloneNode(true); d.dataset.stdExtra = 1; document.body.appendChild(d);"),
        ("相對網址 href=\"g5-help/\"（解析後不是那個站）", "nav.querySelector('a').setAttribute('href', 'g5-help/');"),
    ]
    wrong = []
    for name, js in nav_cases:
        page.evaluate(STD_MUTATE_JS, ["nav", "", js])
        if not std_nav_problems(page.evaluate(STD_NAV_JS), self_key):
            wrong.append(name)
        page.evaluate(STD_MUTATE_JS, ["navback", "", ""])
    check(f"{label} 標準DOM自檢④ {len(nav_cases)} 個切換列反例都抓得到", not wrong, wrong)
    check(f"{label} 標準DOM自檢④ 復原後真切換列通過", not std_nav_problems(page.evaluate(STD_NAV_JS), self_key))
    # ⑤
    rb_cases = [
        ("<meta name=\"robots\" title=\" content='noindex'\">", "<meta name=\"robots\" title=\" content='noindex'\">", False),
        ("<meta name=\"robots\" data-content=\"noindex\">", '<meta name="robots" data-content="noindex,nofollow">', False),
        ("robots meta 包在註解裡", '<!--<meta name="robots" content="noindex,nofollow">-->', False),
        ("content=\"index,follow\"", '<meta name="robots" content="index,follow">', False),
        ("content=\"noindexer\"（不是 noindex 這個字）", '<meta name="robots" content="noindexer">', False),
        ("合法：大寫 NAME=ROBOTS CONTENT=NOINDEX", '<meta name="ROBOTS" content="NOINDEX, NOFOLLOW">', True),
    ]
    wrong = []
    for name, html, want in rb_cases:
        page.evaluate(STD_MUTATE_JS, ["robots", "", html])
        got = std_robots_ok(page.evaluate(STD_ROBOTS_JS))
        page.evaluate(STD_MUTATE_JS, ["robotsback", "", ""])
        if got != want:
            wrong.append(f"{name}：應判{want}，判成{got}")
    check(f"{label} 標準DOM自檢⑤ {len(rb_cases)} 個 robots meta 反例／正例都判對", not wrong, wrong)
    check(f"{label} 標準DOM自檢⑤ 復原後真 meta 通過", std_robots_ok(page.evaluate(STD_ROBOTS_JS)))
# ===== 共通「標準 DOM」判準到此 =====


def flow_standard_dom(browser):
    """三站共通標準的主閘（真瀏覽器 DOM，Chromium 390 寬）：④切換列 ⑤noindex ②每種說法都有圖，每條附自檢（std_selftest）。
    tests/standard.test.js 的②④⑤靜態判準只是輔助。②走過：11 個觀念頁 × 兩種說法（真畫面點，並核對畫面上的圖＝
    G5MathExplain 的 svg() 輸出）、真畫面答錯→「還不懂這個觀念」的補救圖、「跟著算一題」的圖。"""
    ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True})
    tag = "手機390"
    std_page_check(pg, tag, "math")
    cids = pg.evaluate("Object.keys(G5MathBank.CONCEPTS)")
    bad, seen, tested = [], 0, False
    same_js = """([cid, way]) => { const a = [...document.querySelectorAll('#main .remedy svg[role="img"]')].map((s) => s.outerHTML);
      const t = document.createElement('div'); t.innerHTML = G5MathExplain.EXPLAIN[cid][way].svg();
      return a.length > 0 && JSON.stringify(a) === JSON.stringify([...t.querySelectorAll('svg[role="img"]')].map((s) => s.outerHTML)); }"""
    for cid in cids:
        pg.locator(f'#concepts .ccard[data-cid="{cid}"]').click(); pg.wait_for_selector("#main .remedy")
        ways = pg.evaluate("(cid) => G5MathExplain.EXPLAIN[cid].length", cid)
        if ways > 2:
            bad.append(f"{cid} 有 {ways} 種說法，畫面只會顯示兩種")
        for way in range(min(ways, 2)):
            if way == 1:
                pg.locator("#cMore").click()
            bad += [f"{cid} 第 {way + 1} 種說法：{p}" for p in std_fig_problems(pg.evaluate(STD_FIG_JS, "#main .remedy"), 1)]
            if not pg.evaluate(same_js, [cid, way]):
                bad.append(f"{cid} 第 {way + 1} 種說法：畫面上的圖和 svg() 輸出不同")
            seen += 1
        if not tested:
            std_selftest(pg, tag, "math", ('#main .remedy svg[role="img"]', "#main .remedy")); tested = True
        pg.locator("#cBack").click(); pg.wait_for_selector("#concepts .ccard")
    check(f"{tag} 標準DOM② {len(cids)} 個觀念頁 × 每種說法（{seen} 張）都有看得見、畫出東西的圖，且就是 svg() 的輸出", cids and not bad, bad)
    pg.locator("#goAll").click(); pg.wait_for_selector("#main .q")
    answer(pg, False)
    pg.locator('#errq button[data-k="concept"]').click(); pg.wait_for_selector("#remedy")
    rem = std_fig_problems(pg.evaluate(STD_FIG_JS, "#remedy"), 1)
    check(f"{tag} 標準DOM② 真畫面答錯補救有看得見、畫出東西的圖", not rem, rem)
    pg.locator("#toLab").click(); pg.wait_for_selector("#labPredict button[data-g]")
    pg.locator("#labPredict button[data-g]").first.click()
    lab = std_fig_problems(pg.evaluate(STD_FIG_JS, "#labBody"), 1)
    check(f"{tag} 標準DOM②「跟著算一題」有看得見、畫出東西的圖", not lab, lab)
    check(f"{tag} 標準DOM 沒有 JS 錯誤", not errors, errors)
    ctx.close()


def flow_main(browser, label, device=None):
    ctx, pg, errors = open_page(browser, device)
    check(f"{label} 首頁標題與倒數", "五上數學複習" in pg.title() and pg.locator("#days").inner_text().strip().isdigit())
    check(f"{label} 11 個觀念入口", pg.locator("#concepts .ccard").count() == 11, pg.locator("#concepts .ccard").count())
    check(f"{label} 小考複習列出第 1～6 單元", all(pg.locator(f'button[data-rv="u{u}"]').count() == 1 for u in ["m1", "m2", "m3", "m4", "m5", "m6"]))
    check(f"{label} 沒有水平捲動", no_overflow(pg))
    check(f"{label} 六站切換列（#1333＋#1351＋錯題複習）：六項、目前站是「五上數學複習」", pg.locator("#siteNav a, #siteNav [aria-current]").count() == 6 and pg.locator('#siteNav [aria-current="page"]').inner_text() == "五上數學複習")
    pg.locator("#goAll").click()
    pg.wait_for_selector("#main .q")
    c, _ = answer(pg, True)
    check(f"{label} 答對：顯示答對了與解說", "答對了" in pg.locator("#ansBox").inner_text())
    pg.locator("#next").click(); pg.wait_for_selector("#main .q")
    c2, picked = answer(pg, False)
    box = pg.locator("#ansBox").inner_text()
    check(f"{label} 答錯：顯示正確答案、你選的為什麼錯", "正確答案是" in box and "你選的" in box, box[:200])
    pg.locator('#errq button[data-k="concept"]').click()
    pg.wait_for_selector("#remedy")
    check(f"{label} 補救：有圖解（svg）與「跟著算一題」", pg.locator("#remedy svg.fig").count() >= 1 and pg.locator("#toLab").count() == 1)
    pg.locator("#toLab").click()
    pg.wait_for_selector("#labPredict button[data-g]")
    pg.locator("#labPredict button[data-g]").first.click()
    n = 0
    while pg.locator("#mNext").is_visible() and n < 10:
        pg.locator("#mNext").click(); n += 1
    check(f"{label} 跟著算：每一步都看過後可以換一題確認", pg.locator("#labDone").is_enabled(), n)
    pg.locator("#labDone").click()
    pg.wait_for_selector("#main .q")
    head = pg.locator("#main .qhead").inner_text()
    c3 = current_card(pg)
    check(f"{label} 換一題確認：同一個觀念、不同的題", "同觀念換一題確認" in head and c3 and c3["concept"] == c2["concept"] and c3["id"] != c2["id"], {"head": head, "c2": c2, "c3": c3})
    saved = json.loads(pg.evaluate("localStorage.getItem('g5math.v2')") or "null")
    check(f"{label} 存檔在 g5math.v2，作答都記到", saved and len(saved.get("log", [])) >= 2, (saved or {}).get("log"))
    pg.reload(); pg.wait_for_selector("#main .btn, #main .done")
    saved2 = json.loads(pg.evaluate("localStorage.getItem('g5math.v2')") or "null")
    check(f"{label} 重新整理後紀錄還在", saved2 and len(saved2.get("log", [])) == len(saved.get("log", [])))
    check(f"{label} 沒有 JS 錯誤", not errors, errors)
    ctx.close()


def flow_concepts(browser, label, device=None):
    ctx, pg, errors = open_page(browser, device)
    cids = pg.evaluate("Object.keys(G5MathBank.CONCEPTS)")
    bad = []
    for cid in cids:
        pg.locator(f'#concepts .ccard[data-cid="{cid}"]').click()
        pg.wait_for_selector("#main .remedy")
        first = pg.locator("#main .remedy strong").first.inner_text()
        ok = pg.locator("#main .remedy svg.fig").count() == 1 and pg.locator("#main .remedy li").count() >= 2
        pg.locator("#cMore").click()
        second = pg.locator("#main .remedy strong").first.inner_text()
        ok = ok and second != first and pg.locator("#main .remedy svg.fig").count() == 1 and pg.locator("#main .remedy li").count() >= 2
        ok = ok and pg.locator("#main .vids button[data-play]").count() >= 1   # #1335：每個觀念頁都有影片
        if not ok or not no_overflow(pg):
            bad.append(cid)
        pg.locator("#cBack").click(); pg.wait_for_selector("#concepts .ccard")
    check(f"{label} 11 個觀念頁：兩種說法都有圖與步驟、沒有水平捲動", not bad, bad)
    check(f"{label} 觀念頁沒有 JS 錯誤", not errors, errors)
    ctx.close()


# 播放器畫面出現這些字＝不能播（YouTube 嵌入錯誤頁；英文介面與中文介面都列）。比對時不分大小寫。
PLAYER_ERROR_MARKS = ("video unavailable", "this video is private", "private video", "error 153", "錯誤 153",
                      "無法播放", "影片無法觀看", "私人影片", "an error occurred", "發生錯誤",
                      "sign in to confirm", "登入以確認")
# 讀播放器 iframe 裡的真實狀態。2026-10-13 正式網址實測：正常播放時 body 文字常是空的（2a 播到 116 秒、6b 播到 92 秒，innerText 都是 ""），
# 所以「沒有文字」不能當失敗；能不能播看 <video> 元素：存在、沒有 YouTube 錯誤畫面、沒暫停或時間已前進。
PLAYER_STATE_JS = """b => { const v = b.querySelector('video'), e = b.querySelector('.ytp-error');
  return {text: (b.innerText || '').trim().slice(0, 200), hasVideo: !!v, t: v ? v.currentTime : null, paused: v ? v.paused : null,
          err: e ? (e.innerText || 'ytp-error').trim().slice(0, 120) : ''}; }"""


PLAY_GAP_MS = 2000        # 兩次讀狀態之間隔多久
PLAY_MIN_ADVANCE = 0.5    # 隔 PLAY_GAP_MS 後 currentTime 至少要多這麼多秒，才算真的在播


def player_problem(src, rp, read_state, wait):
    """判斷一個嵌入播放器是不是真的在播；回傳問題說明，在播回傳 None。
    read_state() 回傳 {text, hasVideo, t, paused, err}；先讀一次、wait()（約 2 秒）、再讀一次：
    兩次都要讀得到、有 <video>、沒有錯誤畫面；第二次 paused=false，且 currentTime 比第一次多 ≥ PLAY_MIN_ADVANCE 秒。
    Codex 審 236d77d2：舊版捕捉例外後只設 body，全部逾時／空白／Video unavailable 都 PASS。
    Codex 審 9545348b：單次快照不能證明在播——{t:102, paused:true}（停在起點）、{paused:false, t:0}（沒前進）舊版都判通過。"""
    if "youtube-nocookie.com/embed/" not in (src or ""):
        return f"iframe 沒指向 youtube-nocookie：{src}"
    if rp != "strict-origin-when-cross-origin":
        return f"referrerpolicy 不對：{rp}"
    states = []
    for k in (1, 2):
        if k == 2:
            wait()
        try:
            st = read_state()
        except Exception as e:  # noqa: BLE001 — 任何讀取失敗都是播放失敗
            return f"第 {k} 次讀不到播放器內容（{type(e).__name__}：{str(e)[:60]}）"
        if not isinstance(st, dict):
            return f"第 {k} 次讀到的播放器狀態讀不懂：{st!r}"[:120]
        low = (str(st.get("text") or "") + " " + str(st.get("err") or "")).lower()
        hit = next((m for m in PLAYER_ERROR_MARKS if m.lower() in low), None)
        if st.get("err") or hit:
            return f"第 {k} 次讀：播放器顯示錯誤（{hit or st.get('err')}）"
        if not st.get("hasVideo"):
            return f"第 {k} 次讀：播放器裡沒有 <video>（沒有載入影片）"
        states.append(st)
    t1, t2 = states[0].get("t"), states[1].get("t")
    if not all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in (t1, t2)):
        return f"讀不到播放時間（t={t1}→{t2}）"
    if states[1].get("paused") is not False:
        return f"第二次讀時影片沒有在播（paused={states[1].get('paused')}、t={t2}）"
    if t2 - t1 < PLAY_MIN_ADVANCE:
        return f"影片沒有往前播（隔約 {PLAY_GAP_MS / 1000:g} 秒，t {t1}→{t2}，只多 {t2 - t1:.2f} 秒，至少要 {PLAY_MIN_ADVANCE}）"
    return None


def selftest_player():
    """播放判準的替身測試（不開瀏覽器）：餵假的兩次狀態序列，斷言判對；也斷言兩次讀之間真的有等（呼叫順序 讀→等→讀）。"""
    ok_src, ok_rp = "https://www.youtube-nocookie.com/embed/abcdefghijk?start=102", "strict-origin-when-cross-origin"

    def st(**kw):
        return dict({"text": "", "hasVideo": True, "t": 102.0, "paused": False, "err": ""}, **kw)
    boom = TimeoutError("frame 逾時")
    cases = [  # (說明, 兩次狀態（例外＝讀時丟出）, 應判在播?)
        ("Codex 反例 {t:102, paused:true}：停在起點", [st(t=102, paused=True), st(t=102, paused=True)], False),
        ("Codex 反例 {paused:false, t:0}：沒前進", [st(t=0, paused=False), st(t=0, paused=False)], False),
        ("正常在播：102→104.1", [st(t=102), st(t=104.1)], True),
        ("剛好前進 0.5 秒", [st(t=102), st(t=102.5)], True),
        ("第二次暫停（雖然時間有前進）", [st(t=102), st(t=104, paused=True)], False),
        ("第二次 paused=None（讀不到）", [st(t=102), st(t=104, paused=None)], False),
        ("只前進 0.3 秒（緩衝中）", [st(t=102), st(t=102.3)], False),
        ("時間倒退", [st(t=110), st(t=102)], False),
        ("第一次 paused=true、第二次在播且前進", [st(t=102, paused=True), st(t=103.9)], True),
        ("第二次讀逾時", [st(t=102), boom], False),
        ("第一次讀逾時", [boom, st(t=104)], False),
        ("第二次出現 Video unavailable", [st(t=102), st(t=104, text="Video unavailable. This video is private.")], False),
        ("第一次有 .ytp-error", [st(err="ytp-error"), st(t=104)], False),
        ("Sign in to confirm you're not a bot", [st(t=102, text="Sign in to confirm you're not a bot"), st(t=104)], False),
        ("沒有 <video>", [st(hasVideo=False, t=None, paused=None), st(hasVideo=False, t=None, paused=None)], False),
        ("t 是 None", [st(t=None), st(t=None)], False),
        ("t 是字串", [st(t="102"), st(t="104")], False),
        ("狀態不是 dict", ["???", st(t=104)], False),
    ]
    wrong = []
    for name, seq, want in cases:
        log, it = [], iter(seq)

        def read():
            log.append("讀"); x = next(it)
            if isinstance(x, Exception):
                raise x
            return x
        got = player_problem(ok_src, ok_rp, read, lambda: log.append("等")) is None
        if got != want:
            wrong.append(f"{name}：應判{'在播' if want else '沒在播'}，判成{'在播' if got else '沒在播'}")
        if want and log != ["讀", "等", "讀"]:
            wrong.append(f"{name}：呼叫順序應為 讀→等→讀，實際 {log}")
    if player_problem("https://www.youtube.com/embed/abcdefghijk", ok_rp, lambda: st(), lambda: None) is None:
        wrong.append("iframe 不是 youtube-nocookie 卻判在播")
    if player_problem(ok_src, "no-referrer", lambda: st(), lambda: None) is None:
        wrong.append("referrerpolicy 錯卻判在播")
    check(f"播放判準替身測試：{len(cases) + 2} 個假狀態序列都判對（含 Codex 的 {{t:102,paused:true}}、{{paused:false,t:0}}）", not wrong, wrong)


def flow_video_live(browser, label, device=None):
    """只在線上版跑（#1335）：每個觀念頁按第一段影片播放，iframe 指向 youtube-nocookie、帶 referrerpolicy；
    等播放器載入後隔約 2 秒讀兩次 <video>：都有 <video>、沒有 Video unavailable／private／錯誤 153，第二次在播且時間前進 ≥0.5 秒。
    任何一個觀念失敗就記 FAIL。"""
    ctx, pg, errors = open_page(browser, device)
    bad, ok = [], []
    cids = pg.evaluate("Object.keys(G5MathBank.CONCEPTS)")
    for cid in cids:
        pg.locator(f'#concepts .ccard[data-cid="{cid}"]').click(); pg.wait_for_selector("#main .remedy")
        b = pg.locator("#main .vids button[data-play]").first
        b.click()
        fr = pg.locator("#main .vids iframe").first
        src, rp = fr.get_attribute("src"), fr.get_attribute("referrerpolicy")
        pg.wait_for_timeout(5000)
        seen = []

        def read():
            s = pg.frame_locator("#main .vids iframe").first.locator("body").evaluate(PLAYER_STATE_JS, timeout=10000)
            seen.append({k: s.get(k) for k in ("t", "paused")} if isinstance(s, dict) else s)
            return s
        why = player_problem(src, rp, read, lambda: pg.wait_for_timeout(PLAY_GAP_MS))
        if why:
            bad.append((cid, why))
        else:
            ok.append((cid, seen))
        pg.locator("#cBack").click(); pg.wait_for_selector("#concepts .ccard")
    print("  影片兩次讀到的狀態（觀念：[第一次, 第二次]）：" + json.dumps(ok, ensure_ascii=False))
    check(f"{label} {len(cids)} 個觀念的影片都真的在播（隔 {PLAY_GAP_MS / 1000:g} 秒讀兩次：有 <video>、無錯誤畫面、第二次沒暫停、時間前進 ≥{PLAY_MIN_ADVANCE} 秒）", cids and not bad, bad or "沒有任何觀念")
    ctx.close()


def flow_review(browser):
    ctx, pg, errors = open_page(browser)
    check("小考複習按鈕寫「第 4 單元 擴分、約分和通分」", "第 4 單元 擴分、約分和通分" in pg.locator("#main .review").inner_text(), pg.locator("#main .review").inner_text()[:200])
    pg.locator('button[data-rv="um4"]').click(); pg.wait_for_selector("#main .q")
    c = current_card(pg)
    check("小考複習：第 4 單元只出擴分約分通分的題", c and c["concept"] in ("4a", "4b"), c)
    check("小考複習沒有 JS 錯誤", not errors, errors)
    ctx.close()


# A17 最終產物（docs/design-verify-shown-codex-20261013.md）：只讀畫面上的題文與「依畫面順序」的按鈕文字，
# 用 tests/verify_shown.js（和 node 主閘同一個驗算器）獨立求解；每張卡的每個選項各在一個全新的瀏覽器狀態裡實際點一次，
# 斷言「UI 判對」⇔「獨立求得的唯一正解」。不讀題庫的 a；題庫只拿 q／opts 核對「畫面＝受驗資料」。
A17_OPEN_MS = 15000


def solve_shown(items):
    import subprocess
    r = subprocess.run(["node", str(ROOT / "tests" / "verify_shown.js")], input=json.dumps(items, ensure_ascii=False),
                       capture_output=True, text=True, timeout=120)
    if r.returncode:
        raise RuntimeError("驗算器失敗：" + r.stderr[:300])
    return json.loads(r.stdout)


A17_SHOWN_JS = """() => { const q = document.querySelector('#main .q'); if (!q) return null;
  const bs = [...document.querySelectorAll('#main .opt')].map((b, dom) => { const r = b.getBoundingClientRect();
    return {text: b.innerText, dom, y: Math.round(r.top), x: Math.round(r.left), seen: r.width > 0 && r.height > 0}; });
  bs.sort((a, b) => a.y - b.y || a.x - b.x);
  return {q: q.innerText, opts: bs.map((b) => b.text), dom: bs.map((b) => b.dom), hidden: bs.filter((b) => !b.seen).length}; }"""


def flow_a17(browser):
    ctx, pg, errors = open_page(browser)
    cids = pg.evaluate("Object.keys(G5MathBank.CONCEPTS)")
    bank = pg.evaluate("G5MathBank.CARDS.map(function(c){return [c.q, c.opts];})")   # 只取 q／opts 核對畫面，不取 a
    ctx.close()
    seen, problems = {}, []
    for cid in cids:
        for k in range(4):   # 第 k 輪：每張卡點畫面上第 k 個按鈕（卡片選項最多 4 個）；每輪都是全新的瀏覽器狀態
            ctx, pg, errs = open_page(browser)
            errors += errs
            pg.locator(f'#concepts .ccard[data-cid="{cid}"]').click(); pg.wait_for_selector("#cAll", timeout=A17_OPEN_MS)
            pg.locator("#cAll").click(); pg.wait_for_selector("#main .q", timeout=A17_OPEN_MS)
            for _ in range(80):
                sh = pg.evaluate(A17_SHOWN_JS)
                if not sh or not sh["opts"]:
                    break
                key = sh["q"] + "␞" + "␟".join(sh["opts"])
                rec = seen.setdefault(key, {"q": sh["q"], "opts": sh["opts"], "cid": cid, "judged": {}})
                if sh["hidden"]:
                    problems.append(f"{cid}「{sh['q'][:20]}」有看不見的選項按鈕")
                pick = k if k < len(sh["opts"]) else 0
                pg.locator("#main .opt").nth(sh["dom"][pick]).click()
                box = pg.locator("#ansBox").inner_text()
                if k < len(sh["opts"]):
                    if "還沒存到" in box:
                        problems.append(f"{cid}「{sh['q'][:20]}」第 {k} 個選項：作答沒存到（{box[:40]}）")
                    elif k in rec["judged"]:
                        problems.append(f"{cid}「{sh['q'][:20]}」同一輪出現兩次")
                    else:
                        rec["judged"][k] = "答對了" in box and "正確答案是" not in box
                if pg.locator("#next").count() == 0:
                    pg.locator('#errq button[data-k=""]').click()
                pg.locator("#next").click()
            ctx.close()
    items = list(seen.values())
    bank_keys = {q + "␞" + "␟".join(o) for q, o in bank}
    check(f"A17 畫面題卡＝受驗資料：{len(items)} 張（題庫 {len(bank)} 張）、題文與依畫面順序的按鈕文字都和題庫一致",
          len(items) == len(bank) and all((it["q"] + "␞" + "␟".join(it["opts"])) in bank_keys for it in items),
          [it["q"][:30] for it in items if (it["q"] + "␞" + "␟".join(it["opts"])) not in bank_keys][:5] or len(items))
    unclicked = [it["q"][:30] for it in items if sorted(it["judged"]) != list(range(len(it["opts"])))]
    check("A17 每張卡的每個選項都在全新狀態下實際點過一次", not unclicked and not problems, (unclicked + problems)[:8])
    sol = solve_shown([{"q": it["q"], "opts": it["opts"]} for it in items])
    unsolved = [f"{it['q'][:30]}：{s['issues']}" for it, s in zip(items, sol) if s["issues"] or len(s["correctIndices"]) != 1]
    check(f"A17 獨立驗算器從畫面文字解出 {len(items)} 張卡，每張恰一個正解、沒有問題原因", not unsolved, unsolved[:8])
    clicks = sum(len(it["judged"]) for it in items)
    mismatch = [f"{it['q'][:30]}｜{it['opts'][i]}：UI {'判對' if it['judged'][i] else '判錯'}，驗算 {'正解' if i in s['correctIndices'] else '錯誤'}"
                for it, s in zip(items, sol) for i in sorted(it["judged"]) if it["judged"][i] != (i in s["correctIndices"])]
    check(f"A17 實際點擊 {clicks} 次：只有獨立求得的唯一正解被 UI 判對", clicks and not mismatch, mismatch[:8])
    check("A17 作答過程沒有 JS 錯誤", not errors, errors[:3])


def main():
    with sync_playwright() as p:
        selftest_player()
        cr = p.chromium.launch()
        flow_standard_dom(cr)
        if BASE.startswith("https:"):
            flow_video_live(cr, "線上Chromium")
        flow_main(cr, "桌機", {"viewport": {"width": 1280, "height": 900}})
        flow_main(cr, "手機390", {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True, "device_scale_factor": 2})
        flow_concepts(cr, "手機390", {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True})
        flow_review(cr)
        flow_a17(cr)
        cr.close()
        wk = p.webkit.launch()
        ipad = p.devices["iPad (gen 7)"]
        flow_main(wk, "iPad", ipad)
        flow_concepts(wk, "iPad", ipad)
        wk.close()
    bad = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(bad)}/{len(RESULTS)} PASS")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
