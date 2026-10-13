// 題庫「內容」檢查（Codex 2026-10-13 審查 e6c7ed67 的內容類 FAIL）：錯法解說、幾何條件、折線陡峭、出口題不重複。
// 執行：node --test tests/mathcontent.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../src/mathbank.js");
const X = require("../src/mathexplain.js");

const MAX_SENTENCE = 40;   // 小五每句上限（與 tests/standard.test.js 相同）
const sentences = (t) => String(t).split(/[。！？；]/).map((s) => s.trim()).filter(Boolean);
const numOf = (s) => { const m = /(\d+(?:\.\d+)?)/.exec(String(s)); return m ? +m[1] : NaN; };

// ① 分袋／最多幾份類：非整數選項的解說不得說「可以分」；說「可以分」的選項必須真的能同時整除兩個數量
test("①分袋類：非整數袋數不得說「可以分」，說可以分的必須真的整除", () => {
  const bad = [];
  B.CARDS.filter((c) => /分成|分給|幾袋|幾份|幾組|幾盒/.test(c.q) && c.chk.k === "gcd").forEach((c) => {
    c.opts.forEach((o, i) => {
      if (i === c.a) return;
      const v = numOf(o), w = String(c.wrongWhy[i] || "");
      const says = /可以分|能分|分得完|剛好分完/.test(w) && !/不(可以|能)|分不完|不會剛好/.test(w);
      if (!Number.isInteger(v) && says) bad.push(c.id + "「" + o + "」不是整數卻說：" + w);
      if (says && Number.isInteger(v) && (c.chk.a % v || c.chk.b % v)) bad.push(c.id + "「" + o + "」不能整除卻說：" + w);
    });
  });
  assert.deepEqual(bad, []);
});

// ② 每個錯誤選項都要有解說（app.html 遇空字串就不顯示「你選的……」），每句 ≤40 字
test("②每題每個錯誤選項都有 wrongWhy（非空字串、每句 ≤40 字）", () => {
  const missing = [], long = [];
  B.CARDS.forEach((c) => {
    assert.equal(c.wrongWhy.length, c.opts.length, c.id + " wrongWhy 長度和選項數不同");
    c.opts.forEach((o, i) => {
      if (i === c.a) return;
      const w = c.wrongWhy[i];
      if (typeof w !== "string" || !w.trim()) missing.push(c.id + "「" + o + "」");
      else sentences(w).forEach((s) => { if (s.length > MAX_SENTENCE) long.push(c.id + "：" + s); });
    });
  });
  assert.deepEqual(missing, [], "缺 wrongWhy " + missing.length + " 個");
  assert.deepEqual(long, []);
});

// ②-b 錯法解說裡寫出的整數算式要算得對（例如「108×5＝540」）：抓整串「A○B○C＝D」（先乘除後加減）逐一驗；
//      分數（帶 /）與「＝ 8 餘 2」這種有餘數的除法不在此驗（分數由上面 expected() 另驗）
function evalChain(s) {
  const t = s.replace(/\s+/g, "").split(/([×＋－÷])/);
  const md = [+t[0]];
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i], v = +t[i + 1];
    if (op === "×") md.push(md.pop() * v); else if (op === "÷") md.push(md.pop() / v); else { md.push(op); md.push(v); }
  }
  let r = md[0];
  for (let i = 1; i < md.length; i += 2) r = md[i] === "＋" ? r + md[i + 1] : r - md[i + 1];
  return r;
}
test("②-b 錯法解說和正解說明裡的整數算式都算得對", () => {
  const bad = [];
  B.CARDS.forEach((c) => c.wrongWhy.concat([c.why]).forEach((w) => {
    const re = /(?<![\d/])(\d+(?:\s*[×＋－÷]\s*\d+)+)\s*＝\s*(\d+)(?![\d/]|\s*餘)/g; let m;
    while ((m = re.exec(String(w)))) if (!/\d\/|\/\d/.test(m[1]) && evalChain(m[1]) !== +m[2]) bad.push(c.id + "：" + m[0]);
  }));
  assert.deepEqual(bad, []);
});
test("②-b 算式檢查器自檢：錯的算式一定抓得到", () => {
  assert.equal(evalChain("180－50－70"), 60);
  assert.equal(evalChain("4×180"), 720);
  assert.equal(evalChain("2＋3×4"), 14);
  assert.notEqual(evalChain("108×5"), 545);
});

