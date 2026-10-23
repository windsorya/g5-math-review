#!/usr/bin/env python3
"""把 src/app.html（Artifact 格式：沒有 doctype/head）包成可直接開啟的 index.html。

為什麼分兩份：同一份內容可以發成 claude.ai Artifact，也可以放 GitHub Pages
讓孩子的 iPad 不登入就能開；Pages 需要自己帶 viewport 與 noindex。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HEAD = ('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="robots" content="noindex,nofollow">'
        '<link rel="icon" type="image/svg+xml" href="favicon.svg">'
        '<link rel="apple-touch-icon" href="apple-touch-icon.png">'
        '<meta name="theme-color" content="#1f5f8b">'
        '<meta name="apple-mobile-web-app-capable" content="yes">'
        '<meta name="apple-mobile-web-app-title" content="數學複習">'
        '</head><body>')


INLINE = re.compile(r"<!--@INLINE (src/[A-Za-z0-9_.-]+\.js)-->")


def inline(body: str) -> str:
    """把 <!--@INLINE src/x.js--> 換成 <script> 內容；核心邏輯（src/core.js）與 node 測試共用同一份檔。"""
    def sub(m: re.Match) -> str:
        js = (ROOT / m.group(1)).read_text(encoding="utf-8")
        if "</script" in js.lower():
            raise SystemExit(f"{m.group(1)} 含 </script，不能內嵌")
        return "<script>\n" + js + "\n</script>"
    out = INLINE.sub(sub, body)
    if "<!--@INLINE" in out:
        raise SystemExit("還有沒換掉的 @INLINE 標記")
    return out


# 錯題站（g5-wrong-review）讀「數學 app 待加強題數」的介面檔（交辦 #4027；權威規格：g5-wrong-review/docs/app-weak-entry-design-20261019.md 第 2 節）。
# 內容就是 app 用的那幾份 src 原檔一字不改接起來：題庫、核心（decode、poolCards、reviewPick、weakCard）、BANK 組裝、單元題集與計數，
# 不另寫第二份判定。全部包在函式裡、把 window／module 遮成區域變數：原檔的 root.X = … 只寫進區域物件，不新增也不改任何全域；
# 不讀不寫 localStorage、不連網。classic script，執行期間同步呼叫 G5WeakExportRegister 一次。
WEAK_SOURCES = ["src/mathbank.js", "src/core.js", "src/bankdef.js", "src/weakcount.js"]
WEAK_HEAD = """// 由 build.py 產生，請勿手改（改 src/ 後重跑 python3 build.py）。交辦 #4027：錯題站讀數學站「練待加強的」題數。
// 介面：g5-wrong-review/docs/app-weak-entry-design-20261019.md 第 2 節。summarize 唯讀：不寫 localStorage、不連網、不新增全域。
(function () {
  if (typeof window.G5WeakExportRegister !== "function") return;   // 不是被錯題站載入（例如直接開這個檔）就什麼都不做
  var lib = (function () {
    var window = {}, module, exports, define;   // 遮住全域：下面原檔的 root.G5Core＝… 只寫進這個區域物件
"""
WEAK_TAIL = """
    return window;
  })();
  var C = lib.G5Core, MB = lib.G5MathBank, W = lib.G5MathWeak;
  var BANK = lib.G5MathBankDef.build(MB);   // 同 app.html；外部停出名單 G5_RETIRED 數學站沒有任何檔定義（錯題站頁面的全域不採）
  window.G5WeakExportRegister({
    api: 1,
    key: C.LS_KEY,
    links: { weak: null, challenge: null },   // 數學站還沒有 #go=weak／#go=challenge 深連結
    summarize: function (raw, nowMs) { return W.summarize(C, MB, BANK, raw, nowMs); }
  });
})();
"""


def weak_export() -> str:
    parts = []
    for rel in WEAK_SOURCES:
        js = (ROOT / rel).read_text(encoding="utf-8")
        parts.append(f"// ---- {rel} ----\n" + js.rstrip("\n") + "\n")
    return WEAK_HEAD + "\n".join(parts) + WEAK_TAIL


def main() -> None:
    app_src = (ROOT / "src" / "app.html").read_text(encoding="utf-8")
    body = inline(app_src)
    (ROOT / "index.html").write_text(HEAD + body + "</body></html>", encoding="utf-8")
    print(f"built index.html ({len(body)} chars)")
    wx = weak_export()
    (ROOT / "weak-export.js").write_text(wx, encoding="utf-8")
    print(f"built weak-export.js ({len(wx)} chars)")


if __name__ == "__main__":
    main()
