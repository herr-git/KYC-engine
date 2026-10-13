// Checks that the browser rules give the same answers as the Python reference rules.
// Run from this folder:  node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const Monitor = require("../monitor.js");
require("../data.js");
const data = globalThis.MONITOR_DATA;
const expected = JSON.parse(readFileSync(new URL("./expected.json", import.meta.url), "utf8"));
const customers = data.customers;
const scores = data.countries;

function only(key, level, tighten = false) {
  return { tighten, rules: { [key]: { on: true, level } } };
}

test("the data holds 400 synthetic customers, 32 of them planted real problems", () => {
  assert.equal(customers.length, 400);
  assert.equal(customers.filter((c) => c.real).length, 32);
  assert.equal(data.meta.realCount, 32);
});

test("setting lists and defaults match the Python reference", () => {
  for (const r of Monitor.RULES) {
    assert.deepEqual(r.levels, expected.levels[r.key], r.key);
    assert.equal(r.defaultLevel, expected.defaultLevel[r.key], r.key);
  }
});

test("every rule at every setting flags the same customers as Python, with and without extra scrutiny", () => {
  let checked = 0;
  for (const r of Monitor.RULES) {
    for (let level = 0; level < r.levels.length; level++) {
      for (const tighten of [false, true]) {
        const got = Monitor.evaluate(customers, only(r.key, level, tighten), scores).map((f) => f.customer.id);
        const want = expected.single[`${r.key}:${level}:${tighten ? 1 : 0}`];
        assert.deepEqual(got, want, `${r.key} level ${level} tighten ${tighten}`);
        checked++;
      }
    }
  }
  assert.equal(checked, 2 * (10 + 10 + 6 + 5 + 6 + 7 + 1));
});

test("the payments that trigger each rule match Python at default settings", () => {
  const flagged = Monitor.evaluate(customers, Monitor.defaultSettings(), scores);
  assert.deepEqual(flagged.map((f) => f.customer.id), expected.defaultFlagged);
  let n = 0;
  for (const f of flagged) {
    for (const [key, idx] of Object.entries(f.hits)) {
      assert.deepEqual(idx, expected.defaultTriggers[`${f.customer.id}:${key}`], `${f.customer.id} ${key}`);
      n++;
    }
  }
  assert.equal(n, Object.keys(expected.defaultTriggers).length);
});

test("a rule switched off flags nobody, and no rules on means no alerts", () => {
  const s = Monitor.defaultSettings();
  for (const k of Object.keys(s.rules)) s.rules[k].on = false;
  assert.equal(Monitor.evaluate(customers, s, scores).length, 0);
  const t = Monitor.tally([], customers);
  assert.equal(t.flagged, 0);
  assert.equal(t.precision, null);
  assert.equal(t.missed, 32);
});

test("making a rule stricter never flags more customers", () => {
  for (const r of Monitor.RULES) {
    const curve = Monitor.sweep(r.key, customers, false, scores);
    // Levels run from loosest to strictest, so alerts must not rise along the list.
    for (let i = 1; i < curve.length; i++) {
      assert.ok(curve[i].flagged <= curve[i - 1].flagged, `${r.key} level ${i}`);
    }
  }
});

test("extra scrutiny only ever adds alerts, and only for high-risk customers", () => {
  for (const key of ["large", "many"]) {
    for (let level = 0; level < Monitor.BY_KEY[key].levels.length; level++) {
      const plain = new Set(Monitor.evaluate(customers, only(key, level, false), scores).map((f) => f.customer.id));
      const tight = Monitor.evaluate(customers, only(key, level, true), scores).map((f) => f.customer);
      for (const id of plain) assert.ok(tight.some((c) => c.id === id), `${key} ${level} lost ${id}`);
      for (const c of tight) if (!plain.has(c.id)) assert.ok(Monitor.isHigh(c), `${c.id} is not high risk`);
    }
  }
});

test("tally counts caught, false alarms and missed so they add up", () => {
  const flagged = Monitor.evaluate(customers, Monitor.defaultSettings(), scores);
  const t = Monitor.tally(flagged, customers);
  assert.equal(t.caught + t.falseAlarms, t.flagged);
  assert.equal(t.caught + t.missed, t.realTotal);
  assert.equal(t.realTotal + t.fineTotal, 400);
});

