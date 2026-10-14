import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const Catalog = require("../catalog.js");
const P = require("../planner.js");

const ids = Catalog.COMPONENTS.map((c) => c.id);
const ctxOf = (team, time, volume, extra) => Object.assign({ team, time, volume, partner: false, edge: [] }, extra || {});

test("every component is complete and well formed", () => {
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  const layers = new Set(Catalog.LAYERS.map((l) => l.id));
  Catalog.COMPONENTS.forEach((c) => {
    assert.ok(layers.has(c.layer), c.id + " layer");
    assert.ok(c.name && c.name.length > 5, c.id + " name");
    ["plain", "why"].forEach((k) => assert.ok(c[k] && c[k].length > 20, c.id + " " + k));
    assert.ok(c.includes.length >= 3, c.id + " includes");
    assert.ok(c.options.length >= 1, c.id + " options");
    assert.ok(c.pitfalls.length >= 2, c.id + " pitfalls");
    assert.ok(c.ask.length >= 2, c.id + " ask");
    ["commodity", "diff", "reg"].forEach((k) => assert.ok(c[k] >= 0 && c[k] <= 5, c.id + " " + k));
    assert.ok([1, 2, 3].includes(c.phase), c.id + " phase");
    assert.ok(["S", "M", "L", "XL"].includes(c.effort), c.id + " effort");
    c.depends.forEach((d) => assert.ok(ids.includes(d), c.id + " depends on unknown " + d));
  });
});

test("dependencies have no cycles", () => {
  const state = {};
  function visit(id, path) {
    if (state[id] === 2) return;
    assert.notEqual(state[id], 1, "cycle: " + path.concat(id).join(" > "));
    state[id] = 1;
    P.BY_ID[id].depends.forEach((d) => visit(d, path.concat(id)));
    state[id] = 2;
  }
  ids.forEach((id) => visit(id, []));
});

test("a block never comes before something it depends on", () => {
  Catalog.COMPONENTS.forEach((c) => c.depends.forEach((d) => {
    assert.ok(P.BY_ID[d].phase <= c.phase, c.id + " (phase " + c.phase + ") depends on " + d + " (phase " + P.BY_ID[d].phase + ")");
  }));
  const r = P.plan(ids, ctxOf("small", "mid", "mid"));
  const pos = {};
  r.items.forEach((it, k) => { pos[it.id] = k; });
  r.items.forEach((it) => it.component.depends.forEach((d) => {
    assert.ok(pos[d] < pos[it.id], d + " should come before " + it.id);
  }));
});

test("choosing lending pulls in what lending needs", () => {
  const r = P.plan(["loans"], ctxOf("small", "mid", "mid"));
  const got = r.items.map((i) => i.id);
  ["accounts", "ledger", "customer", "credit_decision", "product_engine", "case_mgmt", "audit", "platform", "integration"].forEach((id) =>
    assert.ok(got.includes(id), "missing " + id));
  const accounts = r.items.find((i) => i.id === "accounts");
  assert.equal(accounts.state, "added");
  assert.ok(accounts.because.length > 0);
  assert.equal(r.items.find((i) => i.id === "loans").state, "chosen");
});

test("the foundation is always present, even with nothing chosen", () => {
  const got = P.plan([], ctxOf("small", "mid", "mid")).items.map((i) => i.id);
  assert.deepEqual(got.sort(), ["audit", "integration", "platform"]);
});

test("the score is exactly the sum of the lines shown", () => {
  const r = P.plan(ids, ctxOf("none", "short", "small", { edge: ["ledger"] }));
  r.items.forEach((it) => {
    const sum = it.parts.reduce((a, p) => a + p.delta, 0);
    assert.equal(it.total, sum, it.id);
    assert.equal(it.scoreBand, P.band(it.total));
  });
});

test("more engineering strength, more time and more volume never push toward buying", () => {
  const order = [["none", "small", "strong"], ["short", "mid", "long"], ["small", "mid", "large"]];
  Catalog.COMPONENTS.forEach((c) => {
    for (let a = 0; a < 2; a++) for (let t = 0; t < 2; t++) for (let v = 0; v < 2; v++) {
      const lo = P.score(c, ctxOf(order[0][a], order[1][t], order[2][v])).total;
      const hi = P.score(c, ctxOf(order[0][a + 1], order[1][t + 1], order[2][v + 1])).total;
      assert.ok(hi <= lo, c.id + " score rose when the team, time and volume grew");
    }
  });
});

