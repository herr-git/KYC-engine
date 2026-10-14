/* The planner. Given what a visitor wants to offer and their situation, it works out:
 *   1. which building blocks are needed, including the ones pulled in by dependencies
 *   2. for each block, build, buy, hybrid or partner, with the score written out line by line
 *   3. a sensible order of work
 *
 * The answer is a visible sum, never a hidden model. Every number that moves a score is returned
 * together with a plain label, so the page can show it and a reader can disagree with it.
 *
 * Works in the browser and in Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./catalog.js"));
  else root.Planner = factory(root.Catalog);
})(typeof self !== "undefined" ? self : this, function (Catalog) {
  "use strict";

  var BY_ID = {};
  Catalog.COMPONENTS.forEach(function (c, i) { c.order = i; BY_ID[c.id] = c; });

  // How deep a block sits in the dependency chain. A block is always deeper than everything it needs.
  function depthOf(id) {
    var c = BY_ID[id];
    if (c.depth !== undefined) return c.depth;
    c.depth = 1 + c.depends.reduce(function (m, d) { return Math.max(m, depthOf(d)); }, 0);
    return c.depth;
  }
  Catalog.COMPONENTS.forEach(function (c) { depthOf(c.id); });

  // How each answer moves the score. Positive pushes toward buying, negative toward building.
  var TEAM = {
    none: { label: "No engineering team, or a tiny one", delta: 2 },
    small: { label: "A small engineering team", delta: 1 },
    strong: { label: "A strong engineering team", delta: -1 }
  };
  var TIME = {
    short: { label: "Launch in under 6 months", delta: 2 },
    mid: { label: "Launch in 6 to 18 months", delta: 1 },
    long: { label: "More than 18 months to launch", delta: 0 }
  };
  var VOLUME = {
    small: { label: "Small volumes: a vendor's per transaction price is fine", delta: 1 },
    mid: { label: "Medium volumes", delta: 0 },
    large: { label: "Large volumes: per transaction fees add up", delta: -1 }
  };
  var COMPETE_DELTA = -3;
  var HEAVY_RULES_DELTA = 1;
  var BUY_AT = 4;
  var HYBRID_AT = 1;
  var MAX_EDGE = 3;
  // The verdict meter runs from a low score (build) to a high score (buy).
  var METER_MIN = -8;
  var METER_MAX = 12;
  var EFFORT_POINTS = { S: 1, M: 2, L: 3, XL: 5 };

  var PRESETS = [
    { id: "bank", label: "Licensed bank", partner: false,
      note: "A full service bank, or one being built: accounts, deposits, lending, cards and payments.",
      wants: ["ledger", "accounts", "deposits", "loans", "cards", "payments", "fx", "treasury", "permissions", "channels", "reporting", "regreporting"] },
    { id: "emi", label: "E-money or payment firm", partner: false,
      note: "Regulated to hold customer money for payments. It does not lend, and it safeguards customer funds instead of taking deposits.",
      wants: ["ledger", "accounts", "cards", "payments", "fx", "permissions", "channels", "reporting", "regreporting"] },
    { id: "crypto", label: "Crypto firm", partner: false,
      note: "Custody, trading and moving money in and out, with the bank accounts it needs around them.",
      wants: ["ledger", "accounts", "payments", "custody", "trading", "ramp", "permissions", "channels", "reporting", "regreporting"] },
    { id: "partnered", label: "Fintech on a partner bank", partner: true,
      note: "Using a partner bank's licence and rails. The partner holds the money. You own the customer and the experience.",
      wants: ["ledger", "accounts", "deposits", "cards", "payments", "permissions", "channels", "reporting"] }
  ];

  function wantable() {
    var o = {};
    Catalog.WANT_GROUPS.forEach(function (g) { g.ids.forEach(function (id) { o[id] = true; }); });
    return o;
  }

  /** Every block needed for the chosen ones. Returns { ids, why } where why[id] lists who pulled it in. */
  function closure(chosen) {
    var included = {};
    var why = {};
    function add(id, from) {
      if (!BY_ID[id]) throw new Error("Unknown component " + id);
      if (from) { why[id] = why[id] || []; if (why[id].indexOf(from) < 0) why[id].push(from); }
      if (included[id]) return;
      included[id] = true;
      BY_ID[id].depends.forEach(function (d) { add(d, id); });
    }
    chosen.forEach(function (id) { add(id, null); });
    Catalog.COMPONENTS.forEach(function (c) { if (c.always) add(c.id, null); });
    return { ids: Object.keys(included), why: why };
  }

  /** The score for one block, as a list of labelled parts that add up to the total. */
  function explain(c, ctx) {
    var parts = [];
    parts.push({ label: "Standard across the industry (rated " + c.commodity + " of 5)", delta: c.commodity });
    if (c.diff) parts.push({ label: "Could set a firm apart (rated " + c.diff + " of 5)", delta: -c.diff });
    var team = TEAM[ctx.team] || TEAM.small;
    parts.push({ label: team.label, delta: team.delta });
    var time = TIME[ctx.time] || TIME.mid;
    if (time.delta) parts.push({ label: time.label, delta: time.delta });
    if (c.scale) {
      var vol = VOLUME[ctx.volume] || VOLUME.mid;
      if (vol.delta) parts.push({ label: vol.label, delta: vol.delta });
    }
    if (c.reg >= 4 && ctx.team !== "strong") {
      parts.push({ label: "Heavy legal and audit burden, and no strong team to carry it", delta: HEAVY_RULES_DELTA });
    }
    if ((ctx.edge || []).indexOf(c.id) >= 0) parts.push({ label: "You said this is where you compete", delta: COMPETE_DELTA });
    return parts;
  }

  function band(score) {
    if (score >= BUY_AT) return "buy";
    if (score >= HYBRID_AT) return "hybrid";
    return "build";
  }

  function score(c, ctx) {
    var parts = explain(c, ctx);
    var total = parts.reduce(function (a, p) { return a + p.delta; }, 0);
    return { parts: parts, total: total, band: band(total) };
  }

  var PARTNER_TEXT = "Your partner bank or provider supplies this under its own licence. You still keep your own copy of the records and reconcile with them every day.";

  /** ctx = { team, time, volume, partner: bool, edge: [ids] } */
  function plan(chosen, ctx) {
    ctx = ctx || {};
    ctx.edge = (ctx.edge || []).slice(0, MAX_EDGE);
    var cl = closure(chosen);
    var chosenSet = {};
    chosen.forEach(function (id) { chosenSet[id] = true; });
    var items = cl.ids.map(function (id) {
      var c = BY_ID[id];
      var s = score(c, ctx);
      var rec = s.band;
      var partner = !!(ctx.partner && c.partner);
      if (partner) rec = "partner";
      var state = chosenSet[id] ? "chosen" : (c.always && !(cl.why[id] || []).length ? "always" : "added");
      return {
        id: id, component: c, state: state, because: (cl.why[id] || []).map(function (x) { return BY_ID[x].name; }), becauseIds: (cl.why[id] || []).slice(),
        parts: s.parts, total: s.total, scoreBand: s.band, rec: rec, partnerNote: partner ? PARTNER_TEXT : ""
      };
    });
    items.sort(function (a, b) {
      return a.component.phase - b.component.phase || a.component.depth - b.component.depth || a.component.order - b.component.order;
    });
    var counts = { buy: 0, hybrid: 0, build: 0, partner: 0 };
    items.forEach(function (i) { counts[i.rec] += 1; });
    return {
      items: items,
      counts: counts,
      chosenCount: chosen.length,
      totalCount: items.length,
      edge: ctx.edge
    };
  }

  function meterPos(total) {
    return Math.max(0, Math.min(1, (total - METER_MIN) / (METER_MAX - METER_MIN)));
  }

  /** Blocks and rough effort in each phase of a plan. */
  function phaseSummary(result) {
    return [1, 2, 3].map(function (ph) {
      var items = result.items.filter(function (i) { return i.component.phase === ph; });
      return { phase: ph, count: items.length, effort: items.reduce(function (a, i) { return a + EFFORT_POINTS[i.component.effort]; }, 0) };
    });
  }

  /** The dependency lines of a plan: who relies on whom, both ways. */
  function links(result) {
    var inPlan = {}, neededBy = {}, edges = [];
    result.items.forEach(function (i) { inPlan[i.id] = true; neededBy[i.id] = []; });
    result.items.forEach(function (i) {
      i.component.depends.forEach(function (d) {
        if (inPlan[d]) { edges.push({ from: i.id, to: d }); neededBy[d].push(i.id); }
      });
    });
    return { edges: edges, neededBy: neededBy };
  }

  /** Every block a block ultimately rests on, not counting itself. */
  function rests(id) {
    var seen = {};
    (function walk(x) { BY_ID[x].depends.forEach(function (d) { if (!seen[d]) { seen[d] = true; walk(d); } }); })(id);
    return Object.keys(seen);
  }

  var REC_LABEL = { buy: "Buy", hybrid: "Hybrid", build: "Build", partner: "Partner" };
  var REC_MEANING = {
    buy: "Use a proven product or service. Your effort goes into choosing well and connecting it.",
    hybrid: "Buy a platform or open source base, and build the part that is yours on top.",
    build: "Build it yourself. It is where you differ, or no product fits well enough.",
    partner: "Rely on a partner's licence and systems, and keep your own records alongside."
  };

  function signed(n) { return (n > 0 ? "+" : "") + n; }

  /** A plain text version of a plan, for pasting into an email or a document. */
  function toText(result, ctx, chosen) {
    var L = [];
    L.push("Core banking plan");
    L.push("");
    L.push("What you want to offer: " + (chosen.length ? chosen.map(function (id) { return BY_ID[id].name; }).join(", ") : "nothing chosen"));
    L.push("Your situation: " + (TEAM[ctx.team] || TEAM.small).label + "; " + (TIME[ctx.time] || TIME.mid).label.toLowerCase() + "; " + (VOLUME[ctx.volume] || VOLUME.mid).label.split(":")[0].toLowerCase() + (ctx.partner ? "; relying on a partner bank's licence" : ""));
    if (result.edge.length) L.push("Where you compete: " + result.edge.map(function (id) { return BY_ID[id].name; }).join(", "));
    L.push("");
    L.push(result.totalCount + " building blocks needed: " + result.counts.buy + " buy, " + result.counts.hybrid + " hybrid, " + result.counts.build + " build, " + result.counts.partner + " partner.");
    var phase = 0;
    var names = { 1: "Phase 1: foundation", 2: "Phase 2: products and operations", 3: "Phase 3: specialist" };
    result.items.forEach(function (it) {
      if (it.component.phase !== phase) { phase = it.component.phase; L.push(""); L.push(names[phase]); }
      L.push("- " + it.component.name + ": " + REC_LABEL[it.rec] + " (score " + signed(it.total) + ", effort " + it.component.effort + ")" +
        (it.because.length ? ". Needed by " + it.because.join(", ") : ""));
    });
    L.push("");
    L.push("How to read this: the score is a visible sum. Buy at " + BUY_AT + " or more, hybrid at " + HYBRID_AT + " to under " + BUY_AT + ", build below " + HYBRID_AT + ". It starts a conversation. It is not a procurement decision.");
    return L.join("\n");
  }

  return {
    BY_ID: BY_ID, PRESETS: PRESETS, TEAM: TEAM, TIME: TIME, VOLUME: VOLUME,
    COMPETE_DELTA: COMPETE_DELTA, METER_MIN: METER_MIN, METER_MAX: METER_MAX, EFFORT_POINTS: EFFORT_POINTS, meterPos: meterPos, links: links, rests: rests, phaseSummary: phaseSummary, BUY_AT: BUY_AT, HYBRID_AT: HYBRID_AT, MAX_EDGE: MAX_EDGE,
    REC_LABEL: REC_LABEL, REC_MEANING: REC_MEANING,
    wantable: wantable, closure: closure, explain: explain, score: score, band: band, plan: plan, toText: toText
  };
});
