(function () {
  "use strict";
  var C = Catalog, P = Planner;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function signed(n) { return (n > 0 ? "+" : "") + n; }

  var state = { wants: [], team: "small", time: "mid", volume: "mid", partner: false, edge: [], preset: "", sort: "phase" };
  var openRows = {};
  var sel = null;
  var lastPlan = null;
  var WANT = P.wantable();
  var SORTS = { phase: 1, verdict: 1, apart: 1, legal: 1 };
  var SEGS = {
    team: [["none", "None or tiny"], ["small", "Small"], ["strong", "Strong"]],
    time: [["short", "Under 6 months"], ["mid", "6 to 18 months"], ["long", "Over 18 months"]],
    volume: [["small", "Small"], ["mid", "Medium"], ["large", "Large"]]
  };
  var PHASES = { 1: "Phase 1: foundation. Hard to change later, so get these right first.", 2: "Phase 2: products and operations. What makes it a working firm.", 3: "Phase 3: specialist. Valuable, and built on a working foundation." };

  // ---------- shareable state in the address ----------
  function readHash() {
    var h = (location.hash || "").replace(/^#/, "");
    if (!h) return;
    var q = {};
    h.split("&").forEach(function (kv) { var p = kv.split("="); q[p[0]] = decodeURIComponent(p[1] || ""); });
    if (q.w !== undefined) state.wants = q.w.split(",").filter(function (id) { return WANT[id]; });
    if (P.TEAM[q.team]) state.team = q.team;
    if (P.TIME[q.time]) state.time = q.time;
    if (P.VOLUME[q.vol]) state.volume = q.vol;
    state.partner = q.p === "1";
    if (q.e) state.edge = q.e.split(",").filter(function (id) { return P.BY_ID[id]; }).slice(0, P.MAX_EDGE);
    if (q.s) state.preset = q.s;
    if (SORTS[q.o]) state.sort = q.o;
  }
  function writeHash() {
    var h = "w=" + state.wants.join(",") + "&team=" + state.team + "&time=" + state.time + "&vol=" + state.volume +
      "&p=" + (state.partner ? 1 : 0) + "&e=" + state.edge.join(",") + "&s=" + state.preset + "&o=" + state.sort;
    try { history.replaceState(null, "", "#" + h); } catch (e) { /* the page still works without it */ }
  }

  // ---------- tooltip: one element, reused. Text only, never markup. ----------
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
  }

  // ---------- controls ----------
  function buildControls() {
    var pr = $("presets");
    P.PRESETS.forEach(function (p) {
      var b = el("button", "preset", p.label); b.type = "button"; b.dataset.id = p.id;
      b.addEventListener("click", function () {
        state.wants = p.wants.slice(); state.partner = p.partner; state.preset = p.id; state.edge = []; refresh();
      });
      pr.appendChild(b);
    });
    var clear = el("button", "preset", "Clear all"); clear.type = "button";
    clear.addEventListener("click", function () { state.wants = []; state.preset = ""; state.edge = []; refresh(); });
    pr.appendChild(clear);

    var wants = $("wants");
    C.WANT_GROUPS.forEach(function (g) {
      wants.appendChild(el("div", "ctl-label", g.name));
      var tiles = el("div", "tiles");
      g.ids.forEach(function (id) {
        var c = P.BY_ID[id];
        var t = el("button", "tile", c.short); t.type = "button"; t.dataset.id = id; t.title = c.plain;
        t.setAttribute("aria-pressed", "false");
        t.addEventListener("click", function () {
          var i = state.wants.indexOf(id);
          if (i >= 0) state.wants.splice(i, 1); else state.wants.push(id);
          state.preset = ""; refresh();
        });
        tiles.appendChild(t);
      });
      wants.appendChild(tiles);
    });

    var sit = $("situation");
    [["team", "Engineering capacity"], ["time", "Time to launch"], ["volume", "Expected volumes"]].forEach(function (d) {
      sit.appendChild(el("div", "ctl-label", d[1]));
      var seg = el("div", "seg"); seg.setAttribute("role", "radiogroup"); seg.setAttribute("aria-label", d[1]);
      SEGS[d[0]].forEach(function (o) {
        var lab = el("label"); var inp = el("input"); inp.type = "radio"; inp.name = d[0]; inp.value = o[0];
        inp.addEventListener("change", function () { state[d[0]] = o[0]; refresh(); });
        lab.appendChild(inp); lab.appendChild(el("span", "", o[1])); seg.appendChild(lab);
      });
      sit.appendChild(seg);
    });
    sit.appendChild(el("div", "ctl-label", "Licence"));
    var pt = el("button", "tile wide", "We rely on a partner bank's licence"); pt.type = "button"; pt.id = "partner-tile";
    pt.title = "Banking as a service. Blocks a partner would normally supply are marked Partner.";
    pt.addEventListener("click", function () { state.partner = !state.partner; state.preset = ""; refresh(); });
    sit.appendChild(pt);

    var rl = $("ramp-legend"); rl.appendChild(document.createTextNode("Rating: "));
    for (var r = 0; r <= 5; r++) { var sw = el("i", "cell r" + r, String(r)); sw.style.cssText = "border:0"; rl.appendChild(sw); }
    rl.appendChild(document.createTextNode(" Effort: "));
    var eff = el("span", "eff"); for (var k = 0; k < 4; k++) eff.appendChild(el("i", "on")); rl.appendChild(eff);
    rl.appendChild(document.createTextNode("small to extra large"));

    $("sort").addEventListener("change", function (e) { state.sort = e.target.value; refresh(); });
  }

  function syncControls() {
    document.querySelectorAll("#wants .tile").forEach(function (t) { t.setAttribute("aria-pressed", String(state.wants.indexOf(t.dataset.id) >= 0)); });
    document.querySelectorAll("#situation input[type=radio]").forEach(function (i) { i.checked = state[i.name] === i.value; });
    $("partner-tile").setAttribute("aria-pressed", String(state.partner));
    document.querySelectorAll("#presets .preset").forEach(function (b) { if (b.dataset.id) b.setAttribute("aria-pressed", String(b.dataset.id === state.preset)); });
    var p = P.PRESETS.filter(function (x) { return x.id === state.preset; })[0];
    $("preset-note").textContent = p ? p.note : "Pick a starting point, then add or remove tiles.";
    $("sort").value = state.sort;
  }

  // ---------- shared bits ----------
  function badge(rec) {
    var b = el("span", "badge rec-" + rec); b.appendChild(el("i", "shape")); b.appendChild(document.createTextNode(P.REC_LABEL[rec]));
    return b;
  }
  function shapeOnly(rec) { var s = el("span", "badge rec-" + rec); s.appendChild(el("i", "shape")); return s; }
  function list(items) { var u = el("ul"); items.forEach(function (t) { u.appendChild(el("li", "", t)); }); return u; }

  // ---------- summary: headline, verdict bar, phase bars ----------
  function renderSummary(plan) {
    var empty = !state.wants.length;
    var c = plan.counts;
    $("headline").textContent = empty
      ? "Pick a starting point or select what you want to offer. The foundation every system needs is always included."
      : "You chose " + plan.chosenCount + ". Together they need " + plan.totalCount + " building blocks. " +
        (plan.edge.length ? "You said you compete on " + plan.edge.map(function (id) { return P.BY_ID[id].short.toLowerCase(); }).join(", ") + "." : "");
    $("kpi-total").textContent = plan.totalCount;
    $("kpi-chosen").textContent = empty ? "all foundation" : plan.chosenCount + " chosen, " + (plan.totalCount - plan.chosenCount) + " pulled in";

    var bar = $("verdict-bar"); bar.textContent = "";
    var parts = ["buy", "hybrid", "build", "partner"].filter(function (r) { return c[r] > 0; });
    bar.setAttribute("aria-label", parts.map(function (r) { return c[r] + " " + P.REC_LABEL[r]; }).join(", "));
    parts.forEach(function (r) {
      var s = el("div", "seg-bar " + r, String(c[r]));
      s.style.flex = c[r] + " 1 0";
      attachTip(s, function () { return [c[r] + " " + P.REC_LABEL[r].toLowerCase(), P.REC_MEANING[r]]; });
      bar.appendChild(s);
    });
    var lg = $("verdict-legend"); lg.textContent = "";
    ["buy", "hybrid", "build", "partner"].forEach(function (r) {
      if (r === "partner" && !c[r]) return;
      var li = el("li"); li.appendChild(badge(r)); li.appendChild(document.createTextNode(" " + c[r])); lg.appendChild(li);
    });

    var pb = $("phase-bars"); pb.textContent = "";
    var sums = P.phaseSummary(plan); var max = Math.max.apply(null, sums.map(function (s) { return s.effort; })) || 1;
    sums.forEach(function (s) {
      var row = el("div", "pbar");
      row.appendChild(el("span", "", "Phase " + s.phase));
      var tr = el("div", "track"); var f = el("div", "fill"); f.style.width = (s.effort / max * 100) + "%"; tr.appendChild(f); row.appendChild(tr);
      row.appendChild(el("span", "val", s.count + " block" + (s.count === 1 ? "" : "s")));
      attachTip(row, function () { return ["Phase " + s.phase + ": " + s.count + " blocks", PHASES[s.phase].split(". ")[1] || ""]; });
      pb.appendChild(row);
    });
  }

  // ---------- the stack, with its connecting lines ----------
  var SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs) { var e = document.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }

  function buildEdgeLegend() {
    var lg = $("edge-legend");
    function sample(cls, dash, text) {
      var s = el("span"); var v = svgEl("svg", { width: 44, height: 12, "aria-hidden": "true" });
      v.appendChild(svgEl("line", { x1: 2, y1: 6, x2: 36, y2: 6, stroke: "currentColor", "stroke-width": 2.6, "stroke-dasharray": dash || "" }));
      v.appendChild(svgEl("circle", { cx: 38, cy: 6, r: 4, fill: "currentColor" }));
      s.appendChild(v); s.appendChild(document.createTextNode(text)); lg.appendChild(s);
    }
    sample("out", "", "Solid: what the selected block needs");
    sample("inn", "6 5", "Dashed: what needs it");
    lg.appendChild(el("span", "", "The dot sits on the block being relied on."));
  }

  function select(id) { sel = sel === id ? null : id; renderMap(lastPlan); var b = document.querySelector('#map [data-id="' + id + '"]'); if (b) b.focus({ preventScroll: true }); }

  function renderMap(plan) {
    lastPlan = plan;
    var by = {}; plan.items.forEach(function (i) { by[i.id] = i; });
    if (sel && !by[sel]) sel = null;
    var lk = P.links(plan);
    var related = {};
    if (sel) {
      related[sel] = true;
      lk.edges.forEach(function (e) { if (e.from === sel) related[e.to] = true; if (e.to === sel) related[e.from] = true; });
    }
    var map = $("map"); map.textContent = "";
    var svg = svgEl("svg", { class: "edges", "aria-hidden": "true" }); map.appendChild(svg);
    C.LAYERS.forEach(function (layer) {
      var row = el("div", "layer"); row.appendChild(el("h4", "", layer.name));
      var chips = el("div", "chips");
      C.COMPONENTS.filter(function (c) { return c.layer === layer.id; }).forEach(function (c) {
        var it = by[c.id];
        if (!it) { var off = el("span", "chip off", c.short); off.title = "Not needed for your choices"; chips.appendChild(off); return; }
        var b = el("button", "chip rec-" + it.rec + (it.state === "chosen" ? " chosen" : "") + (sel && !related[c.id] ? " dim" : "") + (sel === c.id ? " picked" : "")); b.type = "button";
        b.dataset.id = c.id; b.setAttribute("aria-pressed", String(sel === c.id));
        b.appendChild(shapeOnly(it.rec)); b.appendChild(document.createTextNode(c.short));
        if (state.edge.indexOf(c.id) >= 0) b.appendChild(el("i", "edge-mark"));
        b.setAttribute("aria-label", c.name + ": " + P.REC_LABEL[it.rec] + (it.state === "chosen" ? ", chosen by you" : ", needed by another block"));
        attachTip(b, function () { return [c.short + ": " + P.REC_LABEL[it.rec], it.state === "chosen" ? "You chose this" : (it.state === "always" ? "Always needed" : "Needed by " + it.because.length + " other block" + (it.because.length === 1 ? "" : "s"))]; });
        b.addEventListener("click", function () { select(c.id); });
        chips.appendChild(b);
      });
      row.appendChild(chips); map.appendChild(row);
    });
    renderSel(plan, by, lk);
    requestAnimationFrame(function () { drawEdges(lk); });
  }

  function drawEdges(lk) {
    var map = $("map"), svg = map.querySelector("svg.edges");
    if (!svg || !lastPlan) return;
    svg.textContent = "";
    var mr = map.getBoundingClientRect();
    svg.setAttribute("viewBox", "0 0 " + mr.width + " " + mr.height);
    var box = {};
    map.querySelectorAll("button.chip[data-id]").forEach(function (n) {
      var r = n.getBoundingClientRect(); box[n.dataset.id] = { x: r.left - mr.left + r.width / 2, top: r.top - mr.top, bottom: r.bottom - mr.top, cy: r.top - mr.top + r.height / 2 };
    });
    lk.edges.forEach(function (e) {
      var a = box[e.from], b = box[e.to]; if (!a || !b) return;
      var cls = !sel ? "" : (e.from === sel ? " out" : (e.to === sel ? " inn" : " dim"));
      var d, ex, ey;
      if (Math.abs(b.cy - a.cy) < 10) {
        d = "M" + a.x + " " + a.bottom + " C" + a.x + " " + (a.bottom + 22) + " " + b.x + " " + (b.bottom + 22) + " " + b.x + " " + b.bottom; ex = b.x; ey = b.bottom;
      } else if (b.cy > a.cy) {
        var m = (a.bottom + b.top) / 2; d = "M" + a.x + " " + a.bottom + " C" + a.x + " " + m + " " + b.x + " " + m + " " + b.x + " " + b.top; ex = b.x; ey = b.top;
      } else {
        var m2 = (a.top + b.bottom) / 2; d = "M" + a.x + " " + a.top + " C" + a.x + " " + m2 + " " + b.x + " " + m2 + " " + b.x + " " + b.bottom; ex = b.x; ey = b.bottom;
      }
      svg.appendChild(svgEl("path", { class: "edge" + cls, d: d }));
      svg.appendChild(svgEl("circle", { class: "edge-dot" + cls, cx: ex, cy: ey, r: 3.5 }));
    });
  }

  function renderSel(plan, by, lk) {
    var host = $("sel"); host.textContent = "";
    if (!sel) { host.appendChild(el("p", "none", "Select a block above to see what it needs and what needs it.")); return; }
    var it = by[sel], c = it.component;
    var h = el("h4"); h.appendChild(badge(it.rec)); h.appendChild(document.createTextNode(c.name)); host.appendChild(h);
    host.appendChild(el("p", "", c.plain));
    function line(label, ids, none) {
      var r = el("div", "rowline"); r.appendChild(el("span", "k", label));
      if (!ids.length) r.appendChild(el("span", "none", none));
      ids.forEach(function (id) {
        var x = by[id]; var b = el("button", "chip rec-" + x.rec); b.type = "button"; b.appendChild(shapeOnly(x.rec)); b.appendChild(document.createTextNode(P.BY_ID[id].short));
        b.addEventListener("click", function () { sel = id; renderMap(lastPlan); }); r.appendChild(b);
      });
      host.appendChild(r);
    }
    line("Needs", c.depends.filter(function (d) { return by[d]; }), "Nothing else in the plan.");
    line("Needed by", lk.neededBy[sel] || [], "Nothing else in the plan.");
    var n = P.rests(sel).length;
    host.appendChild(el("p", "none", n ? "It ultimately rests on " + n + " other block" + (n === 1 ? "" : "s") + "." : "It rests on no other block."));
    var ob = el("button", "open-btn", "Read the detail and the reasons"); ob.type = "button";
    ob.addEventListener("click", function () { openRow(sel); }); host.appendChild(ob);
  }

  // ---------- heat map ----------
  function sorted(plan) {
    var items = plan.items.slice();
    if (state.sort === "verdict") items.sort(function (a, b) { return b.total - a.total || a.component.order - b.component.order; });
    if (state.sort === "apart") items.sort(function (a, b) { return b.component.diff - a.component.diff || a.total - b.total; });
    if (state.sort === "legal") items.sort(function (a, b) { return b.component.reg - a.component.reg || a.component.order - b.component.order; });
    return items;
  }

  function ratingCell(value, label, name) {
    var td = el("td", "cell c r" + value, String(value));
    td.setAttribute("aria-label", label + ": " + value + " of 5");
    attachTip(td, function () { return [value + " of 5", name + ": " + label]; });
    return td;
  }

  function meter(it) {
    var m = el("div", "meter");
    var span = P.METER_MAX - P.METER_MIN;
    [["build", P.METER_MIN, P.HYBRID_AT], ["hybrid", P.HYBRID_AT, P.BUY_AT], ["buy", P.BUY_AT, P.METER_MAX]].forEach(function (z) {
      var d = el("i", "z " + z[0]); d.style.left = ((z[1] - P.METER_MIN) / span * 100) + "%"; d.style.width = ((z[2] - z[1]) / span * 100) + "%"; m.appendChild(d);
    });
    var mk = el("i", "mk rec-" + it.rec); mk.style.left = (P.meterPos(it.total) * 100) + "%"; m.appendChild(mk);
    return m;
  }

  function renderHeat(plan) {
    var t = $("heat"); t.textContent = "";
    var cap = el("caption", "sr-only", "Each building block with its ratings for how standard it is, how likely it is to set you apart, its legal burden, its effort and the verdict."); t.appendChild(cap);
    var thead = el("thead"), hr = el("tr");
    [["Building block", ""], ["Standard", "c"], ["Sets you apart", "c"], ["Legal burden", "c"], ["Effort", "hide-sm"], ["Verdict", ""]].forEach(function (h) {
      var th = el("th", h[1], h[0]); th.scope = "col"; hr.appendChild(th);
    });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = el("tbody"); t.appendChild(tb);
    var grouped = state.sort === "phase", lastPhase = 0;
    sorted(plan).forEach(function (it) {
      var c = it.component;
      if (grouped && c.phase !== lastPhase) {
        lastPhase = c.phase;
        var pr = el("tr", "phase-row"), pc = el("td", "", PHASES[c.phase]); pc.colSpan = 6; pr.appendChild(pc); tb.appendChild(pr);
      }
      var tr = el("tr", "row"); tr.id = "row-" + c.id; tr.dataset.open = String(!!openRows[c.id]);
      var nameTd = el("td", "name");
      var btn = el("button", "rowbtn rec-" + it.rec); btn.type = "button"; btn.setAttribute("aria-expanded", String(!!openRows[c.id]));
      btn.appendChild(shapeOnly(it.rec));
      var lab = el("span"); lab.appendChild(document.createTextNode(c.short));
      if (state.edge.indexOf(c.id) >= 0) { lab.appendChild(document.createTextNode(" ")); lab.appendChild(el("i", "edge-mark")); }
      var sub = it.state === "chosen" ? "You chose this" : (it.state === "always" ? "Always needed" : "Needed by " + it.becauseIds.slice(0, 2).map(function (x) { return P.BY_ID[x].short; }).join(", ") + (it.becauseIds.length > 2 ? " +" + (it.becauseIds.length - 2) : ""));
      lab.appendChild(el("span", "sub", state.sort === "phase" ? sub : "Phase " + c.phase + ". " + sub));
      btn.appendChild(lab);
      btn.addEventListener("click", function () { toggleRow(c.id); });
      btn.addEventListener("focus", function () { var r = btn.getBoundingClientRect(); showTip(r.right - 40, r.top - 20, [c.short + ": " + P.REC_LABEL[it.rec], "Standard " + c.commodity + ", sets you apart " + c.diff + ", legal burden " + c.reg + ", score " + signed(it.total)]); });
      btn.addEventListener("blur", hideTip);
      nameTd.appendChild(btn); tr.appendChild(nameTd);
      tr.appendChild(ratingCell(c.commodity, "Standard across the industry", c.short));
      tr.appendChild(ratingCell(c.diff, "Could set a firm apart", c.short));
      tr.appendChild(ratingCell(c.reg, "Legal and audit burden", c.short));
      var eff = el("td", "c hide-sm"); var ef = el("span", "eff");
      var n = { S: 1, M: 2, L: 3, XL: 4 }[c.effort];
      for (var k = 1; k <= 4; k++) ef.appendChild(el("i", k <= n ? "on" : ""));
      eff.appendChild(ef); eff.appendChild(document.createTextNode(c.effort)); eff.setAttribute("aria-label", "Effort " + c.effort); tr.appendChild(eff);
      var vc = el("td", "vcell"); var lbl = el("div", "lbl"); lbl.appendChild(badge(it.rec)); lbl.appendChild(el("span", "sc", "score " + signed(it.total)));
      vc.appendChild(lbl); vc.appendChild(meter(it));
      attachTip(vc, function () { return [P.REC_LABEL[it.rec] + ", score " + signed(it.total), it.rec === "partner" ? "Your partner supplies this. Without a partner it would score as " + P.REC_LABEL[it.scoreBand].toLowerCase() + "." : P.REC_MEANING[it.rec]]; });
      tr.appendChild(vc);
      tb.appendChild(tr);
      if (openRows[c.id]) {
        var dr = el("tr", "detail"), dc = el("td"); dc.colSpan = 6; dc.appendChild(detail(it)); dr.appendChild(dc); tb.appendChild(dr);
      }
    });
  }

  function detail(it) {
    var c = it.component, b = el("div", "body");
    b.appendChild(el("p", "lead", c.name + ". " + c.plain));
    b.appendChild(el("h4", "", "Why it matters")); b.appendChild(el("p", "", c.why));
    if (it.partnerNote) b.appendChild(el("p", "partner-note", it.partnerNote));
    var sc = el("div", "score"); sc.appendChild(el("h4", "", "How the recommendation came out"));
    var u = el("ul");
    it.parts.forEach(function (p) { var li = el("li"); li.appendChild(el("span", "", p.label)); li.appendChild(el("span", "delta", signed(p.delta))); u.appendChild(li); });
    sc.appendChild(u);
    sc.appendChild(el("div", "total", "Total " + signed(it.total) + ", which means " + P.REC_LABEL[it.scoreBand].toLowerCase() + ". " + P.REC_MEANING[it.scoreBand] + " (Buy at " + P.BUY_AT + " or more, hybrid from " + P.HYBRID_AT + ", build below.)"));
    b.appendChild(sc);
    var cols = el("div", "cols");
    var l = el("div"); l.appendChild(el("h4", "", "What it includes")); l.appendChild(list(c.includes));
    var r = el("div"); r.appendChild(el("h4", "", "Common options")); r.appendChild(list(c.options));
    if (c.examples.length) r.appendChild(el("p", "examples", "Names the author knows of, not recommendations: " + c.examples.join(", ") + "."));
    cols.appendChild(l); cols.appendChild(r); b.appendChild(cols);
    var cols2 = el("div", "cols");
    var l2 = el("div"); l2.appendChild(el("h4", "", "Common ways it goes wrong")); l2.appendChild(list(c.pitfalls));
    var r2 = el("div"); r2.appendChild(el("h4", "", "Ask every supplier")); r2.appendChild(list(c.ask));
    cols2.appendChild(l2); cols2.appendChild(r2); b.appendChild(cols2);
    if (c.depends.length) b.appendChild(el("p", "needs", "It needs: " + c.depends.map(function (x) { return P.BY_ID[x].short; }).join(", ") + "."));
    var on = state.edge.indexOf(c.id) >= 0;
    var eb = el("button", "edge-btn"); eb.type = "button"; eb.setAttribute("aria-pressed", String(on));
    eb.appendChild(el("i", "edge-mark")); eb.appendChild(document.createTextNode(on ? "This is where we compete (selected)" : "This is where we compete"));
    if (!on && state.edge.length >= P.MAX_EDGE) { eb.disabled = true; eb.title = "You can mark up to " + P.MAX_EDGE + ". Unmark one first."; }
    eb.addEventListener("click", function () {
      var i = state.edge.indexOf(c.id);
      if (i >= 0) state.edge.splice(i, 1); else if (state.edge.length < P.MAX_EDGE) state.edge.push(c.id);
      openRows[c.id] = true; refresh();
      var again = document.querySelector("#row-" + c.id + " + tr.detail .edge-btn"); if (again) again.focus({ preventScroll: true });
    });
    b.appendChild(eb);
    return b;
  }

  function toggleRow(id) { openRows[id] = !openRows[id]; refresh(); var b = document.querySelector("#row-" + id + " .rowbtn"); if (b) b.focus({ preventScroll: true }); }
  function openRow(id) {
    openRows[id] = true; refresh();
    var r = $("row-" + id); if (r) { r.scrollIntoView({ behavior: "smooth", block: "center" }); var b = r.querySelector(".rowbtn"); if (b) b.focus({ preventScroll: true }); }
  }

  // ---------- walk throughs ----------
  function renderFlows(plan) {
    var by = {}; plan.items.forEach(function (i) { by[i.id] = i; });
    var host = $("flows"); host.textContent = "";
    C.FLOWS.forEach(function (f) {
      var box = el("div", "flow"); box.appendChild(el("h4", "", f.title));
      var ol = el("ol", "steps");
      f.steps.forEach(function (s, i) {
        var it = by[s.block];
        var li = el("li", "step" + (it ? "" : " off") + (it ? " rec-" + it.rec : ""));
        li.appendChild(el("span", "n", String(i + 1)));
        li.appendChild(el("span", "t", s.text));
        var tag = el("span", "tag"); if (it) tag.appendChild(shapeOnly(it.rec));
        tag.appendChild(document.createTextNode(P.BY_ID[s.block].short + (it ? "" : " (not in plan)")));
        li.appendChild(tag); ol.appendChild(li);
      });
      box.appendChild(ol); host.appendChild(box);
    });
  }

  function refresh() {
    var ctx = { team: state.team, time: state.time, volume: state.volume, partner: state.partner, edge: state.edge };
    var plan = P.plan(state.wants, ctx);
    hideTip();
    syncControls(); renderSummary(plan); renderMap(plan); renderHeat(plan); renderFlows(plan);
    $("export").value = P.toText(plan, ctx, state.wants);
    writeHash();
  }

  // ---------- notes and glossary ----------
  function buildNotes() {
    var host = $("notes");
    C.NOTES.forEach(function (n) { var d = el("details", "note"); d.appendChild(el("summary", "", n.title)); d.appendChild(list(n.bullets)); host.appendChild(d); });
    var g = $("glossary");
    C.GLOSSARY.forEach(function (t) { var w = el("div"); w.appendChild(el("dt", "", t.term)); w.appendChild(el("dd", "", t.def)); g.appendChild(w); });
  }

  $("copy").addEventListener("click", function () {
    var t = $("export"), s = $("copy-status");
    function done(ok) { s.textContent = ok ? "Copied." : "Select the text and copy it by hand."; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(function () { done(true); }, function () { t.select(); done(false); });
      else { t.select(); done(document.execCommand("copy")); }
    } catch (e) { t.select(); done(false); }
  });
  window.addEventListener("scroll", hideTip, { passive: true });

  readHash();
  if (!location.hash && !state.wants.length) { var first = P.PRESETS[0]; state.wants = first.wants.slice(); state.partner = first.partner; state.preset = first.id; }
  buildControls(); buildEdgeLegend(); buildNotes(); refresh();
  var resizeTimer = null;
  window.addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { if (lastPlan) drawEdges(P.links(lastPlan)); }, 80); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (lastPlan) drawEdges(P.links(lastPlan)); });
})();
