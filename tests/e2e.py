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
        if not ok or not no_overflow(pg):
            bad.append(cid)
        pg.locator("#cBack").click(); pg.wait_for_selector("#concepts .ccard")
    check(f"{label} 11 個觀念頁：兩種說法都有圖與步驟、沒有水平捲動", not bad, bad)
    check(f"{label} 觀念頁沒有 JS 錯誤", not errors, errors)
    ctx.close()


def flow_review(browser):
    ctx, pg, errors = open_page(browser)
    check("小考複習按鈕寫「第 4 單元 擴分、約分和通分」", "第 4 單元 擴分、約分和通分" in pg.locator("#main .review").inner_text(), pg.locator("#main .review").inner_text()[:200])
    pg.locator('button[data-rv="um4"]').click(); pg.wait_for_selector("#main .q")
    c = current_card(pg)
    check("小考複習：第 4 單元只出擴分約分通分的題", c and c["concept"] in ("4a", "4b"), c)
    check("小考複習沒有 JS 錯誤", not errors, errors)
    ctx.close()


def main():
    with sync_playwright() as p:
        cr = p.chromium.launch()
        flow_main(cr, "桌機", {"viewport": {"width": 1280, "height": 900}})
        flow_main(cr, "手機390", {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True, "device_scale_factor": 2})
        flow_concepts(cr, "手機390", {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True})
        flow_review(cr)
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
