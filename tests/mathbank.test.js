// 題庫獨立驗算：不用 mathbank.js 的 gcd/lcm，另寫暴力版本，逐張卡依 chk 重算答案。執行：node --test tests/mathbank.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../src/mathbank.js");
const C = require("../src/core.js");

const divs = (n) => Array.from({ length: n }, (_, i) => i + 1).filter((i) => n % i === 0);
const G = (a, b) => Math.max(...divs(a).filter((x) => b % x === 0));
const L = (a, b) => { for (let m = Math.max(a, b); ; m++) if (m % a === 0 && m % b === 0) return m; };
const frac = (s) => { const m = /^(\d+)\/(\d+)/.exec(s); return m ? [+m[1], +m[2]] : null; };
const eqf = (p, q) => p[0] * q[1] === p[1] * q[0];
const lowest = (p) => G(p[0], p[1]) === 1;
const num = (s) => +String(s).replace(/[^\d]/g, "");

/* ---------- 幾何：用座標實算邊長、角度、對稱軸（不看題庫寫的答案） ---------- */
const EPS = 1e-9;
const regular = (n) => Array.from({ length: n }, (_, i) => [Math.cos(2 * Math.PI * i / n), Math.sin(2 * Math.PI * i / n)]);
// 名稱 → 一個具體圖形的頂點。名稱不能唯一決定圖形（例如「等腰三角形」沒排除正三角形）就回 null ⇒ 該題不成立
function shapeOf(name) {
  const R = { "正三角形": 3, "正方形": 4, "正五邊形": 5, "正六邊形": 6, "正八邊形": 8 };
  if (R[name]) return regular(R[name]);
  if (/^長方形（長和寬不一樣長?）$/.test(name)) return [[0, 0], [4, 0], [4, 2], [0, 2]];   // 只寫「長方形」也可能是正方形 ⇒ 不成立
  if (/^菱形（角不是直角）$/.test(name)) return [[0, 0], [2, 0], [3, Math.sqrt(3)], [1, Math.sqrt(3)]];   // 60°／120° 菱形
  if (/^等腰三角形（.*(不是正三角形|底邊和腰不一樣長).*）$/.test(name)) return [[0, 0], [6, 0], [3, 4]];   // 腰 5、5，底 6
  return null;
}
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
function isRegular(P) {
  const n = P.length, side = P.map((p, i) => dist(p, P[(i + 1) % n]));
  const ang = P.map((p, i) => { const a = P[(i + n - 1) % n], b = P[(i + 1) % n], u = [a[0] - p[0], a[1] - p[1]], v = [b[0] - p[0], b[1] - p[1]];
    return Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))); });
  return side.every((s) => Math.abs(s - side[0]) < EPS) && ang.every((a) => Math.abs(a - ang[0]) < 1e-7);
}
// 凸多邊形的對稱軸一定通過重心，且通過某個頂點或某條邊的中點：逐一試反射，數有幾條能把頂點集合映回自己
function axesCount(P) {
  const n = P.length, c = [P.reduce((s, p) => s + p[0], 0) / n, P.reduce((s, p) => s + p[1], 0) / n];
  const cand = P.concat(P.map((p, i) => [(p[0] + P[(i + 1) % n][0]) / 2, (p[1] + P[(i + 1) % n][1]) / 2]));
  const dirs = [];
  cand.forEach((q) => { const t = Math.atan2(q[1] - c[1], q[0] - c[0]); const a = ((t % Math.PI) + Math.PI) % Math.PI;
    if (Math.hypot(q[0] - c[0], q[1] - c[1]) > EPS && !dirs.some((d) => Math.abs(d - a) < 1e-7 || Math.abs(Math.abs(d - a) - Math.PI) < 1e-7)) dirs.push(a); });
  return dirs.filter((a) => { const ux = Math.cos(a), uy = Math.sin(a);
    return P.every((p) => { const x = p[0] - c[0], y = p[1] - c[1], d = x * ux + y * uy, r = [c[0] + 2 * d * ux - x, c[1] + 2 * d * uy - y];
      return P.some((q) => dist(q, r) < 1e-7); }); }).length;
}
// 觀念題的答案鑰：完整審定紀錄（完整題文＋全部選項＋各選項真假）在 tests/fact_key.js，和新驗算器 tests/verify_shown.js 共用。
// 用題文找紀錄（id 不當答案依據）；題文或選項集合和紀錄不同 ⇒ 沒審過 ⇒ 不通過
const FACT = require("./fact_key.js");
function factKeyOk(c, R) {
  const rec = FACT.RECORDS.find((r) => r.q === c.q);
  if (!rec) return false;
  const want = rec.opts.map((o) => o.text).sort(), got = c.opts.slice().sort();
  if (want.length !== got.length || want.some((t, i) => t !== got[i])) return false;
  return rec.opts.find((o) => o.text === R).ok === true;
}

