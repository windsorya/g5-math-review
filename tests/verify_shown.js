// 題庫獨立驗算器（docs/design-verify-shown-codex-20261013.md 方案 A）。
// analyzeShown({ q, opts })：只看孩子看到的題文與選項（不收 chk、a、why、hint），用有限文法解析題意，
//   獨立判定每個選項真假，回傳 { kind, parsed, solution, truth, correctIndices, issues }。
// verifyCard(card)：先 analyzeShown，最後才比對 card.a（WRONG_KEY）與 chk（CHK_MISMATCH，只是核對資料）。
// 硬規則：不得 require 題庫（src/mathbank.js）或核心的任何計算函式；解析失敗一律拒絕，不退回 chk、不猜。
// 命令列（給 tests/e2e.py 的 A17 用）：echo '[{"q":..,"opts":[..]}]' | node tests/verify_shown.js ⇒ 每題的分析 JSON。
"use strict";
const FACT_KEY = require("./fact_key.js");

/* ===== 數值入口：題文／選項／chk 的轉型與整數算術只准在這一段（docs/design-verify-bigint-codex-20261013.md，#1346） =====
   根因（Codex 設計者）：同一數值有多套表示、各文法自行轉型，且「輸入安全」不代表「中間乘積安全」。
   契約：①所有字串→數值只走 big()；②BigInt→Number 只走 num()，超過安全整數一律 BAD_DATA，不給近似值；
   ③題文整數與 chk 數值限安全整數（int()／chkSafe()）；分數選項保留精確 BigInt（frac()，既有大分母選項契約）；
   ④整數算術一律 BigInt 中間值（add/sub/mul/div/mod/mulDiv），結果過 num() 才回 Number；
   ⑤文法區不得自行 Number()/parseInt/+x/BigInt()/* / % -（verify_shown.test.js「集中入口」掃描）。 */
class Bad extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }
const INT = /^(0|[1-9]\d*)$/;   // 嚴格數值：整串必須是數字，不截前綴、不刪字
const MIN_B = BigInt(Number.MIN_SAFE_INTEGER), MAX_B = BigInt(Number.MAX_SAFE_INTEGER);
// 唯一轉型入口：嚴格十進位字串／安全整數 Number／BigInt ⇒ BigInt；其他一律拒絕
function big(x) {
  if (typeof x === "bigint") return x;
  if (typeof x === "number") { if (!Number.isSafeInteger(x)) throw new Bad("BAD_DATA", "不是安全整數：" + x); return BigInt(x); }
  if (typeof x === "string") { if (!INT.test(x)) throw new Bad("OPT_PARSE", "不是整數：" + x); return BigInt(x); }
  throw new Bad("BAD_DATA", "不是數字：" + String(x));
}
// BigInt ⇒ Number 的唯一出口：範圍檢查通過才轉
const inSafe = (b) => b >= MIN_B && b <= MAX_B;
function num(b) { if (!inSafe(b)) throw new Bad("BAD_DATA", "超過安全整數：" + b); return Number(b); }
const int = (s) => num(big(s));   // 題文／選項的整數：限安全整數（Codex 審 6f1db21）
// 整數算術：BigInt 中間值，結果超過安全範圍就拒絕
const add = (a, b) => num(big(a) + big(b));
const sub = (a, b) => num(big(a) - big(b));
const mul = (a, b) => num(big(a) * big(b));
const nonzero = (d) => { const y = big(d); if (y === 0n) throw new Bad("BAD_DATA", "除以 0"); return y; };
const mod = (a, b) => { const y = nonzero(b); return num(big(a) % y); };
function div(a, b) { const y = nonzero(b), x = big(a); if (x % y !== 0n) throw new Bad("BAD_DATA", "不能整除：" + x + "÷" + y); return num(x / y); }
function mulDiv(a, b, c) { const y = nonzero(c), p = big(a) * big(b); if (p % y !== 0n) throw new Bad("BAD_DATA", "不能整除：" + p + "÷" + y); return num(p / y); }   // a×b÷c，乘積不先轉 Number（R3）
const cmp = (a, b) => { const x = big(a), y = big(b); return x > y ? 1 : x < y ? -1 : 0; };
const flip = (sgn, c) => (sgn > 0 ? c : -c);   // 依「最大／最小」翻轉比較結果，不用乘法
const absDiff = (a, b) => (cmp(a, b) >= 0 ? sub(a, b) : sub(b, a));
const sum = (xs) => xs.reduce((s, x) => add(s, x), 0);
// 有理數一律用 BigInt（Codex 審 0765694：99999999/100000000 與 100000000/100000001 交叉相乘超過浮點精度，被判成相等）
const GB = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const gcd = (a, b) => num(GB(big(a), big(b)));
const lcm = (a, b) => mulDiv(a, b, gcd(a, b));
// 精確整數平方根（BigInt 牛頓法）：⌊√n⌋，n 為非負安全整數
function isqrt(n) {
  const N = big(n); if (N < 0n) throw new Bad("BAD_DATA", "負數開根號");
  if (N < 2n) return num(N);
  let x = N, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + N / x) / 2n; }
  return num(x);
}
// 因數個數（Codex 審 c7d3d01：舊版迴圈以 mul(i,i) 為停止條件，n 接近最大安全整數時最後一步 i² 超出範圍而誤判 BAD_DATA，且 BigInt 逐一試除要 10 秒）：
// 上限用精確的 ⌊√n⌋，迴圈裡只做安全整數的 % 與 /（i ≤ √n、n 為安全整數，不會溢位、結果精確）
function countDivisors(n) {
  const v = num(big(n)); if (v < 1) throw new Bad("BAD_DATA");
  const r = isqrt(v); let c = 0;
  for (let i = 1; i <= r; i += 1) if (v % i === 0) c += v / i === i ? 1 : 2;   // 成對的因數 i 與 n÷i
  return c;
}
// 全部因數由小到大（「寫出全部因數／公因數」題用）：和 countDivisors 一樣只試到 ⌊√n⌋，成對收
function divisorList(n) {
  const v = num(big(n)); if (v < 1) throw new Bad("BAD_DATA");
  const r = isqrt(v), lo = [], hi = [];
  for (let i = 1; i <= r; i += 1) if (v % i === 0) { lo.push(i); if (v / i !== i) hi.unshift(v / i); }
  return lo.concat(hi);
}
const Q = (n, d) => { n = big(n); d = big(d); if (d === 0n) throw new Bad("BAD_DATA"); if (d < 0n) { n = -n; d = -d; } const g = GB(n, d) || 1n; return [n / g, d / g]; };
const qadd = (x, y) => Q(x[0] * y[1] + y[0] * x[1], x[1] * y[1]);
const qsub = (x, y) => Q(x[0] * y[1] - y[0] * x[1], x[1] * y[1]);
const qcmp = (x, y) => { const v = x[0] * y[1] - y[0] * x[1]; return v > 0n ? 1 : v < 0n ? -1 : 0; };   // 分母恆正
const qstr = (x) => x[1] === 1n ? String(x[0]) : x[0] + "/" + x[1];
const qlowest = (f) => GB(f[0], f[1]) === 1n;
const qint = (n) => Q(int(n), 1);
// 選項分數：保留精確 BigInt，不限安全範圍（Codex 審 c1c2ee1；既有大分母選項契約）
const frac = (s) => { const m = /^(−|-)?(0|[1-9]\d*)\/(0|[1-9]\d*)$/.exec(s); if (!m) throw new Bad("OPT_PARSE", "不是分數：" + s);
  if (m[3] === "0") throw new Bad("OPT_PARSE", "分母是 0：" + s); const n = big(m[2]); return { raw: [m[1] ? -n : n, big(m[3])] }; };
