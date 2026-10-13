// ⛔ 律師對「孩子用的教學網站」的固定標準——不屬於任何科目，複製這個網站去做新站時這支要一起帶走、不可刪除、不可改成跳過。
// 由來（#1339）：2026-10-13 數學站複製自然站時，影片的強制檢查寫在自然科專用的 steps.test.js 裡，被當成「自然專用」整支刪掉，
// 數學站就在沒有影片的狀態宣稱上線（律師：「數學複習似乎都沒有加上影片」「為何會漏做」）。
// 標準來源：律師 2026-10-11（自然站）「白話易懂、圖多一些、有影片就附上」；2026-10-13（難題站）每步一圖、每篇有影片；
//           2026-10-13 白話用詞要附解釋（#1319）；2026-10-13 三站要能互相切換（#1333）；網站不放孩子個資、不被搜尋引擎收錄。
// 三站各有一支同名檔（g5-sci-review、g5-help、g5-math-review），清單相同、取資料的方式各自不同。
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const B = require("../src/mathbank.js");
const X = require("../src/mathexplain.js");
const V = require("../src/mathvideos.js");
const ROOT = path.join(__dirname, "..");
const MAX_SENTENCE = 40;   // 小五每句上限，與難題站 src/hard.js READING[5] 相同

const units = [...new Set(B.CARDS.map((c) => c.concept))];   // 會出題的每個觀念
const SELF = "math";   // 本站在三站切換列裡的代號

