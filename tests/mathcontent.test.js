// 題庫「內容」檢查（Codex 2026-10-13 審查 e6c7ed67 的內容類 FAIL）：錯法解說、幾何條件、折線陡峭、出口題不重複。
// 執行：node --test tests/mathcontent.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../src/mathbank.js");
const X = require("../src/mathexplain.js");
const VIDEOS = require("../src/mathvideos.js");

// ⓪ 2026-10-19 範圍稽核（孩子反映太難）：五上只教列舉法找公因數、只教「兩邊和大於第三邊」。
// 短除法／互質是六年級（108 課綱 N-6-2）；「兩邊的差」學校教學重點 13 沒有。題目、提示、補救圖解、影片說明都不得出現。
test("⓪範圍：題卡、提示、補救圖解、影片說明不得出現短除法、互質、兩邊的差", () => {
  const SIX = /短除|互質|兩邊的差|要比 \d+－\d+＝\d+ 長/;   // 最後一條：用「差」講第三邊範圍的算式寫法
  const texts = [];
  B.ALL_GENERATED.forEach((c) => texts.push([c.id, [c.q, c.hint, c.why].concat(c.opts || [], c.wrongWhy || []).join("｜")]));
  Object.keys(X.EXPLAIN).forEach((k) => X.EXPLAIN[k].forEach((w, i) =>
    texts.push([k + "/說法" + (i + 1), [w.name, w.task, w.ask].concat(w.lines || []).join("｜") + (typeof w.svg === "function" ? w.svg() : "")])));
  Object.keys(VIDEOS).forEach((k) => (VIDEOS[k] || []).forEach((v) => texts.push([k + "/影片 " + v.id, v.title + "｜" + v.note])));
  assert.deepEqual(texts.filter(([, t]) => SIX.test(t)).map(([id]) => id), []);
});

test("⓪停出：c0mix、c5mix、f5all 不當新卡出，但留在 ALL_GENERATED 讓練過的照常複習", () => {
  ["c0mix", "c5mix", "f5all"].forEach((id) => {
    assert.ok(!B.CARDS.some((c) => c.id === id), id + " 仍會當新卡出");
    assert.ok(B.ALL_GENERATED.some((c) => c.id === id), id + " 從題庫目錄消失（練過的會複習不到）");
  });
});

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
      // 子集也算（Codex 審 0995e02：出口題 6、9 的最小公倍數 vs 練習「每 9／6 分鐘、7 點」多一個 7 就漏判）
      const sub = (small, big) => { const bb = big.split(","); return small.split(",").every((x) => { const i = bb.indexOf(x); if (i < 0) return false; bb.splice(i, 1); return true; }); };
      const sameNums = et && et.split(",").length >= 2 && unitOf(c.concept) === unitOf(k) &&
        (sub(et, toks(c.q)) || c.opts.some((o) => sub(et, toks(c.q + " " + o))));
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
  // Codex 審 0995e02 的反例：練習題多一個數字（7 點）仍是同一組數字
  assert.equal(exitDups({ "2b": { exit: "6 和 9 的最小公倍數是多少？" } }, [{ id: "m3wp", concept: "2b", q: "甲車每 9 分鐘、乙車每 6 分鐘發一班，7 點同時發車，下一次同時發車是幾點幾分？", opts: [] }]).length, 1);
});

// ⑥ 題目文字與驗算資料（chk）一致（Codex 審 0995e02：驗算只讀 chk，把 g2up 題面 15 改回 14、chk 不動，93 項全過）
const CN = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10, "正方形": 4, "長方形": 4 };
function shownNums(c) {
  let s = String(c.q + " " + (c.opts || []).join(" ")).replace(/<[^>]*>/g, " ");
  Object.keys(CN).forEach((k) => { s = s.split(k).join(" " + CN[k] + " "); });
  return (s.match(/\d+/g) || []).map(Number);
}
function chkNums(o, out) {
  if (typeof o === "number") out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => chkNums(x, out));
  else if (o && typeof o === "object") Object.keys(o).forEach((k) => { if (k !== "k") chkNums(o[k], out); });
  return out;
}
function textMismatch(c) {
  if (!c.chk) return [];
  const bad = [], seenN = shownNums(c);
  chkNums(c.chk, []).forEach((n) => { if (!seenN.includes(n)) bad.push(c.id + "：chk 的 " + n + " 不在題目或選項裡"); });
  // 折線類：題面要逐點寫「標籤 數值」，成對才算一致
  if (Array.isArray(c.chk.lab) && Array.isArray(c.chk.v)) c.chk.lab.forEach((l, i) => {
    if (!String(c.q).includes(l + " " + c.chk.v[i])) bad.push(c.id + "：題面沒有「" + l + " " + c.chk.v[i] + "」");
  });
  return bad;
}
test("⑥題目文字與驗算資料一致：chk 的數字都在題目或選項裡、折線類逐點成對", () => {
  assert.deepEqual(B.CARDS.map(textMismatch).flat(), []);
});
test("⑥-b 自檢：只改題面數字、chk 不動，要抓到", () => {
  const g = JSON.parse(JSON.stringify(B.ALL_GENERATED.find((c) => c.id === "g2up")));
  g.q = g.q.replace("第 10 天 15 公分", "第 10 天 14 公分");
  assert.ok(textMismatch(g).length, "g2up 題面改成 14 公分應該要抓到");
});

