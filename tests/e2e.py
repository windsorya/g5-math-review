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
          current: [...nav.querySelectorAll('[aria-current="page"]')].map((e) => (seen(e) ? '' : '（看不見）') + (e.textContent || '').trim())}; }   // 每個標記都算數量；看不見的直接不等於本站名（Codex 審 4d8b1e0／f26e093：先濾掉再數，藏起來的重複標記會假通過）"""
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
    // <image>／<use> 不算：量得到寬高，量不到它真的畫了什麼——<use href="#r" fill="none" stroke="none"> 什麼都沒畫也有寬高
    // （Codex 審 g5-help 5d3cf6f2），<image> 圖檔讀不到也一樣。三站內容 0 處用到（2026-10-18 實查），畫圖一律用基本圖形或 <text>。
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
    ("<use> 參照的圖形沒填色也沒描邊", '<defs><rect id="stdUseR" x="10" y="10" width="40" height="30"/></defs><use href="#stdUseR" fill="none" stroke="none"/>', False),
    ("<image> 圖檔讀不到", '<image href="data:image/png;base64,AAAA" x="10" y="10" width="40" height="30"/>', False),
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
        ("多一個藏起來的本站標記", "const x = document.createElement('span'); x.setAttribute('aria-current', 'page'); x.hidden = true; x.textContent = '重複'; nav.appendChild(x);"),
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


def flow_redo_after_external_clear(browser):
    """Codex 審 g5-sci-review 4d8b1e0（四站同型）：做完含答錯題的一輪 → 存檔被別處清掉 → 切回頁面（只重畫側欄，結束畫面還在）
    → 按「再練答錯的」，舊版 V().session.wrong 讀 null 拋 TypeError、按鈕沒反應。"""
    ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
    pg.locator("#goLight").click(); pg.wait_for_selector("#main .q")
    answer(pg, False); pg.locator('#errq button[data-k=""]').click()
    for _ in range(8):
        if pg.locator("#goRedo").count():
            break
        if pg.locator("#next").count() and pg.locator("#next").is_visible():
            pg.locator("#next").click()
        elif pg.locator("#main .q").count():
            answer(pg, True)
    check("清檔前：一輪結束畫面有「再練答錯的 1 張」", "再練答錯的 1 張" in pg.inner_text("#main"), pg.inner_text("#main")[:160])
    pg.evaluate("localStorage.removeItem('g5math.v2'); document.dispatchEvent(new Event('visibilitychange')); 0")
    pg.locator("#goRedo").click()
    check("存檔被別處清掉後按舊畫面的「再練答錯的」：不拋錯、回到首頁", not errors and pg.locator("#goAll").count() == 1, errors or pg.inner_text("#main")[:160])
    ctx.close()