// ===== 三站共通判準（三支 standard.test.js 這一段逐字相同，只有上面的 SELF／MAX_SENTENCE 與下面取資料的方式不同）=====
// 由來：Codex 審 g5-help 2dfa59cb、g5-sci-review b15cf42f、g5-math-review 236d77d2（2026-10-13）抓到舊判準的假通過：
// 空白理由、[{}] 影片、空 svg、<br> 被合併、連結沒驗目的地、只數網址次數、註解裡的 robots meta、只禁 /private/。
// 每一個反例在檔尾各有一條「自檢」：把資料在記憶體裡改壞，斷言判準抓得到。
const SITES = {
  sci: { url: "https://windsorya.github.io/g5-sci-review/", name: "五上自然複習" },
  math: { url: "https://windsorya.github.io/g5-math-review/", name: "五上數學複習" },
  help: { url: "https://windsorya.github.io/g5-help/", name: "難題解說" },
};
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
// ①影片：有影片就每支都要合法（11 碼 YouTube ID、有標題、start 是數字、end 是數字且大於 start；endNullable 的站 end 可為 null＝播到完）；
//   沒影片就要寫理由，理由去掉空白後至少 20 字。
function videoProblems(videos, noVideoReason, opt) {
  const endNullable = !!(opt && opt.endNullable);
  if (!Array.isArray(videos) || !videos.length) {
    const r = typeof noVideoReason === "string" ? noVideoReason.replace(/\s/g, "") : "";
    return r.length >= 20 ? [] : ["沒有影片，也沒有寫明理由（去空白後要 ≥20 字）"];
  }
  const bad = [];
  videos.forEach((v, i) => {
    const w = "第 " + (i + 1) + " 支影片";
    if (!v || typeof v !== "object") { bad.push(w + "不是物件"); return; }
    if (typeof v.id !== "string" || !YT_ID.test(v.id)) bad.push(w + " YouTube ID 不合法：" + v.id);
    if (typeof v.title !== "string" || !v.title.trim()) bad.push(w + "沒有標題");
    if (!isNum(v.start) || v.start < 0) bad.push(w + " start 不是數字：" + v.start);
    if (!(isNum(v.end) ? v.end > v.start : endNullable && v.end === null)) bad.push(w + " end 不合法：" + v.end);
  });
  return bad;
}
// ②圖：至少一個 <svg>，帶 role="img"、aria-label（去空白後 ≥4 字），而且裡面真的有繪圖元素（HTML 註解不算）。
const DRAW = /<(path|rect|circle|ellipse|line|polyline|polygon|text|image|use)\b/i;
const stripComments = (h) => String(h == null ? "" : h).replace(/<!--[\s\S]*?-->/g, "");
function figOk(html) {
  const re = /<svg\b([^>]*)>([\s\S]*?)<\/svg>/gi, s = stripComments(html);
  let m;
  while ((m = re.exec(s))) {
    const label = (/\baria-label="([^"]*)"/.exec(m[1]) || [])[1] || "";
    if (/\brole="img"/.test(m[1]) && label.replace(/\s/g, "").length >= 4 && DRAW.test(m[2])) return true;
  }
  return false;
}
// ③句長：先依 <br>、換行、句號／驚嘆號／問號切句，切完才去 HTML（先去 HTML 會把 <br> 兩邊黏成一句）。
function sentences(t) {
  return String(t == null ? "" : t).split(/<br\s*\/?>|\n|[。！？]/i)
    .map((s) => s.replace(/<[^>]*>/g, "").replace(/&[a-z]+;|&#\d+;/gi, "").trim()).filter(Boolean);
}
const tooLong = (t) => sentences(t).filter((s) => s.length > MAX_SENTENCE);
// ④切換列：只看 id="siteNav" 元素裡面（HTML 註解不算）：恰好兩個 <a>、href 恰為另外兩站，本站項目帶 aria-current="page" 且字是本站名。
function navProblems(html, self) {
  const h = stripComments(html), open = /<([a-z][\w-]*)\b[^>]*\bid="siteNav"[^>]*>/i.exec(h);
  if (!open) return ['找不到 id="siteNav"'];
  const end = h.indexOf("</" + open[1] + ">", open.index);
  if (end < 0) return ["siteNav 沒有結尾標籤"];
  const inner = h.slice(open.index + open[0].length, end), bad = [];
  const anchors = inner.match(/<a\b[^>]*>/gi) || [];
  const hrefs = anchors.map((a) => (/\bhref="([^"]*)"/.exec(a) || [])[1] || "").sort();
  const want = Object.keys(SITES).filter((k) => k !== self).map((k) => SITES[k].url).sort();
  if (JSON.stringify(hrefs) !== JSON.stringify(want)) bad.push("siteNav 連結應恰為 " + want.join("、") + "；實際：" + (hrefs.join("、") || "（沒有連結）"));
  const cur = [...inner.matchAll(/<([a-z][\w-]*)\b[^>]*\baria-current="page"[^>]*>([\s\S]*?)<\/\1>/gi)];
  if (cur.length !== 1 || cur[0][2].replace(/<[^>]*>/g, "").trim() !== SITES[self].name) bad.push("siteNav 要有一個 aria-current=\"page\" 的「" + SITES[self].name + "」");
  return bad;
}
// ⑤收錄：去掉 HTML 註解後 <head> 裡有 <meta name="robots" content 含 noindex>；robots.txt 在 User-agent: * 區段有一行恰為「Disallow: /」。
function robotsMetaOk(html) {
  const head = stripComments(html).split(/<\/head>/i)[0];
  return (head.match(/<meta\b[^>]*>/gi) || []).some((t) => {
    const attr = (n) => (new RegExp("\\b" + n + "\\s*=\\s*\"([^\"]*)\"", "i").exec(t) || [])[1] || "";
    return attr("name").trim().toLowerCase() === "robots" && /(^|[\s,])noindex([\s,]|$)/i.test(attr("content"));
  });
}
function robotsTxtOk(txt) {
  let agents = [], inRules = false, ok = false;
  String(txt == null ? "" : txt).split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean).forEach((l) => {
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(l);
    if (!m) return;
    if (m[1].toLowerCase() === "user-agent") { if (inRules) { agents = []; inRules = false; } agents.push(m[2].trim()); }
    else { inRules = true; if (agents.includes("*") && l === "Disallow: /") ok = true; }
  });
  return ok;
}
// ===== 共通判準到此 =====

const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const ROBOTS = fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8");
const clone = (x) => JSON.parse(JSON.stringify(x));

// 本站取資料：影片在 src/mathvideos.js 的 V[觀念]（app.html：end 為 null 表示播到完）；
// 圖與句子在 src/mathexplain.js 的 X.EXPLAIN[觀念]（每種說法 svg()、lines、task、ask）；影片說明 note 也顯示在畫面上，一起量句長。
const videoMissing = (vmap) => units.map((k) => videoProblems(vmap[k], null, { endNullable: true }).map((p) => k + "：" + p)).flat();
const figMissing = (emap) => units.map((k) => {
  if (!(Array.isArray(emap[k]) && emap[k].length >= 2)) return [k + " 要有兩種說法"];
  return emap[k].map((ex, i) => (figOk(ex.svg()) ? null : k + " 第 " + (i + 1) + " 種說法沒有圖或缺 aria-label／繪圖元素"));
}).flat().filter(Boolean);
const kidTexts = (emap, vmap) => units.map((k) => (emap[k] || []).map((ex) => ex.lines.concat([ex.task, ex.ask])).flat()
  .concat((vmap[k] || []).map((v) => v && v.note)).map((t) => [k, t])).flat();
const longSentences = (emap, vmap) => kidTexts(emap, vmap).map(([k, t]) => tooLong(t).map((s) => k + "：" + s)).flat();

test("標準①影片：每個會出題的觀念至少一段驗證過的影片", () => {
  assert.deepEqual(videoMissing(V), []);
});

test("標準②圖：每個觀念的每一種說法都有圖", () => {
  assert.deepEqual(figMissing(X.EXPLAIN), []);
});

test("標準③白話：解說每一句（含影片說明）不超過小五句長上限", () => {
  assert.deepEqual(longSentences(X.EXPLAIN, V), []);
});

test("標準④三站切換列：siteNav 連到另外兩站、本站標 aria-current", () => {
  assert.deepEqual(navProblems(HTML, SELF), []);
});

test("標準⑤不被搜尋引擎收錄：noindex meta 與 robots.txt 全站 Disallow", () => {
  assert.ok(robotsMetaOk(HTML), "缺有效的 noindex meta");
  assert.ok(robotsTxtOk(ROBOTS), "robots.txt 的 User-agent: * 沒有「Disallow: /」");
});

// ---------- 自檢：每一條判準把資料改壞要抓得到（反例出自 Codex 三份報告；三站同名）----------
const K0 = units.find((k) => (V[k] || []).length);
const withExplain = (k, fn) => { const m = Object.assign({}, X.EXPLAIN); m[k] = m[k].map((ex) => Object.assign({}, ex, { lines: ex.lines.slice() })); fn(m[k]); return m; };

test("自檢①a：沒有影片、理由是 20 個空白，要抓到", () => {
  assert.ok(videoProblems([], " ".repeat(20)).length);
  const vm = Object.assign({}, V); vm[K0] = []; assert.ok(videoMissing(vm).length);
});
test("自檢①b：影片是 [{}]（會產生 watch?v=undefined），要抓到", () => {
  const vm = Object.assign({}, V); vm[K0] = [{}];
  assert.ok(videoMissing(vm).some((p) => p.startsWith(K0)));
});
test("自檢①c：YouTube ID 不是 11 碼、start 是字串，要抓到", () => {
  const vm = Object.assign({}, V); vm[K0] = clone(V[K0]); vm[K0][0].id = "abc"; vm[K0][0].start = "10";
  assert.ok(videoMissing(vm).length >= 2);
});
test("自檢②：<svg aria-label=\"板根示意\"></svg> 空圖，要抓到", () => {
  assert.ok(figMissing(withExplain(units[0], (exs) => { exs[0].svg = () => '<svg role="img" aria-label="板根示意"></svg>'; })).length);
  assert.ok(!figOk('<svg role="img" aria-label="板根示意"><!-- <rect/> --></svg>'), "註解裡的繪圖元素不算");
});
test("自檢③a：25 字<br>25 字是兩句，不可黏成 50 字", () => {
  assert.deepEqual(longSentences(withExplain(units[0], (exs) => { exs[0].lines[0] = "字".repeat(25) + "<br>" + "字".repeat(25); }), V), []);
});
test("自檢③b：一句超過上限要抓到（影片說明 note 也量）", () => {
  assert.ok(longSentences(withExplain(units[0], (exs) => { exs[0].lines[0] = "字".repeat(MAX_SENTENCE + 1) + "。"; }), V).length);
  const vm = Object.assign({}, V); vm[K0] = clone(V[K0]); vm[K0][0].note = "字".repeat(MAX_SENTENCE + 1) + "。";
  assert.ok(longSentences(X.EXPLAIN, vm).length, "影片說明也要量句長");
});
test("自檢④a：數學站連結改指自然站，要抓到", () => {
  const bad = HTML.split('href="' + SITES.help.url + '"').join('href="' + SITES.sci.url + '"');
  assert.notEqual(bad, HTML); assert.ok(navProblems(bad, SELF).length);
});
test("自檢④b：移除 siteNav 裡的兩個 <a>（網址還留在別處），要抓到", () => {
  const bad = HTML.replace(/(<[a-z]+\b[^>]*\bid="siteNav"[^>]*>)([\s\S]*?)(<\/nav>)/i, (_, a, b, c) => a + b.replace(/<a\b[\s\S]*?<\/a>/gi, "") + c);
  assert.notEqual(bad, HTML); assert.ok(navProblems(bad + "<script>var u='" + SITES.sci.url + SITES.help.url + "'</script>", SELF).length);
});
test("自檢⑤a：robots meta 包在 HTML 註解裡，要抓到", () => {
  const meta = /<meta\b[^>]*name="robots"[^>]*>/i.exec(HTML)[0];
  assert.ok(!robotsMetaOk(HTML.replace(meta, "<!-- " + meta + " -->")));
});
test("自檢⑤b：robots.txt 只禁 /private/，要抓到", () => {
  assert.ok(!robotsTxtOk("User-agent: *\nDisallow: /private/\n"));
  assert.ok(!robotsTxtOk("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nAllow: /\n"), "Disallow: / 要在 User-agent: * 區段");
});