const fracQ = (s) => { const f = frac(s).raw; return Q(f[0], f[1]); };
// 題文分數：分子分母都限安全整數（R1、加減四欄）
const qfrac = (n, d) => { const a = int(n), b = int(d); if (b === 0) throw new Bad("BAD_DATA", "題目分母是 0"); return Q(a, b); };
// chk 入口：chk 只當核對資料，裡面的每個數都要是安全整數（不收 BigInt、浮點、超過範圍的數）
function chkSafe(v) {
  if (typeof v === "number") return Number.isSafeInteger(v);
  if (typeof v === "bigint") return false;
  if (v && typeof v === "object") return Object.keys(v).every((k) => chkSafe(v[k]));
  return true;
}
// 序列化集中處理：BigInt 在安全範圍內輸出數字，超過就輸出字串（不失真）
const bigToNum = (k, v) => (typeof v === "bigint" ? (inSafe(v) ? Number(v) : String(v)) : v);
// 2026-10-18 考古卷新題型用：中文十位（二～九）→ 數值；「a°、b°、c°」→ 三個整數
const tensOf = (ch) => { const i = "二三四五六七八九".indexOf(ch); if (i < 0) throw new Bad("BAD_DATA", "十位不認得：" + ch); return mul(10, add(i, 2)); };
const degList = (o) => { const t = o.split("、").map((s) => { const x = /^(\d+)°$/.exec(s); if (!x) throw new Bad("OPT_PARSE"); return int(x[1]); });
  if (t.length !== 3 || t.some((x) => !x)) throw new Bad("OPT_PARSE"); return t; };
/* ===== 數值入口結束 ===== */

const ncmp = cmp;
const FRAC_RE = "(\\d+)\\/(\\d+)";
// 選項：數字＋固定單位（單位要和題目一致；"6abc"、"6 個" 混在「條」題裡都不收）
const withUnit = (s, unit) => { const m = new RegExp("^(.+?)" + (unit ? " " + unit : "") + "$").exec(s); if (!m) throw new Bad("OPT_PARSE", "單位不對：" + s); return m[1]; };

/* ---------- 中文數字與多邊形名稱 ---------- */
const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function cnum(s) {
  if (s.length === 1 && CN[s]) return CN[s];   // 一～九
  const m = /^([二三四五六七八九])?(十)([一二三四五六七八九])?$/.exec(s);   // 十、十二、二十…
  if (!m) return null;
  return add(mul(m[1] ? CN[m[1]] : 1, 10), m[3] ? CN[m[3]] : 0);
}
function polygonSides(name) {   // 「三角形」「五邊形」「十二邊形」
  if (name === "三角形") return 3;
  const m = /^(.+)邊形$/.exec(name); const n = m && cnum(m[1]);
  return n && n >= 3 ? n : null;
}
function regularSides(name) {   // 「正三角形」「正方形」「正六邊形」
  if (name === "正方形") return 4;
  if (!/^正/.test(name)) return null;
  const n = polygonSides(name.slice(1));
  return n && n >= 3 ? n : null;
}
const angleSum = (n) => mul(sub(n, 2), 180);   // 多邊形內角和

/* ---------- 圖形模型：由性質推，名稱不能唯一決定就報歧義（不拿代表圖形） ---------- */
// 每個名稱涵蓋哪些「子類」，各子類的對稱軸數與是否正多邊形；括號裡的條件只能排除子類。
const SUB = {
  square: { axes: 4, regular: true }, rect: { axes: 2, regular: false }, rhomb: { axes: 2, regular: false },
  para: { axes: 0, regular: false }, equi: { axes: 3, regular: true }, isos: { axes: 1, regular: false }
};
const FAMILY = { 長方形: ["square", "rect"], 菱形: ["square", "rhomb"], 等腰三角形: ["equi", "isos"], 平行四邊形: ["square", "rect", "rhomb", "para"] };
// 條件 ⇒ 排除哪些子類（「兩腰一樣長」是等腰本來的意思，不排除任何東西）
const COND = {
  長和寬不一樣長: ["square"], 不是正方形: ["square"], 角不是直角: ["square", "rect"], 不是正三角形: ["equi"],
  底邊和腰不一樣長: ["equi"], 兩腰一樣長: [], 不是長方形: ["square", "rect"], 也不是菱形: ["square", "rhomb"], 不是菱形: ["square", "rhomb"]
};
function shapeInfo(name) {
  if (name === "圓" || name === "圓形") return { name, axes: Infinity, regular: false, ambiguous: false };
  const r = regularSides(name);
  if (r) return { name, axes: r, regular: true, ambiguous: false };
  let base = name, conds = [];
  const pre = /^(不是長方形)的(平行四邊形)$/.exec(name);   // 前置修飾：「不是長方形的平行四邊形」
  const gen = /^一般的(平行四邊形)（(.+)）$/.exec(name);
  const par = /^(長方形|菱形|等腰三角形|平行四邊形)(?:（(.+)）)?$/.exec(name);
  if (pre) { base = pre[2]; conds = [pre[1]]; }
  else if (gen) { base = gen[1]; conds = gen[2].split("、"); }
  else if (par) { base = par[1]; conds = par[2] ? par[2].split("、") : []; }
  else return null;
  let subs = FAMILY[base].slice();
  for (const c of conds) { if (!COND[c]) return null; subs = subs.filter((s) => !COND[c].includes(s)); }
  if (!subs.length) return null;
  const axes = [...new Set(subs.map((s) => SUB[s].axes))], reg = [...new Set(subs.map((s) => SUB[s].regular))];
  return { name, axes: axes.length === 1 ? axes[0] : null, regular: reg.length === 1 ? reg[0] : null, ambiguous: axes.length > 1 || reg.length > 1, subs };
}

