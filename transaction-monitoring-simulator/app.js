(function () {
  "use strict";

  var D = window.MONITOR_DATA;
  var M = window.Monitor;
  var customers = D.customers;
  var scores = D.countries;
  var N = customers.length;
  var REAL = D.meta.realCount;
  var FINE = N - REAL;
  var MINUTES_PER_REVIEW = 25;
  var ASSET_NAMES = ["bank transfer", "Bitcoin", "Ether", "Tether"];
  var SHAPE_OF = { large: "circle", many: "square", country: "diamond", justUnder: "triUp", passThrough: "triDown", spike: "hex", mixer: "cross" };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function num(n) { return Math.round(n).toLocaleString("en-GB"); }
  function ruleVar(key) { return "var(--r-" + key + ")"; }

  // ---------- small shape drawing, so colour is never the only cue ----------

  function shape(kind, cx, cy, r, attrs) {
    var a = attrs || "";
    var p;
    switch (kind) {
      case "circle": return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" ' + a + "/>";
      case "square": return '<rect x="' + (cx - r * 0.9) + '" y="' + (cy - r * 0.9) + '" width="' + r * 1.8 + '" height="' + r * 1.8 + '" ' + a + "/>";
      case "diamond": p = [[cx, cy - r * 1.25], [cx + r * 1.25, cy], [cx, cy + r * 1.25], [cx - r * 1.25, cy]]; break;
      case "triUp": p = [[cx, cy - r * 1.2], [cx + r * 1.15, cy + r * 0.95], [cx - r * 1.15, cy + r * 0.95]]; break;
      case "triDown": p = [[cx, cy + r * 1.2], [cx + r * 1.15, cy - r * 0.95], [cx - r * 1.15, cy - r * 0.95]]; break;
      case "hex":
        p = [0, 1, 2, 3, 4, 5].map(function (i) { var t = Math.PI / 3 * i; return [cx + r * 1.1 * Math.cos(t), cy + r * 1.1 * Math.sin(t)]; });
        break;
      case "cross": {
        var t = r * 0.45, e = r * 1.25;
        p = [[-t, -e], [t, -e], [t, -t], [e, -t], [e, t], [t, t], [t, e], [-t, e], [-t, t], [-e, t], [-e, -t], [-t, -t]]
          .map(function (q) { return [cx + q[0], cy + q[1]]; });
        break;
      }
      default: p = [[cx, cy]];
    }
    return '<polygon points="' + p.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" ") + '" ' + a + "/>";
  }

  function miniShape(kind, color) {
    return '<svg viewBox="0 0 14 14" aria-hidden="true">' + shape(kind, 7, 7, 4.6, 'fill="' + color + '"') + "</svg>";
  }

  // ---------- state ----------

  var start = M.PRESETS[0].settings;
  var st = { tighten: false, on: {}, level: {}, tab: "flagged", filter: "all", shown: 15, expanded: {} };
  M.RULES.forEach(function (r) { st.on[r.key] = start.rules[r.key].on; st.level[r.key] = start.rules[r.key].level; });

  function toSettings() {
    var s = { tighten: st.tighten, rules: {} };
    M.RULES.forEach(function (r) { s.rules[r.key] = { on: !!st.on[r.key], level: st.level[r.key] }; });
    return s;
  }

  function applySettings(s) {
    st.tighten = !!s.tighten;
    M.RULES.forEach(function (r) { st.on[r.key] = s.rules[r.key].on; st.level[r.key] = s.rules[r.key].level; });
  }

  function sameAs(preset) {
    var s = preset.settings;
    if (!!s.tighten !== st.tighten) return false;
    return M.RULES.every(function (r) {
      var p = s.rules[r.key];
      return p.on === !!st.on[r.key] && (!p.on || p.level === st.level[r.key]);
    });
  }

  function writeHash() {
    var on = M.RULES.map(function (r) { return st.on[r.key] ? "1" : "0"; }).join("");
    var lv = M.RULES.map(function (r) { return st.level[r.key]; }).join(",");
    try { history.replaceState(null, "", "#r=" + on + "&l=" + lv + "&t=" + (st.tighten ? 1 : 0)); } catch (e) { /* not available in some previews */ }
  }

  function readHash() {
    try {
      var h = location.hash.slice(1);
      if (!h) return;
      var p = {};
      h.split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) p[kv.slice(0, i)] = kv.slice(i + 1); });
      if (p.r && p.r.length === M.RULES.length && /^[01]+$/.test(p.r)) {
        M.RULES.forEach(function (r, i) { st.on[r.key] = p.r.charAt(i) === "1"; });
      }
      if (p.l) {
        var parts = p.l.split(",").map(Number);
        if (parts.length === M.RULES.length) {
          M.RULES.forEach(function (r, i) {
            if (isFinite(parts[i])) st.level[r.key] = clamp(Math.round(parts[i]), 0, r.levels.length - 1);
          });
        }
      }
      st.tighten = p.t === "1";
    } catch (e) { /* ignore a bad link and keep the defaults */ }
  }

  // ---------- results ----------

  var sweepCache = {};
  function sweeps() {
    var key = st.tighten ? "t" : "n";
    if (!sweepCache[key]) {
      sweepCache[key] = {};
      M.RULES.forEach(function (r) { sweepCache[key][r.key] = M.sweep(r.key, customers, st.tighten, scores); });
    }
    return sweepCache[key];
  }

  var baseline = M.tally(M.evaluate(customers, M.defaultSettings(), scores), customers);

  // ---------- controls ----------

  var els = { on: {}, slider: {}, out: {}, sub: {}, alone: {}, body: {} };
  var presetEls = [];
  var tightenEl;

  function buildControls() {
    var pbox = $("presets");
    M.PRESETS.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "preset"; b.textContent = p.label;
      b.addEventListener("click", function () { applySettings(p.settings); schedule(); });
      presetEls.push(b);
      pbox.appendChild(b);
    });

    var rbox = $("rules");
    M.RULES.forEach(function (rule) {
      var id = "rule-" + rule.key;
      var block = document.createElement("div");
      block.className = "rule-block";
      var hasSlider = rule.levels.length > 1;
      block.innerHTML =
        '<div class="rule"><div class="rule-wrap"><input type="checkbox" role="switch" id="' + id + '"><span class="track" aria-hidden="true"></span></div>' +
        '<label class="label" for="' + id + '">' + miniShape(SHAPE_OF[rule.key], ruleVar(rule.key)).replace("<svg", '<svg class="swatch-inline"') + "<strong>" + esc(rule.name) + "</strong></label>" +
        '<p class="detail" id="' + id + '-d">' + esc(rule.question) + "</p></div>" +
        '<div class="rule-body" id="' + id + '-body">' +
        (hasSlider
          ? '<div class="slider-row"><div class="line"><label for="' + id + '-s">Flag when</label><output for="' + id + '-s" id="' + id + '-o"></output></div>' +
            '<input type="range" id="' + id + '-s" min="0" max="' + (rule.levels.length - 1) + '" step="1">' +
            '<div class="ends"><span>More alerts</span><span>Fewer alerts</span></div></div>'
          : "") +
        '<p class="sub" id="' + id + '-sub"></p><p class="alone" id="' + id + '-alone"></p></div>';
      rbox.appendChild(block);

      var input = block.querySelector("#" + id);
      input.setAttribute("aria-describedby", id + "-d");
      input.addEventListener("change", function () { st.on[rule.key] = input.checked; schedule(); });
      els.on[rule.key] = input;
      els.body[rule.key] = block.querySelector("#" + id + "-body");
      els.sub[rule.key] = block.querySelector("#" + id + "-sub");
      els.alone[rule.key] = block.querySelector("#" + id + "-alone");
      if (hasSlider) {
        var slider = block.querySelector("#" + id + "-s");
        slider.addEventListener("input", function () { st.level[rule.key] = Number(slider.value); schedule(); });
        els.slider[rule.key] = slider;
        els.out[rule.key] = block.querySelector("#" + id + "-o");
      }
    });

    var tid = "tighten";
    $("tighten-wrap").innerHTML =
      '<div class="rule"><div class="rule-wrap"><input type="checkbox" role="switch" id="' + tid + '"><span class="track" aria-hidden="true"></span></div>' +
      '<label class="label" for="' + tid + '"><strong>Look harder at high-risk customers</strong></label>' +
      '<p class="detail" id="' + tid + '-d">Customers the KYC engine rates high or blocked get half the usual limit on the Large payment and Many payments rules. Linking the two halves of the work like this is how a risk-based approach is meant to run.</p></div>';
    tightenEl = $(tid);
    tightenEl.setAttribute("aria-describedby", tid + "-d");
    tightenEl.addEventListener("change", function () { st.tighten = tightenEl.checked; schedule(); });

    $("copy-link").addEventListener("click", function () {
      writeHash();
      var status = $("copy-status");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(location.href).then(
          function () { status.textContent = "Link copied. Anyone who opens it sees these rules."; },
          function () { status.textContent = "Copy the address from your browser's address bar."; }
        );
      } else {
        status.textContent = "Copy the address from your browser's address bar.";
      }
    });
  }

  function syncControls(sw) {
    M.RULES.forEach(function (r) {
      var on = !!st.on[r.key];
      els.on[r.key].checked = on;
      els.body[r.key].hidden = !on;
      var level = st.level[r.key];
      var v = r.levels[level];
      if (els.slider[r.key]) {
        els.slider[r.key].value = level;
        els.out[r.key].textContent = r.short(v);
        els.slider[r.key].setAttribute("aria-valuetext", r.describe(v, scores));
      }
      els.sub[r.key].textContent = r.describe(v, scores) + ".";
      var pt = sw[r.key][level];
      els.alone[r.key].innerHTML = "On its own: <strong>" + pt.caught + "</strong> real, <strong>" + pt.falseAlarms + "</strong> false alarms.";
    });
    tightenEl.checked = st.tighten;
    var matched = null;
    M.PRESETS.forEach(function (p, i) {
      var same = sameAs(p);
      presetEls[i].setAttribute("aria-pressed", same ? "true" : "false");
      if (same) matched = p;
    });
    $("preset-note").textContent = matched ? matched.note : "Custom rules. Pick a starting point above to compare.";
  }

  // ---------- chart ----------

  var svg = $("chart");
  var dragRule = null;
  var geom = null;

  function niceMax(v) {
    var steps = [20, 40, 60, 80, 100, 120, 150, 200, 250, 300, 400];
    for (var i = 0; i < steps.length; i++) if (steps[i] >= v * 1.05) return steps[i];
    return 400;
  }

  function buildGeometry(sw) {
    var width = svg.clientWidth || 760;
    var k = clamp(760 / Math.max(300, width), 1, 2.2);
    var maxFalse = 10;
    M.RULES.forEach(function (r) {
      if (!st.on[r.key]) return;
      sw[r.key].forEach(function (p) { maxFalse = Math.max(maxFalse, p.falseAlarms); });
    });
    var g = { k: k, W: 760, H: 470 + (k - 1) * 260, PL: 30 + 22 * k, PR: 24, PT: 20 + 6 * k, PB: 34 + 22 * k, xmax: niceMax(maxFalse) };
    g.pw = g.W - g.PL - g.PR;
    g.ph = g.H - g.PT - g.PB;
    g.x = function (v) { return g.PL + (v / g.xmax) * g.pw; };
    g.y = function (v) { return g.PT + g.ph - (v / REAL) * g.ph; };
    return g;
  }

  function renderChart(sw, flagged, t) {
    var g = geom = buildGeometry(sw);
    var k = g.k;
    svg.setAttribute("viewBox", "0 0 " + g.W + " " + g.H);
    svg.style.setProperty("--k", k);
    var out = "";

    // grid and axes
    [0, 8, 16, 24, 32].forEach(function (v) {
      out += '<line class="grid-line" x1="' + g.PL + '" x2="' + (g.W - g.PR) + '" y1="' + g.y(v) + '" y2="' + g.y(v) + '"/>';
      out += '<text class="tick-label" x="' + (g.PL - 8) + '" y="' + (g.y(v) + 4 * k) + '" text-anchor="end">' + v + "</text>";
    });
    var step = g.xmax <= 120 ? g.xmax / 4 : g.xmax / 5;
    for (var v = 0; v <= g.xmax + 0.001; v += step) {
      out += '<line class="grid-line" x1="' + g.x(v) + '" x2="' + g.x(v) + '" y1="' + g.PT + '" y2="' + (g.PT + g.ph) + '"/>';
      out += '<text class="tick-label" x="' + g.x(v) + '" y="' + (g.PT + g.ph + 16 * k) + '" text-anchor="middle">' + v + "</text>";
    }
    out += '<line class="axis-line" x1="' + g.PL + '" x2="' + (g.W - g.PR) + '" y1="' + (g.PT + g.ph) + '" y2="' + (g.PT + g.ph) + '"/>';
    out += '<line class="axis-line" x1="' + g.PL + '" x2="' + g.PL + '" y1="' + g.PT + '" y2="' + (g.PT + g.ph) + '"/>';
    out += '<text class="axis-title" x="' + (g.PL + g.pw / 2) + '" y="' + (g.H - 6) + '" text-anchor="middle">False alarms (fine customers flagged, out of ' + FINE + ")</text>";
    out += '<text class="axis-title" transform="translate(' + (14 * k) + " " + (g.PT + g.ph / 2) + ') rotate(-90)" text-anchor="middle">Real problems caught (out of ' + REAL + ")</text>";
    out += '<text class="better" x="' + (g.PL + 10) + '" y="' + (g.PT + 16 * k) + '">Better: up and to the left</text>';

    // what flagging at random would do
    var cx2 = g.xmax, cy2 = REAL * g.xmax / FINE;
    out += '<line class="chance" x1="' + g.x(0) + '" y1="' + g.y(0) + '" x2="' + g.x(cx2) + '" y2="' + g.y(cy2) + '"/>';
    out += '<text class="chance-label" x="' + (g.x(cx2) - 6) + '" y="' + (g.y(cy2) - 8 * k) + '" text-anchor="end">Random flagging</text>';

    // one line per switched-on rule
    var labels = [];
    var live = "";
    var mk = 3.6 * Math.min(k, 1.6);
    M.RULES.forEach(function (r) {
      if (!st.on[r.key]) return;
      var pts = sw[r.key];
      var color = ruleVar(r.key);
      var sorted = pts.slice().sort(function (a, b) { return a.falseAlarms - b.falseAlarms || a.caught - b.caught; });
      if (pts.length > 1) {
        out += '<polyline class="curve" stroke="' + color + '" points="' + sorted.map(function (p) { return g.x(p.falseAlarms).toFixed(1) + "," + g.y(p.caught).toFixed(1); }).join(" ") + '"/>';
      }
      pts.forEach(function (p) {
        if (p.level === st.level[r.key]) return;
        out += shape(SHAPE_OF[r.key], g.x(p.falseAlarms), g.y(p.caught), mk, 'class="pt" fill="' + color + '" opacity="0.85"');
        if (pts.length > 1) {
          out += '<circle class="hitbox" data-rule="' + r.key + '" data-level="' + p.level + '" cx="' + g.x(p.falseAlarms) + '" cy="' + g.y(p.caught) + '" r="' + 11 * Math.min(k, 1.7) + '"/>';
        }
      });
      var cur = pts[st.level[r.key]];
      live += shape(SHAPE_OF[r.key], g.x(cur.falseAlarms), g.y(cur.caught), mk * 1.9,
        'class="pt-live" data-rule="' + r.key + '" fill="' + color + '"');
      labels.push({ x: g.x(cur.falseAlarms), y: g.y(cur.caught), text: k > 1.3 ? r.name : r.name + ", " + r.short(r.levels[st.level[r.key]]), color: color, r: mk * 1.9 });
    });

    out += live; // the draggable dots go on top so they are always easy to grab

    // all switched-on rules together
    var cxp = g.x(Math.min(t.falseAlarms, g.xmax)), cyp = g.y(t.caught);
    out += '<circle class="combined" cx="' + cxp + '" cy="' + cyp + '" r="' + 9 * Math.min(k, 1.6) + '"/>';
    out += '<circle class="combined-core" cx="' + cxp + '" cy="' + cyp + '" r="' + 3.6 * Math.min(k, 1.6) + '"/>';
    labels.push({ x: cxp, y: cyp, text: "All switched-on rules", color: "var(--ink)", r: 9 * Math.min(k, 1.6), combined: true });

    // labels: place beside the dot, flip near the right edge, nudge apart vertically
    labels.sort(function (a, b) { return a.y - b.y; });
    var lastY = -1e9, gap = 15 * k;
    labels.forEach(function (l) {
      var est = l.text.length * 6.6 * k;
      var fitsRight = l.x + l.r + 8 + est < g.W - 4;
      var fitsLeft = l.x - l.r - 8 - est > 4;
      var right = fitsRight || !fitsLeft;
      var y = Math.max(l.y + 4 * k, lastY + gap);
      lastY = y;
      var tx = right ? Math.min(l.x + l.r + 8, g.W - 4 - est) : l.x - l.r - 8;
      tx = Math.max(tx, right ? 4 : est + 4);
      out += '<text class="' + (l.combined ? "combined-label" : "pt-label") + '" x="' + tx + '" y="' + y + '" text-anchor="' + (right ? "start" : "end") + '"' +
        (l.combined ? "" : ' fill="' + l.color + '"') + ">" + esc(l.text) + "</text>";
    });

    svg.innerHTML = out;
  }

  function wireChart() {
    function toView(e) {
      var rect = svg.getBoundingClientRect();
      var sx = geom.W / rect.width;
      return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sx };
    }
    function setNearest(rule, e) {
      var p = toView(e);
      var pts = sweeps()[rule];
      var best = 0, bestD = Infinity;
      pts.forEach(function (q) {
        var dx = geom.x(q.falseAlarms) - p.x, dy = geom.y(q.caught) - p.y;
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = q.level; }
      });
      if (best !== st.level[rule]) { st.level[rule] = best; schedule(); }
    }
    svg.addEventListener("pointerdown", function (e) {
      var target = e.target.closest ? e.target.closest("[data-rule]") : null;
      if (!target) return;
      dragRule = target.getAttribute("data-rule");
      try { svg.setPointerCapture(e.pointerId); } catch (x) { /* not supported */ }
      var lv = target.getAttribute("data-level");
      if (lv !== null) { st.level[dragRule] = Number(lv); schedule(); }
      e.preventDefault();
    });
    svg.addEventListener("pointermove", function (e) { if (dragRule) setNearest(dragRule, e); });
    function end(e) {
      dragRule = null;
      try { svg.releasePointerCapture(e.pointerId); } catch (x) { /* already released */ }
    }
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    if (window.ResizeObserver) {
      var lastW = svg.clientWidth;
      new ResizeObserver(function () { if (svg.clientWidth !== lastW) { lastW = svg.clientWidth; schedule(); } }).observe(svg);
    }
  }

  function renderLegend() {
    var html = "";
    M.RULES.forEach(function (r) {
      if (!st.on[r.key]) return;
      html += "<li>" + miniShape(SHAPE_OF[r.key], ruleVar(r.key)) + esc(r.name) + "</li>";
    });
    html += '<li><svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="var(--paper)" stroke="var(--ink)" stroke-width="2"/><circle cx="7" cy="7" r="2" fill="var(--ink)"/></svg>All switched-on rules</li>';
    html += '<li><svg viewBox="0 0 14 14" aria-hidden="true"><line x1="1" y1="7" x2="13" y2="7" stroke="var(--ink-soft)" stroke-width="1.5" stroke-dasharray="3 2"/></svg>Random flagging</li>';
    $("legend").innerHTML = html;
  }

  // ---------- headline and tiles ----------

  function pct(x) { return Math.round(x * 100) + "%"; }

  function headline(t) {
    if (!t.flagged && !M.RULES.some(function (r) { return st.on[r.key]; })) {
      return "No rules are switched on, so nothing is flagged and all <strong>" + REAL + "</strong> real problems are missed.";
    }
    var s = "Your rules flag <strong>" + t.flagged + "</strong> of " + N + " customers. They catch <strong>" + t.caught +
      "</strong> of the " + REAL + " real problems and raise <strong>" + t.falseAlarms + "</strong> false alarms";
    if (t.flagged) s += t.caught ? ", so about <strong>" + pct(t.precision) + "</strong> of alerts are real." : ", so none of the alerts are real.";
    else s += ".";
    return s;
  }

  function renderTiles(t) {
    var hours = t.flagged * MINUTES_PER_REVIEW / 60;
    var baseHours = baseline.flagged * MINUTES_PER_REVIEW / 60;
    var tiles = [
      ['<span class="big">' + t.caught + " <small>of " + REAL + "</small></span>", "real problems caught", "Starting rules: " + baseline.caught],
      ['<span class="big">' + t.falseAlarms + " <small>of " + FINE + "</small></span>", "fine customers flagged by mistake", "Starting rules: " + baseline.falseAlarms],
      ['<span class="big">' + (t.precision === null ? "none" : pct(t.precision)) + "</span>", "of alerts turn out to be real", "Starting rules: " + pct(baseline.precision)],
      ['<span class="big">' + hours.toFixed(1) + " <small>hours</small></span>", "for analysts to review every alert", "At " + MINUTES_PER_REVIEW + " minutes a case, an assumption. Starting rules: " + baseHours.toFixed(1)]
    ];
    $("tiles").innerHTML = tiles.map(function (x) {
      return "<li>" + x[0] + '<p class="what">' + x[1] + '</p><p class="was">' + x[2] + "</p></li>";
    }).join("");
  }

  // ---------- case list ----------

  var rowOpen = {};

  function dayTime(minute) {
    var d = Math.floor(minute / 1440) + 1;
    var m = minute % 1440;
    return "day " + d + ", " + String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }

  function payText(p) {
    var where = (scores[p[3]] ? scores[p[3]].name : p[3]);
    return dayTime(p[0]) + ": " + num(p[2]) + " EUR " + (p[1] ? "out to " : "in from ") + where + " (" + ASSET_NAMES[p[4]] + ")" + (p[5] ? ", wallet linked to a mixing service" : "");
  }

  function summary(c) {
    var total = c.p.reduce(function (a, p) { return a + p[2]; }, 0);
    var big = c.p.reduce(function (a, p) { return Math.max(a, p[2]); }, 0);
    return c.p.length + " payments, " + num(total) + " EUR moved, largest " + num(big) + " EUR";
  }

  function timeline(c, hitSet) {
    var W = 640, H = 150, PL = 40, PR = 10, PT = 8, PB = 24;
    var width = Math.min(640, ($("list").clientWidth || 640) - 16);
    var k = clamp(640 / Math.max(280, width), 1, 2.2);
    PL = 30 + 10 * k; PB = 12 + 12 * k; H = 150 + (k - 1) * 70;
    var pw = W - PL - PR, ph = H - PT - PB;
    var lo = Math.log10(5), hi = Math.log10(100000);
    function x(min) { return PL + (min / (30 * 1440)) * pw; }
    function y(a) { return PT + ph - ((Math.log10(Math.max(5, a)) - lo) / (hi - lo)) * ph; }
    var out = '<svg class="timeline" viewBox="0 0 ' + W + " " + H + '" style="--k:' + k + '" role="img" aria-label="Timeline of ' + c.p.length + ' payments over 30 days. Height shows the size of each payment.">';
    [[10, "10"], [100, "100"], [1000, "1k"], [10000, "10k"], [100000, "100k"]].forEach(function (t) {
      out += '<line class="tl-grid" x1="' + PL + '" x2="' + (W - PR) + '" y1="' + y(t[0]) + '" y2="' + y(t[0]) + '"/>' +
        '<text class="tl-text" x="' + (PL - 6) + '" y="' + (y(t[0]) + 4) + '" text-anchor="end">' + t[1] + "</text>";
    });
    [1, 5, 10, 15, 20, 25, 30].forEach(function (d) {
      var xx = x((d - 1) * 1440);
      out += '<line class="tl-axis" x1="' + xx + '" x2="' + xx + '" y1="' + (PT + ph) + '" y2="' + (PT + ph + 4) + '"/>' +
        '<text class="tl-text" x="' + xx + '" y="' + (PT + ph + 8 + 11 * k) + '" text-anchor="middle">' + d + "</text>";
    });
    out += '<line class="tl-axis" x1="' + PL + '" x2="' + (W - PR) + '" y1="' + (PT + ph) + '" y2="' + (PT + ph) + '"/>';
    c.p.forEach(function (p, i) {
      var cx = x(p[0]), cy = y(p[2]);
      var title = "<title>" + esc(payText(p)) + "</title>";
      if (hitSet && hitSet[i]) out += '<circle class="tl-ring" cx="' + cx + '" cy="' + cy + '" r="' + 7.5 + '"/>';
      out += p[1] === 0
        ? '<circle class="tl-dot-in" cx="' + cx + '" cy="' + cy + '" r="3.6">' + title + "</circle>"
        : shape("diamond", cx, cy, 3.4, 'class="tl-dot-out"').replace("/>", ">" + title + "</polygon>");
    });
    out += "</svg>";
    out += '<div class="tl-key"><span>' + miniShape("circle", "var(--low)") + 'Money in</span><span>' + miniShape("diamond", "var(--accent)") +
      'Money out</span>' + (hitSet ? '<span><svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="var(--high)" stroke-width="2"/></svg>Triggered an alert</span>' : "") +
      "<span>Left to right: day 1 to day 30. Height: payment size, log scale.</span></div>";
    return out;
  }

  function verdictHtml(c) {
    return c.real
      ? '<span class="verdict real"><svg viewBox="0 0 14 14" aria-hidden="true">' + shape("triUp", 7, 7, 4.8, 'fill="currentColor"') + "</svg>Real problem</span>"
      : '<span class="verdict fine"><svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="2"/></svg>False alarm</span>';
  }

  function rowHtml(c, hits, sw) {
    var open = !!st.expanded[c.id];
    var rules = hits
      ? Object.keys(hits).map(function (key) {
        var r = M.BY_KEY[key];
        return "<span>" + miniShape(SHAPE_OF[key], ruleVar(key)) + esc(r.name) + "</span>";
      }).join("")
      : "<span>No rule fired</span>";
    var html = '<li class="row"><button class="row-head" type="button" data-id="' + c.id + '" aria-expanded="' + open + '">' +
      '<span class="who"><span class="id">' + c.id + '</span><span class="sum">' + esc(summary(c)) + "</span></span>" +
      '<span class="row-rules">' + rules + "</span>" + verdictHtml(c) + "</button>";
    if (open) {
      html += '<div class="row-body"><p class="story">' + esc(c.story) + "</p>" +
        '<p class="pattern">What this really was: ' + esc(D.patterns[c.pattern].label) + ". KYC risk band: " + c.band + ".</p>";
      if (hits) {
        html += "<h3>Why it was flagged</h3><ul>" + Object.keys(hits).map(function (key) {
          var r = M.BY_KEY[key];
          return "<li><strong>" + esc(r.name) + ":</strong> " + esc(r.describe(r.levels[st.level[key]], scores)) + ". " + hits[key].length + (hits[key].length === 1 ? " payment" : " payments") + " triggered it.</li>";
        }).join("") + "</ul>";
        var set = {};
        Object.keys(hits).forEach(function (key) { hits[key].forEach(function (i) { set[i] = true; }); });
        html += "<h3>Its payments</h3>" + timeline(c, set);
      } else {
        html += "<h3>What it would take to catch this</h3>" + catchAdvice(c, sw) + "<h3>Its payments</h3>" + timeline(c, null);
      }
      html += "</div>";
    }
    return html + "</li>";
  }

  function catchAdvice(c, sw) {
    var items = [];
    M.RULES.forEach(function (r) {
      for (var level = r.levels.length - 1; level >= 0; level--) {
        if (M.triggers(c, r.key, level, st.tighten, scores).length) {
          var cost = sw[r.key][level].falseAlarms;
          var off = st.on[r.key] ? "" : " (switched off now)";
          items.push("<li><strong>" + esc(r.name) + "</strong>" + off + " would catch it" +
            (r.levels.length > 1 ? " if set to " + esc(r.short(r.levels[level])) + " or looser" : "") +
            ". On its own that raises " + cost + " false alarms.</li>");
          return;
        }
      }
    });
    if (!items.length) {
      return "<p>None of these seven rules catches this at any setting. Spotting it needs a different kind of check, such as looking at how wallets connect to each other across customers.</p>";
    }
    return "<ul>" + items.join("") + "</ul>";
  }

  function renderList(flagged, t, sw) {
    var truth = {};
    flagged.forEach(function (f) { truth[f.customer.id] = f; });
    var rows;
    var intro;
    var showFilter = st.tab === "flagged";
    if (st.tab === "flagged") {
      var all = flagged.slice().sort(function (a, b) {
        var ra = Object.keys(a.hits).length, rb = Object.keys(b.hits).length;
        if (ra !== rb) return rb - ra;
        var ma = Math.max.apply(null, a.customer.p.map(function (p) { return p[2]; }));
        var mb = Math.max.apply(null, b.customer.p.map(function (p) { return p[2]; }));
        return mb - ma || (a.customer.id < b.customer.id ? -1 : 1);
      });
      rows = all.filter(function (f) {
        return st.filter === "all" || (st.filter === "real" ? f.customer.real : !f.customer.real);
      });
      intro = "Sorted by how many rules fired, then by the largest payment. An analyst would not know which cases are real. This page shows the answer so you can see what each rule is doing. Select a case to read its story.";
      renderFilter(t);
    } else {
      rows = customers.filter(function (c) { return c.real && !truth[c.id]; }).map(function (c) { return { customer: c, hits: null }; });
      intro = "Real problems that no switched-on rule flagged. Select one to see what it would take to catch it.";
    }
    var visible = rows.slice(0, st.shown);
    $("list").innerHTML = visible.map(function (f) { return rowHtml(f.customer, f.hits, sw); }).join("");
    $("list-intro").textContent = intro;
    $("filter").hidden = !showFilter;
    $("list-count").textContent = rows.length
      ? "Showing " + visible.length + " of " + rows.length + (st.tab === "flagged" ? " flagged customers." : " missed problems.")
      : (st.tab === "flagged" ? "No customers match." : "No real problem is missed.");
    var more = $("show-more");
    more.hidden = visible.length >= rows.length;
    more.textContent = "Show " + Math.min(15, rows.length - visible.length) + " more";
    $("tab-flagged").textContent = "Flagged (" + t.flagged + ")";
    $("tab-missed").textContent = "Missed problems (" + t.missed + ")";
  }

  function renderFilter(t) {
    var opts = [["all", "All (" + t.flagged + ")"], ["real", "Real problems (" + t.caught + ")"], ["fine", "False alarms (" + t.falseAlarms + ")"]];
    $("filter").innerHTML = opts.map(function (o) {
      return '<button type="button" class="preset" data-filter="' + o[0] + '" aria-pressed="' + (st.filter === o[0]) + '">' + o[1] + "</button>";
    }).join("");
  }

  function setTab(name, focus) {
    st.tab = name; st.shown = 15;
    var a = $("tab-flagged"), b = $("tab-missed");
    a.setAttribute("aria-selected", name === "flagged"); a.tabIndex = name === "flagged" ? 0 : -1;
    b.setAttribute("aria-selected", name === "missed"); b.tabIndex = name === "missed" ? 0 : -1;
    $("list-panel").setAttribute("aria-labelledby", name === "flagged" ? "tab-flagged" : "tab-missed");
    if (focus) (name === "flagged" ? a : b).focus();
    schedule();
  }

  // ---------- update loop ----------

  var pending = false;
  var last = null;
  var liveTimer = null;

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; render(); });
  }

  function render() {
    var sw = sweeps();
    var flagged = M.evaluate(customers, toSettings(), scores);
    var t = M.tally(flagged, customers);
    last = { flagged: flagged, t: t, sw: sw };
    syncControls(sw);
    renderChart(sw, flagged, t);
    renderLegend();
    $("headline-text").innerHTML = headline(t);
    renderTiles(t);
    renderList(flagged, t, sw);
    writeHash();
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { $("live").textContent = $("headline-text").textContent; }, 600);
  }

  function init() {
    readHash();
    buildControls();
    wireChart();
    $("show-more").addEventListener("click", function () { st.shown += 15; schedule(); });
    $("tab-flagged").addEventListener("click", function () { setTab("flagged", false); });
    $("tab-missed").addEventListener("click", function () { setTab("missed", false); });
    document.querySelector(".tabs").addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { setTab(st.tab === "flagged" ? "missed" : "flagged", true); e.preventDefault(); }
    });
    $("filter").addEventListener("click", function (e) {
      var b = e.target.closest("[data-filter]");
      if (!b) return;
      st.filter = b.getAttribute("data-filter"); st.shown = 15;
      schedule();
    });
    $("list").addEventListener("click", function (e) {
      var b = e.target.closest(".row-head");
      if (!b) return;
      var id = b.getAttribute("data-id");
      st.expanded[id] = !st.expanded[id];
      renderList(last.flagged, last.t, last.sw);
      var again = document.querySelector('.row-head[data-id="' + id + '"]');
      if (again) again.focus();
    });
    render();
  }

  init();
})();