def flow_lab_after_external_clear(browser):
    """Codex 審 g5-chinese-review c28888ed（#1541，四站同型）：跟著算一題中途存檔被別處清掉（別的分頁清除、同步換檔）→ 切回頁面
    → 再按跟著算一題頁的按鈕，核心回 NO_RUN；舊版留在原畫面、按了沒反應也沒有任何提示。新版照磁碟現況回首頁。另驗正常完成仍到完成畫面。"""
    clear = "localStorage.removeItem('g5math.v2'); document.dispatchEvent(new Event('visibilitychange')); 0"

    def open_lab(pg):
        pg.locator("#concepts .ccard").first.click(); pg.wait_for_selector("#cLab")
        pg.locator("#cLab").click(); pg.wait_for_selector("#labPredict button[data-g]")

    def open_lab_wrong(pg):   # 答錯後補救進來（完成鈕是「我看懂了，換一題確認」）
        pg.locator("#goAll").click(); pg.wait_for_selector("#main .q")
        answer(pg, False); pg.locator('#errq button[data-k="concept"]').click()
        pg.wait_for_selector("#toLab"); pg.locator("#toLab").click(); pg.wait_for_selector("#labPredict button[data-g]")

    def see_all(pg):
        pg.locator("#labPredict button[data-g]").first.click()
        n = 0
        while pg.locator("#mNext").is_visible() and n < 20:
            pg.locator("#mNext").click(); n += 1

    ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
    open_lab(pg); see_all(pg); pg.locator("#labDone").click()
    check("跟著算一題（觀念頁進來）：正常完成到完成畫面", pg.locator("#main .done").count() == 1 and "算完了" in pg.inner_text("#main"), pg.inner_text("#main")[:120])
    ctx.close()
    bg = "localStorage.removeItem('g5math.v2'); 0"   # 沒切換頁面（同步在背景換檔）：記憶體還有這一輪，存檔時核心才回 NO_RUN
    mid = lambda p: p.locator("#labPredict button[data-g]").first.click()
    for name, opener, before, js, press in [("全部看完後按完成", open_lab, see_all, clear, "#labDone"),
                                            ("（答錯補救進來）全部看完後按「我看懂了，換一題確認」", open_lab_wrong, see_all, clear, "#labDone"),
                                            ("看到一半按「下一步」", open_lab, mid, clear, "#mNext"),
                                            ("（沒切換頁面）看到一半按「下一步」", open_lab, mid, bg, "#mNext"),
                                            ("還沒猜就點猜測選項", open_lab, lambda p: None, clear, "#labPredict button[data-g] >> nth=0")]:
        ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
        opener(pg); before(pg)
        pg.evaluate(js); pg.locator(press).click()
        check(f"跟著算一題中存檔被別處清掉後{name}：回到首頁、沒有 JS 錯誤",
              not errors and pg.locator("#labNav").count() == 0 and pg.locator("#goAll").count() == 1, errors or pg.inner_text("#main")[:120])
        ctx.close()
    # 社會站 Codex 審 e195ef98 第 3 項後半（#1542，四站同型 #2231）：下一步存檔失敗（留下待存）→ 恢復 → 存檔被別處清掉 → 按「再存一次」。
    # 舊版核心回 NO_RUN 但留著待存、狀態仍 failed：按了沒反應、提示列一直在。應該：回首頁、提示列消失。
    ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
    open_lab(pg); mid(pg)
    pg.evaluate("window.__realSet = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); }; 0")
    pg.locator("#mNext").click(); pg.evaluate("Storage.prototype.setItem = window.__realSet; 0")
    had_retry = pg.locator("#retrySave").count() == 1
    pg.evaluate(bg); pg.locator("#retrySave").click()
    check("跟著算一題存檔失敗待重試中、存檔又被別處清掉後按「再存一次」：回到首頁、提示列消失、沒有 JS 錯誤",
          had_retry and not errors and pg.locator("#labNav").count() == 0 and pg.locator("#goAll").count() == 1 and pg.locator("#retrySave").count() == 0,
          {"先出現再存一次": had_retry, "errors": errors, "main": pg.inner_text("#main")[:80], "再存一次": pg.locator("#retrySave").count()})
    ctx.close()
    # Codex 審 baf22229 第 2 項（#2633）：一步存檔失敗 → 回首頁 → 進觀念頁、寫入仍失敗時按「跟著算一題」（開不成，人還在觀念頁、screen 卻已是 lab）
    # → 存檔被別處清掉、寫入恢復 → 按「再存一次」：不得把她從觀念頁甩回首頁。
    ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
    open_lab(pg); mid(pg)
    pg.evaluate("window.__realSet = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); }; 0")
    pg.locator("#mNext").click(); pg.locator("#labHome").click()
    pg.locator("#concepts .ccard").first.click(); pg.wait_for_selector("#cLab"); pg.locator("#cLab").click()
    on_concept = pg.locator("#cLab").count() == 1 and pg.locator("#labNav").count() == 0
    pg.evaluate(bg); pg.evaluate("Storage.prototype.setItem = window.__realSet; 0"); pg.locator("#retrySave").first.click()
    check("學習頁沒開成、人還在觀念頁時按「再存一次」（那一輪已被別處清掉）：留在觀念頁、提示列消失、沒有 JS 錯誤",
          on_concept and not errors and pg.locator("#cLab").count() == 1 and pg.locator("#goAll").count() == 0 and pg.locator("#retrySave").count() == 0,
          {"先在觀念頁": on_concept, "errors": errors, "main": pg.inner_text("#main")[:80], "再存一次": pg.locator("#retrySave").count()})
    ctx.close()


BREAK_SET = """() => { window.__realSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function () { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); }; }"""
FIX_SET = "() => { Storage.prototype.setItem = window.__realSet; }"
LAST_RUN = """() => { const s = JSON.parse(localStorage.getItem('g5math.v2') || 'null'); if (!s) return null;
  const ids = Object.keys(s.labRuns || {}); const r = s.labRuns[ids[ids.length - 1]];
  return r ? {id: ids[ids.length - 1], n: ids.length, tasksDone: r.tasksDone.slice().sort(), tasks: r.tasks} : null; }"""


def enter_lab_wrong(pg):   # 答錯後補救進來，先猜一個；回傳任務（步驟）數
    pg.locator("#goAll").click(); pg.wait_for_selector("#main .q")
    answer(pg, False); pg.locator('#errq button[data-k="concept"]').click()
    pg.wait_for_selector("#toLab"); pg.locator("#toLab").click(); pg.wait_for_selector("#labPredict button[data-g]")
    pg.locator("#labPredict button[data-g]").first.click(); pg.wait_for_selector("#mNext")
    return pg.evaluate("document.querySelectorAll('#labTask .ck').length")


def flow_lab_last_resume(browser):
    """社會站 #1542 ①（e554ab6）三姊妹站同型（#2632）：最後一步存檔失敗→恢復→切回分頁（visibilitychange 補存）。
    舊版切回分頁只重繪側欄，任務與完成鈕還是存檔前的樣子，完成鈕一直停用、「下一步」也已收起，卡死。應該：補存後完成鈕可按。"""
    ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
    n = enter_lab_wrong(pg)
    for _ in range(n - 1):
        pg.locator("#mNext").click()
    pg.evaluate(BREAK_SET); pg.locator("#mNext").click()
    had_retry = pg.locator("#retrySave").count() >= 1
    pg.evaluate(FIX_SET)
    pg.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")
    if pg.locator("#mNext").is_visible():
        pg.locator("#mNext").click()
    run = pg.evaluate(LAST_RUN)
    check("跟著算一題最後一步存檔失敗→恢復→切回分頁補存：每一步都記到、提示列消失、完成鈕可按",
          had_retry and run and run["tasksDone"] == list(range(n)) and pg.locator("#retrySave").count() == 0 and pg.locator("#labDone").is_enabled(),
          {"先出現再存一次": had_retry, "run": run, "再存一次": pg.locator("#retrySave").count(), "完成鈕": pg.locator("#labDone").is_enabled()})
    if pg.locator("#labDone").is_enabled():
        pg.locator("#labDone").click()
    check("跟著算一題補存後按「我看懂了，換一題確認」：回到練習換一題", pg.locator("#main .q").count() == 1, pg.inner_text("#main")[:120])
    check("跟著算一題最後一步補存流程沒有 JS 錯誤", not errors, errors)
    ctx.close()