function expected(c) {
  const k = c.chk, R = c.opts[c.a];
  switch (k.k) {
    case "argmax": { const m = Math.max(...k.v), hit = k.v.map((x, i) => x === m ? i : -1).filter((i) => i >= 0); return hit.length === 1 && k.lab[hit[0]] === R; }
    case "maxrise": { const rise = k.v.slice(1).map((x, i) => x - k.v[i]), m = Math.max(...rise), hit = rise.map((r, i) => r === m ? i : -1).filter((i) => i >= 0);
      return hit.length === 1 && R === k.lab[hit[0]] + " 到 " + k.lab[hit[0] + 1]; }
    case "firstdown": { const i = k.v.findIndex((x, j) => j < k.v.length - 1 && k.v[j + 1] < x); return R === k.lab[i] + " 到 " + k.lab[i + 1]; }
    case "isfactor": return k.n % num(R) === 0 && c.opts.filter((o, i) => i !== c.a).every((o) => k.n % num(o) !== 0);
    case "nfactors": return num(R) === divs(k.n).length;
    case "gcd": return num(R) === G(k.a, k.b);
    case "iscommonfactor": return k.a % num(R) === 0 && k.b % num(R) === 0 && c.opts.filter((o, i) => i !== c.a).every((o) => k.a % num(o) || k.b % num(o));
    case "divides": return R === k.n + " ÷ " + k.d && c.opts.every((o, i) => i === c.a || (() => { const [x, y] = o.split(" ÷ ").map(Number); return x % y !== 0; })());
    case "ismultiple": return num(R) % k.n === 0 && c.opts.filter((o, i) => i !== c.a).every((o) => num(o) % k.n !== 0);
    case "lcm": return num(R) === L(k.a, k.b);
    case "rule": { const ok = (n) => k.which.includes("2 和 5") ? n % 10 === 0 : k.which.includes("10") ? n % 10 === 0 : k.which.includes("5") ? n % 5 === 0 : n % 2 === 0;
      return ok(num(R)) && c.opts.filter((o, i) => i !== c.a).every((o) => !ok(num(o))); }
    case "vertices": return num(R) === k.n;
    case "triok": { const can = (t) => { const s = t.slice().sort((a, b) => a - b); return s[0] + s[1] > s[2]; };
      const parse = (o) => o.split("、").map(num); return can(parse(R)) && c.opts.filter((o, i) => i !== c.a).every((o) => !can(parse(o))); }
    case "third": { const ok = (x) => x > Math.abs(k.a - k.b) && x < k.a + k.b; return ok(num(R)) && c.opts.filter((o, i) => i !== c.a).every((o) => !ok(num(o))); }
    case "anglesum": return num(R) === (k.n - 2) * 180;
    case "regangle": return num(R) === (k.n - 2) * 180 / k.n;
    case "missing": return num(R) === (k.n - 2) * 180 - k.g.reduce((a, b) => a + b, 0);
    case "expand": return num(R) === k.n * k.m / k.d;
    case "simplify": { const f = frac(R); return eqf(f, [k.n, k.d]) && lowest(f) && c.opts.filter((o, i) => i !== c.a).every((o) => { const q = frac(o); return !(eqf(q, [k.n, k.d]) && lowest(q)); }); }
    case "equiv": { const f = frac(R); return eqf(f, [k.n, k.d]) && c.opts.filter((o, i) => i !== c.a).every((o) => !eqf(frac(o), [k.n, k.d])); }
    case "compare": { const x = k.a * k.d, y = k.c * k.b; return R === (x > y ? ">" : x < y ? "<" : "="); }
    case "maxfrac": { let m = k.fs[0]; k.fs.forEach((f) => { if (f[0] * m[1] > m[0] * f[1]) m = f; }); return eqf(frac(R), m); }
    case "addsub": { const n = k.op === "+" ? k.a * k.d + k.c * k.b : k.a * k.d - k.c * k.b, d = k.b * k.d, f = frac(R);
      return eqf(f, [n, d]) && lowest(f) && c.opts.filter((o, i) => i !== c.a).every((o) => !eqf(frac(o), [n, d])); }
    case "axes": { const P = shapeOf(k.shape); return !!P && num(R) === axesCount(P) && c.opts.every((o, i) => i === c.a || num(o) !== axesCount(P)); }
    case "fact": {
      const m = /^是非題：「(.+)是正多邊形。」$/.exec(c.q);
      if (m) { const P = shapeOf(m[1]); return !!P && R === (isRegular(P) ? "對" : "錯"); }
      return factKeyOk(c, R);
    }
    default: return false;
  }
}

