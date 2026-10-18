// 題庫獨立驗算（主閘）：只看孩子看到的題文與選項，獨立求出每個選項真假，最後才比對 card.a 與 chk。
// 驗收契約：docs/design-verify-shown-codex-20261013.md（K01–K31 各 -Q／-O、A01–A16；A17 在 tests/e2e.py）。
// 執行：node --test tests/verify_shown.test.js
// 可用環境變數 VERIFY_SHOWN=<路徑> 換一個驗算器跑同一份矩陣（突變自檢用）。
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const V = require(process.env.VERIFY_SHOWN ? path.resolve(process.env.VERIFY_SHOWN) : "./verify_shown.js");
const B = require("../src/mathbank.js");   // 題庫資料（受驗對象）；驗算器本身不得 require 題庫
const KEY = require("./fact_key.js");

const clone = (x) => JSON.parse(JSON.stringify(x));
const card = (id) => { const c = B.CARDS.find((x) => x.id === id); assert.ok(c, "題庫沒有 " + id); return clone(c); };
const shown = (c) => ({ q: c.q, opts: c.opts.slice() });
const texts = (c, idx) => idx.map((i) => c.opts[i]);
const editQ = (c, from, to) => { assert.ok(c.q.includes(from), c.id + " 題文找不到「" + from + "」：" + c.q); c.q = c.q.replace(from, to); return c; };
const editOpt = (c, from, to) => { const i = c.opts.indexOf(from); assert.ok(i >= 0, c.id + " 沒有選項「" + from + "」"); c.opts[i] = to; return c; };
// 「實質」拒絕原因：不能只靠 CHK_MISMATCH 交差
const substantive = (r) => r.issues.filter((x) => x !== "CHK_MISMATCH");
function assertRejected(c, reason) {
  const r = V.verifyCard(c);
  assert.equal(r.ok, false, c.id + " 應該被拒絕");
  assert.ok(substantive(r).length > 0, c.id + " 只因 CHK_MISMATCH 被拒：" + r.issues.join(","));
  if (reason) assert.ok(r.issues.includes(reason), c.id + " 拒絕原因要含 " + reason + "，實際：" + r.issues.join(","));
  return r;
}

/* ---------- K01–K31：每列 -Q（只改題面）與 -O（交換正解與下一個選項、保留 a） ---------- */
// correct：獨立求得的正解選項文字（排序後比對）；reason：整卡被拒的必要原因；more：額外斷言解析／求解欄位
const K = [
  { n: "K01", k: "argmax", id: "g0max", from: "12 時 29 度", to: "12 時 20 度", correct: ["14 時"], reason: "WRONG_KEY" },
  { n: "K02", k: "maxrise", id: "g2up", from: "第 10 天 15 公分", to: "第 10 天 14 公分", correct: ["第 4 天 到 第 6 天", "第 8 天 到 第 10 天"], reason: "TIE",
    more: (a) => assert.ok(a.issues.includes("MULTI_CORRECT")) },
  { n: "K03", k: "firstdown", id: "g0dn", from: "14 時 28 度", to: "14 時 30 度", correct: [], reason: "NO_CORRECT" },
  { n: "K04", k: "fact", id: "f-one", from: "1 是", to: "2 是", correct: [], reason: "UNREVIEWED" },
  { n: "K05", k: "isfactor", id: "f0is", from: "36", to: "25", correct: ["5"], reason: "WRONG_KEY" },
  { n: "K06", k: "nfactors", id: "f0ct", from: "36", to: "24", correct: ["8"], reason: "WRONG_KEY" },
  { n: "K07", k: "gcd", id: "f0g", from: "12 和 18", to: "12 和 15", correct: ["3"], reason: "WRONG_KEY" },
  { n: "K08", k: "iscommonfactor", id: "f0cf", from: "12 和 20", to: "12 和 15", correct: ["3"], reason: "WRONG_KEY" },
  { n: "K09", k: "divides", id: "f-div", from: "下面哪一個算式是「整除」？", to: "下面哪一個算式不能整除？", correct: ["50 ÷ 6", "54 ÷ 4", "54 ÷ 5"], reason: "MULTI_CORRECT" },
  { n: "K10", k: "ismultiple", id: "m0is", from: "7 的倍數", to: "5 的倍數", correct: ["45"], reason: "WRONG_KEY" },
  { n: "K11", k: "lcm", id: "m0l", from: "6 和 8", to: "6 和 10", correct: ["30"], reason: "WRONG_KEY" },
  { n: "K12", k: "rule", id: "m0r", from: "同時是 2 和 5", to: "是 2 或 5", correct: ["115", "125", "130", "132"], reason: "MULTI_CORRECT" },
  { n: "K13", k: "vertices", id: "p0v", from: "五邊形", to: "六邊形", correct: ["6 個"], reason: "WRONG_KEY" },
  { n: "K14", k: "triok", id: "t0ok", from: "可以圍成", to: "不能圍成", correct: ["1 公分、5 公分、7 公分", "2 公分、3 公分、6 公分", "4 公分、4 公分、9 公分"], reason: "MULTI_CORRECT" },
  { n: "K15", k: "third", id: "t03", from: "和 8 公分", to: "和 2 公分", correct: [], reason: "NO_CORRECT",
    more: (a) => assert.deepEqual([a.parsed.lo, a.parsed.hi], [3, 7]) },
  { n: "K16", k: "anglesum", id: "a0sum", from: "四邊形", to: "五邊形", correct: ["540 度"], reason: "WRONG_KEY" },
  { n: "K17", k: "regangle", id: "a0reg", from: "正三角形", to: "正六邊形", correct: ["120 度"], reason: "WRONG_KEY" },
  { n: "K18", k: "missing", id: "a0x", from: "50 度", to: "40 度", correct: ["70 度"], reason: "WRONG_KEY" },
  { n: "K19", k: "expand", id: "e0", from: "2/3", to: "3/4", correct: ["9"], reason: "WRONG_KEY",
    more: (a) => assert.deepEqual([a.parsed.m, a.solution], [12, "9"]) },
  { n: "K20", k: "simplify", id: "r0", from: "18/24", to: "24/18", correct: ["4/3"], reason: "WRONG_KEY" },
  { n: "K21", k: "equiv", id: "q0", from: "和 2/3", to: "和 5/6", correct: ["5/6"], reason: "WRONG_KEY" },
  { n: "K22", k: "compare", id: "c0", from: "2/3 ○ 3/4", to: "3/4 ○ 2/3", correct: [">"], reason: "WRONG_KEY" },
  { n: "K23", k: "maxfrac", id: "c0max", from: "最大", to: "最小", correct: ["1/2"], reason: "WRONG_KEY" },
  { n: "K24", k: "axes", id: "s0", from: "正方形", to: "正三角形", correct: ["3 條"], reason: "WRONG_KEY" },
  { n: "K25", k: "addsub", id: "o0", from: "1/2 ＋", to: "1/3 ＋", correct: [], reason: "NO_CORRECT",
    more: (a) => { assert.equal(a.solution, "2/3"); assert.ok(!a.correctIndices.length); } },
  // K26–K31：2026-10-18 依考古卷補的題型（全部因數、全部公因數、因數倍數關係、帶分數擴分、全組等值、帶分數比大小）
  { n: "K26", k: "allfactors", id: "f0all", from: "64 的全部因數", to: "32 的全部因數", correct: [], reason: "NO_CORRECT",
    more: (a) => assert.equal(a.solution, "1、2、4、8、16、32") },
  { n: "K27", k: "allcommon", id: "f0com", from: "18 和 45", to: "18 和 36", correct: ["1、2、3、6、9、18"], reason: "WRONG_KEY" },
  { n: "K28", k: "relation", id: "f0rel", from: "＝ 14", to: "＝ 15", correct: [], reason: "BAD_DATA" },
  { n: "K29", k: "mixexpand", id: "e0mix", from: "□/12", to: "□/16", correct: [], reason: "NO_CORRECT",
    more: (a) => assert.equal(a.solution, "12") },
  { n: "K30", k: "allequiv", id: "q0all", from: "和 3/4", to: "和 5/6", correct: [], reason: "NO_CORRECT" },
  { n: "K31", k: "mixcompare", id: "c0mix", from: "15/7", to: "13/6", correct: ["="], reason: "WRONG_KEY" }
];