def flow_lab_retry_resume(browser):
    """社會站 #1542 ②（e554ab6）三姊妹站同型（#2632）：第二步存檔失敗→恢復→按「再存一次」。
    舊版存成功後 route() 把 screen="lab" 導回首頁、lab=null，只能重開一輪。應該：留在原本那一輪，同一個 runId 做到完。"""
    ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
    n = enter_lab_wrong(pg)
    pg.locator("#mNext").click()
    pg.evaluate(BREAK_SET); pg.locator("#mNext").click()
    before = pg.evaluate(LAST_RUN)
    pg.evaluate(FIX_SET); pg.locator("#retrySave").first.click()
    after = pg.evaluate(LAST_RUN)
    still_lab = pg.locator("#labPredict").count() == 1 and pg.locator("#mNext").count() == 1
    check("跟著算一題「再存一次」成功後留在原本那一輪：兩步都記到、提示列消失",
          still_lab and after and after["tasksDone"] == [0, 1] and pg.locator("#mSteps li").count() == 2 and pg.locator("#retrySave").count() == 0,
          {"還在學習畫面": still_lab, "畫面步數": pg.locator("#mSteps li").count(), "run": after, "main": pg.inner_text("#main")[:80]})
    k = 0
    while still_lab and pg.locator("#mNext").is_visible() and k < 20:
        pg.locator("#mNext").click(); k += 1
    end = pg.evaluate(LAST_RUN)
    check("跟著算一題「再存一次」後續接同一輪（同一個 runId、沒有多開一輪）做到完、完成鈕可按",
          bool(still_lab and end and before and end["id"] == before["id"] and end["n"] == before["n"]
               and end["tasksDone"] == list(range(n)) and pg.locator("#labDone").is_enabled()), {"before": before, "end": end})
    check("跟著算一題「再存一次」續接流程沒有 JS 錯誤", not errors, errors)
    ctx.close()


def flow_lab_double_fail_resume(browser):
    """Codex 審國語站 232875bd P2（#2632，數學同碼）：第一步存好→寫入壞掉→連按兩次「下一步」（兩次都沒存到）→恢復→補存。
    舊版「下一步」不論存成功與否都前進：第三步已顯示、下一步收起，補存只救回第二步，第三步沒存也沒按鈕能重來，完成鈕永遠停用。
    應該：沒存到的那一步不往前顯示；補存後畫面停在存到的地方，接著按「下一步」做到完。兩種補存路（再存一次、切回分頁）各跑一次。"""
    for how in ("再存一次", "切回分頁"):
        ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
        n = enter_lab_wrong(pg)
        pg.locator("#mNext").click()
        pg.evaluate(BREAK_SET); pg.locator("#mNext").click(); pg.locator("#mNext").click()
        failed = {"畫面步數": pg.locator("#mSteps li").count(), "下一步": pg.locator("#mNext").is_visible()}
        pg.evaluate(FIX_SET)
        if how == "再存一次":
            pg.locator("#retrySave").first.click()
        else:
            pg.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")
        mid = pg.evaluate(LAST_RUN)
        shown = pg.locator("#mSteps li").count()
        check(f"跟著算一題連續兩步沒存到→恢復→{how}：畫面停在存到的那一步（{shown} 步＝存到 {len(mid['tasksDone']) if mid else '?'} 步）、下一步還在、提示列消失",
              n >= 3 and failed == {"畫面步數": 1, "下一步": True} and mid and mid["tasksDone"] == [0, 1] and shown == 2
              and pg.locator("#mNext").is_visible() and pg.locator("#retrySave").count() == 0,
              {"n": n, "失敗時": failed, "run": mid, "畫面步數": shown, "再存一次": pg.locator("#retrySave").count()})
        k = 0
        while pg.locator("#mNext").count() and pg.locator("#mNext").is_visible() and k < 20:
            pg.locator("#mNext").click(); k += 1
        end = pg.evaluate(LAST_RUN)
        check(f"跟著算一題連續兩步沒存到→{how}後接著做到完：每一步都記到、完成鈕可按、沒有 JS 錯誤",
              end and mid and end["id"] == mid["id"] and end["tasksDone"] == list(range(n)) and pg.locator("#labDone").is_enabled() and not errors,
              {"end": end, "完成鈕": pg.locator("#labDone").count() and pg.locator("#labDone").is_enabled(), "errors": errors})
        ctx.close()


RUNS_DONE = """() => { const s = JSON.parse(localStorage.getItem('g5math.v2') || 'null');
  return s ? Object.values(s.labRuns || {}).map(r => r.tasksDone.slice().sort()) : null; }"""
H2_TEXT = "() => { const h = document.querySelector('#main h2'); return h ? h.textContent : ''; }"   # 回首頁時沒有 h2：不等 30 秒、不丟例外