test("sensible answers at the extremes", () => {
  const weak = ctxOf("none", "short", "small");
  const strong = ctxOf("strong", "long", "large");
  const rec = (id, ctx) => P.plan([id], ctx).items.find((i) => i.id === id).rec;
  // Things almost nobody builds are bought in every setting.
  ["sanctions", "chain_analytics", "platform"].forEach((id) => {
    assert.equal(rec(id, weak), "buy", id + " weak");
  });
  assert.equal(rec("cards", weak), "buy");
  assert.equal(rec("kyc", weak), "buy");
  // Things that set a firm apart are built when the team is strong.
  assert.equal(rec("channels", strong), "build");
  assert.equal(rec("product_engine", strong), "build");
  assert.equal(rec("credit_decision", weak), "hybrid");
  assert.equal(rec("credit_decision", strong), "build");
  // The ledger is the interesting middle case.
  assert.equal(rec("ledger", weak), "buy");
  assert.equal(rec("ledger", strong), "build");
});

test("marking a block as your edge always lowers its score by the same amount", () => {
  Catalog.COMPONENTS.forEach((c) => {
    const base = P.score(c, ctxOf("small", "mid", "mid")).total;
    const edge = P.score(c, ctxOf("small", "mid", "mid", { edge: [c.id] })).total;
    assert.equal(edge, base + P.COMPETE_DELTA, c.id);
  });
});

test("only three edges count", () => {
  const r = P.plan(["ledger"], ctxOf("small", "mid", "mid", { edge: ["ledger", "accounts", "channels", "cards"] }));
  assert.equal(r.edge.length, P.MAX_EDGE);
});

test("the partner case marks supplied blocks and leaves others alone", () => {
  const r = P.plan(["accounts", "cards", "channels"], ctxOf("small", "mid", "mid", { partner: true }));
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  assert.equal(by.accounts.rec, "partner");
  assert.equal(by.ledger.rec, "partner");
  assert.equal(by.cards.rec, "partner");
  assert.ok(by.accounts.partnerNote.length > 20);
  assert.notEqual(by.channels.rec, "partner");
  assert.notEqual(by.customer.rec, "partner");
  const off = P.plan(["accounts"], ctxOf("small", "mid", "mid", { partner: false }));
  assert.equal(off.items.some((i) => i.rec === "partner"), false);
});

test("counts add up and every preset only offers choosable items", () => {
  const want = P.wantable();
  P.PRESETS.forEach((p) => {
    p.wants.forEach((id) => assert.ok(want[id], p.id + " offers " + id));
    const r = P.plan(p.wants, ctxOf("small", "mid", "mid", { partner: p.partner }));
    const c = r.counts;
    assert.equal(c.buy + c.hybrid + c.build + c.partner, r.totalCount, p.id);
    assert.ok(r.totalCount > r.chosenCount, p.id + " should pull in supporting blocks");
  });
});

test("crypto choices pull in the crypto stack", () => {
  const got = P.plan(["custody"], ctxOf("small", "mid", "mid")).items.map((i) => i.id);
  ["chain_connect", "crypto_ledger", "ledger", "recon", "permissions"].forEach((id) => assert.ok(got.includes(id), id));
  const ramp = P.plan(["ramp"], ctxOf("small", "mid", "mid")).items.map((i) => i.id);
  ["travel_rule", "chain_analytics", "payments", "sanctions"].forEach((id) => assert.ok(ramp.includes(id), id));
});

test("text export names every block and the rule used", () => {
  const ctx = ctxOf("small", "mid", "mid");
  const chosen = ["accounts", "payments"];
  const r = P.plan(chosen, ctx);
  const t = P.toText(r, ctx, chosen);
  r.items.forEach((i) => assert.ok(t.includes(i.component.name), i.id));
  assert.ok(t.includes("not a procurement decision"));
});