test("K 矩陣涵蓋題庫全部 31 種 chk.k", () => {
  const kinds = [...new Set(B.CARDS.map((c) => c.chk.k))].sort();
  assert.equal(kinds.length, 31);
  assert.deepEqual([...new Set(K.map((r) => r.k))].sort(), kinds);
  K.forEach((r) => assert.equal(card(r.id).chk.k, r.k, r.n + " 前置卡的 k"));
});

K.forEach((r) => {
  test(r.n + "-Q " + r.k + "（" + r.id + "：" + r.from + "→" + r.to + "）", () => {
    const c0 = card(r.id);
    assert.deepEqual(V.verifyCard(c0).issues, [], "共同前置：原卡要先通過");
    const c = editQ(clone(c0), r.from, r.to);
    const a = V.analyzeShown(shown(c));
    assert.deepEqual(texts(c, a.correctIndices).sort(), r.correct.slice().sort(), "獨立求解結果");
    if (r.more) r.more(a);
    assertRejected(c, r.reason);
  });
  test(r.n + "-O " + r.k + "（" + r.id + "：正解與下一個選項交換，a 不動）", () => {
    const c = card(r.id);
    assert.deepEqual(V.verifyCard(c).issues, [], "共同前置：原卡要先通過");
    const j = (c.a + 1) % c.opts.length;
    [c.opts[c.a], c.opts[j]] = [c.opts[j], c.opts[c.a]];
    [c.wrongWhy[c.a], c.wrongWhy[j]] = [c.wrongWhy[j], c.wrongWhy[c.a]];
    assert.deepEqual(V.analyzeShown(shown(c)).correctIndices, [j], "唯一正解移到 j");
    assertRejected(c, "WRONG_KEY");
  });
});

/* ---------- A01–A16 ---------- */
test("A01 覆蓋：184 張逐卡驗算，31 種 k 全部辨識，無跳過、無未知句型、無預設通過", () => {
  assert.equal(B.CARDS.length, 184);
  const bad = [], kinds = new Set();
  B.CARDS.forEach((c) => {
    const r = V.verifyCard(clone(c));
    kinds.add(c.chk.k);
    if (!r.ok || r.issues.length || !r.analysis.kind || r.analysis.correctIndices.length !== 1 || r.analysis.truth.length !== c.opts.length ||
        r.analysis.truth.some((t) => typeof t !== "boolean")) bad.push(c.id + "：" + (r.issues.join(",") || "沒有逐項真假"));
  });
  assert.deepEqual(bad, []);
  assert.equal(kinds.size, 31);
});