def flow_concept_retry_stays(browser):
    """#3612（四站同型）：學習頁一步存檔失敗 → 回首頁 → 進觀念頁 → 恢復寫入 → 在觀念頁按上方「再存一次」。
    舊版存成功後 route() 只認練習／結束畫面、其餘一律 renderHome，她被從觀念頁送回首頁。應該：留在同一個觀念頁、那一步有存到、提示列消失。
    第二條：回到觀念頁、寫入仍失敗時先按學習鈕（開不成）再恢復——舊版 openLab 開不成也把畫面記成學習頁，按「再存一次」一樣被送回首頁。"""
    for name, press_lab in [("回首頁再進觀念頁", False), ("回首頁再進觀念頁、寫入仍失敗時先按學習鈕（開不成）", True)]:
        ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
        cards = pg.locator("#concepts .ccard")
        cards.nth(1).click(); pg.wait_for_selector("#cLab"); pg.locator("#cLab").click()
        pg.wait_for_selector("#labPredict button[data-g]"); pg.locator("#labPredict button[data-g]").first.click()
        pg.evaluate(BREAK_SET); pg.locator("#mNext").click(); pg.locator("#labHome").click()
        cards.nth(1).click(); pg.wait_for_selector("#cLab")
        title = pg.evaluate(H2_TEXT)
        if press_lab:
            pg.locator("#cLab").click()
        before = {"在觀念頁": pg.locator("#cLab").count() == 1 and pg.locator("#labNav").count() == 0, "再存一次": pg.locator("#retrySave").count()}
        pg.evaluate(FIX_SET); pg.locator("#retrySave").first.click(); pg.wait_for_timeout(300)
        runs = pg.evaluate(RUNS_DONE)
        after = {"在觀念頁": pg.locator("#cLab").count() == 1 and pg.locator("#labNav").count() == 0, "同一個觀念": bool(title) and pg.evaluate(H2_TEXT) == title,
                 "在首頁": pg.locator("#goAll").count() == 1, "再存一次": pg.locator("#retrySave").count()}
        check(f"觀念頁按「再存一次」存成功（{name}）：留在同一個觀念頁、那一步有存到、提示列消失、沒有 JS 錯誤",
              before == {"在觀念頁": True, "再存一次": 1} and after == {"在觀念頁": True, "同一個觀念": True, "在首頁": False, "再存一次": 0}
              and runs is not None and [0] in runs and not errors,
              {"按之前": before, "按之後": after, "runs": runs, "errors": errors, "main": pg.inner_text("#main")[:80]})
        ctx.close()
    # 第 2 輪（Codex 審 50bcd7b P2）：補存後不得整頁重畫——已換的第二種說法、正在播的影片、捲動位置都要原地保留
    ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
    ctx.route("**/*youtube*", lambda r: r.abort())   # 只驗影片框還是同一個，不連外網
    cid = pg.evaluate(VID_CID)
    card = pg.locator(f'#concepts .ccard[data-cid="{cid}"]')
    card.click(); pg.wait_for_selector("#cLab"); pg.locator("#cLab").click()
    pg.wait_for_selector("#labPredict button[data-g]"); pg.locator("#labPredict button[data-g]").first.click()
    pg.evaluate(BREAK_SET); pg.locator("#mNext").click(); pg.locator("#labHome").click()
    card.click(); pg.wait_for_selector("#cLab")
    pg.locator("#cMore").click(); alt = pg.evaluate(REMEDY_NAME)
    pg.locator("#main .vids button[data-play]").first.click(); pg.wait_for_selector("#main .vframe iframe", state="attached")
    pg.wait_for_timeout(800)   # 開觀念頁時的平滑捲動先停
    y0 = pg.evaluate("() => { window.__vf = document.querySelector('#main .vframe iframe'); window.scrollTo(0, 400); return window.scrollY; }")
    pg.evaluate(FIX_SET); pg.locator("#retrySave").first.click(); pg.wait_for_timeout(800)
    kept = {"第二種說法": bool(alt) and pg.evaluate(REMEDY_NAME) == alt, "換說法鈕仍收起": pg.locator("#cMore").count() == 1 and pg.locator("#cMore").is_hidden(),
            "影片沒被關": pg.evaluate("() => !!window.__vf && document.querySelector('#main .vframe iframe') === window.__vf"),
            "沒捲動": y0 > 100 and abs(pg.evaluate("() => window.scrollY") - y0) < 2, "在觀念頁": pg.locator("#cLab").count() == 1, "再存一次": pg.locator("#retrySave").count()}
    check("觀念頁補存成功後原地保留：已換的第二種說法、正在播的影片、捲動位置都還在，沒有 JS 錯誤",
          cid and kept == {"第二種說法": True, "換說法鈕仍收起": True, "影片沒被關": True, "沒捲動": True, "在觀念頁": True, "再存一次": 0} and not errors,
          {"觀念": cid, "結果": kept, "y0": y0, "errors": errors})
    ctx.close()
    # 第 2 輪：存檔衍生的資訊要跟著更新——練習作答沒存到 → 進那張卡的觀念頁 → 恢復 →「再存一次」：「直接闖關」少一題
    ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
    pg.locator("#goAll").click(); pg.wait_for_selector("#main .q")
    pg.evaluate(BREAK_SET); c, _ = answer(pg, True)
    failed = pg.locator("#retrySave").count() >= 1
    pg.locator(f'#concepts .ccard[data-cid="{c["concept"]}"]').click(); pg.wait_for_selector("#cLab")
    n0 = pg.evaluate(GO_LEFT)
    pg.evaluate(FIX_SET); pg.locator("#retrySave").first.click(); pg.wait_for_timeout(300)
    n1 = pg.evaluate(GO_LEFT)
    saved = json.loads(pg.evaluate("localStorage.getItem('g5math.v2')") or "null")
    check("練習作答沒存到→進觀念頁→「再存一次」：作答存到、留在觀念頁、「直接闖關」題數跟著少一題",
          failed and n0 is not None and n1 == n0 - 1 and saved and any(e.get("card") == c["id"] for e in saved.get("log", []))
          and pg.locator("#cLab").count() == 1 and pg.locator("#retrySave").count() == 0 and not errors,
          {"先失敗": failed, "補存前": n0, "補存後": n1, "卡": c["id"], "errors": errors})
    ctx.close()
    # 第 3 輪（Codex 審第 2 輪 P2）：觀念頁上寫入仍壞時按「直接闖關」會跳提示（toast 插在 #main 最前面、3.5 秒後才消失）；
    # 提示還在就恢復並「再存一次」：只更新觀念頁容器本身——第 2 輪把 #main 第一個子節點（提示）當容器，說明、按鈕各長出第二份、題數不更新
    ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
    pg.locator("#goAll").click(); pg.wait_for_selector("#main .q")
    pg.evaluate(BREAK_SET); c, _ = answer(pg, True)
    pg.locator(f'#concepts .ccard[data-cid="{c["concept"]}"]').click(); pg.wait_for_selector("#cLab")
    n0 = pg.evaluate(GO_LEFT)
    pg.locator("#cGo").click(); toasted = pg.locator("#main > .hint").count() >= 1   # toast 是 #main 的直屬子節點；觀念頁自己的提示都包在容器裡
    pg.evaluate(FIX_SET); pg.locator("#retrySave").first.click(); pg.wait_for_timeout(300)
    still = pg.locator("#main > .hint").count() >= 1   # 補存當下提示還沒消失＝受審情境成立
    n1 = pg.evaluate(GO_LEFT)
    cnt = pg.evaluate("() => ['#cLab', '#cMore', '#main .remedy', '#cGo'].map(s => document.querySelectorAll(s).length)")
    check("觀念頁按「直接闖關」沒存到跳提示→提示還在就恢復→「再存一次」：說明與按鈕各一份不重複、留在觀念頁、「直接闖關」題數跟著少一題",
          toasted and still and cnt == [1, 1, 1, 1] and n0 is not None and n1 == n0 - 1 and pg.locator("#retrySave").count() == 0 and not errors,
          {"跳提示": toasted, "補存時提示還在": still, "各幾份(cLab,cMore,remedy,cGo)": cnt, "補存前": n0, "補存後": n1, "errors": errors})
    ctx.close()
    # 第 2 輪：區塊會出現／消失——觀念頁顯示「先和爸媽一起看圖解」時，家長在側欄按「已經陪她看過」沒存到 → 恢復 →「再存一次」：
    # 陪看提示要拿掉、「直接闖關」列要長出來（refreshConcept 的插入新區塊／移除舊區塊兩條路；自然站 e2e_v3 同名 flow 同一條）
    ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
    cid = pg.locator("#concepts .ccard").nth(1).get_attribute("data-cid")
    pg.evaluate("() => { const u = document.querySelector('#u3'); for (const v of [true, false]) { u.checked = v; u.dispatchEvent(new Event('change')); } }")   # 讓頁面先寫出一份正式格式的存檔
    pg.evaluate("""(a) => { const s = JSON.parse(localStorage.getItem(a.key)); s.help[a.cid] = {count: 2, last: null, way: 1, needsHelp: true};
      localStorage.setItem(a.key, JSON.stringify(s)); }""", {"key": "g5math.v2", "cid": cid})
    pg.reload(); pg.wait_for_selector("#main .btn, #main .done")
    pg.locator(f'#concepts .ccard[data-cid="{cid}"]').click(); pg.wait_for_selector("#cLab")
    stuck0 = {"陪看提示": pg.locator("#main .banner.info").count(), "直接闖關列": pg.locator("#cGoRow").count()}
    pg.evaluate(BREAK_SET); pg.evaluate("(c) => document.querySelector(`#summary button[data-helped=\"${c}\"]`).click()", cid)
    had_retry = pg.locator("#retrySave").count() >= 1
    pg.evaluate(FIX_SET); pg.locator("#retrySave").first.click(); pg.wait_for_timeout(300)
    stuck1 = {"陪看提示": pg.locator("#main .banner.info").count(), "直接闖關列": pg.locator("#cGoRow").count()}
    order = pg.evaluate("() => { const b = document.querySelector('#main > div'); const i = x => [...b.children].indexOf(document.querySelector(x)); return i('#cGoRow') > i('#main h2') && i('#cGoRow') < i('#main .remedy'); }")
    go = pg.locator("#cGo").count() == 1
    if go:   # 補存後才長出來的「直接闖關」要按得動（wireConcept 有綁到新區塊）
        pg.locator("#cGo").click(); pg.wait_for_timeout(300)
    started = pg.locator("#main .q").count() >= 1
    check("觀念頁上「已經陪她看過」沒存到→恢復→「再存一次」：陪看提示拿掉、直接闖關列長在標題與說明之間、按得動",
          stuck0 == {"陪看提示": 1, "直接闖關列": 0} and had_retry and stuck1 == {"陪看提示": 0, "直接闖關列": 1} and order and go and started
          and pg.locator("#retrySave").count() == 0 and not errors,
          {"觀念": cid, "補存前": stuck0, "先出現再存一次": had_retry, "補存後": stuck1, "位置對": order, "闖關開始": started, "errors": errors})
    ctx.close()
    # 第 1 輪（#3612 openLab 開成才設 lab）帶出的行為：練習答錯補救→去學習頁時寫入失敗（開不成）→恢復→「再存一次」：
    # 回到練習題繼續（更早的版本 screen 已被設成 lab、補存後 route() 送回首頁），作答不重複記
    ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
    pg.locator("#goAll").click(); pg.wait_for_selector("#main .q")
    answer(pg, False); pg.locator('#errq button[data-k="concept"]').click(); pg.wait_for_selector("#toLab")
    n_log = len(json.loads(pg.evaluate("localStorage.getItem('g5math.v2')"))["log"])
    pg.evaluate(BREAK_SET); pg.locator("#toLab").click()
    stay = pg.locator("#toLab").count() == 1 and pg.locator("#labNav").count() == 0
    pg.evaluate(FIX_SET); pg.locator("#retrySave").first.click(); pg.wait_for_timeout(300)
    n_after = len(json.loads(pg.evaluate("localStorage.getItem('g5math.v2')"))["log"])
    check("練習答錯補救→去學習頁開不成→恢復→「再存一次」：回到練習題、作答沒有重複記、沒有 JS 錯誤",
          stay and pg.locator("#main .q").count() == 1 and pg.locator("#goAll").count() == 0 and n_after == n_log
          and pg.locator("#retrySave").count() == 0 and not errors,
          {"開不成時還在補救": stay, "作答紀錄": (n_log, n_after), "errors": errors, "main": pg.inner_text("#main")[:60]})
    ctx.close()