// ⑦ 名稱不能唯一決定圖形時，問「是不是／有幾條」要先排除特例（Codex 審 0995e02：先猜題 5a 只說長方形，正方形的對角線就是對稱軸）
function shapeAmbiguity(items) {
  return items.filter((x) => /長方形/.test(x.q) && /對稱軸|對角線|正多邊形/.test(x.q) && !/長和寬不一樣長|不是正方形/.test(x.q)).map((x) => x.id + "：" + x.q)
    // 平行四邊形 0 條：要同時排除長方形（2 或 4 條）和菱形（2 或 4 條）；只排除長方形不夠，菱形不是長方形卻有 2 條
    .concat(items.filter((x) => /平行四邊形）?\s*0\s*條/.test(x.q) && !(/不是長方形/.test(x.q) && /(也)?不是菱形/.test(x.q))).map((x) => x.id + "（平行四邊形可能是長方形或菱形）：" + x.q));
}
const VID = require("../src/mathvideos.js");
// 影片說明也是孩子看得到的字（Codex 審 a053220：5a 影片說明寫「長方形2條」，正方形也是長方形、有 4 條）
const allQs = () => B.CARDS.map((c) => ({ id: c.id, q: c.q })).concat(Object.keys(X.PREDICT || {}).map((k) => ({ id: "先猜 " + k, q: X.PREDICT[k].q })),
  ...Object.keys(VID).map((k) => (VID[k] || []).map((v, i) => ({ id: "影片 " + k + "-" + i, q: String(v.note || "") }))));
test("⑦題卡與先猜題問長方形的對稱軸／對角線時要排除正方形", () => {
  assert.deepEqual(shapeAmbiguity(allQs()), []);
});
test("⑦-b 自檢：「長方形的對角線是不是對稱軸？」要抓到", () => {
  assert.equal(shapeAmbiguity([{ id: "x", q: "先猜猜看：長方形的對角線是不是對稱軸？" }]).length, 1);
  assert.equal(shapeAmbiguity([{ id: "v", q: "對稱軸：正方形4條。長方形2條、平行四邊形0條。" }]).length, 2);
  // 菱形不是長方形卻有 2 條：只排除長方形的舊說法要抓到；同時排除長方形與菱形的新說法不誤判
  assert.equal(shapeAmbiguity([{ id: "舊", q: "不是長方形的平行四邊形0條。" }]).length, 1);
  assert.equal(shapeAmbiguity([{ id: "新", q: "一般的平行四邊形（不是長方形、也不是菱形）0條。" }]).length, 0);
  assert.equal(shapeAmbiguity([{ id: "只寫一般", q: "一般的平行四邊形0條。" }]).length, 1);
});

