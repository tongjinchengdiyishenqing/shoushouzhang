/* 长流 —— 应用脚本
 * 纯原生 JS，无框架、无依赖、无网络请求；数据全部落在 localStorage。
 * 路由：hash（#/book 账本、#/entry 记一笔、#/stats 统计、#/assets 资产、#/config 设置）
 */

(function () {
  "use strict";

  /* ================= 兜底：把没接住的异常留下来 =================
     release 版 WebView 不打印 console，页面一旦在 render 里抛异常，
     表现就是"界面卡住不动"——查不到任何线索。这里把最近一次错误写进
     localStorage，设置页「关于」里能看到，排查时不用连电脑。 */
  var ERR_KEY = "sz.lastError.v1";
  function keepError(msg) {
    try {
      localStorage.setItem(ERR_KEY, String(msg || "").slice(0, 400) + " @ " +
        new Date().toLocaleString("zh-CN"));
    } catch (e) {}
  }
  window.addEventListener("error", function (ev) {
    var where = (ev.filename || "").split("/").pop() + ":" + (ev.lineno || 0);
    keepError((ev.message || "script error") + " (" + where + ")");
  });
  window.addEventListener("unhandledrejection", function (ev) {
    var r = ev.reason;
    keepError("promise: " + ((r && (r.message || r)) || "unknown"));
  });

  /* ================= 存储 ================= */

  var STORE_KEY = "sz.book.v5";
  var APP_VERSION = "1.0.0";

  var DEFAULTS = {
    wallets: [
      // 初始余额一律 0：新用户从零开始，余额靠记账累出来。
      // 想设起始资金，去「账户」里改这个账户的期初。
      { id: "w_cash", name: "现金", glyph: "👛", opening: 0, color: "#C7912F", tint: "#FBF2E2" },
      { id: "w_pay", name: "移动支付", glyph: "📲", opening: 0, color: "#3E7FB0", tint: "#EAF1F7" },
      { id: "w_bank", name: "储蓄卡", glyph: "🏧", opening: 0, color: "#7B6BA8", tint: "#F0EDF8" },
      { id: "w_fund", name: "投资户", glyph: "📊", opening: 0, color: "#2F7D6E", tint: "#E8F3F0" }
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
    entries: [],
    /* 持仓：股数可以是小数（基金），价格一律用整数分 */
    holdings: []
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
        entries: raw.entries,
        holdings: Array.isArray(raw.holdings) ? raw.holdings : [],
        // 自动识别的学习结果：商户名 → 分类 id，用户改过一次就记住
        autoRules: raw.autoRules && typeof raw.autoRules === "object" ? raw.autoRules : {}
      };
    } else {
      db = { wallets: DEFAULTS.wallets.slice(), tags: DEFAULTS.tags.slice(), entries: seed(), holdings: [], autoRules: {} };
      save();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
    } catch (e) {
      /* 存储满了就静默失败，不影响使用 */
    }
    // 本地保存完就排一次云同步（没开同步时内部直接跳过）
    scheduleSync();
  }

  /* ================= 云同步（匿名账号 + 端到端加密） =================
     设计：打开就能用，不强制注册。首次开同步时静默建一个匿名账号，
     拿到 12 位同步码；换设备输码即可接管。
     加密在浏览器里做完再上传，后端只存密文——没有同步码谁也解不开。
     同步码 = 账号凭证 + 加密密钥的人类可读编码，别截图外传。 */

  var AUTH_KEY = "sz.auth.v1";
  /* 这台设备上的账本属于哪个账号。
     用户注销后换个号（或同名重注册）回来，如果本机旧账本还在，
     登录时的自动同步会把它推给新账号 —— 表现就是「注销重注册，老数据又回来了」。
     有了归属标记，登录时一看不是同一个号就先把本机清空，再走同步。 */
  var OWNER_KEY = "sz.owner.v1";

  function readOwner() {
    try { return localStorage.getItem(OWNER_KEY) || ""; } catch (e) { return ""; }
  }
  function writeOwner(id) {
    try { localStorage.setItem(OWNER_KEY, String(id || "")); } catch (e) {}
  }
  function dropOwner() {
    try { localStorage.removeItem(OWNER_KEY); } catch (e) {}
  }

  /* 本机账本不属于当前账号时，先"挪到一边"再同步。
     为什么不直接丢：那是用户真金白银记的账，一句提示就删掉是最不负责任的做法。
     为什么不直接推：推上去就是"新账号凭空多出一堆旧数据"，另一台设备再一看就全乱了。
     所以暂存：登录后云端说了算，本机这份等用户自己决定「并入 / 导出 / 丢弃」。 */
  var ORPHAN_KEY = "sz.orphan.v1";

  function readOrphan() {
    try { return JSON.parse(localStorage.getItem(ORPHAN_KEY) || "null"); } catch (e) { return null; }
  }
  function parkLocalBook(reason) {
    var n = (db.entries || []).length;
    var h = (db.holdings || []).length;
    if (!n && !h) { clearLocalBook(); return 0; }
    try {
      localStorage.setItem(ORPHAN_KEY, JSON.stringify({
        at: Date.now(), owner: readOwner() || "", reason: reason || "",
        entries: n, holdings: h, db: db
      }));
    } catch (e) {}
    clearLocalBook();
    return n;
  }
  function dropOrphan() {
    try { localStorage.removeItem(ORPHAN_KEY); } catch (e) {}
  }
  function mergeOrphan() {
    var o = readOrphan();
    if (!o || !o.db) { toast("没有暂存的账本"); return; }
    var before = db.entries.length;
    db = mergeDb(db, o.db);
    save();
    dropOrphan();
    render();
    toast("已并入 " + (db.entries.length - before) + " 条");
    syncPush().catch(function () {});
  }
  function exportOrphan() {
    var o = readOrphan();
    if (!o || !o.db) { toast("没有暂存的账本"); return; }
    var blob = new Blob([JSON.stringify(o.db, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "长流-暂存-" + ymd(new Date()) + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast("已导出");
  }
  /* 接口地址：默认官方后端；想接自建服务器或本地联调，
     把 localStorage['sz.apiBase.v1'] 设成自己的 /api/v1 地址就行 */
  var AUTH_API = (function () {
    try {
      var o = localStorage.getItem("sz.apiBase.v1");
      if (o) return String(o).replace(/\/+$/, "");
    } catch (e) {}
    return "https://v.yutiqu.eu.cc/api/v1";
  })();
  var SYNC_DEBOUNCE = 3000;

  function loadAuth() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null") || null; }
    catch (e) { return null; }
  }
  function saveAuth() {
    try {
      if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
      else localStorage.removeItem(AUTH_KEY);
    } catch (e) { /* 存不下不影响本机记账 */ }
  }

  var auth = loadAuth();
  var _szKey = null;

  function apiFetch(path, opts) {
    opts = opts || {};
    var headers = { "Content-Type": "application/json" };
    if (auth && auth.token) headers.Authorization = "Bearer " + auth.token;
    opts.headers = headers;
    return fetch(AUTH_API + path, opts).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        return { ok: r.ok, status: r.status, body: j };
      });
    });
  }

  /* 后端的错误体有两种：字符串（HTTPException 的 detail）
     和数组（FastAPI 422 校验失败，每个元素是一个 {loc, msg, ...} 对象）。
     直接塞进 toast 或 innerHTML，数组就变成一句 "[object Object]"——
     用户看到这五个字，等于什么都没说，只会以为 App 坏了。 */
  var ERR_FIELD_CN = {
    title: "标题", amountCents: "金额", reason: "理由", category: "分类",
    anonymous: "匿名", deadlineHours: "截止时间", content: "内容", choice: "选择",
    comment: "评论", username: "用户名", password: "密码", cipher: "账本数据",
    revision: "版本号", text: "内容", source: "来源", items: "条目", code: "代码"
  };

  function errMsgCn(it) {
    var m = String((it && it.msg) || "");
    var r;
    if ((r = m.match(/should have at most (\d+) char/i))) return "最多 " + r[1] + " 个字";
    if ((r = m.match(/should have at least (\d+) char/i))) return "至少 " + r[1] + " 个字";
    if ((r = m.match(/greater than (\d+)/i))) return "要大于 " + r[1];
    if ((r = m.match(/less than or equal to (\d+)/i))) return "不能超过 " + r[1];
    if (/field required/i.test(m)) return "必填";
    if (/valid integer/i.test(m)) return "要填整数";
    if (/valid string/i.test(m)) return "要填文字";
    if (/valid boolean/i.test(m)) return "取值不对";
    if (/valid list/i.test(m)) return "格式不对";
    if (/match pattern/i.test(m)) return "格式不对";
    return m;
  }

  /* 把任意错误体翻成一句能看懂的中文。永远返回字符串。 */
  function errText(body, fallback) {
    var fb = fallback || "出错了，稍后再试";
    if (body === null || body === undefined) return fb;
    var d = body;
    if (typeof body === "object" && !Array.isArray(body)) {
      if (body.detail !== undefined && body.detail !== null && body.detail !== "") d = body.detail;
      else if (body.error !== undefined && body.error !== null && body.error !== "") d = body.error;
      else if (body.message !== undefined && body.message !== null && body.message !== "") d = body.message;
      else return fb;
    }
    if (typeof d === "string") return String(d).trim() || fb;
    if (typeof d === "number" || typeof d === "boolean") return String(d);
    if (Array.isArray(d)) {
      var out = [];
      for (var i = 0; i < d.length && i < 3; i++) {
        var it = d[i];
        if (typeof it === "string") { if (it.trim()) out.push(it.trim()); continue; }
        if (it && typeof it === "object") {
          var field = "";
          if (it.loc && it.loc.length) {
            var k = String(it.loc[it.loc.length - 1]);
            field = ERR_FIELD_CN[k] || (k === "body" ? "" : k);
          }
          var m = errMsgCn(it);
          if (m) out.push(field ? field + " " + m : m);
        }
      }
      return out.length ? out.join("；") : fb;
    }
    if (d && typeof d === "object") {
      var m2 = errMsgCn(d);
      return m2 || fb;
    }
    return fb;
  }

  /* 登录时派生一次、导出成 raw 存本地，之后自动同步直接复用：
     既不用每次输密码，也不用每次重算 20 万轮 PBKDF2 */
  var KEY_STORE = "sz.syncKey.v1";
  function saveKeyRaw(b64) { try { localStorage.setItem(KEY_STORE, b64); } catch (e) {} }
  function clearKeyRaw() { try { localStorage.removeItem(KEY_STORE); } catch (e) {} }

  function syncKey() {
    if (!window.SZSync) return Promise.reject(new Error("加密模块未加载"));
    if (_szKey) return Promise.resolve(_szKey);
    var raw = "";
    try { raw = localStorage.getItem(KEY_STORE) || ""; } catch (e) { raw = ""; }
    if (!raw) return Promise.reject(new Error("登录已过期，请重新登录"));
    return window.SZSync.importKeyRaw(raw).then(function (k) { _szKey = k; return k; });
  }

  /* 登录态失效（账号被删/密码改过/token 过期）：必须让用户看见，
     否则同步一直静默失败，用户只会觉得"数据莫名其妙没了" */
  function handleAuthExpired() {
    if (!auth) return;
    auth = null;
    _szKey = null;
    saveAuth();
    clearKeyRaw();
    toast("登录已过期，请重新登录", null, null, 3200);
    render();
  }

  function syncPush(force, depth) {
    depth = depth || 0;
    if (!auth || !auth.token) return Promise.resolve({ skipped: true });
    if (ui.syncing) return Promise.resolve({ skipped: true });
    if (ui.applyingRemote) return Promise.resolve({ skipped: true });
    ui.syncing = true;
    return syncKey().then(function (key) {
      return window.SZSync.encrypt(key, db).then(function (cipher) {
        return apiFetch("/sync/push", {
          method: "PUT",
          body: JSON.stringify({ cipher: cipher, revision: auth.revision || 0 })
        });
      });
    }).then(function (res) {
      ui.syncing = false;
      if (res.status === 401) {
        handleAuthExpired();
        return { authExpired: true };
      }
      if (res.status === 409) {
        // 别的设备先推过了：拉下来合并再自动重推，不打扰用户。
        // 只重试一次，避免两端持续互相顶导致的死循环。
        return syncPull().then(function (pulled) {
          if (!pulled || !pulled.data || !Array.isArray(pulled.data.entries)) {
            return { conflict: true };
          }
          db = mergeDb(db, pulled.data);
          auth.revision = pulled.revision;
          saveAuth();
          if (parseHash().view === "config" && !ui.authPanel) render();
          if (depth < 1) return syncPush(true, depth + 1);
          return { conflict: true };
        });
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      auth.revision = res.body.revision;
      auth.lastSyncAt = Date.now();
      saveAuth();
      // 推完要把「上次同步 / v几」刷出来，否则界面永远停在 v0
      if (parseHash().view === "config" && !ui.authPanel) render();
      return { ok: true, revision: auth.revision };
    }).catch(function (e) {
      ui.syncing = false;
      throw e;
    });
  }

  function syncPull() {
    if (!auth || !auth.token) return Promise.reject(new Error("还没开启同步"));
    return apiFetch("/sync/pull").then(function (res) {
      if (res.status === 401) {
        handleAuthExpired();
        return { authExpired: true };
      }
      if (res.status === 404) return { empty: true };
      if (!res.ok) throw new Error("HTTP " + res.status);
      return syncKey().then(function (key) {
        return window.SZSync.decrypt(key, res.body.cipher).then(function (obj) {
          return { data: obj, revision: res.body.revision };
        });
      });
    });
  }

  var _syncTimer = null;
  function scheduleSync() {
    if (!auth || !auth.token) return;
    if (ui.applyingRemote) return;
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(function () {
      _syncTimer = null;
      syncPush(true).catch(function (e) {
        var msg = (e && e.message) || "";
        /* 没有同步密钥（本地密钥被清）只影响云端同步，本机记账照常。
           这种情况每记一笔都弹「登录已过期」纯属骚扰，
           改成静默——用户进设置页时会看到同步状态，那儿再提示。 */
        if (msg.indexOf("登录已过期") >= 0 || msg.indexOf("加密模块") >= 0) return;
        // 其余是网络类失败，不能静默吞：否则用户以为存上了其实没有
        toast("同步失败：" + (msg || "网络不通"), null, null, 2600);
      });
    }, SYNC_DEBOUNCE);
  }

  /* 注册 / 登录：拿到 token 后，用「用户名 + 密码」派生加密密钥并存到本地 */
  function doAuth(mode) {
    var u = String(ui.authUser || "").trim();
    var p = String(ui.authPwd || "");
    if (!u) { toast("填个用户名"); return; }
    if (!p) { toast("填个密码"); return; }
    if (mode === "register" && p.length < 6) { toast("密码至少 6 位"); return; }
    if (ui.syncing) return;
    ui.syncing = true;
    apiFetch(mode === "register" ? "/auth/register" : "/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: u, password: p })
    }).then(function (res) {
      if (!res.ok) throw new Error(errText(res.body, "HTTP " + res.status));
      auth = {
        token: res.body.token, userId: res.body.userId,
        username: res.body.username, revision: 0, lastSyncAt: 0
      };
      /* 云端优先：本机账本必须"确认属于这个账号"才能参与同步。
         owner 为空也不算自己人 —— 老版本客户端没写过 owner，
         那批数据很可能来自一个已经注销的账号；一旦推上去，新账号就被灌满旧数据。
         处理方式不是删，是暂存（见 parkLocalBook）。 */
      var prevOwner = readOwner();
      var localCount = (db.entries || []).length + (db.holdings || []).length;
      var foreign = String(prevOwner) !== String(auth.userId);
      if (foreign && (prevOwner || localCount)) {
        var parked = parkLocalBook("本机账本不属于 " + auth.username);
        if (parked) {
          toast("本机有 " + parked + " 条不属于这个账号的记录，已暂存（设置里可并入或导出）", null, null, 3600);
        }
      }
      writeOwner(auth.userId);
      saveAuth();
      return window.SZSync.deriveKeyFromPassword(p, auth.username).then(function (key) {
        _szKey = key;
        return window.SZSync.exportKeyRaw(key);
      });
    }).then(function (raw) {
      saveKeyRaw(raw);
      ui.syncing = false;
      ui.authUser = ""; ui.authPwd = ""; ui.authPanel = "";
      toast(mode === "register" ? "注册成功" : "登录成功");
      // 登录后落到账本页，别停在配置页
      if (location.hash !== "#/book") location.hash = "#/book";
      render();
      return afterAuthPull();
    }).catch(function (e) {
      ui.syncing = false;
      var msg = e.message || "网络不通";
      // 429 = 撞上注册/登录限流（每 IP 每分钟 5 次），说人话，别让用户以为是密码错了
      if (/429/.test(msg)) msg = "操作太频繁，等一分钟再试";
      toast(msg, null, null, 2600);
      render();
    });
  }

  /* 登录成功后拉一次云端：有数据就问要不要覆盖本机；没有就把本机推上去 */
  /* 多端合并：按 id 取并集，同 id 以本机为准（本机刚改过），账本按日期倒序 */
  function mergeDb(local, remote) {
    function mergeList(base, over) {
      var map = {};
      (base || []).forEach(function (x) { if (x && x.id) map[x.id] = x; });
      (over || []).forEach(function (x) { if (x && x.id) map[x.id] = x; });
      return Object.keys(map).map(function (k) { return map[k]; });
    }
    var remoteEntries = (remote && remote.entries) || [];
    var entries = mergeList(remoteEntries, local.entries).sort(function (a, b) {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      return (b.at || 0) - (a.at || 0);
    });
    var wallets = mergeList(remote && remote.wallets, local.wallets);
    var tags = mergeTags(mergeList(remote && remote.tags, local.tags));
    var holdings = mergeList(remote && remote.holdings, local.holdings);
    // 自动分类的学习结果也要并进来，否则登录/同步一次就白学了
    var rules = Object.assign({}, (remote && remote.autoRules) || {});
    Object.keys((local && local.autoRules) || {}).forEach(function (k) {
      rules[k] = local.autoRules[k];
    });
    return {
      wallets: wallets.length ? wallets : DEFAULTS.wallets.slice(),
      tags: tags.length ? tags : DEFAULTS.tags.slice(),
      entries: entries,
      holdings: holdings,
      autoRules: rules
    };
  }

  /* 登录后自动对齐云端：不弹窗、不覆盖，两边按 id 合并后推回云端。
     多设备时任何一端登录都只是「补齐」，不存在「选错就丢数据」。 */
  function afterAuthPull() {
    return syncPull().then(function (pulled) {
      if (!pulled || pulled.empty) {
        if (pulled && pulled.authExpired) return null;
        // 云端还没有数据：把本机推上去
        return syncPush(true).catch(function () {});
      }
      if (!pulled.data || !Array.isArray(pulled.data.entries)) return null;

      var before = db.entries.length;
      db = mergeDb(db, pulled.data);
      auth.revision = pulled.revision;
      auth.lastSyncAt = Date.now();
      saveAuth();
      // save() 会触发一次自动推送，把合并结果写回云端
      save();
      if (parseHash().view === "config") render();
      if (db.entries.length !== before) {
        toast("已合并云端数据，共 " + db.entries.length + " 条");
      }
      return null;
    }).catch(function (e) {
      toast("云端数据拉取失败：" + (e.message || ""), null, null, 2400);
    });
  }

  /* 进到设置页就顺手拉一次云端并合并：这样别的设备刚记的账能看见，
     不必等用户手动点「立即同步」。10 秒内不重复拉，避免来回切页刷接口。 */
  var _lastPullAt = 0;
  function pullMergeIfNeeded() {
    if (!auth || !auth.token) return;
    if (ui.syncing || ui.applyingRemote) return;
    var now = Date.now();
    if (now - _lastPullAt < 10000) return;
    _lastPullAt = now;
    syncPull().then(function (pulled) {
      if (!pulled || !pulled.data || !Array.isArray(pulled.data.entries)) return;
      var before = db.entries.length;
      var merged = mergeDb(db, pulled.data);
      if (merged.entries.length === before) {
        // 没有新东西：只更新版本号，不写库也不重绘，避免无谓抖动
        if (pulled.revision > (auth.revision || 0)) {
          auth.revision = pulled.revision;
          saveAuth();
        }
        return;
      }
      db = merged;
      auth.revision = pulled.revision;
      auth.lastSyncAt = Date.now();
      saveAuth();
      save();
      if (parseHash().view === "config") render();
      toast("已合并云端数据，共 " + db.entries.length + " 条");
    }).catch(function () { /* 断网就静默跳过，下次再试 */ });
  }

  /* 退出登录 = 本机不再保留这个账号的任何数据。
     但如果云端还没拿到最新数据就清本机，等于把用户的账删了，
     所以顺序必须是：先推上去 → 确认成功 → 再清。推不上去就问用户。 */
  function clearLocalBook() {
    db = { wallets: DEFAULTS.wallets.slice(), tags: DEFAULTS.tags.slice(), entries: [], holdings: [] };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) {}
  }

  function finishLogout(msg) {
    try {
      Object.keys(localStorage)
        .filter(function (k) { return k.indexOf(DC_CACHE_KEY) === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    // 退出后立刻回到登录页（render 会因为 !auth 自动切过去）
    if (location.hash !== "#/book") location.hash = "#/book";
    apiFetch("/auth/logout", { method: "POST" }).catch(function () {});
    auth = null;
    _szKey = null;
    saveAuth();
    clearKeyRaw();
    clearLocalBook();
    dropOwner();
    toast(msg || "已退出，本机数据已清除", null, null, 2800);
    render();
  }

  function logoutAccount() {
    if (!auth) return;
    if (!confirm("退出登录？\n\n本机这份账本会被清除（避免换人用这台设备时看到你的账）。\n数据以云端备份为准，重新登录即可恢复。")) return;
    toast("正在保存到云端…");
    // 先确保云端是最新的
    syncPush(true).then(function (r) {
      if (r && r.authExpired) return;          // 401 已提示，不再继续
      if (r && r.conflict) {
        // 别的设备先推过：合并一次再推
        return syncPull().then(function (pulled) {
          if (pulled && pulled.data && Array.isArray(pulled.data.entries)) {
            db = mergeDb(db, pulled.data);
            auth.revision = pulled.revision;
            saveAuth();
            return syncPush(true);
          }
        }).then(function () { finishLogout(); });
      }
      finishLogout();
    }).catch(function (e) {
      // 推不上去：说清楚后果让用户决定
      if (!confirm("云端同步失败（" + (e.message || "网络不通") + "）。\n\n本机现有 " +
          db.entries.length + " 条记录，云端可能不是最新的。\n\n" +
          "现在退出会清除本机数据，未上传的部分将无法恢复。\n\n仍要退出？")) return;
      finishLogout("已退出（有数据未上传）");
    });
  }

  function deleteAccount() {
    if (!confirm("注销账号？\n\n云端数据和账号会被永久删除，无法恢复。\n本机账本也会一并清除。")) return;
    if (!confirm("再确认一次：这个操作不可撤销，确定注销？")) return;
    apiFetch("/auth/account", { method: "DELETE" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      auth = null;
      _szKey = null;
      saveAuth();
      clearKeyRaw();
      clearLocalBook();
      dropOwner();
      toast("账号已注销，本机数据已清除", null, null, 2800);
      render();
    }).catch(function (e) {
      toast("注销失败：" + (e.message || ""), null, null, 2400);
    });
  }

  function syncNow() {
    if (!auth) return;
    toast("正在同步…");
    // 必须先拉下来合并再推：只推不拉会把别的设备刚记的覆盖掉
    syncPull().then(function (pulled) {
      if (pulled && pulled.authExpired) return { authExpired: true };
      if (pulled && pulled.data && Array.isArray(pulled.data.entries)) {
        db = mergeDb(db, pulled.data);
        auth.revision = pulled.revision;
        saveAuth();
      }
      return syncPush(true);
    }).then(function (r) {
      // 401 已经由 handleAuthExpired 提示过，这里绝不能再报「已同步」
      if (r && r.authExpired) return;
      if (r && r.skipped) return;
      if (r && r.conflict) {
        // 极少见（两端几乎同时改）：已经自动合并过一轮，再点一次即可收敛
        toast("另一端也在改，已合并，请再点一次", null, null, 2600);
        render();
        return;
      }
      toast("已同步");
      render();
    }).catch(function (e) {
      toast("同步失败：" + (e.message || "网络不通"), null, null, 2600);
    });
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
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    trash: '<path d="M4.5 7h15"/><path d="M9.5 7V5.3a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3V7"/><path d="M6.6 7l.85 12.05A1.7 1.7 0 0 0 9.15 20.6h5.7a1.7 1.7 0 0 0 1.7-1.55L17.4 7"/>'
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
    nav_config: '<path d="M3.4 6.2h8.2a1.1 1.1 0 1 1 0 2.2H3.4a1.1 1.1 0 1 1 0-2.2Zm13.9 0h3.3a1.1 1.1 0 1 1 0 2.2h-3.3a1.1 1.1 0 1 1 0-2.2ZM3.4 15.6h3.3a1.1 1.1 0 1 1 0 2.2H3.4a1.1 1.1 0 1 1 0-2.2Zm8.9 0h8.3a1.1 1.1 0 1 1 0 2.2h-8.3a1.1 1.1 0 1 1 0-2.2Z"/><circle cx="14.9" cy="7.3" r="2.5"/><circle cx="9.1" cy="16.7" r="2.5"/>',
    nav_decide: '<path fill-rule="evenodd" clip-rule="evenodd" d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v8A2.5 2.5 0 0 1 18.5 16H10l-5.2 4.2A1 1 0 0 1 3 19.4V5.5ZM7.4 8.2h1.6v1.6H7.4V8.2Zm3.8 0h1.6v1.6h-1.6V8.2Zm3.8 0h1.6v1.6h-1.6V8.2Z"/>'
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
  /* 分类图标统一入口：自定义分类的 id 不在 ICONS 表里，用 customIcon 兜底 */
  function tagIcon(t) {
    return iconOf(t.customIcon || t.id, iconOf("t_misc"));
  }

  /* 每个分类/账户都自带 color 和 tint（低饱和），之前 UI 一直没用。
     学钱往：未选 = 浅色底 + 彩色图标，选中 = 实色底 + 白图标，靠颜色一眼区分。 */
  function tagColor(t) { return (t && t.color) || "#767680"; }
  function tagTint(t) { return (t && t.tint) || "#F1F1F4"; }

  function gStyle(t, on) {
    return on
      ? ' style="background:' + tagColor(t) + ";color:#fff\""
      : ' style="background:' + tagTint(t) + ";color:" + tagColor(t) + '"';
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
    statsSpan: 6,
    /* 持仓录入表单的暂存值 */
    hCode: "",
    hName: "",
    hShares: "",
    hCost: "",
    /* 报价拉取状态：idle / loading / ok / fail */
    quoteState: "idle",
    quoteFailAt: 0,
    quoteAt: "",
    quoteDoneAt: 0,
    /* 账户 / 分类管理的表单状态 */
    editWalletId: "",
    wName: "",
    wOpening: "",
    editTagId: "",
    tagName: "",
    tagFlow: "out",
    tagIcon: "",
    /* 搜索关键词（跨全部月份） */
    searchQ: "",
    /* 账号 / 云同步界面状态 */
    syncing: false,
    applyingRemote: false,
    authPanel: "",
    authUser: "",
    authPwd: ""
  };

  function viewBook() {
    setTimeout(function () { refreshPendingCount(false); }, 0);
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
        '<div class="icon-btn" data-act="goAuto" aria-label="自动识别">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2.5 4.5 14H11l-1 7.5L18.5 10H12l1-7.5Z"/></svg></div>' +
        '<div class="icon-btn" data-act="goSearch">' + iconOf("search") + "</div></div>" +
      '<div class="month-line"><span data-act="prevMonth">‹</span><b>' + esc(label) + '</b><span data-act="nextMonth">›</span></div>' +
      '<div class="hero">' +
        '<div class="label">余额 · 全部账户</div>' +
        '<div class="big"><span class="cur">¥</span>' + money(total) + "</div>" +
        '<div class="delta ' + (delta < 0 ? "down" : "up") + '">月度结余 <b>' +
          (delta >= 0 ? "+" : "-") + "¥" + money(Math.abs(delta)) + "</b></div>" +
      "</div>";

    // 年度汇总：跟随当前月份导航所在年，口径与 summarize 一致（转账不计收支）
    var yearKey = parts[0];
    var yearOut = 0, yearIn = 0, yearCount = 0;
    db.entries.forEach(function (e) {
      if (String(e.day).slice(0, 4) !== yearKey) return;
      yearCount++;
      if (e.flow === "out") yearOut += e.cents;
      else if (e.flow === "in") yearIn += e.cents;
    });
    // 2×2 而不是四行：右列数字要避开右下角的悬浮 ＋
    var yearCard =
      '<div class="card ov-card"><div class="card-title">' + esc(yearKey) + " 年汇总</div>" +
        '<div class="ygrid">' +
          '<div class="ycell"><i>收入</i><b class="pos">+¥' + money(yearIn) + "</b></div>" +
          '<div class="ycell"><i>支出</i><b>−¥' + money(yearOut) + "</b></div>" +
          '<div class="ycell"><i>结余</i><b>' + cash(yearIn - yearOut) + "</b></div>" +
          '<div class="ycell"><i>笔数</i><b>' + yearCount + " 笔</b></div>" +
        "</div>" +
      "</div>";

    var listHtml;
    if (s.list.length) {
      listHtml = groupEntries(s.list);
    } else {
      // 月初打开时当月必然是空的，直接显示空白会让人以为数据丢了，给一个跳到「上一个有记录的月份」的入口
      var monthsWithData = {};
      db.entries.forEach(function (e) { monthsWithData[String(e.day).slice(0, 7)] = 1; });
      // 只往过去找（YYYY-MM 字符串比较即时间顺序），避免跳到未来的月份
      var pastMonth = Object.keys(monthsWithData)
        .filter(function (k) { return k < ui.month; })
        .sort().reverse()[0];
      listHtml = pastMonth
        ? '<div class="empty">这个月还没有记录' +
            '<div class="empty-act" data-act="gotoMonth" data-v="' + esc(pastMonth) + '">看 ' +
            esc(pastMonth.slice(0, 4) + " 年 " + Number(pastMonth.slice(5))) + ' 月 ›</div>' +
          "</div>"
        : '<div class="empty"><span class="big-emoji">🪶</span>还没有任何记录，点右下角记第一笔</div>';
    }

    /* 有没确认的自动识别就顶一条，位置在 hero 下面第一屏就能看见 */
    var pendingBar = _pendingN > 0
      ? '<div class="pending-bar" data-act="goAuto">' +
          '<i class="pb-dot"></i>' +
          '<span>有 <b>' + _pendingN + "</b> 笔自动识别的账还没确认</span>" +
          "<em>去确认 ›</em>" +
        "</div>"
      : "";

    return head + pendingBar + chart + yearCard + listHtml;
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
        // 转账没有分类概念：meta 只显示「转出 → 转入」，不再重复左列账户名
        var metaHtml = e.flow === "move"
          ? '<span>' + esc(w.name) + " → " + esc(walletById(e.toWalletId).name) + "</span>"
          : '<span>' + esc(w.name) + "</span><span>" + esc(t.name) + "</span>";
        return (
          '<div class="entry" data-act="editEntry" data-id="' + esc(e.id) + '">' +
            '<div class="glyph"' + gStyle(t, false) + ">" + tagIcon(t) + "</div>" +
            '<div class="body">' +
              '<div class="title">' + esc(e.memo || (e.flow === "move" ? "转账" : t.name)) + "</div>" +
              '<div class="meta">' + metaHtml + "</div>" +
            "</div>" +
            '<div class="amt ' + (e.flow === "in" ? "in" : "out") + '">' +
              (e.flow === "in" ? "+" : "-") + money(e.cents) +
              (e.origin === "csv" ? '<span class="csv-tag">导入</span>' : "") +
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

    // 选中的账户/分类可能被删掉了：落到第一个可用的，否则这笔会记到不存在的账户上，钱凭空消失
    if (!db.wallets.some(function (w) { return w.id === ui.walletId; })) {
      ui.walletId = db.wallets[0] ? db.wallets[0].id : "w_pay";
    }
    if (!db.wallets.some(function (w) { return w.id === ui.toWalletId && w.id !== ui.walletId; })) {
      var other = db.wallets.filter(function (w) { return w.id !== ui.walletId; })[0];
      ui.toWalletId = other ? other.id : ui.walletId;
    }
    if (ui.flow !== "move") {
      var tlist = db.tags.filter(function (t) { return t.flow === (ui.flow === "in" ? "in" : "out"); });
      if (!tlist.some(function (t) { return t.id === ui.tagId; }) && tlist[0]) ui.tagId = tlist[0].id;
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
              var ton = ui.tagId === t.id;
              return '<div class="tag-cell ' + (ton ? "on" : "") + '" data-act="setTag" data-v="' + t.id + '">' +
                '<span class="g"' + gStyle(t, ton) + ">" + tagIcon(t) + "</span><span>" + esc(t.name) + "</span></div>";
            }).join("") +
          "</div>" +
        "</div>";
    }

    // 账户用一行胶囊：键盘固定占掉屏幕下半截，账户要是再画大图标就会顶到键盘底下被切掉
    function walletPills(act, curId, skipId) {
      return '<div class="wal-line">' +
        db.wallets.map(function (w) {
          var dis = skipId && w.id === skipId ? " is-dim" : "";
          var won = curId === w.id;
          return '<div class="wal-pill' + (won ? " on" : "") + dis + '" data-act="' + act + '" data-v="' + w.id + '">' +
            '<span class="g"' + (won ? "" : gStyle(w, false)) + ">" + iconOf(w.id, iconOf("w_cash")) + "</span>" + esc(w.name) + "</div>";
        }).join("") +
      "</div>";
    }

    var walletsHtml =
      '<div class="wal-block">' +
        '<div class="wal-cap">' + (ui.flow === "move" ? "从哪转出" : "账户") + "</div>" +
        walletPills("setWallet", ui.walletId, null) +
        (ui.flow === "move"
          ? '<div class="wal-cap">转到哪个账户</div>' + walletPills("setToWallet", ui.toWalletId, ui.walletId)
          : "") +
      "</div>";

    var meta =
      '<div class="card">' +
        '<div class="field-row"><label>日期</label>' +
          '<input type="date" data-act="setDay" value="' + esc(ui.day) + '">' +
          '<span class="day-quick" data-act="dayOffset" data-v="1">昨天</span>' +
          '<span class="day-quick" data-act="dayOffset" data-v="2">前天</span>' +
        "</div>" +
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
    // 学钱往：编辑态左下角直接是「删除」，不再额外占一行；
    // 创建态给一个「再记」，连续记多笔不用反复进出
    var rows = [
      ["7", "8", "9", "⌫"],
      ["4", "5", "6", "清空"],
      ["1", "2", "3", "."]
    ];
    var html = "";
    rows.forEach(function (row) {
      row.forEach(function (k) {
        var fn = k === "⌫" || k === "清空";
        html += '<div class="key ' + (fn ? "fn" : "") + '" data-act="key" data-v="' + k + '">' + k + "</div>";
      });
    });
    if (editing) {
      // 编辑：删除 | 0 | . | 保存
      html += '<div class="key fn del" data-act="delEntry" data-id="' + esc(editing.id) + '">删除</div>' +
        '<div class="key" data-act="key" data-v="0">0</div>' +
        '<div class="key" data-act="key" data-v=".">.</div>' +
        '<div class="key go" data-act="saveEntry" data-id="' + esc(editing.id) + '">保存</div>';
    } else {
      // 新建：00 | 0 | . | 再记 | 记下（5 格，单独一行网格）
      html += '<div class="pad-row-5">' +
        '<div class="key" data-act="key" data-v="00">00</div>' +
        '<div class="key" data-act="key" data-v="0">0</div>' +
        '<div class="key" data-act="key" data-v=".">.</div>' +
        '<div class="key again" data-act="saveAndNew">再记</div>' +
        '<div class="key go" data-act="saveEntry" data-id="">记下</div>' +
        "</div>";
    }
    return '<div class="pad">' + html + "</div>";
  }

  /* ================= 视图：统计 ================= */

  /* ================= 视图：资产（资产 + 收支统计合成一页） ================= */

  /* 近 6 个月支出柱状：只画支出，当月高亮，点柱子能跳月份。
     高度上限取「好看的刻度」，柱子才不会挤在一个小角落。 */
  function monthBars(series, curMonth) {
    var peak = Math.max.apply(null, series.map(function (x) { return x.out; }).concat([1]));
    function niceTop(centsPeak) {
      var yuan = centsPeak / 100;
      var mag = Math.pow(10, Math.floor(Math.log10(yuan)));
      var ladder = [1, 1.2, 1.5, 1.8, 2, 2.4, 3, 3.6, 4.5, 5, 6, 7.5, 8, 9, 10];
      for (var k = 0; k < ladder.length; k++) {
        if (yuan <= ladder[k] * mag) return ladder[k] * mag * 100;
      }
      return 10 * mag * 100;
    }
    var top = niceTop(peak);
    function axisNum(v) {
      var yuan = v / 100;
      if (yuan >= 1000) {
        var k = yuan / 1000;
        return (Math.abs(k - Math.round(k)) < 0.05 ? Math.round(k) : k.toFixed(1)) + "K";
      }
      return String(Math.round(yuan));
    }
    return '<div class="chart">' +
      '<div class="chart-top"><span class="ck">近 6 个月支出</span>' +
        '<span class="cap">上限 ' + axisNum(top) + "</span></div>" +
      '<div class="plot"><div class="bars">' +
        series.map(function (x) {
          var h = Math.max(2.5, (x.out / top) * 100);
          var cls = "bar" + (x.m === curMonth ? " on" : "");
          return '<div class="bar-col" data-act="gotoMonth" data-v="' + x.m + '">' +
            '<span class="' + cls + '" style="height:' + h + '%"></span></div>';
        }).join("") +
      "</div></div>" +
      '<div class="x-axis">' +
        series.map(function (x) {
          return '<div class="xl' + (x.m === curMonth ? " on" : "") + '">' +
            "<b>" + Number(x.m.slice(5)) + "月</b><em>" + axisNum(x.out) + "</em></div>";
        }).join("") +
      "</div></div>";
  }

  /* 收支 + 分类构成 + 分类明细。月份导航由外层的资产页给，
     这里只管「这个月花成什么样」。 */
  function statsBlock() {
    var s = summarize(ui.month);
    var parts = ui.month.split("-");
    var isOut = ui.statsFlow !== "in";
    var flow = isOut ? "out" : "in";
    var rows = isOut ? s.top : s.topIn;
    var total = isOut ? s.out : s.inc;
    var days = new Date(Number(parts[0]), Number(parts[1]), 0).getDate();
    var count = s.list.filter(function (e) { return e.flow === flow; }).length;

    var outN = s.list.filter(function (e) { return e.flow === "out"; }).length;
    var inN = s.list.filter(function (e) { return e.flow === "in"; }).length;

    // 环比：拿上个月同口径比，比只给一个数字有信息量
    var prevD = new Date(Number(parts[0]), Number(parts[1]) - 2, 1);
    var prevKey = prevD.getFullYear() + "-" + pad(prevD.getMonth() + 1);
    var prevS = summarize(prevKey);
    var prevVal = isOut ? prevS.out : prevS.inc;
    var mom = "";
    if (prevVal > 0 && total > 0) {
      var dp = ((total - prevVal) / prevVal) * 100;
      var up = dp >= 0;
      // 支出涨了是坏消息（红），收入涨了是好消息（绿）
      var good = isOut ? !up : up;
      mom = '<em class="' + (good ? "up" : "dn") + '">比上月 ' +
        (up ? "↑" : "↓") + Math.abs(dp).toFixed(0) + "%</em>";
    }

    var pair =
      '<div class="flow-pair">' +
        '<div class="fp-item' + (isOut ? " on" : "") + '" data-act="statsFlow" data-v="out">' +
          '<div class="fp-num">-¥' + money(s.out) + "</div>" +
          '<div class="fp-label">支出 · ' + outN + " 笔</div>" +
        "</div>" +
        '<div class="fp-item' + (!isOut ? " on" : "") + '" data-act="statsFlow" data-v="in">' +
          '<div class="fp-num">+¥' + money(s.inc) + "</div>" +
          '<div class="fp-label">收入 · ' + inN + " 笔</div>" +
        "</div>" +
      "</div>";

    var meta = '<div class="stat-meta">日均' + (isOut ? "支出" : "收入") + " ¥" +
      money(Math.round(total / days)) + " · 共 " + count + " 笔" + mom + "</div>";

    // 近 6 个月柱状
    var series = [];
    for (var k = 5; k >= 0; k--) {
      var d = new Date(Number(parts[0]), Number(parts[1]) - 1 - k, 1);
      var m = d.getFullYear() + "-" + pad(d.getMonth() + 1);
      series.push({ m: m, out: summarize(m).out });
    }
    var bars = monthBars(series, ui.month);

    if (!rows.length) {
      return pair + meta + bars +
        '<div class="empty">这个月还没有' + (isOut ? "支出" : "收入") + '记录</div>';
    }

    // 前 6 类画环，其余并成「其他」；同色相明度阶梯，不用彩虹色
    var STEPS = ["#0e0e10", "#3a3a44", "#5f5f6a", "#87878f", "#adadb5", "#cfcfd6"];
    var head = rows.slice(0, 6).map(function (t) {
      var tag = tagById(t.id);
      return { id: t.id, name: tag.name, cents: t.cents, pct: t.pct };
    });
    var rest = rows.slice(6).reduce(function (a, t) { return a + t.cents; }, 0);
    if (rest > 0) {
      head.push({ id: "t_misc", name: "其他 " + (rows.length - 6) + " 类", cents: rest, pct: total ? rest / total : 0 });
    }
    head.forEach(function (t, idx) { t.color = STEPS[idx % STEPS.length]; });

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
            '<div class="g"' + gStyle(tagById(t.id), false) + ">" + tagIcon(tagById(t.id)) + "</div>" +
            '<div class="body">' +
              '<div class="r1"><span class="nm">' + esc(t.name) + "</span>" +
                '<span class="amt">¥' + money(t.cents) + "</span></div>" +
              '<div class="r2"><span class="track"><i style="width:' + Math.max(5, pct) + '%"></i></span>' +
                '<span class="pc">' + cnt + " 笔 · " + pct + "%</span></div>" +
            "</div>" +
          "</div>";
        }).join("") +
      "</div>";

    return pair + meta + bars + donut + table;
  }

  function viewAssets() {
    var bal = walletBalances();
    var cashTotal = db.wallets.reduce(function (a, w) { return a + (bal[w.id] || 0); }, 0);
    var hs = holdingStats();
    var netWorth = cashTotal + hs.mv;
    var parts = ui.month.split("-");

    var prevD = new Date(Number(parts[0]), Number(parts[1]) - 2, 1);
    var nextD = new Date(Number(parts[0]), Number(parts[1]), 1);
    var nav =
      '<div class="month-nav">' +
        '<span class="nm" data-act="prevMonth">' + Number(prevD.getMonth() + 1) + "月</span>" +
        '<span class="nm on">' + parts[0] + "年" + Number(parts[1]) + "月</span>" +
        '<span class="nm" data-act="nextMonth">' + Number(nextD.getMonth() + 1) + "月</span>" +
      "</div>";

    /* 净资产走势：没有历史快照，用「当前净值 - 之后的净流量」倒推 */
    var ms = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(Number(parts[0]), Number(parts[1]) - 1 - i, 1);
      ms.push(d.getFullYear() + "-" + pad(d.getMonth() + 1));
    }
    var running = netWorth;
    var nwSeries = [];
    for (var j = ms.length - 1; j >= 0; j--) {
      nwSeries[j] = running;
      var xs = summarize(ms[j]);
      running -= (xs.inc - xs.out);
    }
    var sMin = Math.min.apply(null, nwSeries);
    var sMax = Math.max.apply(null, nwSeries);
    var sSpan = (sMax - sMin) || 1;
    var VBW = 340, VBY0 = 34, VBY1 = 10;
    function sparkY(v) { return (VBY0 - ((v - sMin) / sSpan) * (VBY0 - VBY1)).toFixed(1); }
    var pts = nwSeries.map(function (v, k) {
      return ((k / (nwSeries.length - 1)) * VBW).toFixed(1) + "," + sparkY(v);
    }).join(" ");
    var areaPts = "0,40 " + pts + " " + VBW + ",40";
    var trendUp = nwSeries[nwSeries.length - 1] >= nwSeries[0];

    var hero =
      '<div class="hero nw-head">' +
        '<div class="label">净资产</div>' +
        '<div class="big"><span class="cur">¥</span>' + money(netWorth) + "</div>" +
        '<div class="nw-spark-wrap">' +
          '<span class="nw-spark-cap">近 6 个月净资产</span>' +
          '<svg class="nw-spark" viewBox="0 0 346 40" preserveAspectRatio="none" aria-hidden="true">' +
            '<defs><linearGradient id="nwGrad2" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0%" stop-color="#0e0e10" stop-opacity="0.2"/>' +
              '<stop offset="100%" stop-color="#0e0e10" stop-opacity="0"/>' +
            "</linearGradient></defs>" +
            '<polygon points="' + areaPts + '" fill="url(#nwGrad2)"/>' +
            '<polyline points="' + pts + '"' + (trendUp ? "" : ' style="stroke:var(--neg)"') + "/>" +
            '<circle cx="' + VBW + '" cy="' + sparkY(nwSeries[nwSeries.length - 1]) + '" r="3.4" fill="var(--ink)"/>' +
          "</svg>" +
        "</div>" +
      "</div>";

    var investPct = netWorth > 0 ? (hs.mv / netWorth) * 100 : 0;
    var stack =
      '<div class="stk stk-cash">' +
        '<span class="stk-label">流动资产</span>' +
        '<span class="stk-num">' + money(cashTotal) + "</span>" +
      "</div>" +
      '<div class="stk stk-invest">' +
        '<span class="stk-label">投资资产</span>' +
        '<div class="stk-big">' + money(hs.mv) + "</div>" +
        '<div class="stk-foot">' +
          "<span>浮动盈亏 " + (hs.pnl >= 0 ? "+" : "−") + "¥" + money(Math.abs(hs.pnl)) + "</span>" +
          '<span class="stk-pct">' + investPct.toFixed(0) + "%</span>" +
        "</div>" +
      "</div>";

    var anyNeg = false;
    /* 账户做成可横滑的卡片：像一叠银行卡，滑动看下一张。
       点进去是这一张卡的全部流水。 */
    var rows = '<div class="wcards">' + db.wallets.map(function (w) {
      var v = bal[w.id] || 0;
      if (v < 0) anyNeg = true;
      var c = tagColor(w) || "#4a4a54";
      return '<div class="wcard" data-act="goWallet" data-id="' + esc(w.id) + '"' +
          ' style="background:linear-gradient(150deg,' + c + ' 0%,' + c + 'cc 100%)">' +
        '<div class="wc-top"><span class="wc-name">' + esc(w.name) + "</span>" +
          '<span class="wc-ico">' + iconOf(w.id, iconOf("w_cash")) + "</span></div>" +
        '<div class="wc-bal">' + cash(v) + "</div>" +
        '<div class="wc-foot"><span>期初 ' + cash(w.opening) + "</span><span>流水 ›</span></div>" +
      "</div>";
    }).join("") + "</div>";

    var yf = yearFlow(parts[0]);
    var cover = yf.out > 0 ? Math.round((yf.div / yf.out) * 100) : 0;

    return (
      '<div class="topbar"><div><h1>资产</h1><div class="sub">钱在哪，花到哪</div></div></div>' +
      nav +
      hero +
      stack +
      '<div class="as-sec">' +
        statsBlock() +
      "</div>" +
      '<div class="card ov-card"><div class="card-title">账户</div>' + rows +
        (anyNeg
          ? '<div class="wal-tip">余额是负的？说明这个账户只记了支出没记期初——' +
            '<span data-act="goWallets">去账户里设一下期初 ›</span></div>'
          : "") +
      "</div>" +
      '<div class="card ov-card"><div class="card-title">钱生钱</div>' +
        '<div class="list-row" data-act="goHoldings"><span>持仓</span>' +
          '<span class="hint">' + hs.list.length + " 只 · ¥" + money(hs.mv) + " ›</span></div>" +
        '<div class="list-row" data-act="goOverview"><span>财务全景</span>' +
          '<span class="hint">股息覆盖率 ' + cover + "% ›</span></div>" +
      "</div>" +
      '<div class="card ov-card"><div class="card-title">口径</div>' +
        '<div class="list-row"><span>余额</span><span class="hint">期初 + 收入 − 支出</span></div>' +
        '<div class="list-row"><span>转账</span><span class="hint">账户间搬移，不计收支</span></div>' +
        '<div class="list-row"><span>净资产</span><span class="hint">账户余额 + 持仓市值</span></div>' +
      "</div>"
    );
  }

  /* ================= 视图：单个账户 ================= */

  /* 点账户卡片进来：这张卡的钱从哪儿来、花到哪儿去。
     只列这个账户的流水，不做二级筛选，越简单越好。 */
  function viewWalletDetail(params) {
    var id = (params && params.id) || "";
    var w = walletById(id);
    if (!w) {
      return '<div class="topbar"><div class="icon-btn" data-act="back">‹</div><h1>账户</h1>' +
        '<div class="icon-btn"></div></div>' +
        '<div class="empty">这个账户不在了，可能被删了</div>';
    }
    var bal = walletBalances();
    var v = bal[w.id] || 0;
    var list = db.entries
      .filter(function (e) { return e.walletId === w.id || e.toWalletId === w.id; })
      .sort(function (a, b) {
        if (a.day !== b.day) return a.day < b.day ? 1 : -1;
        return (b.at || 0) - (a.at || 0);
      });

    // 本月这个账户的进出
    var monthOut = 0, monthIn = 0;
    list.forEach(function (e) {
      if (String(e.day).slice(0, 7) !== ui.month) return;
      if (e.flow === "out" && e.walletId === w.id) monthOut += e.cents;
      if (e.flow === "in" && e.walletId === w.id) monthIn += e.cents;
    });

    var c = tagColor(w) || "#4a4a54";
    var head =
      '<div class="wd-hero" style="background:linear-gradient(150deg,' + c + ' 0%,' + c + 'cc 100%)">' +
        '<div class="wd-name"><span class="wc-ico">' + iconOf(w.id, iconOf("w_cash")) + "</span>" +
          esc(w.name) + "</div>" +
        '<div class="wd-bal">' + cash(v) + "</div>" +
        '<div class="wd-meta">' +
          "<span>本月支出 ¥" + money(monthOut) + "</span>" +
          "<span>本月收入 ¥" + money(monthIn) + "</span>" +
        "</div>" +
      "</div>";

    var body;
    if (!list.length) {
      body = '<div class="empty"><span class="big-emoji">🧾</span>这个账户还没有流水</div>';
    } else {
      body = list.slice(0, 200).map(function (e) {
        var t = tagById(e.tagId);
        var isTransferOut = e.flow === "move" && e.walletId === w.id;
        var isTransferIn = e.flow === "move" && e.toWalletId === w.id;
        var sign = e.flow === "in" || isTransferIn ? "+" : e.flow === "move" ? "" : "−";
        var cls = e.flow === "in" || isTransferIn ? " in" : e.flow === "move" ? "" : " out";
        var title = isTransferOut ? ("转到 " + (walletById(e.toWalletId).name || "其他账户"))
          : isTransferIn ? ("来自 " + (walletById(e.walletId).name || "其他账户"))
          : t.name;
        return '<div class="wd-row" data-act="openEntry" data-id="' + esc(e.id) + '">' +
          '<div class="g"' + gStyle(isTransferIn ? walletById(e.walletId) : t, false) + ">" +
            tagIcon(isTransferIn ? t : t) + "</div>" +
          '<div class="body">' +
            '<div class="r1"><span class="nm">' + esc(title) + "</span>" +
              '<span class="amt' + cls + '">' + sign + "¥" + money(e.cents) + "</span></div>" +
            '<div class="r2"><span>' + esc(e.day) + "</span>" +
              (e.memo ? "<span>" + esc(e.memo) + "</span>" : "") + "</div>" +
          "</div>" +
        "</div>";
      }).join("");
    }

    return '<div class="topbar"><div class="icon-btn" data-act="back">‹</div><h1>账户</h1>' +
        '<div class="icon-btn"></div></div>' +
      head + body;
  }

  /* ================= 视图：持仓 ================= */

  function fmtShares(n) {
    var v = Number(n) || 0;
    return v % 1 === 0 ? String(v) : v.toFixed(2);
  }

  /* 价格不补零：1500.00 → 1500，8.75 → 8.75，省出横向空间 */
  function fmtPrice(cents) {
    var v = (Number(cents) || 0) / 100;
    return v % 1 === 0 ? String(v) : String(parseFloat(v.toFixed(2)));
  }

  /* 千分位但去掉多余的 .00，给行内小字用 */
  function fmtMoneyShort(cents) {
    var v = Math.abs((Number(cents) || 0) / 100);
    var s = v % 1 === 0 ? String(v) : v.toFixed(2);
    var p = s.split(".");
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return p.join(".");
  }

  /* 持仓统一口径：没拉到报价的，用成本价当现价，并在行上标「待更新」 */
  function holdingStats() {
    var list = (db.holdings || []).map(function (h) {
      var price = h.priceCents != null ? h.priceCents : h.costCents;
      var mv = Math.round(h.shares * price);
      var cost = Math.round(h.shares * h.costCents);
      return {
        id: h.id, code: h.code, name: h.name || h.code, shares: h.shares,
        costCents: h.costCents, priceCents: price,
        mv: mv, cost: cost, pnl: mv - cost,
        pnlPct: cost ? ((mv - cost) / cost) * 100 : 0,
        stale: h.priceCents == null
      };
    });
    var mv = 0, cost = 0;
    list.forEach(function (x) { mv += x.mv; cost += x.cost; });
    return {
      list: list, mv: mv, cost: cost, pnl: mv - cost,
      pnlPct: cost ? ((mv - cost) / cost) * 100 : 0
    };
  }

  /* 某一年的收入 / 支出 / 分红收入 */
  function yearFlow(yearKey) {
    var inc = 0, out = 0, div = 0;
    db.entries.forEach(function (e) {
      if (String(e.day).slice(0, 4) !== yearKey) return;
      if (e.flow === "out") out += e.cents;
      else if (e.flow === "in") {
        inc += e.cents;
        if (e.tagId === "t_div") div += e.cents;
      }
    });
    return { inc: inc, out: out, div: div };
  }

  /* ================= 行情（四级降级）=================
     ① 持仓里自带的 priceAt 未过期 → 直接用
     ② 过期 → 一次批量请求 /api/v1/quotes（限流 30/分钟，不逐只请求）
     ③ 请求失败 → 保留手工价，行上标「待更新报价」，60 秒内不重试
     ④ 什么都没有 → 显示「暂无报价」，页面照常可用，不白屏
     —— 分析服务跑在用户自己电脑上，关机就没了，记账不能因此不可用 */

  var QUOTE_API = "https://v.yutiqu.eu.cc/api/v1/quotes";
  /* 行情新鲜度：交易时段 60 秒算旧，其余时段 15 分钟算旧。
     原来写死 24 小时，后端每分钟刷新的数据前端根本用不上。 */
  var QUOTE_TTL_LIVE = 60 * 1000;
  var QUOTE_TTL_IDLE = 15 * 60 * 1000;
  var QUOTE_POLL_MS = 60 * 1000;      // 停在行情相关页面时的轮询间隔
  var QUOTE_RETRY_GAP = 60 * 1000;    // 失败后冷却 60 秒

  /* A 股交易时段（不含节假日，节假日由后端数据源自然返回上一交易日收盘价） */
  function inTradingHours(d) {
    d = d || new Date();
    var day = d.getDay();
    if (day === 0 || day === 6) return false;
    var m = d.getHours() * 60 + d.getMinutes();
    return (m >= 9 * 60 + 30 && m <= 11 * 60 + 30) || (m >= 13 * 60 && m <= 15 * 60);
  }

  function quoteTtl() {
    return inTradingHours() ? QUOTE_TTL_LIVE : QUOTE_TTL_IDLE;
  }

  /* 输 600519 自动补成 600519.SH，省得记后缀 */
  function normCode(raw) {
    var s = String(raw || "").trim().toUpperCase();
    if (/^\d{6}$/.test(s)) {
      if (/^(6|9)/.test(s)) return s + ".SH";
      if (/^(0|3|8)/.test(s)) return s + ".SZ";
      if (/^4/.test(s)) return s + ".BJ";
    }
    return s;
  }

  function holdingsNeedQuote() {
    if (!db.holdings || !db.holdings.length) return false;
    var now = Date.now();
    var ttl = quoteTtl();
    return db.holdings.some(function (h) {
      return !h.priceAt || now - h.priceAt > ttl;
    });
  }

  function applyQuotes(quotes) {
    var changed = false;
    (db.holdings || []).forEach(function (h) {
      var q = quotes[h.code];
      if (!q || !isFinite(q.price) || q.price <= 0) return;
      h.priceCents = Math.round(q.price * 100);
      h.priceAt = Date.now();
      if (q.name && (!h.name || h.name === h.code)) h.name = q.name;
      changed = true;
    });
    if (changed) save();
    return changed;
  }

  function refreshQuotes(force) {
    if (!db.holdings || !db.holdings.length) return;
    if (ui.quoteState === "loading") return;
    if (!force && !holdingsNeedQuote()) return;
    if (!force && ui.quoteFailAt && Date.now() - ui.quoteFailAt < QUOTE_RETRY_GAP) return;

    ui.quoteState = "loading";
    var codes = db.holdings.map(function (h) { return h.code; });
    var url = QUOTE_API + "?codes=" + encodeURIComponent(codes.join(","));
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;

    function done() { if (timer) clearTimeout(timer); }

    fetch(url, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (j) {
        done();
        var data = (j && j.quotes) || {};
        applyQuotes(data);
        ui.quoteState = "ok";
        ui.quoteFailAt = 0;
        ui.quoteAt = (j && j.as_of) || "";
        ui.quoteDoneAt = Date.now();
        // 三个页面都用到市值：只在当前仍停在其中之一时重绘，避免把用户拉回别的页
        var v = parseHash().view;
        if (v === "holdings" || v === "assets" || v === "overview") render();
      })
      .catch(function () {
        done();
        ui.quoteState = "fail";
        ui.quoteFailAt = Date.now();
        var v2 = parseHash().view;
        if (v2 === "holdings" || v2 === "assets" || v2 === "overview") render();
      });
  }

  /* 停在行情相关页面时自动轮询：交易时段每分钟一次，其余时段靠 TTL 自然降频 */
  var _quoteTimer = null;

  function stopQuotePoll() {
    if (_quoteTimer) { clearInterval(_quoteTimer); _quoteTimer = null; }
  }

  function startQuotePoll() {
    stopQuotePoll();
    if (!db.holdings || !db.holdings.length) return;
    var v = parseHash().view;
    if (v !== "holdings" && v !== "assets" && v !== "overview") return;
    _quoteTimer = setInterval(function () {
      var cur = parseHash().view;
      if (cur !== "holdings" && cur !== "assets" && cur !== "overview") { stopQuotePoll(); return; }
      if (document.hidden) return;          // 后台标签页不发请求
      if (ui.quoteState === "loading") return;
      refreshQuotes(false);                 // TTL 没到就自己跳过，等于自动降频
    }, QUOTE_POLL_MS);
  }

  function quoteLineText() {
    if (ui.quoteState === "loading") return "正在更新报价…";
    if (ui.quoteState === "fail") return "报价更新失败 · 用手工价";
    var stale = (db.holdings || []).filter(function (h) { return !h.priceAt; }).length;
    if (stale) return stale + " 只待更新报价";
    // 相对时间比绝对时刻更直观，尤其是每分钟都在刷新的时候
    var done = ui.quoteDoneAt || 0;
    if (!done) {
      var ts = String(ui.quoteAt || "");
      var hm = ts.length >= 16 ? ts.slice(11, 16) : "";
      return hm ? "报价 " + hm + " 更新" : "报价已更新";
    }
    var ago = Math.round((Date.now() - done) / 1000);
    if (ago < 10) return inTradingHours() ? "实时报价 · 刚刚更新" : "报价 · 刚刚更新";
    if (ago < 60) return "报价 · " + ago + " 秒前";
    var min = Math.round(ago / 60);
    if (min < 60) return "报价 · " + min + " 分钟前";
    return "报价 · " + Math.round(min / 60) + " 小时前";
  }

  function viewHoldings() {
    var s = holdingStats();

    var rows = s.list.length
      ? s.list.map(function (x) {
          var pnlUp = x.pnl > 0, pnlDown = x.pnl < 0;
          return '<div class="hrow" data-act="delHolding" data-id="' + esc(x.id) + '">' +
            '<div class="glyph">' + iconOf("w_fund") + "</div>" +
            '<div class="hmain">' +
              '<div class="hline">' +
                '<span class="nm">' + esc(x.name) + "</span>" +
                '<span class="mv">' + cash(x.mv) + "</span>" +
              "</div>" +
              '<div class="hline">' +
                '<span class="sub">' + esc(x.code) + " · " + fmtShares(x.shares) + "股@" + fmtPrice(x.costCents) + "</span>" +
                '<span class="hrow-act" data-act="openStock" data-code="' + esc(x.code) + '">评分 ›</span>' +
                '<span class="pnl ' + (pnlUp ? "up" : pnlDown ? "down" : "") + '">' +
                  (x.stale ? "待更新" :
                    (x.pnl >= 0 ? "+" : "-") + fmtMoneyShort(x.pnl) +
                    " (" + (x.pnlPct >= 0 ? "+" : "") + x.pnlPct.toFixed(1) + "%)") +
                "</span>" +
              "</div>" +
            "</div>" +
          "</div>";
        }).join("")
      : '<div class="empty">还没有持仓，下面加一只</div>';

    var head =
      '<div class="topbar"><div class="icon-btn" data-act="back">‹</div><h1>持仓</h1><div class="icon-btn"></div></div>' +
      '<div class="hero">' +
        '<div class="label">持仓市值</div>' +
        '<div class="big"><span class="cur">¥</span>' + money(s.mv) + "</div>" +
        '<div class="delta ' + (s.pnl < 0 ? "down" : s.pnl > 0 ? "up" : "") + '">持仓盈亏 <b>' +
          (s.pnl >= 0 ? "+" : "-") + "¥" + money(Math.abs(s.pnl)) + "（" +
          (s.pnlPct >= 0 ? "+" : "") + s.pnlPct.toFixed(1) + "%）</b></div>" +
        (s.list.length ? '<div class="quote-line">' + quoteLineText() +
          '<span class="quote-refresh" data-act="refreshQuotes">刷新</span></div>' : "") +
      "</div>";

    var form =
      '<div class="card ov-card"><div class="card-title">加一只</div>' +
        '<div class="field-row"><label>代码</label><input data-act="hCode" placeholder="输入代码或名称搜，如 茅台" value="' + esc(ui.hCode) + '"></div>' +
        '<div class="ss-list"></div>' +
        '<div class="field-row"><label>名称</label><input data-act="hName" placeholder="填代码后自动带出" value="' + esc(ui.hName) + '">' +
          '<span class="name-hint"></span></div>' +
        '<div class="field-row"><label>股数</label><input data-act="hShares" type="number" inputmode="decimal" placeholder="100" value="' + esc(ui.hShares) + '"></div>' +
        '<div class="field-row"><label>成本价</label><input data-act="hCost" type="number" inputmode="decimal" placeholder="1500.00" value="' + esc(ui.hCost) + '"></div>' +
      "</div>" +
      '<button class="btn-primary" data-act="addHolding">添加持仓</button>' +
      '<div class="card ov-card"><div class="card-title">说明</div>' +
        '<div class="list-row"><span>同一代码重复添加</span><span class="hint">按加权平均合并成本</span></div>' +
        '<div class="list-row"><span>点一行</span><span class="hint">删除这只</span></div>' +
      "</div>";

    // 渲染完再异步拉报价，避免在 render 栈里同步递归
    setTimeout(function () { refreshQuotes(false); }, 0);

    return head + '<div class="card ov-card"><div class="card-title">明细</div>' + rows + "</div>" + form;
  }


  /* ================= 视图：个股详情（股息体检） =================
     数据全来自后端分析服务：/score/{code} 给股息评分，/dividends/{code} 给历史分红。
     两者都是只读接口，断网就显示「拉不到」，账本本身不受影响。
     「分红到账」是这里唯一的写操作——按除权日 × 持股数生成流水，
     和手动记一笔走同一张 entries 表，去重靠 origin+day+cents+code。 */

  function stockState() {
    if (!ui.stock) {
      ui.stock = { code: "", data: null, divs: null, loading: false,
      quote: null, quoteAt: "", quoteErr: "", error: "", at: 0, sync: null, walletId: "" };
    }
    return ui.stock;
  }

  /* 个股页也要实时价。
     原来这里只显示评分表里的收盘价——用户点进来看"今天涨没涨"，
     看到的却是两天前的数字，等于这一页没有行情。 */
  function loadStockQuote(code, force) {
    var stq = stockState();
    if (!code) return;
    if (!force && stq.quote && stq.quoteCode === code && stq.quoteAt) return;
    stq.quoteCode = code;
    var url = AUTH_API + "/quotes?codes=" + encodeURIComponent(code);
    fetch(url, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (stockState().code !== code) return;
        var q = j && j.quotes && j.quotes[code];
        if (q && isFinite(q.price) && q.price > 0) {
          stq.quote = q;
          stq.quoteAt = (j && j.as_of) || "";
          stq.quoteErr = "";
          render();
        } else {
          stq.quoteErr = "行情源没这只";
        }
      })
      .catch(function () {
        if (stockState().code === code) stq.quoteErr = "行情拉不到";
      });
  }

  function loadStockDetail(code, force) {
    var st = stockState();
    if (!code) return;
    if (st.loading) return;
    if (!force && st.code === code && st.data && Date.now() - st.at < 10 * 60 * 1000) return;
    st.code = code;
    st.loading = true;
    st.error = "";
    if (!st.data || st.data.ts_code !== code) st.data = null;
    render();

    function get(path) {
      return apiFetch(path, {}).then(function (r) {
        if (!r.ok) throw new Error(errText(r.body, "HTTP " + r.status));
        return r.body;
      });
    }

    loadStockQuote(code, force);
    Promise.all([get("/score/" + encodeURIComponent(code)), get("/dividends/" + encodeURIComponent(code))])
      .then(function (res) {
        if (stockState().code !== code) return;
        st.loading = false;
        st.data = res[0];
        st.divs = res[1] || [];
        st.at = Date.now();
        render();
      })
      .catch(function (e) {
        if (stockState().code !== code) return;
        st.loading = false;
        st.error = (e && e.message) || "拉不到这只的数据";
        render();
      });
  }

  /* 把历史分红按「我的持股数」折成钱：只有除权日在持仓期内才该算我的 */
  function mySharesOf(code) {
    var hs = (db.holdings || []).filter(function (h) { return h.code === code; });
    return hs.reduce(function (a, h) { return a + (Number(h.shares) || 0); }, 0);
  }

  function divRowsFor(code) {
    var st = stockState();
    var shares = mySharesOf(code);
    var cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 24);
    var cut = ymd(cutoff);
    return (st.divs || []).filter(function (d) {
      return d.ex_date && d.cash_div_pretax > 0 && d.ex_date >= cut;
    }).map(function (d) {
      var dps = Number(d.cash_div_pretax) || 0;
      return {
        exDate: d.ex_date, dps: dps,
        amountCents: Math.round(dps * shares * 100),
        shares: shares,
        done: (db.entries || []).some(function (e) {
          return e.origin === "dividend" && e.day === d.ex_date &&
            e.cents === Math.round(dps * shares * 100) &&
            String(e.memo || "").indexOf(code) >= 0;
        })
      };
    });
  }

  /* 生成待确认清单（不写库）：用户得看一眼再点头，自动写错了比不写更糟 */
  function startDivSync(code) {
    var st = stockState();
    var shares = mySharesOf(code);
    if (!shares) { toast("先在持仓里加这只，才知道该给你算多少"); return; }
    var rows = divRowsFor(code).filter(function (x) { return !x.done && x.amountCents > 0; });
    if (!rows.length) { toast("近两年没有可补的分红，或已经记过了"); return; }
    st.sync = rows;
    var invest = (db.wallets || []).filter(function (w) { return /投资|证券|股票/.test(w.name); })[0];
    st.walletId = invest ? invest.id : ((db.wallets[0] || {}).id || "");
    render();
  }

  function commitDivSync(code) {
    var st = stockState();
    var rows = st.sync || [];
    if (!rows.length) return;
    var w = st.walletId;
    if (!w) { toast("先选个账户"); return; }
    var name = (st.data && st.data.name) || code;
    var added = 0;
    rows.forEach(function (x) {
      if (x.done || !x.amountCents) return;
      db.entries.unshift({
        id: uid("e"), flow: "in", cents: x.amountCents, tagId: "t_div",
        walletId: w, day: x.exDate,
        memo: name + " 分红 " + code,
        origin: "dividend", at: Date.now()
      });
      x.done = true;
      added++;
    });
    save();
    st.sync = null;
    toast("已记 " + added + " 笔分红，去账本里能看到");
    render();
  }

  function sdBar(label, v, cls) {
    var n = Math.max(0, Math.min(100, Number(v) || 0));
    return '<div class="sd-dim">' +
      '<span class="lb">' + label + "</span>" +
      '<span class="tr"><i class="' + (cls || "") + '" style="width:' + n.toFixed(1) + '%"></i></span>' +
      '<b>' + n.toFixed(0) + "</b></div>";
  }

  /* ================= 到手股息率 =================
     页面上的「当前股息率」是毛数：每股分红 ÷ 股价，一分成本没扣。
     实际到手差三样东西：

     ① 券商佣金：万 2.5 起，但很多券商有「最低 5 元」——
        买 1 万块也是 5 元，等于 0.05%，小资金被这条吃掉得更多
     ② 过户费：成交额 0.001%（沪深都收，金额很小）
     ③ 红利税：按持股期限差别化征收，这是大头
        持股 ≤1 个月 20%、1 个月–1 年 10%、超过 1 年 0%

     第 ③ 条对「长期拿着吃股息」这件事是决定性的：
     同一只票，短线进出和拿满一年，到手的股息率能差两成。
     所以不能只给一个毛数字。 */

  var COST = {
    commissionRate: 0.00025,   // 佣金万 2.5
    commissionMin: 5,          // 单笔最低 5 元
    transferRate: 0.00001,     // 过户费 0.001%
    stampRate: 0.0005,         // 印花税 0.05%（仅卖出）
    sampleAmount: 10000        // 示例买入金额（元）
  };

  /* 买入一趟的成本率（佣金按最低 5 元兜底，小资金更接近真实） */
  function buyCostRate(amount) {
    var amt = Number(amount) || COST.sampleAmount;
    var fee = Math.max(amt * COST.commissionRate, COST.commissionMin) + amt * COST.transferRate;
    return fee / amt;
  }

  /* 卖出成本率：佣金 + 过户费 + 印花税（印花税只有卖出收） */
  function sellCostRate(amount) {
    var amt = Number(amount) || COST.sampleAmount;
    var fee = Math.max(amt * COST.commissionRate, COST.commissionMin) +
      amt * COST.transferRate + amt * COST.stampRate;
    return fee / amt;
  }

  /* 到手股息率。
     gross 是小数（0.0375 表示 3.75%）。
     roundTrip=true 表示把卖出那趟也算进去（短线场景才该算）。 */
  function netYield(gross, holdMonths, roundTrip) {
    var g = Number(gross);
    if (!isFinite(g) || g <= 0) return null;
    var cost = buyCostRate(COST.sampleAmount);
    if (roundTrip) cost += sellCostRate(COST.sampleAmount);
    // 分红除权后到手金额先被佣金摊薄，再按持股期限扣红利税
    var afterCost = g - cost;
    if (afterCost < 0) afterCost = 0;
    var taxRate = holdMonths > 12 ? 0 : (holdMonths > 1 ? 0.10 : 0.20);
    return afterCost * (1 - taxRate);
  }

  function viewStock(code) {
    var st = stockState();
    var d = st.data && st.data.ts_code === code ? st.data : null;
    var head = '<div class="topbar"><div class="icon-btn" data-act="back">‹</div>' +
      "<h1>" + esc((d && d.name) || code || "个股") + '</h1><div class="icon-btn"></div></div>';

    if (!code) return head + '<div class="empty">没带股票代码</div>';
    if (!d && !st.loading && !st.error) setTimeout(function () { loadStockDetail(code); }, 0);

    var hs = (db.holdings || []).filter(function (h) { return h.code === code; })[0];
    var body = "";

    if (st.error && !d) {
      body = '<div class="empty">' + esc(st.error) +
        '<div class="empty-act" data-act="sdReload" data-code="' + esc(code) + '">重试</div></div>';
      return head + body;
    }
    if (!d) {
      return head + '<div class="dc-skel"><i></i><i></i><i></i></div>';
    }

    /* --- 价格 + 我的持仓 ---
       价格优先级：实时行情 > 持仓里记的价 > 评分基准日的收盘价。
       以前缺了实时这一路，页面上永远是评分表那天的收盘价。 */
    var stq = stockState();
    var q = stq.quote && stq.quoteCode === code ? stq.quote : null;
    var liveCents = q && isFinite(q.price) && q.price > 0 ? Math.round(q.price * 100) : null;
    var closeCents = Math.round((d.close || 0) * 100);
    var priceCents = liveCents != null ? liveCents
      : (hs && hs.priceCents != null ? hs.priceCents : closeCents);
    var isLive = liveCents != null;
    var mv = hs ? Math.round(hs.shares * priceCents) : 0;
    var cost = hs ? Math.round(hs.shares * hs.costCents) : 0;
    var pnl = mv - cost;
    var pnlPct = cost ? (pnl / cost) * 100 : 0;

    /* 行情时间只取时分：后端给的是 ISO，长串在窄屏上会被挤掉 */
    var qt = String((q && q.quote_time) || stq.quoteAt || "");
    var qtShort = "";
    if (liveCents != null) {
      var hm = qt.match(/(\d{1,2}:\d{2})/);
      qtShort = hm ? hm[1] : "";
    }
    var chgTxt = "";
    if (isLive && isFinite(q.change) && isFinite(q.pct_chg)) {
      var up = q.change >= 0;
      chgTxt = '<span class="sd-chg ' + (up ? "up" : "down") + '">' +
        (up ? "+" : "") + Number(q.change).toFixed(2) + "（" +
        (up ? "+" : "") + Number(q.pct_chg).toFixed(2) + "%）</span>";
    }
    var priceTag = isLive
      ? '<span class="sd-live"><i></i>实时' + (qtShort ? " " + esc(qtShort) : "") + "</span>" + chgTxt
      : '<span class="sd-close">收盘价' + (d.score_date ? " · " + esc(d.score_date) : "") + "</span>";

    body += '<div class="hero sd-hero">' +
      '<div class="label">' + esc(d.name || code) + " " + esc(code) + "</div>" +
      '<div class="big"><span class="cur">¥</span>' + money(priceCents) + "</div>" +
      '<div class="sd-pxline">' + priceTag + "</div>" +
      (hs
        ? '<div class="delta ' + (pnl < 0 ? "down" : pnl > 0 ? "up" : "") + '">持有 <b>' + fmtShares(hs.shares) +
          "</b> 股 · 市值 <b>¥" + money(mv) + "</b> · 盈亏 <b>" + (pnl >= 0 ? "+" : "-") + "¥" + money(Math.abs(pnl)) +
          "（" + (pnlPct >= 0 ? "+" : "") + pnlPct.toFixed(1) + "%）</b></div>"
        : '<div class="delta">还没买这只 · 下面可以看它的股息质量</div>') +
      "</div>";

    /* --- 股息评分 --- */
    var score = Number(d.composite_score);
    var scoreOk = isFinite(score);
    var grade = !scoreOk ? "无评分" : score >= 80 ? "优秀" : score >= 60 ? "还不错" : score >= 40 ? "一般" : "偏弱";
    body += '<div class="card ov-card sd-score">' +
      '<div class="card-title">股息评分</div>' +
      '<div class="sd-top">' +
        '<div class="sd-big">' + (scoreOk ? score.toFixed(0) : "—") + "</div>" +
        '<div class="sd-top-r">' +
          "<b>" + grade + "</b>" +
          "<span>当前股息率（毛） " + (d.current_yield != null ? (d.current_yield * 100).toFixed(2) + "%" : "—") + "</span>" +
          "<span>连续分红 " + (d.consecutive_years != null ? d.consecutive_years + " 年" : "—") +
            " · 累计 " + (d.total_dividend_count != null ? d.total_dividend_count + " 次" : "—") + "</span>" +
        "</div>" +
      "</div>" +
      sdBar("稳定性", d.stability_score) +
      sdBar("成长性", d.growth_score) +
      sdBar("连续性", d.continuity_score) +
      sdBar("稳健度", d.steadiness_score) +
      sdBar("覆盖度", d.coverage_score) +
      '<div class="sd-note">' +
        (d.score_date ? "按 " + esc(d.score_date) + " 收盘 ¥" + (d.close != null ? Number(d.close).toFixed(2) : "—") + " 计算 · " : "") +
        (d.avg3_year_dividend ? "近 3 年平均每股分红 ¥" + d.avg3_year_dividend + " · " : "") +
        (d.cagr5 != null ? (d.cagr_label || "近 5 年增长率") + " " + Number(d.cagr5).toFixed(1) + "%" : "") +
      "</div>" +
      (d.forecast_source
        ? '<div class="sd-note">预测：分红 ¥' + (d.predicted_d0 != null ? Number(d.predicted_d0).toFixed(2) : "—") +
          " · 增速 " + (d.predicted_g != null ? (Number(d.predicted_g) * 100).toFixed(1) + "%" : "—") +
          "（" + esc(d.forecast_source) + (d.forecast_year ? " · " + d.forecast_year : "") + "）</div>"
        : "") +
    "</div>";

    /* --- 到手股息率：把成本扣掉再说 --- */
    var gy = Number(d.current_yield);
    if (isFinite(gy) && gy > 0) {
      var yLong = netYield(gy, 24, false);      // 拿满一年，免红利税，也不卖
      var yMid = netYield(gy, 6, false);        // 1 个月到 1 年，扣 10%
      var yShort = netYield(gy, 0.5, true);     // 1 个月内卖掉，扣 20% + 一买一卖成本
      function pct(v) { return v == null ? "—" : (v * 100).toFixed(2) + "%"; }
      function diff(v) {
        if (v == null) return "";
        var dd = (v - gy) * 100;
        return '<em class="sd-diff">' + (dd >= 0 ? "+" : "") + dd.toFixed(2) + "pt</em>";
      }
      body += '<div class="card ov-card">' +
        '<div class="card-title">到手股息率</div>' +
        '<div class="sd-yield">' +
          '<div class="sd-y-row"><span>持有满 1 年（免税）</span><b>' + pct(yLong) + "</b>" + diff(yLong) + "</div>" +
          '<div class="sd-y-row"><span>持 1 个月–1 年（税 10%）</span><b>' + pct(yMid) + "</b>" + diff(yMid) + "</div>" +
          '<div class="sd-y-row"><span>1 个月内卖掉（税 20%）</span><b>' + pct(yShort) + "</b>" + diff(yShort) + "</div>" +
        "</div>" +
        '<div class="sd-note">按买入 ' + COST.sampleAmount + " 元估算：佣金万 2.5（最低 5 元）+ 过户费 0.001%" +
          "，卖出另收印花税 0.05%。红利税按持股期限：满 1 年免税、1 个月至 1 年 10%、1 个月内 20%。</div>" +
      "</div>";
    }

    /* --- 估值：PE / PB / ROE / 市赚率 --- */
    var pe = Number(d.pe), pb = Number(d.pb);
    var roe = pe > 0 && pb > 0 ? (pb / pe) * 100 : null;   // ROE ≈ PB / PE
    var pr = roe && roe > 0 ? pe / roe : null;            // 市赚率 = PE ÷ ROE%
    var prText = pr == null ? "—"
      : pr < 1 ? "便宜（<1）" : pr < 2 ? "合理（1–2）" : "偏贵（>2）";
    body += '<div class="card ov-card">' +
      '<div class="card-title">估值</div>' +
      '<div class="sd-grid">' +
        '<div><i>PE</i><b>' + (isFinite(pe) && pe > 0 ? pe.toFixed(1) : "—") + "</b></div>" +
        '<div><i>PB</i><b>' + (isFinite(pb) && pb > 0 ? pb.toFixed(2) : "—") + "</b></div>" +
        '<div><i>ROE</i><b>' + (roe != null ? roe.toFixed(1) + "%" : "—") + "</b></div>" +
        '<div><i>市赚率</i><b>' + (pr != null ? pr.toFixed(2) : "—") + "</b></div>" +
      "</div>" +
      '<div class="sd-note">市赚率 = PE ÷ ROE%，越低越便宜 —— 当前 ' + prText + "</div>" +
    "</div>";

    /* --- 分红历史 + 到账流水 --- */
    var rows2 = divRowsFor(code);
    var shares = mySharesOf(code);
    var recent12 = rows2.filter(function (x) {
      return x.exDate >= ymd(new Date(Date.now() - 365 * 86400000));
    });
    var sum12 = recent12.reduce(function (a, x) { return a + x.amountCents; }, 0);
    var hist = rows2.slice(0, 10).map(function (x) {
      return '<div class="sd-div-row' + (x.done ? " done" : "") + '">' +
        '<span class="d">' + esc(x.exDate) + "</span>" +
        '<span class="v">每股 ¥' + x.dps.toFixed(3) + "</span>" +
        '<span class="a">' + (shares ? "¥" + money(x.amountCents) : "—") + "</span>" +
        '<span class="t">' + (x.done ? "已记" : "") + "</span>" +
      "</div>";
    }).join("");

    var syncBox = "";
    if (st.sync && st.sync.length) {
      var wopts = (db.wallets || []).map(function (w) {
        return '<option value="' + esc(w.id) + '"' + (w.id === st.walletId ? " selected" : "") + ">" + esc(w.name) + "</option>";
      }).join("");
      syncBox = '<div class="sd-sync">' +
        '<div class="sd-sync-h">按除权日记 ' + st.sync.length + " 笔到账</div>" +
        '<div class="au-chips">' +
        chipsHtml(db.wallets || [], stockState().walletId || (db.wallets[0] && db.wallets[0].id), "sdWalletPick", 0) +
      "</div>" +
        st.sync.map(function (x) {
          return '<div class="sd-div-row"><span class="d">' + esc(x.exDate) + "</span>" +
            '<span class="v">每股 ¥' + x.dps.toFixed(3) + "</span>" +
            '<span class="a">¥' + money(x.amountCents) + "</span></div>";
        }).join("") +
        '<div class="sd-sync-btns">' +
          '<button class="btn-primary" data-act="sdDivConfirm" data-code="' + esc(code) + '">确认记入账本</button>' +
          '<button class="btn-ghost" data-act="sdDivCancel">取消</button>' +
        "</div>" +
      "</div>";
    }

    body += '<div class="card ov-card">' +
      '<div class="card-title">分红到账</div>' +
      (shares
        ? '<div class="sd-note">按你持有的 ' + fmtShares(shares) + " 股算，近 12 个月应到账 <b>¥" + money(sum12) + "</b></div>"
        : '<div class="sd-note">还没持仓这只，先加进持仓才能折算到账金额</div>') +
      hist +
      (shares ? '<button class="btn-primary sd-btn" data-act="sdDivSync" data-code="' + esc(code) + '">按持仓算一遍分红</button>' : "") +
      syncBox +
    "</div>";

    return head + body;
  }

  /* ================= 视图：财务全景 ================= */

  function viewOverview() {
    var yearKey = ui.month.slice(0, 4);
    var y = yearFlow(yearKey);
    var hs = holdingStats();
    var bal = walletBalances();
    var cashTotal = db.wallets.reduce(function (a, w) { return a + (bal[w.id] || 0); }, 0);
    var totalAssets = cashTotal + hs.mv;
    var netWorth = totalAssets;
    var cover = y.out > 0 ? (y.div / y.out) * 100 : 0;
    var months = y.out > 0 ? y.div / (y.out / 12) : 0;
    var barW = Math.min(100, cover);
    var pnlPct = hs.cost > 0 ? (hs.pnl / hs.cost) * 100 : 0;
    var investPct = netWorth > 0 ? (hs.mv / netWorth) * 100 : 0;

    var coverDesc;
    if (y.out <= 0) coverDesc = "今年还没有支出记录";
    else if (cover <= 0) coverDesc = "今年还没有分红到账，去「记一笔」记成股息";
    else if (cover < 50) coverDesc = "分红能覆盖 " + months.toFixed(1) + " 个月生活费";
    else if (cover < 100) coverDesc = "分红能覆盖 " + months.toFixed(1) + " 个月，超过半年了";
    else coverDesc = "分红已覆盖全年支出，多出 ¥" + money(y.div - y.out);

    /* 近 6 个月净资产走势：没有历史快照，就用「当前净值 - 之后的净流量」倒推，
       方向是对的，持仓按当前市值近似。 */
    var mp = ui.month.split("-");
    var ms = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(Number(mp[0]), Number(mp[1]) - 1 - i, 1);
      ms.push(d.getFullYear() + "-" + pad(d.getMonth() + 1));
    }
    var running = netWorth;
    var series = [];
    for (var j = ms.length - 1; j >= 0; j--) {
      series[j] = running;
      var xs = summarize(ms[j]);
      running -= (xs.inc - xs.out);
    }
    var sMin = Math.min.apply(null, series);
    var sMax = Math.max.apply(null, series);
    var sSpan = (sMax - sMin) || 1;
    var VBW = 340, VBY0 = 34, VBY1 = 10;
    function sparkY(v) { return (VBY0 - ((v - sMin) / sSpan) * (VBY0 - VBY1)).toFixed(1); }
    var pts = series.map(function (v, k) {
      return ((k / (series.length - 1)) * VBW).toFixed(1) + "," + sparkY(v);
    }).join(" ");
    var trendUp = series[series.length - 1] >= series[0];
    var areaPts = "0,40 " + pts + " " + VBW + ",40";
    var lastY = sparkY(series[series.length - 1]);

    /* 一句话提示：本月花掉多少、日均多少、和上月比 */
    var cur = summarize(ui.month);
    var prevD = new Date(Number(mp[0]), Number(mp[1]) - 2, 1);
    var prevKey = prevD.getFullYear() + "-" + pad(prevD.getMonth() + 1);
    var prev = summarize(prevKey);
    var dayCount = new Date(Number(mp[0]), Number(mp[1]), 0).getDate();
    function yuanInt(cents) {
      return Math.round(cents / 100).toLocaleString("zh-CN");
    }
    var tipL, tipR;
    if (cur.out > 0) {
      tipL = "本月已花 <b>¥" + yuanInt(cur.out) + "</b>";
      tipR = "日均 <b>¥" + yuanInt(cur.out / dayCount) + "</b>";
      if (prev.out > 0) {
        var dp = ((cur.out - prev.out) / prev.out) * 100;
        tipR += ' <em class="' + (dp >= 0 ? "up" : "dn") + '">' +
          (dp >= 0 ? "↑" : "↓") + Math.abs(dp).toFixed(0) + "%</em>";
      }
    } else {
      tipL = "本月还没记账";
      tipR = "点右下角 ＋ 开始";
    }

    return (
      '<div class="topbar"><div class="icon-btn" data-act="back">‹</div><h1>财务全景</h1><div class="icon-btn"></div></div>' +
      '<div class="hero nw-head">' +
        '<div class="label">净资产 · ' + esc(yearKey) + "</div>" +
        '<div class="big"><span class="cur">¥</span>' + money(netWorth) + "</div>" +
        '<div class="nw-spark-wrap">' +
          '<span class="nw-spark-cap">近 6 个月净资产</span>' +
          '<svg class="nw-spark" viewBox="0 0 346 40" preserveAspectRatio="none" aria-hidden="true">' +
            '<defs><linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0%" stop-color="#0e0e10" stop-opacity="0.2"/>' +
              '<stop offset="100%" stop-color="#0e0e10" stop-opacity="0"/>' +
            "</linearGradient></defs>" +
            '<polygon points="' + areaPts + '" fill="url(#nwGrad)"/>' +
            '<polyline points="' + pts + '"' + (trendUp ? "" : ' style="stroke:var(--neg)"') + "/>" +
            '<circle cx="' + VBW + '" cy="' + lastY + '" r="3.4" fill="var(--ink)"/>' +
          "</svg>" +
        "</div>" +
      "</div>" +
      '<div class="nw-tip"><span>' + tipL + "</span>" +
        '<span class="nw-tip-r">' + tipR + "</span></div>" +
      '<div class="stk stk-cash">' +
        '<span class="stk-label">流动资产</span>' +
        '<span class="stk-num">' + money(cashTotal) + "</span>" +
      "</div>" +
      '<div class="stk stk-invest">' +
        '<span class="stk-label">投资资产</span>' +
        '<div class="stk-big">' + money(hs.mv) + "</div>" +
        '<div class="stk-foot">' +
          "<span>浮动盈亏 " + (hs.pnl >= 0 ? "+" : "−") + "¥" + money(Math.abs(hs.pnl)) +
            "（" + (pnlPct >= 0 ? "+" : "−") + Math.abs(pnlPct).toFixed(1) + "%）</span>" +
          '<span class="stk-pct">' + investPct.toFixed(0) + "%</span>" +
        "</div>" +
      "</div>" +
      '<div class="nw-gap"></div>' +
      '<div class="card ov-card"><div class="card-title">股息覆盖率</div>' +
        '<div class="cover">' +
          '<div class="cover-num">' + cover.toFixed(0) + "<span>%</span></div>" +
          '<div class="cover-desc">' + coverDesc + "</div>" +
          '<div class="track"><i style="width:' + barW.toFixed(1) + '%"></i></div>' +
        "</div>" +
        '<div class="list-row"><span>年度分红收入</span><span class="hint" style="color:var(--pos)">+¥' + money(y.div) + "</span></div>" +
        '<div class="list-row"><span>年度生活支出</span><span class="hint">¥' + money(y.out) + "</span></div>" +
        '<div class="list-row"><span>年度总收入</span><span class="hint">+¥' + money(y.inc) + "</span></div>" +
        '<div class="list-row"><span>年度结余</span><span class="hint">' + cash(y.inc - y.out) + "</span></div>" +
      "</div>" +
      '<div class="card ov-card"><div class="card-title">持仓</div>' +
        '<div class="list-row"><span>持仓市值</span><span class="hint">¥' + money(hs.mv) + "</span></div>" +
        '<div class="list-row"><span>持仓成本</span><span class="hint">¥' + money(hs.cost) + "</span></div>" +
        '<div class="list-row"><span>浮动盈亏</span><span class="hint" style="color:' + (hs.pnl >= 0 ? "var(--pos)" : "var(--neg)") + '">' +
          (hs.pnl >= 0 ? "+" : "-") + "¥" + money(Math.abs(hs.pnl)) + "</span></div>" +
        '<div class="list-row" data-act="goHoldings"><span>管理持仓</span><span class="hint">' + hs.list.length + " 只 ›</span></div>" +
      "</div>" +
      '<div class="card ov-card"><div class="card-title">口径</div>' +
        '<div class="list-row"><span>净资产</span><span class="hint">账户余额 + 持仓市值</span></div>' +
        '<div class="list-row"><span>分红收入</span><span class="hint">流水里标签为「股息」的收入</span></div>' +
        '<div class="list-row"><span>生活支出</span><span class="hint">不含转账</span></div>' +
      "</div>"
    );
  }

  /* ================= 视图：自动识别 ================= */

  /* 把「支付通知 / 银行短信 / 账单明细」这类文字变成账本里的一笔。
     解析在 auto.js，这里只管交互：粘贴 → 识别 → 改分类 → 一次记下。
     用户改过的分类会记进 db.autoRules，同一个商户下次直接认。 */
  function autoState() {
    if (!ui.auto) ui.auto = { text: "", items: [], remote: [], skipped: [], parsed: false, err: "", loading: false };
    return ui.auto;
  }

  function runAutoParse(text) {
    var a = autoState();
    if (typeof text === "string") a.text = text;
    a.parsed = true;
    a.err = "";
    if (!window.SZAuto) {
      a.items = [];
      a.err = "识别模块没加载，刷新一下页面";
      return;
    }
    if (!String(a.text || "").trim()) {
      a.items = [];
      a.skipped = [];
      a.err = "先把要识别的文字粘进来";
      return;
    }
    var r = window.SZAuto.parse(a.text, { learning: db.autoRules || {} });
    a.items = r.items;
    a.skipped = r.skipped || [];
    if (!r.items.length) a.err = "没找到带金额的记录，检查一下是不是复制全了";
  }

  /* 采集端（通知监听 / 悬浮球 / Tasker / 快捷指令）会把原文推到服务端，
     这里拉下来用同一套 auto.js 规则解析。
     采集端只负责丢文本，规则永远只有一份。 */
  var _rawLoading = false;

  var _rawTimer = null;

  /* 停在自动识别页时定期拉一次。采集端是"从后面推过来"的，
     页面不会自己重绘，不轮询的话用户会以为没采到。 */
  /* 决策广场也自动刷。

     原来广场只有"进入时拉一次"，别人新发的帖、新投的票，你不手动下拉就永远看不到。
     20 秒一次：隧道一次往返几百毫秒，这个频率成本可忽略，又不至于太吵。
     silent=true 时只有停在这一页才重绘，不会打断正在看详情的用户。 */
  var _dcTimer = null;
  var _dcVer = "";

  function startDecidePoll() {
    if (_dcTimer) return;
    /* 3 秒问一次"变了吗"。

       直接每 3 秒拉一遍列表（20 条帖子，几十 KB）太重；
       这个探测接口只回 {maxId, count}，几十字节。
       值没变就什么都不做，变了才去拉全量——
       用户的感觉是"别人一投票我这边就动了"，实际成本几乎为零。 */
    _dcTimer = setInterval(function () {
      var h = parseHash();
      if (h.view !== "decide") { stopDecidePoll(); return; }
      if (Number(h.params.id || 0)) return;   // 详情页自己有加载
      if (document.hidden) return;
      var sc = decideState().scope === "mine" ? "mine" : "all";
      apiFetch("/decisions/version?scope=" + sc, {}).then(function (r) {
        if (!r.ok || !r.body) return;
        var v = r.body.maxId + ":" + r.body.count;
        if (_dcVer === v) return;
        _dcVer = v;
        loadDecideFeed(false, true);
      }).catch(function () {});
    }, 3000);
  }

  function stopDecidePoll() {
    if (_dcTimer) { clearInterval(_dcTimer); _dcTimer = null; }
  }

  function startPendingPoll() {
    if (_rawTimer) return;
    /* 3 秒一次：付完钱点通知进来，最多等 3 秒就能看到那笔。
       这个接口本来就只有几十条文本，比列表轻得多。 */
    _rawTimer = setInterval(function () {
      if (parseHash().view !== "auto") { stopPendingPoll(); return; }
      if (document.hidden) return;
      loadPendingRaw();
    }, 3000);
  }

  function stopPendingPoll() {
    if (_rawTimer) { clearInterval(_rawTimer); _rawTimer = null; }
  }

  function loadPendingRaw() {
    if (!auth || !auth.token || _rawLoading) return;
    _rawLoading = true;
    apiFetch("/auto/pending?limit=50", {}).then(function (r) {
      _rawLoading = false;
      if (!r.ok || !r.body) return;
      var a = autoState();
      var list = r.body.items || [];
      var out = [];
      list.forEach(function (raw) {
        if (!window.SZAuto) return;
        if (_droppedRaw[raw.id]) return;   // 本机刚处理过，别让它回来
        /* 采集端上报的文本长这样：

             微信支付 · 截图识别
             付款金额 ¥0.01
             收款方 路明非
             支付时间 ...
             ---
             原始屏幕文本（可能是整页账本、聊天、随便什么）

           分隔线之后是给人看的原文，不能再进解析器——
           否则账本页那种满屏数字会被当成十几笔支出。
           实测：一条账本页截图解析出了 11 条假记录。 */
        var head = String(raw.text || "").split(/^---+$/m)[0];
        var parsed = window.SZAuto.parse(head, { learning: db.autoRules || {} });
        (parsed.items || []).forEach(function (it) {
          it.rawId = raw.id;
          it.source = raw.source;
          it.why = "自动采集 · " + (it.why || "");
          out.push(it);
        });
      });
      // 内容没变就别重绘，免得用户正在输入时被打断
      var sig = out.map(function (x) { return x.rawId; }).join(",");
      if (sig === a._rawSig) return;
      a._rawSig = sig;
      a.remote = out;
      render();
    }).catch(function () {
      _rawLoading = false;
    });
  }

  /* 待确认数量。
     采集端识别完会发系统通知，但 MIUI 对「非应用商店安装」的 App 默认关闭通知
     （appops 里 Uid mode 是 ignore，adb 改不了），用户很可能一条都看不到。
     所以主要路径放在 App 里：一进账本就顶一条「有 N 笔没确认」，点一下直达。

     30 秒内不重复拉：账本页每次 render 都请求一次太浪费，隧道往返不便宜。 */
  var _pendingN = 0;
  var _pendingAt = 0;

  function refreshPendingCount(force) {
    if (!auth || !auth.token) { _pendingN = 0; return; }
    if (!force && Date.now() - _pendingAt < 30000) return;
    _pendingAt = Date.now();
    apiFetch("/auto/pending?limit=50", {}).then(function (r) {
      if (!r.ok || !r.body) return;
      var n = (r.body.items || []).length;
      if (n === _pendingN) return;
      _pendingN = n;
      var h = parseHash();
      if (h.view === "book" && !Number(h.params.id || 0)) render();
    }).catch(function () {});
  }

  /* 待确认被处理掉一条就减一，不用等下一次轮询 */
  function bumpPending(delta) {
    _pendingN = Math.max(0, _pendingN + delta);
  }

  /* 本机刚删掉/刚确认的 rawId。

     后端标记是异步的，而待确认页每 8 秒轮询一次——轮询常常先到，
     后端那条还是 pending，于是刚点掉的那笔又冒出来。
     用户看到的就是"点叉叉删不掉，再点一次才没了"。
     本地先记下来，轮询结果里过滤掉，等后端标记生效再说。 */
  var _droppedRaw = {};

  function rememberDropped(rawId) {
    if (!rawId) return;
    _droppedRaw[rawId] = Date.now();
    // 顺手清掉 5 分钟前的，别让这个表无限长
    var now = Date.now();
    Object.keys(_droppedRaw).forEach(function (k) {
      if (now - _droppedRaw[k] > 5 * 60 * 1000) delete _droppedRaw[k];
    });
  }

  function markRawDone(id, status) {
    if (!id || !auth) return;
    apiFetch("/auto/raw/" + id + "/done", {
      method: "POST",
      body: JSON.stringify({ status: status })
    }).catch(function () {});
  }

  function autoReadClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      toast("这个浏览器读不了剪贴板，手动粘贴吧");
      return;
    }
    navigator.clipboard.readText().then(function (t) {
      if (!t || !t.trim()) { toast("剪贴板是空的"); return; }
      runAutoParse(t);
      render();
      var a = autoState();
      toast(a.items.length ? "认出 " + a.items.length + " 笔" : "没认出金额");
    }).catch(function () {
      toast("没有剪贴板权限，手动粘贴吧");
    });
  }

  /* 图片压缩：手机原图动辄 4MB，直接传又慢又费钱。
     缩到长边 1200、JPEG 0.82，一般 100–250KB，识别精度足够。 */
  function shrinkImage(file, maxSide) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = function () {
        try { URL.revokeObjectURL(url); } catch (e) {}
        reject(new Error("这张图打不开"));
      };
      img.src = url;
    });
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  /* 截图识别结果并进同一个确认列表——用户看到的界面和粘贴识别完全一样，
     认可就点「全部记下」，不认可可以先改分类或删掉。 */
  function autoApplyShot(result) {
    var a = autoState();
    a.loading = false;
    if (!result) { a.err = "识别失败，再试一次"; render(); return; }
    if (!result.ok) { a.err = result.error || "识别失败"; render(); return; }
    if (!result.items || !result.items.length) {
      a.err = "这张图里没找到付款信息。要是截的是订单页，请截「支付成功」那一屏。";
      render();
      return;
    }

    result.items.forEach(function (it) {
      // 模型给的分类是中文名，先按名字匹配；匹配不上就用商户名走本地词表
      var tag = it.category ? matchTag(it.category) : null;
      if (!tag && window.SZAuto && it.merchant) {
        var g = window.SZAuto.guessTag(it.merchant, it.flow, it.cents, 12, db.autoRules || {});
        tag = db.tags.filter(function (t) { return t.id === g.tagId; })[0] || null;
      }
      if (!tag) {
        var fallbackId = it.flow === "in" ? "t_side" : "t_misc";
        tag = db.tags.filter(function (t) { return t.id === fallbackId; })[0] || db.tags[0];
      }
      a.items.unshift({
        cents: it.cents,
        flow: it.flow,
        merchant: it.merchant || "",
        memo: it.merchant || "",
        day: it.day || todayStr(),
        tagId: tag ? tag.id : "t_misc",
        why: "截图识别" + (it.category ? " · " + it.category : ""),
        raw: ""
      });
    });

    a.parsed = true;
    a.err = "";
    render();
    toast("认出 " + result.items.length + " 笔，确认一下");
  }

  /* 选图入口：手机上会同时给「拍照」和「相册」两个选项。
     不写 capture 属性，强制拍照反而难用。 */
  function autoPickImage() {
    if (!auth || !auth.token) {
      autoState().err = "截图识别要联网调模型，先在设置里登录一下";
      render();
      return;
    }
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (input.parentNode) input.parentNode.removeChild(input);
      if (!file) return;
      var a = autoState();
      a.loading = true;
      a.err = "";
      render();
      shrinkImage(file, 1200)
        .then(function (dataUrl) {
          return apiFetch("/auto/ocr", {
            method: "POST",
            body: JSON.stringify({ image: dataUrl })
          });
        })
        .then(function (r) {
          if (r.status === 401) { handleAuthExpired(); return; }
          if (!r.ok) {
            var msg = errText(r.body, "识别服务返回 " + r.status);
            if (r.status === 429) msg = "识别太频繁了，等一分钟再试（每分钟 6 次）";
            else if (r.status === 503 || r.status === 502) msg = "识别服务暂时不可用，可以手动记一笔";
            autoApplyShot({ ok: false, error: msg });
            return;
          }
          autoApplyShot(r.body);
        })
        .catch(function (e) {
          autoApplyShot({ ok: false, error: "网络不通，或者这张图太大" });
        });
    });
    input.click();
  }

  /* 采集端那批单独确认：入账 + 标记服务端已处理 */
  function autoRemoteCommit() {
    var a = autoState();
    var list = a.remote || [];
    if (!list.length) { toast("没有待确认的"); return; }
    var fallbackWallet = db.wallets[0] ? db.wallets[0].id : "w_cash";
    var n = 0;
    list.forEach(function (it) {
      var e = {
        id: uid("e"),
        day: it.day,
        flow: it.flow === "move" ? "move" : it.flow,
        cents: it.cents,
        tagId: it.flow === "move" ? "" : it.tagId,
        walletId: it.walletId || fallbackWallet,
        memo: (it.memo || it.merchant || "自动记账").trim(),
        origin: "auto",
        at: Date.now()
      };
      if (e.flow === "move") {
        // 转账必须有转入账户，且不能和转出同一个
        var toW = it.toWalletId || pickWallet(1);
        if (!toW || toW === e.walletId) toW = pickWallet(1) === e.walletId ? pickWallet(2) : pickWallet(1);
        e.toWalletId = toW || e.walletId;
      }
      db.entries.unshift(e);
      if (it.merchant && it.flow !== "move") {
        db.autoRules = db.autoRules || {};
        db.autoRules[it.merchant] = it.tagId;
      }
      if (it.rawId) {
        // 入账后同样要挡住轮询：后端标记是异步的，不挡就会又被拉回待确认
        rememberDropped(it.rawId);
        markRawDone(it.rawId, "confirmed");
      }
      n++;
    });
    save();
    a.remote = [];
    a._rawSig = "";
    render();
    toast("记下 " + n + " 笔");
    syncPush().catch(function () {});
  }

  /* 同一张图连点两次「全部记下」，或者识别完手滑再点一次，
     原来会老老实实记两遍 —— 记账 App 里重复流水比少记一笔更伤（对账永远差）。
     判据：同一天 + 同方向 + 同金额 + 同商户，且已存在的是自动/分红来的流水。 */
  function autoDupKey(it) {
    return [it.day, it.flow, it.cents, String(it.merchant || "").trim()].join("|");
  }

  function autoExistingKeys() {
    var keys = {};
    (db.entries || []).forEach(function (e) {
      if (e.origin !== "auto" && e.origin !== "dividend") return;
      var memo = String(e.memo || "");
      // 入账时 memo 写的是「商户 · 分类」这种形式，取商户那段做 key
      var merchant = memo.split(" · ")[0].trim();
      keys[[e.day, e.flow, e.cents, merchant].join("|")] = true;
    });
    return keys;
  }

  function autoCommit() {
    var a = autoState();
    if (!a.items.length) { toast("还没有可记的"); return; }
    var fallbackWallet = db.wallets[0] ? db.wallets[0].id : "w_cash";
    var seen = autoExistingKeys();
    var n = 0, dup = 0;
    a.items.forEach(function (it) {
      var k = autoDupKey(it);
      if (seen[k]) { dup++; return; }
      seen[k] = true;
      var e = {
        id: uid("e"),
        day: it.day,
        flow: it.flow === "move" ? "move" : it.flow,
        cents: it.cents,
        tagId: it.flow === "move" ? "" : it.tagId,
        walletId: it.walletId || fallbackWallet,
        memo: (it.memo || it.merchant || "自动记账").trim(),
        origin: "auto",
        at: Date.now()
      };
      if (e.flow === "move") {
        // 转账必须有转入账户，且不能和转出同一个
        var toW = it.toWalletId || pickWallet(1);
        if (!toW || toW === e.walletId) toW = pickWallet(1) === e.walletId ? pickWallet(2) : pickWallet(1);
        e.toWalletId = toW || e.walletId;
      }
      db.entries.unshift(e);
      // 学习：这个商户用了这个分类，下次直接照抄
      if (it.merchant && it.flow !== "move") {
        db.autoRules = db.autoRules || {};
        db.autoRules[it.merchant] = it.tagId;
      }
      n++;
    });
    save();
    a.items = [];
    a.parsed = false;
    a.text = "";
    render();
    toast(dup ? ("记下 " + n + " 笔，" + dup + " 笔重复已跳过") : ("记下 " + n + " 笔"),
      null, null, dup ? 2600 : undefined);
    /* 同步失败不该盖住「记完了」这个反馈：本机已经存好，
       下一笔记账或进设置页会再推一次。这里吞掉异常是有意的。 */
    syncPush().catch(function () {});
  }

  /* 分类/账户改用横向胶囊，替掉原生 <select>。

     原生 select 在手机上调起的是系统滚动选择器：字号、配色、圆角全是系统那套，
     和整页设计语言完全不是一回事，看着就像"界面没做过"。
     胶囊一屏能扫完，点一下直接切，还少一次确认。 */
  /* 流水类型。转账既不是支出也不是收入——它只是钱从自己一个口袋挪到另一个口袋，
     混进支出里会让当月支出虚高，混进收入里更离谱。 */
  var FLOW_CHIPS = [
    { id: "out", name: "支出" },
    { id: "in", name: "收入" },
    { id: "move", name: "转账" }
  ];

  function chipsHtml(items, current, act, idx) {
    if (!items || !items.length) return "";
    return '<div class="chips-scroll">' + items.map(function (t) {
      return '<span class="chip' + (t.id === current ? " on" : "") + '" data-act="' + act +
        '" data-id="' + idx + '" data-v="' + esc(t.id) + '">' + esc(t.name) + "</span>";
    }).join("") + "</div>";
  }

  function pickWallet(rank) {
    var list = db.wallets || [];
    if (!list.length) return "";
    return (list[rank] || list[0]).id;
  }

  function tagsOf(flow) {
    var list = (db.tags || []).filter(function (t) { return t.flow === flow; });
    return list.length ? list : (db.tags || []);
  }

  function viewAuto() {
    var a = autoState();
    var tagsOut = db.tags.filter(function (t) { return t.flow === "out"; });
    var tagsIn = db.tags.filter(function (t) { return t.flow === "in"; });

    function tagOptions(flow, cur) {
      var list = flow === "in" ? tagsIn : tagsOut;
      return list.map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (t.id === cur ? " selected" : "") + ">" +
          esc(t.name) + "</option>";
      }).join("");
    }

    // 采集端来的单独一块，和本地粘/截图的分开展示
    var remoteRows = (a.remote || []).map(function (it, i) {
      return '<div class="au-row remote">' +
        '<div class="au-main">' +
          '<input class="au-name au-edit" data-act="auNameRemote" data-id="' + i + '" value="' +
            esc(it.merchant || "") + '" placeholder="商户名可改" maxlength="30">' +
          '<div class="au-why">' + esc(it.day) + " · " + esc(it.why) + "</div>" +
        "</div>" +
        '<div class="au-right">' +
          '<div class="au-amt' + (it.flow === "in" ? " in" : "") + '">' +
            (it.flow === "in" ? "+" : "−") + "¥" + money(it.cents) + "</div>" +
        "</div>" +
        '<span class="au-del" data-act="autoRemoteDrop" data-id="' + i + '">✕</span>' +
        '<div class="au-chips"><span class="chips-label">类型</span>' +
          chipsHtml(FLOW_CHIPS, it.flow, "autoFlow", i) + "</div>" +
        (it.flow === "move"
          ? '<div class="au-chips"><span class="chips-label">从</span>' +
              chipsHtml(db.wallets || [], it.walletId || pickWallet(0), "autoFrom", i) +
            "</div>" +
            '<div class="au-chips"><span class="chips-label">到</span>' +
              chipsHtml(db.wallets || [], it.toWalletId || pickWallet(1), "autoTo", i) +
            "</div>"
          : '<div class="au-chips"><span class="chips-label">分类</span>' +
              chipsHtml(tagsOf(it.flow), it.tagId, "autoRemoteTag", i) + "</div>") +
      "</div>";
    }).join("");

    var remoteBlock = remoteRows
      ? '<div class="au-sec-title">自动采集 · ' + (a.remote || []).length + " 笔待确认</div>" +
        '<div class="au-list">' + remoteRows + "</div>" +
        '<button class="btn-primary" data-act="autoRemoteCommit">确认记下（' + (a.remote || []).length + " 笔）</button>" +
        '<div class="au-skip">来自通知监听 / 悬浮球截图等采集端，确认后才入账</div>'
      : "";

    var rows = a.items.map(function (it, i) {
      return '<div class="au-row">' +
        '<div class="au-main">' +
          '<input class="au-name au-edit" data-act="auNameLocal" data-id="' + i + '" value="' +
            esc(it.merchant || "") + '" placeholder="商户名可改" maxlength="30">' +
          '<div class="au-why">' + esc(it.day) + " · " + esc(it.why) + "</div>" +
        "</div>" +
        '<div class="au-right">' +
          '<div class="au-amt' + (it.flow === "in" ? " in" : "") + '">' +
            (it.flow === "in" ? "+" : "−") + "¥" + money(it.cents) + "</div>" +
        "</div>" +
        '<span class="au-del" data-act="autoDrop" data-id="' + i + '">✕</span>' +
        '<div class="au-chips"><span class="chips-label">类型</span>' +
          chipsHtml(FLOW_CHIPS, it.flow, "autoFlowLocal", i) + "</div>" +
        (it.flow === "move"
          ? '<div class="au-chips"><span class="chips-label">从</span>' +
              chipsHtml(db.wallets || [], it.walletId || pickWallet(0), "autoFromLocal", i) +
            "</div>" +
            '<div class="au-chips"><span class="chips-label">到</span>' +
              chipsHtml(db.wallets || [], it.toWalletId || pickWallet(1), "autoToLocal", i) +
            "</div>"
          : '<div class="au-chips"><span class="chips-label">分类</span>' +
              chipsHtml(tagsOf(it.flow), it.tagId, "autoTag", i) + "</div>") +
      "</div>";
    }).join("");

    var result;
    if (a.err) {
      result = '<div class="au-hint">' + esc(a.err) + "</div>" +
        '<div class="au-btns au-btns-2">' +
          '<button class="au-btn" data-act="goEntryManual">手动记一笔</button>' +
        "</div>";
    } else if (a.items.length) {
      result = '<div class="au-list">' + rows + "</div>" +
        '<button class="btn-primary" data-act="autoCommit">全部记下（' + a.items.length + " 笔）</button>" +
        (a.skipped && a.skipped.length
          ? '<div class="au-skip">另外 ' + a.skipped.length + " 段没认出金额，已跳过</div>"
          : "");
    } else if (a.parsed) {
      result = '<div class="au-hint">没找到可记的记录</div>';
    } else {
      result = "";
    }

    /* 每次进页面都拉一次待确认（10 秒内不重复）。
       原来只拉一次（_rawFetched），结果采集端刚上报的那笔，用户切回来根本看不见。 */
    if (auth && auth.token) {
      var nowRaw = Date.now();
      if (!a._rawAt || nowRaw - a._rawAt > 10000) {
        a._rawAt = nowRaw;
        setTimeout(function () { loadPendingRaw(); }, 0);
      }
    }

    return '<div class="topbar"><div class="icon-btn" data-act="autoBack">‹</div>' +
        '<h1>自动识别</h1><div class="icon-btn"></div></div>' +
      '<div class="au-lead">把微信/支付宝的支付通知、银行短信，或者导出的账单明细粘进来，' +
        "会自动认出金额、商户和分类。</div>" +
      '<textarea class="au-input" data-act="autoText" placeholder="例：&#10;微信支付&#10;付款金额 ¥38.50&#10;收款方 美团外卖">' +
        esc(a.text) + "</textarea>" +
      '<div class="au-btns">' +
        '<button class="au-btn primary" data-act="autoShot">截图识别</button>' +
        '<button class="au-btn" data-act="autoRead">读剪贴板</button>' +
      "</div>" +
      '<div class="au-btns au-btns-2">' +
        '<button class="au-btn" data-act="autoRun">识别上面的文字</button>' +
      "</div>" +
      /* 截图这条路和"账本加密后才上传"是两件不同的事：
         图片要发给第三方模型才认得出字，所以必须当面说清，不能藏在协议里。 */
      '<div class="au-privacy">截图会发给第三方识别模型（只用于认出这一笔），原图不在本机留、也不存服务端；' +
        "嫌麻烦可以直接手动记一笔。</div>" +
      remoteBlock +
      (a.loading ? '<div class="au-loading"><i></i>正在看这张图…</div>' : "") +
      result;
  }

  /* ================= 视图：决策广场（社交投票） ================= */

  /* 想买又拿不准的时候，把决定权交给别人：
     广场上的人投「花 / 忍 / 再看看」，票数实时更新，最后自己拍板。
     听劝省下的钱会累计，帮别人劝退也有记录——这两根指标是整个功能的情绪出口。 */
  function decideState() {
    if (!ui.decide) {
      ui.decide = {
        scope: "all", sort: "hot", items: [], stats: null,
        loading: false, loaded: false, hasMore: false,
        error: "", panel: null,
        // 详情页单独拉一次完整数据（带评论区），列表缓存里没有这些
        detail: null, detailId: 0, detailLoading: false, detailError: "",
        commentDraft: "", commentBusy: false, replyTo: null,
        postBusy: false,
        form: { title: "", amount: "", reason: "", category: "", anonymous: false }
      };
    }
    return ui.decide;
  }

  var DC_SCOPE = [["all", "广场"], ["mine", "我发的"], ["voted", "我投过的"]];
  var DC_SORT = [["hot", "最热"], ["new", "最新"]];
  var DC_CATS = ["数码", "吃饭", "购物", "玩", "其他"];

  function agoText(iso) {
    if (!iso) return "";
    var t = Date.parse(iso);
    if (!t) return "";
    var diff = Date.now() - t;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
    if (diff < 86400000) return Math.floor(diff / 3600000) + " 小时前";
    if (diff < 2592000000) return Math.floor(diff / 86400000) + " 天前";
    return Math.floor(diff / 2592000000) + " 个月前";
  }

  /* 决策广场的打开速度全靠这一步：
     上次的结果存在本地，进页面先铺上去（0ms 出内容），
     再在后台拉新的替换。用户看到的是「立刻有内容 + 悄悄更新」，
     而不是「白屏转圈 600ms」。 */
  var DC_CACHE_KEY = "sz.decide.cache.v2";   // v2：列表开始带 isMine，旧缓存要作废

  function dcCacheKey() {
    // 换账号就不能复用别人的缓存
    var who = (auth && auth.userId) || 0;
    return DC_CACHE_KEY + "." + who + "." + decideState().scope + "." + decideState().sort;
  }

  function readDecideCache() {
    try {
      var o = JSON.parse(localStorage.getItem(dcCacheKey()) || "null");
      if (o && Array.isArray(o.items) && o.items.length) return o;
    } catch (e) {}
    return null;
  }

  function writeDecideCache(items, hasMore, stats) {
    try {
      localStorage.setItem(dcCacheKey(), JSON.stringify({
        at: Date.now(), items: items.slice(0, 20), hasMore: !!hasMore, stats: stats || null
      }));
    } catch (e) { /* 存不下不影响使用，下次再写 */ }
  }

  /* force=true 时忽略 d.loading 这把锁。
     踩过的坑：发布成功后调用这里，如果正好有个轮询请求还在飞，
     就被锁直接 return 了——用户关掉了发布面板、列表却还是旧的，
     以为没发出去，于是再点一次，广场上出现两条一模一样的。 */
  function loadDecideFeed(append, silent, force) {
    var d = decideState();
    if (!auth) return;
    if (d.loading && !force) return;

    /* 静默只对「不在决策页」成立：如果预取还在飞的时候用户已经进了决策页，
       数据回来必须重绘，否则页面停在骨架屏上再也出不来。 */
    function paint() {
      var h = parseHash();
      var onPage = h.view === "decide" && !Number(h.params.id || 0);
      if (!silent || onPage) render();
    }

    // 先把上次缓存的铺上，用户立刻有东西看
    if (!append && !d.items.length) {
      var cached = readDecideCache();
      if (cached) {
        d.items = cached.items;
        d.hasMore = cached.hasMore;
        if (cached.stats) d.stats = cached.stats;
        d.loaded = true;
        if (!silent) render();
      }
    }

    d.loading = true;
    d.error = "";
    d.reqAt = Date.now();
    if (!silent) render();
    var off = append ? d.items.length : 0;

    /* 一次请求同时拿列表和战绩。
       隧道往返本身 500ms 以上且抖动大，两个请求并行等于等最慢的那个，
       合并之后首屏稳定快一半。翻页时不带战绩（用不着）。 */
    /* 每次请求记一个序号。
       切 tab（广场 / 我发的 / 我投过的）时，上一个列表的请求可能还在飞——
       隧道一次往返一两秒，它晚回来就会把"广场"的帖子灌进"我发的"下面，
       这就是那个"偶现广场帖子混进来"的来源。序号对不上就整包丢弃。 */
    var mySeq = (d.seq = (d.seq || 0) + 1);

    var dcQuery = "/decisions?sort=" + d.sort + "&scope=" + d.scope + "&offset=" + off + "&limit=20";
    if (!append) dcQuery += "&withStats=1";

    apiFetch(dcQuery, {})
      .then(function (r) {
        if (d.seq !== mySeq) return;   // 期间用户切了 tab，这次结果作废
        d.loading = false;
        if (r.status === 401) { handleAuthExpired(); return; }
        if (!r.ok) {
          // 有缓存就别用错误盖掉已有内容
          if (!d.items.length) d.error = errText(r.body, "加载失败");
          paint();
          return;
        }
        var items = (r.body && r.body.items) || [];
        d.items = append ? d.items.concat(items) : items;
        d.hasMore = !!(r.body && r.body.hasMore);
        if (!append && r.body && r.body.stats) d.stats = r.body.stats;
        d.loaded = true;
        if (!append) writeDecideCache(d.items, d.hasMore, d.stats);
        paint();
      })
      .catch(function () {
        if (d.seq !== mySeq) return;
        d.loading = false;
        if (!d.items.length) d.error = "网络不通，检查一下连接";
        paint();
      });
  }

  var DC_VOTE_TEXT = { spend: "已投「花」", skip: "已投「忍住」", think: "已投「再看看」" };

  function decideVote(id, choice) {
    var d = decideState();
    var target = null;
    for (var i = 0; i < d.items.length; i++) if (d.items[i].id === id) target = d.items[i];
    apiFetch("/decisions/" + id + "/vote", {
      method: "POST",
      body: JSON.stringify({ choice: choice })
    }).then(function (r) {
      if (r.status === 401) { handleAuthExpired(); return; }
      if (!r.ok) { toast(errText(r.body, "投票失败")); return; }
      if (target) { target.votes = r.body.votes; target.myVote = choice; }
      if (d.detail && d.detail.id === id) { d.detail.votes = r.body.votes; d.detail.myVote = choice; }
      render();
      toast(DC_VOTE_TEXT[choice] || "已投票");
    }).catch(function () { toast("网络不通"); });
  }

  function decideMine(id, choice) {
    var d = decideState();
    apiFetch("/decisions/" + id + "/decide", {
      method: "POST",
      body: JSON.stringify({ choice: choice })
    }).then(function (r) {
      if (r.status === 401) { handleAuthExpired(); return; }
      if (!r.ok) { toast(errText(r.body, "操作失败")); return; }
      for (var i = 0; i < d.items.length; i++) {
        if (d.items[i].id === id) {
          d.items[i].status = "closed";
          d.items[i].finalChoice = choice;
        }
      }
      if (d.detail && d.detail.id === id) {
        d.detail.status = "closed";
        d.detail.finalChoice = choice;
      }
      render();
      if (choice === "skip") toast("省下 ¥" + money(r.body.savedCents) + "，记在账上了", null, null, 2600);
      else toast("买了就买了，下次再省");
      loadDecideFeed(false);
    }).catch(function () { toast("网络不通"); });
  }

  /* 删自己发的帖子。
     删掉会连带票和评论一起没，所以要走一次确认——
     用 toast 上的「确认删除」，而不是一按就没了。
     后端是 DELETE /decisions/{id}，会连票和评论一起清。 */
  function decideDelete(id) {
    if (!auth || !id) return;
    var d = decideState();
    var target = null;
    for (var i = 0; i < d.items.length; i++) if (d.items[i].id === id) target = d.items[i];
    if (!target && d.detail && d.detail.id === id) target = d.detail;
    var title = (target && target.title) || "这条";
    var votes = target && target.votes ? (target.votes.total || 0) : 0;

    toast('删掉「' + title.slice(0, 12) + (title.length > 12 ? "…" : "") + "」？" +
      (votes ? votes + " 张票和评论会一起没" : "评论会一起没"),
      "确认删除", function () {
        apiFetch("/decisions/" + id, { method: "DELETE" }).then(function (r) {
          if (r.status === 401) { handleAuthExpired(); return; }
          if (!r.ok) { toast(errText(r.body, "删不掉")); return; }
          var dd = decideState();
          dd.items = (dd.items || []).filter(function (x) { return x.id !== id; });
          dd.hasMore = false;
          if (dd.detail && dd.detail.id === id) {
            dd.detail = null;
            dd.detailId = 0;
            location.hash = "#/decide";
            render();
          } else {
            render();
          }
          toast("删掉了");
        }).catch(function () { toast("网络不通"); });
      }, 4200);
  }

  function submitDecision() {
    var d = decideState();
    var f = d.form;
    var raw = String(f.amount).replace(/[,\s]/g, "");
    var cents = Math.round(parseFloat(raw) * 100);
    if (!f.title.trim()) { toast("先写想买什么"); return; }
    if (f.title.trim().length > 60) {
      toast("标题最多 60 字，现在 " + f.title.trim().length + " 字，删短一点");
      return;
    }
    if (f.reason.trim().length > 240) {
      toast("理由最多 240 字，现在 " + f.reason.trim().length + " 字");
      return;
    }
    if (!isFinite(cents) || cents <= 0) { toast("金额不对"); return; }
    if (cents > 100000000) { toast("单笔最多 100 万，别把这里当银行"); return; }
    if (d.postBusy) return;
    d.postBusy = true;
    apiFetch("/decisions", {
      method: "POST",
      body: JSON.stringify({
        title: f.title.trim(),
        amountCents: cents,
        reason: f.reason.trim() || null,
        category: f.category || null,
        anonymous: !!f.anonymous
      })
    }).then(function (r) {
      d.postBusy = false;
      if (r.status === 401) { handleAuthExpired(); return; }
      if (!r.ok) { toast(errText(r.body, "发布失败")); return; }
      d.panel = null;
      d.form = { title: "", amount: "", reason: "", category: "", anonymous: false };
      d.scope = "mine";
      d.sort = "new";
      /* 先把刚发的这条直接放到列表最前面：不等网络、不等锁，
         用户点完立刻能看见自己发的帖子，就不会怀疑没发出去。 */
      if (r.body && r.body.id) {
        d.items = [r.body].concat(d.items || []);
        d.loaded = true;
        d.hasMore = false;
      }
      render();
      loadDecideFeed(false, false, true);
      toast("发出去了，等大家投票");
    }).catch(function () {
      d.postBusy = false;
      toast("网络不通");
    });
  }

  function decideCard(p) {
    var v = p.votes || { spend: 0, skip: 0, think: 0, total: 0 };
    var tot = v.total || 0;
    function pct(n) { return tot > 0 ? Math.round((n / tot) * 100) : 0; }
    var wSkip = tot ? (v.skip / tot) * 100 : 0;
    var wSpend = tot ? (v.spend / tot) * 100 : 0;
    var wThink = tot ? (v.think / tot) * 100 : 0;

    var closed = p.status === "closed";
    var verdict = "";
    if (closed) {
      verdict = p.finalChoice === "skip"
        ? '<div class="dc-verdict skip">已听劝 · 省下 ¥' + money(p.amountCents) + " 🎉</div>"
        : '<div class="dc-verdict buy">还是买了 · ¥' + money(p.amountCents) + "</div>";
    }

    var bar = tot > 0
      ? '<div class="dc-bar">' +
          (wSkip ? '<i class="b-skip" style="width:' + wSkip.toFixed(2) + '%"></i>' : "") +
          (wSpend ? '<i class="b-spend" style="width:' + wSpend.toFixed(2) + '%"></i>' : "") +
          (wThink ? '<i class="b-think" style="width:' + wThink.toFixed(2) + '%"></i>' : "") +
        "</div>" +
        '<div class="dc-legend">' +
          '<span class="b-skip">忍 ' + pct(v.skip) + "%</span>" +
          '<span class="b-spend">花 ' + pct(v.spend) + "%</span>" +
          '<span class="b-think">再看看 ' + pct(v.think) + "%</span>" +
          "<em>" + tot + " 人投过</em>" +
        "</div>"
      : '<div class="dc-legend empty">还没有人投票</div>';

    var actions = "";
    if (!closed) {
      if (p.isMine) {
        actions = '<div class="dc-actions">' +
          '<button class="dc-btn skip" data-act="dcDecide" data-v="skip" data-id="' + p.id + '">我听劝，不买了</button>' +
          '<button class="dc-btn spend" data-act="dcDecide" data-v="spend" data-id="' + p.id + '">还是买了</button>' +
        "</div>";
      } else {
        function on(c) { return p.myVote === c ? " on" : ""; }
        actions = '<div class="dc-actions">' +
          '<button class="dc-btn skip' + on("skip") + '" data-act="dcVote" data-v="skip" data-id="' + p.id + '">忍住</button>' +
          '<button class="dc-btn spend' + on("spend") + '" data-act="dcVote" data-v="spend" data-id="' + p.id + '">花</button>' +
          '<button class="dc-btn think' + on("think") + '" data-act="dcVote" data-v="think" data-id="' + p.id + '">再看看</button>' +
        "</div>";
      }
    }

    return '<div class="dc-card dc-open' + (closed ? " closed" : "") + '" data-act="dcOpenDetail" data-id="' + p.id + '">' +
      '<div class="dc-top">' +
        '<div class="dc-title">' + esc(p.title) + "</div>" +
        '<div class="dc-amount">¥' + money(p.amountCents) + "</div>" +
      "</div>" +
      (p.reason ? '<div class="dc-reason">' + esc(p.reason) + "</div>" : "") +
      verdict + bar + actions +
      '<div class="dc-meta">' + avatarHTML(p.author, toneOf(p.author), "sm") +
        "<span>" + esc(p.author) + " · " + agoText(p.createdAt) + "</span>" +
        (p.isMine
          ? '<span class="dc-del" data-act="dcDelete" data-id="' + p.id + '">删除</span>'
          : "") +
      "</div>" +
    "</div>";
  }

  function decideFormPanel() {
    var f = decideState().form;
    return '<div class="dc-mask" data-act="dcCloseForm"></div>' +
      '<div class="dc-sheet">' +
        '<div class="dc-sheet-h"><b>这笔钱该花吗</b>' +
          '<span class="x" data-act="dcCloseForm">✕</span></div>' +
        '<div class="dc-field"><label>想买什么</label>' +
          '<input data-act="dcFormTitle" maxlength="60" placeholder="机械键盘 1200 那把" value="' + esc(f.title) + '"></div>' +
        '<div class="dc-field"><label>多少钱</label>' +
          '<input data-act="dcFormAmount" type="number" inputmode="decimal" placeholder="1200" value="' + esc(f.amount) + '"></div>' +
        '<div class="dc-field"><label>为什么想买</label>' +
          '<input data-act="dcFormReason" maxlength="120" placeholder="现在的还能用，就是键帽油了" value="' + esc(f.reason) + '"></div>' +
        '<div class="dc-cats">' + DC_CATS.map(function (c) {
          return '<span class="' + (f.category === c ? "on" : "") + '" data-act="dcFormCat" data-v="' + c + '">' + c + "</span>";
        }).join("") + "</div>" +
        '<div class="dc-anon" data-act="dcFormAnon"><span>匿名发布</span>' +
          '<i class="' + (f.anonymous ? "on" : "") + '"></i></div>' +
        '<button class="btn-primary" data-act="dcSubmit"' + (decideState().postBusy ? " disabled" : "") + '>发出去，让大家投票</button>' +
      "</div>";
  }

  function viewDecide() {
    var d = decideState();
    var pid = Number(parseHash().params.id || 0);
    if (pid) return viewDecisionDetail(pid);
    d.detailId = 0;

    var head = '<div class="topbar"><div><h1>决策广场</h1>' +
      '<div class="sub">拿不准的消费，让别人替你决定</div></div>' +
      '<div class="icon-btn" data-act="dcOpenForm">＋</div></div>';

    if (!auth) {
      return head +
        '<div class="empty"><span class="big-emoji">🗳️</span>' +
        "决策广场要先登录，投票才认人<br>" +
        '<div class="empty-act" data-act="dcGoLogin">去登录 ›</div></div>';
    }

    /* 兜底：隧道抖动时请求可能一直挂着，页面就永远停在骨架屏。
       超过 12 秒还没回来就当它失败，放掉 loading，下面的逻辑会自己重拉一次。 */
    if (d.loading && d.reqAt && Date.now() - d.reqAt > 12000) {
      d.loading = false;
      d.reqAt = 0;
      d.error = "";
    }

    // 首次进入先拉一次（放到下一轮事件循环，避免在 render 里再触发 render）
    if (!d.loaded && !d.loading && !d.error) {
      setTimeout(function () { loadDecideFeed(false); }, 0);
    }

    var st = d.stats;
    var stats = st
      ? '<div class="dc-stats">' +
          '<div class="dc-stat"><b>¥' + money(st.savedCents) + "</b><i>已省下</i></div>" +
          '<div class="dc-stat"><b>' + st.helpedSkipCount + "</b><i>帮人劝退</i></div>" +
          '<div class="dc-stat"><b>' + st.votedCount + "</b><i>投过的票</i></div>" +
        "</div>"
      : "";

    var seg = '<div class="dc-seg">' + DC_SCOPE.map(function (x) {
      return '<span class="' + (d.scope === x[0] ? "on" : "") +
        '" data-act="dcScope" data-v="' + x[0] + '">' + x[1] + "</span>";
    }).join("") + "</div>";

    var sortRow = '<div class="dc-sort">' + DC_SORT.map(function (x) {
      return '<span class="' + (d.sort === x[0] ? "on" : "") +
        '" data-act="dcSort" data-v="' + x[0] + '">' + x[1] + "</span>";
    }).join("") + "</div>";

    var body;
    if (d.error) {
      body = '<div class="empty">' + esc(d.error) +
        '<div class="empty-act" data-act="dcReload">重试</div></div>';
    } else if (d.loading && !d.items.length) {
      body = '<div class="dc-skel"><i></i><i></i><i></i></div>';
    } else if (!d.items.length) {
      var words = d.scope === "mine" ? "还没发过" : d.scope === "voted" ? "还没投过票" : "广场还空着";
      body = '<div class="empty"><span class="big-emoji">🗳️</span>' + words +
        '<div class="empty-act" data-act="dcOpenForm">发第一条 ›</div></div>';
    } else {
      body = d.items.map(decideCard).join("") +
        (d.hasMore ? '<div class="dc-more" data-act="dcMore">加载更多</div>' : "") +
        (d.loading ? '<div class="dc-more">加载中…</div>' : "");
    }

    return head + stats + seg + sortRow + body + (d.panel ? decideFormPanel() : "");
  }


  /* ---------- 决策详情页 ---------- */

  /* 详情页要单独拉一次：列表接口不带评论区，也不带完整的投票理由时间线。
     打开速度快慢全看这一个请求，所以骨架屏先铺、数据到了再替换。 */
  var DC_CHOICE_TEXT = { spend: "花", skip: "忍住", think: "再看看" };

  function dcVoteBar(p) {
    var v = p.votes || { spend: 0, skip: 0, think: 0, total: 0 };
    var tot = v.total || ((v.spend || 0) + (v.skip || 0) + (v.think || 0));
    if (!tot) return '<div class="dc-legend empty">还没有人投票</div>';
    function pct(n) { return Math.round(((n || 0) / tot) * 100); }
    function w(n) { return (((n || 0) / tot) * 100).toFixed(2); }
    return '<div class="dc-bar">' +
        (v.skip ? '<i class="b-skip" style="width:' + w(v.skip) + '%"></i>' : "") +
        (v.spend ? '<i class="b-spend" style="width:' + w(v.spend) + '%"></i>' : "") +
        (v.think ? '<i class="b-think" style="width:' + w(v.think) + '%"></i>' : "") +
      "</div>" +
      '<div class="dc-legend">' +
        '<span class="b-skip">忍 ' + pct(v.skip) + "%</span>" +
        '<span class="b-spend">花 ' + pct(v.spend) + "%</span>" +
        '<span class="b-think">再看看 ' + pct(v.think) + "%</span>" +
        "<em>" + tot + " 人投过</em>" +
      "</div>";
  }

  function dcActionsFor(p) {
    if (p.status === "closed") return "";
    if (p.isMine) {
      return '<div class="dc-actions">' +
        '<button class="dc-btn skip" data-act="dcDecide" data-v="skip" data-id="' + p.id + '">我听劝，不买了</button>' +
        '<button class="dc-btn spend" data-act="dcDecide" data-v="spend" data-id="' + p.id + '">还是买了</button>' +
      "</div>";
    }
    function on(c) { return p.myVote === c ? " on" : ""; }
    return '<div class="dc-actions">' +
      '<button class="dc-btn skip' + on("skip") + '" data-act="dcVote" data-v="skip" data-id="' + p.id + '">忍住</button>' +
      '<button class="dc-btn spend' + on("spend") + '" data-act="dcVote" data-v="spend" data-id="' + p.id + '">花</button>' +
      '<button class="dc-btn think' + on("think") + '" data-act="dcVote" data-v="think" data-id="' + p.id + '">再看看</button>' +
    "</div>";
  }

  /* 停在详情页时，评论也要自己长出来——别人刚回的帖子，
     不刷新就看不到，用户会以为没人理他。5 秒一次，只拉这一条。 */
  var _cmtTimer = null;

  function startCommentPoll(id) {
    stopCommentPoll();
    _cmtTimer = setInterval(function () {
      var h = parseHash();
      var curId = Number(h.params.id || 0);
      if (h.view !== "decide" || curId !== id) { stopCommentPoll(); return; }
      if (document.hidden) return;
      apiFetch("/decisions/" + id, {}).then(function (r) {
        if (!r.ok || !r.body) return;
        var dd = decideState();
        if (dd.detailId !== id) return;
        var before = ((dd.detail && dd.detail.comments) || []).length;
        var after = ((r.body.comments) || []).length;
        if (after === before) return;      // 没新增就别重绘，免得输入时被打断
        dd.detail = r.body;
        render();
      }).catch(function () {});
    }, 5000);
  }

  function stopCommentPoll() {
    if (_cmtTimer) { clearInterval(_cmtTimer); _cmtTimer = null; }
  }

  function loadDecisionDetail(id) {
    var d = decideState();
    d.detailId = id;
    d.detailLoading = true;
    d.detailError = "";
    render();
    apiFetch("/decisions/" + id, {}).then(function (r) {
      // 用户已经退出去或换了一条，这次结果直接丢弃
      if (decideState().detailId !== id) return;
      d.detailLoading = false;
      if (r.status === 401) { handleAuthExpired(); return; }
      if (!r.ok) {
        d.detailError = errText(r.body, "打不开这条");
        render();
        return;
      }
      d.detail = r.body;
      render();
      startCommentPoll(id);
    }).catch(function () {
      if (decideState().detailId !== id) return;
      d.detailLoading = false;
      d.detailError = "网络不通，检查一下连接";
      render();
    });
  }

  /* 点赞：先本地翻状态再发请求，点完立刻有反馈；
     失败了再翻回来并提示，别让界面和服务器长期不一致。 */
  function decideLike(commentId) {
    var d = decideState();
    if (!auth || !commentId || !d.detail) return;
    var list = d.detail.comments || [];
    var target = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].kind === "comment" && list[i].id === "c" + commentId) { target = list[i]; break; }
    }
    if (!target) return;
    var before = { liked: !!target.liked, likes: target.likes || 0 };
    target.liked = !before.liked;
    target.likes = Math.max(0, before.likes + (target.liked ? 1 : -1));
    render();
    apiFetch("/decisions/comments/" + commentId + "/like", { method: "POST" }).then(function (r) {
      if (r.status === 401) { handleAuthExpired(); return; }
      if (!r.ok) {
        target.liked = before.liked;
        target.likes = before.likes;
        render();
        toast(errText(r.body, "点不了赞"));
        return;
      }
      target.liked = !!r.body.liked;
      target.likes = Number(r.body.likes) || 0;
      render();
    }).catch(function () {
      target.liked = before.liked;
      target.likes = before.likes;
      render();
    });
  }

  /* 点「回复」：把目标记下来，输入框聚焦。
     只做一层回复，回复的回复也挂在同一条下面——手机上多层缩进没法看。 */
  function startReply(commentId, who) {
    var d = decideState();
    if (!commentId) return;
    d.replyTo = { parentId: Number(commentId), author: who || "匿名" };
    render();
    setTimeout(function () {
      var el = document.querySelector('[data-act="dcComment"]');
      if (el) el.focus();
    }, 30);
  }

  function cancelReply() {
    decideState().replyTo = null;
    render();
  }

  function submitDecisionComment() {
    var d = decideState();
    var id = Number(d.detailId || 0);
    if (!id || d.commentBusy) return;
    var text = String(d.commentDraft || "").trim();
    if (!text) { toast("写点什么再发"); return; }
    if (text.length > 300) {
      toast("评论最多 300 字，现在 " + text.length + " 字");
      return;
    }
    d.commentBusy = true;
    render();
    var parent = d.replyTo && d.replyTo.parentId ? { parentId: d.replyTo.parentId } : {};
    apiFetch("/decisions/" + id + "/comments", {
      method: "POST",
      body: JSON.stringify(Object.assign({ content: text }, parent))
    }).then(function (r) {
      d.commentBusy = false;
      if (r.status === 401) { handleAuthExpired(); return; }
      if (!r.ok) {
        toast(errText(r.body, "发送失败"));
        render();
        return;
      }
      d.commentDraft = "";
      d.replyTo = null;
      if (d.detail && d.detail.id === id) {
        d.detail.comments = [r.body].concat(d.detail.comments || []);
      }
      render();
      toast("发出去了");

      /* 兜底：之前出现过"评论写进库了、界面却一直停在发送中"——
         本地拼接在某些时序下没生效（比如 detail 还停在列表缓存那条上，
         它没有 comments 字段，拼进去也画不出来）。
         这里 600ms 后核对一次，没看到这条就整页重拉。 */
      setTimeout(function () {
        var dd = decideState();
        if (dd.detailId !== id) return;
        var got = (dd.detail && dd.detail.comments) || [];
        var found = false;
        for (var i = 0; i < got.length; i++) {
          if (got[i] && got[i].id === r.body.id) { found = true; break; }
        }
        if (!found) loadDecisionDetail(id);
      }, 600);
    }).catch(function () {
      d.commentBusy = false;
      toast("网络不通");
      render();
    });
  }

  function viewDecisionDetail(id) {
    var d = decideState();
    var head = '<div class="topbar"><div class="icon-btn" data-act="dcBackList">‹</div>' +
      '<div><h1>决策详情</h1><div class="sub">这笔钱该不该花，大家怎么说</div></div>' +
      '<div class="icon-btn"></div></div>';

    if (!auth) {
      return head + '<div class="empty">决策详情要先登录<div class="empty-act" data-act="dcGoLogin">去登录 ›</div></div>';
    }

    var p = d.detail && d.detail.id === id ? d.detail : null;
    /* 完整详情（含评论）要一次隧道往返，慢的时候要好几秒。
       列表里其实已经有这条帖子的全部展示字段（标题/金额/票数/作者），
       所以先用它顶上——点进去立刻有内容，评论区分开慢慢加载。
       以前是干等骨架屏，用户会以为卡死了。 */
    var fromList = false;
    if (!p) {
      for (var li = 0; li < (d.items || []).length; li++) {
        if (d.items[li].id === id) { p = d.items[li]; fromList = true; break; }
      }
    }
    if (!p && !d.detailLoading && !d.detailError) {
      setTimeout(function () { loadDecisionDetail(id); }, 0);
    }
    if (p && !d.detail && !d.detailLoading && !d.detailError) {
      setTimeout(function () { loadDecisionDetail(id); }, 0);
    }

    if (d.detailError && !p) {
      return head + '<div class="empty">' + esc(d.detailError) +
        '<div class="empty-act" data-act="dcDetailReload">重试</div></div>';
    }
    if (!p) return head + '<div class="dc-skel"><i></i><i></i><i></i></div>';

    var closed = p.status === "closed";
    var verdict = "";
    if (closed) {
      verdict = p.finalChoice === "skip"
        ? '<div class="dc-verdict skip">已听劝 · 省下 ¥' + money(p.amountCents) + " 🎉</div>"
        : '<div class="dc-verdict buy">还是买了 · ¥' + money(p.amountCents) + "</div>";
    }

    var post = '<div class="dc-card dc-detail' + (closed ? " closed" : "") + '">' +
      '<div class="dc-top">' +
        '<div class="dc-title">' + esc(p.title) + "</div>" +
        '<div class="dc-amount">¥' + money(p.amountCents) + "</div>" +
      "</div>" +
      (p.reason ? '<div class="dc-reason">' + esc(p.reason) + "</div>" : "") +
      verdict + dcVoteBar(p) + dcActionsFor(p) +
      '<div class="dc-meta">' + avatarHTML(p.author, toneOf(p.author), "sm") +
        "<span>" + esc(p.author) + " · " + agoText(p.createdAt) +
        (p.category ? " · " + esc(p.category) : "") + "</span>" +
        (p.isMine
          ? '<span class="dc-del" data-act="dcDelete" data-id="' + p.id + '">删除这条</span>'
          : "") +
      "</div>" +
    "</div>";

    var cms = p.comments || [];
    var commentsPending = !cms.length && (fromList || d.detailLoading || !d.detail);
    var list = cms.length
      ? cms.map(function (c) {
          var tag = c.kind === "vote"
            ? '<span class="dc-cmt-tag ' + esc(c.choice || "") + '">' + (DC_CHOICE_TEXT[c.choice] || "投票") + "</span>"
            : '<span class="dc-cmt-tag talk">点评</span>';
          var isReply = !!c.parentId;
          /* 只有「点评」能点赞——投票理由那条的 id 是 v<N>，不是真评论，
             给它点个赞没地方存，干脆不显示，别做假的按钮。 */
          var canLike = c.kind === "comment" && c.id && c.id.charAt(0) === "c";
          var cid = canLike ? c.id.slice(1) : "";
          var likeBtn = canLike
            ? '<button class="dc-like' + (c.liked ? " on" : "") + '" data-act="dcLike" data-id="' + cid + '">' +
                '<span class="thumb">' + (c.liked ? "👍" : "👍") + "</span>" +
                '<span class="n">' + (c.likes || "") + "</span></button>"
            : "";
          var replyBtn = c.kind === "comment"
            ? '<button class="dc-reply" data-act="dcReply" data-id="' + cid + '" data-who="' +
                esc(c.author || "匿名") + '">回复</button>'
            : "";
          return '<div class="dc-cmt' + (c.mine ? " mine" : "") + (isReply ? " is-reply" : "") + '">' +
            '<div class="dc-cmt-h">' + esc(c.author || "匿名") + tag +
              (isReply && c.replyTo ? '<span class="dc-cmt-to">回复 ' + esc(c.replyTo) + "</span>" : "") +
              "<em>" + agoText(c.createdAt) + "</em></div>" +
            '<div class="dc-cmt-b">' + esc(c.content) + "</div>" +
            '<div class="dc-cmt-f">' + likeBtn + replyBtn + "</div>" +
          "</div>";
        }).join("")
      : (commentsPending
          ? '<div class="dc-cmt-empty">正在加载评论…</div>'
          : '<div class="dc-cmt-empty">还没有人留话</div>');

    var replyHint = d.replyTo
      ? '<div class="dc-reply-hint">回复 <b>' + esc(d.replyTo.author) + "</b>" +
        '<span data-act="dcReplyCancel">取消</span></div>'
      : "";
    var composer = '<div class="dc-cmt-form">' + replyHint +
      '<div class="dc-cmt-row">' +
      '<input data-act="dcComment" maxlength="300" placeholder="' +
        (d.replyTo ? "回复 " + esc(d.replyTo.author) + "…" : "说一句，给个理由") +
        '" value="' + esc(d.commentDraft) + '">' +
      '<button data-act="dcSendComment"' + (d.commentBusy ? " disabled" : "") + ">" +
        (d.commentBusy ? "发送中" : "发送") + "</button>" +
      "</div></div>";

    return head + post +
      '<div class="dc-cmt-wrap">' +
        '<div class="dc-cmt-title">讨论 · ' + cms.length + " 条</div>" +
        list + composer +
      "</div>";
  }

  function dcResetFeed() {
    var d = decideState();
    d.items = [];
    d.loaded = false;
    d.hasMore = false;
    d.error = "";
    d.seq = (d.seq || 0) + 1;   // 让还在飞的旧请求作废
    loadDecideFeed(false);
  }

  /* ================= 视图：登录（未登录时唯一的页面） ================= */

  /* 学钱往：不登录进不来。但记账这件事本身要能离线做——
     所以是「首次必须登录」，登录后 token 长期留着，
     断网照样记，联网自动同步。不是每次打开都验一遍账号。 */
  function viewAuth() {
    var isReg = ui.authPanel === "register";
    var busy = !!ui.syncing;
    return '<div class="auth-page">' +
      '<div class="auth-brand">' +
        '<div class="auth-mark">' + '<svg viewBox="0 0 200 200" aria-hidden="true"><path fill="#EAF7FD" d="M101.4 21.0L100.1 22.5L98.9 23.9L97.8 25.4L96.8 27.0L95.8 28.6L94.8 30.2L94.0 31.8L93.1 33.5L92.4 35.2L91.7 36.9L91.0 38.6L90.5 40.4L89.9 42.1L89.4 43.9L89.0 45.7L88.6 47.5L88.3 49.3L88.0 51.1L87.7 53.0L87.5 54.8L87.3 56.6L87.2 58.5L87.1 60.3L87.0 62.2L86.9 64.0L86.9 65.8L86.8 67.7L86.8 69.5L86.8 71.3L86.8 73.2L86.9 75.0L86.9 76.8L86.9 78.6L87.0 80.4L87.0 82.2L87.0 84.0L87.1 85.8L87.1 87.6L87.1 89.4L87.1 91.1L87.1 92.9L87.1 94.6L87.1 96.3L87.1 98.0L87.0 99.7L86.9 101.4L86.8 103.1L86.7 104.7L86.6 106.4L86.4 108.0L86.2 109.6L86.0 111.1L85.8 112.7L85.5 114.2L85.2 115.8L84.9 117.2L84.5 118.7L84.1 120.2L83.7 121.6L83.3 123.0L82.8 124.4L82.3 125.8L81.8 127.2L81.2 128.6L80.6 129.9L79.9 131.2L79.3 132.6L78.6 133.9L77.8 135.2L77.0 136.5L76.2 137.8L75.3 139.1L124.7 160.9L125.6 158.0L126.4 155.2L127.1 152.4L127.7 149.6L128.2 146.8L128.7 144.1L129.1 141.4L129.4 138.7L129.6 136.0L129.7 133.4L129.8 130.8L129.8 128.3L129.8 125.8L129.7 123.3L129.5 120.9L129.3 118.5L129.1 116.1L128.7 113.8L128.4 111.5L128.0 109.2L127.6 107.0L127.2 104.8L126.7 102.7L126.2 100.6L125.6 98.5L125.1 96.5L124.5 94.5L123.9 92.6L123.3 90.6L122.7 88.7L122.1 86.9L121.5 85.0L120.9 83.2L120.2 81.4L119.6 79.7L119.0 78.0L118.3 76.3L117.7 74.6L117.1 72.9L116.5 71.3L115.9 69.7L115.3 68.2L114.7 66.6L114.2 65.1L113.6 63.6L113.1 62.1L112.6 60.6L112.1 59.2L111.7 57.7L111.2 56.3L110.8 54.9L110.4 53.6L110.1 52.2L109.7 50.9L109.4 49.5L109.2 48.2L108.9 46.9L108.7 45.6L108.6 44.3L108.4 43.0L108.3 41.7L108.3 40.4L108.3 39.1L108.3 37.8L108.4 36.5L108.5 35.2L108.7 33.8L109.0 32.5L109.3 31.1L109.7 29.8L110.1 28.4L110.6 27.0Z"/><path fill="none" stroke="#A8E0F7" stroke-width="16" stroke-linecap="round" d="M18 164q20-14 40 0t40 0t40 0t40 0"/></svg>' + "</div>" +
        "<h1>长流</h1>" +
        '<p>' + (isReg ? "建个账号，账本跟着你走" : "每一笔都算数") + "</p>" +
      "</div>" +

      '<div class="auth-card">' +
        '<div class="auth-field">' +
          "<label>用户名</label>" +
          '<input data-act="authUser" autocomplete="username" placeholder="3–20 位字母或数字" value="' + esc(ui.authUser) + '">' +
        "</div>" +
        '<div class="auth-field">' +
          "<label>密码</label>" +
          '<input data-act="authPwd" type="password" autocomplete="' + (isReg ? "new-password" : "current-password") +
            '" placeholder="' + (isReg ? "至少 6 位" : "输入密码") + '" value="' + esc(ui.authPwd) + '">' +
        "</div>" +
        '<button class="auth-submit" data-act="doAuth"' + (busy ? " disabled" : "") + ">" +
          (busy ? "处理中…" : (isReg ? "注册并登录" : "登录")) +
        "</button>" +
      "</div>" +

      '<div class="auth-switch" data-act="switchAuth">' +
        (isReg ? "已有账号？去登录" : "还没有账号？立即注册") +
      "</div>" +

      '<div class="auth-note">' +
        "账本加密后才上传，服务端也解不开<br>换手机登录同一个账号，数据自动回来" +
      "</div>" +
    "</div>";
  }

  /* ================= 个人资料（昵称 + 头像） ================= */

  /* 头像不用上传照片：账本类应用要相册权限没有道理，也没有图片存储。
     做法是「昵称首字 + 一组海天蓝渐变」，换底色就是另一个头像。
     广场上别人只有打码名，所以在本机按名字算同一个色——不同人一眼能分开。 */
  var PROFILE_KEY = "sz.profile.v1";
  var AVATAR_TONES = [
    ["#0E3550", "#2F8CB5"], ["#17557A", "#4FB3DE"], ["#123F5C", "#2E86AE"],
    ["#155E75", "#22A6B3"], ["#1E7A58", "#5BC49A"], ["#2F7D6E", "#6FC2A8"],
    ["#7A5C2E", "#C7912F"], ["#8A5A2B", "#D08A4A"], ["#5B4B8A", "#8E7BC4"],
    ["#8A3B52", "#C4557A"], ["#334155", "#64748B"], ["#1F3A5F", "#4A7BB0"]
  ];

  function loadProfile() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch (e) { p = null; }
    if (!p || typeof p !== "object") p = {};
    var tone = Number(p.tone);
    if (!isFinite(tone) || tone < 0 || tone >= AVATAR_TONES.length) tone = 0;
    return { nick: typeof p.nick === "string" ? p.nick : "", tone: tone };
  }

  function saveProfile(p) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        nick: String((p && p.nick) || "").slice(0, 12),
        tone: Number(p && p.tone) || 0
      }));
    } catch (e) { /* 存不下不影响记账 */ }
  }

  /* 显示名：自己设的昵称优先，没设就用登录账号名 */
  function myName() {
    var p = loadProfile();
    if (p.nick) return p.nick;
    if (auth && auth.username) return auth.username;
    return "我";
  }

  function firstChar(str) {
    var t = String(str || "").trim();
    if (!t) return "我";
    return t.slice(0, 1).toUpperCase();
  }

  function toneOf(str) {
    var h = 0, t = String(str || "");
    for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 9973;
    return h % AVATAR_TONES.length;
  }

  function avatarHTML(name, tone, cls) {
    var i = Number(tone);
    if (!isFinite(i)) i = toneOf(name);
    i = ((i % AVATAR_TONES.length) + AVATAR_TONES.length) % AVATAR_TONES.length;
    var t = AVATAR_TONES[i];
    return '<span class="avatar ' + (cls || "") + '" aria-hidden="true" style="background:linear-gradient(140deg,' +
      t[0] + "," + t[1] + ')">' + esc(firstChar(name)) + "</span>";
  }

  /* 输昵称时只改预览，不整页重绘——整页重绘会把输入焦点丢掉 */
  function paintProfilePreview() {
    var nick = ui.pfNick === undefined ? loadProfile().nick : ui.pfNick;
    var fallback = (auth && auth.username) || "我";
    var av = document.querySelector(".pf-preview .avatar");
    if (av) av.textContent = firstChar(String(nick || "").trim() || fallback);
    var nm = document.querySelector(".pf-preview .pf-name");
    if (nm) nm.textContent = String(nick || "").trim() || fallback;
  }

  /* ================= 视图：设置 ================= */

  /* 微信里做不了强制刷新，页面被旧版 Service Worker 缓存锁住时用户只能干瞪眼。
     这个按钮把缓存和 SW 全部清掉再重载，等于一次干净的重新安装。 */
  function forceUpdate() {
    toast("正在更新…", null, null, 2000);
    function done() { location.reload(); }
    var jobs = [];
    try {
      if (window.caches && caches.keys) {
        jobs.push(caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }).catch(function () {}));
      }
    } catch (e) {}
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister(); }));
        }).catch(function () {}));
      }
    } catch (e) {}
    Promise.all(jobs).then(done).catch(done);
    setTimeout(done, 1500);   // 兜底：清缓存卡住也要重载
  }

  /* 设置改成两层：一层只放分组入口，点进去才是具体开关。
     原来一屏堆了 18 行（账号、账户、分类、导出、恢复、CSV、清空、暂存、版本…），
     手机上得滑三屏，常用的和一辈子点一次的挤在一起。 */
  function sizeKB() {
    var n = 0;
    try { n = (localStorage.getItem(STORE_KEY) || "").length; } catch (e) { n = 0; }
    return (n / 1024).toFixed(1);
  }

  function syncAgo(ts) {
    if (!ts) return "还没同步过";
    var diff = Date.now() - ts;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
    if (diff < 86400000) return Math.floor(diff / 3600000) + " 小时前";
    return Math.floor(diff / 86400000) + " 天前";
  }

  function setHead(title) {
    return '<div class="topbar"><div class="icon-btn" data-act="setBack">‹</div>' +
      "<h1>" + title + '</h1><div class="icon-btn"></div></div>';
  }

  function viewConfig() {
    var sub = parseHash().params.p || "";
    if (sub === "profile") return viewProfile();
    if (sub === "account") return viewSetAccount();
    if (sub === "data") return viewSetData();
    if (sub === "about") return viewSetAbout();
    return viewSetHome();
  }

  /* 一层：个人卡 + 四组入口 + 暂存账本 */
  function viewSetHome() {
    var pf = loadProfile();
    var who = auth ? myName() : "还没登录";
    var sub = auth
      ? "@" + auth.username + " · 数据加密后才上云"
      : "数据只在本机，登录后可跨设备同步";

    var stomp = (function () {
      var o = readOrphan();
      if (!o) return "";
      var when = new Date(o.at);
      return '<div class="card ov-card"><div class="card-title">暂存的本机账本</div>' +
        '<div class="list-row"><span>' + esc(String(o.entries || 0)) + " 条流水 · " +
          esc(String(o.holdings || 0)) + " 只持仓</span>" +
          '<span class="hint">' + esc((when.getMonth() + 1) + "月" + when.getDate() + "日") + "暂存</span></div>" +
        '<div class="list-row"><span>这是另一份账本</span><span class="hint">云端优先，不会自动上传</span></div>' +
        '<div class="list-row" data-act="mergeOrphan"><span>并入当前账号</span><span class="hint">合并后一起备份 ›</span></div>' +
        '<div class="list-row" data-act="exportOrphan"><span>导出成 JSON</span><span class="hint">先存下来再说 ›</span></div>' +
        '<div class="list-row" data-act="dropOrphan"><span>丢弃</span><span class="hint">删掉这份暂存 ›</span></div>' +
        "</div>";
    })();

    return '<div class="topbar"><div><h1>设置</h1><div class="sub">数据都在本机</div></div></div>' +
      '<div class="card ov-card profile-card" data-act="setGo" data-p="profile">' +
        avatarHTML(myName(), pf.tone, "lg") +
        '<div class="body"><div class="nm">' + esc(who) + "</div>" +
          '<div class="sub">' + esc(sub) + "</div></div>" +
        '<span class="hint">编辑 ›</span>' +
      "</div>" +
      '<div class="card ov-card">' +
        '<div class="list-row" data-act="setGo" data-p="account"><span>账号与同步</span>' +
          '<span class="hint">' + (auth ? syncAgo(auth.lastSyncAt) + " ›" : "未登录 ›") + "</span></div>" +
        '<div class="list-row" data-act="setGo" data-p="data"><span>数据备份</span>' +
          '<span class="hint">' + db.entries.length + " 条 · " + sizeKB() + " KB ›</span></div>" +
        '<div class="list-row" data-act="goWallets"><span>账户</span>' +
          '<span class="hint">' + db.wallets.length + " 个 ›</span></div>" +
        '<div class="list-row" data-act="goTags"><span>分类</span>' +
          '<span class="hint">' + db.tags.length + " 个 ›</span></div>" +
        '<div class="list-row" data-act="setGo" data-p="about"><span>关于与更新</span>' +
          '<span class="hint">v' + APP_VERSION + " ›</span></div>" +
      "</div>" +
      stomp;
  }

  /* 二层：昵称 + 头像 */
  function viewProfile() {
    var pf = loadProfile();
    var nick = ui.pfNick === undefined ? pf.nick : ui.pfNick;
    var tone = ui.pfTone === undefined ? pf.tone : ui.pfTone;
    var shown = String(nick || "").trim() || (auth && auth.username) || "我";
    var tones = AVATAR_TONES.map(function (t, i) {
      return '<span class="tone' + (i === tone ? " on" : "") + '" data-act="pfTone" data-i="' + i +
        '" style="background:linear-gradient(140deg,' + t[0] + "," + t[1] + ')"></span>';
    }).join("");
    return setHead("个人资料") +
      '<div class="card ov-card pf-preview">' +
        avatarHTML(shown, tone, "xl") +
        '<div class="pf-name">' + esc(shown) + "</div>" +
        '<div class="pf-sub">' + (auth ? "@" + esc(auth.username) : "未登录也能用，登录后别人能看到") + "</div>" +
      "</div>" +
      '<div class="card ov-card"><div class="card-title">昵称</div>' +
        '<div class="field-row"><label>显示名</label>' +
          '<input data-act="pfNick" maxlength="12" placeholder="起个名字" value="' + esc(nick) + '"></div>' +
        '<div class="list-row"><span>账号</span>' +
          '<span class="hint">' + esc(auth ? auth.username : "未登录") + "（登录用，不可改）</span></div>" +
      "</div>" +
      '<div class="card ov-card"><div class="card-title">头像底色</div>' +
        '<div class="tone-pick">' + tones + "</div>" +
        '<div class="list-row"><span>头像怎么来的</span>' +
          '<span class="hint">昵称首字 + 底色，不上传照片</span></div>' +
      "</div>" +
      '<button class="btn-primary" data-act="pfSave">保存</button>' +
      (pf.nick || pf.tone ? '<button class="btn-ghost" data-act="pfReset">恢复默认</button>' : "");
  }

  /* 二层：账号与同步（登录 / 注册 / 同步 / 退出 / 注销） */
  function viewSetAccount() {
    if (!auth) {
      if (ui.authPanel === "login" || ui.authPanel === "register") {
        var isReg = ui.authPanel === "register";
        return setHead("账号与同步") + '<div class="card ov-card"><div class="card-title">账号</div>' +
          '<div class="field-row"><label>用户名</label>' +
            '<input data-act="authUser" autocomplete="username" placeholder="3–20 位字母数字" value="' + esc(ui.authUser) + '"></div>' +
          '<div class="field-row"><label>密码</label>' +
            '<input data-act="authPwd" type="password" autocomplete="' + (isReg ? "new-password" : "current-password") +
            '" placeholder="' + (isReg ? "至少 6 位" : "输入密码") + '" value="' + esc(ui.authPwd) + '"></div>' +
          '<button class="btn-primary" data-act="doAuth">' + (isReg ? "注册并登录" : "登录") + "</button>" +
          '<div class="list-row" data-act="switchAuth"><span>' + (isReg ? "已有账号" : "还没有账号") +
            '</span><span class="hint">' + (isReg ? "去登录 ›" : "去注册 ›") + "</span></div>" +
        "</div>";
      }
      return setHead("账号与同步") + '<div class="card ov-card"><div class="card-title">账号</div>' +
        '<div class="list-row" data-act="openAuth"><span>登录 / 注册</span>' +
          '<span class="hint">登录后跨设备同步 ›</span></div>' +
      "</div>" +
      '<div class="card ov-card"><div class="card-title">说明</div>' +
        '<div class="list-row"><span>不登录也能记</span><span class="hint">数据全在本机</span></div>' +
        '<div class="list-row"><span>登录之后</span><span class="hint">加密后上传，云端解不开</span></div>' +
      "</div>";
    }

    return setHead("账号与同步") +
      '<div class="card ov-card"><div class="card-title">账号</div>' +
        '<div class="mrow">' +
          avatarHTML(myName(), loadProfile().tone, "") +
          '<div class="body"><div class="nm">' + esc(myName()) + "</div>" +
            '<div class="sub">@' + esc(auth.username) + "</div></div>" +
          '<span class="mrow-act" data-act="setGo" data-p="profile">改名</span>' +
        "</div>" +
        '<div class="list-row"><span>上次同步</span>' +
          '<span class="hint">' + syncAgo(auth.lastSyncAt) + " · v" + (auth.revision || 0) + "</span></div>" +
        '<div class="list-row" data-act="syncNow"><span>立即同步</span><span class="hint">›</span></div>' +
      "</div>" +
      '<div class="card ov-card"><div class="card-title">退出与注销</div>' +
        '<div class="list-row" data-act="logoutAccount"><span>退出登录</span>' +
          '<span class="hint">本机数据保留</span></div>' +
        '<div class="list-row" data-act="deleteAccount"><span>注销账号</span>' +
          '<span class="hint">清空云端并删除 ›</span></div>' +
      "</div>";
  }

  /* 二层：数据备份（导出 / 恢复 / CSV / 清空） */
  function viewSetData() {
    return setHead("数据备份") +
      '<div class="card ov-card"><div class="card-title">现在有多少</div>' +
        '<div class="list-row"><span>记录条数</span><span class="hint">' + db.entries.length + " 条</span></div>" +
        '<div class="list-row"><span>占用空间</span><span class="hint">' + sizeKB() + " KB</span></div>" +
      "</div>" +
      '<div class="card ov-card"><div class="card-title">备份与还原</div>' +
        '<div class="list-row" data-act="exportData"><span>导出备份</span><span class="hint">下载 JSON ›</span></div>' +
        '<div class="list-row" data-act="importJson"><span>恢复备份</span><span class="hint">从 JSON 还原 ›</span></div>' +
        '<div class="list-row" data-act="exportCsv"><span>导出 CSV</span><span class="hint">Excel 可打开 ›</span></div>' +
        '<div class="list-row" data-act="importCsv"><span>导入 CSV</span><span class="hint">从表格导入 ›</span></div>' +
      "</div>" +
      '<div class="card ov-card"><div class="card-title">危险操作</div>' +
        '<div class="list-row" data-act="resetData"><span>清空重来</span>' +
          '<span class="hint">全部记录与账户重置 ›</span></div>' +
      "</div>";
  }

  /* 二层：关于与更新 */
  function viewSetAbout() {
    return setHead("关于与更新") +
      '<div class="card ov-card"><div class="card-title">版本</div>' +
        '<div class="list-row"><span>当前版本</span><span class="hint">' + APP_VERSION + "</span></div>" +
        '<div class="list-row" data-act="forceUpdate"><span>检查更新</span>' +
          '<span class="hint">清缓存并重新加载 ›</span></div>' +
      "</div>" +
      '<div class="card ov-card"><div class="card-title">数据在哪</div>' +
        '<div class="list-row"><span>账本存放</span><span class="hint">本机 localStorage</span></div>' +
        '<div class="list-row"><span>联网用在哪</span><span class="hint">行情、同步、识别</span></div>' +
        '<div class="list-row"><span>加密</span><span class="hint">上传前在本机加密</span></div>' +
      "</div>" +
      '<div class="card ov-card"><div class="card-title">条款</div>' +
        '<a class="list-row" href="privacy.html"><span>隐私政策与用户协议</span><span class="hint">›</span></a>' +
        '<a class="list-row" href="guide.html"><span>新手指引</span><span class="hint">›</span></a>' +
      "</div>";
  }

  /* ================= 账户管理 ================= */

  function viewWallets() {
    var bal = walletBalances();
    var rows = db.wallets.map(function (w) {
      var used = db.entries.filter(function (e) {
        return e.walletId === w.id || e.toWalletId === w.id;
      }).length;
      return '<div class="mrow" data-act="editWallet" data-id="' + esc(w.id) + '">' +
        '<div class="g"' + gStyle(w, false) + ">" + iconOf(w.id, iconOf("w_cash")) + "</div>" +
        '<div class="body">' +
          '<div class="nm">' + esc(w.name) + "</div>" +
          '<div class="sub">期初 ' + cash(w.opening) + (used ? " · " + used + " 笔" : " · 还没用过") + "</div>" +
        "</div>" +
        '<div class="bal">' + cash(bal[w.id] || 0) + "</div>" +
        '<span class="mrow-act del" aria-label="删除" data-act="delWallet" data-id="' + esc(w.id) + '">' + iconOf("trash") + "</span>" +
      "</div>";
    }).join("");

    var editing = ui.editWalletId ? db.wallets.filter(function (w) { return w.id === ui.editWalletId; })[0] : null;

    return (
      '<div class="topbar"><div class="icon-btn" data-act="back">‹</div><h1>账户</h1><div class="icon-btn"></div></div>' +
      '<div class="card ov-card"><div class="card-title">现有账户</div>' + rows + "</div>" +
      '<div class="card ov-card"><div class="card-title">' + (editing ? "改「" + esc(editing.name) + "」" : "新增账户") + "</div>" +
        '<div class="field-row"><label>名称</label><input data-act="wName" placeholder="比如 招商银行" value="' + esc(ui.wName) + '"></div>' +
        '<div class="field-row"><label>期初余额</label><input data-act="wOpening" type="number" inputmode="decimal" placeholder="0" value="' + esc(ui.wOpening) + '"></div>' +
      "</div>" +
      '<button class="btn-primary" data-act="saveWallet">' + (editing ? "保存修改" : "添加账户") + "</button>" +
      (editing ? '<button class="btn-ghost" data-act="cancelWallet">取消</button>' : "") +
      '<div class="card ov-card"><div class="card-title">说明</div>' +
        '<div class="list-row"><span>期初余额</span><span class="hint">开始记账时这个账户里有多少钱</span></div>' +
        '<div class="list-row"><span>删除</span><span class="hint">有记录的账户不能删，先改记录</span></div>' +
      "</div>"
    );
  }

  function saveWallet() {
    var name = String(ui.wName || "").trim();
    if (!name) { toast("填个名字"); return; }
    var opening = parseFloat(ui.wOpening);
    if (!isFinite(opening)) opening = 0;
    var openingCents = Math.round(opening * 100);

    if (ui.editWalletId) {
      var w = db.wallets.filter(function (x) { return x.id === ui.editWalletId; })[0];
      if (!w) return;
      w.name = name;
      w.opening = openingCents;
      toast("已保存");
    } else {
      if (db.wallets.some(function (x) { return x.name === name; })) { toast("已有同名账户", null, null, 2400); return; }
      db.wallets.push({
        id: uid("w"), name: name, glyph: "•", opening: openingCents,
        color: "#767680", tint: "#F1F1F4"
      });
      toast("已添加 " + name);
    }
    ui.wName = ""; ui.wOpening = ""; ui.editWalletId = "";
    save();
    render();
  }

  function delWallet(id) {
    var w = db.wallets.filter(function (x) { return x.id === id; })[0];
    if (!w) return;
    var used = db.entries.filter(function (e) {
      return e.walletId === id || e.toWalletId === id;
    }).length;
    if (used) { toast("「" + w.name + "」还有 " + used + " 笔记录在用，先改到别的账户", null, null, 3000); return; }
    if (db.wallets.length <= 1) { toast("至少留一个账户", null, null, 2400); return; }
    if (!confirm("删除账户「" + w.name + "」？")) return;
    db.wallets = db.wallets.filter(function (x) { return x.id !== id; });
    save();
    render();
    toast("已删除");
  }

  /* ================= 分类管理 ================= */

  var TAG_ICON_CHOICES = ["t_food", "t_car", "t_buy", "t_home", "t_fun", "t_med", "t_study", "t_misc", "t_pay", "t_div"];

  function viewTags() {
    var editing = ui.editTagId ? db.tags.filter(function (t) { return t.id === ui.editTagId; })[0] : null;
    var flow = editing ? editing.flow : (ui.tagFlow || "out");

    function group(f, label) {
      var list = db.tags.filter(function (t) { return t.flow === f; });
      if (!list.length) return "";
      return '<div class="card ov-card"><div class="card-title">' + label + "（" + list.length + "）</div>" +
        list.map(function (t) {
          var used = db.entries.filter(function (e) { return e.tagId === t.id; }).length;
          return '<div class="mrow" data-act="editTag" data-id="' + esc(t.id) + '">' +
            '<div class="g"' + gStyle(t, false) + ">" + tagIcon(t) + "</div>" +
            '<div class="body"><div class="nm">' + esc(t.name) + "</div>" +
              '<div class="sub">' + (used ? used + " 笔记录" : "还没用过") + "</div></div>" +
            '<span class="mrow-act del" aria-label="删除" data-act="delTag" data-id="' + esc(t.id) + '">' + iconOf("trash") + "</span>" +
          "</div>";
        }).join("") + "</div>";
    }

    var iconPick = TAG_ICON_CHOICES.map(function (ic) {
      return '<span class="icon-pick' + (ui.tagIcon === ic ? " on" : "") + '" data-act="pickTagIcon" data-v="' + ic + '">' +
        iconOf(ic) + "</span>";
    }).join("");

    return (
      '<div class="topbar"><div class="icon-btn" data-act="back">‹</div><h1>分类</h1><div class="icon-btn"></div></div>' +
      group("out", "支出") + group("in", "收入") +
      '<div class="card ov-card"><div class="card-title">' + (editing ? "改「" + esc(editing.name) + "」" : "新增分类") + "</div>" +
        '<div class="field-row"><label>名称</label><input data-act="tagName" placeholder="比如 宠物" value="' + esc(ui.tagName) + '"></div>' +
        '<div class="field-row"><label>类型</label>' +
          '<span class="seg-inline">' +
            '<span class="si' + (flow === "out" ? " on" : "") + '" data-act="setTagFlow" data-v="out">支出</span>' +
            '<span class="si' + (flow === "in" ? " on" : "") + '" data-act="setTagFlow" data-v="in">收入</span>' +
          "</span>" +
        "</div>" +
        '<div class="field-row icon-row"><label>图标</label></div>' +
        '<div class="icon-grid">' + iconPick + "</div>" +
      "</div>" +
      '<button class="btn-primary" data-act="saveTag">' + (editing ? "保存修改" : "添加分类") + "</button>" +
      (editing ? '<button class="btn-ghost" data-act="cancelTag">取消</button>' : "") +
      '<div class="card ov-card"><div class="card-title">说明</div>' +
        '<div class="list-row"><span>删除</span><span class="hint">有记录的分类不能删</span></div>' +
        '<div class="list-row"><span>转账</span><span class="hint">转账不需要分类</span></div>' +
      "</div>"
    );
  }

  function saveTag() {
    var name = String(ui.tagName || "").trim();
    if (!name) { toast("填个名字"); return; }
    var flow = ui.tagFlow === "in" ? "in" : "out";
    var icon = ui.tagIcon || "t_misc";
    if (ui.editTagId) {
      var t = db.tags.filter(function (x) { return x.id === ui.editTagId; })[0];
      if (!t) return;
      var dup = db.tags.some(function (x) { return x.id !== t.id && x.name === name && x.flow === flow; });
      if (dup) { toast("同类下已有这个名字", null, null, 2400); return; }
      t.name = name; t.flow = flow; t.customIcon = icon;
      toast("已保存");
    } else {
      if (db.tags.some(function (x) { return x.name === name && x.flow === flow; })) { toast("同类下已有这个名字", null, null, 2400); return; }
      db.tags.push({
        id: uid("t"), name: name, glyph: "•", flow: flow,
        seq: 99, color: "#767680", tint: "#F1F1F4", customIcon: icon
      });
      toast("已添加 " + name);
    }
    ui.tagName = ""; ui.editTagId = ""; ui.tagIcon = "";
    save();
    render();
  }

  function delTag(id) {
    var t = db.tags.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    var used = db.entries.filter(function (e) { return e.tagId === id; }).length;
    if (used) { toast("「" + t.name + "」还有 " + used + " 笔记录在用，先改分类", null, null, 3000); return; }
    var sameFlow = db.tags.filter(function (x) { return x.flow === t.flow; });
    if (sameFlow.length <= 1) { toast("这类至少留一个分类", null, null, 2400); return; }
    if (!confirm("删除分类「" + t.name + "」？")) return;
    db.tags = db.tags.filter(function (x) { return x.id !== id; });
    save();
    render();
    toast("已删除");
  }

  /* ================= 搜索 =================
     记录一多就只能一个月一个月翻，这是记账软件最容易缺的一环。
     备注 / 分类名 / 账户名 / 金额 / 日期 都能搜，跨全部月份。 */

  function matchEntry(e, kw) {
    if (!kw) return false;
    var t = tagById(e.tagId);
    var w = walletById(e.walletId);
    var tw = e.toWalletId ? walletById(e.toWalletId) : null;
    var hay = [
      e.memo || "", t.name || "", w.name || "", tw ? tw.name : "",
      (e.cents / 100).toFixed(2), e.day || ""
    ].join(" ").toLowerCase();
    if (hay.indexOf(kw) >= 0) return true;
    // 金额只输整数也要命中：388 能搜到 388.00 / 388.50
    var num = parseFloat(kw);
    if (isFinite(num) && num > 0) {
      if (Math.abs(e.cents - Math.round(num * 100)) <= 1) return true;
    }
    return false;
  }

  function searchRowsHtml(q) {
    var kw = String(q || "").trim().toLowerCase();
    if (!kw) return '<div class="empty">备注、分类、账户、金额都能搜</div>';
    var hits = db.entries.filter(function (e) { return matchEntry(e, kw); });
    hits.sort(function (a, b) {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      return (b.at || 0) - (a.at || 0);
    });
    if (!hits.length) return '<div class="empty">没找到「' + esc(q) + '」</div>';

    var sumOut = 0, sumIn = 0;
    hits.forEach(function (e) {
      if (e.flow === "out") sumOut += e.cents;
      else if (e.flow === "in") sumIn += e.cents;
    });
    var head = '<div class="search-sum">共 <b>' + hits.length + "</b> 笔" +
      (sumOut ? " · 支出 ¥" + money(sumOut) : "") +
      (sumIn ? " · 收入 ¥" + money(sumIn) : "") + "</div>";

    var rows = hits.slice(0, 300).map(function (e) {
      var t = tagById(e.tagId);
      var w = walletById(e.walletId);
      var tw = e.toWalletId ? walletById(e.toWalletId) : null;
      var title = esc(t.name) + (e.memo ? " · " + esc(e.memo) : "");
      var sub = e.day + " · " + esc(e.flow === "move" ? w.name + " → " + (tw ? tw.name : "?") : w.name);
      var amt = e.flow === "out" ? "-¥" + money(e.cents)
        : e.flow === "in" ? "+¥" + money(e.cents)
        : "¥" + money(e.cents);
      return '<div class="mrow" data-act="openEntry" data-id="' + esc(e.id) + '">' +
        '<div class="g"' + gStyle(t, false) + ">" + tagIcon(t) + "</div>" +
        '<div class="body"><div class="nm">' + title + "</div>" +
          '<div class="sub">' + sub + "</div></div>" +
        '<div class="bal ' + (e.flow === "in" ? "in" : "") + '">' + amt + "</div>" +
      "</div>";
    }).join("");

    return head + rows +
      (hits.length > 300 ? '<div class="search-more">只显示最近 300 笔，关键词再收窄一点</div>' : "");
  }

  function viewSearch() {
    return (
      '<div class="topbar"><div class="icon-btn" data-act="back">‹</div><h1>搜索</h1><div class="icon-btn"></div></div>' +
      '<div class="search-box"><input data-act="searchQ" type="search" inputmode="search" ' +
        'autocomplete="off" placeholder="备注、分类、账户或金额" value="' + esc(ui.searchQ) + '"></div>' +
      '<div class="search-results">' + searchRowsHtml(ui.searchQ) + "</div>"
    );
  }

  /* 只重画结果区：整页 render 会让输入框失焦 */
  function paintSearch() {
    var box = document.querySelector(".search-results");
    if (box) box.innerHTML = searchRowsHtml(ui.searchQ);
  }

  /* ================= 路由与渲染 ================= */

  var TABS = [
    { href: "#/book", key: "book", ic: "nav_book", name: "账本" },
    { href: "#/assets", key: "assets", ic: "nav_stats", name: "统计" },
    { href: "#/decide", key: "decide", ic: "nav_decide", name: "决策" },
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

  /* 二级页的上一级：返回按钮回到自己所属的那一页，
     别不管从哪儿来都甩回账本——从资产点进持仓，退回资产才是对的。 */
  var VIEW_PARENT = {
    overview: "assets",
    holdings: "assets",
    wallet: "assets",
    wallets: "config",
    tags: "config",
    auto: "book",
    search: "book"
  };

  VIEW_PARENT.stock = "holdings";

  function goBack() {
    var v = parseHash().view;
    if (v === "entry") {
      resetEntryForm();
      location.hash = "#/" + (VIEW_PARENT.entry || "book");
      return;
    }
    location.hash = "#/" + (VIEW_PARENT[v] || "book");
  }

  /* 上一次渲染的路由标识，用来判断是「换页」还是「同页重绘」 */
  var lastRoute = "";

  /* ================= 首次启动隐私同意（国内商店硬性要求） ================= */
  var CONSENT_KEY = "sz.consent.v1";

  function consentOK() {
    try { return localStorage.getItem(CONSENT_KEY) === "1"; } catch (e) { return true; }
  }

  function renderConsent() {
    var app = document.getElementById("app");
    app.className = "phone auth-mode";
    app.innerHTML =
      "<div class='consent-page'>" +
        "<div class='consent-brand'>" +
          "<div class='auth-mark'>" +
            "<svg viewBox='0 0 200 200' aria-hidden='true'><path fill='#EAF7FD' d='M101.4 21.0L100.1 22.5L98.9 23.9L97.8 25.4L96.8 27.0L95.8 28.6L94.8 30.2L94.0 31.8L93.1 33.5L92.4 35.2L91.7 36.9L91.0 38.6L90.5 40.4L89.9 42.1L89.4 43.9L89.0 45.7L88.6 47.5L88.3 49.3L88.0 51.1L87.7 53.0L87.5 54.8L87.3 56.6L87.2 58.5L87.1 60.3L87.0 62.2L86.9 64.0L86.9 65.8L86.8 67.7L86.8 69.5L86.8 71.3L86.8 73.2L86.9 75.0L86.9 76.8L86.9 78.6L87.0 80.4L87.0 82.2L87.0 84.0L87.1 85.8L87.1 87.6L87.1 89.4L87.1 91.1L87.1 92.9L87.1 94.6L87.1 96.3L87.1 98.0L87.0 99.7L86.9 101.4L86.8 103.1L86.7 104.7L86.6 106.4L86.4 108.0L86.2 109.6L86.0 111.1L85.8 112.7L85.5 114.2L85.2 115.8L84.9 117.2L84.5 118.7L84.1 120.2L83.7 121.6L83.3 123.0L82.8 124.4L82.3 125.8L81.8 127.2L81.2 128.6L80.6 129.9L79.9 131.2L79.3 132.6L78.6 133.9L77.8 135.2L77.0 136.5L76.2 137.8L75.3 139.1L124.7 160.9L125.6 158.0L126.4 155.2L127.1 152.4L127.7 149.6L128.2 146.8L128.7 144.1L129.1 141.4L129.4 138.7L129.6 136.0L129.7 133.4L129.8 130.8L129.8 128.3L129.8 125.8L129.7 123.3L129.5 120.9L129.3 118.5L129.1 116.1L128.7 113.8L128.4 111.5L128.0 109.2L127.6 107.0L127.2 104.8L126.7 102.7L126.2 100.6L125.6 98.5L125.1 96.5L124.5 94.5L123.9 92.6L123.3 90.6L122.7 88.7L122.1 86.9L121.5 85.0L120.9 83.2L120.2 81.4L119.6 79.7L119.0 78.0L118.3 76.3L117.7 74.6L117.1 72.9L116.5 71.3L115.9 69.7L115.3 68.2L114.7 66.6L114.2 65.1L113.6 63.6L113.1 62.1L112.6 60.6L112.1 59.2L111.7 57.7L111.2 56.3L110.8 54.9L110.4 53.6L110.1 52.2L109.7 50.9L109.4 49.5L109.2 48.2L108.9 46.9L108.7 45.6L108.6 44.3L108.4 43.0L108.3 41.7L108.3 40.4L108.3 39.1L108.3 37.8L108.4 36.5L108.5 35.2L108.7 33.8L109.0 32.5L109.3 31.1L109.7 29.8L110.1 28.4L110.6 27.0Z'/><path fill='none' stroke='#A8E0F7' stroke-width='16' stroke-linecap='round' d='M18 164q20-14 40 0t40 0t40 0t40 0'/></svg>" +
          "</div>" +
          "<h1>长流</h1>" +
          "<p>开始之前，请先看清我们怎么处理你的数据</p>" +
        "</div>" +
        "<div class='consent-card'>" +
          "<div class='consent-row'><b>账本</b><span>记录在本机；加密后才上传，云端和我们都解不开</span></div>" +
          "<div class='consent-row'><b>账号</b><span>只存用户名和密码的哈希，不存明文</span></div>" +
          "<div class='consent-row'><b>自动记账</b><span>需你手动开启无障碍权限；只读支付结果页的文字与截图，只取金额、商户、时间；不读聊天、不读其他应用</span></div>" +
          "<div class='consent-row'><b>第三方</b><span>截图识别会发给第三方视觉服务（DeepSeek / 火山方舟），仅传图像，不带你的账号信息</span></div>" +
          "<div class='consent-row'><b>你的权利</b><span>随时导出全部数据、随时注销并删除云端数据</span></div>" +
        "</div>" +
        "<button class='auth-submit' data-act='consentAgree'>我已阅读并同意</button>" +
        "<div class='consent-links'>" +
          "<a href='privacy.html' target='_blank'>隐私政策全文</a>" +
          "<span>·</span>" +
          "<a href='guide.html' target='_blank'>使用说明</a>" +
        "</div>" +
        "<div class='consent-note'>不同意就无法使用本应用（记账需要账号与云端同步）</div>" +
      "</div>";
    return true;
  }

  function render() {
    var r = parseHash();
    var app = document.getElementById("app");

    // 未同意隐私条款：只显示同意页，别的什么都不渲染
    if (!consentOK()) { renderConsent(); return; }

    /* 没登录就只有登录页：不渲染任何 tab、任何账本内容。
       数据本来就在本机 localStorage 里，不登录也没有"泄露"问题，
       但产品上要像钱往那样——账号是入口。 */
    if (!auth) {
      var showEnter = lastRoute !== "auth";
      lastRoute = "auth";
      app.className = "phone auth-mode";
      app.innerHTML = '<div class="view' + (showEnter ? " enter" : "") + '">' + viewAuth() + "</div>";
      if (showEnter) {
        var av = app.querySelector(".view");
        if (av) setTimeout(function () { av.classList.remove("enter"); }, 300);
      }
      return;
    }
    if (lastRoute === "auth") lastRoute = "";

    var body;
    if (r.view === "entry") body = viewEntry(r.params);
    else if (r.view === "stats") body = viewAssets();
    else if (r.view === "assets") body = viewAssets();
    else if (r.view === "holdings") body = viewHoldings();
    else if (r.view === "stock") body = viewStock(normCode(r.params.code || ""));
    else if (r.view === "wallet") body = viewWalletDetail(r.params);
    else if (r.view === "overview") body = viewOverview();
    else if (r.view === "wallets") body = viewWallets();
    else if (r.view === "tags") body = viewTags();
    else if (r.view === "search") body = viewSearch();
    else if (r.view === "decide") body = viewDecide();
    else if (r.view === "auto") body = viewAuto();
    else if (r.view === "config") body = viewConfig();
    else body = viewBook();

    // 离开自动识别页就停掉轮询，别在别的页面白跑请求
    /* 进「自动识别」页立刻拉一次待确认。

       以前这里只启动 8 秒轮询，首次进入什么都不拉——用户点通知跳转过来，
       看到的是一个空页面，以为没识别到，就退出去了，等 8 秒轮询到的时候人已经走了。
       这就是"点通知进来没东西"的真正原因。 */
    if (r.view === "auto") {
      startPendingPoll();
      setTimeout(function () { loadPendingRaw(); }, 0);
    } else {
      stopPendingPoll();
    }
    if (r.view === "decide") startDecidePoll(); else { stopDecidePoll(); stopCommentPoll(); }
    var _dId = Number(r.params && r.params.id || 0);
    if (r.view === "decide" && _dId) startCommentPoll(_dId); else if (!_dId) stopCommentPoll();

    var isEntry = r.view === "entry";
    // 持仓 / 财务全景是从「资产」进的二级页，底部 tab 仍高亮资产，避免全暗
    // 老链接 #/stats 也高亮「统计」所在的资产页
    var activeKey = (r.view === "stats" || r.view === "wallet") ? "assets"
      : (r.view === "holdings" || r.view === "overview" || r.view === "stock") ? "assets"
      : (r.view === "wallets" || r.view === "tags" || r.view === "config") ? "config"
      : r.view === "search" ? "book"
      : r.view;
    var tabs = isEntry
      ? ""
      : '<nav class="tabbar">' + TABS.map(function (t) {
          return '<a class="tab ' + (t.key === activeKey ? "on" : "") + '" href="' + t.href + '">' +
            '<span class="ic">' + iconSolid(t.ic) + "</span><span>" + t.name + "</span></a>";
        }).join("") + "</nav>";

    // ＋ 只留在账本页：分析页是看数据的地方，多个悬浮按钮会压住右侧金额
    var fab = (r.view === "book")
      ? '<a class="fab" href="#/entry" aria-label="记一笔">＋</a>'
      : "";

    app.className = "phone" + (isEntry ? " entry-page" : "");
    // 只有「换页」才播放入场动画；同页重绘（切分类/切账户）不重放，避免闪屏
    var routeKey = r.view + (r.params.id || "");
    var isRouteChange = routeKey !== lastRoute;
    lastRoute = routeKey;
    var keepY = isRouteChange ? 0 : window.scrollY;
    app.innerHTML = '<div class="view' + (isRouteChange ? " enter" : "") + '">' + body + "</div>" + tabs + fab;
    if (!isRouteChange && keepY) window.scrollTo(0, keepY);
    // 动画只播一次：播完立刻摘掉 class，之后任何重建都不会重播（否则切分类时会整页闪）
    if (isRouteChange) {
      var v = app.querySelector(".view");
      if (v) setTimeout(function () { v.classList.remove("enter"); }, 300);
    }
    // 行情页自动轮询：换到别的页会把定时器停掉，不白跑请求
    startQuotePoll();
    // 进设置页顺手对一次云端，别的设备刚记的账才看得见
    if (r.view === "config") pullMergeIfNeeded();
    // 进持仓页顺手把股票索引拉到本地，等用户点搜索时就是 0 延迟
    if (r.view === "holdings") ensureStockIdx();
    /* 决策广场也要预取：在账本/资产页停留一秒后悄悄拉一次，
       等用户点「决策」时内容已经在内存里，不用等网络。 */
    if (auth && r.view !== "decide" && !decideState().loaded) {
      clearTimeout(window._dcPre);
      window._dcPre = setTimeout(function () {
        if (auth && !decideState().loading && !decideState().loaded) {
          loadDecideFeed(false, true);
        }
      }, 200);
    }
  }

  /* ================= 交互 ================= */

  var _toastEl = null, _toastTimer = null;
  /* 带动作的提示：用于「删除后可撤销」这类操作，停留时间更长，点按钮才执行 */
  function toast(msg, actionText, onAction, ms) {
    if (_toastEl) { _toastEl.remove(); _toastEl = null; }
    if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
    var el = document.createElement("div");
    el.className = "toast show";
    var span = document.createElement("span");
    span.textContent = typeof msg === "string" ? msg : errText(msg, "出错了，稍后再试");
    el.appendChild(span);
    if (actionText) {
      el.classList.add("has-action");
      var btn = document.createElement("button");
      btn.className = "toast-action";
      btn.textContent = actionText;
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        el.remove();
        if (_toastEl === el) _toastEl = null;
        if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
        if (typeof onAction === "function") onAction();
      });
      el.appendChild(btn);
    }
    document.body.appendChild(el);
    _toastEl = el;
    _toastTimer = setTimeout(function () {
      el.className = "toast" + (actionText ? " has-action" : "");
      _toastTimer = setTimeout(function () {
        el.remove();
        if (_toastEl === el) _toastEl = null;
      }, 220);
    }, actionText ? 5000 : (ms || 1200));
  }

  /* 多行内容用底部面板展示：alert 在手机上装不下、不能滚动、不能复制 */
  function reportSheet(title, sub, lines) {
    var old = document.querySelector(".sheet-mask");
    if (old) old.remove();
    var mask = document.createElement("div");
    mask.className = "sheet-mask";
    var sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML =
      '<div class="sheet-grab"></div>' +
      "<h2></h2>" +
      '<div class="sheet-sub"></div>' +
      '<div class="sheet-list"></div>' +
      '<div class="sheet-acts">' +
        '<button class="btn-ghost" data-sheet="copy">复制</button>' +
        '<button class="btn-primary" data-sheet="close">知道了</button>' +
      "</div>";
    sheet.querySelector("h2").textContent = title;
    sheet.querySelector(".sheet-sub").textContent = sub || "";
    var list = sheet.querySelector(".sheet-list");
    (lines || []).forEach(function (x) {
      var row = document.createElement("div");
      row.textContent = x;
      list.appendChild(row);
    });
    function close() { mask.remove(); }
    mask.addEventListener("click", function (ev) { if (ev.target === mask) close(); });
    sheet.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-sheet]");
      if (!b) return;
      if (b.getAttribute("data-sheet") === "close") { close(); return; }
      var text = title + "\n" + (sub || "") + "\n" + (lines || []).join("\n");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast("已复制"); }, function () { toast("复制不了，长按文字选", null, null, 2600); });
      } else {
        toast("复制不了，长按文字选", null, null, 2600);
      }
    });
    mask.appendChild(sheet);
    document.body.appendChild(mask);
  }

  /* 连点月份按钮时把多次位移合并成一次渲染：
     否则第一次点击就把按钮节点换掉，后面的点击会落在已脱离文档的旧节点上而丢失 */
  var _monthQueue = 0, _monthTimer = null;
  function shiftMonth(delta) {
    _monthQueue += delta;
    if (_monthTimer) clearTimeout(_monthTimer);
    _monthTimer = setTimeout(function () {
      var d0 = _monthQueue;
      _monthQueue = 0;
      _monthTimer = null;
      if (!d0) return;
      var p = ui.month.split("-");
      var d = new Date(Number(p[0]), Number(p[1]) - 1 + d0, 1);
      ui.month = d.getFullYear() + "-" + pad(d.getMonth() + 1);
      render();
    }, 0);
  }

  /* 只重绘金额，不重建整页——按键时才不会闪、不会跳、不会丢焦点 */
  function paintAmount() {
    var el = document.querySelector(".amount-display .num");
    if (!el) return;
    if (!ui.draft) {
      el.textContent = "0.00";
      el.className = "num placeholder";
      return;
    }
    el.textContent = money(Math.round(parseFloat(ui.draft || "0") * 100));
    el.className = "num";
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
      if (dot >= 0 && ui.draft.length - dot > 2) return;   // 小数最多两位
      if (ui.draft.length >= 9) return;                     // 整数位上限，防溢出
      if (ui.draft === "0") ui.draft = k;
      else ui.draft += k;
    }
    paintAmount();
  }

  function saveEntry(editingId, stayHere) {
    var val = Math.round(parseFloat(ui.draft || "0") * 100);
    if (!val || val <= 0) { toast("先输入金额"); return; }
    if (ui.flow === "move" && ui.walletId === ui.toWalletId) { toast("转出转入不能一样"); return; }

    var payload = {
      flow: ui.flow,
      cents: val,
      tagId: ui.flow === "move" ? (db.tags[0] ? db.tags[0].id : "t_misc") : ui.tagId,
      walletId: ui.walletId,
      toWalletId: ui.flow === "move" ? ui.toWalletId : undefined,
      day: ui.day,
      memo: ui.memo
    };
    // 只有新建才写 origin；编辑保留原值（否则 csv 导入的「导入」标记会被洗掉）
    if (!editingId) payload.origin = "manual";

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

    /* 「再记」：留在记账页继续下一笔。
       分类 / 账户 / 日期都不动（连着记同类很常见），只清金额和备注。 */
    if (stayHere) {
      ui.draft = "";
      ui.memo = "";
      var memoInput = document.querySelector('[data-act="setMemo"]');
      if (memoInput) memoInput.value = "";
      paintAmount();
      toast("已记下，接着记下一笔", null, null, 1600);
      return;
    }

    // 记到了别的月份时，把账本跳到那个月，否则用户会以为没记上
    var savedMonth = String(payload.day).slice(0, 7);
    var monthChanged = savedMonth !== ui.month;
    if (monthChanged) ui.month = savedMonth;
    resetEntryForm();
    location.hash = "#/book";
    if (monthChanged) {
      toast("已记到 " + savedMonth.slice(0, 4) + " 年 " + Number(savedMonth.slice(5)) + " 月");
    }
  }

  /* 补记昨天/前天的账：一键把日期挪过去，不用打开原生日历 */
  function setDayOffset(offset) {
    var d = new Date();
    d.setDate(d.getDate() - offset);
    ui.day = ymd(d);
    render();
  }

  /* 离开记账页时把表单恢复默认，下次进来是干净的一笔（否则会沿用上次的收入/账户/日期） */
  function resetEntryForm() {
    ui.draft = "";
    ui.memo = "";
    ui.day = ymd(new Date());
    ui.flow = "out";
    var f = db.tags.filter(function (t) { return t.flow === "out"; })[0] || db.tags[0];
    ui.tagId = f ? f.id : "t_food";
    // 账户可能被用户删过，不能写死 id
    var ws = db.wallets || [];
    ui.walletId = ws[0] ? ws[0].id : "w_pay";
    ui.toWalletId = ws[1] ? ws[1].id : (ws[0] ? ws[0].id : "w_bank");
    ui._loaded = false;
  }

  function deleteEntry(id) {
    var gone = db.entries.filter(function (e) { return e.id === id; })[0];
    if (!gone) return;
    if (!confirm("删除这笔记录？")) return;
    db.entries = db.entries.filter(function (e) { return e.id !== id; });
    save();
    location.hash = "#/book";
    // 删错了能救回来：5 秒内点「撤销」原样放回
    toast("已删除", "撤销", function () {
      db.entries.push(gone);
      save();
      render();
      toast("已恢复");
    });
  }

  function exportData() {
    var blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "长流备份-" + ymd(new Date()) + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ================= 备份恢复 =================
     能导出不能导入 = 备份没有意义。这里做完整还原：
     先校验结构，再让用户确认覆盖，最后整份替换。 */

  function importJson() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (input.parentNode) input.parentNode.removeChild(input);
      if (!file) return;
      var reader = new FileReader();
      reader.onerror = function () { toast("文件读取失败"); };
      reader.onload = function () {
        var raw = null;
        try { raw = JSON.parse(String(reader.result || "null")); } catch (e) { raw = null; }
        if (!raw || !Array.isArray(raw.entries)) {
          reportSheet(
            "这个文件不是长流的备份",
            "备份文件里必须有 entries 数组。请选「导出备份」下载的那个 .json 文件。",
            ["选中的文件：解析" + (raw ? "成功，但没有 entries 数组" : "失败，不是合法 JSON"),
             "从别的记账软件导出的数据，可以走「导入 CSV」"]
          );
          return;
        }
        var n = raw.entries.length;
        var nw = Array.isArray(raw.wallets) ? raw.wallets.length : 0;
        var nt = Array.isArray(raw.tags) ? raw.tags.length : 0;
        var nh = Array.isArray(raw.holdings) ? raw.holdings.length : 0;
        var msg = "将用备份覆盖当前数据：\n\n" +
          "备份里有 " + n + " 条记录、" + nw + " 个账户、" + nt + " 个分类" +
          (nh ? "、" + nh + " 只持仓" : "") + "\n" +
          "当前有 " + db.entries.length + " 条记录\n\n" +
          "覆盖后当前数据无法找回，继续？";
        if (!confirm(msg)) return;
        db = {
          wallets: raw.wallets && raw.wallets.length ? raw.wallets : DEFAULTS.wallets.slice(),
          tags: mergeTags(raw.tags),
          entries: raw.entries,
          holdings: Array.isArray(raw.holdings) ? raw.holdings : []
        };
        save();
        render();
        toast("已恢复 " + n + " 条记录");
      };
      reader.readAsText(file, "UTF-8");
    });
    input.click();
  }

  /* ================= CSV 导入 / 导出 =================
     导出的列固定为 日期,方向,金额,分类,账户,备注（金额单位元，两位小数）。
     导入按表头别名识别列，逐行校验，失败的行集中报出来，不静默丢。 */

  /* 列名映射。后几组是微信/支付宝导出账单的原始列名——
     直接导官方账单就能认，不用先改模板。 */
  var CSV_HEAD = {
    day: ["日期", "date", "day", "时间", "交易时间", "交易创建时间", "付款时间", "创建时间"],
    flow: ["方向", "flow", "type", "收支", "类型", "收/支", "收／支", "收支类型"],
    cents: ["金额", "amount", "money", "金额(元)", "金额（元）", "交易金额", "发生金额", "金额(元)"],
    tag: ["分类", "category", "tag", "类别", "标签", "交易分类", "交易类型"],
    wallet: ["账户", "account", "wallet", "支付方式", "账户(卡)", "收/付款方式", "付款方式", "资金渠道"],
    merchant: ["交易对方", "对方", "商户", "收款方", "商家", "对方账号"],
    memo: ["备注", "memo", "note", "remark", "说明", "商品", "商品说明"]
  };

  /* 微信/支付宝的导出文件前面有十几行说明，表头不在第一行。
     扫前 40 行，找同时出现「日期/时间」和「金额」的那一行当表头。 */
  function findHeaderRow(rows) {
    var limit = Math.min(rows.length, 40);
    for (var i = 0; i < limit; i++) {
      var joined = (rows[i] || []).join(",");
      if (/(日期|时间)/.test(joined) && /金额/.test(joined)) return i;
    }
    return 0;
  }

  var TAG_ALIAS = {
    "餐饮": "t_food", "伙食": "t_food", "外卖": "t_food", "吃": "t_food",
    "交通": "t_car", "车费": "t_car", "打车": "t_car",
    "日用": "t_buy", "网购": "t_buy",
    "房租": "t_home", "住房": "t_home", "居住": "t_home", "水电": "t_home",
    "娱乐": "t_fun", "电影": "t_fun", "游戏": "t_fun",
    "医疗": "t_med", "药": "t_med", "健康": "t_med",
    "教育": "t_study", "课程": "t_study",
    "其他": "t_misc", "其它": "t_misc", "杂费": "t_misc",
    "薪水": "t_pay", "薪资": "t_pay",
    "分红": "t_div", "利息": "t_int",
    "兼职": "t_side", "红包": "t_gift", "礼金": "t_gift"
  };

  var WALLET_ALIAS = {
    "微信": "w_pay", "微信支付": "w_pay", "支付宝": "w_pay", "花呗": "w_pay", "零钱通": "w_pay",
    "钱包": "w_cash", "零钱": "w_cash",
    "银行": "w_bank", "银行卡": "w_bank", "信用卡": "w_bank", "借记卡": "w_bank",
    "股票": "w_fund", "基金": "w_fund", "证券": "w_fund", "投资": "w_fund"
  };

  function csvCell(v) {
    var s = String(v == null ? "" : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function flowName(f) {
    return f === "in" ? "收入" : f === "move" ? "转账" : "支出";
  }

  function exportCsv() {
    if (!db.entries.length) { toast("还没有记录"); return; }
    var rows = db.entries.slice().sort(function (a, b) {
      if (a.day !== b.day) return a.day < b.day ? -1 : 1;
      return (a.at || 0) - (b.at || 0);
    });
    var lines = [["日期", "方向", "金额", "分类", "账户", "备注"]];
    rows.forEach(function (e) {
      var t = tagById(e.tagId);
      var w = walletById(e.walletId);
      var acc = w.name;
      if (e.flow === "move") acc = w.name + "→" + walletById(e.toWalletId).name;
      lines.push([e.day, flowName(e.flow), (e.cents / 100).toFixed(2), t.name, acc, e.memo || ""]);
    });
    var text = "\uFEFF" + lines.map(function (r) {
      return r.map(csvCell).join(",");
    }).join("\r\n");
    var blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "长流_" + ymd(new Date()).replace(/-/g, "") + ".csv";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast("已导出 " + db.entries.length + " 条");
  }

  /* 逐字符解析，支持引号包裹的逗号、换行和转义引号 */
  function parseCsvText(text) {
    var rows = [], row = [], cell = "", inQuote = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inQuote) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { cell += '"'; i++; }
          else inQuote = false;
        } else cell += ch;
      } else if (ch === '"') inQuote = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\r") { /* 等 \n */ }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ""; });
    });
  }

  function mapHeader(row) {
    var idx = {};
    row.forEach(function (h, i) {
      var name = String(h || "").replace(/^\uFEFF/, "").trim().toLowerCase();
      Object.keys(CSV_HEAD).forEach(function (k) {
        if (idx[k] != null) return;
        for (var j = 0; j < CSV_HEAD[k].length; j++) {
          if (CSV_HEAD[k][j].toLowerCase() === name) { idx[k] = i; return; }
        }
      });
    });
    return idx;
  }

  function normDay(raw) {
    // 允许带时间：「2026-10-01 12:31:05」「2026/10/1」「2026年10月1日」都认
    var m = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/.exec(String(raw || "").trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return y + "-" + pad(mo) + "-" + pad(d);
  }

  function normCents(raw) {
    var t = String(raw || "").replace(/[¥￥,\s]/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    var v = parseFloat(t);
    if (!isFinite(v) || v <= 0) return null;
    return Math.round(v * 100);
  }

  function normFlow(raw) {
    var t = String(raw || "").trim().toLowerCase();
    if (/支出|expense|out|pay|花/.test(t)) return "out";
    if (/收入|income|^in$|收/.test(t)) return "in";
    if (/转账|transfer|move|转/.test(t)) return "move";
    return null;
  }

  function matchTag(name) {
    var n = String(name || "").trim();
    if (!n) return null;
    var exact = db.tags.filter(function (t) { return t.name === n; })[0];
    if (exact) return exact;
    if (TAG_ALIAS[n]) {
      var hit = db.tags.filter(function (t) { return t.id === TAG_ALIAS[n]; })[0];
      if (hit) return hit;
    }
    // 再退一步：按关键词模糊认（"餐饮美食"→吃饭，"超市"→购物）
    var KEYS = [
      ["t_food", /餐|饭|吃|外卖|food/i],
      ["t_car", /交通|地铁|公交|打车|车费|油|car|taxi/i],
      ["t_buy", /购物|网购|日用|超市|买|buy|shop/i],
      ["t_home", /房租|住房|物业|水电|租金|home|rent/i],
      ["t_fun", /娱乐|电影|游戏|玩|fun|movie/i],
      ["t_med", /医|药|看病|体检|med/i],
      ["t_study", /学习|教育|课程|书|study|book/i],
      ["t_misc", /其他|其它|杂|misc/i],
      ["t_pay", /工资|薪|salary|payroll/i],
      ["t_div", /股息|分红|dividend/i],
      ["t_int", /利息|interest/i],
      ["t_side", /外快|兼职|side/i],
      ["t_gift", /红包|礼|gift/i]
    ];
    for (var i = 0; i < KEYS.length; i++) {
      if (KEYS[i][1].test(n)) {
        var t2 = db.tags.filter(function (t) { return t.id === KEYS[i][0]; })[0];
        if (t2) return t2;
      }
    }
    return null;
  }

  function matchWallet(name) {
    var n = String(name || "").trim();
    if (!n) return null;
    var exact = db.wallets.filter(function (w) { return w.name === n; })[0];
    if (exact) return exact;
    if (WALLET_ALIAS[n]) {
      var hit = db.wallets.filter(function (w) { return w.id === WALLET_ALIAS[n]; })[0];
      if (hit) return hit;
    }
    // "招商银行""工行卡"这类具体银行名，按关键词归到储蓄卡
    var KEYS = [
      ["w_cash", /现金|现钞|钱包/],
      ["w_pay", /微信|支付宝|花呗|零钱通|pay|alipay/i],
      ["w_bank", /银行|卡|储蓄|信用|bank/i],
      ["w_fund", /股票|基金|证券|投资|fund|stock/i]
    ];
    for (var i = 0; i < KEYS.length; i++) {
      if (KEYS[i][1].test(n)) {
        var w2 = db.wallets.filter(function (w) { return w.id === KEYS[i][0]; })[0];
        if (w2) return w2;
      }
    }
    return null;
  }

  function importCsv() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (input.parentNode) input.parentNode.removeChild(input);
      if (!file) return;
      var reader = new FileReader();
      reader.onerror = function () { toast("文件读取失败"); };
      reader.onload = function () {
        var text = String(reader.result || "");
        if (text.indexOf("\uFFFD") >= 0) {
          // Excel 存的 ANSI CSV 按 UTF-8 读会出乱码，改用 GBK 再读一次
          var r2 = new FileReader();
          r2.onerror = function () { toast("文件读取失败"); };
          r2.onload = function () { doImportCsv(String(r2.result || "")); };
          r2.readAsText(file, "GBK");
          return;
        }
        doImportCsv(text);
      };
      reader.readAsText(file, "UTF-8");
    });
    input.click();
  }

  function doImportCsv(text) {
    var rows = parseCsvText(String(text || "").replace(/^\uFEFF/, ""));
    if (rows.length < 2) { toast("这个文件里只有表头，没有数据行", null, null, 2600); return; }

    var hdr = findHeaderRow(rows);
    var cols = mapHeader(rows[hdr] || []);
    var missing = [];
    if (cols.day == null) missing.push("日期");
    if (cols.cents == null) missing.push("金额");
    if (missing.length) {
      reportSheet(
        "表头少了必需的列",
        "至少要有「日期」和「金额」两列；方向、分类、账户、备注是可选的。",
        ["这次没找到：" + missing.join("、"),
         "识别到的表头：" + (rows[hdr] || []).join(" | "),
         "可以直接用「导出 CSV」下载的模板改，表头就是标准写法。"]
      );
      return;
    }

    var tagOut = db.tags.filter(function (t) { return t.flow === "out"; })[0] || db.tags[0];
    var tagIn = db.tags.filter(function (t) { return t.flow === "in"; })[0] || db.tags[0];
    var valid = [];
    var errors = [];

    for (var i = hdr + 1; i < rows.length; i++) {
      var r = rows[i];
      var lineNo = i + 1;
      var cellAt = function (k) { return cols[k] == null ? "" : String(r[cols[k]] || "").trim(); };

      // 账单里的说明行（标题、汇总、分隔线、空行）不是脏数据，静默跳过
      var nonEmpty = r.filter(function (c) { return String(c || "").trim(); }).length;
      if (nonEmpty < 2) continue;
      if (!cellAt("day")) continue;

      var day = normDay(cellAt("day"));
      if (!day) { errors.push("第 " + lineNo + " 行 · 日期：" + (cellAt("day") || "空") + " 认不出"); continue; }

      var cents = normCents(cellAt("cents"));
      if (cents == null) { errors.push("第 " + lineNo + " 行 · 金额：" + (cellAt("cents") || "空") + " 不是正数"); continue; }

      var flow = "out";
      var rawFlow = cellAt("flow");
      if (rawFlow) {
        flow = normFlow(rawFlow);
        if (!flow) { errors.push("第 " + lineNo + " 行 · 方向：" + rawFlow + " 不认识"); continue; }
      }

      var tag = null, wallet = null, toWallet = null;

      if (flow === "move") {
        var parts = cellAt("wallet").split(/→|->|＞|>/).map(function (x) { return x.trim(); });
        wallet = matchWallet(parts[0]);
        toWallet = matchWallet(parts[1]);
        if (!wallet) { errors.push("第 " + lineNo + " 行 · 账户：" + (parts[0] || "空") + " 对不上"); continue; }
        if (!toWallet) { errors.push("第 " + lineNo + " 行 · 账户：转账要写成「转出→转入」"); continue; }
        tag = tagOut;
      } else {
        var rawTag = cellAt("tag");
        tag = rawTag ? matchTag(rawTag) : null;
        /* 账单自带的分类常常认不出来——微信那列是「交易类型」（商户消费/转账/红包），
           不是消费分类。认不出就用商户名走智能分类，最后才落默认分类。 */
        if (!tag) {
          var mName = cellAt("merchant") || cellAt("memo");
          if (mName && window.SZAuto) {
            var g = window.SZAuto.guessTag(mName, flow, cents, 12, db.autoRules || {});
            tag = db.tags.filter(function (t) { return t.id === g.tagId; })[0] || null;
          }
        }
        if (!tag) tag = flow === "in" ? tagIn : tagOut;
        if (tag.flow !== flow) tag = flow === "in" ? tagIn : tagOut;

        var rawW = cellAt("wallet");
        wallet = rawW ? matchWallet(rawW) : db.wallets[0];
        if (!wallet) { errors.push("第 " + lineNo + " 行 · 账户：" + rawW + " 对不上"); continue; }
      }

      valid.push({
        flow: flow, cents: cents, tagId: tag.id,
        walletId: wallet.id, toWalletId: toWallet ? toWallet.id : undefined,
        day: day, memo: cellAt("merchant") || cellAt("memo")
      });
    }

    if (!valid.length) {
      reportSheet("没有可导入的行", "文件读到了，但一行都没能识别。",
        errors.length ? errors.slice(0, 200) : ["文件里只有表头。"]);
      return;
    }

    // 重复判定：日期 + 金额(分) + 备注 完全相同
    var seen = {};
    db.entries.forEach(function (e) { seen[e.day + "|" + e.cents + "|" + (e.memo || "")] = 1; });
    var dup = 0;
    var fresh = [];
    valid.forEach(function (v) {
      var k = v.day + "|" + v.cents + "|" + v.memo;
      if (seen[k]) { dup++; return; }
      seen[k] = 1;
      fresh.push(v);
    });

    var msg = "将导入 " + valid.length + " 条记录，其中 " + dup + " 条与现有记录重复" +
      (dup ? "（重复的会跳过，实际写入 " + fresh.length + " 条）" : "") + "。";
    if (errors.length) msg += "\n另有 " + errors.length + " 行解析失败，导入后会列出。";

    if (!fresh.length) {
      reportSheet("这些记录之前都导过了",
        "全部 " + dup + " 条与现有记录重复，不会重复写入。",
        errors.length ? ["解析失败 " + errors.length + " 行："].concat(errors.slice(0, 200)) : ["没有需要新增的记录。"]);
      return;
    }
    if (!confirm(msg)) return;

    var now = Date.now();
    fresh.forEach(function (v, i) {
      db.entries.push({
        id: uid("e"), flow: v.flow, cents: v.cents, tagId: v.tagId,
        walletId: v.walletId, toWalletId: v.toWalletId,
        day: v.day, memo: v.memo, origin: "csv", at: now + i
      });
    });
    save();
    toast("已导入 " + fresh.length + " 条");
    render();

    if (errors.length) {
      setTimeout(function () {
        reportSheet(
          "有 " + errors.length + " 行没有导入",
          "已成功写入 " + fresh.length + " 条。下面这些行没能识别，改好 CSV 可以再导一次（已经导入过的会自动跳过）。",
          errors.slice(0, 200)
        );
      }, 120);
    }
  }

  /* ================= 持仓增删 ================= */

  /* 输入代码自动带出股票名称：省得手打，也避免名称填错。
     查过就记住，同一个代码不重复请求。 */
  var _lookupTimer = null, _nameLooked = "", _autoName = "";

  function scheduleNameLookup() {
    if (_lookupTimer) clearTimeout(_lookupTimer);
    _lookupTimer = setTimeout(function () {
      _lookupTimer = null;
      lookupHoldingName();
    }, 600);
  }

  function lookupHoldingName() {
    var norm = normCode(ui.hCode);
    var hint = document.querySelector(".name-hint");
    if (!/^[0-9]{6}\.(SH|SZ|BJ)$/.test(norm)) {
      if (hint) { hint.textContent = ""; hint.classList.remove("live"); }
      // 代码被清空/改坏：把之前自动填的名称也撤掉
      if (_autoName && ui.hName === _autoName) {
        ui.hName = "";
        _autoName = "";
        var el0 = document.querySelector('[data-act="hName"]');
        if (el0) el0.value = "";
      }
      return;
    }
    if (_nameLooked === norm) return;
    _nameLooked = norm;

    if (hint) { hint.textContent = "查询中…"; hint.classList.remove("live"); }

    fetch(QUOTE_API + "?codes=" + encodeURIComponent(norm), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var q = j && j.quotes && j.quotes[norm];
        var name = q && q.name;
        var h = document.querySelector(".name-hint");
        if (!name) {
          if (h) { h.textContent = ""; h.classList.remove("live"); }
          return;
        }
        // 用户已经自己填了名字就不覆盖
        if (ui.hName && ui.hName.trim() && ui.hName !== _autoName) {
          if (h) { h.textContent = ""; h.classList.remove("live"); }
          return;
        }
        ui.hName = name;
        _autoName = name;
        var input = document.querySelector('[data-act="hName"]');
        if (input) input.value = name;
        if (h) { h.textContent = "已自动填好"; h.classList.add("live"); }
      })
      .catch(function () {
        var h = document.querySelector(".name-hint");
        if (h) { h.textContent = ""; h.classList.remove("live"); }
      });
  }

  /* 模糊搜索：记不住代码就输名字。走后端 /stocks?keyword=，
     代码和名称都能匹配，点一条直接填好代码+名称。 */
  var _ssTimer = null, _ssSeq = 0;

  /* ---------- 股票搜索：本地索引优先 ----------
     慢的从来不是 SQL，是整条链路往返（实测 healthz 都要 600ms）。
     所以把全量「代码 + 名称」一次拉到本地，之后每敲一个字都是 0 延迟。
     索引约 120KB，缓存 24 小时；没用上就不再请求第二次。 */

  var STOCK_IDX_KEY = "sz.stockIdx.v1";
  var STOCK_IDX_TTL = 24 * 3600 * 1000;
  var _stockIdx = null;
  var _stockIdxLoading = null;

  function readStockIdx() {
    if (_stockIdx) return _stockIdx;
    try {
      var o = JSON.parse(localStorage.getItem(STOCK_IDX_KEY) || "null");
      if (o && Array.isArray(o.items) && o.at && (Date.now() - o.at) < STOCK_IDX_TTL) {
        _stockIdx = o.items;
        return _stockIdx;
      }
    } catch (e) {}
    return null;
  }

  function ensureStockIdx() {
    var cached = readStockIdx();
    if (cached) return Promise.resolve(cached);
    if (_stockIdxLoading) return _stockIdxLoading;
    _stockIdxLoading = fetch(AUTH_API + "/stocks/index", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        _stockIdxLoading = null;
        if (!j || !Array.isArray(j.items) || !j.items.length) return null;
        _stockIdx = j.items;
        try {
          localStorage.setItem(STOCK_IDX_KEY, JSON.stringify({ at: Date.now(), items: j.items }));
        } catch (e) { /* 存不下就只留内存，不影响这次搜索 */ }
        return _stockIdx;
      })
      .catch(function () { _stockIdxLoading = null; return null; });
    return _stockIdxLoading;
  }

  /* 排序规则：代码前缀 > 名称前缀 > 名称包含。
     用户打「600」想要 600xxx，打「茅台」想要贵州茅台，都对得上。 */
  function matchStockIdx(items, kw, limit) {
    var q = String(kw || "").trim().toLowerCase();
    if (!q) return [];
    var byCode = [], byHead = [], byAny = [];
    for (var i = 0; i < items.length; i++) {
      var code = String(items[i][0] || "");
      var name = String(items[i][1] || "");
      if (code.toLowerCase().indexOf(q) === 0) { byCode.push(items[i]); continue; }
      var pos = name.toLowerCase().indexOf(q);
      if (pos === 0) byHead.push(items[i]);
      else if (pos > 0) byAny.push(items[i]);
    }
    return byCode.concat(byHead).concat(byAny).slice(0, limit);
  }

  function renderStockList(items, raw, note) {
    var bb = document.querySelector(".ss-list");
    if (!bb) return;
    if (!items.length) {
      bb.innerHTML = '<div class="ss-empty">没找到「' + esc(raw) + '」</div>';
    } else {
      bb.innerHTML = items.map(function (x) {
        return '<div class="ss-item" data-act="pickStock" data-code="' + esc(x.ts_code) +
          '" data-name="' + esc(x.name) + '">' +
          '<span class="code">' + esc(x.ts_code) + "</span>" +
          '<span class="name">' + esc(x.name) + "</span></div>";
      }).join("") + (note ? '<div class="ss-note">' + esc(note) + "</div>" : "");
    }
    bb.classList.add("show");
  }

  function searchStocks(kw) {
    if (_ssTimer) clearTimeout(_ssTimer);
    var raw = String(kw || "").trim();
    var box = document.querySelector(".ss-list");
    if (!raw) {
      if (box) { box.innerHTML = ""; box.classList.remove("show"); }
      return;
    }

    /* 第一步：本地有索引就直接出结果。
       够 8 条就不再打网络——大多数输入都会走到这里，瞬间响应。 */
    var idx = readStockIdx();
    if (idx) {
      var local = matchStockIdx(idx, raw, 12);
      renderStockList(local.map(function (x) {
        return { ts_code: x[0], name: x[1] };
      }), raw, "");
      if (local.length >= 8) return;
    } else {
      // 没索引：后台拉一份，这次仍走网络
      ensureStockIdx();
    }

    // 第二步：本地命中太少（或没索引）才问服务端，补别名/拼音类的匹配
    _ssTimer = setTimeout(function () {
      var seq = ++_ssSeq;
      var b = document.querySelector(".ss-list");
      if (b && !idx) { b.innerHTML = '<div class="ss-loading">搜索中…</div>'; b.classList.add("show"); }
      fetch(AUTH_API + "/stocks?keyword=" + encodeURIComponent(raw) + "&limit=12", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (seq !== _ssSeq) return;                 // 输入又变了，丢弃过期结果
          var items = (j && j.items) || [];
          if (!items.length && idx) return;           // 本地已经显示过「没找到」，别闪一下
          renderStockList(items, raw, "");
        })
        .catch(function () {
          if (idx) return;                            // 本地有结果就别用错误覆盖
          var bb = document.querySelector(".ss-list");
          if (bb) bb.innerHTML = '<div class="ss-empty">搜索失败，检查网络</div>';
        });
    }, idx ? 120 : 280);
  }

  function pickStock(code, name) {
    ui.hCode = code;
    ui.hName = name;
    _autoName = name;
    _nameLooked = code;
    render();
  }

  function addHolding() {
    var code = normCode(ui.hCode);
    var name = String(ui.hName || "").trim();
    var shares = parseFloat(ui.hShares);
    var cost = parseFloat(ui.hCost);
    if (!code) { toast("先填代码"); return; }
    if (!isFinite(shares) || shares <= 0) { toast("股数不对"); return; }
    if (!isFinite(cost) || cost <= 0) { toast("成本价不对"); return; }

    var exist = db.holdings.filter(function (h) { return h.code === code; })[0];
    if (exist) {
      // 同一只再次买入：按加权平均合并成本
      var oldTotal = exist.shares * exist.costCents;
      var addTotal = shares * Math.round(cost * 100);
      exist.shares = exist.shares + shares;
      exist.costCents = Math.round((oldTotal + addTotal) / exist.shares);
      if (name) exist.name = name;
      toast("已合并，均价 " + money(exist.costCents));
    } else {
      db.holdings.push({
        id: uid("h"), code: code, name: name || code,
        shares: shares, costCents: Math.round(cost * 100),
        priceCents: null, priceAt: 0
      });
      toast("已加 " + (name || code));
    }
    ui.hCode = ""; ui.hName = ""; ui.hShares = ""; ui.hCost = "";
    _nameLooked = ""; _autoName = "";   // 重置查询缓存，下一只重新查
    save();
    render();
  }

  function delHolding(id) {
    var h = db.holdings.filter(function (x) { return x.id === id; })[0];
    if (!h) return;
    if (!confirm("删除持仓「" + (h.name || h.code) + "」？")) return;
    db.holdings = db.holdings.filter(function (x) { return x.id !== id; });
    save();
    render();
    toast("已删除");
  }

  function resetData() {
    if (!confirm("清空所有记录、账户、持仓？\n\n清空前会自动留一份快照，点完 5 秒内能撤销。")) return;
    var snapshot = JSON.stringify(db);
    db = { wallets: DEFAULTS.wallets.slice(), tags: DEFAULTS.tags.slice(), entries: [], holdings: [] };
    save();
    toast("已清空", "撤销", function () {
      try { db = JSON.parse(snapshot); } catch (e) { return; }
      save();
      render();
      toast("已恢复");
    });
    render();
  }

  document.addEventListener("click", function (ev) {
    /* ---- 胶囊（替掉了原生 select，点 span 只触发 click，不触发 change） ---- */
    /* ---- 流水类型：支出 / 收入 / 转账 ---- */
    if (act === "autoFlow" || act === "autoFlowLocal") {
      var aF = autoState();
      var iF = Number(el.getAttribute("data-id"));
      var vF = el.getAttribute("data-v") || "out";
      var bucketF = act === "autoFlow" ? aF.remote : aF.items;
      var targetF = bucketF && bucketF[iF];
      if (targetF) {
        targetF.flow = vF;
        if (vF === "move") {
          /* 转账：没有分类，改成"从哪个账户到哪个账户" */
          targetF.tagId = "";
          targetF.walletId = targetF.walletId || pickWallet(0);
          targetF.toWalletId = targetF.toWalletId || pickWallet(1);
        } else {
          delete targetF.toWalletId;
          // 换了方向，原来的分类可能不属于这个方向，重挑一个
          var t0 = tagsOf(vF)[0];
          targetF.tagId = t0 ? t0.id : "";
        }
      }
      render();
      return;
    }

    /* ---- 转账的转出 / 转入账户 ---- */
    if (act === "autoFrom" || act === "autoTo" || act === "autoFromLocal" || act === "autoToLocal") {
      var aW = autoState();
      var iW = Number(el.getAttribute("data-id"));
      var vW = el.getAttribute("data-v") || "";
      var isLocal = act.indexOf("Local") > 0;
      var bucketW = isLocal ? aW.items : aW.remote;
      var targetW = bucketW && bucketW[iW];
      if (targetW && vW) {
        if (act.indexOf("From") === 0 || act === "autoFromLocal") targetW.walletId = vW;
        else targetW.toWalletId = vW;
      }
      render();
      return;
    }

    /* 胶囊点击（原生 select 的 change 事件已不再触发） */
    if (act === "sdWalletPick") { stockState().walletId = el.getAttribute("data-v") || ""; render(); return; }
    if (act === "autoTag" || act === "autoRemoteTag") {
      var aChips = autoState();
      var iChips = Number(el.getAttribute("data-id"));
      var vChips = el.getAttribute("data-v") || "";
      var bucket = act === "autoTag" ? aChips.items : aChips.remote;
      if (bucket && bucket[iChips]) bucket[iChips].tagId = vChips;
      render();
      return;
    }
    if (act === "autoTag") {
      var a = autoState();
      var i = Number(el.getAttribute("data-id"));
      if (a.items[i]) a.items[i].tagId = el.value;
    } else if (act === "autoRemoteTag") {
      var a2 = autoState();
      var j = Number(el.getAttribute("data-id"));
      if (a2.remote && a2.remote[j]) a2.remote[j].tagId = el.value;
    }
    var el = ev.target.closest("[data-act]");
    if (!el) return;
    var act = el.getAttribute("data-act");
    var v = el.getAttribute("data-v");
    var id = el.getAttribute("data-id");

    if (act === "consentAgree") {
      try { localStorage.setItem(CONSENT_KEY, "1"); } catch (e) {}
      render();
      return;
    }
    if (act === "prevMonth") shiftMonth(-1);
    else if (act === "nextMonth") shiftMonth(1);
    else if (act === "setFlow") {
      ui.flow = v;
      if (v !== "move") {
        // 记住每种方向上次选的分类，切回来不丢
        var want = (ui._lastTag || {})[v];
        var f = db.tags.filter(function (t) { return t.id === want; })[0];
        if (!f) f = db.tags.filter(function (t) { return t.flow === (v === "in" ? "in" : "out"); })[0];
        if (f) ui.tagId = f.id;
      }
      render();
    }
    else if (act === "setTag") { ui.tagId = v; ui._lastTag = ui._lastTag || {}; ui._lastTag[ui.flow] = v; render(); }
    else if (act === "setWallet") { ui.walletId = v; render(); }
    else if (act === "setToWallet") { if (v === ui.walletId) { toast("与转出账户相同"); return; } ui.toWalletId = v; render(); }
    else if (act === "key") keyInput(v);
    else if (act === "saveEntry") saveEntry(id || null);
    else if (act === "saveAndNew") saveEntry(null, true);
    else if (act === "dayOffset") setDayOffset(Number(v) || 1);
    else if (act === "delEntry") deleteEntry(id);
    else if (act === "editEntry") { ui._loaded = false; location.hash = "#/entry?id=" + encodeURIComponent(id); }
    else if (act === "back") { goBack(); }
    else if (act === "statsFlow") { ui.statsFlow = v; render(); }
    else if (act === "dcOpenForm") { var ds = decideState(); ds.panel = "post"; render(); }
    else if (act === "dcCloseForm") { decideState().panel = null; render(); }
    else if (act === "dcSubmit") submitDecision();
    else if (act === "dcVote") decideVote(Number(id), v);
    else if (act === "dcDecide") decideMine(Number(id), v);
    else if (act === "dcScope") { var d1 = decideState(); if (d1.scope !== v) { d1.scope = v; dcResetFeed(); } }
    else if (act === "dcSort") { var d2 = decideState(); if (d2.sort !== v) { d2.sort = v; dcResetFeed(); } }
    else if (act === "dcMore") loadDecideFeed(true);
    else if (act === "dcReload") { var d3 = decideState(); d3.error = ""; dcResetFeed(); }
    else if (act === "dcFormCat") { var d4 = decideState().form; d4.category = d4.category === v ? "" : v; render(); }
    else if (act === "dcFormAnon") { var d5 = decideState().form; d5.anonymous = !d5.anonymous; render(); }
    else if (act === "dcGoLogin") { ui.authPanel = "login"; location.hash = "#/config"; }
    else if (act === "dcOpenDetail") { location.hash = "#/decide?id=" + encodeURIComponent(id); }
    else if (act === "dcDelete") { decideDelete(Number(id)); }
    else if (act === "dcBackList") { decideState().detailId = 0; location.hash = "#/decide"; }
    else if (act === "dcDetailReload") { var d6 = decideState(); d6.detail = null; d6.detailError = ""; render(); }
    else if (act === "dcSendComment") submitDecisionComment();
    else if (act === "dcLike") decideLike(Number(id));
    else if (act === "dcReply") { startReply(id, el.getAttribute("data-who")); }
    else if (act === "dcReplyCancel") cancelReply();
    else if (act === "goAssets") { location.hash = "#/assets"; }
    else if (act === "goStats") { location.hash = "#/stats"; }
    else if (act === "goHoldings") { location.hash = "#/holdings"; }
    else if (act === "goWallet") { location.hash = "#/wallet?id=" + encodeURIComponent(id); }
    else if (act === "gotoMonth") { if (v) { ui.month = v; render(); } }
    else if (act === "goOverview") { location.hash = "#/overview"; }
    else if (act === "openStock") { location.hash = "#/stock?code=" + encodeURIComponent(el.getAttribute("data-code") || ""); }
    else if (act === "sdReload") { loadStockDetail(el.getAttribute("data-code") || "", true); }
    else if (act === "sdDivSync") { startDivSync(el.getAttribute("data-code") || ""); }
    else if (act === "sdDivConfirm") { commitDivSync(el.getAttribute("data-code") || ""); }
    else if (act === "sdDivCancel") { stockState().sync = null; render(); }
    else if (act === "addHolding") addHolding();
    else if (act === "pickStock") pickStock(el.getAttribute("data-code") || "", el.getAttribute("data-name") || "");
    else if (act === "delHolding") delHolding(id);
    else if (act === "refreshQuotes") refreshQuotes(true);
    else if (act === "toggleMenu") { location.hash = "#/config"; }
    else if (act === "setGo") { location.hash = "#/config?p=" + encodeURIComponent(el.getAttribute("data-p") || ""); }
    else if (act === "setBack") { location.hash = "#/config"; }
    else if (act === "pfTone") { ui.pfTone = Number(el.getAttribute("data-i")) || 0; render(); }
    else if (act === "pfSave") {
      var nickNow = String(ui.pfNick === undefined ? loadProfile().nick : ui.pfNick || "").trim().slice(0, 12);
      var toneNow = ui.pfTone === undefined ? loadProfile().tone : ui.pfTone;
      saveProfile({ nick: nickNow, tone: toneNow });
      ui.pfNick = undefined;
      ui.pfTone = undefined;
      /* hash 没变的话 hashchange 不会触发，得自己重绘一次 */
      if (location.hash === "#/config") render(); else location.hash = "#/config";
      toast("存好了");
    }
    else if (act === "pfReset") {
      saveProfile({ nick: "", tone: 0 });
      ui.pfNick = undefined;
      ui.pfTone = undefined;
      render();
      toast("已恢复默认");
    }
    else if (act === "exportData") exportData();
    else if (act === "exportCsv") exportCsv();
    else if (act === "importCsv") importCsv();
    else if (act === "resetData") resetData();
    else if (act === "goAuto") { autoState().parsed = false; location.hash = "#/auto"; }
    else if (act === "autoBack") { autoState().parsed = false; location.hash = "#/book"; }
    else if (act === "autoRemoteCommit") autoRemoteCommit();
    else if (act === "autoRemoteDrop") {
      var ar = autoState();
      var idx = Number(id);
      var target = (ar.remote || [])[idx];
      if (target && target.rawId) {
        rememberDropped(target.rawId);
        markRawDone(target.rawId, "ignored");
      }
      (ar.remote || []).splice(idx, 1);
      ar._rawSig = (ar.remote || []).map(function (x) { return x.rawId; }).join(",");
      render();
    }
    else if (act === "autoShot") autoPickImage();
    else if (act === "goEntryManual") { ui._loaded = false; location.hash = "#/entry"; }
    else if (act === "autoRead") autoReadClipboard();
    else if (act === "autoRun") { runAutoParse(); render(); }
    else if (act === "autoCommit") autoCommit();
    else if (act === "autoDrop") {
      var au = autoState();
      au.items.splice(Number(id), 1);
      render();
    }
    else if (act === "goSearch") { ui.searchQ = ""; location.hash = "#/search"; }
    else if (act === "openEntry") { ui._loaded = false; location.hash = "#/entry?id=" + id; }
    else if (act === "importJson") importJson();
    else if (act === "goWallets") { ui.editWalletId = ""; ui.wName = ""; ui.wOpening = ""; location.hash = "#/wallets"; }
    else if (act === "goTags") { ui.editTagId = ""; ui.tagName = ""; ui.tagIcon = ""; location.hash = "#/tags"; }
    else if (act === "saveWallet") saveWallet();
    else if (act === "editWallet") {
      var w0 = db.wallets.filter(function (x) { return x.id === id; })[0];
      ui.editWalletId = id;
      ui.wName = w0 ? w0.name : "";
      ui.wOpening = w0 ? String((w0.opening || 0) / 100) : "";
      render();
    }
    else if (act === "delWallet") delWallet(id);
    else if (act === "cancelWallet") { ui.editWalletId = ""; ui.wName = ""; ui.wOpening = ""; render(); }
    else if (act === "saveTag") saveTag();
    else if (act === "editTag") {
      var t0 = db.tags.filter(function (x) { return x.id === id; })[0];
      ui.editTagId = id;
      ui.tagName = t0 ? t0.name : "";
      ui.tagFlow = t0 ? t0.flow : "out";
      ui.tagIcon = t0 ? (t0.customIcon || (ICONS[t0.id] ? t0.id : "t_misc")) : "";
      render();
    }
    else if (act === "delTag") delTag(id);
    else if (act === "cancelTag") { ui.editTagId = ""; ui.tagName = ""; ui.tagIcon = ""; render(); }
    else if (act === "pickTagIcon") { ui.tagIcon = v; render(); }
    else if (act === "setTagFlow") { ui.tagFlow = v; render(); }
    else if (act === "openAuth") { ui.authPanel = "login"; ui.authUser = ""; ui.authPwd = ""; render(); }
    else if (act === "switchAuth") {
      ui.authPanel = ui.authPanel === "register" ? "login" : "register";
      ui.authPwd = "";
      render();
    }
    else if (act === "doAuth") doAuth(ui.authPanel === "register" ? "register" : "login");
    else if (act === "logoutAccount") logoutAccount();
    else if (act === "deleteAccount") deleteAccount();
    else if (act === "syncNow") syncNow();
    else if (act === "forceUpdate") forceUpdate();
    else if (act === "mergeOrphan") mergeOrphan();
    else if (act === "exportOrphan") exportOrphan();
    else if (act === "dropOrphan") {
      if (confirm("丢弃暂存账本？\n\n这份数据会永久删除，建议先导出 JSON。")) {
        dropOrphan(); render(); toast("已丢弃");
      }
    }
  });

  /* ================= 下拉刷新 =================
     只在"这一页真的要联网"时才响应用户的下拉——
     记账页、设置页这类纯本地页面下拉没有任何意义，硬加反而让人以为在刷新什么。

     手势：从顶部下拉超过 64px 松手触发；跟随手指但带 0.55 阻尼（拉不动才自然）。
     刷新做完后指示器收起，不等真实 Promise——各页面的刷新函数返回的不是统一 Promise，
     硬等会导致不同页面反馈时间差很多，反而不如给一个稳定的 800ms 反馈。 */

  var PULL_MAX = 96;
  var PULL_TRIGGER = 64;
  var _pull = { active: false, startY: 0, dist: 0, busy: false };

  function pullTipEl() {
    var el = document.getElementById("pullTip");
    if (!el) {
      el = document.createElement("div");
      el.id = "pullTip";
      el.className = "pull-tip";
      document.body.appendChild(el);
    }
    return el;
  }

  /* 这一页下拉该刷新什么。返回 null 表示这页不联网、不响应下拉。 */
  function pullAction() {
    var h = parseHash();
    var v = h.view;
    if (v === "decide") {
      var pid = Number(h.params.id || 0);
      if (pid) return function () { loadDecisionDetail(pid); };
      return function () { dcResetFeed(); };
    }
    if (v === "stock") {
      var code = normCode(h.params.code || "");
      if (!code) return null;
      return function () {
        loadStockDetail(code, true);
        loadStockQuote(code, true);
      };
    }
    if (v === "holdings") return function () { refreshQuotes(true); };
    if (v === "auto") return function () { loadPendingRaw(); };
    if (v === "book") {
      return function () {
        refreshPendingCount(true);
        if (auth && auth.token) syncPull().then(function () { render(); }).catch(function () {});
      };
    }
    if (v === "assets" || v === "overview" || v === "stats") {
      return function () { holdingStats(); refreshQuotes(true); render(); };
    }
    if (v === "config" || v === "wallets" || v === "tags") {
      return function () { render(); };
    }
    return null;
  }

  function paintPull(d) {
    var el = pullTipEl();
    if (d <= 0) {
      el.className = "pull-tip";
      el.style.transform = "translate(-50%, -100%)";
      el.textContent = "";
      return;
    }
    el.className = "pull-tip show" + (d >= PULL_TRIGGER ? " ready" : "");
    el.style.transform = "translate(-50%, " + Math.round(d - 44) + "px)";
    el.textContent = d >= PULL_TRIGGER ? "松开刷新" : "下拉刷新";
  }

  function doPullRefresh() {
    var fn = pullAction();
    if (!fn) { paintPull(0); return; }
    _pull.busy = true;
    var el = pullTipEl();
    el.className = "pull-tip show busy";
    el.style.transform = "translate(-50%, 0)";
    el.textContent = "正在刷新…";
    try {
      fn();
    } catch (e) { /* 刷新失败不影响当前页面 */ }
    setTimeout(function () {
      _pull.busy = false;
      paintPull(0);
    }, 800);
  }

  document.addEventListener("touchstart", function (ev) {
    if (ev.touches.length !== 1) return;
    if (_pull.busy) return;
    var sc = document.scrollingElement || document.documentElement;
    if (sc && sc.scrollTop > 0) return;
    if (!pullAction()) return;
    _pull.active = true;
    _pull.startY = ev.touches[0].clientY;
    _pull.dist = 0;
  }, { passive: true });

  document.addEventListener("touchmove", function (ev) {
    if (!_pull.active || _pull.busy) return;
    var dy = ev.touches[0].clientY - _pull.startY;
    if (dy <= 0) {
      _pull.dist = 0;
      paintPull(0);
      return;
    }
    _pull.dist = Math.min(PULL_MAX, dy * 0.55);
    paintPull(_pull.dist);
    /* 下拉时把浏览器的原生回弹/下拉刷新压住，否则两套手势打架 */
    if (ev.cancelable && dy > 8) ev.preventDefault();
  }, { passive: false });

  document.addEventListener("touchend", function () {
    if (!_pull.active) return;
    var d = _pull.dist;
    _pull.active = false;
    if (d >= PULL_TRIGGER) doPullRefresh();
    else paintPull(0);
  }, { passive: true });

  document.addEventListener("touchcancel", function () {
    if (!_pull.active) return;
    _pull.active = false;
    paintPull(0);
  }, { passive: true });

  document.addEventListener("input", function (ev) {
    var el = ev.target;
    var act = el.getAttribute && el.getAttribute("data-act");
    if (act === "setDay") ui.day = el.value;
    else if (act === "setMemo") ui.memo = el.value;
    else if (act === "hCode") { ui.hCode = el.value; scheduleNameLookup(); searchStocks(el.value); }
    else if (act === "hName") ui.hName = el.value;
    else if (act === "hShares") ui.hShares = el.value;
    else if (act === "hCost") ui.hCost = el.value;
    else if (act === "wName") ui.wName = el.value;
    else if (act === "wOpening") ui.wOpening = el.value;
    else if (act === "tagName") ui.tagName = el.value;
    else if (act === "searchQ") { ui.searchQ = el.value; paintSearch(); }
    else if (act === "authUser") ui.authUser = el.value;
    else if (act === "authPwd") ui.authPwd = el.value;
    else if (act === "pfNick") { ui.pfNick = el.value; paintProfilePreview(); }
    else if (act === "dcFormTitle") decideState().form.title = el.value;
    else if (act === "dcFormAmount") decideState().form.amount = el.value;
    else if (act === "dcFormReason") decideState().form.reason = el.value;
    else if (act === "dcComment") decideState().commentDraft = el.value;
    else if (act === "autoText") autoState().text = el.value;
    else if (act === "auNameLocal") {
      var au1 = autoState();
      var i1 = Number(el.getAttribute("data-id"));
      if (au1.items[i1]) { au1.items[i1].merchant = el.value; au1.items[i1].memo = el.value; }
    }
    else if (act === "auNameRemote") {
      var au2 = autoState();
      var i2 = Number(el.getAttribute("data-id"));
      if (au2.remote && au2.remote[i2]) { au2.remote[i2].merchant = el.value; au2.remote[i2].memo = el.value; }
    }
  });

  document.addEventListener("change", function (ev) {
    var el = ev.target;
    var act = el.getAttribute && el.getAttribute("data-act");
    if (act === "sdWallet") { stockState().walletId = el.value; return; }
  });

  window.addEventListener("hashchange", function () { ui._loaded = false; render(); });

  /* 多标签页 / 多窗口数据同步：
     localStorage 是共享的，但改动的那个标签不会收到 storage 事件，
     只有「其他」标签会收到——正好用来同步，否则两边各写各的会把数据覆盖掉 */
  var _syncTimer = null;
  window.addEventListener("storage", function (ev) {
    if (ev.key !== STORE_KEY) return;
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(function () {
      _syncTimer = null;
      load();
      render();
      toast("已同步其他窗口的改动");
    }, 200);
  });

  /* ================= 启动 ================= */

  load();
  if (!location.hash) location.hash = "#/book";
  render();

  /* 访客计数：只为了运营看板知道「今天来了几个人」。
     串是本机随机生成的，换浏览器/清缓存就是另一个人；不带账号、不带 IP、不记看了哪页。
     每个标签页每会话只报一次，自己别把自己的数刷上去。 */
  var VISITOR_KEY = "sz.visitor.v1";
  function pingVisit() {
    try {
      if (sessionStorage.getItem("sz.pvPinged") === "1") return;
      sessionStorage.setItem("sz.pvPinged", "1");
    } catch (e) {}
    var v = "";
    try {
      v = localStorage.getItem(VISITOR_KEY) || "";
      if (!v) {
        v = "v" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
        localStorage.setItem(VISITOR_KEY, v);
      }
    } catch (e) { return; }
    apiFetch("/pageview/ping", {
      method: "POST",
      body: JSON.stringify({ visitor: v })
    }).catch(function () { /* 记不上就算了，不影响记账 */ });
  }
  pingVisit();
  /* 登录态在的时候顺手看一眼有没有待确认，进 App 首页就能看到提示条 */
  setTimeout(function () { refreshPendingCount(true); }, 1500);
})();