VID_CID = """() => { const V = window.G5_VIDEOS || {}; const get = k => (V.V ? V.V[k] : V[k]);
  return [...document.querySelectorAll('#concepts .ccard')].map(e => e.dataset.cid).find(k => Array.isArray(get(k)) && get(k).length) || null; }"""
REMEDY_NAME = "() => { const r = document.querySelector('#main .remedy strong'); return r ? r.textContent : ''; }"
GO_LEFT = "() => { const b = document.querySelector('#cGo'); const m = b && b.textContent.match(/(\\d+) 題/); return m ? +m[1] : null; }"


def flow_lab_done_resume(browser):
    """#2632 第 2 輪（Codex 審自然站 aa365726 P2，四站同型）：每一步都看完→寫入壞掉→按完成鈕（沒存到）→恢復→補存。
    第 1 輪 labRefresh 把她留在已完成的頁面、要再按一次完成；更早的版本 route() 甩回首頁。應該：照完成鈕成功時的去向
    （答錯補救進來＝回練習換一題確認；觀念頁進來＝完成畫面）。"""
    def open_menu(pg):
        pg.locator("#concepts .ccard").first.click(); pg.wait_for_selector("#cLab")
        pg.locator("#cLab").click(); pg.wait_for_selector("#labPredict button[data-g]")
        pg.locator("#labPredict button[data-g]").first.click(); pg.wait_for_selector("#mNext")
    phase = """() => { const s = JSON.parse(localStorage.getItem('g5math.v2') || 'null'); const ids = Object.keys((s && s.labRuns) || {});
      return ids.length ? s.labRuns[ids[ids.length - 1]].phase : null; }"""
    for ctxname, opener, how in (("答錯補救進來", enter_lab_wrong, "再存一次"), ("答錯補救進來", enter_lab_wrong, "切回分頁"), ("觀念頁進來", open_menu, "再存一次")):
        ctx, pg, errors = open_page(browser, {"viewport": {"width": 390, "height": 844}})
        opener(pg)
        k = 0
        while pg.locator("#mNext").is_visible() and k < 20:
            pg.locator("#mNext").click(); k += 1
        pg.evaluate(BREAK_SET); pg.locator("#labDone").click()
        failed = {"還在學習畫面": pg.locator("#labNav").count() == 1, "再存一次": pg.locator("#retrySave").count() >= 1}
        pg.evaluate(FIX_SET)
        if how == "再存一次":
            pg.locator("#retrySave").first.click()
        else:
            pg.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")
        ph = pg.evaluate(phase)
        if ctxname == "答錯補救進來":
            dest = pg.locator("#main .q").count() == 1
        else:
            dest = pg.locator("#main .done").count() == 1 and "算完了" in pg.inner_text("#main")
        check(f"跟著算一題（{ctxname}）完成鈕那一下沒存到→恢復→{how}：存成完成、離開學習頁到該去的地方、提示列消失、沒有 JS 錯誤",
              failed == {"還在學習畫面": True, "再存一次": True} and ph == "complete" and dest and pg.locator("#labNav").count() == 0
              and pg.locator("#retrySave").count() == 0 and not errors,
              {"失敗時": failed, "phase": ph, "到該去的地方": dest, "main": pg.inner_text("#main")[:80], "errors": errors})
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
    seen, problems, err_lists = {}, [], [errors]
    for cid in cids:
        for k in range(4):   # 第 k 輪：每張卡點畫面上第 k 個按鈕（卡片選項最多 4 個）；每輪都是全新的瀏覽器狀態
            ctx, pg, errs = open_page(browser)
            err_lists.append(errs)   # 存清單本身，作答時才發生的 pageerror 也收得到（Codex 審 07656942：errors += errs 在作答前就複製，之後的錯誤全漏）
            # 2026-10-19「練這個觀念的全部」併進「直接闖關」（只出沒做過的；每輪都是全新存檔＝這站全部）
            pg.locator(f'#concepts .ccard[data-cid="{cid}"]').click(); pg.wait_for_selector("#cGo", timeout=A17_OPEN_MS)
            pg.locator("#cGo").click(); pg.wait_for_selector("#main .q", timeout=A17_OPEN_MS)
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
    errors = [e for es in err_lists for e in es]
    check("A17 作答過程沒有 JS 錯誤", not errors, errors[:3])


