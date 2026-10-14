import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const R = require("../rulebook.js");
require("../library.js");
const lib = globalThis.RULEBOOK;
const idx = R.build(lib);
const Q = JSON.parse(readFileSync(new URL("./questions.json", import.meta.url)));

test("in-scope questions find an expected passage in the top 3", () => {
  const misses = [];
  Q.answer.forEach((c) => {
    const r = R.ask(idx, c.q);
    const top = r.results.slice(0, 3).map((x) => x.passage.id);
    if (!top.some((id) => c.any.includes(id))) misses.push(c.q + " => " + r.status + " [" + top.join(", ") + "]");
  });
  const rate = 1 - misses.length / Q.answer.length;
  assert.ok(rate >= Q.target_hit_at_3, "hit@3 " + rate.toFixed(2) + "\n" + misses.join("\n"));
});

test("out-of-scope questions are refused or caveated", () => {
  Q.refuse.forEach((c) => {
    const r = R.ask(idx, c.q);
    assert.ok(c.status.includes(r.status), c.q + " got " + r.status);
    if (r.status === "scope" || r.status === "none") assert.equal(r.results.length === 0 || r.status === "none" && r.results.length === 0, true, c.q);
    if (c.note_required) assert.ok(r.notes.length > 0, c.q);
  });
});

test("every passage has what the page shows", () => {
  const ids = new Set();
  lib.passages.forEach((p) => {
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    assert.ok(lib.sources[p.source], p.id);
    ["cite", "topic", "quote", "plain"].forEach((k) => assert.ok(p[k] && p[k].length > 5, p.id + " " + k));
    assert.ok(p.asks.length >= 2, p.id);
  });
});

test("no dashes in text the page shows", () => {
  lib.passages.forEach((p) => {
    ["cite", "topic", "plain"].forEach((k) => assert.ok(!/[–—]/.test(p[k]), p.id + " " + k));
  });
});