const checkA02 = (VV) => {
  const c = card("p0reg"), j = c.opts.indexOf("錯");
  const keyRec = KEY.RECORDS.find((x) => x.q === c.q);
  if (!keyRec || !keyRec.opts.find((o) => o.text === "對").ok) return false;   // 人工答案仍為「對」
  c.a = j;
  const r = VV.verifyCard(c);
  return !r.ok && r.issues.includes("WRONG_KEY") && VV.analyzeShown(shown(c)).correctIndices.every((i) => c.opts[i] === "對");
};
const checkA03 = (VV) => {
  const c = editQ(card("g2up"), "第 10 天 15 公分", "第 10 天 14 公分");
  c.chk.v[4] = 14;   // 題文與 chk 一致，仍要因並列被拒
  const r = VV.verifyCard(c);
  return !r.ok && r.issues.includes("TIE") && !r.issues.includes("CHK_MISMATCH");
};
test("A02 第一輪 fact：p0reg 把 a 指向「錯」⇒ WRONG_KEY，人工答案仍為「對」", () => assert.ok(checkA02(V)));
test("A03 第一輪並列：g2up 題文與 chk 都改成 14 ⇒ 兩段並列被拒", () => assert.ok(checkA03(V)));
test("A04 驗算器突變：極值「並列取第一個」、fact「永遠通過」都要被 A02／A03 殺死", () => {
  assert.ok(checkA02(V) && checkA03(V), "原驗算器要先通過 A02、A03");
  const tieFirst = (vals, cmp) => { let b = 0; vals.forEach((v, i) => { if (cmp(v, vals[b]) > 0) b = i; }); return [b]; };
  const mutTie = V.makeVerifier({ extreme: tieFirst });
  const mutFact = V.makeVerifier({ factVerdict: () => [] });
  assert.equal(checkA03(mutTie), false, "並列取第一個的突變沒被 A03 殺死");
  assert.equal(checkA02(mutFact), false, "fact 永遠通過的突變沒被 A02 殺死");
});

test("A05 chk 不得決定答案：o0、c0 固定 q／opts，給兩份不同 chk，獨立求解完全相同；完整核對另報 chk 不符", () => {
  ["o0", "c0"].forEach((id) => {
    const good = card(id), bad = card(id);
    Object.keys(bad.chk).forEach((k) => { if (typeof bad.chk[k] === "number") bad.chk[k] += 1; });
    const ra = V.verifyCard(good), rb = V.verifyCard(bad);
    assert.deepEqual(rb.analysis, ra.analysis, id + " 換 chk 後獨立求解不得改變");
    assert.deepEqual(V.analyzeShown(shown(good)), ra.analysis, id + " 只呼叫 analyzeShown 結果一樣");
    assert.deepEqual(ra.issues, []);
    assert.deepEqual(rb.issues, ["CHK_MISMATCH"], id + " 錯的 chk 要報 CHK_MISMATCH");
  });
  const src = fs.readFileSync(path.join(__dirname, "verify_shown.js"), "utf8");
  assert.ok(!/require\([^)]*(mathbank|core|src\/)/.test(src), "驗算器不得 require 題庫或核心");
});

test("A06 所有錯誤位置：每張卡每個 j≠a 各自令 a=j，都因答案位置錯誤被拒", () => {
  const survived = [];
  B.CARDS.forEach((c0) => c0.opts.forEach((_, j) => {
    if (j === c0.a) return;
    const c = clone(c0); c.a = j;
    const r = V.verifyCard(c);
    if (r.ok || !r.issues.includes("WRONG_KEY")) survived.push(c.id + "@" + j);
  }));
  assert.deepEqual(survived, []);
});

test("A07 合法重排：循環位移 opts／wrongWhy 並同步更新 a，全部通過", () => {
  const bad = [];
  B.CARDS.forEach((c0) => { for (let s = 1; s < c0.opts.length; s++) {
    const c = clone(c0), n = c.opts.length, rot = (arr) => arr.map((_, i) => arr[(i + s) % n]);
    c.opts = rot(c0.opts); c.wrongWhy = rot(c0.wrongWhy); c.a = (c0.a - s + n) % n;
    assert.equal(c.opts[c.a], c0.opts[c0.a]);
    const r = V.verifyCard(c); if (!r.ok) bad.push(c.id + " 位移 " + s + "：" + r.issues.join(","));
  } });
  assert.deepEqual(bad, []);
});

test("A08 真正修正可通過：o0 改 1/3＋1/3＝2/3、c0 交換左右分數，同步更新答案與 chk", () => {
  const o = editQ(card("o0"), "1/2 ＋", "1/3 ＋");
  editOpt(o, "5/6", "2/3"); o.chk.a = 1; o.chk.b = 3;
  assert.deepEqual(V.verifyCard(o).issues, []);
  const c = editQ(card("c0"), "2/3 ○ 3/4", "3/4 ○ 2/3");
  c.a = c.opts.indexOf(">"); Object.assign(c.chk, { a: 3, b: 4, c: 2, d: 3 });
  assert.deepEqual(V.verifyCard(c).issues, []);
});

test("A09 更大錯誤選項：c0max 只把 3/5→5/6，求得新最大 5/6、拒絕舊 key", () => {
  const c = editOpt(card("c0max"), "3/5", "5/6");
  assert.deepEqual(texts(c, V.analyzeShown(shown(c)).correctIndices), ["5/6"]);
  assertRejected(c, "WRONG_KEY");
});

test("A10 等值重複正解：q0 6/6→4/6、c0max 3/5→4/6 ⇒ 兩個選項同時成立，拒絕", () => {
  const q = editOpt(card("q0"), "6/6", "4/6");
  assert.deepEqual(texts(q, V.analyzeShown(shown(q)).correctIndices).sort(), ["4/6", "6/9"]);
  assertRejected(q, "MULTI_CORRECT");
  const m = editOpt(card("c0max"), "3/5", "4/6");
  assert.deepEqual(texts(m, V.analyzeShown(shown(m)).correctIndices).sort(), ["2/3", "4/6"]);
  assertRejected(m, "MULTI_CORRECT");
});