def selftest_a17_errors():
    """A17 錯誤收集的替身測試（不開瀏覽器；Codex 審 07656942）：載入時、點選項後、按下一題後才發生的 pageerror，
    都要讓「A17 作答過程沒有 JS 錯誤」轉紅；沒有錯誤時要綠。替身頁照 flow_a17 實際呼叫的 locator／evaluate 回應。"""
    g = globals()
    card = ("1/2 ○ 1/3，○ 裡要填 >、< 還是 =？", [">", "<", "="])

    class Ctx:
        def close(self):
            pass

    class Loc:
        def __init__(self, pg, sel):
            self.pg, self.sel = pg, sel

        def nth(self, i):
            return self

        def click(self):
            if self.sel == "#main .opt":
                self.pg.answered = True
            if self.pg.inject == self.sel:
                self.pg.errs.append(f"Error: 點 {self.sel} 後拋錯（替身）")

        def inner_text(self):
            return "答對了"

        def count(self):
            return 1

    class Page:
        def __init__(self, errs, inject):
            self.errs, self.inject, self.answered = errs, inject, False
            if inject == "load":
                errs.append("Error: 載入時拋錯（替身）")

        def locator(self, sel):
            return Loc(self, sel)

        def wait_for_selector(self, *a, **k):
            pass

        def evaluate(self, js):
            if js == "Object.keys(G5MathBank.CONCEPTS)":
                return ["c1"]
            if js.startswith("G5MathBank.CARDS"):
                return [list(card)]
            return None if self.answered else {"q": card[0], "opts": card[1], "dom": [0, 1, 2], "hidden": 0}

    def fake_open(inject):
        opened = []

        def op(browser, *a, **k):
            errs = []
            opened.append(1)
            return Ctx(), Page(errs, "load" if inject == "first" and len(opened) == 1 else inject), errs
        return op

    name = "A17 作答過程沒有 JS 錯誤"
    cases = [("沒有錯誤", None, True), ("載入時", "load", False), ("只有讀題庫那一頁", "first", False),
             ("點選項後（Codex 反例）", "#main .opt", False), ("按下一題後", "#next", False)]
    saved, wrong = {k: g[k] for k in ("open_page", "check", "solve_shown")}, []
    try:
        for label, inject, want in cases:
            got = {}
            g["open_page"] = fake_open(inject)
            g["check"] = lambda n, cond, detail="": got.__setitem__(n, bool(cond))
            g["solve_shown"] = lambda items: [{"issues": [], "correctIndices": [0]} for _ in items]
            flow_a17(None)
            if got.get(name) is None:
                wrong.append(f"{label}：flow_a17 沒有產出「{name}」這一項")
            elif got[name] != want:
                wrong.append(f"{label}：應判{'沒錯誤' if want else '有錯誤'}，判成{'沒錯誤' if got[name] else '有錯誤'}")
    finally:
        g.update(saved)
    check(f"A17 錯誤收集替身測試：{len(cases)} 種時點（含作答後才拋錯）都判對", not wrong, wrong)