/* ---------- 極值：回傳「所有」並列最大的位置（並列要報 TIE，不能取第一個） ---------- */
function extremeAll(vals, cmpFn) {
  if (!vals.length) return [];
  let best = vals[0];
  vals.forEach((v) => { if (cmpFn(v, best) > 0) best = v; });
  return vals.map((v, i) => (cmpFn(v, best) === 0 ? i : -1)).filter((i) => i >= 0);
}

/* ---------- 有限文法：每條規則 match(q) ⇒ parsed（或丟 Bad）；judge(parsed, opt) ⇒ 真假（或丟 Bad） ---------- */
const LINE_ASK = { "畫成折線圖後，最高的點在哪裡？": "max", "畫成折線圖後，最低的點在哪裡？": "min", "哪一段上升得最多？": "maxrise",
  "哪一段下降得最多？": "maxfall", "哪一段是下降的？": "down", "哪一段是上升的？": "up" };
function parseLine(q) {
  const m = /^([^：]+)：(.+)。([^。]+)$/.exec(q);
  if (!m || !LINE_ASK[m[3]]) return null;
  const pts = m[2].split("、").map((e) => /^((?:\d+ 時)|(?:第 \d+ (?:週|天|月|年)))\s(0|[1-9]\d*)\s(\S+)$/.exec(e));
  if (pts.some((p) => !p)) return null;
  const units = new Set(pts.map((p) => p[3])), labels = pts.map((p) => p[1]);
  if (units.size !== 1 || new Set(labels).size !== labels.length || pts.length < 3) throw new Bad("BAD_DATA", "折線資料不完整");
  return { kind: "line", title: m[1], ask: LINE_ASK[m[3]], labels, values: pts.map((p) => int(p[2])), unit: pts[0][3] };   // 超過安全整數 ⇒ BAD_DATA（R2）
}
function segOf(p, o) {
  const m = /^(.+) 到 (.+)$/.exec(o), i = m ? p.labels.indexOf(m[1]) : -1, j = m ? p.labels.indexOf(m[2]) : -1;
  if (i < 0 || j !== add(i, 1)) throw new Bad("OPT_PARSE", "不是相鄰的一段：" + o);
  return i;
}
const segName = (p, i) => p.labels[i] + " 到 " + p.labels[add(i, 1)];

