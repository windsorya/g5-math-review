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

function expected(c) {
  const k = c.chk, R = c.opts[c.a];
  switch (k.k) {
    case "argmax": return k.lab[k.v.indexOf(Math.max(...k.v))] === R;
    case "maxrise": { let bi = 0; for (let i = 1; i < k.v.length - 1; i++) if (k.v[i + 1] - k.v[i] > k.v[bi + 1] - k.v[bi]) bi = i; return R === k.lab[bi] + " 到 " + k.lab[bi + 1]; }
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
    case "axes": return num(R) === { "正方形": 4, "長方形": 2, "正三角形": 3, "等腰三角形（兩腰一樣長）": 1, "正六邊形": 6, "正五邊形": 5 }[k.shape];
    case "fact": return true;   // 觀念題：答案人工審（見 docs）
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
