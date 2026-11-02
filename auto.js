/* ============================================================
   随手账 · 智能识别（自动记账的第一层）

   目标：把「支付通知 / 银行短信 / 微信支付宝账单文本」变成一条可入账的记录。
   不依赖任何系统权限，粘一段文字就能用；改天接上安卓通知监听，
   只要把通知原文丢进 SZAuto.parse()，剩下的完全一样。

   解析四件事：金额、方向（花/收）、商户、时间
   分类一件事：商户 → 分类，命中不了再看金额和时段，最后兜底「杂项」
   ============================================================ */
(function (root) {
  "use strict";

  /* 商户关键词 → 分类。顺序有意义：先吃更具体的，再吃宽泛的。
     词表按国内真实商户整理，命中不区分大小写和空格。 */
  var TAG_RULES = [
    {
      tag: "t_food",
      words: ["美团外卖", "饿了么", "外卖", "餐厅", "饭店", "火锅", "烧烤", "烤肉", "麦当劳", "肯德基",
        "必胜客", "汉堡王", "德克士", "华莱士", "星巴克", "瑞幸", "库迪", "咖啡", "奶茶", "蜜雪", "喜茶",
        "奈雪", "古茗", "茶百道", "霸王茶姬", "沪上阿姨", "食堂", "早餐", "午餐", "晚餐", "夜宵", "面馆",
        "米线", "螺蛳粉", "麻辣烫", "沙县", "黄焖鸡", "披萨", "面包", "蛋糕", "烘焙", "零食", "水果",
        "菜市场", "生鲜", "餐饮", "酒家", "小馆", "串串", "卤味", "饺子", "包子", "粥"]
    },
    {
      tag: "t_car",
      words: ["滴滴", "花小猪", "曹操出行", "T3出行", "高德打车", "打车", "出租车", "网约车", "地铁",
        "公交", "轨道交通", "12306", "火车票", "高铁", "机票", "航空", "加油", "中石化", "中石油",
        "壳牌", "充电桩", "特来电", "星星充电", "停车", "ETC", "过路费", "高速", "哈啰", "青桔", "美团单车",
        "共享单车", "摩拜", "车费", "交通"]
    },
    {
      tag: "t_buy",
      words: ["淘宝", "天猫", "京东", "拼多多", "唯品会", "苏宁", "闲鱼", "抖音商城", "超市", "便利店",
        "沃尔玛", "永辉", "盒马", "大润发", "家乐福", "711", "7-11", "全家", "罗森", "美宜佳", "小米",
        "华为", "苹果", "Apple", "优衣库", "无印良品", "名创优品", "宜家", "商场", "百货", "专卖店",
        "旗舰店", "商城", "网购", "电商"]
    },
    {
      tag: "t_home",
      words: ["房租", "租金", "物业", "水费", "电费", "燃气", "国家电网", "自来水", "供暖", "取暖",
        "宽带", "电信", "移动", "联通", "话费", "流量", "家政", "保洁", "维修", "装修", "家具", "家电"]
    },
    {
      tag: "t_fun",
      words: ["电影", "影院", "万达", "猫眼", "淘票票", "KTV", "酒吧", "livehouse", "游戏", "Steam",
        "网易", "腾讯视频", "爱奇艺", "优酷", "哔哩", "B站", "会员", "健身", "游泳", "球馆", "台球",
        "桌游", "剧本杀", "密室", "旅游", "酒店", "民宿", "携程", "飞猪", "去哪儿", "迪士尼", "景区",
        "门票", "演出", "音乐会", "展览", "按摩", "足疗", "理发", "美发"]
    },
    {
      tag: "t_med",
      words: ["医院", "药店", "药房", "大药房", "诊所", "挂号", "体检", "牙科", "口腔", "眼科", "医药",
        "卫生院", "医疗", "门诊", "疫苗", "康复"]
    },
    {
      tag: "t_study",
      words: ["书店", "当当", "新华书店", "课程", "网课", "学费", "培训", "教育", "考试", "报名费",
        "文具", "书籍", "图书", "得到", "极客时间", "知识星球", "学习", "驾校"]
    }
  ];

  /* 收入侧的分类，靠关键词直接定，不用猜 */
  var INCOME_RULES = [
    { tag: "t_pay", words: ["工资", "薪资", "代发工资", "奖金", "绩效", "津贴", "补贴", "报销"] },
    { tag: "t_div", words: ["股息", "分红", "派息", "红利"] },
    { tag: "t_int", words: ["利息", "结息", "理财收益", "收益到账"] },
    { tag: "t_gift", words: ["红包", "礼金", "压岁钱", "转账收款"] },
    { tag: "t_side", words: ["稿费", "兼职", "外快", "佣金", "副业"] }
  ];

  var OUT_WORDS = ["付款", "支付成功", "已支付", "支付", "消费", "支出", "扣款", "转出", "已付款",
    "付款成功", "交易成功", "成功付款", "你已成功付款", "支出了", "花费", "购买"];
  /* 收入词要"整词"，不能放裸「收款」——「收款方 xxx」是支出语境，放了会全判成收入 */
  var IN_WORDS = ["已收款", "收款成功", "收到一笔", "退款", "入账", "到账", "收入", "转入",
    "收到", "已到账", "退款成功", "退回", "返现", "代发", "工资", "薪资", "奖金", "绩效",
    "存入", "汇入"];

  // 金额：优先带货币符号/单位的，越具体越先匹配
  var AMOUNT_PATTERNS = [
    /(?:付款金额|支付金额|交易金额|订单金额|实付|合计|金额|消费)[：:\s]*[¥￥]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/,
    /[¥￥]\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/,
    /(?:人民币|RMB)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*元/,
    /[-−]\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/,
    /\b([0-9][0-9]*\.[0-9]{2})\b/
  ];

  var MERCHANT_PATTERNS = [
    /(?:收款方|收款人|商户名称|商户全称|商户|商家|对方|付款给)[：:\s]*([^\s，,。；;、|]+)/,
    /在\s*([^\s，,。；;]{2,20}?)\s*(?:消费|支付|付款)/,
    /(?:向|给)\s*([^\s，,。；;]{2,20}?)\s*(?:付款|转账|支付)/
  ];

  var DATE_FULL = /(20[0-9]{2})\s*[-/年.]\s*([0-9]{1,2})\s*[-/月.]\s*([0-9]{1,2})/;
  var DATE_MD = /([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*日/;
  var TIME_HM = /([0-9]{1,2}):([0-9]{2})/;

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function norm(s) {
    return String(s || "").replace(/[\s\u3000]+/g, " ").trim();
  }

  function toCents(numStr) {
    var v = parseFloat(String(numStr).replace(/,/g, ""));
    if (!isFinite(v) || v <= 0) return 0;
    return Math.round(v * 100);
  }

  /* 从一段文字里抠金额。按优先级试，命中一个有意义的数就收手。
     坑一：时间 12:31 会被误当金额；
     坑二：日期 2026-11-01 里的「-11」会被当成负号金额。
     所以先整段削掉时间和日期，再开始匹配。 */
  function stripDateTime(text) {
    return String(text || "")
      .replace(/20[0-9]{2}\s*[-/年.]\s*[0-9]{1,2}\s*[-/月.]\s*[0-9]{1,2}\s*日?/g, " ")
      .replace(/[0-9]{1,2}\s*月\s*[0-9]{1,2}\s*日/g, " ")
      .replace(/[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?/g, " ");
  }

  function findAmount(text) {
    var t = stripDateTime(text);
    for (var i = 0; i < AMOUNT_PATTERNS.length; i++) {
      var m = t.match(AMOUNT_PATTERNS[i]);
      if (m) {
        var c = toCents(m[1]);
        if (c > 0 && c <= 100000000) return { cents: c, hit: i, raw: m[0] };
      }
    }
    return null;
  }

  function findFlow(text) {
    var t = text;
    // 收入词优先：「退款」里也含「款」，必须先看收入侧
    for (var i = 0; i < IN_WORDS.length; i++) {
      if (t.indexOf(IN_WORDS[i]) >= 0) return "in";
    }
    for (var j = 0; j < OUT_WORDS.length; j++) {
      if (t.indexOf(OUT_WORDS[j]) >= 0) return "out";
    }
    // 账单里的正负号
    if (/[-−]\s*[0-9]/.test(t)) return "out";
    if (/\+\s*[0-9]/.test(t)) return "in";
    return "out";
  }

  function findMerchant(text) {
    for (var i = 0; i < MERCHANT_PATTERNS.length; i++) {
      var m = text.match(MERCHANT_PATTERNS[i]);
      if (m && m[1]) {
        var name = m[1].replace(/[（(].*?[)）]/g, "").trim();
        if (name.length >= 2) return name;
      }
    }
    return "";
  }

  function findDay(text, now) {
    now = now || new Date();
    var m = text.match(DATE_FULL);
    if (m) {
      return m[1] + "-" + pad2(Number(m[2])) + "-" + pad2(Number(m[3]));
    }
    var md = text.match(DATE_MD);
    if (md) {
      var mo = Number(md[1]), da = Number(md[2]);
      var year = now.getFullYear();
      // 12 月看到「1 月」，说明是明年的账单
      if (mo > now.getMonth() + 2) year -= 1;
      return year + "-" + pad2(mo) + "-" + pad2(da);
    }
    return todayStr();
  }

  function findHour(text, now) {
    var m = text.match(TIME_HM);
    if (m) return Number(m[1]);
    return (now || new Date()).getHours();
  }

  /* 分类：先看用户自己纠正过的（learning），再看关键词，再看时段，最后兜底 */
  function guessTag(merchant, flow, cents, hour, learning) {
    var text = String(merchant || "");

    // 1) 用户改过的分类，优先级最高
    if (learning) {
      var keys = Object.keys(learning);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i] && text.indexOf(keys[i]) >= 0) {
          return { tagId: learning[keys[i]], why: "按你之前改过的分类" };
        }
      }
    }

    // 2) 收入侧关键词
    if (flow === "in") {
      for (var a = 0; a < INCOME_RULES.length; a++) {
        for (var b = 0; b < INCOME_RULES[a].words.length; b++) {
          if (text.indexOf(INCOME_RULES[a].words[b]) >= 0) {
            return { tagId: INCOME_RULES[a].tag, why: "命中「" + INCOME_RULES[a].words[b] + "」" };
          }
        }
      }
      return { tagId: "t_side", why: "收入类，先归到外快" };
    }

    // 3) 支出侧关键词
    for (var k = 0; k < TAG_RULES.length; k++) {
      for (var w = 0; w < TAG_RULES[k].words.length; w++) {
        if (text.indexOf(TAG_RULES[k].words[w]) >= 0) {
          return { tagId: TAG_RULES[k].tag, why: "命中「" + TAG_RULES[k].words[w] + "」" };
        }
      }
    }

    // 4) 没商户名就按时段猜：饭点的小额大概率是吃饭
    if (!text) {
      if (hour >= 6 && hour <= 9) return { tagId: "t_food", why: "早餐时段" };
      if (hour >= 11 && hour <= 13) return { tagId: "t_food", why: "午餐时段" };
      if (hour >= 17 && hour <= 20) return { tagId: "t_food", why: "晚餐时段" };
      if (cents > 0 && cents < 1500) return { tagId: "t_car", why: "小额短途" };
    }

    return { tagId: "t_misc", why: "没认出来，先放杂项" };
  }

  /* 账单行没有「收款方 xxx」前缀时的兜底：削掉日期、时间、金额、方向词，
     剩下的短文本就是商户名（「2026-11-01 08:15:22 肯德基 -18.00 支出」→ 肯德基） */
  function merchantFallback(raw) {
    var t = stripDateTime(raw)
      .replace(/[-−+]?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s*元?/g, " ")
      .replace(/支出|收入|支|收|余额|[：:|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (t.length >= 2 && t.length <= 20 && /[\u4e00-\u9fa5A-Za-z]/.test(t)) {
      // 剩下的如果还是一句动作话术（「你已成功付款」），那不是商户，宁可留空
      if (/付款|支付|消费|成功|交易|转账|收款|退款|余额|金额|支出|收入|通知|提醒|凭证/.test(t)) return "";
      return t;
    }
    return "";
  }

  /* 把一段文本切成「候选记录」。
     关键判断：有几行自带金额？
       - 最多一行 → 这是一条支付通知，常把金额和商户拆成两三行，整段算一笔
       - 多行都有金额 → 这是账单明细，一行一笔 */
  function splitBlocks(text) {
    var all = String(text || "");
    var lines = all.split(/\r?\n/).map(norm).filter(Boolean);
    var withAmount = lines.filter(function (l) { return !!findAmount(l); });

    if (withAmount.length <= 1) {
      var flat = norm(all.replace(/\r?\n/g, " "));
      return findAmount(flat) ? [flat] : [];
    }

    var blocks = [];
    var buf = "";
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^(微信支付|支付宝|账单|交易记录|收支明细|导出时间|温馨提示|明细)/.test(line) && !findAmount(line)) continue;
      if (findAmount(line)) {
        blocks.push(buf ? buf + " " + line : line);
        buf = "";
      } else {
        buf = buf ? buf + " " + line : line;
      }
    }
    if (buf && findAmount(buf)) blocks.push(buf);
    return blocks;
  }

  /* 主入口 */
  function parse(text, opts) {
    opts = opts || {};
    var now = opts.now ? new Date(opts.now) : new Date();
    var learning = opts.learning || null;
    var blocks = splitBlocks(text);
    var items = [];
    var skipped = [];

    for (var i = 0; i < blocks.length; i++) {
      var raw = blocks[i];
      var am = findAmount(raw);
      if (!am) { skipped.push(raw); continue; }
      var flow = findFlow(raw);
      var merchant = findMerchant(raw) || merchantFallback(raw);
      var day = findDay(raw, now);
      var hour = findHour(raw, now);
      var g = guessTag(merchant, flow, am.cents, hour, learning);
      items.push({
        cents: am.cents,
        flow: flow,
        merchant: merchant,
        memo: merchant,
        day: day,
        hour: hour,
        tagId: g.tagId,
        why: g.why,
        raw: raw
      });
    }

    // 同一商户同金额同一天，视为重复（同一笔通知可能被读到两次）
    var seen = {};
    var uniq = [];
    for (var j = 0; j < items.length; j++) {
      var key = items[j].day + "|" + items[j].cents + "|" + items[j].merchant;
      if (seen[key]) continue;
      seen[key] = 1;
      uniq.push(items[j]);
    }

    return { items: uniq, skipped: skipped, total: uniq.length };
  }

  var API = {
    parse: parse,
    guessTag: guessTag,
    findAmount: findAmount,
    findFlow: findFlow,
    findMerchant: findMerchant,
    TAG_RULES: TAG_RULES,
    INCOME_RULES: INCOME_RULES
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SZAuto = API;
})(typeof window !== "undefined" ? window : globalThis);