test("A11 下降不等於第一段：g0dn 選項 10 時 到 12 時→14 時 到 16 時，兩個都是下降", () => {
  const c = editOpt(card("g0dn"), "10 時 到 12 時", "14 時 到 16 時");
  assert.deepEqual(texts(c, V.analyzeShown(shown(c)).correctIndices).sort(), ["12 時 到 14 時", "14 時 到 16 時"]);
  assertRejected(c, "MULTI_CORRECT");
});

test("A12 運算符與敘事角色：o0 ＋→－ 得 1/6；w0 交換原有與用掉得 −7/12 公尺（不得取絕對值）", () => {
  const o = editQ(card("o0"), "＋", "－");
  const ao = V.analyzeShown(shown(o));
  assert.equal(ao.solution, "1/6"); assert.equal(ao.parsed.op, "-");
  assertRejected(o, "NO_CORRECT");
  const w = card("w0");
  w.q = "一條緞帶長 1/6 公尺，用掉 3/4 公尺，還剩多少公尺？";
  const aw = V.analyzeShown(shown(w));
  assert.equal(aw.solution, "-7/12"); assert.equal(aw.parsed.unit, "公尺");
  assert.deepEqual(aw.correctIndices, []);
  assertRejected(w, "NO_CORRECT");
});

test("A13 幾何條件：移除長方形、等腰三角形的排除條件 ⇒ 報條件不足，不挑代表圖形回答", () => {
  const s1 = editQ(card("s1"), "長方形（長和寬不一樣長）", "長方形");
  const a1 = V.analyzeShown(shown(s1));
  assert.ok(a1.issues.includes("AMBIGUOUS_SHAPE")); assert.deepEqual(a1.correctIndices, []);
  assertRejected(s1, "AMBIGUOUS_SHAPE");
  const s3 = editQ(card("s3"), "等腰三角形（兩腰一樣長、底邊和腰不一樣長）", "等腰三角形");
  assertRejected(s3, "AMBIGUOUS_SHAPE");
  const s3b = editQ(card("s3"), "等腰三角形（兩腰一樣長、底邊和腰不一樣長）", "等腰三角形（兩腰一樣長）");
  assertRejected(s3b, "AMBIGUOUS_SHAPE");
});

test("A14 嚴格數值解析：分母改 0 報資料錯；選項 6→6abc 報解析錯，不截前綴當成 6", () => {
  const o = editQ(card("o0"), "1/2 ＋", "1/0 ＋");
  assertRejected(o, "BAD_DATA");
  const g = editOpt(card("f0g"), "6", "6abc");
  const a = V.analyzeShown(shown(g));
  assert.ok(a.issues.includes("OPT_PARSE"), a.issues.join(","));
  assert.ok(!a.correctIndices.includes(g.opts.indexOf("6abc")), "6abc 不得當成 6");
  assertRejected(g, "OPT_PARSE");
});

test("A15 語意條件：全部沒上升、三邊 2,3,5、第三邊等於差或和、要求最簡卻答 10/12", () => {
  const line = { q: "某天的氣溫：8 時 30 度、10 時 28 度、12 時 25 度。哪一段上升得最多？", opts: ["8 時 到 10 時", "10 時 到 12 時"] };
  const al = V.analyzeShown(line);
  assert.ok(al.issues.includes("NO_RISE")); assert.deepEqual(al.correctIndices, []);
  const tri = { q: "下面哪一組三根吸管，可以圍成三角形？", opts: ["2 公分、3 公分、5 公分", "1 公分、1 公分、3 公分"] };
  const at = V.analyzeShown(tri);
  assert.deepEqual(at.truth, [false, false], "2,3,5 是退化三角形");
  assert.ok(at.issues.includes("NO_CORRECT"));
  const t3 = card("t03"), a3 = V.analyzeShown(shown(t3));
  assert.equal(a3.truth[t3.opts.indexOf("3 公分")], false, "等於兩邊的差不行");
  assert.equal(a3.truth[t3.opts.indexOf("13 公分")], false, "等於兩邊的和不行");
  const low = { q: "5/12 ＋ 5/12 ＝？（寫成最簡分數）", opts: ["10/12", "1/2"] };
  const alo = V.analyzeShown(low);
  assert.deepEqual(alo.truth, [false, false], "要求最簡，10/12 不算對");
  assert.equal(alo.solution, "5/6");
  const sim = { q: "把 20/24 約成最簡分數。", opts: ["10/12", "5/6"] };
  assert.deepEqual(V.analyzeShown(sim).truth, [false, true]);
});

