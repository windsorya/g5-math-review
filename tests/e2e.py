#!/usr/bin/env python3
"""五上數學複習 e2e：本機 index.html（或 --base 正式網址）；Chromium 桌機／手機 390、WebKit iPad。
用 python3.12 執行：python3.12 tests/e2e.py [--base https://windsorya.github.io/g5-math-review/]
題目答案從頁面上的 window.G5MathBank 依題目文字查（題庫本身另有 tests/mathbank.test.js 獨立驗算）。"""
import json
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


def flow_main(browser, label, device=None):
    ctx, pg, errors = open_page(browser, device)
    check(f"{label} 首頁標題與倒數", "五上數學複習" in pg.title() and pg.locator("#days").inner_text().strip().isdigit())
    check(f"{label} 11 個觀念入口", pg.locator("#concepts .ccard").count() == 11, pg.locator("#concepts .ccard").count())
    check(f"{label} 小考複習列出第 1～6 單元", all(pg.locator(f'button[data-rv="u{u}"]').count() == 1 for u in ["m1", "m2", "m3", "m4", "m5", "m6"]))
    check(f"{label} 沒有水平捲動", no_overflow(pg))
    check(f"{label} 三站切換列（#1333）：三項、目前站是「五上數學複習」", pg.locator("#siteNav a, #siteNav [aria-current]").count() == 3 and pg.locator('#siteNav [aria-current="page"]').inner_text() == "五上數學複習")
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


def player_problem(src, rp, read_state):
    """判斷一個嵌入播放器能不能播；回傳問題說明，能播回傳 None。
    read_state() 回傳 {text, hasVideo, t, paused, err}；讀不到（逾時、例外）算失敗——
    Codex 審 236d77d2：舊版捕捉例外後只設 body，全部逾時／空白／Video unavailable 都 PASS。"""
    if "youtube-nocookie.com/embed/" not in (src or ""):
        return f"iframe 沒指向 youtube-nocookie：{src}"
    if rp != "strict-origin-when-cross-origin":
        return f"referrerpolicy 不對：{rp}"
    try:
        st = read_state()
    except Exception as e:  # noqa: BLE001 — 任何讀取失敗都是播放失敗
        return f"讀不到播放器內容（{type(e).__name__}：{str(e)[:60]}）"
    if not isinstance(st, dict):
        return f"播放器狀態讀不懂：{st!r}"[:120]
    low = (str(st.get("text") or "") + " " + str(st.get("err") or "")).lower()
    hit = next((m for m in PLAYER_ERROR_MARKS if m.lower() in low), None)
    if st.get("err") or hit:
        return f"播放器顯示錯誤（{hit or st.get('err')}）"
    if not st.get("hasVideo"):
        return "播放器裡沒有 <video>（沒有載入影片）"
    if st.get("paused") is not False and not (st.get("t") or 0) > 0:
        return f"影片沒有在播（paused={st.get('paused')}、t={st.get('t')}）"
    return None


def flow_video_live(browser, label, device=None):
    """只在線上版跑（#1335）：每個觀念頁按第一段影片播放，iframe 指向 youtube-nocookie、帶 referrerpolicy，
    播放器讀得到內容、不是空白、沒有 Video unavailable／private／錯誤 153。任何一個觀念失敗就記 FAIL。"""
    ctx, pg, errors = open_page(browser, device)
    bad = []
    cids = pg.evaluate("Object.keys(G5MathBank.CONCEPTS)")
    for cid in cids:
        pg.locator(f'#concepts .ccard[data-cid="{cid}"]').click(); pg.wait_for_selector("#main .remedy")
        b = pg.locator("#main .vids button[data-play]").first
        b.click()
        fr = pg.locator("#main .vids iframe").first
        src, rp = fr.get_attribute("src"), fr.get_attribute("referrerpolicy")
        pg.wait_for_timeout(5000)
        why = player_problem(src, rp, lambda: pg.frame_locator("#main .vids iframe").first.locator("body").evaluate(PLAYER_STATE_JS, timeout=10000))
        if why:
            bad.append((cid, why))
        pg.locator("#cBack").click(); pg.wait_for_selector("#concepts .ccard")
    check(f"{label} {len(cids)} 個觀念的影片都能嵌入播放（有 <video>、在播、無 unavailable／private／錯誤 153）", cids and not bad, bad or "沒有任何觀念")
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
        cr = p.chromium.launch()
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
