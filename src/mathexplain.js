// 五上數學：每個觀念兩種說法（說法一＋圖、換個說法），以及「跟著算一題」的先猜猜看題目。
// 圖都由程式依數值計算座標（長條、折線、多邊形、對稱軸），不手填座標；文字一句一個重點，給小五自己讀。
(function (root) {
  "use strict";
  function wrap(w, h, label, inner) { return '<svg class="fig" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + label + '">' + inner + "</svg>"; }
  function t(x, y, s, o) { o = o || {}; return '<text x="' + x + '" y="' + y + '" font-size="' + (o.fs || 17) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : "") + ' fill="' + (o.fill || "var(--ink)") + '">' + s + "</text>"; }
  function board(lines, bg) {
    var h = 34 + lines.length * 40;
    return wrap(690, h, lines.join("；"), '<rect width="690" height="' + h + '" rx="14" fill="' + (bg || "var(--sun-soft)") + '"/>' + lines.map(function (s, i) { return t(28, 44 + i * 40, s); }).join(""));
  }
  // 分數長條：n/d，切 d 格塗 n 格
  function bar(x, y, w, h, n, d, color, label) {
    var s = "", cw = w / d;
    for (var i = 0; i < d; i++) s += '<rect x="' + (x + i * cw).toFixed(1) + '" y="' + y + '" width="' + cw.toFixed(1) + '" height="' + h + '" fill="' + (i < n ? color : "var(--card)") + '" stroke="var(--ink)" stroke-width="1.5"/>';
    return s + (label ? t(x + w + 12, y + h / 2 + 6, label) : "");
  }
  // 正多邊形頂點
  function poly(cx, cy, r, n, rot) { var p = []; for (var i = 0; i < n; i++) { var a = (rot || -90) * Math.PI / 180 + i * 2 * Math.PI / n; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return p; }
  function pts(p) { return p.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" "); }

  var EXPLAIN = {
    "1a": [
      { name: "看圖：折線圖看「怎麼變化」", svg: function () {
          var v = [21, 24, 29, 28, 25], lab = ["8時", "10時", "12時", "14時", "16時"], x0 = 90, x1 = 620, y0 = 230, y1 = 40, lo = 18, hi = 31;
          var X = function (i) { return x0 + (x1 - x0) * i / (v.length - 1); }, Y = function (k) { return y0 - (y0 - y1) * (k - lo) / (hi - lo); };
          var s = '<rect width="690" height="290" rx="14" fill="var(--pri-soft)"/><line x1="' + x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y0 + '" stroke="var(--ink)" stroke-width="2"/><line x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '" stroke="var(--ink)" stroke-width="2"/>';
          s += '<path d="M' + (x0 - 8) + " " + (y0 - 10) + " l8 -5 l8 5 l8 -5" + '" fill="none" stroke="var(--ink)" stroke-width="2"/>' + t(x0 - 14, y0 - 4, "0", { anchor: "end", fs: 14 });
          [20, 25, 30].forEach(function (k) { s += '<line x1="' + (x0 - 5) + '" y1="' + Y(k).toFixed(1) + '" x2="' + x1 + '" y2="' + Y(k).toFixed(1) + '" stroke="var(--line)" stroke-dasharray="4 4"/>' + t(x0 - 10, Y(k) + 5, k, { anchor: "end", fs: 14 }); });
          s += '<polyline points="' + v.map(function (k, i) { return X(i).toFixed(1) + "," + Y(k).toFixed(1); }).join(" ") + '" fill="none" stroke="var(--sun)" stroke-width="4"/>';
          v.forEach(function (k, i) { s += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(k).toFixed(1) + '" r="6" fill="var(--sun)"/>' + t(X(i), y0 + 24, lab[i], { anchor: "middle", fs: 14 }); });
          s += t((X(1) + X(2)) / 2 + 14, Y(25.5) + 26, "←這段最陡＝變化最大", { fs: 15 }) + t(x0 + 6, 30, "氣溫（度）", { fs: 14 });
          return wrap(690, 290, "某天氣溫的折線圖：10 時到 12 時這段最陡，上升最多；縱軸 0 上面有波浪線表示省略", s);
        },
        lines: ["折線圖把每個點用線連起來，看得出數量隨時間上升或下降。", "每段時間間隔一樣時，線愈陡，變化愈大；線往下，表示減少。", "縱軸用不到的那一段，可以畫波浪線（≈）省略。"],
        task: "跟著看：從表格找出每一段變了多少，再對到圖上哪一段最陡。", ask: "哪一段線最陡？表示什麼？" },
      { name: "換個說法：先算每一段差多少", svg: function () { return board(["8時→10時：24－21＝＋3", "10時→12時：29－24＝＋5（最多）", "12時→14時：28－29＝－1（下降）", "每段時間間隔一樣，差最大的那段就最陡"]); },
        lines: ["把相鄰兩個時間的數量相減，正的是上升、負的是下降。", "每段時間間隔一樣時，差最大的那一段，線最陡。", "長條圖比較「各種東西有多少」，折線圖看「隨時間怎麼變」。"],
        task: "跟著算：把每一段的差寫出來，圈出最大的。", ask: "如果要畫「全班喜歡的水果」，用長條圖還是折線圖？" }
    ],
    "2a": [
      { name: "看圖：因數是能排成長方形的邊", svg: function () {
          var s = '<rect width="690" height="250" rx="14" fill="var(--leaf-soft)"/>', pairs = [[1, 12], [2, 6], [3, 4]], x = 30;
          pairs.forEach(function (p) {
            var c = 14, w = p[1] * c, h = p[0] * c;
            for (var i = 0; i < p[0]; i++) for (var j = 0; j < p[1]; j++) s += '<rect x="' + (x + j * c) + '" y="' + (60 + i * c) + '" width="' + (c - 2) + '" height="' + (c - 2) + '" fill="var(--leaf)"/>';
            s += t(x + w / 2, 60 + h + 26, p[0] + " × " + p[1] + " ＝ 12", { anchor: "middle", fs: 16 });
            x += w + 50;
          });
          return wrap(690, 250, "12 個方塊排成長方形：1×12、2×6、3×4，所以 12 的因數是 1、2、3、4、6、12", s + t(30, 36, "12 個方塊能排成的長方形：", { fs: 17 }) + t(30, 228, "12 的因數：1、2、3、4、6、12（成對出現）", { fs: 17 }));
        },
        lines: ["能把 12 整除的數，就是 12 的因數。", "因數會成對出現：1×12、2×6、3×4。", "兩個數共同的因數叫公因數，最大的那個叫最大公因數。"],
        task: "跟著找：成對寫出 18 的因數，再圈出和 12 一樣的。", ask: "12 和 18 共同的因數有哪些？最大的是幾？" },
      { name: "換個說法：用短除法找最大公因數", svg: function () { return board(["24 和 36：一起除以 2 → 12、18", "再一起除以 2 → 6、9", "再一起除以 3 → 2、3（沒有共同因數了）", "最大公因數＝2×2×3＝12"]); },
        lines: ["兩個數一起用同一個數去除，除到沒有共同的因數為止。", "把左邊除過的數乘起來，就是最大公因數。", "「剛好分完、最多分幾份」的題目，就是在找最大公因數。"],
        task: "跟著算：用短除法找 16 和 24 的最大公因數。", ask: "48 顆糖、36 塊餅乾，要剛好分完，最多分幾袋？" }
    ],
    "2b": [
      { name: "看圖：在數線上跳格子", svg: function () {
          var x0 = 40, x1 = 650, n = 24, X = function (k) { return x0 + (x1 - x0) * k / n; }, s = '<rect width="690" height="225" rx="14" fill="var(--pri-soft)"/><line x1="' + x0 + '" y1="120" x2="' + x1 + '" y2="120" stroke="var(--ink)" stroke-width="2"/>';
          for (var k = 0; k <= n; k += 2) s += '<line x1="' + X(k).toFixed(1) + '" y1="114" x2="' + X(k).toFixed(1) + '" y2="126" stroke="var(--ink)"/>' + t(X(k), 146, k, { anchor: "middle", fs: 13 });
          for (k = 6; k <= n; k += 6) s += '<path d="M' + X(k - 6).toFixed(1) + " 112 Q" + X(k - 3).toFixed(1) + " 64 " + X(k).toFixed(1) + ' 112" fill="none" stroke="var(--sun)" stroke-width="3"/>';
          for (k = 8; k <= n; k += 8) s += '<path d="M' + X(k - 8).toFixed(1) + " 154 Q" + X(k - 4).toFixed(1) + " 196 " + X(k).toFixed(1) + ' 154" fill="none" stroke="var(--leaf)" stroke-width="3"/>';   // 綠弧畫在刻度數字下方，不壓字
          s += '<circle cx="' + X(24).toFixed(1) + '" cy="120" r="9" fill="none" stroke="var(--bad)" stroke-width="3"/>' + t(X(9), 50, "每次跳 6：6、12、18、24", { fill: "var(--sun-deep)", fs: 15 }) + t(X(1), 214, "每次跳 8：8、16、24（綠線）", { fill: "var(--leaf)", fs: 15 });
          return wrap(690, 225, "數線上 6 的倍數和 8 的倍數，第一次落在同一點是 24，所以最小公倍數是 24", s);
        },
        lines: ["6 的倍數：6、12、18、24…（一直加 6）。", "6 和 8 都會跳到的數叫公倍數，第一個是最小公倍數 24。", "「下一次一起」的題目，就是在找最小公倍數。"],
        task: "跟著跳：寫出 4 和 6 的倍數，找第一個一樣的。", ask: "甲車每 6 分、乙車每 8 分一班，下一次同時開是幾分鐘後？" },
      { name: "換個說法：個位數一看就知道", svg: function () { return board(["2 的倍數：個位數是 0、2、4、6、8", "5 的倍數：個位數是 0 或 5", "10 的倍數：個位數是 0", "同時是 2 和 5 的倍數 → 個位數是 0"]); },
        lines: ["判斷 2、5、10 的倍數，只要看個位數。", "最小公倍數也可以從大的數的倍數開始一個一個試。", "公倍數有無限多個，所以只問「最小」的。"],
        task: "跟著試：從 10 的倍數開始試，找 10 和 15 的最小公倍數。", ask: "135 是不是 2 的倍數？是不是 5 的倍數？" }
    ],
    "3a": [
      { name: "看圖：多邊形和正多邊形", svg: function () {
          var s = '<rect width="690" height="230" rx="14" fill="var(--leaf-soft)"/>';
          [[3, "正三角形"], [4, "正方形"], [5, "正五邊形"], [6, "正六邊形"]].forEach(function (q, i) { var p = poly(95 + i * 165, 100, 60, q[0], q[0] === 4 ? -45 : -90); s += '<polygon points="' + pts(p) + '" fill="var(--card)" stroke="var(--leaf)" stroke-width="3"/>' + t(95 + i * 165, 200, q[1], { anchor: "middle" }); });
          return wrap(690, 230, "正三角形、正方形、正五邊形、正六邊形：每條邊一樣長、每個角一樣大", s);
        },
        lines: ["由直的線段圍成的圖形叫多邊形；幾條邊就叫幾邊形，也有幾個頂點。", "正多邊形要「每條邊一樣長」而且「每個角一樣大」。", "菱形邊一樣長，但角不一定一樣大；長方形角一樣大，但邊不一定一樣長。", "正方形兩個條件都過關，所以正方形是菱形，也是正多邊形。"],
        task: "跟著數：每個圖形數一數邊和頂點。", ask: "長方形是不是正多邊形？為什麼？" },
      { name: "換個說法：兩個條件都要過關", svg: function () { return board(["條件一：邊都一樣長嗎？", "條件二：角都一樣大嗎？", "兩個都是 → 正多邊形（正方形 ✓）", "只過一個 → 不是（不是正方形的菱形、長方形 ✗）"]); },
        lines: ["判斷正多邊形，問自己兩個問題：邊都一樣長嗎？角都一樣大嗎？", "兩個都要「是」才算。", "圓是彎的，不是多邊形。"],
        task: "跟著判斷：正方形、菱形、長方形，各過了幾個條件？", ask: "正三角形過了哪兩個條件？" }
    ],
    "3b": [
      { name: "看圖：兩條短的要比長的長", svg: function () {
          var s = '<rect width="690" height="240" rx="14" fill="var(--sun-soft)"/>';
          // 3、4、5 圍得起來：底邊 5 單位，頂點用餘弦定理算
          var u = 40, A = [60, 180], B = [60 + 5 * u, 180], xa = (25 + 9 - 16) / 10, C = [60 + 3 * u * xa / 3 * 1, 180 - Math.sqrt(9 - xa * xa) * u];
          s += '<polygon points="' + pts([A, B, C]) + '" fill="var(--leaf-soft)" stroke="var(--leaf)" stroke-width="3"/>' + t(60, 214, "3、4、5：3＋4＝7 ＞ 5，圍得起來", { fs: 15 });
          // 2、3、6 圍不起來：兩段短的從兩端往中間伸，碰不到
          var x0 = 380, L = 6 * 40;
          s += '<line x1="' + x0 + '" y1="180" x2="' + (x0 + L) + '" y2="180" stroke="var(--bad)" stroke-width="4"/><line x1="' + x0 + '" y1="180" x2="' + (x0 + 2 * 40 * Math.cos(Math.PI / 6)).toFixed(1) + '" y2="' + (180 - 2 * 40 * Math.sin(Math.PI / 6)).toFixed(1) + '" stroke="var(--ink)" stroke-width="4"/><line x1="' + (x0 + L) + '" y1="180" x2="' + (x0 + L - 3 * 40 * Math.cos(Math.PI / 6)).toFixed(1) + '" y2="' + (180 - 3 * 40 * Math.sin(Math.PI / 6)).toFixed(1) + '" stroke="var(--ink)" stroke-width="4"/>' + t(x0, 214, "2、3、6：2＋3＝5 ＜ 6，碰不到", { fs: 15 });
          return wrap(690, 240, "左邊 3、4、5 可以圍成三角形；右邊 2、3、6 兩條短邊加起來不夠長，碰不到", s);
        },
        lines: ["三角形任兩邊加起來，一定比第三邊長。", "最快的檢查：兩條短的加起來，有沒有比最長的長。", "剛好一樣長也不行（會變成一直線）。"],
        task: "跟著檢查：3、3、7 能不能圍？先把兩條短的加起來。", ask: "兩邊是 5 和 8，第三邊可以是 3 嗎？為什麼？" },
      { name: "換個說法：第三邊的範圍", svg: function () { return board(["兩邊 5、8：第三邊要比 8－5＝3 長", "也要比 8＋5＝13 短", "所以第三邊在 3 和 13 之間（不含 3、13）"]); },
        lines: ["已知兩邊，第三邊要比「兩邊的差」長、比「兩邊的和」短。", "等於差或等於和都不行。"],
        task: "跟著算：兩邊 4 和 9，第三邊可以是哪些整數？", ask: "兩邊 6 和 10，第三邊能是 16 嗎？" }
    ],
    "3c": [
      { name: "看圖：切成三角形來算", svg: function () {
          var s = '<rect width="690" height="250" rx="14" fill="var(--pri-soft)"/>';
          [[4, "四邊形：2 個三角形"], [5, "五邊形：3 個三角形"], [6, "六邊形：4 個三角形"]].forEach(function (q, i) {
            var p = poly(115 + i * 230, 110, 75, q[0], -90);
            s += '<polygon points="' + pts(p) + '" fill="var(--card)" stroke="var(--pri)" stroke-width="3"/>';
            for (var k = 2; k < q[0] - 1; k++) s += '<line x1="' + p[0][0].toFixed(1) + '" y1="' + p[0][1].toFixed(1) + '" x2="' + p[k][0].toFixed(1) + '" y2="' + p[k][1].toFixed(1) + '" stroke="var(--sun)" stroke-width="2" stroke-dasharray="6 4"/>';
            s += t(115 + i * 230, 222, q[1], { anchor: "middle", fs: 15 });
          });
          return wrap(690, 250, "從一個頂點連對角線：四邊形分成 2 個三角形、五邊形 3 個、六邊形 4 個", s);
        },
        lines: ["三角形的三個角加起來是 180 度。", "從一個頂點畫對角線，n 邊形可以分成（n－2）個三角形。", "內角和＝（n－2）×180 度；正多邊形每個角一樣大，再除以 n。"],
        task: "跟著算：五邊形分成幾個三角形？內角和幾度？", ask: "六邊形的內角和是幾度？你怎麼算的？" },
      { name: "換個說法：先記住三個數", svg: function () { return board(["三角形 180 度、四邊形 360 度", "每多一條邊，就多 180 度", "缺一個角：內角和 － 已知的角"]); },
        lines: ["三角形 180、四邊形 360、五邊形 540，每多一邊加 180。", "求缺的那個角：用內角和減掉已經知道的角。"],
        task: "跟著算：四邊形三個角是 100、80、70 度，剩下的角幾度？", ask: "正六邊形每個角幾度？" }
    ],
    "4a": [
      { name: "看圖：約分、擴分大小不變", svg: function () {
          var s = '<rect width="690" height="230" rx="14" fill="var(--leaf-soft)"/>';
          s += bar(40, 40, 420, 40, 2, 3, "var(--sunball)", "2/3") + bar(40, 100, 420, 40, 4, 6, "var(--sunball)", "4/6") + bar(40, 160, 420, 40, 8, 12, "var(--sunball)", "8/12");
          return wrap(690, 230, "2/3、4/6、8/12 塗色的長度一樣，大小相等", s);
        },
        lines: ["分子和分母同時乘以同一個數（擴分）或除以同一個數（約分），分數大小不變。", "約到分子分母沒有共同的因數（只剩 1），就是最簡分數。", "一次除以最大公因數，就能一次約到最簡。"],
        task: "跟著約：18/24，先找 18 和 24 的最大公因數。", ask: "4/6 和 2/3 一樣大嗎？為什麼？" },
      { name: "換個說法：分母乘幾，分子就乘幾", svg: function () { return board(["2/3 → 分母 3×4＝12，分子 2×4＝8 → 8/12", "18/24 → 一起 ÷6 → 3/4", "不能加或減：2/3 ≠ (2＋3)/(3＋3)"]); },
        lines: ["擴分：分母乘了幾，分子也要乘幾。", "約分：分子分母一起除以同一個數。", "加或減同一個數，大小會改變，不可以。"],
        task: "跟著擴分：把 3/4 擴分成分母 20。", ask: "把 2/3 擴分成分母 12，分子是多少？" }
    ],
    "4b": [
      { name: "看圖：通分以後比分子", svg: function () {
          var s = '<rect width="690" height="230" rx="14" fill="var(--sun-soft)"/>';
          s += bar(40, 40, 480, 40, 2, 3, "var(--pri)", "2/3") + bar(40, 100, 480, 40, 3, 4, "var(--leaf)", "3/4") + bar(40, 160, 480, 22, 8, 12, "var(--pri)", "8/12") + bar(40, 190, 480, 22, 9, 12, "var(--leaf)", "9/12");
          return wrap(690, 230, "2/3 和 3/4 用 12 通分成 8/12 和 9/12，9/12 比較大", s);
        },
        lines: ["分母不一樣不能直接比，先通分：找兩個分母的最小公倍數當新分母。", "通分後分母一樣，分子大的分數比較大。", "數字很大時，先約分再通分，比較好算。"],
        task: "跟著通分：2/3 和 3/4 用 12 通分。", ask: "2/3 和 3/4，哪一個比較大？" },
      { name: "換個說法：先約分再比", svg: function () { return board(["28/42 和 27/45 數字很大", "先約分：28/42＝2/3，27/45＝3/5", "用 15 通分：10/15 和 9/15", "10 ＞ 9，所以 28/42 ＞ 27/45"]); },
        lines: ["遇到大數字，先各自約成最簡分數。", "再找小一點的公分母通分，比分子。"],
        task: "跟著做：28/42 和 27/45 先各自約分。", ask: "為什麼要先約分再通分？" }
    ],
    "5a": [
      { name: "看圖：對折會完全重疊", svg: function () {
          var s = '<rect width="690" height="250" rx="14" fill="var(--pri-soft)"/>';
          var sq = [[60, 50], [220, 50], [220, 210], [60, 210]];
          s += '<polygon points="' + pts(sq) + '" fill="var(--card)" stroke="var(--ink)" stroke-width="3"/>';
          [[140, 40, 140, 220], [50, 130, 230, 130], [50, 40, 230, 220], [230, 40, 50, 220]].forEach(function (l) { s += '<line x1="' + l[0] + '" y1="' + l[1] + '" x2="' + l[2] + '" y2="' + l[3] + '" stroke="var(--bad)" stroke-width="2" stroke-dasharray="6 4"/>'; });
          s += t(140, 240, "正方形：4 條", { anchor: "middle", fs: 15 });
          var re = [[300, 80], [500, 80], [500, 180], [300, 180]];
          s += '<polygon points="' + pts(re) + '" fill="var(--card)" stroke="var(--ink)" stroke-width="3"/><line x1="400" y1="70" x2="400" y2="190" stroke="var(--bad)" stroke-width="2" stroke-dasharray="6 4"/><line x1="290" y1="130" x2="510" y2="130" stroke="var(--bad)" stroke-width="2" stroke-dasharray="6 4"/>' + t(400, 240, "長方形：2 條", { anchor: "middle", fs: 15 });
          var tri = poly(610, 140, 70, 3, -90), m = [(tri[1][0] + tri[2][0]) / 2, (tri[1][1] + tri[2][1]) / 2];
          s += '<polygon points="' + pts(tri) + '" fill="var(--card)" stroke="var(--ink)" stroke-width="3"/>';
          for (var i = 0; i < 3; i++) { var a = tri[i], b = tri[(i + 1) % 3], c = tri[(i + 2) % 3], mid = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]; s += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + mid[0].toFixed(1) + '" y2="' + mid[1].toFixed(1) + '" stroke="var(--bad)" stroke-width="2" stroke-dasharray="6 4"/>'; }
          return wrap(690, 250, "正方形 4 條對稱軸、長方形 2 條（對角線不是）、正三角形 3 條", s + t(610, 240, "正三角形：3 條", { anchor: "middle", fs: 15 }));
        },
        lines: ["沿著一條線對折，兩邊完全重疊的圖形叫線對稱圖形，那條線叫對稱軸。", "對折後疊在一起的點、邊、角，叫對稱點、對稱邊、對稱角；對稱邊一樣長、對稱角一樣大。", "對稱點的連線和對稱軸垂直，而且被對稱軸平分。"],
        task: "跟著找：長方形的對角線是不是對稱軸？想像沿對角線對折。", ask: "長方形有幾條對稱軸？" },
      { name: "換個說法：拿紙來折", svg: function () { return board(["正方形 4、長方形（長寬不同）2、正三角形 3", "等腰三角形（底邊和腰不一樣長）1、圓 無限多", "一般平行四邊形 0（不是線對稱圖形）", "正 n 邊形有 n 條對稱軸"]); },
        lines: ["拿紙剪出圖形，對折看看能不能完全疊在一起。", "正多邊形有幾條邊，就有幾條對稱軸。"],
        task: "跟著折：剪一個長方形，試試沿對角線折會不會重疊。", ask: "一般的平行四邊形是不是線對稱圖形？" }
    ],
    "6a": [
      { name: "看圖：先通分，才能加", svg: function () {
          var s = '<rect width="690" height="250" rx="14" fill="var(--leaf-soft)"/>';
          s += bar(40, 30, 420, 34, 1, 2, "var(--pri)", "1/2 ＝ 3/6") + bar(40, 80, 420, 34, 1, 3, "var(--sun)", "1/3 ＝ 2/6");
          var cw = 420 / 6, x = 40;
          for (var i = 0; i < 6; i++) s += '<rect x="' + (x + i * cw).toFixed(1) + '" y="150" width="' + cw.toFixed(1) + '" height="40" fill="' + (i < 3 ? "var(--pri)" : i < 5 ? "var(--sun)" : "var(--card)") + '" stroke="var(--ink)" stroke-width="1.5"/>';
          return wrap(690, 250, "1/2＋1/3：通分成 3/6＋2/6＝5/6", s + t(480, 176, "＝ 5/6") + t(40, 228, "不是 2/5：分母不能相加", { fill: "var(--bad)", fs: 16 }));
        },
        lines: ["分母不一樣的分數不能直接加減，先通分成同分母。", "同分母以後，分母不變，分子相加或相減。", "算完記得約成最簡分數。"],
        task: "跟著算：1/2＋1/3，先用 6 通分。", ask: "1/2＋1/3 為什麼不是 2/5？" },
      { name: "換個說法：三個步驟", svg: function () { return board(["① 找公分母（最小公倍數）", "② 分子分母一起擴分", "③ 分子加減、分母不變，最後約分"]); },
        lines: ["第一步找兩個分母的最小公倍數。", "第二步兩個分數都擴分成這個分母。", "第三步分子加或減，分母不動，最後約分。"],
        task: "跟著三步驟：5/6－1/4。", ask: "5/6－1/4 用哪個數通分？" }
    ],
    "6b": [
      { name: "看圖：先決定加還是減", svg: function () { return board(["「一共、合起來」→ 加", "「還剩、用掉、多多少、少多少」→ 減", "決定好以後：通分 → 計算 → 約分 → 寫單位"]); },
        lines: ["先讀題目，圈出關鍵字，決定用加法還是減法。", "再照異分母加減的步驟算。", "答案記得寫單位（公尺、公升…）。"],
        task: "跟著圈：「用掉 1/6 公尺，還剩多少」關鍵字是哪個？", ask: "「哥哥比弟弟多喝幾杯」要用加還是減？" },
      { name: "換個說法：畫一條線段", svg: function () {
          var x0 = 60, W = 560, s = '<rect width="690" height="190" rx="14" fill="var(--sun-soft)"/>', a = 3 / 4, b = 1 / 6;
          s += '<rect x="' + x0 + '" y="70" width="' + (W * a).toFixed(1) + '" height="30" fill="var(--pri)"/><rect x="' + (x0 + W * (a - b)).toFixed(1) + '" y="70" width="' + (W * b).toFixed(1) + '" height="30" fill="var(--bad)" opacity=".7"/>';
          s += t(x0, 56, "緞帶 3/4 公尺", { fs: 15 }) + t(x0 + W * (a - b) + 4, 126, "用掉 1/6", { fs: 15, fill: "var(--bad)" }) + t(x0, 126, "還剩 3/4－1/6", { fs: 15 }) + t(x0, 166, "＝ 9/12 － 2/12 ＝ 7/12 公尺", { fs: 16 });
          return wrap(690, 190, "線段圖：緞帶 3/4 公尺，用掉 1/6 公尺，還剩 7/12 公尺", s);
        },
        lines: ["把題目畫成線段，看得出是合起來還是拿掉。", "拿掉的部分用減法，合起來用加法。"],
        task: "跟著畫：一壺水 5/6 公升倒出 1/4 公升，畫出線段。", ask: "還剩多少，要用哪一種算法？" }
    ]
  };
  // 「跟著算一題」先猜猜看（每個觀念一題；猜錯也沒關係）
  var PREDICT = {
    "1a": { q: "先猜猜看：氣溫 8 時 21 度、10 時 24 度、12 時 29 度，哪一段上升得比較多？", opts: ["8 時到 10 時", "10 時到 12 時", "一樣多"], a: 1, why: "10 時到 12 時增加 5 度，比 8 時到 10 時的 3 度多。" },
    "2a": { q: "先猜猜看：12 和 18 的最大公因數是多少？", opts: ["3", "6", "36"], a: 1, why: "12 和 18 共同的因數有 1、2、3、6，最大是 6；36 是公倍數。" },
    "2b": { q: "先猜猜看：4 和 6 的最小公倍數是多少？", opts: ["24", "12", "2"], a: 1, why: "4 的倍數 4、8、12…，6 的倍數 6、12…，第一個一樣的是 12。" },
    "3a": { q: "先猜猜看：菱形是不是正多邊形？", opts: ["是", "不一定是"], a: 1, why: "菱形邊都一樣長，但角不一定一樣大；角都是直角時才是正方形。" },
    "3b": { q: "先猜猜看：3、4、8 公分的吸管能不能圍成三角形？", opts: ["能", "不能"], a: 1, why: "3＋4＝7，比 8 短，兩端碰不到。" },
    "3c": { q: "先猜猜看：五邊形的內角和是幾度？", opts: ["540 度", "900 度", "360 度"], a: 0, why: "可以分成 3 個三角形，3×180＝540 度。" },
    "4a": { q: "先猜猜看：18/24 的最簡分數是？", opts: ["9/12", "3/4", "6/8"], a: 1, why: "18 和 24 的最大公因數是 6，一起除以 6 得 3/4；9/12、6/8 還能再約。" },
    "4b": { q: "先猜猜看：2/3 和 3/4 哪一個比較大？", opts: ["2/3", "3/4", "一樣大"], a: 1, why: "通分成 8/12 和 9/12，3/4 比較大。" },
    "5a": { q: "先猜猜看：長方形的對角線是不是對稱軸？", opts: ["是", "不是"], a: 1, why: "沿對角線對折，兩半不會完全疊在一起，所以不是。" },
    "6a": { q: "先猜猜看：1/2＋1/3＝？", opts: ["2/5", "5/6", "2/6"], a: 1, why: "通分成 3/6＋2/6＝5/6；分母不能相加。" },
    "6b": { q: "先猜猜看：「還剩多少」要用什麼算法？", opts: ["加法", "減法"], a: 1, why: "拿掉一部分，看剩下多少，用減法。" }
  };
  var api = { EXPLAIN: EXPLAIN, PREDICT: PREDICT };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.G5MathExplain = api;
})(typeof window !== "undefined" ? window : this);