test("each planted pattern is caught by the rule it was built to trip, at default settings", () => {
  const want = {
    structuring: "justUnder", passThrough: "passThrough", corridor: "country",
    mixing: "mixer", dormantSpike: "spike", rapidFire: "many",
  };
  const flagged = new Map(Monitor.evaluate(customers, Monitor.defaultSettings(), scores).map((f) => [f.customer.id, f.hits]));
  for (const [pattern, rule] of Object.entries(want)) {
    const group = customers.filter((c) => c.pattern === pattern);
    assert.ok(group.length > 0, pattern);
    const hit = group.filter((c) => flagged.get(c.id) && flagged.get(c.id)[rule]).length;
    assert.ok(hit >= group.length - 2, `${pattern}: only ${hit} of ${group.length} trip ${rule}`);
  }
});

test("the stealth pattern slips past every rule at default settings", () => {
  const flagged = new Set(Monitor.evaluate(customers, Monitor.defaultSettings(), scores).map((f) => f.customer.id));
  const stealth = customers.filter((c) => c.pattern === "stealth");
  assert.equal(stealth.length, 3);
  for (const c of stealth) assert.ok(!flagged.has(c.id), c.id);
});

test("hand-made payments: boundaries of the rules", () => {
  const c = (p, extra = {}) => ({ id: "X", band: "low", typical: 50, real: false, p, ...extra });
  const s = (key, level, tighten = false) => Monitor.triggers(c([]), key, level, tighten, scores);
  // large: at the limit counts, one euro below does not
  assert.equal(Monitor.BY_KEY.large.find(c([[0, 1, 5000, "DK", 0, 0]]), 3, false, scores).length, 1);
  assert.equal(Monitor.BY_KEY.large.find(c([[0, 1, 4999, "DK", 0, 0]]), 3, false, scores).length, 0);
  // just under: 10,000 itself is not "just under"; the week window excludes day seven exactly
  const day = 1440;
  const three = [[0, 1, 9000, "DK", 0, 0], [day, 1, 9999, "DK", 0, 0], [6 * day, 1, 9500, "DK", 0, 0]];
  assert.equal(Monitor.BY_KEY.justUnder.find(c(three), 1, false, scores).length, 3);
  const late = [[0, 1, 9000, "DK", 0, 0], [day, 1, 9999, "DK", 0, 0], [7 * day, 1, 9500, "DK", 0, 0]];
  assert.equal(Monitor.BY_KEY.justUnder.find(c(late), 1, false, scores).length, 0);
  const ten = [[0, 1, 10000, "DK", 0, 0], [day, 1, 9999, "DK", 0, 0], [2 * day, 1, 9500, "DK", 0, 0]];
  assert.equal(Monitor.BY_KEY.justUnder.find(c(ten), 1, false, scores).length, 0);
  // pass-through: exactly 90% out inside the window counts, 89% does not
  const pipe = (out) => [[0, 0, 10000, "DE", 0, 0], [600, 1, out, "AE", 1, 0]];
  assert.equal(Monitor.BY_KEY.passThrough.find(c(pipe(9000)), 2, false, scores).length, 2);
  assert.equal(Monitor.BY_KEY.passThrough.find(c(pipe(8900)), 2, false, scores).length, 0);
  // spike ignores money coming in
  assert.equal(Monitor.BY_KEY.spike.find(c([[0, 0, 5000, "DK", 0, 0]]), 3, false, scores).length, 0);
  assert.equal(Monitor.BY_KEY.spike.find(c([[0, 1, 5000, "DK", 0, 0]]), 3, false, scores).length, 1);
  // extra scrutiny halves the amount limit for high-risk customers only
  const big = [[0, 1, 2600, "DK", 0, 0]];
  assert.equal(Monitor.BY_KEY.large.find(c(big, { band: "high" }), 3, true, scores).length, 1);
  assert.equal(Monitor.BY_KEY.large.find(c(big, { band: "low" }), 3, true, scores).length, 0);
  assert.equal(s("mixer", 0).length, 0);
});
