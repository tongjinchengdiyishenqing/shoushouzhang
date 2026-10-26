/* 随手账 —— 应用脚本
 * 纯原生 JS，无框架、无依赖、无网络请求；数据全部落在 localStorage。
 * 路由：hash（#/book 账本、#/entry 记一笔、#/stats 统计、#/assets 资产、#/config 设置）
 */

(function () {
  "use strict";

  /* ================= 存储 ================= */

  var STORE_KEY = "sz.book.v5";

  var DEFAULTS = {
    wallets: [
      { id: "w_cash", name: "现金", glyph: "👛", opening: 60000, color: "#C7912F", tint: "#FBF2E2" },
      { id: "w_pay", name: "移动支付", glyph: "📲", opening: 600000, color: "#3E7FB0", tint: "#EAF1F7" },
      { id: "w_bank", name: "储蓄卡", glyph: "🏧", opening: 600000, color: "#7B6BA8", tint: "#F0EDF8" },
      { id: "w_fund", name: "投资户", glyph: "📊", opening: 2000000, color: "#2F7D6E", tint: "#E8F3F0" }
    ],
    tags: [
      { id: "t_food", name: "吃饭", glyph: "🍚", flow: "out", seq: 1, color: "#D9644A", tint: "#FBEBE7" },
      { id: "t_car", name: "出行", glyph: "🚌", flow: "out", seq: 2, color: "#3E7FB0", tint: "#EAF1F7" },
      { id: "t_buy", name: "购物", glyph: "🛍", flow: "out", seq: 3, color: "#D69A2E", tint: "#FBF2E2" },
      { id: "t_home", name: "住", glyph: "🏠", flow: "out", seq: 4, color: "#7B6BA8", tint: "#F0EDF8" },
      { id: "t_fun", name: "玩", glyph: "🎧", flow: "out", seq: 5, color: "#3F8F92", tint: "#E8F3F3" },
      { id: "t_med", name: "看病", glyph: "💊", flow: "out", seq: 6, color: "#C4557A", tint: "#FAECF1" },
      { id: "t_study", name: "学习", glyph: "📕", flow: "out", seq: 7, color: "#2F7D6E", tint: "#E8F3F0" },
      { id: "t_misc", name: "杂项", glyph: "🧩", flow: "out", seq: 8, color: "#6E6E76", tint: "#F1F1F4" },
      { id: "t_pay", name: "工资", glyph: "💼", flow: "in", seq: 1, color: "#2A8F5A", tint: "#E9F5EE" },
      { id: "t_div", name: "股息", glyph: "🌾", flow: "in", seq: 2, color: "#B78B33", tint: "#F9F3E4" },
      { id: "t_int", name: "利息", glyph: "🏛", flow: "in", seq: 3, color: "#45859C", tint: "#EAF2F5" },
      { id: "t_side", name: "外快", glyph: "🛠", flow: "in", seq: 4, color: "#72609C", tint: "#EFEDF7" },
      { id: "t_gift", name: "收礼", glyph: "🧧", flow: "in", seq: 5, color: "#C4557A", tint: "#FAECF1" }
    ],
    entries: []
  };

  function seed() {
    /* 生成近 6 个月的示例流水：房租/工资按月固定，吃喝交通按周散落，
       目的是让首页图表和流水看起来是"活的"，而不是只有今天一条。 */
    var out = [];
    var n = 0;
    function add(flow, cents, tagId, walletId, day, memo) {
      n += 1;
      out.push({
        id: "e" + n, flow: flow, cents: cents, tagId: tagId, walletId: walletId,
        day: ymd(day), memo: memo, origin: flow === "in" && tagId === "t_div" ? "dividend" : "manual",
        at: Date.now() - n * 1000
      });
    }
    function d(offsetDays) { return new Date(Date.now() - offsetDays * 86400000); }
    function dayIn(monthOffset, dayOfMonth) {
      var now = new Date();
      return new Date(now.getFullYear(), now.getMonth() - monthOffset, dayOfMonth);
    }

    var foods = ["午饭", "晚饭", "早饭", "外卖", "咖啡"];
    var rides = ["公交", "地铁", "打车"];
    for (var m = 5; m >= 0; m--) {
      // 固定项
      add("out", 320000, "t_home", "w_bank", dayIn(m, 5), "房租");
      add("in", 1200000, "t_pay", "w_bank", dayIn(m, 10), "工资");
      // 吃喝：每月 5~7 笔
      var fcount = 8 + (m % 3);
      for (var i = 0; i < fcount; i++) {
        var amt = [1800, 2600, 3200, 4500, 2200, 6800][i % 6];
        add("out", amt, "t_food", "w_pay", dayIn(m, 3 + i * 4), foods[i % foods.length]);
      }
      // 交通：每月 2~3 笔
      for (var j = 0; j < 3; j++) {
        add("out", [600, 500, 3200][j], "t_car", "w_pay", dayIn(m, 7 + j * 6), rides[j]);
      }
      // 超市 / 聚餐：每月各一笔
      add("out", 22000 + (m % 2) * 6000, "t_buy", "w_pay", dayIn(m, 15), "超市");
      add("out", 15000 + (m % 3) * 5000, "t_food", "w_pay", dayIn(m, 22), "聚餐");
      // 购物 / 娱乐：隔月一笔
      if (m % 2 === 0) add("out", 26800 + m * 1000, "t_buy", "w_pay", dayIn(m, 12), "日用采购");
      if (m % 3 === 0) add("out", 8800, "t_fun", "w_pay", dayIn(m, 18), "电影");
      // 分红：隔两个月到账一次
      if (m % 2 === 0) add("in", 420000 - m * 20000, "t_div", "w_fund", dayIn(m, 20), "股息到账");
      // 每月一次性大额，让月度走势有起伏（真实账本本来就不平）
      if (m === 5) add("out", 120000, "t_buy", "w_bank", dayIn(m, 19), "换季衣物");
      if (m === 3) add("out", 240000, "t_fun", "w_bank", dayIn(m, 21), "短途旅行");
      if (m === 2) add("out", 160000, "t_study", "w_bank", dayIn(m, 16), "线上课程");
      if (m === 1) add("out", 98000, "t_med", "w_bank", dayIn(m, 14), "体检");
    }

    // 本月最近两天补两条"今天"的，让首屏有今天的数据
    add("out", 2800, "t_food", "w_pay", d(0), "午饭");
    add("out", 600, "t_car", "w_pay", d(0), "公交");
    return out;
  }

  var db = null;

  /* 老数据里的分类可能没有 tint/color，按 id 从默认表补齐，别让用户丢数据 */
  function mergeTags(list) {
    if (!list || !list.length) return DEFAULTS.tags.slice();
    return list.map(function (t) {
      var d = DEFAULTS.tags.filter(function (x) { return x.id === t.id; })[0];
      if (!d) return t;
      if (t.color && t.tint) return t;
      t.color = t.color || d.color;
      t.tint = t.tint || d.tint;
      return t;
    });
  }

  function load() {
    var raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch (e) {
      raw = null;
    }
    if (raw && Array.isArray(raw.entries)) {
      db = {
        wallets: raw.wallets && raw.wallets.length ? raw.wallets : DEFAULTS.wallets.slice(),
        tags: mergeTags(raw.tags),
        entries: raw.entries
      };
    } else {
      db = { wallets: DEFAULTS.wallets.slice(), tags: DEFAULTS.tags.slice(), entries: seed() };
      save();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
    } catch (e) {
      /* 存储满了就静默失败，不影响使用 */
    }
  }

  /* ================= 工具 ================= */

  function ymd(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function thisMonth() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1);
  }
  function monthOf(day) {
    return String(day).slice(0, 7);
  }
  function money(cents) {
    var v = (Number(cents) || 0) / 100;
    return v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function cash(cents) {
    var n = Number(cents) || 0;
    return (n < 0 ? "−" : "") + "¥" + money(Math.abs(n));
  }
  function yuan(cents) {
    return (Number(cents) || 0) / 100;
  }
  function uid(p) {
    return (p || "e") + "_" + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
  }
  /* ================= 线性图标（内联 SVG，白色描边） =================
     emoji 转白色剪影会糊成一团；钱往用的是单色线性图标，这里按同样思路内联 SVG。
     所有 path 都在 24×24 视口里，stroke 颜色/粗细由 CSS 控制。 */
  var ICONS = {
    t_food: '<path d="M4 10h16a8 8 0 0 1-16 0Z"/><path d="M9 6V4M15 6V4"/>',
    t_car: '<rect x="3" y="9" width="18" height="7" rx="2"/><circle cx="7.5" cy="17.5" r="1.6"/><circle cx="16.5" cy="17.5" r="1.6"/><path d="M6 9l2-3h8l2 3"/>',
    t_buy: '<path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
    t_home: '<path d="M4 11l8-6 8 6"/><path d="M6.5 10v9h11v-9"/>',
    t_fun: '<path d="M6 15a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1a2 2 0 0 1-3.4 1.4L14 16h-4l-.6 1.4A2 2 0 0 1 6 16v-1Z"/>',
    t_med: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>',
    t_study: '<path d="M5 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H5V5Z"/><path d="M19 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6V5Z"/>',
    t_misc: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h3.2l2 2.2h5.8A2.5 2.5 0 0 1 20 10.7v5.8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"/>',
    t_pay: '<rect x="3" y="7" width="18" height="11" rx="2"/><circle cx="12" cy="12.5" r="2.4"/>',
    t_div: '<path d="M12 20c0-6 3-10 8-11-1 7-4 10-8 11Z"/><path d="M12 20c-1-5-4-8-8-9 0 6 3 8 8 9Z"/>',
    t_int: '<path d="M4 9l8-5 8 5"/><path d="M6 9v9M10 9v9M14 9v9M18 9v9"/><path d="M4 18h16"/>',
    t_side: '<path d="M14 6a3 3 0 0 1 4 4l-7 7-4 1 1-4 6-8Z"/>',
    t_gift: '<rect x="4" y="9" width="16" height="10" rx="1.5"/><path d="M4 12h16M12 9v10"/><path d="M12 9c-2 0-4-.8-4-2.2C8 5.6 9.2 5 10 5c1.6 0 2 2 2 4Z"/><path d="M12 9c2 0 4-.8 4-2.2C16 5.6 14.8 5 14 5c-1.6 0-2 2-2 4Z"/>',
    w_cash: '<rect x="3" y="7" width="18" height="11" rx="2"/><circle cx="12" cy="12.5" r="2.4"/>',
    w_pay: '<rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M10 18h4"/>',
    w_bank: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 11h18M7 15h4"/>',
    w_fund: '<path d="M4 18l5-6 4 3 6-8"/><path d="M15 7h4v4"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
  };

  function iconOf(id, fallback) {
    var body = ICONS[id];
    if (!body) return fallback || "";
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + body + "</svg>";
  }

  /* 底栏用实心图标（钱往的底栏是实心剪影，线稿在小尺寸下发虚） */
  var SOLID = {
    nav_book: '<path fill-rule="evenodd" d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm2.2 4.6a1 1 0 1 0 0 2h5.6a1 1 0 1 0 0-2H9.2Zm0 4a1 1 0 1 0 0 2h3.6a1 1 0 1 0 0-2H9.2Z"/>',
    nav_stats: '<path d="M3.2 12.6h3.4a1.2 1.2 0 0 1 1.2 1.2V19a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 19v-5.2a1.2 1.2 0 0 1 1.2-1.2Zm6.9-6h3.4a1.2 1.2 0 0 1 1.2 1.2V19a1.2 1.2 0 0 1-1.2 1.2h-3.4A1.2 1.2 0 0 1 8.9 19V7.8a1.2 1.2 0 0 1 1.2-1.2Zm6.9-3.4h3.8A1.2 1.2 0 0 1 22 4.4V19a1.2 1.2 0 0 1-1.2 1.2h-3.8A1.2 1.2 0 0 1 15.8 19V4.4a1.2 1.2 0 0 1 1.2-1.2Z"/>',
    nav_assets: '<path fill-rule="evenodd" d="M6.4 4h11.2A4.4 4.4 0 0 1 22 8.4v7.2a4.4 4.4 0 0 1-4.4 4.4H6.4A4.4 4.4 0 0 1 2 15.6V8.4A4.4 4.4 0 0 1 6.4 4Zm11 5.1a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z"/>',
    nav_config: '<path d="M3.4 6.2h8.2a1.1 1.1 0 1 1 0 2.2H3.4a1.1 1.1 0 1 1 0-2.2Zm13.9 0h3.3a1.1 1.1 0 1 1 0 2.2h-3.3a1.1 1.1 0 1 1 0-2.2ZM3.4 15.6h3.3a1.1 1.1 0 1 1 0 2.2H3.4a1.1 1.1 0 1 1 0-2.2Zm8.9 0h8.3a1.1 1.1 0 1 1 0 2.2h-8.3a1.1 1.1 0 1 1 0-2.2Z"/><circle cx="14.9" cy="7.3" r="2.5"/><circle cx="9.1" cy="16.7" r="2.5"/>'
  };

  function iconSolid(id) {
    var body = SOLID[id];
    if (!body) return "";
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + body + "</svg>";
  }

  function tagById(id) {
    for (var i = 0; i < db.tags.length; i++) if (db.tags[i].id === id) return db.tags[i];
    return { id: id, name: "未分类", glyph: "•", flow: "out", color: "#8A8A8A" };
  }
  function walletById(id) {
    for (var i = 0; i < db.wallets.length; i++) if (db.wallets[i].id === id) return db.wallets[i];
    return { id: id, name: "未知", glyph: "•", opening: 0 };
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ================= 计算 ================= */

  function entriesOfMonth(month) {
    return db.entries
      .filter(function (e) { return monthOf(e.day) === month; })
      .sort(function (a, b) {
        if (a.day !== b.day) return a.day < b.day ? 1 : -1;
        return (b.at || 0) - (a.at || 0);
      });
  }

  function summarize(month) {
    var list = entriesOfMonth(month);
    var out = 0, inc = 0, buckets = {}, bucketsIn = {};
    list.forEach(function (e) {
      if (e.flow === "out") {
        out += e.cents;
        buckets[e.tagId] = (buckets[e.tagId] || 0) + e.cents;
      } else if (e.flow === "in") {
        inc += e.cents;
        bucketsIn[e.tagId] = (bucketsIn[e.tagId] || 0) + e.cents;
      }
    });
    function rank(b, base) {
      return Object.keys(b)
        .map(function (k) { return { id: k, cents: b[k], pct: base ? b[k] / base : 0 }; })
        .sort(function (a, b2) { return b2.cents - a.cents; });
    }
    return { list: list, out: out, inc: inc, rest: inc - out, top: rank(buckets, out), topIn: rank(bucketsIn, inc) };
  }

  function walletBalances() {
    var map = {};
    db.wallets.forEach(function (w) { map[w.id] = w.opening || 0; });
    db.entries.forEach(function (e) {
      if (e.flow === "out") map[e.walletId] = (map[e.walletId] || 0) - e.cents;
      else if (e.flow === "in") map[e.walletId] = (map[e.walletId] || 0) + e.cents;
      else if (e.flow === "move") {
        map[e.walletId] = (map[e.walletId] || 0) - e.cents;
        if (e.toWalletId) map[e.toWalletId] = (map[e.toWalletId] || 0) + e.cents;
      }
    });
    return map;
  }

  /* ================= 视图：账本 ================= */

  var ui = {
    month: thisMonth(),
    flow: "out",
    tagId: "t_food",
    walletId: "w_pay",
    toWalletId: "w_bank",
    day: ymd(new Date()),
    memo: "",
    draft: "",
    statsFlow: "out",
    statsSpan: 6
  };

  function viewBook() {
    var s = summarize(ui.month);
    var parts = ui.month.split("-");
    var label = parts[0] + " 年 " + Number(parts[1]) + " 月";
    var bal = walletBalances();
    var total = db.wallets.reduce(function (a, w) { return a + (bal[w.id] || 0); }, 0);
    var delta = s.rest;

    // 近 6 个月双色柱（浅红支出 / 浅绿收入），带 y 轴刻度与虚线网格
    var months = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(Number(parts[0]), Number(parts[1]) - 1 - i, 1);
      months.push(d.getFullYear() + "-" + pad(d.getMonth() + 1));
    }
    var series = months.map(function (m) {
      var x = summarize(m);
      return { m: m, out: x.out, inc: x.inc };
    });
    // 只画支出，所以上限按支出峰值来定，柱子才会把纵向空间用满
    var peak = Math.max.apply(null, series.map(function (x) { return x.out; }).concat([1]));
    // 纵轴上限取"好看的刻度"：1/1.2/1.5/2/2.5/3/4/5/6/8/10 × 10^n
    function niceTop(centsPeak) {
      var yuanVal = centsPeak / 100;
      var mag = Math.pow(10, Math.floor(Math.log10(yuanVal)));
      var ladder = [1, 1.2, 1.5, 1.8, 2, 2.4, 3, 3.6, 4.5, 5, 6, 7.5, 8, 9, 10];
      for (var k = 0; k < ladder.length; k++) {
        if (yuanVal <= ladder[k] * mag) return ladder[k] * mag * 100;
      }
      return 10 * mag * 100;
    }
    var top = niceTop(peak);
    function axisNum(centsVal) {
      var v = centsVal / 100;            // 分 → 元
      if (v >= 1000) {
        var k = v / 1000;
        return (Math.abs(k - Math.round(k)) < 0.05 ? Math.round(k) : k.toFixed(1)) + "K";
      }
      return String(Math.round(v));
    }
    var curMonth = ui.month;

    /* 支出柱：柱高 = 当月支出占上限的比例，当月用强调色。
       收入不在图里重复表达——hero 的"月度结余"已经是收入口径。 */
    var chart =
      '<div class="chart">' +
        '<div class="chart-top">' +
          '<span class="ck">每月支出</span>' +
          '<span class="cap">上限 ' + axisNum(top) + "</span>" +
        "</div>" +
        '<div class="plot">' +
          '<div class="bars">' +
            series.map(function (x) {
              var h = Math.max(2.5, (x.out / top) * 100);
              var cls = "bar" + (x.out > x.inc ? " over" : "") + (x.m === curMonth ? " on" : "");
              return '<div class="bar-col">' +
                '<span class="' + cls + '" style="height:' + h + '%"></span>' +
              "</div>";
            }).join("") +
          "</div>" +
        "</div>" +
        '<div class="x-axis">' +
          series.map(function (x) {
            return '<div class="xl' + (x.m === curMonth ? " on" : "") + '">' +
              "<b>" + Number(x.m.slice(5)) + "月</b>" +
              "<em>" + axisNum(x.out) + "</em></div>";
          }).join("") +
        "</div>" +
      "</div>";

    var head =
      '<div class="topbar">' +
        '<div class="icon-btn" data-act="toggleMenu">' + iconOf("menu") + "</div>" +
        "<h1>账单</h1>" +
        '<div class="icon-btn" data-act="goStats">' + iconOf("clock") + "</div></div>" +
      '<div class="month-line"><span data-act="prevMonth">‹</span><b>' + esc(label) + '</b><span data-act="nextMonth">›</span></div>' +
      '<div class="hero">' +
        '<div class="label">余额 · 全部账户</div>' +
        '<div class="big"><span class="cur">¥</span>' + money(total) + "</div>" +
        '<div class="delta ' + (delta < 0 ? "down" : "up") + '">月度结余 <b>' +
          (delta >= 0 ? "+" : "-") + "¥" + money(Math.abs(delta)) + "</b></div>" +
      "</div>";

    var listHtml = s.list.length
      ? groupEntries(s.list)
      : '<div class="empty"><span class="big-emoji">🪶</span>这个月还是空白，点右下角记一笔</div>';

    return head + chart + listHtml;
  }

  function groupEntries(list) {
    var order = [];
    var map = {};
    list.forEach(function (e) {
      if (!map[e.day]) { map[e.day] = []; order.push(e.day); }
      map[e.day].push(e);
    });
    return order.map(function (day) {
      var rows = map[day];
      var outSum = rows.filter(function (r) { return r.flow === "out"; }).reduce(function (a, b) { return a + b.cents; }, 0);
      var inSum = rows.filter(function (r) { return r.flow === "in"; }).reduce(function (a, b) { return a + b.cents; }, 0);
      var isOut = outSum > 0;
      var rows_html = rows.map(function (e) {
        var t = tagById(e.tagId);
        var w = walletById(e.walletId);
        return (
          '<div class="entry" data-act="editEntry" data-id="' + esc(e.id) + '">' +
            '<div class="glyph">' + iconOf(t.id) + "</div>" +
            '<div class="body">' +
              '<div class="title">' + esc(e.memo || t.name) + "</div>" +
              '<div class="meta"><span>' + esc(w.name) + "</span><span>" + esc(t.name) + "</span></div>" +
            "</div>" +
            '<div class="amt ' + (e.flow === "in" ? "in" : "out") + '">' +
              (e.flow === "in" ? "+" : "-") + money(e.cents) +
            "</div>" +
          "</div>"
        );
      }).join("");
      return (
        '<div class="entry-group">' +
          '<div class="daybar"><span>' + day + '</span><span class="sum ' + (isOut ? "" : "in") + '">' +
            (isOut ? "-¥" + money(outSum) : "+¥" + money(inSum)) + "</span></div>" +
          rows_html +
        "</div>"
      );
    }).join("");
  }

  function viewEntry(params) {
    var editing = params.id ? db.entries.filter(function (e) { return e.id === params.id; })[0] : null;
    if (editing && !ui._loaded) {
      ui.flow = editing.flow;
      ui.tagId = editing.tagId;
      ui.walletId = editing.walletId;
      ui.toWalletId = editing.toWalletId || "w_bank";
      ui.day = editing.day;
      ui.memo = editing.memo || "";
      ui.draft = (editing.cents / 100).toFixed(2);
      ui._loaded = true;
    }

    var tabs = [
      { k: "out", n: "支出" },
      { k: "in", n: "收入" },
      { k: "move", n: "转账" }
    ].map(function (t) {
      return '<div class="flow-tab ' + (ui.flow === t.k ? "on" : "") + '" data-act="setFlow" data-v="' + t.k + '">' + t.n + "</div>";
    }).join("");

    var tagsHtml = "";
    if (ui.flow !== "move") {
      var tags = db.tags.filter(function (t) { return t.flow === (ui.flow === "in" ? "in" : "out"); });
      tagsHtml =
        '<div class="card">' +
          '<div class="card-title">分类</div>' +
          '<div class="tag-grid">' +
            tags.map(function (t) {
              return '<div class="tag-cell ' + (ui.tagId === t.id ? "on" : "") + '" data-act="setTag" data-v="' + t.id + '">' +
                '<span class="g">' + iconOf(t.id) + "</span><span>" + esc(t.name) + "</span></div>";
            }).join("") +
          "</div>" +
        "</div>";
    }

    var walletsHtml =
      '<div class="card">' +
        '<div class="card-title">' + (ui.flow === "move" ? "从哪转出" : "账户") + "</div>" +
        '<div class="tag-grid cols-4">' +
          db.wallets.map(function (w) {
            return '<div class="tag-cell ' + (ui.walletId === w.id ? "on" : "") + '" data-act="setWallet" data-v="' + w.id + '">' +
              '<span class="g">' + iconOf(w.id, iconOf("w_cash")) + "</span><span>" + esc(w.name) + "</span></div>";
          }).join("") +
        "</div>" +
        (ui.flow === "move"
          ? '<div class="card-title" style="margin-top:14px">转到哪个账户</div><div class="tag-grid cols-4">' +
            db.wallets.map(function (w) {
              var dis = w.id === ui.walletId ? "opacity:.35" : "";
              return '<div class="tag-cell ' + (ui.toWalletId === w.id ? "on" : "") + '" style="' + dis + '" data-act="setToWallet" data-v="' + w.id + '">' +
                '<span class="g">' + iconOf(w.id, iconOf("w_cash")) + "</span><span>" + esc(w.name) + "</span></div>";
            }).join("") + "</div>"
          : "") +
      "</div>";

    var meta =
      '<div class="card">' +
        '<div class="field-row"><label>日期</label><input type="date" data-act="setDay" value="' + esc(ui.day) + '"></div>' +
        '<div class="field-row"><label>备注</label><input type="text" data-act="setMemo" placeholder="写点什么" value="' + esc(ui.memo) + '"></div>' +
      "</div>";

    var num = ui.draft ? money(Math.round(parseFloat(ui.draft || "0") * 100)) : "0.00";
    var amountBox =
      '<div class="amount-box">' +
        '<div class="cap">' + (ui.flow === "in" ? "收入金额" : ui.flow === "move" ? "转账金额" : "支出金额") + "</div>" +
        '<div class="amount-display"><span class="cur">¥</span>' +
          '<span class="num ' + (ui.draft ? "" : "placeholder") + '">' + num + "</span></div>" +
      "</div>";

    return (
      '<div class="topbar"><div><h1>' + (editing ? "改一笔" : "记一笔") + '</h1><div class="sub">随手记，不用想太多</div></div>' +
        '<div class="icon-btn" data-act="back">✕</div></div>' +
      '<div class="flow-tabs">' + tabs + "</div>" +
      amountBox + tagsHtml + walletsHtml + meta +
      keypad(editing)
    );
  }

  function keypad(editing) {
    // 计算器式布局：7 8 9 ⌫ / 4 5 6 清空 / 1 2 3 . / 00 0 记下(跨两格)
    var rows = [
      ["7", "8", "9", "⌫"],
      ["4", "5", "6", "清空"],
      ["1", "2", "3", "."],
      ["00", "0"]
    ];
    var html = "";
    rows.forEach(function (row) {
      row.forEach(function (k) {
        var fn = k === "⌫" || k === "清空";
        html += '<div class="key ' + (fn ? "fn" : "") + '" data-act="key" data-v="' + k + '">' + k + "</div>";
      });
      if (row.length === 2) {
        html += '<div class="key go wide" data-act="saveEntry">' + (editing ? "保存" : "记下") + "</div>";
      }
    });
    if (editing) {
      html += '<div class="key fn wide" data-act="delEntry" data-id="' + esc(editing.id) + '">删除这笔</div>';
    }
    return '<div class="pad">' + html + "</div>";
  }

  /* ================= 视图：统计 ================= */

  function viewStats() {
    var s = summarize(ui.month);
    var parts = ui.month.split("-");
    var prevD = new Date(Number(parts[0]), Number(parts[1]) - 2, 1);
    var nextD = new Date(Number(parts[0]), Number(parts[1]), 1);
    var prevLabel = Number(prevD.getMonth() + 1) + "月";
    var nextLabel = Number(nextD.getMonth() + 1) + "月";

    var isOut = ui.statsFlow !== "in";
    var flow = isOut ? "out" : "in";
    var rows = isOut ? s.top : s.topIn;
    var total = isOut ? s.out : s.inc;
    var days = new Date(Number(parts[0]), Number(parts[1]), 0).getDate();
    var count = s.list.filter(function (e) { return e.flow === flow; }).length;

    var nav =
      '<div class="month-nav">' +
        '<span class="nm" data-act="prevMonth">' + prevLabel + "</span>" +
        '<span class="nm on">' + parts[0] + "年" + Number(parts[1]) + "月</span>" +
        '<span class="nm" data-act="nextMonth">' + nextLabel + "</span>" +
      "</div>";

    var hero =
      '<div class="stat-hero">' +
        '<div class="big' + (isOut ? "" : " in") + '"><span class="cur">¥</span>' + money(total) + "</div>" +
        '<div class="meta">' + count + " 笔 · 日均 ¥" + money(Math.round(total / days)) + "</div>" +
      "</div>";

    if (!rows.length) {
      return (
        '<div class="topbar"><div class="icon-btn" data-act="back">‹</div><h1>分析</h1><div class="icon-btn"></div></div>' +
        nav + segHtml() + hero +
        '<div class="empty">这个月还没有' + (isOut ? "支出" : "收入") + '记录</div>'
      );
    }

    function segHtml() {
      return (
        '<div class="seg">' +
          '<button class="' + (isOut ? "on" : "") + '" data-act="statsFlow" data-v="out">支出</button>' +
          '<button class="' + (!isOut ? "on" : "") + '" data-act="statsFlow" data-v="in">收入</button>' +
        "</div>"
      );
    }

    // 前 6 类画环，剩下的合并成「其他」，明细表与图例完全对齐。
    // 颜色用同色相明度阶梯（墨 → 浅灰），不用彩虹色分类。
    var STEPS = ["#0e0e10", "#3c3c44", "#6a6a72", "#9a9aa2", "#c4c4cc", "#e2e2e8"];
    var head = rows.slice(0, 6).map(function (t) {
      var tag = tagById(t.id);
      return { id: t.id, name: tag.name, cents: t.cents, pct: t.pct };
    });
    var rest = rows.slice(6).reduce(function (a, t) { return a + t.cents; }, 0);
    if (rest > 0) {
      head.push({ id: "t_misc", name: "其他 " + (rows.length - 6) + " 类", cents: rest, pct: total ? rest / total : 0 });
    }
    head.forEach(function (t, i) { t.color = STEPS[i % STEPS.length]; });

    var R = 72, SW = 30, C = 2 * Math.PI * R, acc = 0;
    var segs = head.map(function (t) {
      var len = C * t.pct;
      var el = '<circle cx="95" cy="95" r="' + R + '" fill="none" stroke="' + t.color +
        '" stroke-width="' + SW + '" stroke-dasharray="' + len.toFixed(2) + " " + (C - len).toFixed(2) +
        '" stroke-dashoffset="' + (-acc).toFixed(2) + '" transform="rotate(-90 95 95)"></circle>';
      acc += len;
      return el;
    }).join("");

    var donut =
      '<div class="donut-row">' +
        '<svg class="donut" viewBox="0 0 190 190">' +
          '<circle cx="95" cy="95" r="' + R + '" fill="none" stroke="#f2f2f5" stroke-width="' + SW + '"></circle>' +
          segs +
          '<text x="95" y="95" fill="#0e0e10" font-size="21" font-weight="700" text-anchor="middle" dominant-baseline="central">' +
            head.length + " 类</text>" +
        "</svg>" +
        '<div class="legend">' +
          head.map(function (t) {
            return '<div class="lg"><i style="background:' + t.color + '"></i>' +
              "<span>" + esc(t.name) + "</span><b>" + Math.round(t.pct * 100) + "%</b></div>";
          }).join("") +
        "</div>" +
      "</div>";

    var table =
      '<div class="card-title">分类明细</div>' +
      '<div class="rk-list">' +
        head.map(function (t) {
          var cnt = t.id === "t_misc"
            ? s.list.filter(function (e) {
                return e.flow === flow && rows.slice(6).some(function (r) { return r.id === e.tagId; });
              }).length
            : s.list.filter(function (e) { return e.flow === flow && e.tagId === t.id; }).length;
          var pct = Math.round(t.pct * 100);
          return '<div class="rk">' +
            '<div class="g">' + iconOf(t.id) + "</div>" +
            '<div class="body">' +
              '<div class="r1"><span class="nm">' + esc(t.name) + "</span>" +
                '<span class="amt">¥' + money(t.cents) + "</span></div>" +
              '<div class="r2"><span class="track"><i style="width:' + Math.max(5, pct) + '%"></i></span>' +
                '<span class="pc">' + cnt + " 笔 · " + pct + "%</span></div>" +
            "</div>" +
          "</div>";
        }).join("") +
      "</div>";

    return (
      '<div class="topbar"><div class="icon-btn" data-act="back">‹</div><h1>分析</h1><div class="icon-btn"></div></div>' +
      nav + segHtml() + hero + donut + table
    );
  }

  function viewAssets() {
    var bal = walletBalances();
    var total = db.wallets.reduce(function (s, w) { return s + (bal[w.id] || 0); }, 0);
    var rows = db.wallets.map(function (w) {
      var v = bal[w.id] || 0;
      return '<div class="wallet"><div class="left"><div class="g">' + iconOf(w.id, iconOf("w_cash")) + "</div>" +
        '<div><div class="nm">' + esc(w.name) + '</div><div class="sub">期初 ' + cash(w.opening) + "</div></div></div>" +
        '<div class="bal">' + cash(v) + "</div></div>";
    }).join("");

    // 资产构成条：一眼看出钱分布在哪（明度阶梯，不用彩色）
    var positive = db.wallets
      .map(function (w) { return { w: w, v: bal[w.id] || 0 }; })
      .filter(function (x) { return x.v > 0; })
      .sort(function (a, b) { return b.v - a.v; });
    var BARS = ["#0e0e10", "#4a4a52", "#8a8a92", "#b8b8c0", "#dcdce3"];
    var allocBar = positive.length
      ? '<div class="alloc"><div class="alloc-bar">' +
          positive.map(function (x, i) {
            return '<i style="flex:' + x.v + ";background:" + BARS[i % BARS.length] + '"></i>';
          }).join("") +
        "</div>" +
        '<div class="alloc-key">' +
          positive.filter(function (x) { return x.v / total >= 0.04; }).map(function (x, i) {
            return '<span><i style="background:' + BARS[i % BARS.length] + '"></i>' +
              esc(x.w.name) + " " + Math.round((x.v / total) * 100) + "%</span>";
          }).join("") +
        "</div></div>"
      : "";

    return (
      '<div class="topbar"><div><h1>资产</h1><div class="sub">账户与余额</div></div></div>' +
      '<div class="hero"><div class="label">账户合计</div>' +
        '<div class="big"><span class="cur">¥</span>' + money(total) + "</div>" +
        '<div class="row"><div class="cell"><i>账户数</i><b>' + db.wallets.length + "</b></div>" +
        '<div class="cell"><i>本月支出</i><b>¥' + money(summarize(ui.month).out) + "</b></div></div>" +
      "</div>" +
      allocBar +
      '<div class="card"><div class="card-title">明细</div>' + rows + "</div>" +
      '<div class="card"><div class="card-title">说明</div>' +
        '<div class="list-row"><span>余额口径</span><span class="hint">期初 + 收入 − 支出</span></div>' +
        '<div class="list-row"><span>转账</span><span class="hint">只做账户间搬移，不计收支</span></div>' +
      "</div>"
    );
  }

  /* ================= 视图：设置 ================= */

  function viewConfig() {
    var size = 0;
    try { size = (localStorage.getItem(STORE_KEY) || "").length; } catch (e) { size = 0; }
    return (
      '<div class="topbar"><div><h1>设置</h1><div class="sub">数据都在本机</div></div></div>' +
      '<div class="card"><div class="card-title">数据</div>' +
        '<div class="list-row"><span>记录条数</span><span class="hint">' + db.entries.length + " 条</span></div>" +
        '<div class="list-row"><span>占用空间</span><span class="hint">' + (size / 1024).toFixed(1) + " KB</span></div>" +
        '<div class="list-row" data-act="exportData"><span>导出备份</span><span class="hint">下载 JSON ›</span></div>' +
        '<div class="list-row" data-act="resetData"><span>清空重来</span><span class="hint">全部记录与账户重置 ›</span></div>' +
      "</div>" +
      '<div class="card"><div class="card-title">关于</div>' +
        '<div class="list-row"><span>数据位置</span><span class="hint">本机 localStorage</span></div>' +
        '<div class="list-row"><span>联网</span><span class="hint">不需要</span></div>' +
      "</div>"
    );
  }

  /* ================= 路由与渲染 ================= */

  var TABS = [
    { href: "#/book", key: "book", ic: "nav_book", name: "账本" },
    { href: "#/stats", key: "stats", ic: "nav_stats", name: "统计" },
    { href: "#/assets", key: "assets", ic: "nav_assets", name: "资产" },
    { href: "#/config", key: "config", ic: "nav_config", name: "设置" }
  ];

  function parseHash() {
    var h = (location.hash || "#/book").replace(/^#/, "");
    var qs = "";
    var qi = h.indexOf("?");
    if (qi >= 0) { qs = h.slice(qi + 1); h = h.slice(0, qi); }
    var params = {};
    qs.split("&").forEach(function (kv) {
      if (!kv) return;
      var p = kv.split("=");
      params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
    });
    var seg = h.split("/").filter(Boolean);
    return { view: seg[0] || "book", params: params };
  }

  function render() {
    var r = parseHash();
    var app = document.getElementById("app");
    var body;
    if (r.view === "entry") body = viewEntry(r.params);
    else if (r.view === "stats") body = viewStats();
    else if (r.view === "assets") body = viewAssets();
    else if (r.view === "config") body = viewConfig();
    else body = viewBook();

    var isEntry = r.view === "entry";
    var tabs = isEntry
      ? ""
      : '<nav class="tabbar">' + TABS.map(function (t) {
          return '<a class="tab ' + (t.key === r.view ? "on" : "") + '" href="' + t.href + '">' +
            '<span class="ic">' + iconSolid(t.ic) + "</span><span>" + t.name + "</span></a>";
        }).join("") + "</nav>";

    var fab = (r.view === "book" || r.view === "stats")
      ? '<a class="fab" href="#/entry" aria-label="记一笔">＋</a>'
      : "";

    app.className = "phone" + (isEntry ? " entry-page" : "");
    app.innerHTML = '<div class="view">' + body + "</div>" + tabs + fab;
  }

  /* ================= 交互 ================= */

  function toast(msg) {
    var el = document.createElement("div");
    el.className = "toast show";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () {
      el.className = "toast";
      setTimeout(function () { el.remove(); }, 220);
    }, 1200);
  }

  function shiftMonth(delta) {
    var p = ui.month.split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1 + delta, 1);
    ui.month = d.getFullYear() + "-" + pad(d.getMonth() + 1);
    render();
  }

  function keyInput(k) {
    if (k === "⌫") {
      ui.draft = ui.draft.slice(0, -1);
    } else if (k === "清空") {
      ui.draft = "";
    } else if (k === "00") {
      if (ui.draft && ui.draft.indexOf(".") < 0) ui.draft += "00";
    } else if (k === ".") {
      if (ui.draft.indexOf(".") < 0) ui.draft = (ui.draft || "0") + ".";
    } else {
      var dot = ui.draft.indexOf(".");
      if (dot >= 0 && ui.draft.length - dot > 2) return;
      if (ui.draft === "0") ui.draft = k;
      else ui.draft += k;
    }
    render();
    var pad = document.querySelector(".pad");
    if (pad) pad.scrollIntoView({ block: "end" });
  }

  function saveEntry(editingId) {
    var val = Math.round(parseFloat(ui.draft || "0") * 100);
    if (!val || val <= 0) { toast("先输入金额"); return; }
    if (ui.flow === "move" && ui.walletId === ui.toWalletId) { toast("转出转入不能一样"); return; }

    var payload = {
      flow: ui.flow,
      cents: val,
      tagId: ui.flow === "move" ? db.tags[0].id : ui.tagId,
      walletId: ui.walletId,
      toWalletId: ui.flow === "move" ? ui.toWalletId : undefined,
      day: ui.day,
      memo: ui.memo,
      origin: "manual"
    };

    if (editingId) {
      db.entries = db.entries.map(function (e) {
        return e.id === editingId ? Object.assign({}, e, payload) : e;
      });
      toast("已保存");
    } else {
      payload.id = uid("e");
      payload.at = Date.now();
      db.entries.unshift(payload);
      toast("记下了");
    }
    save();
    ui.draft = "";
    ui.memo = "";
    ui._loaded = false;
    location.hash = "#/book";
  }

  function deleteEntry(id) {
    if (!confirm("删除这笔记录？")) return;
    db.entries = db.entries.filter(function (e) { return e.id !== id; });
    save();
    toast("已删除");
    location.hash = "#/book";
  }

  function exportData() {
    var blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "随手账备份-" + ymd(new Date()) + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function resetData() {
    if (!confirm("清空所有记录？此操作不可撤销。")) return;
    db = { wallets: DEFAULTS.wallets.slice(), tags: DEFAULTS.tags.slice(), entries: [] };
    save();
    toast("已清空");
    render();
  }

  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-act]");
    if (!el) return;
    var act = el.getAttribute("data-act");
    var v = el.getAttribute("data-v");
    var id = el.getAttribute("data-id");

    if (act === "prevMonth") shiftMonth(-1);
    else if (act === "nextMonth") shiftMonth(1);
    else if (act === "setFlow") { ui.flow = v; if (v !== "move") { var f = db.tags.filter(function (t) { return t.flow === (v === "in" ? "in" : "out"); }); if (f.length) ui.tagId = f[0].id; } render(); }
    else if (act === "setTag") { ui.tagId = v; render(); }
    else if (act === "setWallet") { ui.walletId = v; render(); }
    else if (act === "setToWallet") { if (v === ui.walletId) { toast("与转出账户相同"); return; } ui.toWalletId = v; render(); }
    else if (act === "key") keyInput(v);
    else if (act === "saveEntry") saveEntry(id || null);
    else if (act === "delEntry") deleteEntry(id);
    else if (act === "editEntry") { ui._loaded = false; location.hash = "#/entry?id=" + encodeURIComponent(id); }
    else if (act === "back") { ui._loaded = false; location.hash = "#/book"; }
    else if (act === "statsFlow") { ui.statsFlow = v; render(); }
    else if (act === "goAssets") { location.hash = "#/assets"; }
    else if (act === "goStats") { location.hash = "#/stats"; }
    else if (act === "toggleMenu") { location.hash = "#/config"; }
    else if (act === "exportData") exportData();
    else if (act === "resetData") resetData();
  });

  document.addEventListener("input", function (ev) {
    var el = ev.target;
    var act = el.getAttribute && el.getAttribute("data-act");
    if (act === "setDay") ui.day = el.value;
    else if (act === "setMemo") ui.memo = el.value;
  });

  window.addEventListener("hashchange", function () { ui._loaded = false; render(); });

  /* ================= 启动 ================= */

  load();
  if (!location.hash) location.hash = "#/book";
  render();
})();
