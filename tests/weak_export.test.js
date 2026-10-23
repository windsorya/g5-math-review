// weak-export.js（錯題站讀數學站待加強題數，交辦 #4027）。執行：node --test tests/weak_export.test.js（先 python3 build.py）
// 權威規格：g5-wrong-review/docs/app-weak-entry-design-20261019.md 第 2 節。存檔全部是合成資料（不含任何真實姓名或真實存檔）。
// 對照組（oracle）不經 src/weakcount.js：照 app.html 原本的 unitCards＋reviewCounts／reviewPick 寫法直接呼叫 core.js，
// 驗 export 的 weak 集合＝各單元按「練待加強的」實際會出的那一群。
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const C = require("../src/core.js");
const MB = require("../src/mathbank.js");
const BD = require("../src/bankdef.js");
const W = require("../src/weakcount.js");

const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "weak-export.js"), "utf8");
const BANK = BD.build(MB);
const TODAY = "2026-10-24";
const NOW = Date.parse(TODAY + "T12:00:00+08:00");
const FIELDS = ["answers", "seen", "weak", "weakToday", "challenge", "challengeToday", "out"];

// 在 node:vm 裡照瀏覽器 classic script 的方式載入；window 就是全域物件。記錄 localStorage 與連網的任何呼叫
function load(opt) {
  opt = opt || {};
  const calls = [], got = [];
  const rec = (name) => function () { calls.push(name); return null; };
  const ctx = {
    localStorage: { getItem: rec("getItem"), setItem: rec("setItem"), removeItem: rec("removeItem"), clear: rec("clear"), key: rec("key") },
    fetch: rec("fetch"), XMLHttpRequest: function () { calls.push("XMLHttpRequest"); },
    navigator: { sendBeacon: rec("sendBeacon") }, setTimeout: rec("setTimeout"), setInterval: rec("setInterval")
  };
  if (!opt.noRegister) ctx.G5WeakExportRegister = function (o) { got.push(o); };
  ctx.window = ctx;
  vm.createContext(ctx);
  const before = new Map(Object.getOwnPropertyNames(ctx).map((k) => [k, ctx[k]]));
  vm.runInContext(SRC, ctx, { filename: "weak-export.js" });
  const syncCount = got.length;   // 執行期間（同步）呼叫了幾次
  return { ctx, got, calls, before, syncCount };
}
// vm 裡產生的物件原型屬於另一個 realm：比對前先轉成本 realm 的普通物件
const plain = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const RAW_EXP = load().got[0];
const EXP = { api: RAW_EXP.api, key: RAW_EXP.key, links: plain(RAW_EXP.links), summarize: (raw, now) => plain(RAW_EXP.summarize(raw, now)) };