// ⑧ 全部因數題（2026-10-18 新題型；Codex 審 ad46572）：「兩個數碰在一起就停」只對平方數成立（64：8×8），
//    40 是 5×8 之後變 8×5、永遠不相等 ⇒ 停止條件必須對每一個數都成立；解說列的成對也要和獨立算出來的一樣
// Codex 複審 089fd23：只比關鍵字會放過「右邊的數超過左邊的數就停」（1×40 就停）⇒ 改成兩段，不靠關鍵字：
//   (a) 提示必須逐字等於核准句（六題同一句，換任何字都紅）；(b) 測試自己照核准句的規則模擬，證明它對每個數都找得齊成對
const HINT = (n) => "從 1 開始成對找：1×" + n + "、2×…，左邊的數追上右邊的數就停。";
// 核准句的規則：左邊 a 從 1 往上，右邊＝n÷a；左邊「追上」右邊（a ≥ n÷a）就停——追上時若剛好相等（平方數），那一對也算
function pairsByApprovedRule(n) {
  const out = [];
  for (let a = 1; ; a++) {
    if (n % a) { if (a * a >= n) break; continue; }
    const b = n / a;
    if (a > b) break;   // 平方數在 a＝b 那一對收進來後，下一個因數一定 a＞b，在這裡停
    out.push(a + "×" + b);
  }
  return out;
}
function factorHintBad(c) {
  const n = c.chk.n, pairs = [];
  for (let a = 1; a <= n; a++) if (n % a === 0 && a <= n / a) pairs.push(a + "×" + n / a);   // 獨立算：所有 a≤b 的成對
  const bad = [];
  if (!String(c.why).includes("成對找：" + pairs.join("、") + "。")) bad.push(c.id + "：解說的成對不是 " + pairs.join("、"));
  if (c.hint !== HINT(n)) bad.push(c.id + "：提示不是核准句：" + c.hint);
  if (pairsByApprovedRule(n).join("、") !== pairs.join("、")) bad.push(c.id + "：照核准句的規則找不齊：" + pairsByApprovedRule(n).join("、"));
  return bad;
}
test("⑧全部因數題：提示＝核准句、照核准句的規則找得齊成對、解說的成對正確", () => {
  const cards = B.ALL_GENERATED.filter((c) => c.chk.k === "allfactors");   // 產生的全部（出題只取 3 題，見 mathbank FAMILY_MAX）
  assert.ok(cards.length >= 6);
  assert.deepEqual(cards.map(factorHintBad).flat(), []);
  // 核准句的規則本身：平方數與非平方數、質數、1 都要對（不只題庫裡那六個數）
  [1, 2, 7, 12, 16, 36, 40, 49, 60, 64, 75, 97, 100].forEach((n) => {
    const all = []; for (let a = 1; a <= n; a++) if (n % a === 0 && a <= n / a) all.push(a + "×" + n / a);
    assert.equal(pairsByApprovedRule(n).join("、"), all.join("、"), n + " 照規則找不齊");
  });
});
// ⑨ 重複題（律師 2026-10-11 自然站判準：換句話說、正反對調、另一題的一部分、換例子同答案＝重複；反過來問、不同數值不算）
//    10-18 律師問「是否與原有題庫有重複題目？」：20／30、30／45 的最大公因數就是全部公因數的一部分、5/6 那組含擴分題的答案 15/18 ⇒ 換數字並鎖住
const pairKey = (a, b) => [a, b].sort((x, y) => x - y).join(",");
function dupProblems(cards) {
  const bad = [], by = (k) => cards.filter((c) => c.chk.k === k);
  const gcdPairs = new Set(by("gcd").concat(by("iscommonfactor")).map((c) => pairKey(c.chk.a, c.chk.b)));
  by("allcommon").forEach((c) => { if (gcdPairs.has(pairKey(c.chk.a, c.chk.b))) bad.push(c.id + "：和最大公因數／公因數題同一對數"); });
  const nSet = new Set(by("nfactors").concat(by("isfactor")).map((c) => c.chk.n));
  by("allfactors").forEach((c) => { if (nSet.has(c.chk.n)) bad.push(c.id + "：和因數個數／因數題同一個數"); });
  const answered = new Set(by("expand").map((c) => (c.chk.n * c.chk.m / c.chk.d) + "/" + c.chk.m).concat(by("equiv").map((c) => c.opts[c.a])));
  by("allequiv").forEach((c) => c.opts[c.a].split("、").forEach((f) => { if (answered.has(f)) bad.push(c.id + "：正解那組含 " + f + "（另一題的答案）"); }));
  ["allfactors", "allcommon", "allequiv", "relation"].forEach((k) => {
    const seen = {}; by(k).forEach((c) => { const a = c.opts[c.a]; if (seen[a]) bad.push(c.id + "：和 " + seen[a] + " 換例子同答案「" + a + "」"); seen[a] = c.id; });
  });
  return bad;
}
test("⑨新題型不和原題庫重複（另一題的一部分、換例子同答案）", () => {
  assert.deepEqual(dupProblems(B.CARDS), []);
  assert.deepEqual(dupProblems(B.ALL_GENERATED), [], "被裁的變體日後放回也不得重複");
});
test("⑨-b 自檢：放回 10-18 那三題（20/30、30/45、5/6）一定抓到", () => {
  const cards = JSON.parse(JSON.stringify(B.ALL_GENERATED));
  const f0 = cards.find((c) => c.id === "f0com"); f0.chk.a = 20; f0.chk.b = 30;
  const f2 = cards.find((c) => c.id === "f2com"); f2.chk.a = 30; f2.chk.b = 45;
  const q2 = cards.find((c) => c.id === "q2all"); q2.opts[q2.a] = "10/12、15/18、20/24";
  const bad = dupProblems(cards);
  assert.ok(bad.some((x) => x.startsWith("f0com")) && bad.some((x) => x.startsWith("f2com")) && bad.some((x) => x.startsWith("q2all")), bad.join("｜"));
});
test("⑧-b 自檢：改過的提示一律抓到（40、64 都試）；核准句兩個都過", () => {
  const forN = (n) => B.ALL_GENERATED.find((c) => c.chk.k === "allfactors" && c.chk.n === n);
  ["兩個數碰在一起就停。", "右邊的數超過左邊的數就停。", "找到一個就停。"].forEach((tail) => [40, 64].forEach((n) => {
    assert.ok(factorHintBad({ ...forN(n), hint: "從 1 開始成對找：1×" + n + "、2×…，" + tail }).length > 0, n + "：" + tail);
  }));
  [40, 64].forEach((n) => assert.deepEqual(factorHintBad({ ...forN(n), hint: HINT(n) }), [], n + " 核准句"));
});
