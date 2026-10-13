(function () {
  "use strict";

  var D = globalThis.PLAYGROUND_DATA;
  var M = globalThis.RiskModel;
  var keys = D.factors.map(function (f) { return f.key; });
  var labelOf = {};
  D.factors.forEach(function (f) { labelOf[f.key] = f.label; });
  var N = D.customers.length;
  var NS = "http://www.w3.org/2000/svg";
  var BAND_NAME = { low: "Low", medium: "Medium", high: "High", blocked: "Blocked" };
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // The engine reports internal names such as crypto_exposure. Show plain words instead.
  function plainKeys(text) {
    keys.forEach(function (k) { text = text.replace(new RegExp("\\b" + k + "\\b", "g"), labelOf[k].toLowerCase()); });
    return text;
  }
  var LIST_NAMES = {
    pep_foreign: "foreign politically exposed person", pep_domestic: "domestic politically exposed person",
    adverse_media: "adverse media", sanctions: "sanctions"
  };
  function plainEvidence(text) {
    text = text.replace(/\b(pep_foreign|pep_domestic|adverse_media)\b/g, function (m) { return LIST_NAMES[m]; });
    return text.replace(/'([a-z_]+)'/g, function (m, x) { return "'" + x.replace(/_/g, " ") + "'"; });
  }
  function rulesAll(on) { var o = {}; M.RULES.forEach(function (r) { o[r.key] = on; }); return o; }
  function defaultRaw() {
    var o = {};
    D.factors.forEach(function (f) { o[f.key] = Math.round(f.defaultWeight * 100); });
    return o;
  }
  function rawFrom(values) {
    var o = {};
    keys.forEach(function (k) { o[k] = values[k]; });
    return o;
  }

  // ---------- settings and presets ----------

  var PRESETS = [
    { id: "default", label: "Default", make: function () { return base(); } },
    {
      id: "country", label: "Country-heavy",
      make: function () {
        return base({ raw: rawFrom({ geography: 50, screening: 20, product: 8, channel: 7, identity: 5, crypto_exposure: 5, customer_profile: 5 }) });
      }
    },
    {
      id: "watchlist", label: "Watchlist-heavy",
      make: function () {
        return base({ raw: rawFrom({ geography: 15, screening: 55, product: 6, channel: 6, identity: 8, crypto_exposure: 6, customer_profile: 4 }) });
      }
    },
    {
      id: "equal", label: "Equal weights",
      make: function () {
        return base({ raw: rawFrom({ geography: 1, screening: 1, product: 1, channel: 1, identity: 1, crypto_exposure: 1, customer_profile: 1 }) });
      }
    },
    { id: "norules", label: "Weighted score only", make: function () { return base({ rules: rulesAll(false) }); } }
  ];

  function base(over) {
    var s = {
      raw: defaultRaw(),
      medium: D.defaults.medium,
      high: D.defaults.high,
      elevatedFrom: D.defaults.elevatedFrom,
      rules: rulesAll(true)
    };
    if (over) for (var k in over) s[k] = over[k];
    return s;
  }

  var st = base();
  st.tab = "top";
  st.shown = 10;
  st.expanded = {};
  st.picked = null;

  function toSettings(state) {
    var nw = M.normaliseWeights(state.raw, keys);
    return {
      weights: nw.weights,
      fallback: nw.usedEqualFallback,
      medium: state.medium,
      high: state.high,
      elevatedFrom: state.elevatedFrom,
      mediumIfAtLeast: D.defaults.mediumIfAtLeast,
      highIfAtLeast: D.defaults.highIfAtLeast,
      maxMissingWeight: D.defaults.maxMissingWeight,
      requiredFactors: D.defaults.requiredFactors,
      rules: state.rules
    };
  }

  var defaultSettings = toSettings(base());
  var defaultByBandId = {};
  var defaultCounts = { low: 0, medium: 0, high: 0, blocked: 0 };
  D.customers.forEach(function (c) {
    var r = M.evaluate(c, defaultSettings, keys);
    defaultByBandId[c.id] = r.band;
    defaultCounts[r.band] += 1;
  });

  function sameAsPreset(preset) {
    var p = preset.make();
    var a = toSettings(st), b = toSettings(p);
    for (var i = 0; i < keys.length; i++) {
      if (Math.abs(a.weights[keys[i]] - b.weights[keys[i]]) > 1e-9) return false;
    }
    if (st.medium !== p.medium || st.high !== p.high || st.elevatedFrom !== p.elevatedFrom) return false;
    for (var j = 0; j < M.RULES.length; j++) {
      if (st.rules[M.RULES[j].key] !== p.rules[M.RULES[j].key]) return false;
    }
    return true;
  }

  function applyPreset(p) {
    var made = p.make();
    st.raw = made.raw; st.medium = made.medium; st.high = made.high;
    st.elevatedFrom = made.elevatedFrom; st.rules = made.rules;
    syncControls();
    schedule();
  }

  // ---------- link sharing through the address bar ----------

  function writeHash() {
    var w = keys.map(function (k) { return st.raw[k]; }).join(",");
    var r = M.RULES.map(function (x) { return st.rules[x.key] ? "1" : "0"; }).join("");
    var h = "w=" + w + "&m=" + st.medium + "&h=" + st.high + "&e=" + st.elevatedFrom + "&r=" + r;
    try { history.replaceState(null, "", "#" + h); } catch (e) { /* not available in some previews */ }
  }

  function readHash() {
    try {
      var h = location.hash.slice(1);
      if (!h) return;
      var p = {};
      h.split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) p[kv.slice(0, i)] = kv.slice(i + 1); });
      if (p.w) {
        var parts = p.w.split(",").map(Number);
        if (parts.length === keys.length && parts.every(function (n) { return isFinite(n) && n >= 0 && n <= 100; })) {
          keys.forEach(function (k, i) { st.raw[k] = parts[i]; });
        }
      }
      var m = Number(p.m), hi = Number(p.h), e = Number(p.e);
      if (isFinite(m) && isFinite(hi)) {
        st.high = clamp(Math.round(hi), 10, 95);
        st.medium = clamp(Math.round(m), 5, st.high - 1);
      }
      if (isFinite(e)) st.elevatedFrom = clamp(Math.round(e), 40, 90);
      if (p.r && p.r.length === M.RULES.length && /^[01]+$/.test(p.r)) {
        M.RULES.forEach(function (x, i) { st.rules[x.key] = p.r.charAt(i) === "1"; });
      }
    } catch (e) { /* ignore a bad link and keep the defaults */ }
  }

  // ---------- controls ----------

  var weightEls = {};
  var cutEls = {};
  var ruleEls = {};
  var elevatedEls = {};

  function sliderRow(id, text, min, max, value, onInput) {
    var row = document.createElement("div");
    row.className = "slider-row";
    row.innerHTML = '<div class="line"><label for="' + id + '">' + esc(text) + '</label><output for="' + id + '"></output></div>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="1" value="' + value + '">';
    var input = row.querySelector("input");
    input.addEventListener("input", function () { onInput(Number(input.value)); });
    return { row: row, input: input, out: row.querySelector("output") };
  }

  function buildControls() {
    var presets = $("presets");
    PRESETS.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "preset"; b.textContent = p.label;
      b.addEventListener("click", function () { applyPreset(p); });
      p.el = b;
      presets.appendChild(b);
    });

    var wbox = $("weights");
    D.factors.forEach(function (f) {
      var r = sliderRow("w-" + f.key, f.label, 0, 100, st.raw[f.key], function (v) { st.raw[f.key] = v; schedule(); });
      weightEls[f.key] = r;
      wbox.appendChild(r.row);
    });

    var cbox = $("cutoffs");
    cutEls.medium = sliderRow("c-medium", "Medium from a score of", 5, 90, st.medium, function (v) { setCut("medium", v); });
    cutEls.high = sliderRow("c-high", "High from a score of", 10, 95, st.high, function (v) { setCut("high", v); });
    cbox.appendChild(cutEls.medium.row);
    cbox.appendChild(cutEls.high.row);

    var rbox = $("rules");
    M.RULES.forEach(function (rule) {
      var wrap = document.createElement("div");
      wrap.className = "rule";
      var id = "rule-" + rule.key;
      wrap.innerHTML = '<div class="rule-wrap"><input type="checkbox" role="switch" id="' + id + '"><span class="track" aria-hidden="true"></span></div>' +
        '<label class="label" for="' + id + '">' + esc(rule.label) + '</label>' +
        '<p class="detail" id="' + id + '-d">' + esc(rule.detail) + "</p>";
      var input = wrap.querySelector("input");
      input.setAttribute("aria-describedby", id + "-d");
      input.addEventListener("change", function () { st.rules[rule.key] = input.checked; schedule(); });
      ruleEls[rule.key] = input;
      rbox.appendChild(wrap);
    });

    elevatedEls = sliderRow("e-from", "A factor counts as elevated from a score of", 40, 90, st.elevatedFrom, function (v) { st.elevatedFrom = v; schedule(); });
    $("elevated-wrap").appendChild(elevatedEls.row);

    $("copy-link").addEventListener("click", function () {
      writeHash();
      var status = $("copy-status");
      var url = location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          function () { status.textContent = "Link copied. Anyone who opens it sees these settings."; },
          function () { status.textContent = "Copy the address from your browser's address bar."; }
        );
      } else {
        status.textContent = "Copy the address from your browser's address bar.";
      }
    });
  }

  function setCut(which, v) {
    if (which === "medium") st.medium = clamp(v, 5, st.high - 1);
    else st.high = clamp(v, st.medium + 1, 95);
    schedule();
  }

  // Push the current state into every control (after a preset, a link, or a drag on the chart).
  function syncControls() {
    var s = toSettings(st);
    keys.forEach(function (k) {
      weightEls[k].input.value = st.raw[k];
      var pct = Math.round(s.weights[k] * 100);
      weightEls[k].out.textContent = pct + "%";
      weightEls[k].input.setAttribute("aria-valuetext", pct + " percent of the score");
    });
    $("weights-note").hidden = !s.fallback;
    cutEls.medium.input.value = st.medium; cutEls.medium.out.textContent = st.medium;
    cutEls.high.input.value = st.high; cutEls.high.out.textContent = st.high;
    elevatedEls.input.value = st.elevatedFrom; elevatedEls.out.textContent = st.elevatedFrom;
    M.RULES.forEach(function (r) { ruleEls[r.key].checked = !!st.rules[r.key]; });
    PRESETS.forEach(function (p) { p.el.setAttribute("aria-pressed", sameAsPreset(p) ? "true" : "false"); });
  }

  // ---------- chart ----------

  var W = 760, PAD = 28, PER = (W - PAD * 2) / 100;
  var Y_TOP = 26, Y_AXIS = 250, Y_BASE = 244;
  var svg = $("chart");
  var dotEls = {};
  var zoneEls = {};
  var cutGroups = {};
  var tickLabels = [];
  var axisTitle = null;

  function xOf(score) { return PAD + score * PER; }
  function svgEl(name, attrs) {
    var el = document.createElementNS(NS, name);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function buildChart() {
    ["low", "medium", "high"].forEach(function (b) {
      zoneEls[b] = svgEl("rect", { "class": "zone-" + b, y: Y_TOP, height: Y_AXIS - Y_TOP });
      svg.appendChild(zoneEls[b]);
      zoneEls[b + "Label"] = svgEl("text", { "class": "zone-label", y: Y_TOP + 20 });
      zoneEls[b + "Label"].textContent = BAND_NAME[b];
      svg.appendChild(zoneEls[b + "Label"]);
    });

    svg.appendChild(svgEl("line", { "class": "axis-line", x1: PAD, x2: W - PAD, y1: Y_AXIS, y2: Y_AXIS }));
    for (var t = 0; t <= 100; t += 10) {
      svg.appendChild(svgEl("line", { "class": "tick", x1: xOf(t), x2: xOf(t), y1: Y_AXIS, y2: Y_AXIS + 5 }));
      var tl = svgEl("text", { "class": "tick-label", x: xOf(t), "text-anchor": "middle" });
      tl.textContent = t;
      svg.appendChild(tl);
      tickLabels.push(tl);
    }
    axisTitle = svgEl("text", { "class": "axis-title", x: W / 2, y: 288, "text-anchor": "middle" });
    axisTitle.textContent = "Weighted score, 0 to 100";
    svg.appendChild(axisTitle);

    var dots = svgEl("g", {});
    D.customers.forEach(function (c) {
      var d = svgEl("circle", { "class": "dot low", cx: 0, cy: 0, r: 3.2 });
      d.appendChild(document.createElementNS(NS, "title"));
      d.addEventListener("click", function () { pick(c.id); });
      dots.appendChild(d);
      dotEls[c.id] = d;
    });
    svg.appendChild(dots);

    ["medium", "high"].forEach(function (which) {
      var g = svgEl("g", { "class": "cut", tabindex: "0", role: "slider", "aria-orientation": "horizontal", "aria-valuemin": which === "medium" ? 5 : 10, "aria-valuemax": which === "medium" ? 90 : 95 });
      g.setAttribute("aria-label", which === "medium" ? "Medium cut-off" : "High cut-off");
      var line = svgEl("line", { y1: Y_TOP, y2: Y_AXIS });
      var grip = svgEl("rect", { "class": "grip", y: 3, rx: 4 });
      var lbl = svgEl("text", { "class": "cut-label", "text-anchor": "middle" });
      var hit = svgEl("rect", { "class": "hit", y: 0, height: Y_AXIS + 6 });
      g.appendChild(line); g.appendChild(grip); g.appendChild(lbl); g.appendChild(hit);
      svg.appendChild(g);
      cutGroups[which] = { g: g, label: lbl, grip: grip, hit: hit };
      wireDrag(g, which);
    });
    applyScale();
    if (window.ResizeObserver) new ResizeObserver(function () { applyScale(); schedule(); }).observe(svg);
  }

  // On a narrow screen the whole chart shrinks, so text and handles are enlarged to stay readable and easy to grab.
  var labelsOff = false;
  function applyScale() {
    var w = svg.getBoundingClientRect().width || W;
    var k = clamp(0.95 / (w / W), 1, 2.4);
    svg.style.setProperty("--k", k.toFixed(2));
    labelsOff = k > 1.5;
    tickLabels.forEach(function (tl) { tl.setAttribute("y", Y_AXIS + 6 + 13 * k); });
    axisTitle.style.display = labelsOff ? "none" : "";
    ["medium", "high"].forEach(function (which) {
      var cg = cutGroups[which];
      cg.grip.setAttribute("width", 34 * k); cg.grip.setAttribute("height", 22 * k); cg.grip.setAttribute("x", -17 * k);
      cg.label.setAttribute("y", 3 + 15.5 * k);
      cg.hit.setAttribute("width", 30 * k); cg.hit.setAttribute("x", -15 * k);
    });
  }

  function wireDrag(g, which) {
    function scoreFromEvent(e) {
      var pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      var p = pt.matrixTransform(svg.getScreenCTM().inverse());
      return Math.round((p.x - PAD) / PER);
    }
    g.addEventListener("pointerdown", function (e) {
      g.setPointerCapture(e.pointerId);
      g._drag = true;
      g.focus();
      e.preventDefault();
    });
    g.addEventListener("pointermove", function (e) { if (g._drag) setCut(which, scoreFromEvent(e)); });
    function end(e) { g._drag = false; try { g.releasePointerCapture(e.pointerId); } catch (x) { /* already released */ } }
    g.addEventListener("pointerup", end);
    g.addEventListener("pointercancel", end);
    g.addEventListener("keydown", function (e) {
      var step = e.shiftKey ? 5 : 1, cur = which === "medium" ? st.medium : st.high;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { setCut(which, cur - step); e.preventDefault(); }
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") { setCut(which, cur + step); e.preventDefault(); }
    });
  }

  function renderChart(items) {
    var xm = xOf(st.medium), xh = xOf(st.high);
    zoneEls.low.setAttribute("x", PAD); zoneEls.low.setAttribute("width", xm - PAD);
    zoneEls.medium.setAttribute("x", xm); zoneEls.medium.setAttribute("width", xh - xm);
    zoneEls.high.setAttribute("x", xh); zoneEls.high.setAttribute("width", W - PAD - xh);
    zoneEls.lowLabel.setAttribute("x", PAD + 8);
    zoneEls.mediumLabel.setAttribute("x", xm + 8);
    zoneEls.highLabel.setAttribute("x", xh + 8);
    zoneEls.lowLabel.style.display = !labelsOff && xm - PAD > 50 ? "" : "none";
    zoneEls.mediumLabel.style.display = !labelsOff && xh - xm > 62 ? "" : "none";
    zoneEls.highLabel.style.display = !labelsOff && W - PAD - xh > 44 ? "" : "none";

    [["medium", st.medium], ["high", st.high]].forEach(function (pair) {
      var cg = cutGroups[pair[0]];
      cg.g.setAttribute("transform", "translate(" + xOf(pair[1]) + ",0)");
      cg.g.setAttribute("aria-valuenow", pair[1]);
      cg.label.textContent = pair[1];
    });

    var bins = {}, maxStack = 1;
    items.forEach(function (it) {
      var b = Math.round(it.score);
      (bins[b] = bins[b] || []).push(it);
    });
    for (var b in bins) {
      bins[b].sort(function (p, q) {
        var d = M.severity(p.band) - M.severity(q.band);
        return d !== 0 ? d : (p.c.id < q.c.id ? -1 : 1);
      });
      if (bins[b].length > maxStack) maxStack = bins[b].length;
    }
    var space = Math.min(6.9, (Y_BASE - 52) / maxStack);
    var r = Math.min(3.2, space * 0.47);
    for (var key in bins) {
      bins[key].forEach(function (it, i) {
        var d = dotEls[it.c.id];
        d.style.transform = "translate(" + xOf(Number(key)) + "px," + (Y_BASE - (i + 0.5) * space) + "px)";
        d.setAttribute("r", r);
        d.setAttribute("class", "dot " + it.band + (it.liftedByRule ? " lifted" : "") + (st.picked === it.c.id ? " picked" : ""));
        d.firstChild.textContent = it.c.id + ": score " + it.score.toFixed(1) + ", " + it.band + (it.liftedByRule ? ", lifted by a rule" : "");
      });
    }
  }

  function buildLegend() {
    var items = [
      ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["blocked", "Blocked"], ["ring", "Lifted by a safety rule"]
    ];
    $("legend").innerHTML = items.map(function (x) {
      return '<li><span class="swatch ' + x[0] + '" aria-hidden="true"></span>' + x[1] + "</li>";
    }).join("");
  }

  function renderBands(items) {
    var counts = { low: 0, medium: 0, high: 0, blocked: 0 };
    items.forEach(function (it) { counts[it.band] += 1; });
    $("band-bar").innerHTML = M.BANDS.map(function (b) {
      return '<span class="' + b + '" style="width:' + (counts[b] / N * 100) + '%"></span>';
    }).join("");
    $("band-counts").innerHTML = M.BANDS.map(function (b) {
      var pct = Math.round(counts[b] / N * 100);
      var was = defaultCounts[b] === counts[b] ? "" : ' <span class="was">(default ' + defaultCounts[b] + ")</span>";
      return '<li><span class="swatch ' + b + '" aria-hidden="true"></span> ' + BAND_NAME[b] + ": <strong>" + counts[b] + "</strong> (" + pct + "%)" + was + "</li>";
    }).join("");
    return counts;
  }

  function renderHeadline(items, counts) {
    var hi = counts.high + counts.blocked;
    var pct = Math.round(hi / N * 100);
    var changed = items.filter(function (it) { return it.band !== defaultByBandId[it.c.id]; }).length;
    var html = "At these settings, <strong>" + pct + "%</strong> of " + N + " customers are high or blocked, and " +
      (changed ? "<strong>" + changed + "</strong> changed band from the defaults." : "none changed band from the defaults.");
    $("headline-text").innerHTML = html;
    var note = $("calibration-note");
    if (pct >= 30) {
      note.hidden = false;
      note.textContent = "One industry guide warns that a model rating around 30% of customers high is not well tuned, because review teams cannot look closely at that many cases.";
    } else {
      note.hidden = true;
    }
    scheduleLive($("headline-text").textContent);
  }

  var liveTimer = null;
  function scheduleLive(text) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { $("live").textContent = text; }, 700);
  }

  // ---------- ranked list ----------

  var rowEls = {};

  function makeRow(c) {
    var li = document.createElement("li");
    li.className = "row";
    li.innerHTML = '<button type="button" class="row-head" aria-expanded="false">' +
      '<span class="rank"></span><span class="who"><span class="id"></span><span class="sum"></span></span>' +
      '<span class="score"></span><span class="chip"><span class="chip-mark" aria-hidden="true"></span><span class="chip-text"></span></span>' +
      '<span class="delta"></span></button><div class="row-body" hidden></div>';
    var head = li.querySelector(".row-head");
    var body = li.querySelector(".row-body");
    body.id = "body-" + c.id;
    head.setAttribute("aria-controls", body.id);
    head.addEventListener("click", function () {
      if (st.expanded[c.id]) delete st.expanded[c.id]; else st.expanded[c.id] = true;
      schedule();
    });
    li._r = {
      head: head, body: body,
      rank: li.querySelector(".rank"), id: li.querySelector(".id"), sum: li.querySelector(".sum"),
      score: li.querySelector(".score"), mark: li.querySelector(".chip-mark"),
      chip: li.querySelector(".chip-text"), delta: li.querySelector(".delta")
    };
    li._r.id.textContent = c.id;
    li._r.sum.textContent = c.summary;
    return li;
  }

  function updateRow(li, it, rank, s) {
    var r = li._r, id = it.c.id;
    r.rank.textContent = rank;
    r.score.textContent = it.score.toFixed(1);
    r.mark.className = "chip-mark " + it.band;
    r.chip.textContent = BAND_NAME[it.band];
    var was = defaultByBandId[id];
    if (was === it.band) { r.delta.textContent = "Same as default"; r.delta.className = "delta"; }
    else {
      var up = M.severity(it.band) > M.severity(was);
      r.delta.textContent = (up ? "Up from " : "Down from ") + was;
      r.delta.className = "delta changed";
    }
    var open = !!st.expanded[id];
    r.head.setAttribute("aria-expanded", open ? "true" : "false");
    r.body.hidden = !open;
    if (open) r.body.innerHTML = bodyHtml(it, s);
  }

  function bodyHtml(it, s) {
    var c = it.c, html = "";
    if (c.story) html += '<p class="story">' + esc(c.story) + "</p>";
    var fromScore = M.bandForScore(it.score, s);
    html += "<p>The weighted score of <strong>" + it.score.toFixed(1) + "</strong> gives <strong>" + fromScore + "</strong> on its own." +
      (it.liftedByRule ? " A safety rule lifts it to <strong>" + it.band + "</strong>." : "") + "</p>";
    html += "<h3>How the score is built</h3>";
    keys.forEach(function (k) {
      var f = c.f[k], w = s.weights[k], add = f.score * w;
      html += '<div class="factor"><span>' + esc(labelOf[k]) + "<br><small>" +
        (f.ok ? Math.round(f.score) + " out of 100" : "no data, default of " + Math.round(f.score) + " used") +
        ", counts " + Math.round(w * 100) + "%</small></span>" +
        '<span class="bar' + (f.ok ? "" : " nodata") + '"><i style="width:' + clamp(f.score, 0, 100) + '%"></i></span>' +
        '<span class="pts">adds ' + add.toFixed(1) + "</span>" +
        '<span class="why">' + esc(plainEvidence(f.why.join("; "))) + "</span></div>";
    });
    html += "<h3>Safety rules that applied</h3>";
    if (it.overrides.length) {
      html += '<ul class="rules-applied">' + it.overrides.map(function (o) {
        return "<li>" + esc(plainKeys(o).replace(" -> minimum band ", ", so the band is at least ")) + "</li>";
      }).join("") + "</ul>";
    } else html += "<p>None.</p>";
    if (it.review) {
      html += '<p class="review"><strong>A person should review this case.</strong>' +
        (it.reviewReasons.length ? " " + esc(plainKeys(it.reviewReasons.join("; "))) + "." : "") + "</p>";
    }
    return html;
  }

  function renderList(ranked, s) {
    var rankOf = {};
    ranked.forEach(function (it, i) { rankOf[it.c.id] = i + 1; });
    var visible;
    if (st.tab === "top") visible = ranked.slice(0, st.shown);
    else visible = ranked.filter(function (it) { return it.c.story; }).sort(function (a, b) { return a.c.id < b.c.id ? -1 : 1; });

    var list = $("list");
    var first = {};
    if (!reduceMotion && !st.noAnim) {
      Array.prototype.forEach.call(list.children, function (li) { first[li.dataset.id] = li.getBoundingClientRect().top; });
    }
    var frag = document.createDocumentFragment();
    visible.forEach(function (it) {
      var id = it.c.id;
      if (!rowEls[id]) { rowEls[id] = makeRow(it.c); rowEls[id].dataset.id = id; }
      updateRow(rowEls[id], it, rankOf[id], s);
      frag.appendChild(rowEls[id]);
    });
    list.replaceChildren(frag);
    if (!reduceMotion && !st.noAnim) {
      visible.forEach(function (it) {
        var li = rowEls[it.c.id], was = first[it.c.id];
        if (was === undefined) return;
        var dy = was - li.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) li.animate([{ transform: "translateY(" + dy + "px)" }, { transform: "none" }], { duration: 260, easing: "ease-out" });
      });
    }
    st.noAnim = false;

    $("list-intro").textContent = st.tab === "top"
      ? "The most severe band comes first, then the higher weighted score. Select a customer to see how the score is built."
      : "Eight hand-made cases that show the safety rules at work. Select one to read its story and see the scoring.";
    var more = $("show-more");
    if (st.tab === "top") {
      $("list-count").textContent = "Showing " + visible.length + " of " + N + " customers.";
      more.hidden = st.shown >= N;
      more.textContent = "Show " + Math.min(10, N - st.shown) + " more";
    } else {
      $("list-count").textContent = visible.length + " worked examples. Their rank is among all " + N + " customers.";
      more.hidden = true;
    }
  }

  function setTab(name, focus) {
    st.tab = name; st.noAnim = true;
    var top = $("tab-top"), ex = $("tab-examples");
    top.setAttribute("aria-selected", name === "top"); top.tabIndex = name === "top" ? 0 : -1;
    ex.setAttribute("aria-selected", name === "examples"); ex.tabIndex = name === "examples" ? 0 : -1;
    $("list-panel").setAttribute("aria-labelledby", name === "top" ? "tab-top" : "tab-examples");
    if (focus) (name === "top" ? top : ex).focus();
    schedule();
  }

  function pick(id) {
    st.picked = id;
    st.expanded[id] = true;
    st.noAnim = true;
    var idx = lastRanked.findIndex(function (it) { return it.c.id === id; });
    if (st.tab !== "top") setTab("top", false);
    if (idx + 1 > st.shown) st.shown = Math.ceil((idx + 1) / 10) * 10;
    render();
    var el = rowEls[id];
    if (el) el.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  }

  // ---------- update loop ----------

  var pending = false, lastRanked = [];
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; render(); });
  }

  function render() {
    var s = toSettings(st);
    var items = D.customers.map(function (c) {
      var r = M.evaluate(c, s, keys);
      r.c = c;
      return r;
    });
    lastRanked = M.rank(items);
    syncControls();
    renderChart(items);
    var counts = renderBands(items);
    renderHeadline(items, counts);
    renderList(lastRanked, s);
    writeHash();
  }

  // ---------- start ----------

  function init() {
    readHash();
    buildControls();
    buildChart();
    buildLegend();
    $("show-more").addEventListener("click", function () { st.shown = Math.min(N, st.shown + 10); st.noAnim = true; schedule(); });
    $("tab-top").addEventListener("click", function () { setTab("top", false); });
    $("tab-examples").addEventListener("click", function () { setTab("examples", false); });
    document.querySelector(".tabs").addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { setTab(st.tab === "top" ? "examples" : "top", true); e.preventDefault(); }
    });
    render();
  }

  init();
})();