const RULES = [
  { kind: "line", match: parseLine, judgeAll(p, opts, X) {
    const v = p.values, issues = [];
    if (p.ask === "max" || p.ask === "min") {
      const sgn = p.ask === "max" ? 1 : -1, top = X.extreme(v, (a, b) => flip(sgn, ncmp(a, b)));
      if (top.length > 1) issues.push("TIE");
      return { issues, solution: top.map((i) => p.labels[i]).join("、"), judge: (o) => { const i = p.labels.indexOf(o); if (i < 0) throw new Bad("OPT_PARSE"); return top.includes(i); } };
    }
    const d = v.slice(1).map((x, i) => sub(x, v[i]));
    if (p.ask === "maxrise" || p.ask === "maxfall") {
      const sgn = p.ask === "maxrise" ? 1 : -1, top = X.extreme(d, (a, b) => flip(sgn, ncmp(a, b))), real = top.filter((i) => flip(sgn, cmp(d[i], 0)) > 0);
      if (!real.length) issues.push(sgn > 0 ? "NO_RISE" : "NO_FALL");
      if (real.length > 1) issues.push("TIE");
      return { issues, solution: real.map((i) => segName(p, i)).join("、"), judge: (o) => real.includes(segOf(p, o)) };
    }
    return { issues, judge: (o) => { const i = segOf(p, o); return p.ask === "down" ? cmp(d[i], 0) < 0 : cmp(d[i], 0) > 0; } };
  } },
  { kind: "isfactor", match: (q) => { const m = /^下面哪一個(不?是) (\d+) 的因數？$/.exec(q); return m && { kind: "isfactor", n: int(m[2]), neg: m[1] === "不是" }; },
    judge: (p, o) => { const x = int(o); if (!p.n || !x) throw new Bad("BAD_DATA"); return (mod(p.n, x) === 0) !== p.neg; } },
  { kind: "nfactors", match: (q) => { const m = /^(\d+) 有幾個因數？$/.exec(q); return m && { kind: "nfactors", n: int(m[1]) }; },
    judgeAll: (p) => { if (!p.n) throw new Bad("BAD_DATA"); const c = countDivisors(p.n);
      return { solution: String(c), judge: (o) => int(o) === c }; } },
  { kind: "gcd", match: (q) => {
    let m = /^(\d+) 和 (\d+) 的最大公因數是多少？$/.exec(q);
    if (m) return { kind: "gcd", a: int(m[1]), b: int(m[2]), unit: "" };
    m = /^有 (\d+) 顆糖和 (\d+) 塊餅乾，要分成一樣的小袋，每袋的糖一樣多、餅乾也一樣多，都剛好分完。最多可以分成幾袋？$/.exec(q);
    return m && { kind: "gcd", a: int(m[1]), b: int(m[2]), unit: "袋", story: "分袋" }; },
    judgeAll: (p) => { if (!p.a || !p.b) throw new Bad("BAD_DATA"); const g = gcd(p.a, p.b);
      return { solution: String(g), judge: (o) => int(withUnit(o, p.unit)) === g }; } },
  { kind: "iscommonfactor", match: (q) => { const m = /^下面哪一個(不?是) (\d+) 和 (\d+) 的公因數？$/.exec(q); return m && { kind: "iscommonfactor", a: int(m[2]), b: int(m[3]), neg: m[1] === "不是" }; },
    judge: (p, o) => { const x = int(o); if (!x || !p.a || !p.b) throw new Bad("BAD_DATA"); return (mod(p.a, x) === 0 && mod(p.b, x) === 0) !== p.neg; } },
  // 2026-10-18 考古卷題型：選項是「、」分開的一組數，和全部因數（公因數）比集合，不看順序
  { kind: "allfactors", match: (q) => { const m = /^下面哪一組是 (\d+) 的全部因數？$/.exec(q); return m && { kind: "allfactors", n: int(m[1]) }; },
    judgeAll: (p) => { const f = divisorList(p.n); return { solution: f.join("、"), judge: (o) => same(sortedNums(intList(o)), f) }; } },
  { kind: "allcommon", match: (q) => { const m = /^下面哪一組是 (\d+) 和 (\d+) 的全部公因數？$/.exec(q); return m && { kind: "allcommon", a: int(m[1]), b: int(m[2]) }; },
    judgeAll: (p) => { if (!p.a || !p.b) throw new Bad("BAD_DATA"); const f = divisorList(gcd(p.a, p.b));
      return { solution: f.join("、"), judge: (o) => same(sortedNums(intList(o)), f) }; } },
  // 2026-10-18 考古卷題型（三份彰化 113 南一卷）：平分全部分完的所有可能＝全部因數；範圍內唯一的倍數；三角形三個角不可能的一組
  { kind: "sharefactors", match: (q) => { const m = /^把 (\d+) (顆|個|枝|張)(\S+?)分裝成若干包，每包一樣多，全部分完，每包可能裝幾(顆|個|枝|張)？下面哪一組是全部可能的答案？$/.exec(q);
      if (!m) return null; if (m[2] !== m[4]) throw new Bad("BAD_DATA", "單位前後不同"); return { kind: "sharefactors", n: int(m[1]) }; },
    judgeAll: (p) => { if (!p.n) throw new Bad("BAD_DATA"); const f = divisorList(p.n); return { solution: f.join("、"), judge: (o) => same(sortedNums(intList(o)), f) }; } },
  { kind: "rangemultiple", match: (q) => {
      const m = /^.+有([二三四五六七八九])十幾(顆|毫升|個|枝|張)，每 (\d+) \2(?:裝成|倒成) 1 (?:袋|杯|盒)，剛好(?:裝|倒)完。.+有幾\2？$/.exec(q); if (!m) return null;
      const lo = tensOf(m[1]), d = int(m[3]); if (!d) throw new Bad("BAD_DATA");
      const hit = []; for (let x = add(lo, 1); cmp(x, add(lo, 9)) <= 0; x = add(x, 1)) if (mod(x, d) === 0) hit.push(x);
      if (hit.length !== 1) throw new Bad("BAD_DATA", "範圍裡的倍數不是剛好一個"); return { kind: "rangemultiple", lo, d, unit: m[2], ans: hit[0] }; },
    judgeAll: (p) => ({ solution: String(p.ans), judge: (o) => int(withUnit(o, p.unit)) === p.ans }) },
  { kind: "trinot", match: (q) => q === "三角形的 3 個角，不可能是下面哪一組？" ? { kind: "trinot" } : null,
    judge: (p, o) => { const t = degList(o);
      return sum(t) !== 180; } },
  // 「a ÷ b ＝ c」先驗算式成立（不成立就拒絕整題），再逐句判「x 是 y 的因數／倍數」
  { kind: "relation", match: (q) => { const m = /^(\d+) ÷ (\d+) ＝ (\d+)，下面哪一句是對的？$/.exec(q); if (!m) return null;
      const a = int(m[1]), b = int(m[2]), c = int(m[3]);
      if (!b || mod(a, b) !== 0 || div(a, b) !== c) throw new Bad("BAD_DATA", "算式不成立"); return { kind: "relation", a, b, c }; },
    judge: (p, o) => { const m = /^(\d+) 是 (\d+) 的(因數|倍數)$/.exec(o); if (!m) throw new Bad("OPT_PARSE"); const x = int(m[1]), y = int(m[2]);
      if (!x || !y) throw new Bad("BAD_DATA"); return m[3] === "因數" ? mod(y, x) === 0 : mod(x, y) === 0; } },
  { kind: "divides", match: (q) => {
    if (q === "下面哪一個算式是「整除」？" || q === "下面哪一個算式是整除？") return { kind: "divides", neg: false };
    if (q === "下面哪一個算式不能整除？" || q === "下面哪一個算式不是「整除」？") return { kind: "divides", neg: true };
    return null; },
    judge: (p, o) => { const m = /^(\d+) ÷ (\d+)$/.exec(o); if (!m) throw new Bad("OPT_PARSE"); const x = int(m[1]), y = int(m[2]); if (!y) throw new Bad("OPT_PARSE", "除以 0");
      return (mod(x, y) === 0) !== p.neg; } },
  { kind: "multiple", match: (q) => {
    const m = /^下面哪一個(數)?(不是|同時是|是) (.+) 的倍數？$/.exec(q);
    if (!m) return null;
    let ns, mode;
    if (/^\d+$/.test(m[3])) { ns = [int(m[3])]; mode = "one"; if (m[2] === "同時是") return null; }
    else if (/^\d+ 和 \d+$/.test(m[3]) && m[2] === "同時是") { ns = m[3].split(" 和 ").map(int); mode = "and"; }
    else if (/^\d+ 或 \d+$/.test(m[3]) && m[2] !== "同時是") { ns = m[3].split(" 或 ").map(int); mode = "or"; }
    else return null;   // 「是 2 和 5 的倍數」（沒說同時）意思不明 ⇒ 不猜
    if (ns.some((n) => !n)) throw new Bad("BAD_DATA");
    return { kind: "multiple", ns, mode, neg: m[2] === "不是", phrase: m[2] + " " + m[3] + " 的倍數" }; },
    judge: (p, o) => { const x = int(o), hit = p.ns.map((n) => mod(x, n) === 0); const ok = p.mode === "or" ? hit.some(Boolean) : hit.every(Boolean); return ok !== p.neg; } },
  { kind: "lcm", match: (q) => {
    let m = /^(\d+) 和 (\d+) 的最小公倍數是多少？$/.exec(q);
    if (m) return { kind: "lcm", a: int(m[1]), b: int(m[2]), unit: "" };
    m = /^甲公車每 (\d+) 分鐘開一班，乙公車每 (\d+) 分鐘開一班。(\d+) 點兩班車同時開出，下一次同時開出是幾分鐘以後？$/.exec(q);
    return m && { kind: "lcm", a: int(m[1]), b: int(m[2]), unit: "分鐘", story: "公車", start: int(m[3]) }; },
    judgeAll: (p) => { if (!p.a || !p.b) throw new Bad("BAD_DATA"); const l = lcm(p.a, p.b);
      return { solution: String(l), judge: (o) => int(withUnit(o, p.unit)) === l }; } },
  { kind: "vertices", match: (q) => { const m = /^一個(.+)有幾個頂點？$/.exec(q); if (!m) return null; const n = polygonSides(m[1]); if (!n) throw new Bad("UNKNOWN_SHAPE"); return { kind: "vertices", shape: m[1], n }; },
    judgeAll: (p) => ({ solution: String(p.n), judge: (o) => int(withUnit(o, "個")) === p.n }) },
  { kind: "triok", match: (q) => { const m = /^下面哪一組三根吸管，(可以|不能)圍成三角形？$/.exec(q); return m && { kind: "triok", neg: m[1] === "不能" }; },
    judge: (p, o) => { const s = triSides(o); if (!s) throw new Bad("OPT_PARSE"); if (!s[0]) throw new Bad("OPT_PARSE"); return (cmp(add(s[0], s[1]), s[2]) > 0) !== p.neg; } },
  { kind: "third", match: (q) => { const m = /^三角形的兩條邊是 (\d+) 公分和 (\d+) 公分，第三條邊可能是幾公分？$/.exec(q); if (!m) return null;
      const a = int(m[1]), b = int(m[2]); if (!a || !b) throw new Bad("BAD_DATA"); return { kind: "third", a, b, lo: absDiff(a, b), hi: add(a, b) }; },
    judgeAll: (p) => ({ solution: p.lo + "<x<" + p.hi, judge: (o) => { const x = int(withUnit(o, "公分")); return cmp(x, p.lo) > 0 && cmp(x, p.hi) < 0; } }) },
  { kind: "anglesum", match: (q) => { const m = /^(.+)的內角和是幾度？$/.exec(q); if (!m) return null; const n = polygonSides(m[1]); if (!n) throw new Bad("UNKNOWN_SHAPE"); return { kind: "anglesum", n }; },
    judgeAll: (p) => { const s = angleSum(p.n); return { solution: String(s), judge: (o) => int(withUnit(o, "度")) === s }; } },
  { kind: "regangle", match: (q) => { const m = /^(正.+)的每一個角是幾度？$/.exec(q); if (!m) return null; const n = regularSides(m[1]); if (!n) throw new Bad("UNKNOWN_SHAPE"); return { kind: "regangle", n }; },
    judgeAll: (p) => { const r = Q(angleSum(p.n), p.n); return { solution: qstr(r), judge: (o) => qcmp(qint(withUnit(o, "度")), r) === 0 }; } },
  { kind: "missing", match: (q) => {
    const m = /^(.+?)有 (\d+) 個角是 (.+)，剩下那個角是幾度？$/.exec(q); if (!m) return null;
    const n = polygonSides(m[1]); if (!n) throw new Bad("UNKNOWN_SHAPE");
    const g = m[3].split("、").map((s) => { const x = /^(\d+) 度$/.exec(s); if (!x) throw new Bad("BAD_DATA"); return int(x[1]); });
    if (g.length !== int(m[2]) || g.length !== sub(n, 1) || g.some((x) => !x)) throw new Bad("BAD_DATA", "角的個數不對");
    const rest = sub(angleSum(n), sum(g));
    if (rest <= 0) throw new Bad("BAD_DATA", "已知角加起來超過內角和");
    // 小五範圍是凸多邊形：每個角都要大於 0、小於 180 度（Codex 審 0765694：400 度的角仍放行）
    if (g.concat([rest]).some((x) => x <= 0 || x >= 180)) throw new Bad("BAD_DATA", "有角不在 0～180 度之間");
    return { kind: "missing", n, g, rest }; },
    judgeAll: (p) => ({ solution: String(p.rest), judge: (o) => int(withUnit(o, "度")) === p.rest }) },
  { kind: "expand", match: (q) => { const m = new RegExp("^把 " + FRAC_RE + " 擴分成分母是 (\\d+) 的分數，分子是多少？$").exec(q); if (!m) return null;
      const n = int(m[1]), d = int(m[2]), M = int(m[3]); if (!d || !M || mod(M, d)) throw new Bad("BAD_DATA", "分母不能擴成 " + M);
      return { kind: "expand", n, d, m: M, numer: mulDiv(n, M, d) }; },   // n×M÷d 用 BigInt 中間值（R3）
    judgeAll: (p) => ({ solution: String(p.numer), judge: (o) => int(o) === p.numer }) },
  // 帶分數擴分：兩邊整數部分要一樣、分數部分要是真分數，□＝分子×新分母÷原分母
  { kind: "mixexpand", match: (q) => { const m = new RegExp("^(\\d+)又" + FRAC_RE + " ＝ (\\d+)又□\\/(\\d+)，□ 是多少？$").exec(q); if (!m) return null;
      const w = int(m[1]), n = int(m[2]), d = int(m[3]), M = int(m[5]);
      if (int(m[4]) !== w) throw new Bad("BAD_DATA", "兩邊的整數部分不一樣");
      if (!n || !d || !M || cmp(n, d) >= 0 || mod(M, d)) throw new Bad("BAD_DATA", "分數部分不是真分數或分母不能擴成 " + M);
      return { kind: "mixexpand", w, n, d, m: M, numer: mulDiv(n, M, d) }; },
    judgeAll: (p) => ({ solution: String(p.numer), judge: (o) => int(o) === p.numer }) },
  { kind: "allequiv", match: (q) => { const m = new RegExp("^下面哪一組分數，全部都和 " + FRAC_RE + " 一樣大？$").exec(q); return m && { kind: "allequiv", n: int(m[1]), d: int(m[2]), v: qfrac(m[1], m[2]) }; },
    judge: (p, o) => { const vs = o.split("、").map(fracQ); if (vs.length < 2) throw new Bad("OPT_PARSE", "不是一組分數"); return vs.every((v) => qcmp(v, p.v) === 0); } },
  { kind: "mixcompare", match: (q) => { const m = new RegExp("^(\\d+)又" + FRAC_RE + " ○ " + FRAC_RE + "，○ 裡要填 >、< 還是 =？$").exec(q); if (!m) return null;
      const w = int(m[1]), n = int(m[2]), d = int(m[3]); if (!n || !d || cmp(n, d) >= 0) throw new Bad("BAD_DATA", "帶分數的分數部分要是真分數");
      return { kind: "mixcompare", w, n, d, c: int(m[4]), e: int(m[5]), x: qadd(qint(w), qfrac(m[2], m[3])), y: qfrac(m[4], m[5]) }; },
    judgeAll: (p) => { const c = qcmp(p.x, p.y), s = c > 0 ? ">" : c < 0 ? "<" : "=";
      return { solution: s, judge: (o) => { if (![">", "<", "="].includes(o)) throw new Bad("OPT_PARSE"); return o === s; } }; } },
  { kind: "simplify", match: (q) => { const m = new RegExp("^把 " + FRAC_RE + " 約成最簡分數。$").exec(q); return m && { kind: "simplify", n: int(m[1]), d: int(m[2]), v: qfrac(m[1], m[2]) }; },
    judgeAll: (p) => ({ solution: qstr(p.v), judge: (o) => { const f = frac(o).raw; return qcmp(Q(f[0], f[1]), p.v) === 0 && qlowest(f); } }) },
  { kind: "equiv", match: (q) => { const m = new RegExp("^下面哪一個分數和 " + FRAC_RE + " 一樣大？$").exec(q); return m && { kind: "equiv", n: int(m[1]), d: int(m[2]), v: qfrac(m[1], m[2]) }; },
    judge: (p, o) => qcmp(fracQ(o), p.v) === 0 },
  { kind: "compare", match: (q) => { const m = new RegExp("^" + FRAC_RE + " ○ " + FRAC_RE + "，○ 裡要填 >、< 還是 =？$").exec(q); if (!m) return null;
      return { kind: "compare", a: int(m[1]), b: int(m[2]), c: int(m[3]), d: int(m[4]), x: qfrac(m[1], m[2]), y: qfrac(m[3], m[4]) }; },
    judgeAll: (p) => { const c = qcmp(p.x, p.y), s = c > 0 ? ">" : c < 0 ? "<" : "=";
      return { solution: s, judge: (o) => { if (![">", "<", "="].includes(o)) throw new Bad("OPT_PARSE"); return o === s; } }; } },
  { kind: "maxfrac", match: (q) => { const m = /^下面哪一個分數最(大|小)？$/.exec(q); return m && { kind: "maxfrac", ask: m[1] === "大" ? "max" : "min" }; },
    judgeOpts(p, opts, X) {
      const vals = opts.map(fracQ), sgn = p.ask === "max" ? 1 : -1;
      const top = X.extreme(vals, (a, b) => flip(sgn, qcmp(a, b)));
      return { issues: top.length > 1 ? ["TIE"] : [], solution: top.map((i) => opts[i]).join("、"), truth: opts.map((_, i) => top.includes(i)) };
    } },
  { kind: "axes", match: (q) => { const m = /^(.+)有幾條對稱軸？$/.exec(q); if (!m) return null; const s = shapeInfo(m[1]);
      if (!s) throw new Bad("UNKNOWN_SHAPE"); if (s.ambiguous) throw new Bad("AMBIGUOUS_SHAPE", m[1] + " 不能唯一決定對稱軸數"); return { kind: "axes", shape: m[1], axes: s.axes }; },
    judgeAll: (p) => ({ solution: p.axes === Infinity ? "無限多" : String(p.axes),
      judge: (o) => (o === "無限多條" ? Infinity : int(withUnit(o, "條"))) === p.axes }) },
  { kind: "addsub", match: parseAddSub, judgeAll: (p) => {
    const r = p.op === "+" ? qadd(p.X, p.Y) : qsub(p.X, p.Y), issues = r[0] < 0n && p.story ? ["NEGATIVE_RESULT"] : [];
    return { issues, solution: qstr(r), judge: (o) => { const f = frac(withUnit(o, p.unit)).raw; return qcmp(Q(f[0], f[1]), r) === 0 && (!p.lowest || qlowest(f)); } }; } }
];
// 「、」分開的一組整數（每個都走 int() 入口）
const intList = (o) => o.split("、").map(int);
// 吸管選項「a 公分、b 公分、c 公分」⇒ 由小到大的三個安全整數；格式不對回 null
function triSides(o) {
  const m = /^(\d+) 公分、(\d+) 公分、(\d+) 公分$/.exec(o);
  return m ? [m[1], m[2], m[3]].map(int).sort(cmp) : null;
}
// 分數加減：算式題（要求最簡）＋六個敘事模板（每個模板寫明「誰減誰」的角色，不取絕對值）
const F = FRAC_RE;
const STORIES = [
  { re: new RegExp("^一條緞帶長 " + F + " 公尺，用掉 " + F + " 公尺，還剩多少公尺？$"), op: "-", unit: "公尺", story: "原有－用掉" },
  { re: new RegExp("^媽媽買了 " + F + " 公斤的蘋果和 " + F + " 公斤的橘子，一共買了多少公斤？$"), op: "+", unit: "公斤", story: "合起來" },
  { re: new RegExp("^一壺水有 " + F + " 公升，倒出 " + F + " 公升，壺裡還有多少公升？$"), op: "-", unit: "公升", story: "原有－倒出" },
  { re: new RegExp("^小明上午讀了這本書的 " + F + "，下午讀了 " + F + "，一天共讀了這本書的幾分之幾？$"), op: "+", unit: "", story: "合起來" },
  { re: new RegExp("^一塊地的 " + F + " 種玉米，" + F + " 種番薯，種玉米的比種番薯的多幾分之幾塊地？$"), op: "-", unit: "塊地", story: "玉米－番薯" },
  { re: new RegExp("^哥哥喝了 " + F + " 杯牛奶，弟弟喝了 " + F + " 杯，哥哥比弟弟多喝幾杯？$"), op: "-", unit: "杯", story: "哥哥－弟弟" }
];
function parseAddSub(q) {
  let m = new RegExp("^" + F + " (＋|－) " + F + " ＝？(（寫成最簡分數）)?$").exec(q), op, unit = "", story = null, lowest, x, y;
  if (m) { x = [m[1], m[2]]; y = [m[4], m[5]]; op = m[3] === "＋" ? "+" : "-"; lowest = !!m[6]; }
  else {
    const s = STORIES.find((t) => t.re.test(q)); if (!s) return null;
    m = s.re.exec(q); x = [m[1], m[2]]; y = [m[3], m[4]]; op = s.op; unit = s.unit; story = s.story; lowest = false;
  }
  const a = int(x[0]), b = int(x[1]), c = int(y[0]), d = int(y[1]);   // 四欄都限安全整數（R1、加減四欄）；不再 +x 失真後和 chk 比
  const X = qfrac(x[0], x[1]), Y = qfrac(y[0], y[1]);
  return { kind: "addsub", op, x: x.join("/"), y: y.join("/"), X, Y, unit, lowest, story, a, b, c, d };
}

