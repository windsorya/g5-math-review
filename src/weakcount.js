// 「練待加強的」題數（交辦 #4027；錯題站設計書 g5-wrong-review/docs/app-weak-entry-design-20261019.md 第 2 節）。
// app.html 的單元題集（unitCards）與 weak-export.js 共用這一份：錯題站顯示的數字＝首頁「小考前想全部練一次」各單元
// 「練待加強的」實際會出的那一群（出題函式就是 core.js reviewPick(..., "weak", 今天)），不另寫第二份判定。
(function (root) {
  "use strict";
  // 一個單元的題（首頁小考複習、單元按鈕的母體）：今天的 poolCards、觀念開放、屬於這個單元
  function unitIds(C, BANK, state, day, unit) {
    return C.poolCards(state, BANK, day).filter(function (c) {
      return BANK.concepts[c.concept].unit === unit && C.conceptOn(state, BANK, c.concept);
    }).map(function (c) { return c.id; });
  }
  // 首頁所有單元的題（各單元互斥，依 UNITS 順序接起來）
  function homeIds(C, MB, BANK, state, day) {
    var ids = [];
    Object.keys(MB.UNITS).forEach(function (u) { ids = ids.concat(unitIds(C, BANK, state, day, u)); });
    return ids;
  }
  // 三群題：
  //   weakToday＝各單元按「練待加強的」今天會出的題（reviewPick 本身；今天練過的明天才出）
  //   weak＝做過、待加強、不是考不到的（首頁「待加強 N 題」＝reviewCounts.weak 同一條件），不管今天練過沒
  //   out＝考不到（kind:"out"）但仍待加強的；數學站沒有考古挑戰（kind:"challenge"），challenge 恆為 0
  function sets(C, MB, BANK, state, day) {
    var ids = homeIds(C, MB, BANK, state, day), today = [];
    Object.keys(MB.UNITS).forEach(function (u) { today = today.concat(C.reviewPick(state, BANK, unitIds(C, BANK, state, day, u), "weak", day)); });
    function pending(id) { var cs = C.cardState(state, id); return cs.seen > 0 && C.weakCard(cs); }
    return {
      weak: ids.filter(function (id) { return pending(id) && !C.isOut(BANK, id); }),
      weakToday: today,
      out: ids.filter(function (id) { return pending(id) && C.isOut(BANK, id); })
    };
  }
  // raw＝本機或雲端那份存檔原文；讀檔與 app 開頁同一支 decode（v3 讀成 v4、不合法就拒讀）。讀不懂一律 {ok:false}
  function summarize(C, MB, BANK, raw, nowMs) {
    try {
      if (typeof raw !== "string" || typeof nowMs !== "number" || !isFinite(nowMs)) return { ok: false };
      var d = C.decode(raw, BANK);
      if (!d.accepted) return { ok: false };
      var s = d.state, g = sets(C, MB, BANK, s, C.dayKey(nowMs)), seen = 0;
      Object.keys(s.cards).forEach(function (k) { seen += s.cards[k].seen; });
      return { ok: true, answers: s.log.length, seen: seen, weak: g.weak.length, weakToday: g.weakToday.length,
               challenge: 0, challengeToday: 0, out: g.out.length };
    } catch (e) { return { ok: false }; }
  }
  var api = { unitIds: unitIds, homeIds: homeIds, sets: sets, summarize: summarize };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.G5MathWeak = api;
})(typeof window !== "undefined" ? window : this);