test("no em or en dashes anywhere in the content", () => {
  const dash = /[\u2013\u2014]/;
  const check = (v, path) => {
    if (typeof v === "string") assert.ok(!dash.test(v), path + ": " + v);
    else if (Array.isArray(v)) v.forEach((x, i) => check(x, path + "[" + i + "]"));
    else if (v && typeof v === "object") Object.keys(v).forEach((k) => check(v[k], path + "." + k));
  };
  check(Catalog, "catalog");
  check(P.PRESETS, "presets");
  check([P.TEAM, P.TIME, P.VOLUME, P.REC_MEANING], "labels");
});

test("every block has a short name, and the walk throughs only name real blocks", () => {
  Catalog.COMPONENTS.forEach((c) => assert.ok(c.short && c.short.length >= 4 && c.short.length <= 28, c.id + " short"));
  assert.ok(Catalog.FLOWS.length >= 2);
  Catalog.FLOWS.forEach((f) => {
    assert.ok(f.steps.length >= 5, f.id);
    f.steps.forEach((s) => { assert.ok(P.BY_ID[s.block], f.id + " names unknown block " + s.block); assert.ok(s.text.length > 5); });
  });
});

test("the verdict meter moves up with the score and stays inside the track", () => {
  let last = -1;
  for (let v = -15; v <= 20; v++) {
    const pos = P.meterPos(v);
    assert.ok(pos >= 0 && pos <= 1 && pos >= last, "pos at " + v);
    last = pos;
  }
  // the zones the page draws line up with the bands
  assert.ok(P.meterPos(P.HYBRID_AT) > P.meterPos(P.HYBRID_AT - 1));
  assert.ok(P.meterPos(P.BUY_AT) > P.meterPos(P.HYBRID_AT));
  const all = P.plan(ids, ctxOf("none", "short", "small", { edge: ["ledger"] }));
  all.items.forEach((i) => assert.ok(i.total >= P.METER_MIN && i.total <= P.METER_MAX, i.id + " score " + i.total + " is off the meter"));
  const strong = P.plan(ids, ctxOf("strong", "long", "large", { edge: ["ledger", "accounts", "channels"] }));
  strong.items.forEach((i) => assert.ok(i.total >= P.METER_MIN && i.total <= P.METER_MAX, i.id + " score " + i.total + " is off the meter"));
});

test("phase summary adds up to the plan", () => {
  const r = P.plan(["loans", "custody"], ctxOf("small", "mid", "mid"));
  const s = P.phaseSummary(r);
  assert.equal(s.length, 3);
  assert.equal(s.reduce((a, x) => a + x.count, 0), r.totalCount);
  const effort = r.items.reduce((a, i) => a + P.EFFORT_POINTS[i.component.effort], 0);
  assert.equal(s.reduce((a, x) => a + x.effort, 0), effort);
});

test("dependency lines match the catalog and run both ways", () => {
  const r = P.plan(["loans", "custody"], ctxOf("small", "mid", "mid"));
  const { edges, neededBy } = P.links(r);
  const inPlan = new Set(r.items.map((i) => i.id));
  const expected = r.items.reduce((a, i) => a + i.component.depends.filter((d) => inPlan.has(d)).length, 0);
  assert.equal(edges.length, expected);
  edges.forEach((e) => {
    assert.ok(inPlan.has(e.from) && inPlan.has(e.to));
    assert.ok(P.BY_ID[e.from].depends.includes(e.to));
    assert.ok(neededBy[e.to].includes(e.from));
  });
  // every block that is relied on lists who relies on it
  r.items.forEach((i) => i.component.depends.forEach((d) => assert.ok(neededBy[d].includes(i.id), d + " should list " + i.id)));
  // a plan always contains whatever its blocks rely on, so no line points outside it
  r.items.forEach((i) => P.rests(i.id).forEach((d) => assert.ok(inPlan.has(d), i.id + " rests on missing " + d)));
});

test("how much a block rests on grows as you go up the stack", () => {
  assert.equal(P.rests("ledger").length, 1);
  assert.ok(P.rests("accounts").length > P.rests("ledger").length);
  assert.ok(P.rests("loans").length > P.rests("accounts").length);
  assert.ok(P.rests("ramp").length > P.rests("custody").length);
  assert.equal(P.rests("loans").includes("loans"), false);
});