# 補題區（交辦 #1618）：家長打開才載入 g5-help/upload.js；本機測試用 g5-help 的原始碼頂替（還沒上線的版本也測得到），GAS 一律攔截不打真後端。
UP_SRC = ROOT.parent / "g5-help" / "src" / "upload.js"
UP_PNG = __import__("base64").b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def flow_upload(browser, subject, site, bank_global):
    import json as _j, tempfile as _t
    live = BASE.startswith("https:")
    ctx = browser.new_context()
    ctx.add_init_script("localStorage.setItem('g5sync.code','ABCDEFGHJKMN')")
    sent, mode = [], {"fail_js": True}
    def gas(route):
        req = _j.loads(route.request.post_data or "{}")
        if route.request.method != "POST" or not req:   # GET 等非 JSON POST：從網址參數取 op，並記方法（審 684ecc8：GET 漏算）
            from urllib.parse import urlparse as _u, parse_qsl as _q
            req = dict(_q(_u(route.request.url).query), _method=route.request.method)
        sent.append(req)
        body = {"ok": True, "id": "u1"} if req.get("op") == "upload" else {"ok": True, "items": [], "lastFetch": 0} if req.get("op") == "mine" else {"ok": False, "err": "test"}
        route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=_j.dumps(body))
    ctx.route("**/macros/s/**", gas)
    def upjs(route):
        if mode["fail_js"]:
            return route.abort()
        if live:
            return route.continue_()
        route.fulfill(status=200, content_type="application/javascript", body=UP_SRC.read_text(encoding="utf-8"))
    ctx.route("**/g5-help/upload.js", upjs)
    pg = ctx.new_page(); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#main .btn, #main .done")
    check(f"補題區 首頁沒打開前不載入 upload.js", pg.evaluate("!window.G5Upload && !document.querySelector('script[src*=\"g5-help/upload.js\"]')"))
    pg.locator("#upBox summary").click()
    pg.wait_for_function("document.getElementById('g5upload').textContent.indexOf('載入失敗') >= 0", timeout=10000)
    check(f"補題區 upload.js 載不到：說明可以關掉再打開重試", "關掉再打開" in pg.inner_text("#g5upload"))
    mode["fail_js"] = False
    pg.locator("#upBox summary").click(); pg.locator("#upBox summary").click()
    # 補題區已關功能（g5-help upload.js ENABLED=false，迴圈 L20261013134831-7db82f 會診後第 2 次 FAIL）：只顯示暫停說明、導向難題站、0 請求
    pg.wait_for_function("document.getElementById('g5upload').textContent.indexOf('補題區暫停使用') >= 0", timeout=20000)
    link = pg.locator("#g5upload a[href='https://windsorya.github.io/g5-help/']")
    check(f"補題區 暫停：說明與難題站連結看得見、沒有表單", pg.locator("#g5upload .g5u-msg", has_text="補題區暫停使用").is_visible() and link.count() == 1 and link.is_visible() and pg.locator("#g5upload .g5u-send, #g5upload .g5u-file").count() == 0)   # 審 684ecc8：只比 textContent 會放過 hidden
    # 「補題區 0 請求」屬元件保證，由 g5-help tests/upload_disabled.test.js 鎖（fetch／計時器／監聽＝0，突變會紅）；本站共用同一個 GAS 端點，
    # 從網址分不出同步與補題，判準連三輪被審查打穿（684ecc8／5630afa／1d7a0df），依升級階梯縮範圍：本站只驗看得見的暫停說明與連結。
    check(f"補題區 沒有水平捲動", no_overflow(pg))
    # 做好了的連結 #c/<觀念id> 直接打開那個觀念；不存在的觀念留在首頁
    cid = pg.evaluate(f"Object.keys(window.{bank_global}.CONCEPTS)[0]")
    pg.goto(URL + "#c/" + cid); pg.wait_for_selector("#main .remedy", timeout=10000)
    check(f"補題區 #c/{cid} 直接打開該觀念", pg.locator("#cBack").count() == 1)
    # 審 Codex b44cf85／9404d3a／2904b29：回首頁後同一連結要能再開；改成無效網址要回首頁
    pg.locator("#cBack").click(); pg.wait_for_selector("#main .btn, #main .done")
    check(f"補題區 觀念頁回首頁後網址不再帶 #c/", not pg.evaluate("location.hash").startswith("#c/"), pg.evaluate("location.hash"))
    pg.evaluate(f"location.hash = '#c/{cid}'"); pg.wait_for_timeout(300)
    check(f"補題區 回首頁後再開同一個 #c/{cid}：打開該觀念", pg.locator("#cBack").count() == 1)
    if pg.locator("#cBack").count() == 0:   # 不依賴上一步：不在觀念頁就點一張觀念卡進去（不重新載入，避免中斷在途請求）
        pg.locator("#concepts .ccard").first.click(); pg.wait_for_selector("#cBack", timeout=10000)
    pg.evaluate("location.hash = '#c/no-such-concept'"); pg.wait_for_timeout(300)
    check(f"補題區 觀念頁中網址改成不存在的觀念：回首頁", pg.locator("#cBack").count() == 0 and pg.locator("#concepts .ccard").count() > 0)
    pg2 = ctx.new_page(); pg2.on("pageerror", lambda e: errors.append(str(e)))
    pg2.goto(URL + "#c/no-such-concept"); pg2.wait_for_selector("#main .btn, #main .done")
    check(f"補題區 #c/不存在的觀念：留在首頁", pg2.locator("#main .remedy").count() == 0 and pg2.locator("#concepts .ccard").count() > 0)
    check(f"補題區 沒有 JS 錯誤", not errors, errors)
    ctx.close()


def main():
    with sync_playwright() as p:
        selftest_player()
        selftest_a17_errors()
        cr = p.chromium.launch()
        flow_standard_dom(cr)
        if BASE.startswith("https:"):
            flow_video_live(cr, "線上Chromium")
        flow_main(cr, "桌機", {"viewport": {"width": 1280, "height": 900}})
        flow_main(cr, "手機390", {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True, "device_scale_factor": 2})
        flow_concepts(cr, "手機390", {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True})
        flow_review(cr)
        flow_redo_after_external_clear(cr)
        flow_lab_after_external_clear(cr)
        flow_lab_last_resume(cr)
        flow_lab_retry_resume(cr)
        flow_lab_double_fail_resume(cr)
        flow_lab_done_resume(cr)
        flow_concept_retry_stays(cr)
        flow_a17(cr)
        flow_upload(cr, "數學", "g5-math-review", "G5MathBank")
        cr.close()
        wk = p.webkit.launch()
        ipad = p.devices["iPad (gen 7)"]
        flow_main(wk, "iPad", ipad)
        flow_concepts(wk, "iPad", ipad)
        flow_upload(wk, "數學", "g5-math-review", "G5MathBank")
        wk.close()
    bad = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(bad)}/{len(RESULTS)} PASS")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