// ③ 幾何條件：「等腰三角形」若沒排除正三角形，對稱軸不只一種答案；解說不得說「菱形都不是正多邊形」
test("③等腰三角形的題目必須排除正三角形（否則對稱軸可能是 3 條）", () => {
  const bad = B.CARDS.filter((c) => /等腰三角形/.test(c.q) && !/不是正三角形|底邊和腰不一樣長|底邊比腰|三邊不一樣/.test(c.q)).map((c) => c.id + "：" + c.q);
  const exBad = [];
  // 說明的圖與文字：凡提到「等腰三角形」（後面沒有括號條件），都視為沒排除正三角形
  Object.keys(X.EXPLAIN).forEach((k) => X.EXPLAIN[k].forEach((ex) => {
    [ex.svg().replace(/<[^>]+>/g, "｜")].concat(ex.lines, [ex.task, ex.ask]).forEach((s) => {
      if (/等腰三角形(?!（[^）]*(不是正三角形|底邊和腰不一樣長))/.test(s)) exBad.push(k + "「" + ex.name + "」：" + s.slice(0, 60));
    });
  }));
  assert.deepEqual(bad.concat(exBad), []);
});

test("③解說不得說「菱形（都）不是正多邊形」（正方形也是菱形，而且是正多邊形）", () => {
  const texts = [];
  Object.keys(X.EXPLAIN).forEach((k) => X.EXPLAIN[k].forEach((ex) => texts.push([k + "「" + ex.name + "」", ex.lines.join("。") + "。" + ex.task + "。" + ex.ask + "。" + ex.svg().replace(/<[^>]+>/g, "。")])));
  Object.keys(X.PREDICT || {}).forEach((k) => texts.push([k + " 先猜", X.PREDICT[k].q + "。" + X.PREDICT[k].why]));
  B.CARDS.forEach((c) => texts.push([c.id, [c.q, c.why].concat(c.wrongWhy).join("。")]));
  Object.keys(B.CONCEPTS).forEach((k) => texts.push([k + " 出口題", B.CONCEPTS[k].exit + "。" + B.CONCEPTS[k].exitAns]));
  const bad = [];
  texts.forEach(([who, t]) => sentences(t.replace(/[，、]/g, "，")).forEach((s) => {
    // 句子同時提到菱形和「不是正多邊形／✗」，卻沒有限定「不一定」「角不是直角」「角不一樣大」
    if (/菱形/.test(s) && /((?<!是)不是正多邊形|✗)/.test(s) && !/不一定|角不是直角|角不一樣大|角不一定|不是正方形|就不是|還不夠/.test(s)) bad.push(who + "：" + s);
  }));
  assert.deepEqual(bad, []);
});

// ④ 折線陡峭：題目資料要等時間間隔；說「最陡＝差最大」的解說必須寫明「每段時間間隔一樣」
test("④折線題資料每段時間間隔一樣，「最陡＝差最大」的解說都寫明等間隔", () => {
  const bad = [];
  B.CARDS.filter((c) => c.chk.lab).forEach((c) => {
    const t = c.chk.lab.map(numOf), gaps = t.slice(1).map((x, i) => x - t[i]);
    if (gaps.some((g) => !(g > 0) || g !== gaps[0])) bad.push(c.id + " 時間間隔不一樣：" + c.chk.lab.join("、"));
  });
  const texts = B.CARDS.filter((c) => c.concept === "1a").map((c) => [c.id, [c.q, c.why, c.hint].concat(c.wrongWhy).join("。")]);
  (X.EXPLAIN["1a"] || []).forEach((ex) => texts.push(["說明「" + ex.name + "」", ex.lines.join("。") + "。" + ex.svg().replace(/<[^>]+>/g, "。")]));
  if (X.PREDICT && X.PREDICT["1a"]) texts.push(["先猜 1a", X.PREDICT["1a"].q + "。" + X.PREDICT["1a"].why]);
  texts.forEach(([who, t]) => {
    // 「陡」與「差／變化／增加」連在一起講的段落，整段要提到等間隔
    if (/陡/.test(t) && /(差|變化|增加|上升)/.test(t) && !/(間隔|每段時間)一樣|間隔相同|一樣的時間/.test(t)) bad.push(who + " 說陡＝差大，但沒限定等間隔");
  });
  assert.deepEqual(bad, []);
});