test("A16 各敘事模板：f0wp、m0wp、w0–w5 各改一個有角色的數值，由敘事條件求解", () => {
  const cases = [
    { id: "f0wp", from: "48 顆糖", to: "45 顆糖", parsed: { kind: "gcd", a: 45, b: 36, unit: "袋" }, solution: "9", correct: [] },
    { id: "m0wp", from: "每 6 分鐘", to: "每 4 分鐘", parsed: { kind: "lcm", a: 4, b: 8, unit: "分鐘" }, solution: "8", correct: [] },
    { id: "w0", from: "長 3/4", to: "長 5/6", parsed: { kind: "addsub", op: "-", x: "5/6", y: "1/6", unit: "公尺", lowest: false }, solution: "2/3", correct: ["8/12 公尺"] },
    { id: "w1", from: "2/5 公斤的蘋果", to: "1/5 公斤的蘋果", parsed: { kind: "addsub", op: "+", x: "1/5", y: "1/3", unit: "公斤", lowest: false }, solution: "8/15", correct: [] },
    { id: "w2", from: "倒出 1/4", to: "倒出 1/3", parsed: { kind: "addsub", op: "-", x: "5/6", y: "1/3", unit: "公升", lowest: false }, solution: "1/2", correct: [] },
    { id: "w3", from: "下午讀了 1/3", to: "下午讀了 1/6", parsed: { kind: "addsub", op: "+", x: "1/4", y: "1/6", unit: "", lowest: false }, solution: "5/12", correct: [] },
    { id: "w4", from: "的 3/8 種玉米", to: "的 5/8 種玉米", parsed: { kind: "addsub", op: "-", x: "5/8", y: "1/6", unit: "塊地", lowest: false }, solution: "11/24", correct: [] },
    { id: "w5", from: "弟弟喝了 1/2", to: "弟弟喝了 1/3", parsed: { kind: "addsub", op: "-", x: "2/3", y: "1/3", unit: "杯", lowest: false }, solution: "1/3", correct: ["2/6 杯"] }
  ];
  cases.forEach((t) => {
    const c0 = card(t.id);
    assert.deepEqual(V.verifyCard(c0).issues, [], t.id + " 原卡要先通過");
    const c = editQ(clone(c0), t.from, t.to), a = V.analyzeShown(shown(c));
    const got = {}; Object.keys(t.parsed).forEach((k) => { got[k] = a.parsed[k]; });
    assert.deepEqual(got, t.parsed, t.id + " 解析欄位");
    assert.equal(a.solution, t.solution, t.id + " 求解");
    assert.deepEqual(texts(c, a.correctIndices), t.correct, t.id + " 正解選項");
    assertRejected(c);
  });
});

/* ---------- 驗算器自身的固定案例 ---------- */
test("答案鑰覆核：是非題的審定答案與圖形模型一致；每筆紀錄恰一個正解、選項不重複", () => {
  KEY.RECORDS.forEach((r) => {
    assert.equal(r.opts.filter((o) => o.ok).length, 1, r.id + " 要恰一個正解");
    assert.equal(new Set(r.opts.map((o) => o.text)).size, r.opts.length, r.id + " 選項重複");
    const m = /^是非題：「(.+)是正多邊形。」$/.exec(r.q);
    if (m) {
      const s = V.shapeInfo(m[1]);
      assert.ok(s && !s.ambiguous, r.id + " 圖形模型要能唯一決定");
      assert.equal(r.opts.find((o) => o.ok).text, s.regular ? "對" : "錯", r.id + " 答案鑰與圖形模型不一致");
    }
  });
  const fc = B.CARDS.filter((c) => c.chk.k === "fact");
  assert.deepEqual(fc.filter((c) => !KEY.RECORDS.some((r) => r.q === c.q)).map((c) => c.id), [], "觀念題都要有審定紀錄");
});

test("fact 綁定完整內容：選項文字改一個字或少一個選項 ⇒ UNREVIEWED；只改 id 不影響判定", () => {
  const c = editOpt(card("s-edge"), "差 1 公分", "差 2 公分");
  assertRejected(c, "UNREVIEWED");
  const d = card("p-circle"); d.opts.pop(); d.wrongWhy.pop();
  assertRejected(d, "UNREVIEWED");
  const e = card("s-fold"); e.id = "某個新 id";
  assert.deepEqual(V.verifyCard(e).issues, []);
});

test("圖形模型：名稱不能唯一決定時報 AMBIGUOUS_SHAPE（正方形也是長方形、菱形；正三角形也是等腰）", () => {
  assert.equal(V.shapeInfo("長方形").ambiguous, true);
  assert.equal(V.shapeInfo("菱形").ambiguous, true);
  assert.equal(V.shapeInfo("等腰三角形").ambiguous, true);
  assert.equal(V.shapeInfo("不是長方形的平行四邊形").ambiguous, true, "菱形不是長方形卻有 2 條");
  assert.equal(V.shapeInfo("一般的平行四邊形（不是長方形、也不是菱形）").axes, 0);
  assert.equal(V.shapeInfo("長方形（長和寬不一樣長）").axes, 2);
  assert.equal(V.shapeInfo("菱形（角不是直角）").axes, 2);
  assert.equal(V.shapeInfo("等腰三角形（不是正三角形）").axes, 1);
  assert.equal(V.shapeInfo("正八邊形").axes, 8);
  assert.equal(V.shapeInfo("圓").axes, Infinity);
  assert.equal(V.shapeInfo("星形"), null);
});

test("未知句型一律拒絕（不猜、不預設通過）", () => {
  const a = V.analyzeShown({ q: "下面哪一個數最可愛？", opts: ["1", "2"] });
  assert.ok(a.issues.includes("UNKNOWN_PATTERN")); assert.deepEqual(a.correctIndices, []);
  const b = V.analyzeShown({ q: "12 和 18 的最大公因數是多少", opts: ["6", "3"] });   // 少了問號也不猜
  assert.ok(b.issues.includes("UNKNOWN_PATTERN"));
});

