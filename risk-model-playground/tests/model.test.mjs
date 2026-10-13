// Checks that the browser scoring logic gives the same answers as the Python engine.
// Run from the playground folder:  node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Model = require("../model.js");
require("../data.js");
const data = globalThis.PLAYGROUND_DATA;

const keys = data.factors.map((f) => f.key);
const defaultRaw = Object.fromEntries(data.factors.map((f) => [f.key, f.defaultWeight]));
const allRulesOn = Object.fromEntries(Model.RULES.map((r) => [r.key, true]));

function settings(overrides = {}) {
  const raw = overrides.raw ?? defaultRaw;
  return {
    weights: Model.normaliseWeights(raw, keys).weights,
    medium: data.defaults.medium,
    high: data.defaults.high,
    elevatedFrom: data.defaults.elevatedFrom,
    mediumIfAtLeast: data.defaults.mediumIfAtLeast,
    highIfAtLeast: data.defaults.highIfAtLeast,
    maxMissingWeight: data.defaults.maxMissingWeight,
    requiredFactors: data.defaults.requiredFactors,
    rules: overrides.rules ?? allRulesOn,
  };
}

test("the data holds 300 synthetic customers", () => {
  assert.equal(data.customers.length, 300);
});

test("at default settings every customer matches the Python engine", () => {
  const s = settings();
  for (const c of data.customers) {
    const r = Model.evaluate(c, s, keys);
    assert.ok(Math.abs(r.score - c.engine.score) < 1e-9, `${c.id} score ${r.score} vs ${c.engine.score}`);
    assert.equal(r.band, c.engine.band, `${c.id} band`);
    assert.equal(r.review, c.engine.review, `${c.id} review flag`);
    assert.deepEqual(r.overrides, c.engine.overrides, `${c.id} overrides`);
  }
});

test("slider values are scaled so the weights add up to one", () => {
  const { weights } = Model.normaliseWeights({ geography: 50, screening: 50 }, keys);
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-12);
  assert.equal(weights.geography, 0.5);
});

test("all-zero sliders fall back to equal weights instead of dividing by zero", () => {
  const out = Model.normaliseWeights(Object.fromEntries(keys.map((k) => [k, 0])), keys);
  assert.equal(out.usedEqualFallback, true);
  assert.ok(Math.abs(out.weights.geography - 1 / keys.length) < 1e-12);
});

test("turning every rule off leaves only the weighted score", () => {
  const off = Object.fromEntries(Model.RULES.map((r) => [r.key, false]));
  const s = settings({ rules: off });
  for (const c of data.customers) {
    const r = Model.evaluate(c, s, keys);
    assert.equal(r.liftedByRule, false);
    assert.equal(r.band, Model.bandForScore(r.score, s));
  }
});

test("without rules, the confirmed sanctions customer is no longer blocked", () => {
  const off = Object.fromEntries(Model.RULES.map((r) => [r.key, false]));
  const c = data.customers.find((x) => x.id === "C005");
  assert.equal(Model.evaluate(c, settings(), keys).band, "blocked");
  assert.notEqual(Model.evaluate(c, settings({ rules: off }), keys).band, "blocked");
});

test("lowering the high cut-off never lowers anyone's band", () => {
  const base = settings();
  const lower = { ...base, high: 40 };
  for (const c of data.customers) {
    const a = Model.evaluate(c, base, keys);
    const b = Model.evaluate(c, lower, keys);
    assert.ok(Model.severity(b.band) >= Model.severity(a.band), c.id);
  }
});

test("ranking puts the most severe band first, then the higher score", () => {
  const s = settings();
  const ranked = Model.rank(data.customers.map((c) => ({ id: c.id, ...Model.evaluate(c, s, keys) })));
  for (let i = 1; i < ranked.length; i++) {
    const prev = ranked[i - 1], cur = ranked[i];
    const d = Model.severity(prev.band) - Model.severity(cur.band);
    assert.ok(d > 0 || (d === 0 && prev.score >= cur.score));
  }
  const blocked = ranked.filter((r) => r.band === "blocked").map((r) => r.id);
  assert.ok(blocked.includes("C005"), "the hand-made sanctions case is blocked");
  assert.deepEqual(ranked.slice(0, blocked.length).map((r) => r.id).sort(), blocked.sort(), "blocked customers rank first");
});