/* ---------- 合成存檔 ---------- */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const PAST = ["2026-10-14", "2026-10-16", "2026-10-18", "2026-10-20", "2026-10-22", "2026-10-23"];
function blankDay() { return { planIds: [], doneIds: [], touched: [], extraDone: false, labRuns: 0, teach: 0, mood: null }; }
function logOf(id, d, ok, i) { const c = C.cardById(C.blankState(), BANK, id); return { op: "op" + i, d, card: id, c: c.concept, ok, hint: false, unsure: false, variation: false, first: true }; }
// cards：{id: [seen, goodDays, needsRecheck]}；touched：今天練過的
function state(cards, touched, extra) {
  const s = C.blankState();
  let i = 0;
  Object.keys(cards).forEach((id) => {
    const [seen, good, recheck] = cards[id];
    s.cards[id] = { seen, goodDays: good || [], blockedDay: null, due: seen ? "2026-10-25" : null };
    if (recheck) s.cards[id].needsRecheck = true;
    for (let k = 0; k < seen; k++) s.log.push(logOf(id, PAST[k % PAST.length], k > 0, i++));
  });
  s.days[TODAY] = blankDay();
  s.days[TODAY].touched = (touched || []).slice();
  if (extra) s.extra = extra;
  return s;
}
function randomState(seed) {
  const r = rng(seed), ids = BANK.cards.map((c) => c.id), cards = {}, touched = [];
  const n = 1 + Math.floor(r() * 60);
  for (let k = 0; k < n; k++) {
    const id = ids[Math.floor(r() * ids.length)];
    if (cards[id]) continue;
    const seen = Math.floor(r() * 4);
    const good = seen ? PAST.filter(() => r() < 0.25).slice(0, Math.floor(r() * 3)) : [];
    cards[id] = [seen, good, seen > 0 && good.length > 0 && r() < 0.3];
    if (seen && r() < 0.35) touched.push(id);
  }
  const s = state(cards, touched);
  s.settings.unit3 = r() < 0.5;
  return s;
}
// 對照組：app.html 原本的 unitCards（#4027 之前一字不改的條件）與首頁 rvButtons 讀的 reviewCounts／按鈕出的 reviewPick
function oracle(s, bank, day, pickDay) {
  let weak = 0, weakNow = 0, served = [];
  Object.keys(MB.UNITS).forEach((u) => {
    const ids = C.poolCards(s, bank, day).filter((c) => MB.CONCEPTS[c.concept].unit === u && C.conceptOn(s, bank, c.concept)).map((c) => c.id);
    const st = C.reviewCounts(s, bank, ids, day);
    weak += st.weak; weakNow += st.weakNow;
    served = served.concat(C.reviewPick(s, bank, ids, "weak", pickDay || day));
  });
  return { weak, weakNow, served };
}
const sorted = (a) => a.slice().sort();
function okSummary(x) {   // 錯題站 src/appweak.js okSummary 同一條件
  return !!x && x.ok === true && FIELDS.every((f) => Number.isInteger(x[f]) && x[f] >= 0) && x.weakToday <= x.weak && x.challengeToday <= x.challenge;
}

test("BANK 組裝搬到 bankdef.js 後與 app 原本的寫法逐欄相同", () => {
  const ACTIVE = {}; MB.CARDS.forEach((c) => { ACTIVE[c.id] = 1; });
  const concepts = {}; Object.keys(MB.CONCEPTS).forEach((k) => { concepts[k] = { unit: MB.CONCEPTS[k].unit }; });
  assert.deepEqual(BANK, { cards: MB.ALL_GENERATED || MB.ALL_CARDS || MB.CARDS, active: ACTIVE, out: {}, concepts, figs: {} });
  assert.deepEqual(BD.build(MB, { a: { kind: "out" }, b: { kind: "challenge" }, c: 1 }).out, { a: 1 });
});

test("weak-export.js 是 build 從同一份 src 產生（題庫、core、bankdef、weakcount 原文都在裡面）", () => {
  ["src/mathbank.js", "src/core.js", "src/bankdef.js", "src/weakcount.js"].forEach((rel) => {
    const js = fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\n+$/, "");
    assert.ok(SRC.includes(js), rel + " 不在 weak-export.js 裡（忘了重跑 build.py？）");
  });
  assert.ok(!/^\s*(import|export)\s/m.test(SRC), "必須是 classic script");
});

test("⑥ 註冊：執行期間同步呼叫一次；介面符合；不新增或改任何全域、不碰 localStorage、不連網", () => {
  const L = load();
  assert.equal(L.syncCount, 1);
  assert.equal(L.got.length, 1);
  const e = L.got[0];
  assert.equal(e.api, 1);
  assert.equal(e.key, "g5math.v2");
  assert.equal(typeof e.summarize, "function");
  assert.deepEqual(plain(e.links), { weak: null, challenge: null });
  for (let k = 0; k < 20; k++) e.summarize(JSON.stringify(randomState(k)), NOW + k * 86400000);
  e.summarize("壞掉", NOW);
  assert.deepEqual(L.calls, []);
  assert.deepEqual(Object.getOwnPropertyNames(L.ctx).sort(), [...L.before.keys()].sort());
  L.before.forEach((v, k) => assert.equal(L.ctx[k], v, "全域 " + k + " 被換掉"));
  ["G5Core", "G5MathBank", "G5MathBankDef", "G5MathWeak", "module"].forEach((k) => assert.ok(!(k in L.ctx), k + " 漏到全域"));
  // 不是被錯題站載入（沒有註冊函式）：什麼都不做
  const N = load({ noRegister: true });
  assert.equal(N.got.length, 0);
  assert.deepEqual(N.calls, []);
  assert.deepEqual(Object.getOwnPropertyNames(N.ctx).sort(), [...N.before.keys()].sort());
});