// Codex 審 0765694／1f68b46：①大數交叉相乘超過浮點精度被判成相等 ②不可能的內角（400 度）仍放行
test("精確分數比較：99999999/100000000 ○ 100000000/100000001 要判成 <", () => {
  const r = V.analyzeShown({ q: "99999999/100000000 ○ 100000000/100000001，○ 裡要填 >、< 還是 =？", opts: ["<", ">", "="] });
  assert.deepEqual(r.correctIndices, [0], String(r.issues));
});
test("不可能的內角：五邊形有一個角 400 度要拒絕題目", () => {
  const r = V.analyzeShown({ q: "五邊形有 4 個角是 400 度、40 度、40 度、40 度，剩下那個角是幾度？", opts: ["20 度", "40 度"] });
  assert.ok((r.issues || []).length || !(r.correctIndices || []).length, String(r.correctIndices));
  const r2 = V.analyzeShown({ q: "三角形有 2 個角是 10 度、10 度，剩下那個角是幾度？", opts: ["160 度", "170 度"] });
  assert.deepEqual(r2.correctIndices, [0], "三角形 10、10、160 度是合法題目，要能通過：" + String(r2.issues));
});
test("精確分數選項：選項本身的大數也不能先轉成浮點數（1/100000001＋1/100000003）", () => {
  const r = V.analyzeShown({ q: "1/100000001 ＋ 1/100000003 ＝？（寫成最簡分數）", opts: ["200000004/10000000400000003", "1/2"] });
  assert.deepEqual(r.correctIndices, [0], String(r.issues));
});
test("題文數字超過安全整數上限要拒絕（不可偷偷失真後再和 chk 比對）", () => {
  const card = { id: "big", q: "9007199254740993/10 ○ 1/2，○ 裡要填 >、< 還是 =？", opts: [">", "<", "="], a: 0,
    chk: { k: "compare", a: 9007199254740992, b: 10, c: 1, d: 2 } };
  const r = V.verifyCard(card);
  assert.equal(r.ok, false, "大數題要被拒絕");
});

/* ---------- 大數精度驗收矩陣（docs/design-verify-bigint-codex-20261013.md (d)；第 4 輪 FAIL ec95886 後由 Codex 設計者給定） ---------- */
// 題文整數／chk 數值限安全整數；分數選項保留精確 BigInt；整數算術以 BigInt 中間值計算、範圍檢查通過才轉 Number。
const BIG = "9007199254740993";   // MAX_SAFE_INTEGER + 2：轉成 Number 會變成 9007199254740992
const VPATH = process.env.VERIFY_SHOWN ? path.resolve(process.env.VERIFY_SHOWN) : path.join(__dirname, "verify_shown.js");
const R1 = { id: "R1", q: BIG + "/10 ＋ 1/2 ＝？（寫成最簡分數）", opts: ["4503599627370499/5", "1/2"], a: 0,
  chk: { k: "addsub", a: 9007199254740992, b: 10, c: 1, d: 2, op: "+" } };
const R2 = { id: "R2", q: "植物高度：第 1 天 9007199254740993 公分、第 2 天 9007199254740995 公分、第 3 天 9007199254740997 公分。哪一段上升得最多？",
  opts: ["第 1 天 到 第 2 天", "第 2 天 到 第 3 天"], a: 0 };
const R3 = { id: "R3", q: "把 4503599627370495/3 擴分成分母是 6 的分數，分子是多少？", opts: ["9007199254740989", "9007199254740990"], a: 0 };
const BIGOPT = { q: "1/100000001 ＋ 1/100000003 ＝？（寫成最簡分數）", opts: ["200000004/10000000400000003", "1/2"] };
const wholeRejected = (r, why) => { assert.ok(r.issues.length > 0, why + " 要整題拒絕，實際沒有問題原因"); };