test("每張卡：欄位合法、id 不重複、選項 2–4 個且不重複、正解在範圍內", () => {
  const ids = new Set();
  assert.ok(B.CARDS.length >= 100, "題數 " + B.CARDS.length);
  const bank = { cards: B.CARDS, concepts: {}, figs: {} };
  Object.keys(B.CONCEPTS).forEach((k) => { bank.concepts[k] = { unit: B.CONCEPTS[k].unit }; });
  B.CARDS.forEach((c) => {
    assert.ok(!ids.has(c.id), "重複 id " + c.id); ids.add(c.id);
    assert.ok(c.opts.length >= 2 && c.opts.length <= 4, c.id + " 選項數 " + c.opts.length);
    assert.equal(new Set(c.opts).size, c.opts.length, c.id + " 選項重複：" + c.opts.join("｜"));
    assert.ok(Number.isInteger(c.a) && c.a >= 0 && c.a < c.opts.length, c.id);
    assert.ok(c.why && c.hint && c.chk && c.chk.k, c.id + " 缺 why／hint／chk");
    assert.ok(Object.prototype.hasOwnProperty.call(B.CONCEPTS, c.concept), c.id);
    assert.ok(c.concept && B.UNITS[B.CONCEPTS[c.concept].unit], c.id);
    assert.ok(!/NaN|undefined|Infinity/.test(c.q + c.opts.join("") + c.why), c.id + " 有 NaN／undefined：" + c.q + c.opts.join("｜"));
  });
  // 核心的題卡驗證也要過（同一個 validCard）
  const s = C.blankState();
  B.CARDS.forEach((c) => assert.ok(C.cardById(s, bank, c.id), c.id + " 核心讀不到"));
});

test("每張計算卡：用另一套暴力算法重算，正解對、錯誤選項都真的錯", () => {
  const bad = B.CARDS.filter((c) => !expected(c)).map((c) => c.id + "：" + c.q + " → " + c.opts.join("｜") + "（正解 " + c.opts[c.a] + "）");
  assert.deepEqual(bad, []);
});

test("單元與觀念：涵蓋南一五上第 1～6 單元，每個觀念至少 6 題", () => {
  const units = new Set(Object.values(B.CONCEPTS).map((c) => c.unit));
  assert.deepEqual([...units].sort(), ["m1", "m2", "m3", "m4", "m5", "m6"]);
  Object.keys(B.CONCEPTS).forEach((k) => assert.ok(B.CARDS.filter((c) => c.concept === k).length >= 6, k + " 題數不足"));
});

test("分數加減的選項都是真分數（沒有 2/1 這種一看就錯的）", () => {
  B.CARDS.filter((c) => c.concept === "6a").forEach((c) => c.opts.forEach((o) => { const f = frac(o); assert.ok(f && f[0] < f[1], c.id + " 選項 " + o); }));
  B.CARDS.filter((c) => c.concept === "6a").forEach((c) => assert.ok(c.opts.length >= 3, c.id + " 選項太少"));
});

test("正解位置分散：不會全部都是第 1 個選項", () => {
  const pos = [0, 0, 0, 0]; B.CARDS.forEach((c) => pos[c.a]++);
  assert.ok(pos[0] < B.CARDS.length * 0.5, "第 1 個選項是正解的比例太高：" + pos.join(","));
});

