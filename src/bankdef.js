// 數學站的 BANK 組裝（交辦 #4027）：app.html 與 weak-export.js 共用同一份，錯題站看到的待加強題數和「練待加強的」用同一個題庫與停出名單。
// 原本寫在 app.html 內嵌腳本裡；搬來這裡一字不改語意：完整目錄（ALL_GENERATED）＋能排新卡的（CARDS）＋考不到的（kind:"out"）。
(function (root) {
  "use strict";
  // MB＝G5MathBank；retired＝外部停出名單（app 傳 window.G5_RETIRED，數學站目前沒有任何檔定義它）
  function build(MB, retired) {
    var cards = MB.ALL_GENERATED || MB.ALL_CARDS || MB.CARDS;   // 2026-10-18：完整目錄（裁掉的題仍查得到，她練過的照常複習；設計方案③）
    var active = {}; MB.CARDS.forEach(function (c) { active[c.id] = 1; });   // 能排成新卡的題
    // 考不到的題（範圍稽核 kind:"out"；#2997 拍板、#3010）：不排新卡、也不排到期複習、不進任何回合；核心讀 BANK.out。挑戰題（challenge）不在此列
    var out = {}, R = MB.RETIRED || retired || {};
    Object.keys(R).forEach(function (id) { if (R[id] && R[id].kind === "out") out[id] = 1; });
    var concepts = {};
    Object.keys(MB.CONCEPTS).forEach(function (k) { concepts[k] = { unit: MB.CONCEPTS[k].unit }; });
    return { cards: cards, active: active, out: out, concepts: concepts, figs: {} };
  }
  var api = { build: build };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.G5MathBankDef = api;
})(typeof window !== "undefined" ? window : this);