test("大數 R1：分數加法題文 9007199254740993/10 ⇒ BAD_DATA、整卡 ok:false（chk 寫失真後的 …992 也不能核對通過）", () => {
  const r = V.verifyCard(clone(R1));
  assert.equal(r.ok, false, "R1 要被拒絕：" + r.issues.join(","));
  assert.ok(r.issues.includes("BAD_DATA"), "R1 拒絕原因要含 BAD_DATA，實際：" + r.issues.join(","));
  assert.deepEqual(r.analysis.correctIndices, [], "R1 不得解出正解");
});
test("大數 R2：折線資料超過安全整數 ⇒ BAD_DATA，不得選第一段", () => {
  const a = V.analyzeShown({ q: R2.q, opts: R2.opts });
  assert.ok(a.issues.includes("BAD_DATA"), "R2 要報 BAD_DATA，實際：" + a.issues.join(","));
  assert.ok(!a.correctIndices.includes(0), "R2 不得選第一段");
  const r = V.verifyCard(clone(R2));
  assert.equal(r.ok, false); assert.ok(r.issues.includes("BAD_DATA"));
});
test("大數 R3：擴分 4503599627370495/3 → 分母 6，分子精確 9007199254740990（中間乘積超過安全範圍也不失真）", () => {
  const a = V.analyzeShown({ q: R3.q, opts: R3.opts });
  assert.deepEqual(a.issues, [], "R3 是合法題：" + a.issues.join(","));
  assert.equal(a.solution, "9007199254740990");
  assert.deepEqual(a.correctIndices, [1]);
  const r = V.verifyCard(clone(R3));
  assert.equal(r.ok, false); assert.ok(r.issues.includes("WRONG_KEY"), "a=0 要報 WRONG_KEY：" + r.issues.join(","));
});
["＋", "－"].forEach((op) => [0, 1, 2, 3].forEach((pos) => {
  const n = ["1", "2", "1", "3"]; n[pos] = BIG;
  const q = n[0] + "/" + n[1] + " " + op + " " + n[2] + "/" + n[3] + " ＝？";
  test("大數 加減第 " + (pos + 1) + " 欄（" + q + "）⇒ BAD_DATA", () => {
    const a = V.analyzeShown({ q, opts: ["1/1", "1/2"] });
    assert.ok(a.issues.includes("BAD_DATA"), q + " 要報 BAD_DATA，實際：" + a.issues.join(","));
    assert.deepEqual(a.correctIndices, []);
  });
}));
test("大數 比較：9007199254740993/10 ○ 1/2 ⇒ BAD_DATA", () => {
  const a = V.analyzeShown({ q: BIG + "/10 ○ 1/2，○ 裡要填 >、< 還是 =？", opts: [">", "<", "="] });
  assert.ok(a.issues.includes("BAD_DATA"), a.issues.join(",")); assert.deepEqual(a.correctIndices, []);
});
test("大數 比較精度：99999999/100000000 ○ 100000000/100000001 ⇒ 索引 [1]，無錯誤", () => {
  const a = V.analyzeShown({ q: "99999999/100000000 ○ 100000000/100000001，○ 裡要填 >、< 還是 =？", opts: [">", "<", "="] });
  assert.deepEqual(a.issues, []); assert.deepEqual(a.correctIndices, [1]);
});
test("大數 大分數選項：1/100000001 ＋ 1/100000003 的超大分母選項照收（保留既有契約）", () => {
  const a = V.analyzeShown(BIGOPT);
  assert.deepEqual(a.issues, []); assert.deepEqual(a.correctIndices, [0]);
});
test("大數 整除：選項 9007199254740993 ÷ 3 ⇒ 整題拒絕", () => {
  const c = { id: "dv", q: "下面哪一個算式是整除？", opts: [BIG + " ÷ 3", "4 ÷ 2"], a: 1, chk: { k: "divides", n: 4, d: 2 } };
  const a = V.analyzeShown(shown(c));
  wholeRejected(a, "整除"); assert.ok(a.issues.includes("BAD_DATA"), a.issues.join(",")); assert.ok(!a.correctIndices.includes(0));
  assert.equal(V.verifyCard(c).ok, false);
});
test("大數 parseInt 路徑：吸管選項 9007199254740993 公分 ⇒ 整題拒絕（chk 核對也不得 parseInt 失真）", () => {
  const c = { id: "tr", q: "下面哪一組三根吸管，可以圍成三角形？", opts: [BIG + " 公分、2 公分、3 公分", "3 公分、4 公分、5 公分"], a: 1,
    chk: { k: "triok", sets: [[9007199254740991, 2, 3], [3, 4, 5]] } };
  const a = V.analyzeShown(shown(c));
  wholeRejected(a, "吸管"); assert.ok(a.issues.includes("BAD_DATA"), a.issues.join(",")); assert.ok(!a.correctIndices.includes(0));
  assert.equal(V.verifyCard(c).ok, false);
});
test("大數 map(Number) 路徑：「2 的倍數」選項 9007199254740993 ⇒ 整題拒絕", () => {
  const c = { id: "mu", q: "下面哪一個數是 2 的倍數？", opts: [BIG, "4"], a: 1, chk: { k: "rule", which: "是 2 的倍數", v: [9007199254740991, 4] } };
  const a = V.analyzeShown(shown(c));
  wholeRejected(a, "倍數"); assert.ok(a.issues.includes("BAD_DATA"), a.issues.join(",")); assert.ok(!a.correctIndices.includes(0));
  assert.equal(V.verifyCard(c).ok, false);
});
test("大數 chk 入口：合法 1/2＋1/2 卡加 chk.extra=9007199254740992 ⇒ verifyCard 拒絕，analyzeShown 結果不變", () => {
  const good = { id: "ck", q: "1/2 ＋ 1/2 ＝？", opts: ["1/1", "1/2"], a: 0, chk: { k: "addsub", a: 1, b: 2, c: 1, d: 2, op: "+" } };
  const rg = V.verifyCard(clone(good));
  assert.deepEqual(rg.issues, [], "合法卡要先通過");
  const bad = clone(good); bad.chk.extra = 9007199254740992;
  const rb = V.verifyCard(bad);
  assert.equal(rb.ok, false, "chk 含超過安全範圍的數要被拒絕");
  assert.deepEqual(rb.analysis, rg.analysis, "chk 不得影響獨立求解");
  assert.deepEqual(V.analyzeShown(shown(bad)), rg.analysis);
});
test("大數 helper：mul(999999999,999999999)、add(MAX_SAFE_INTEGER,1) 拒絕轉回 Number（不產生近似值）", () => {
  assert.equal(typeof V.mul, "function"); assert.equal(typeof V.add, "function");
  assert.throws(() => V.mul(999999999, 999999999), (e) => e.code === "BAD_DATA");
  assert.throws(() => V.add(Number.MAX_SAFE_INTEGER, 1), (e) => e.code === "BAD_DATA");
  assert.equal(V.mul(99999, 99999), 9999800001);
});
test("大數 helper：mulDiv(4503599627370495,6,3) 精確 9007199254740990；div(1,0) 拒絕", () => {
  assert.equal(typeof V.mulDiv, "function"); assert.equal(typeof V.div, "function");
  assert.equal(V.mulDiv(4503599627370495, 6, 3), 9007199254740990);
  assert.throws(() => V.div(1, 0), (e) => e.code === "BAD_DATA");
  assert.equal(V.div(12, 4), 3);
});
// 回歸測試（設計檔註明：非舊碼紅）：沒有文法的題型不得因加了 helper 而被猜成功
test("大數 回歸：平均題 ⇒ UNKNOWN_PATTERN", () => {
  assert.ok(V.analyzeShown({ q: "2 和 4 的平均是多少？", opts: ["3", "4"] }).issues.includes("UNKNOWN_PATTERN"));
});
test("大數 回歸：面積題 ⇒ UNKNOWN_PATTERN", () => {
  assert.ok(V.analyzeShown({ q: "長方形長 3 公分、寬 4 公分，面積是多少平方公分？", opts: ["12", "7"] }).issues.includes("UNKNOWN_PATTERN"));
});
test("大數 CLI：批次 R1、R2、R3、大分數選項 ⇒ JSON 可解析、拒絕／答案與 analyzeShown 一致、大整數不失真", () => {
  const { spawnSync } = require("node:child_process");
  const items = [R1, R2, R3, BIGOPT].map((c) => ({ q: c.q, opts: c.opts }));
  const r = spawnSync(process.execPath, [VPATH], { input: JSON.stringify(items), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.length, 4);
  items.forEach((it, i) => {
    const a = V.analyzeShown(it);
    assert.deepEqual(out[i].issues, a.issues, i + " issues");
    assert.deepEqual(out[i].correctIndices, a.correctIndices, i + " correctIndices");
    assert.equal(out[i].solution, a.solution, i + " solution");
  });
  assert.ok(out[0].issues.includes("BAD_DATA") && out[1].issues.includes("BAD_DATA"));
  assert.equal(out[2].solution, "9007199254740990"); assert.deepEqual(out[2].correctIndices, [1]);
  assert.equal(out[2].parsed.numer, 9007199254740990);
  assert.ok(r.stdout.includes("9007199254740990"), "CLI 原文要有精確分子");
  assert.equal(out[3].solution, "200000004/10000000400000003");
  assert.deepEqual(out[3].correctIndices, [0]);
});
test("大數 集中入口：數值入口以外的程式不得私自轉型或做整數算術", () => {
  const src = fs.readFileSync(VPATH, "utf8");
  const END = "/* ===== 數值入口結束 ===== */";
  assert.ok(src.includes(END), "驗算器要有數值入口區段（以「" + END + "」結尾）");
  const body = src.slice(src.indexOf(END) + END.length).split("\n").map((l) => l.replace(/\/\*.*?\*\//g, "").replace(/\s\/\/.*$/, ""));   // 去掉註解再掃
  const banned = [[/\bNumber\(/, "Number("], [/\bparseInt\(|\bparseFloat\(/, "parseInt/parseFloat"], [/\bBigInt\(/, "BigInt("],
    [/map\(Number\)/, "map(Number)"], [/[=(,:?]\s*\+[A-Za-z_$(]/, "一元 +"], [/\bMath\.(abs|min|max|sign)\b/, "Math 算術"],
    [/ [*\/%] /, "* / %"], [/ - /, "減法"], [/\+\+|--/, "++/--"]];
  const hits = [];
  body.forEach((l) => banned.forEach(([re, name]) => { if (re.test(l)) hits.push(name + "：" + l.trim().slice(0, 80)); }));
  assert.deepEqual(hits, []);
});

// Codex 審 c7d3d01：①因數題迴圈用 mul(i,i) 當停止條件，n 接近最大安全整數時最後一步 i² 超出範圍而誤判 BAD_DATA；
// ②最小公倍數沒有大數案例，改回 a*b/gcd（Number）不會被抓到。
test("大數 邊界：最大安全整數 9007199254740991 有 8 個因數（不得誤判 BAD_DATA）", () => {
  const r = V.analyzeShown({ q: "9007199254740991 有幾個因數？", opts: ["8", "6"] });
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.correctIndices, [0]);
});
test("大數 最小公倍數：13000000195 和 17000000255 ⇒ 221000003315（Number 乘除會算成 …314.99997）", () => {
  const r = V.analyzeShown({ q: "13000000195 和 17000000255 的最小公倍數是多少？", opts: ["221000003315", "221000003314"] });
  assert.equal(r.solution, "221000003315");
  assert.deepEqual(r.correctIndices, [0]);
});

// 2026-10-18 考古卷題型的文法嚴格度：題面本身不成立就整題拒絕，不猜、不放行
test("新題型文法：帶分數兩邊整數不同、分數部分不是真分數、全組等值只給一個分數、因數題選項有非整數 ⇒ 拒絕", () => {
  const issues = (q, opts) => V.analyzeShown({ q, opts }).issues;
  assert.ok(issues("2又3/4 ＝ 3又□/12，□ 是多少？", ["9", "21"]).includes("BAD_DATA"), "兩邊整數部分不同");
  assert.ok(issues("2又5/4 ＝ 2又□/12，□ 是多少？", ["15", "9"]).includes("BAD_DATA"), "分數部分是假分數");
  assert.ok(issues("2又7/6 ○ 15/7，○ 裡要填 >、< 還是 =？", [">", "<", "="]).includes("BAD_DATA"), "比大小的帶分數部分是假分數");
  assert.ok(issues("下面哪一組分數，全部都和 3/4 一樣大？", ["6/8", "6/8、9/12"]).includes("OPT_PARSE"), "只有一個分數不算一組");
  assert.ok(issues("下面哪一組是 64 的全部因數？", ["1、2、4、8、16、32、64", "1、2、4、8.5"]).includes("OPT_PARSE"), "選項有非整數");
  const ok = V.analyzeShown({ q: "下面哪一組是 64 的全部因數？", opts: ["64、32、16、8、4、2、1", "1、2、4、8、16、32"] });
  assert.deepEqual(ok.correctIndices, [0], "集合相同、順序不同仍算對");
});