test("① 300 份隨機合成存檔：weak／weakToday 與首頁「練待加強的」出題集合逐題相同、與 export 一致", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const s = randomState(seed), raw = JSON.stringify(s);
    assert.ok(C.decode(raw, BANK).accepted, "合成存檔要合法 seed=" + seed);
    const o = oracle(s, BANK, TODAY), g = W.sets(C, MB, BANK, C.decode(raw, BANK).state, TODAY);
    // weakToday＝今天按「練待加強的」會出的題（逐題）
    assert.deepEqual(sorted(g.weakToday), sorted(o.served), "seed=" + seed);
    // weak＝不管今天練過沒：用沒有練習紀錄的那一天問同一支出題函式
    assert.deepEqual(sorted(g.weak), sorted(oracle(s, BANK, TODAY, "2000-01-01").served), "seed=" + seed);
    const sum = EXP.summarize(raw, NOW);
    assert.equal(sum.weak, o.weak, "首頁待加強 N 題 seed=" + seed);
    assert.equal(sum.weakToday, o.weakNow, "首頁練待加強的按鈕題數 seed=" + seed);
    assert.equal(sum.answers, s.log.length);
    assert.equal(sum.seen, Object.values(s.cards).reduce((a, c) => a + c.seen, 0));
    assert.deepEqual(sum, W.summarize(C, MB, BANK, raw, NOW));
  }
});

test("① 單元題集：app.html 改用 weakcount.unitIds 後與原本 unitCards 條件相同", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const s = randomState(seed);
    Object.keys(MB.UNITS).forEach((u) => {
      const old = C.poolCards(s, BANK, TODAY).filter((c) => MB.CONCEPTS[c.concept].unit === u && C.conceptOn(s, BANK, c.concept)).map((c) => c.id);
      assert.deepEqual(W.unitIds(C, BANK, s, TODAY, u), old);
    });
  }
});

const ids = MB.CARDS.map((c) => c.id);
const [A, B, X, Y, G] = [ids[0], ids[7], ids[20], ids[40], ids[60]];

test("② 考不到（kind:out）不進 weak，另算在 out；數學站沒有考古挑戰，challenge 恆為 0", () => {
  const bankOut = BD.build(MB, { [X]: { kind: "out" } });
  const s = state({ [A]: [1, []], [X]: [2, []], [G]: [3, PAST.slice(0, 2)] }), raw = JSON.stringify(s);
  const r = W.summarize(C, MB, bankOut, raw, NOW);
  assert.deepEqual(r, { ok: true, answers: 6, seen: 6, weak: 1, weakToday: 1, challenge: 0, challengeToday: 0, out: 1 });
  assert.ok(!oracle(s, bankOut, TODAY).served.includes(X), "考不到的題本來就不會被「練待加強的」出");
  assert.deepEqual(W.sets(C, MB, bankOut, s, TODAY).weak, [A]);
  // 真正上線的題庫沒有 out：同一份存檔 X 算待加強
  assert.deepEqual(EXP.summarize(raw, NOW), { ok: true, answers: 6, seen: 6, weak: 2, weakToday: 2, challenge: 0, challengeToday: 0, out: 0 });
});

test("③ 今天練過的不算 weakToday（明天才出）；學會的、沒做過的不算待加強", () => {
  // A 答錯過（沒有答對日）、B 需重新確認、X 答對兩天＝學會、Y 沒做過；A、B 今天練過 A
  const s = state({ [A]: [2, []], [B]: [2, ["2026-10-20"], true], [X]: [2, ["2026-10-18", "2026-10-22"]], [Y]: [0, []] }, [A]);
  const raw = JSON.stringify(s);
  assert.deepEqual(EXP.summarize(raw, NOW), { ok: true, answers: 6, seen: 6, weak: 2, weakToday: 1, challenge: 0, challengeToday: 0, out: 0 });
  assert.deepEqual(oracle(s, BANK, TODAY).served, [B]);
  // 隔天：今天的 touched 已是昨天，兩題都能練
  const next = EXP.summarize(raw, NOW + 86400000);
  assert.equal(next.weak, 2); assert.equal(next.weakToday, 2);
  // 台北日界線：10/24 23:59 仍算今天，10/25 00:00 才是明天
  assert.equal(EXP.summarize(raw, Date.parse("2026-10-24T23:59:00+08:00")).weakToday, 1);
  assert.equal(EXP.summarize(raw, Date.parse("2026-10-25T00:00:00+08:00")).weakToday, 2);
});