// ④-b 反例自檢：時間間隔不一樣時，「增加最多」和「最陡」可以不是同一段——(0,0)、(1,10)、(11,30)
test("④-b 反例：不等間隔時增加最多的段不一定最陡（說明為何要限定等間隔）", () => {
  const p = [[0, 0], [1, 10], [11, 30]];
  const rise = p.slice(1).map((q, i) => q[1] - p[i][1]), slope = p.slice(1).map((q, i) => (q[1] - p[i][1]) / (q[0] - p[i][0]));
  assert.equal(rise.indexOf(Math.max(...rise)), 1);
  assert.equal(slope.indexOf(Math.max(...slope)), 0);
});

// ⑤ 出口題（app.html 宣稱「這些題目在練習裡沒出現過」）不得和任何練習題同題
const norm = (s) => String(s).replace(/^(說說看|算算看|先猜猜看|是非題)[：:]?/, "").replace(/[^一-鿿\d/]/g, "");
const toks = (s) => (String(s).match(/\d+\/\d+|\d+/g) || []).sort().join(",");
// 孩子在練習時看得到的題目：題庫卡片＋說明裡的「先猜猜看」＋例題（跟著做／換你問）
const seen = B.CARDS.concat(
  Object.keys(X.PREDICT || {}).map((k) => ({ id: "先猜 " + k, concept: k, q: X.PREDICT[k].q, opts: X.PREDICT[k].opts })),
  ...Object.keys(X.EXPLAIN).map((k) => X.EXPLAIN[k].flatMap((ex, i) => [ex.task, ex.ask].map((q, j) => ({ id: "說明 " + k + "-" + i + (j ? "問" : "做"), concept: k, q: q.replace(/^跟著[^：]*：/, ""), opts: [] })))));
const unitOf = (k) => (B.CONCEPTS[k] || {}).unit;
function exitDups(concepts, cards) {
  const out = [];
  Object.keys(concepts).forEach((k) => {
    const e = concepts[k].exit, en = norm(e), et = toks(e);
    cards.forEach((c) => {
      const qn = norm(c.q.replace(/[？?].*$/, ""));
      const sameText = qn.length >= 4 && (en.includes(qn) || qn.includes(en));
      // 同一單元裡數字組一樣（例如 4b 出口題 vs 4a 練習都用 2/3、3/4）就算同題
      const sameNums = et && unitOf(c.concept) === unitOf(k) && (toks(c.q) === et || c.opts.some((o) => toks(c.q + " " + o) === et));
      if (sameText || sameNums) out.push(k + " 出口題「" + e + "」＝" + c.id + "「" + c.q + "」");
    });
  });
  return out;
}
test("⑤出口題不和任何練習題、先猜題、說明例題同題（正規化後比文字、比數字組）", () => {
  assert.deepEqual(exitDups(B.CONCEPTS, seen), []);
});
test("⑤-b 比對器自檢：已知重複（1/2＋1/3、約分 18/24、長方形對稱軸、六邊形內角和、3/4/8 吸管）一定抓得到", () => {
  const fake = { "6a": { exit: "算算看：1/2 ＋ 1/3 ＝？" }, "4a": { exit: "把 18/24 約成最簡分數" }, "5a": { exit: "長方形有幾條對稱軸？在紙上畫出來。" },
    "3c": { exit: "六邊形的內角和是幾度？說說你怎麼算的。" }, "3b": { exit: "3 公分、4 公分、8 公分的三根吸管，能不能圍成三角形？" } };
  const cards = [{ id: "x1", concept: "6a", q: "1/2 ＋ 1/3 ＝？（寫成最簡分數）", opts: [] }, { id: "x2", concept: "4a", q: "把 18/24 約成最簡分數。", opts: [] },
    { id: "x3", concept: "5a", q: "長方形有幾條對稱軸？", opts: [] }, { id: "x4", concept: "3c", q: "六邊形的內角和是幾度？", opts: [] },
    { id: "x5", concept: "3b", q: "下面哪一組三根吸管，可以圍成三角形？", opts: ["2 公分、3 公分、6 公分", "3 公分、4 公分、8 公分"] }];
  assert.equal(exitDups(fake, cards).length, 5);
});