// 律師 2026-10-13「數學複習似乎都沒有加上影片，建議都加上嗎」（#1335）：每個會出題的觀念至少一段驗證過的影片，否則不能上線。
test("每個會出題的觀念至少一段影片（欄位齊全、起訖秒數合理）", () => {
  const V = require("../src/mathvideos.js");
  const used = new Set(B.CARDS.map((c) => c.concept));
  const missing = [...used].filter((k) => !(Array.isArray(V[k]) && V[k].length));
  assert.deepEqual(missing, [], "沒有影片的觀念：" + missing.join("、"));
  Object.keys(V).forEach((k) => V[k].forEach((v) => {
    assert.ok(/^[\w-]{11}$/.test(v.id) && v.title && v.channel && v.note, k + " 影片欄位不齊：" + JSON.stringify(v));
    assert.ok(Number.isInteger(v.start) && v.start >= 0 && (v.end === null || (Number.isInteger(v.end) && v.end > v.start)), k + " 起訖秒數不對：" + JSON.stringify(v));
  }));
});

// Codex 2026-10-13 審查：g2up 兩段都增加 4 公分卻只認一個（正解被判錯）⇒ 「最多／最高」類題目的答案必須唯一
test("最多／最高類題目：答案唯一（沒有並列）", () => {
  B.CARDS.filter((c) => c.chk.k === "argmax" || c.chk.k === "maxrise").forEach((c) => {
    const v = c.chk.v, vals = c.chk.k === "argmax" ? v : v.slice(1).map((x, i) => x - v[i]);
    const m = Math.max(...vals);
    assert.equal(vals.filter((x) => x === m).length, 1, c.id + " 有並列：" + vals.join(","));
  });
});

// Codex 2026-10-13 審查：舊版 fact 直接回傳 true、maxrise 抄產生器邏輯，把正方形改判成非正多邊形仍通過 ⇒ 幾何改用座標實算，並做突變自檢
test("幾何驗算器本身：邊長／角度／對稱軸實算結果正確", () => {
  assert.equal(isRegular(shapeOf("正方形")), true);
  assert.equal(isRegular(shapeOf("正三角形")), true);
  assert.equal(isRegular(shapeOf("長方形（長和寬不一樣長）")), false);
  assert.equal(isRegular(shapeOf("菱形（角不是直角）")), false);
  assert.equal(isRegular(shapeOf("等腰三角形（不是正三角形）")), false);
  assert.deepEqual(["正三角形", "正方形", "正五邊形", "正六邊形", "長方形（長和寬不一樣長）", "菱形（角不是直角）", "等腰三角形（兩腰一樣長、底邊和腰不一樣長）"].map((n) => axesCount(shapeOf(n))), [3, 4, 5, 6, 2, 2, 1]);
  assert.equal(shapeOf("等腰三角形（兩腰一樣長）"), null, "沒排除正三角形的等腰三角形不能唯一決定對稱軸數");
  assert.equal(shapeOf("長方形"), null, "沒排除正方形的長方形不能唯一決定對稱軸數");
});

test("突變自檢：把題庫改錯，獨立驗算一定要抓到（在記憶體複本上改）", () => {
  const clone = (c) => JSON.parse(JSON.stringify(c));
  const flip = (c) => { const m = clone(c); m.a = m.opts.findIndex((o, i) => i !== m.a); return m; };
  const sq = B.CARDS.find((c) => c.q === "是非題：「正方形是正多邊形。」");
  assert.ok(sq && expected(sq), "原題要通過");
  assert.equal(expected(flip(sq)), false, "把正方形改判成「不是正多邊形」必須紅");
  // 每一張卡：把正解換成任一錯誤選項，驗算都必須不通過（含所有觀念題）
  const survived = B.CARDS.filter((c) => expected(flip(c))).map((c) => c.id);
  assert.deepEqual(survived, [], "正解被換掉卻仍通過：" + survived.join("、"));
  // 折線：把資料改成兩段並列最多，maxrise 必須紅（不再沿用「取第一個」）
  const up = clone(B.CARDS.find((c) => c.chk.k === "maxrise")); up.chk.v = [0, 4, 8, 9, 10];
  up.opts = ["第 2 天 到 第 4 天", "第 4 天 到 第 6 天"].map((x) => x.replace(/第 (\d+) 天/g, (_, d) => up.chk.lab[+d / 2 - 1])); up.a = 0;
  assert.equal(expected(up), false, "兩段並列最多時不得只認第一段");
  // 對稱軸：等腰三角形不排除正三角形 ⇒ 必須紅
  const s = clone(B.CARDS.find((c) => c.chk.k === "axes" && /等腰/.test(c.chk.shape))); s.chk.shape = "等腰三角形（兩腰一樣長）";
  assert.equal(expected(s), false);
});