test("③ 家長匯入題（extra）、v3 舊存檔照 app 的讀檔規則", () => {
  const extra = [{ id: "zz-extra", concept: "2a", type: "choice", q: "合成題", opts: ["甲", "乙"], a: 0 }];
  const s = state({ [A]: [1, []] }, [], extra);
  s.cards["zz-extra"] = { seen: 1, goodDays: [], blockedDay: null, due: null };
  const r = EXP.summarize(JSON.stringify(s), NOW);
  assert.equal(r.weak, oracle(s, BANK, TODAY).weak); assert.equal(r.weak, 2);
  const v3 = Object.assign({}, state({ [A]: [1, []] }), { v: 3 });
  assert.equal(EXP.summarize(JSON.stringify(v3), NOW).weak, 1);
});

test("④ 讀不懂一律 {ok:false}，不丟例外", () => {
  const good = JSON.stringify(state({ [A]: [1, []] }));
  const bad = ["", "x", "null", "{}", "[]", "1", '"s"', good.slice(0, -1),
    JSON.stringify(Object.assign(state({}), { v: 5 })), JSON.stringify(Object.assign(state({}), { log: "x" })),
    JSON.stringify(Object.assign(state({}), { cards: { [A]: { seen: -1, goodDays: [], blockedDay: null, due: null } } }))];
  bad.forEach((raw) => assert.deepEqual(EXP.summarize(raw, NOW), { ok: false }, JSON.stringify(raw).slice(0, 40)));
  [null, undefined, 123, {}, []].forEach((raw) => assert.deepEqual(EXP.summarize(raw, NOW), { ok: false }));
  [NaN, Infinity, undefined, "1", null].forEach((now) => assert.deepEqual(EXP.summarize(good, now), { ok: false }));
});

test("⑤ 300 份隨機存檔：七欄都是非負整數、weakToday≤weak、challengeToday≤challenge；同一份重算結果相同", () => {
  for (let seed = 1000; seed < 1300; seed++) {
    const raw = JSON.stringify(randomState(seed)), r = EXP.summarize(raw, NOW + (seed % 5) * 86400000);
    assert.ok(okSummary(r), JSON.stringify(r));
    assert.deepEqual(Object.keys(r).sort(), ["ok"].concat(FIELDS).sort());
    assert.deepEqual(EXP.summarize(raw, NOW + (seed % 5) * 86400000), r);
  }
});

// 錯題站自己的驗證程式（同層有 g5-wrong-review 才跑；CI 單站時略過）
const WRONG = path.join(ROOT, "..", "g5-wrong-review", "src", "appweak.js");
test("錯題站 appweak.js 的 okExport／okSummary／links 收下這份 export", { skip: !fs.existsSync(WRONG) && "沒有同層 g5-wrong-review" }, () => {
  const AW = require(WRONG), subj = AW.SUBJECTS.find((x) => x.key === "g5math.v2");
  assert.ok(AW.okExport(EXP, subj.key));
  assert.deepEqual(AW.links(EXP, subj), { weak: null, challenge: null });
  const snap = AW.snapshot(EXP, subj);
  for (let seed = 1; seed <= 50; seed++) {
    const raw = JSON.stringify(randomState(seed));
    assert.ok(AW.okSummary(EXP.summarize(raw, NOW)));
    const row = AW.resolve(subj, { exp: snap, local: { raw }, cloud: "nocode" }, NOW);
    assert.equal(row.state, "ok"); assert.equal(row.sum.weak, oracle(JSON.parse(raw), BANK, TODAY).weak);
  }
  assert.equal(AW.resolve(subj, { exp: snap, local: { raw: "壞掉" }, cloud: "nocode" }, NOW).why, "量不到：數學站的紀錄讀不懂");
});