/* ---------- 觀念題：完整審定紀錄（題文＋全部選項＋各選項真假）；題文或選項不同 ⇒ 沒審過 ---------- */
function factLookup(q, opts) {
  const rec = FACT_KEY.RECORDS.find((r) => r.q === q);
  if (!rec) return null;
  const want = rec.opts.map((o) => o.text).sort(), got = opts.slice().sort();
  if (want.length !== got.length || want.some((t, i) => t !== got[i])) return { rec, mismatch: true };
  return { rec, truth: opts.map((o) => rec.opts.find((x) => x.text === o).ok) };
}

/* ---------- 對外介面 ---------- */
function makeVerifier(hooks) {
  hooks = hooks || {};
  const X = { extreme: hooks.extreme || extremeAll };
  function analyzeShown(shownCard) {
    const q = String(shownCard.q), opts = shownCard.opts.map(String);   // 只取 q、opts，其他欄位一律不看
    const out = { kind: null, parsed: null, solution: null, truth: opts.map(() => null), correctIndices: [], issues: [] };
    const addIssue = (c) => { if (!out.issues.includes(c)) out.issues.push(c); };
    const fact = factLookup(q, opts);
    if (fact) {
      out.kind = "fact"; out.parsed = { kind: "fact", record: fact.rec.id };
      if (fact.mismatch) { addIssue("UNREVIEWED"); return out; }
      out.truth = fact.truth;
    } else {
      let rule = null, parsed = null;
      try {
        for (const r of RULES) { parsed = r.match(q); if (parsed) { rule = r; break; } }
      } catch (e) { if (!(e instanceof Bad)) throw e; addIssue(e.code); out.kind = "error"; return out; }
      // 計算文法都不認得、答案鑰也沒有這個完整題文 ⇒ 不猜：既不是已知句型，也不是審過的觀念題
      if (!rule) { addIssue("UNKNOWN_PATTERN"); addIssue("UNREVIEWED"); return out; }
      out.kind = rule.kind; out.parsed = parsed;
      let res;
      try {
        if (rule.judgeOpts) res = rule.judgeOpts(parsed, opts, X);
        else if (rule.judgeAll) res = rule.judgeAll(parsed, opts, X);
        else res = { judge: (o) => rule.judge(parsed, o) };
      } catch (e) { if (!(e instanceof Bad)) throw e; addIssue(e.code); return out; }
      (res.issues || []).forEach(addIssue);
      if (res.solution !== undefined) out.solution = res.solution;
      if (res.truth) out.truth = res.truth;
      else out.truth = opts.map((o) => { try { return !!res.judge(o); } catch (e) { if (!(e instanceof Bad)) throw e; addIssue(e.code === "BAD_DATA" ? "BAD_DATA" : "OPT_PARSE"); return false; } });
    }
    out.correctIndices = out.truth.map((t, i) => (t === true ? i : -1)).filter((i) => i >= 0);
    if (!out.correctIndices.length) addIssue("NO_CORRECT");
    if (out.correctIndices.length > 1) addIssue("MULTI_CORRECT");
    return out;
  }
  // 最後才看 a：正解不在 a ⇒ WRONG_KEY。fact 的判定另有 hook（突變自檢 A04 用）
  // （零個、多個正解已在 analyzeShown 報 NO_CORRECT／MULTI_CORRECT；這裡只管 a 有沒有指到成立的選項）
  function defaultVerdict(an, c) { return an.correctIndices.length && !an.correctIndices.includes(c.a) ? ["WRONG_KEY"] : []; }
  const factVerdict = hooks.factVerdict || defaultVerdict;
  function verifyCard(c) {
    const an = analyzeShown({ q: c.q, opts: c.opts });   // analyzeShown 只驗 q／opts；chk 另在下面驗（答案獨立性）
    const issues = an.issues.slice();
    const verdict = an.kind === "fact" && !an.issues.length ? factVerdict(an, c) : defaultVerdict(an, c);
    verdict.forEach((x) => { if (!issues.includes(x)) issues.push(x); });
    if (!(Number.isInteger(c.a) && c.a >= 0 && c.a < c.opts.length) && !issues.includes("WRONG_KEY")) issues.push("WRONG_KEY");
    if (!chkSafe(c.chk)) issues.push("CHK_BAD_DATA");   // chk 入口：數值超過安全範圍就不拿來核對
    else if (!chkAgrees(c, an)) issues.push("CHK_MISMATCH");
    return { ok: issues.length === 0, issues, analysis: an };
  }
  return { analyzeShown, verifyCard };
}

