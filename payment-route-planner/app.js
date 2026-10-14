/* The page. It reads what the visitor chose, asks the router for routes, and draws them.
 * No framework, no network calls, no AI model. State lives in the address so a view can be shared. */
(function () {
  "use strict";

  var C = PrcCatalog, R = Router, B = Banks;
  var J = C.JURISDICTIONS, JB = R.JUR;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function short(name) { return name.replace(/\s*\([^)]*\)/g, ""); }
  function placeName(id) { return JB[id].short || JB[id].name; }
  function pct(n) { return n < 10 ? n.toFixed(2) : n.toFixed(1); }
  function shortTime(m) {
    if (m < 1) return "under 1 min";
    if (m < 60) return Math.round(m) + " min";
    var h = m / 60;
    if (h < 24) return Math.round(h) + " h";
    return Math.round(h / 24) + " d";
  }
  function cellTime(m) {
    if (m < 1) return "<1m";
    if (m < 60) return Math.round(m) + "m";
    var h = m / 60;
    return h < 24 ? Math.round(h) + "h" : Math.round(h / 24) + "d";
  }

  var AMOUNTS = [200, 1000, 5000, 20000, 100000, 1000000];
  var AMOUNT_LABEL = { 200: "$200", 1000: "$1,000", 5000: "$5,000", 20000: "$20,000", 100000: "$100,000", 1000000: "$1 million" };
  function amtText(a) { return AMOUNT_LABEL[a] || "$" + a.toLocaleString("en-US"); }
  var PRIORITIES = ["cheapest", "fastest", "balanced", "fewest"];
  var PRI_HELP = { cheapest: "lowest total cost", fastest: "arrives soonest", balanced: "a fair mix of cost, speed and hands", fewest: "fewest banks and providers in the chain" };
  var WHENS = [["weekday", "Weekday day"], ["evening", "Weekday evening"], ["weekend", "Weekend"]];
  var MODE_LABEL = { direct: "Own", partner: "Partner", none: "None" };
  var MODE_WORD = { direct: "own account", partner: "via partner", none: "no account" };

  var first = C.CORRIDORS[0];
  var state = {
    from: first.from, to: first.to, amount: first.amount, priority: first.priority, when: first.when,
    delivery: "bank", destCcy: "", fp: first.footprint, modes: R.presetModes(first.footprint),
    sel: 0, stage: 2, metric: "cost", mxAll: false
  };

  // ---------- address ----------
  function modeString() { return J.map(function (j) { return state.modes[j.ccy].charAt(0); }).join(""); }
  function readHash() {
    var h = location.hash.replace(/^#/, ""); if (!h) return;
    var p = {}; h.split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    if (p.f && JB[p.f]) state.from = p.f;
    if (p.t && JB[p.t]) state.to = p.t;
    if (p.a && AMOUNTS.indexOf(+p.a) >= 0) state.amount = +p.a;
    if (p.p && PRIORITIES.indexOf(p.p) >= 0) state.priority = p.p;
    if (p.w && WHENS.some(function (w) { return w[0] === p.w; })) state.when = p.w;
    if (p.d === "wallet") state.delivery = "wallet";
    if (p.c && R.JUR_BY_CCY[p.c]) state.destCcy = p.c;
    if (p.fp) { var f = C.FOOTPRINTS.filter(function (x) { return x.id === p.fp; })[0]; if (f) { state.fp = f.id; state.modes = R.presetModes(f.id); } }
    if (p.m && p.m.length === J.length && /^[dpn]+$/.test(p.m)) {
      J.forEach(function (j, i) { state.modes[j.ccy] = { d: "direct", p: "partner", n: "none" }[p.m.charAt(i)]; });
      if (!p.fp) state.fp = "custom";
    }
    if (p.r !== undefined && +p.r >= 0 && +p.r <= 2) state.sel = +p.r;
    if (p.s !== undefined && +p.s >= 1 && +p.s <= 7) state.stage = +p.s;
    if (p.mt === "time") state.metric = "time";
    if (p.ma === "1") state.mxAll = true;
  }
  function writeHash() {
    var parts = ["f=" + state.from, "t=" + state.to, "a=" + state.amount, "p=" + state.priority, "w=" + state.when, "m=" + modeString()];
    if (state.fp !== "custom") parts.push("fp=" + state.fp);
    if (state.delivery === "wallet") parts.push("d=wallet");
    if (state.destCcy) parts.push("c=" + state.destCcy);
    if (state.sel) parts.push("r=" + state.sel);
    if (state.stage !== 2) parts.push("s=" + state.stage);
    if (state.metric === "time") parts.push("mt=time");
    if (state.mxAll) parts.push("ma=1");
    try { history.replaceState(null, "", "#" + parts.join("&")); } catch (e) { /* the address is a convenience only */ }
  }

  // ---------- tooltip ----------
  var tip = $("tip");
  function showTip(x, y, lines) {
    tip.textContent = "";
    lines.forEach(function (l, i) { tip.appendChild(el(i === 0 ? "strong" : "span", "", l)); if (i > 0) tip.appendChild(document.createElement("br")); });
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = Math.min(Math.max(8, x + 14), window.innerWidth - w - 8);
    var top = y + 18 + h > window.innerHeight ? y - h - 12 : y + 18;
    tip.style.left = left + "px"; tip.style.top = Math.max(8, top) + "px";
  }
  function hideTip() { tip.hidden = true; }
  function attachTip(node, linesFn) {
    node.addEventListener("pointermove", function (e) { showTip(e.clientX, e.clientY, linesFn()); });
    node.addEventListener("pointerleave", hideTip);
    node.addEventListener("focus", function () { var r = node.getBoundingClientRect(); showTip(r.left, r.bottom - 10, linesFn()); });
    node.addEventListener("blur", hideTip);
  }

  // ---------- controls ----------
  function walletAvailable() { return R.SCHEMES_BY_CCY[JB[state.to].ccy].some(function (s) { return s.kind === "wallet"; }); }

  function buildControls() {
    var cor = $("corridors");
    C.CORRIDORS.forEach(function (c) {
      var b = el("button", "preset", c.name); b.type = "button"; b.dataset.id = c.id;
      b.addEventListener("click", function () {
        state.from = c.from; state.to = c.to; state.amount = c.amount; state.priority = c.priority; state.when = c.when;
        state.fp = c.footprint; state.modes = R.presetModes(c.footprint); state.delivery = "bank"; state.destCcy = ""; state.sel = 0;
        refresh();
      });
      cor.appendChild(b);
    });

    var t = $("transfer");
    function opt(sel, j) { var o = el("option", "", j.name.replace(/ \(.*\)/, "") + " (" + j.ccy + ")"); o.value = j.id; sel.appendChild(o); }
    function field(id, label, build) {
      var l = el("label", "ctl-label", label); l.setAttribute("for", id); t.appendChild(l); return build();
    }
    var from = field("sel-from", "From", function () { var s = el("select", "field"); s.id = "sel-from"; J.forEach(function (j) { opt(s, j); }); s.addEventListener("change", function () { state.from = s.value; state.sel = 0; refresh(); }); t.appendChild(s); return s; });
    var to = field("sel-to", "To", function () { var s = el("select", "field"); s.id = "sel-to"; J.forEach(function (j) { opt(s, j); }); s.addEventListener("change", function () { state.to = s.value; state.sel = 0; state.delivery = "bank"; refresh(); }); t.appendChild(s); return s; });
    void from; void to;

    t.appendChild(el("span", "ctl-label", "Amount (in US dollars)"));
    var amt = el("div", "tiles"); amt.id = "amounts";
    AMOUNTS.forEach(function (a) { var b = el("button", "tile", amtText(a)); b.type = "button"; b.dataset.v = a; b.addEventListener("click", function () { state.amount = a; refresh(); }); amt.appendChild(b); });
    t.appendChild(amt);

    t.appendChild(el("span", "ctl-label", "What matters most"));
    var pri = el("div", "tiles two"); pri.id = "priorities";
    PRIORITIES.forEach(function (p) { var b = el("button", "tile", C.MODEL.priorities[p].name); b.type = "button"; b.dataset.v = p; b.title = PRI_HELP[p]; b.addEventListener("click", function () { state.priority = p; state.sel = 0; refresh(); }); pri.appendChild(b); });
    t.appendChild(pri);
    t.appendChild(el("p", "hint", "")).id = "pri-help";

    t.appendChild(el("span", "ctl-label", "When you send"));
    var wh = el("div", "seg"); wh.id = "whens"; wh.setAttribute("role", "radiogroup"); wh.setAttribute("aria-label", "When you send");
    WHENS.forEach(function (w) {
      var l = el("label"); var i = el("input"); i.type = "radio"; i.name = "when"; i.value = w[0];
      i.addEventListener("change", function () { state.when = w[0]; state.sel = 0; refresh(); });
      l.appendChild(i); l.appendChild(el("span", "", w[1])); wh.appendChild(l);
    });
    t.appendChild(wh);

    var dl = el("div"); dl.id = "delivery-box"; t.appendChild(dl);
    dl.appendChild(el("span", "ctl-label", "How the receiver is paid"));
    var dg = el("div", "seg"); dg.setAttribute("role", "radiogroup"); dg.setAttribute("aria-label", "How the receiver is paid");
    [["bank", "Bank account"], ["wallet", "Mobile wallet"]].forEach(function (d) {
      var l = el("label"); var i = el("input"); i.type = "radio"; i.name = "delivery"; i.value = d[0];
      i.addEventListener("change", function () { state.delivery = d[0]; state.sel = 0; refresh(); });
      l.appendChild(i); l.appendChild(el("span", "", d[1])); dg.appendChild(l);
    });
    dl.appendChild(dg);

    t.appendChild(el("label", "ctl-label", "Receiver's account currency")).setAttribute("for", "sel-dest");
    var ds = el("select", "field"); ds.id = "sel-dest";
    ds.addEventListener("change", function () { state.destCcy = ds.value; state.sel = 0; refresh(); });
    t.appendChild(ds);

    var fp = $("footprints");
    C.FOOTPRINTS.forEach(function (f) {
      var b = el("button", "preset", f.name); b.type = "button"; b.dataset.id = f.id;
      b.addEventListener("click", function () { state.fp = f.id; state.modes = R.presetModes(f.id); state.sel = 0; refresh(); });
      fp.appendChild(b);
    });
    var md = $("modes");
    J.forEach(function (j) {
      var row = el("div", "moderow"); row.appendChild(el("b", "", j.ccy));
      var seg = el("div", "seg"); seg.setAttribute("role", "radiogroup"); seg.setAttribute("aria-label", j.ccyName + " account");
      ["direct", "partner", "none"].forEach(function (m) {
        var l = el("label"); var i = el("input"); i.type = "radio"; i.name = "mode-" + j.ccy; i.value = m;
        i.addEventListener("change", function () { state.modes[j.ccy] = m; state.fp = "custom"; state.sel = 0; refresh(); });
        l.appendChild(i); l.appendChild(el("span", "", MODE_LABEL[m])); seg.appendChild(l);
      });
      row.appendChild(seg); md.appendChild(row);
    });

    $("metric").addEventListener("change", function () { state.metric = $("metric").value; renderMatrixView(); writeHash(); });
    $("mx-all").addEventListener("change", function () { state.mxAll = $("mx-all").checked; renderMatrixView(); writeHash(); });
  }

  function syncControls() {
    $("sel-from").value = state.from; $("sel-to").value = state.to;
    Array.prototype.forEach.call($("amounts").children, function (b) { b.setAttribute("aria-pressed", String(+b.dataset.v === state.amount)); });
    Array.prototype.forEach.call($("priorities").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === state.priority)); });
    $("pri-help").textContent = C.MODEL.priorities[state.priority].name + ": " + PRI_HELP[state.priority] + ".";
    Array.prototype.forEach.call(document.querySelectorAll('input[name="when"]'), function (i) { i.checked = i.value === state.when; });
    var wallet = walletAvailable();
    if (!wallet) state.delivery = "bank";
    $("delivery-box").hidden = !wallet;
    Array.prototype.forEach.call(document.querySelectorAll('input[name="delivery"]'), function (i) { i.checked = i.value === state.delivery; });
    var ds = $("sel-dest"), local = JB[state.to].ccy;
    ds.textContent = "";
    var o0 = el("option", "", "Local currency (" + local + ")"); o0.value = ""; ds.appendChild(o0);
    ["USD", "EUR"].forEach(function (c) { if (c !== local) { var o = el("option", "", R.JUR_BY_CCY[c].ccyName + " (" + c + ")"); o.value = c; ds.appendChild(o); } });
    if (state.destCcy === local) state.destCcy = "";
    ds.value = state.destCcy;
    ds.disabled = state.delivery === "wallet";
    Array.prototype.forEach.call($("corridors").children, function (b) {
      var c = C.CORRIDORS.filter(function (x) { return x.id === b.dataset.id; })[0];
      b.setAttribute("aria-pressed", String(c.from === state.from && c.to === state.to && c.amount === state.amount && c.priority === state.priority && c.when === state.when && c.footprint === state.fp));
    });
    Array.prototype.forEach.call($("footprints").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.id === state.fp)); });
    var f = C.FOOTPRINTS.filter(function (x) { return x.id === state.fp; })[0];
    $("footprint-note").textContent = f ? f.note : "Custom accounts. " + J.filter(function (j) { return state.modes[j.ccy] !== "none"; }).length + " currencies available.";
    J.forEach(function (j) {
      Array.prototype.forEach.call(document.querySelectorAll('input[name="mode-' + j.ccy + '"]'), function (i) { i.checked = i.value === state.modes[j.ccy]; });
    });
    $("metric").value = state.metric;
    $("mx-all").checked = state.mxAll;
  }

  function request() {
    return { from: state.from, to: state.to, amount: state.amount, priority: state.priority, when: state.when, delivery: state.delivery, destCcy: state.destCcy || undefined, modes: state.modes };
  }

  // ---------- summary ----------
  function routeTitle(r) {
    var last = r.legs[r.legs.length - 1];
    if (last.type === "payout") return r.holds.join(" to ") + ", then " + short(last.schemeName);
    return r.holds.join(" to ") + ", then the bank network" + (last.converts ? " (the receiver's bank converts)" : "");
  }
  function renderSummary(plan) {
    var h = $("headline"), k = $("kpis"); k.textContent = "";
    var R0 = plan.request;
    if (plan.noRoute) { h.textContent = "No route from " + placeName(R0.from) + " to " + placeName(R0.to) + ". " + plan.reason; return; }
    var b = plan.routes[0];
    h.textContent = C.MODEL.priorities[R0.priority].name + " route from " + placeName(R0.from) + " to " + placeName(R0.to) + ": " + routeTitle(b) + ". About " + R.money(b.totals.usd) + " (" + pct(b.totals.pct) + " percent) on " + amtText(R0.amount) + ", arriving " + R.minutesText(b.totals.minutes.typ) + ".";
    function kpi(big, small, lab, sub) {
      var d = el("div", "kpi"); var bg = el("div", "big", big); if (small) bg.appendChild(el("small", "", " " + small)); d.appendChild(bg);
      d.appendChild(el("div", "lab", lab)); d.appendChild(el("div", "sub", sub)); k.appendChild(d);
    }
    kpi(pct(b.totals.pct), "%", "Total cost", R.money(b.totals.usd) + " on " + amtText(R0.amount));
    kpi(shortTime(b.totals.minutes.typ), "", "Typical arrival", "Best " + shortTime(b.totals.minutes.best) + ", worst " + shortTime(b.totals.minutes.worst));
    kpi(String(b.totals.hands), "", "Hands in the chain", b.totals.fxHops + " currency conversion" + (b.totals.fxHops === 1 ? "" : "s"));
    kpi(String(b.compliance.checks.length), "", "Compliance checks", b.compliance.regs.length + " country rules in play");
  }

  // ---------- routes ----------
  function buildLegend() {
    var lg = $("legend");
    [["payin", "Pay in: sender to your account"], ["fx", "Convert: one currency to another"], ["payout", "Pay out: your account to the receiver by a local scheme"], ["swift", "Bank network: a chain of correspondent banks"]].forEach(function (x) {
      var s = el("span", "k-" + x[0]); s.appendChild(el("i", "shape")); s.appendChild(document.createTextNode(x[1])); lg.appendChild(s);
    });
  }
  function legTag(l) {
    if (l.type === "fx") return "Convert";
    if (l.type === "swift") return "Bank network";
    var base = short(l.schemeName);
    if (base.split(" ").some(function (w) { return w.length > 11; })) {
      var m = /\(([^)]*)\)/.exec(l.schemeName);
      if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1);
    }
    return base;
  }
  function buildChain(r) {
    var ol = el("ol", "chain" + (r.nodes.length >= 5 ? " dense" : ""));
    ol.setAttribute("aria-label", "Route: " + routeTitle(r));
    r.nodes.forEach(function (n, i) {
      var li = el("li", "node " + n.kind + (n.mode === "partner" ? " partner" : ""));
      if (n.kind === "src") { li.appendChild(el("b", "", n.ccy)); li.appendChild(el("span", "", n.label)); li.classList.add("end"); }
      else if (n.kind === "dst") { li.appendChild(el("b", "", n.ccy)); li.appendChild(el("span", "", n.label)); li.classList.add("end"); }
      else { li.appendChild(el("b", "", n.ccy)); li.appendChild(el("span", "", n.bank)); li.appendChild(el("em", "", MODE_WORD[n.mode])); }
      ol.appendChild(li);
      if (i < r.legs.length) {
        var l = r.legs[i], lk = el("li", "link k-" + l.type);
        var tag = el("span", "tag"); tag.appendChild(el("i", "shape")); tag.appendChild(document.createTextNode(legTag(l)));
        lk.appendChild(tag); lk.appendChild(el("span", "when", shortTime(l.minutes.typ)));
        lk.title = l.text; ol.appendChild(lk);
      }
    });
    return ol;
  }
  function legTotal(l) { return l.cost.fees + l.cost.fx + l.cost.partner + l.cost.tax; }
  function stackBar(r, valueOf, scale, label) {
    var wrap = el("div", "stack-wrap"), st = el("div", "stack"); st.setAttribute("role", "img"); st.setAttribute("aria-label", label);
    var total = r.legs.reduce(function (t, l) { return t + valueOf(l); }, 0);
    st.style.width = Math.max(4, scale(total)) + "%";
    r.legs.forEach(function (l) {
      var seg = el("i", "k-" + l.type); seg.style.width = (valueOf(l) / total * 100) + "%";
      attachTip(seg, function () { return [l.text, R.money(legTotal(l)) + ", typical " + R.minutesText(l.minutes.typ)]; });
      st.appendChild(seg);
    });
    wrap.appendChild(st); return wrap;
  }
  function rangeBar(r, maxWorst) {
    var sq = function (m) { return Math.sqrt(m) / Math.sqrt(maxWorst) * 100; };
    var d = el("div", "range"); d.setAttribute("role", "img");
    d.setAttribute("aria-label", "Best " + R.minutesText(r.totals.minutes.best) + ", typical " + R.minutesText(r.totals.minutes.typ) + ", worst " + R.minutesText(r.totals.minutes.worst));
    var sp = el("div", "span"); sp.style.left = sq(r.totals.minutes.best) + "%"; sp.style.width = Math.max(1, sq(r.totals.minutes.worst) - sq(r.totals.minutes.best)) + "%";
    var ty = el("div", "typ"); ty.style.left = sq(r.totals.minutes.typ) + "%";
    d.appendChild(sp); d.appendChild(ty); return d;
  }
  function legTable(r) {
    var wrap = el("div", "legs-wrap"), t = el("table", "legs");
    var head = el("tr"); ["Move", "Fees", "Conversion", "Partner", "Tax", "Typical time"].forEach(function (h, i) { var th = el("th", "", h); if (i > 0) th.className = "n"; head.appendChild(th); });
    t.appendChild(head);
    r.legs.forEach(function (l) {
      var tr = el("tr"), td = el("td"); var tag = el("span", "k-" + l.type); tag.appendChild(el("i", "shape")); td.appendChild(tag); td.appendChild(document.createTextNode(" " + l.text)); tr.appendChild(td);
      [l.cost.fees, l.cost.fx, l.cost.partner, l.cost.tax].forEach(function (v) { tr.appendChild(el("td", "n", v ? R.money(v) : "")); });
      tr.appendChild(el("td", "n", shortTime(l.minutes.typ) + (l.wait ? " (incl. " + shortTime(l.wait) + " wait)" : "")));
      t.appendChild(tr);
    });
    var tot = el("tr"); tot.appendChild(el("td", "", "Total"));
    [r.totals.cost.fees, r.totals.cost.fx, r.totals.cost.partner, r.totals.cost.tax].forEach(function (v) { var td = el("td", "n", v ? R.money(v) : ""); td.style.fontWeight = "700"; tot.appendChild(td); });
    var tt = el("td", "n", shortTime(r.totals.minutes.typ)); tt.style.fontWeight = "700"; tot.appendChild(tt);
    t.appendChild(tot); wrap.appendChild(t); return wrap;
  }
  function renderRoutes(plan) {
    var box = $("routes"); box.textContent = "";
    var ex = $("excluded"); ex.textContent = "";
    if (plan.noRoute) { var p = el("p", "headline", plan.reason); box.appendChild(p); return; }
    var maxUsd = Math.max.apply(null, plan.routes.map(function (r) { return r.totals.usd; }));
    var maxTyp = Math.max.apply(null, plan.routes.map(function (r) { return r.totals.minutes.typ; }));
    var maxWorst = Math.max.apply(null, plan.routes.map(function (r) { return r.totals.minutes.worst; }));
    plan.routes.forEach(function (r, i) {
      var card = el("article", "route"); card.dataset.sel = String(i === state.sel); card.id = "route-" + i;
      var head = el("div", "route-head"), h4 = el("h4");
      h4.appendChild(el("span", "rank", i === 0 ? "Best" : "#" + (i + 1))); h4.appendChild(document.createTextNode(routeTitle(r)));
      head.appendChild(h4);
      var pick = el("button", "pick", i === state.sel ? "Showing its checks and rules" : "Show its checks and rules"); pick.type = "button"; pick.setAttribute("aria-pressed", String(i === state.sel));
      pick.addEventListener("click", function () { state.sel = i; refresh(); });
      head.appendChild(pick); card.appendChild(head);
      card.appendChild(buildChain(r));
      var ms = el("div", "measures");
      var m1 = el("div", "measure"), h5 = el("h5", "", "Cost "); h5.appendChild(el("span", "", R.money(r.totals.usd) + " (" + pct(r.totals.pct) + " percent)"));
      m1.appendChild(h5); m1.appendChild(stackBar(r, legTotal, function (v) { return v / maxUsd * 100; }, "Cost by move, " + R.money(r.totals.usd) + " in total"));
      ms.appendChild(m1);
      var m2 = el("div", "measure"), h5b = el("h5", "", "Time "); h5b.appendChild(el("span", "", "typical " + R.minutesText(r.totals.minutes.typ)));
      m2.appendChild(h5b); m2.appendChild(stackBar(r, function (l) { return l.minutes.typ; }, function (v) { return Math.sqrt(v) / Math.sqrt(maxTyp) * 100; }, "Typical time by move"));
      m2.appendChild(rangeBar(r, maxWorst));
      m2.appendChild(el("div", "scale-note", "Top bar: typical time by move. Thin bar: best to worst case, the black mark is typical. Square root scale, so fast and slow routes fit together."));
      ms.appendChild(m2); card.appendChild(ms);
      if (r.tips.length) {
        var t = r.tips[0];
        card.appendChild(el("p", "tips", "A quicker " + (t.type === "payin" ? "way to pay in" : "way to pay out") + ": " + short(t.scheme) + ". About " + R.money(Math.max(0, t.extra)) + (t.extra < 0 ? " less" : " more") + " and " + R.minutesText(t.saved).replace("about ", "about ") + " sooner."));
      }
      var d = el("details"), s = el("summary", "", "Move by move"); d.appendChild(s); d.appendChild(legTable(r)); card.appendChild(d);
      box.appendChild(card);
    });
    if (plan.excluded.length) {
      ex.textContent = "Left out: " + plan.excluded.map(function (e) { return short(e.name) + " (" + e.why + ")"; }).join("; ") + ".";
    }
  }

  // ---------- what would change the answer ----------
  function vsBars(now, next, labelNow, labelNext) {
    var max = Math.max(now, next), d = el("div", "vs-bars");
    [["Now", now, "", labelNow], ["With it", next, " new", labelNext]].forEach(function (x) {
      var row = el("div"); row.appendChild(el("span", "", x[0]));
      var t = el("span", "t"), f = el("span", "f" + x[2]); f.style.width = (x[1] / max * 100) + "%"; t.appendChild(f); row.appendChild(t);
      row.appendChild(el("b", "", x[3])); d.appendChild(row);
    });
    return d;
  }
  function renderAcquire(plan) {
    var box = $("acquire"); box.textContent = "";
    if (!plan.acquire.length) { box.appendChild(el("p", "acq-none", "Nothing you could add would improve this route by much. You already have the access that matters here.")); return; }
    var base = plan.routes[0] || null;
    plan.acquire.forEach(function (a) {
      var c = el("div", "acq"), h = el("h4", "", a.name + " (" + a.ccy + ") "); h.appendChild(el("small", "", "now: " + MODE_WORD[a.options[0].from])); c.appendChild(h);
      a.options.forEach(function (o) {
        var d = el("div", "opt");
        d.appendChild(el("div", "what", o.to === "partner" ? "Add a local partner" : "Get direct access"));
        if (base) {
          d.appendChild(el("div", "when-lead", "Saves " + R.money(Math.max(0, o.saveUsd)) + " and arrives " + (o.minutesSaved > 1 ? R.minutesText(o.minutesSaved).replace("about ", "about ") + " sooner" : "about as fast") + "."));
          d.appendChild(vsBars(base.totals.pct, o.route.totals.pct, pct(base.totals.pct) + "%", pct(o.route.totals.pct) + "%"));
        } else {
          d.appendChild(el("div", "when-lead", "Opens a first route: " + R.money(o.route.totals.usd) + ", arriving " + R.minutesText(o.route.totals.minutes.typ) + "."));
        }
        d.appendChild(el("div", "need", o.note));
        d.appendChild(el("div", "when-lead", "Rough lead time: " + o.months[0] + " to " + o.months[1] + " months."));
        c.appendChild(d);
      });
      box.appendChild(c);
    });
  }

  // ---------- corridor heat map ----------
  var mxCache = { key: "", data: null };
  var COST_BINS = [[0.5, "under 0.5%"], [1, "0.5 to 1%"], [2, "1 to 2%"], [4, "2 to 4%"], [Infinity, "4% and up"]];
  var TIME_BINS = [[5, "under 5 min"], [60, "5 min to 1 h"], [360, "1 to 6 h"], [1440, "6 to 24 h"], [Infinity, "a day or more"]];
  function bin(bins, v) { for (var i = 0; i < bins.length; i++) if (v < bins[i][0]) return i + 1; return bins.length; }
  function matrixData() {
    var req = request(), modes = state.mxAll ? R.presetModes("bank") : req.modes, key = JSON.stringify([req.amount, req.priority, req.when, modes]);
    if (mxCache.key !== key) { mxCache.key = key; mxCache.data = R.matrix({ from: req.from, to: req.to, amount: req.amount, priority: req.priority, when: req.when, modes: modes }); }
    return mxCache.data;
  }
  function renderMatrixView() {
    var m = matrixData(), tb = $("matrix"); tb.textContent = "";
    var bins = state.metric === "cost" ? COST_BINS : TIME_BINS;
    var lg = $("ramp-legend"); lg.textContent = "";
    lg.appendChild(document.createTextNode(state.metric === "cost" ? "Cost: " : "Time: "));
    bins.forEach(function (b, i) { lg.appendChild(el("i", "r" + (i + 1), b[1])); });
    if (!state.mxAll) lg.appendChild(el("i", "na", "no account to collect from"));
    var head = el("tr"), corner = el("th", "corner", "From / To"); head.appendChild(corner);
    m.ids.forEach(function (id) { var th = el("th", id === state.to ? "on" : "", JB[id].ccy); th.title = placeName(id); th.scope = "col"; head.appendChild(th); });
    tb.appendChild(head);
    m.ids.forEach(function (from) {
      var tr = el("tr"), th = el("th", "row" + (from === state.from ? " on" : ""), JB[from].ccy); th.title = placeName(from); th.scope = "row"; tr.appendChild(th);
      m.ids.forEach(function (to) {
        var c = m.cells[from + ">" + to], td = el("td", "mcell");
        if (c.same) { td.classList.add("same"); td.textContent = ""; }
        else if (!c.ok) { td.classList.add("na"); td.textContent = "×"; }
        else {
          var v = state.metric === "cost" ? c.pct : c.minutes;
          td.classList.add("r" + bin(bins, v));
          td.textContent = state.metric === "cost" ? (c.pct < 10 ? c.pct.toFixed(1) : String(Math.round(c.pct))) : cellTime(c.minutes);
        }
        if (!c.same) {
          td.tabIndex = 0; td.setAttribute("role", "button");
          td.setAttribute("aria-label", placeName(from) + " to " + placeName(to) + (c.ok ? ": " + pct(c.pct) + " percent, " + R.minutesText(c.minutes) : ": no account to collect " + JB[from].ccy));
          var go = function () { state.from = from; state.to = to; state.sel = 0; state.delivery = "bank"; refresh(); };
          td.addEventListener("click", go);
          td.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
          attachTip(td, function () {
            var lines = [placeName(from) + " to " + placeName(to)];
            if (!c.ok) { lines.push("You have no account to collect " + JB[from].ccy + "."); return lines; }
            lines.push(pct(c.pct) + " percent (" + R.money(c.usd) + "), " + R.minutesText(c.minutes));
            lines.push(c.holds.join(" to ") + ", then " + short(c.final));
            return lines;
          });
        }
        if (from === state.from && to === state.to) td.classList.add("picked");
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  }

  // ---------- transfer flow ----------
  function renderStages(plan) {
    var box = $("stages"), det = $("stage-detail"); box.textContent = ""; det.textContent = "";
    var route = plan.routes[state.sel] || plan.routes[0] || null;
    box.setAttribute("role", "list");
    C.STAGES.forEach(function (s) {
      var li = el("li", "stage"); li.setAttribute("role", "listitem");
      var b = el("button"); b.type = "button"; b.setAttribute("aria-pressed", String(s.n === state.stage));
      b.appendChild(el("span", "n", String(s.n))); b.appendChild(el("b", "", s.name));
      var cnt = el("span", "cnt");
      if (route) { var n = route.compliance.checks.filter(function (c) { return c.stage === s.n; }).length; if (n) cnt.appendChild(el("i", "", n + (n === 1 ? " check" : " checks"))); }
      b.appendChild(cnt);
      b.addEventListener("click", function () { state.stage = s.n; renderStages(plan); writeHash(); var nb = document.querySelector("#stages .stage:nth-child(" + s.n + ") button"); if (nb) nb.focus({ preventScroll: true }); });
      li.appendChild(b); box.appendChild(li);
    });
    var s = C.STAGES[state.stage - 1];
    var left = el("div"); left.appendChild(el("h4", "", s.n + ". " + s.name)); left.appendChild(el("p", "", s.does));
    left.appendChild(el("h5", "", "Inside this stage")); var ul = el("ul"); s.inside.forEach(function (t) { ul.appendChild(el("li", "", t)); }); left.appendChild(ul);
    left.appendChild(el("h5", "", "Speed and cost")); var u2 = el("ul"); u2.appendChild(el("li", "", "Speed: " + s.speed)); u2.appendChild(el("li", "", "Cost: " + s.cost)); left.appendChild(u2);
    left.appendChild(el("h5", "", "Build or buy")); left.appendChild(el("p", "stance", s.stance));
    det.appendChild(left);
    var right = el("div");
    right.appendChild(el("h5", "", "Blocks of the Core banking blueprint that do the work"));
    var bl = el("div", "blocks"); s.blocks.forEach(function (b) { bl.appendChild(el("span", "blk", b)); }); right.appendChild(bl);
    var lk = el("p", "hint"); var a = el("a", "", "Open the Core banking blueprint"); a.href = "../core-banking-blueprint/"; lk.appendChild(a); right.appendChild(lk);
    right.appendChild(el("h5", "", "What goes wrong")); right.appendChild(el("p", "fails", s.fails));
    if (route) {
      right.appendChild(el("h5", "", "For the route shown"));
      right.appendChild(el("p", "forroute", route.stages[s.n - 1]));
      var here = route.compliance.checks.filter(function (c) { return c.stage === s.n; });
      if (here.length) {
        right.appendChild(el("h5", "", "Checks that bite at this stage"));
        var ch = el("div", "chk"); here.forEach(function (c) { var d = el("div"); d.appendChild(el("b", "", c.name)); d.appendChild(document.createTextNode(c.detail)); ch.appendChild(d); }); right.appendChild(ch);
      }
    }
    det.appendChild(right);
  }

  // ---------- rules and checks ----------
  function renderRules(plan) {
    var box = $("rules"), chk = $("checks"); box.textContent = ""; chk.textContent = "";
    var r = plan.routes[state.sel] || plan.routes[0];
    if (!r) { box.appendChild(el("p", "acq-none", "Choose accounts that give a route to see its rules.")); return; }
    var c0 = el("div", "rule-card"); c0.appendChild(el("h4", "", "Applies to any cross-border transfer"));
    var dl0 = el("dl"); r.compliance.globalRegs.forEach(function (g) { dl0.appendChild(el("dt", "", g.name)); dl0.appendChild(el("dd", "", g.why)); }); c0.appendChild(dl0); box.appendChild(c0);
    var by = {}, order = [];
    r.compliance.regs.forEach(function (g) { if (!by[g.jur]) { by[g.jur] = []; order.push(g.jur); } by[g.jur].push(g); });
    [state.from, state.to].concat(order).filter(function (v, i, a) { return a.indexOf(v) === i && by[v]; }).forEach(function (id) {
      var role = id === state.from ? "sender's country" : id === state.to ? "receiver's country" : "currency clearing";
      var card = el("div", "rule-card"); card.appendChild(el("h4", "", by[id][0].jurName + " (" + role + ")"));
      var dl = el("dl"); by[id].forEach(function (g) { dl.appendChild(el("dt", "", g.name)); dl.appendChild(el("dd", "", g.why)); }); card.appendChild(dl); box.appendChild(card);
    });
    r.compliance.checks.slice().sort(function (a, b) { return a.stage - b.stage; }).forEach(function (c) {
      var d = el("div", "check"); d.appendChild(el("span", "st", String(c.stage)));
      var t = el("b", "", c.name); t.appendChild(el("span", "stagelab", "stage " + c.stage + ", " + C.STAGES[c.stage - 1].name)); d.appendChild(t);
      var body = el("div"); body.appendChild(el("div", "why", c.plain)); body.appendChild(el("div", "detail", c.detail)); d.appendChild(body);
      chk.appendChild(d);
    });
  }

  // ---------- reference ----------
  function renderDirectory() {
    var box = $("directory"); box.textContent = "";
    $("dir-hint").textContent = B.META.count + " banks are listed. " + B.META.withBic + " carry a public bank code taken from the open registry (" + B.META.registry + "). The rest are curated names with no code. This is a demonstration list: not complete, possibly out of date, and no endorsement.";
    var TIER = { 1: "deep market", 2: "mid sized market", 3: "thin market" }, CTRL = ["no currency controls", "some currency controls", "strong currency controls"];
    R.directory().forEach(function (d) {
      var j = d.jur, det = el("details", "cur"); det.dataset.id = j.id;
      var s = el("summary", "", j.ccy + " " + j.ccyName + " "); s.appendChild(el("small", "", j.short || j.name)); det.appendChild(s);
      var body = el("div", "cur-body");
      body.appendChild(el("p", "hint", TIER[j.tier] + ", " + CTRL[j.control] + "."));
      body.appendChild(el("h5", "", "Settles at"));
      var sb = el("div", "banks"); d.settlement.forEach(function (b) { sb.appendChild(bankChip(b)); }); body.appendChild(sb);
      body.appendChild(el("h5", "", "Custodian banks"));
      var cb = el("div", "banks"); d.custodians.forEach(function (b) { cb.appendChild(bankChip(b)); }); body.appendChild(cb);
      body.appendChild(el("h5", "", "Local clearing schemes"));
      var sc = el("div", "schemes");
      d.schemes.forEach(function (x) {
        var r = el("div", "scheme"), t = el("b"); t.appendChild(el("span", "kindtag", x.kind)); t.appendChild(document.createTextNode(x.name)); r.appendChild(t);
        r.appendChild(el("span", "meta", x.operator + ". " + (x.hours === "24x7" ? "Open all hours." : "Business days.") + " Typical " + shortTime(x.speed.typ) + ", about " + R.money(x.fixed) + " per payment" + (x.limit ? ", cap about " + R.money(x.limit) : "") + (x.min ? ", minimum about " + R.money(x.min) : "") + "."));
        r.appendChild(el("span", "meta", "Access: " + x.access + (x.check ? " Receiver check: " + x.check + "." : "") + (x.note ? " " + x.note : "")));
        sc.appendChild(r);
      });
      body.appendChild(sc);
      body.appendChild(el("h5", "", "To reach it"));
      var ul = el("ul"); ul.appendChild(el("li", "", "Through a partner: " + d.access[0])); ul.appendChild(el("li", "", "Directly: " + d.access[1])); ul.style.margin = "0"; ul.style.paddingLeft = "20px"; body.appendChild(ul);
      det.appendChild(body); box.appendChild(det);
    });
    markDirectory();
  }
  function bankChip(b) {
    var c = el("span", "bank" + (b.source === "registry" ? " reg" : ""), b.name);
    c.title = b.source === "registry" ? "Bank code from the open registry" : "Curated name, no code";
    if (b.bic) c.appendChild(el("small", "", b.bic));
    c.appendChild(el("small", "", b.country));
    return c;
  }
  function markDirectory() {
    var ids = [JB[state.from].ccy, JB[state.to].ccy];
    Array.prototype.forEach.call(document.querySelectorAll("details.cur"), function (d) {
      var ccy = R.JUR[d.dataset.id].ccy, on = ids.indexOf(ccy) >= 0;
      d.dataset.focus = String(on);
    });
  }
  function buildNotes() {
    var n = $("notes");
    C.NOTES.forEach(function (x) { var d = el("details", "note"); d.appendChild(el("summary", "", x.title)); d.appendChild(el("p", "", x.text)); n.appendChild(d); });
    var g = $("glossary");
    C.GLOSSARY.forEach(function (x) { var d = el("div"); d.appendChild(el("dt", "", x[0])); d.appendChild(el("dd", "", x[1])); g.appendChild(d); });
  }

  // ---------- plain text ----------
  function renderExport(plan) {
    var lines = [], R0 = plan.request;
    lines.push("Payment route: " + placeName(R0.from) + " to " + placeName(R0.to) + ", " + amtText(R0.amount) + ", " + C.MODEL.priorities[R0.priority].name.toLowerCase() + ", sent on a " + WHENS.filter(function (w) { return w[0] === R0.when; })[0][1].toLowerCase() + ".");
    var r = plan.routes[state.sel] || plan.routes[0];
    if (!r) { lines.push(plan.reason); $("export").value = lines.join("\n"); return; }
    lines.push("");
    lines.push("Route: " + routeTitle(r) + ".");
    lines.push("About " + R.money(r.totals.usd) + " (" + pct(r.totals.pct) + " percent), typical arrival " + R.minutesText(r.totals.minutes.typ) + ", best " + R.minutesText(r.totals.minutes.best) + ", worst " + R.minutesText(r.totals.minutes.worst) + ".");
    lines.push(""); lines.push("Moves:");
    r.legs.forEach(function (l, i) { lines.push((i + 1) + ". " + l.text + ": " + R.money(legTotal(l)) + ", " + R.minutesText(l.minutes.typ) + "."); });
    lines.push(""); lines.push("Accounts used: " + r.nodes.filter(function (n) { return n.kind === "hold"; }).map(function (n) { return n.ccy + " at " + n.bank + " (" + MODE_WORD[n.mode] + ")"; }).join("; ") + ".");
    lines.push(""); lines.push("Compliance checks:");
    r.compliance.checks.forEach(function (c) { lines.push("- " + c.name + ": " + c.detail); });
    lines.push(""); lines.push("Rules to read:");
    r.compliance.globalRegs.concat(r.compliance.regs).forEach(function (g) { lines.push("- " + g.name); });
    lines.push(""); lines.push("Illustrative numbers from the Payment route planner. Not quotes. Check current rules before relying on any of this.");
    $("export").value = lines.join("\n");
  }

  // ---------- refresh ----------
  var lastPlan = null;
  function refresh() {
    syncControls();
    var plan = R.plan(request()); lastPlan = plan;
    if (state.sel >= plan.routes.length) state.sel = 0;
    renderSummary(plan); renderRoutes(plan); renderAcquire(plan); renderMatrixView(); renderStages(plan); renderRules(plan); renderExport(plan); markDirectory();
    writeHash();
  }

  $("copy").addEventListener("click", function () {
    var ta = $("export"), st = $("copy-status");
    function done(ok) { st.textContent = ok ? "Copied." : "Select the text and copy it."; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(function () { done(true); }, function () { ta.select(); done(false); });
    else { ta.select(); try { done(document.execCommand("copy")); } catch (e) { done(false); } }
  });

  readHash();
  buildControls();
  buildLegend();
  buildNotes();
  renderDirectory();
  refresh();
  window.addEventListener("hashchange", function () { readHash(); refresh(); });
})();