/* ---------- chk 只當核對資料：題文解析出的欄位與 chk 對得上才算一致 ---------- */
const same = (x, y) => JSON.stringify(x, bigToNum) === JSON.stringify(y, bigToNum);
const sortedNums = (arr) => arr.slice().sort(cmp);
function chkAgrees(c, an) {
  try { return chkAgreesRaw(c, an); } catch (e) { if (!(e instanceof Bad)) throw e; return false; }   // 選項或 chk 解析不了 ⇒ 對不上
}
function chkAgreesRaw(c, an) {
  const k = c.chk, p = an.parsed;
  if (!k || !p) return true;   // 解析失敗已經拒絕；這時比 chk 沒有意義
  const unit = (u) => String(u || "").trim();
  switch (k.k) {
    case "fact": return p.kind === "fact";
    case "argmax": return p.kind === "line" && p.ask === "max" && same(p.values, k.v) && same(p.labels, k.lab);
    case "maxrise": return p.kind === "line" && p.ask === "maxrise" && same(p.values, k.v) && same(p.labels, k.lab);
    case "firstdown": return p.kind === "line" && p.ask === "down" && same(p.values, k.v) && same(p.labels, k.lab);
    case "isfactor": return p.kind === "isfactor" && p.n === k.n;
    case "nfactors": return p.kind === "nfactors" && p.n === k.n;
    case "gcd": return p.kind === "gcd" && p.a === k.a && p.b === k.b && p.unit === unit(k.unit);
    case "iscommonfactor": return p.kind === "iscommonfactor" && p.a === k.a && p.b === k.b;
    case "divides": return p.kind === "divides" && c.opts.includes(k.n + " ÷ " + k.d);
    case "ismultiple": return p.kind === "multiple" && p.mode === "one" && same(p.ns, [k.n]);
    case "rule": return p.kind === "multiple" && p.phrase === k.which && same(sortedNums(c.opts.map(int)), sortedNums(k.v));
    case "lcm": return p.kind === "lcm" && p.a === k.a && p.b === k.b && p.unit === unit(k.unit);
    case "vertices": return p.kind === "vertices" && p.n === k.n;
    case "triok": { const sides = c.opts.map(triSides); if (sides.some((s) => !s)) return false;
      return p.kind === "triok" && same(sides.map((s) => s.join(",")).sort(), k.sets.map((t) => sortedNums(t).join(",")).sort()); }
    case "third": return p.kind === "third" && p.a === k.a && p.b === k.b;
    case "anglesum": return p.kind === "anglesum" && p.n === k.n;
    case "regangle": return p.kind === "regangle" && p.n === k.n;
    case "missing": return p.kind === "missing" && p.n === k.n && same(p.g, k.g);
    case "expand": return p.kind === "expand" && p.n === k.n && p.d === k.d && p.m === k.m;
    case "simplify": return p.kind === "simplify" && p.n === k.n && p.d === k.d;
    case "equiv": return p.kind === "equiv" && p.n === k.n && p.d === k.d;
    case "compare": return p.kind === "compare" && p.a === k.a && p.b === k.b && p.c === k.c && p.d === k.d;
    case "maxfrac": return p.kind === "maxfrac" && p.ask === "max" && same(c.opts.slice().sort(), k.fs.map((f) => f[0] + "/" + f[1]).sort());
    case "allfactors": return p.kind === "allfactors" && p.n === k.n;
    case "allcommon": return p.kind === "allcommon" && p.a === k.a && p.b === k.b;
    case "sharefactors": return p.kind === "sharefactors" && p.n === k.n;
    case "rangemultiple": return p.kind === "rangemultiple" && p.lo === tensOf(String(k.tens).replace(/十$/, "")) && p.d === k.d && p.unit === k.unit;
    case "trinot": { let sets; try { sets = c.opts.map((o) => degList(o).join(",")).sort(); } catch (e) { return false; }
      return p.kind === "trinot" && same(sets, k.sets.map((t) => t.join(",")).sort()); }
    case "relation": return p.kind === "relation" && p.a === k.a && p.b === k.b;
    case "mixexpand": return p.kind === "mixexpand" && p.w === k.w && p.n === k.n && p.d === k.d && p.m === k.m;
    case "allequiv": return p.kind === "allequiv" && p.n === k.n && p.d === k.d;
    case "mixcompare": return p.kind === "mixcompare" && p.w === k.w && p.n === k.n && p.d === k.d && p.c === k.c && p.e === k.e;
    case "axes": return p.kind === "axes" && p.shape === k.shape;
    case "addsub": return p.kind === "addsub" && p.a === k.a && p.b === k.b && p.c === k.c && p.d === k.d && p.op === k.op && p.unit === unit(k.unit);
    default: return false;
  }
}

const api = Object.assign(makeVerifier(), { makeVerifier, shapeInfo, extremeAll, add, sub, mul, div, mod, mulDiv, toJSON: bigToNum });
module.exports = api;

if (require.main === module) {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => { buf += d; });
  process.stdin.on("end", () => {
    const items = JSON.parse(buf);
    process.stdout.write(JSON.stringify(items.map((it) => api.analyzeShown({ q: it.q, opts: it.opts })), bigToNum));
  });
}
