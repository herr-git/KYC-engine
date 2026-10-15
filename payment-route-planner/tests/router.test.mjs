// Checks for the payment route planner. Run: node --test tests/router.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const Catalog = require("../catalog.js");
const Banks = require("../banks.js");
const Router = require("../router.js");

const J = Catalog.JURISDICTIONS;
const base = { from: "DK", to: "BR", amount: 5000, priority: "balanced", when: "weekday", footprint: "global" };
const plan = (o) => Router.plan(Object.assign({}, base, o));

test("every country has a currency, tier, rules and at least one scheme", () => {
  const ccys = new Set();
  for (const j of J) {
    assert.ok(j.id && j.name && j.ccy && j.ccyName, j.id);
    assert.ok(!ccys.has(j.ccy), "one country per currency: " + j.ccy); ccys.add(j.ccy);
    assert.ok([1, 2, 3].includes(j.tier), j.id + " tier");
    assert.ok(j.spread >= 0 && [0, 1, 2].includes(j.control), j.id);
    assert.ok(j.lists.length >= 1, j.id + " sanctions list");
    assert.ok((Catalog.REGS[j.id] || []).length >= 2, j.id + " needs rules");
    assert.ok(Router.SCHEMES_BY_CCY[j.ccy].length >= 1, j.ccy + " needs a scheme");
    assert.ok(Catalog.ACCESS_NOTES[j.ccy] && Catalog.ACCESS_NOTES[j.ccy].length === 2, j.ccy + " access notes");
  }
  assert.ok(J.length >= 20);
  assert.equal(Router.SCHEMES_BY_CCY.USD.length > 0, true);
});

test("every currency the brief asked for is present", () => {
  const have = J.map((j) => j.ccy);
  for (const c of ["EUR", "GBP", "USD", "SGD", "AED", "BRL", "JPY", "AUD"]) assert.ok(have.includes(c), c);
  assert.ok(have.filter((c) => Router.JUR_BY_CCY[c].tier === 3).length >= 5, "exotic currencies");
});

test("schemes are well formed", () => {
  const ids = new Set();
  for (const s of Catalog.SCHEMES) {
    assert.ok(!ids.has(s.id), "duplicate " + s.id); ids.add(s.id);
    assert.ok(Router.JUR_BY_CCY[s.ccy], s.id + " currency");
    assert.ok(["instant", "rtgs", "batch", "wallet"].includes(s.kind), s.id + " kind");
    assert.ok(["24x7", "bizday"].includes(s.hours), s.id + " hours");
    assert.ok(s.speed.best <= s.speed.typ && s.speed.typ <= s.speed.worst, s.id + " speed order");
    assert.ok(s.fixed >= 0 && s.bps >= 0, s.id + " cost");
    assert.ok(s.limit === null || s.limit > 0, s.id + " limit");
    assert.ok(s.access.length > 10, s.id + " access");
    if (s.kind === "instant" || s.kind === "wallet") assert.equal(s.hours, "24x7", s.id + " instant means all hours");
  }
});

test("every currency has a settlement bank and at least two custodians", () => {
  for (const j of J) {
    const by = Banks.BY_CURRENCY[j.ccy];
    assert.ok(by, j.ccy);
    assert.equal(by.filter((e) => e.role === "settlement").length, 1, j.ccy + " settlement");
    assert.ok(by.filter((e) => e.role === "custodian").length >= 2, j.ccy + " custodians");
    for (const e of by) assert.ok(Router.BANK[e.bank], "unknown bank " + e.bank);
  }
});

test("bank data is labelled and any identifier looks like a bank code", () => {
  assert.ok(Banks.META.registry.includes("schwifty"));
  assert.ok(Banks.BANKS.length >= 60);
  let withBic = 0;
  for (const b of Banks.BANKS) {
    assert.ok(b.name && b.country && ["registry", "curated"].includes(b.source), b.id);
    if (b.bic) { withBic++; assert.match(b.bic, /^[A-Z]{6}[A-Z0-9]{2}$/, b.id); assert.equal(b.source, "registry"); }
    else assert.equal(b.source, "curated", b.id + " has no code so it is curated");
  }
  assert.ok(withBic >= 15, "some banks come from the open registry");
  assert.equal(Banks.META.withBic, withBic);
});

test("no em or en dashes anywhere in the content", () => {
  for (const f of ["catalog.js", "router.js", "banks.js", "index.html", "app.js", "README.md"]) {
    const t = readFileSync(new URL("../" + f, import.meta.url), "utf8");
    assert.ok(!/[–—]/.test(t), f + " contains a dash character");
  }
});

test("a plan has ranked routes and every route chains from sender to receiver", () => {
  const p = plan();
  assert.ok(p.routes.length >= 2);
  for (let i = 1; i < p.routes.length; i++) assert.ok(p.routes[i].score >= p.routes[i - 1].score, "ranked");
  for (const r of p.routes) {
    assert.equal(r.legs[0].type, "payin");
    assert.ok(["payout", "swift"].includes(r.legs[r.legs.length - 1].type));
    r.legs.slice(1, -1).forEach((l) => assert.equal(l.type, "fx"));
    assert.equal(r.nodes[0].kind, "src");
    assert.equal(r.nodes[r.nodes.length - 1].kind, "dst");
    assert.equal(r.nodes.length, r.legs.length + 1);
  }
});

test("totals equal the sum of the legs", () => {
  for (const o of [{}, { from: "EA", to: "AE" }, { from: "GB", to: "PH", when: "weekend" }]) {
    for (const r of plan(o).routes) {
      const usd = r.legs.reduce((t, l) => t + l.cost.fees + l.cost.fx + l.cost.partner + l.cost.tax, 0);
      assert.ok(Math.abs(usd - r.totals.usd) < 1e-9);
      const typ = r.legs.reduce((t, l) => t + l.minutes.typ, 0);
      assert.ok(Math.abs(typ - r.totals.minutes.typ) < 1e-9);
      assert.ok(r.totals.minutes.best <= r.totals.minutes.typ && r.totals.minutes.typ <= r.totals.minutes.worst);
      assert.ok(Math.abs(r.totals.pct - usd / 5000 * 100) < 1e-9);
    }
  }
});

test("cheapest never costs more than fastest, and fastest is never slower than cheapest", () => {
  for (const [from, to] of [["DK", "BR"], ["EA", "AE"], ["US", "KE"], ["JP", "SG"], ["GB", "PH"], ["EA", "NG"]]) {
    for (const amount of [200, 5000, 80000]) {
      const c = plan({ from, to, amount, priority: "cheapest" }).routes[0];
      const f = plan({ from, to, amount, priority: "fastest" }).routes[0];
      assert.ok(c.totals.usd <= f.totals.usd + 1e-9, `${from}>${to} ${amount} cost`);
      assert.ok(f.totals.minutes.typ <= c.totals.minutes.typ + 1e-9, `${from}>${to} ${amount} time`);
    }
  }
});

test("fewest hands never uses more hands than the other priorities", () => {
  for (const [from, to] of [["DK", "BR"], ["EA", "AE"], ["JP", "SG"]]) {
    const h = plan({ from, to, priority: "fewest" }).routes[0].totals.hands;
    for (const p of ["cheapest", "fastest", "balanced"]) assert.ok(h <= plan({ from, to, priority: p }).routes[0].totals.hands, p);
  }
});

test("a currency with no account cannot be a pool, so its local scheme is not offered", () => {
  const modes = Router.presetModes("global"); modes.BRL = "none";
  const p = Router.plan(Object.assign({}, base, { modes }));
  assert.ok(p.routes.every((r) => r.legs[r.legs.length - 1].type === "swift"), "only the bank network reaches Brazil");
  assert.ok(p.routes.every((r) => !r.holds.includes("BRL")));
});

test("with a partner, the local scheme appears and is cheaper than the fallback", () => {
  const none = Router.presetModes("global"); none.BRL = "none";
  const partner = Router.presetModes("global"); partner.BRL = "partner";
  const a = Router.plan(Object.assign({}, base, { modes: none })).routes[0];
  const b = Router.plan(Object.assign({}, base, { modes: partner })).routes[0];
  assert.equal(b.final, "Pix");
  assert.ok(b.totals.usd < a.totals.usd);
  assert.ok(b.totals.minutes.typ < a.totals.minutes.typ);
});

test("direct access is cheaper than going through a partner", () => {
  const p = Router.presetModes("global"); p.BRL = "partner";
  const d = Router.presetModes("global"); d.BRL = "direct";
  const a = Router.plan(Object.assign({}, base, { modes: p })).routes[0];
  const b = Router.plan(Object.assign({}, base, { modes: d })).routes[0];
  assert.ok(b.totals.usd < a.totals.usd);
});

test("no account to collect the sender's currency gives no route and a clear reason", () => {
  const p = plan({ footprint: "start" });
  assert.ok(p.noRoute);
  assert.match(p.reason, /DKK/);
  assert.ok(p.acquire.length >= 1 && p.acquire[0].ccy === "DKK");
});

test("scheme caps exclude a scheme and say why", () => {
  const p = plan({ from: "EA", to: "EA", amount: 500000, footprint: "eu-pi" });
  assert.ok(p.excluded.some((e) => e.scheme === "sepa-inst"));
  assert.ok(p.routes.every((r) => r.legs.every((l) => l.scheme !== "sepa-inst")));
  const small = plan({ from: "EA", to: "EA", amount: 500, footprint: "eu-pi", priority: "fastest" });
  assert.ok(small.routes[0].legs.every((l) => l.scheme === "sepa-inst" || l.scheme === undefined));
});

test("a weekend slows business day schemes and widens conversions, but not instant ones", () => {
  const wd = plan({ from: "EA", to: "EA", amount: 500, footprint: "eu-pi", priority: "fastest", when: "weekday" }).routes[0];
  const we = plan({ from: "EA", to: "EA", amount: 500, footprint: "eu-pi", priority: "fastest", when: "weekend" }).routes[0];
  assert.equal(wd.totals.minutes.typ, we.totals.minutes.typ, "instant to instant is unaffected");
  const a = plan({ from: "EA", to: "EA", amount: 500000, footprint: "eu-pi", priority: "cheapest", when: "weekday" }).routes[0];
  const b = plan({ from: "EA", to: "EA", amount: 500000, footprint: "eu-pi", priority: "cheapest", when: "weekend" }).routes[0];
  assert.ok(b.totals.minutes.typ > a.totals.minutes.typ, "SEPA credit transfer waits for Monday");
  const fx1 = plan({ priority: "cheapest", when: "weekday" }).routes[0].totals.cost.fx;
  const fx2 = plan({ priority: "cheapest", when: "weekend" }).routes[0].totals.cost.fx;
  assert.ok(fx2 > fx1, "foreign exchange is dearer when the market is shut");
});

test("conversion cost grows with how thin the currencies are", () => {
  assert.ok(Router.fxPair("USD", "EUR") < Router.fxPair("USD", "BRL"));
  assert.ok(Router.fxPair("EUR", "BRL") < Router.fxPair("GBP", "BRL"), "euro is an anchor, pound is not");
  assert.ok(Router.fxPair("USD", "BRL") < Router.fxPair("USD", "NGN"));
});

test("the receiver's bank converting is dearer than converting yourself", () => {
  const modes = Router.presetModes("global"); modes.BRL = "none";
  const swiftBrl = Router.plan(Object.assign({}, base, { modes })).routes[0];
  const swiftUsd = Router.plan(Object.assign({}, base, { modes, destCcy: "USD" })).routes[0];
  assert.ok(swiftUsd.totals.cost.fx < swiftBrl.totals.cost.fx, "paying in dollars avoids the receiving bank's rate");
});

test("mobile wallet delivery uses a wallet scheme and bank delivery never does", () => {
  const w = plan({ from: "US", to: "KE", amount: 300, delivery: "wallet" });
  assert.ok(w.routes.length >= 1 && w.routes.every((r) => r.final.includes("M-Pesa")));
  const b = plan({ from: "US", to: "KE", amount: 300 });
  assert.ok(b.routes.every((r) => !r.final.includes("M-Pesa")));
});

test("what to acquire: every suggestion improves on the current best and the new access is used", () => {
  const p = plan({ footprint: "eu-pi" });
  assert.ok(p.acquire.length >= 1);
  const base0 = p.routes[0];
  for (const a of p.acquire) {
    assert.ok(a.options.length >= 1);
    for (const o of a.options) {
      assert.ok(o.route.holds.includes(a.ccy), "uses the new access");
      assert.ok(o.route.score < base0.score, "beats the current best");
      assert.ok(o.months[0] > 0 && o.months[1] >= o.months[0]);
      assert.ok(o.saveUsd > 0);
    }
  }
});

test("restricted currencies take longer to set up than open ones", () => {
  const eu = Router.presetModes("start");
  const run = (to) => Router.plan({ from: "EA", to, amount: 2000, priority: "balanced", modes: eu }).acquire.filter((a) => a.options[0].to === "partner");
  const ng = run("NG")[0], dk = run("DK")[0];
  assert.ok(ng && dk);
  assert.ok(ng.options[0].months[1] > dk.options[0].months[1]);
});

test("compliance: dollars bring US sanctions, Brazil brings purpose and tax, Australia brings its report", () => {
  const usd = Router.plan(Object.assign({}, base, { from: "DK", to: "AE" })).routes.find((r) => r.holds.includes("USD"));
  if (usd) assert.ok(usd.compliance.checks.find((c) => c.id === "sanctions").detail.includes("OFAC"));
  const br = plan({ to: "BR" }).routes[0];
  const ids = br.compliance.checks.map((c) => c.id);
  assert.ok(ids.includes("purpose") && ids.includes("tax") && ids.includes("travel"));
  const au = plan({ from: "DK", to: "AU" }).routes[0];
  assert.ok(au.compliance.checks.find((c) => c.id === "report").detail.includes("AUSTRAC"));
  assert.ok(br.compliance.regs.some((r) => r.jur === "BR") && br.compliance.regs.some((r) => r.jur === "DK"));
  assert.ok(br.compliance.globalRegs.some((r) => /FATF/.test(r.name)));
});

test("compliance: data transfer check only when personal data leaves Europe", () => {
  assert.ok(plan({ from: "DK", to: "BR" }).routes[0].compliance.checks.some((c) => c.id === "data"));
  assert.ok(!plan({ from: "DK", to: "EA" }).routes[0].compliance.checks.some((c) => c.id === "data"));
});

test("every check and stage the router uses exists in the catalog", () => {
  const known = new Set(Catalog.CHECKS.map((c) => c.id));
  for (const [from, to] of [["DK", "BR"], ["US", "IN"], ["AU", "CN"], ["EA", "NG"]]) {
    for (const r of plan({ from, to }).routes) {
      for (const c of r.compliance.checks) { assert.ok(known.has(c.id), c.id); assert.ok(c.stage >= 1 && c.stage <= 7); }
      assert.equal(r.stages.length, Catalog.STAGES.length);
    }
  }
  assert.deepEqual(Catalog.STAGES.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7]);
});

test("transfer flow stages name real blueprint blocks", () => {
  const bp = require("../../core-banking-blueprint/catalog.js");
  const names = new Set(bp.COMPONENTS.map((c) => c.name));
  for (const s of Catalog.STAGES) for (const b of s.blocks) assert.ok(names.has(b), "unknown block: " + b);
});

test("corridor matrix: every pair is filled, the diagonal is blank, and it matches a single plan", () => {
  const req = { from: "DK", to: "BR", amount: 5000, priority: "balanced", when: "weekday", footprint: "global" };
  const m = Router.matrix(req);
  assert.equal(m.ids.length, J.length);
  const modes = Router.presetModes("global");
  for (const a of m.ids) for (const b of m.ids) {
    const c = m.cells[a + ">" + b];
    assert.ok(c);
    if (a === b) assert.ok(c.same);
    else if (modes[Router.JUR[a].ccy] === "none") assert.equal(c.ok, false, a + " has no account to collect from");
    else assert.ok(c.ok, a + ">" + b);
  }
  const one = Router.plan(Object.assign({}, req, { from: "DK", to: "BR" })).routes[0];
  assert.ok(Math.abs(m.cells["DK>BR"].pct - one.totals.pct) < 1e-9);
  const g = m.cells["US>EA"].pct, h = m.cells["US>NG"].pct;
  assert.ok(g < h, "dollar to euro is cheaper than dollar to naira");
});

test("a bigger amount lowers the percentage cost on a corridor with fixed fees", () => {
  const small = plan({ from: "EA", to: "AE", amount: 200 }).routes[0].totals.pct;
  const large = plan({ from: "EA", to: "AE", amount: 50000 }).routes[0].totals.pct;
  assert.ok(large < small);
});

test("quicker scheme tips appear when the chosen scheme is slow and a swap is cheap", () => {
  const p = plan({ priority: "cheapest" });
  for (const t of p.routes.flatMap((r) => r.tips)) { assert.ok(t.saved >= 60); assert.ok(typeof t.extra === "number"); }
});

test("plain text helpers", () => {
  assert.equal(Router.minutesText(0.2), "a few seconds");
  assert.equal(Router.minutesText(90), "about an hour");
  assert.equal(Router.minutesText(60 * 30), "about a day");
  assert.equal(Router.minutesText(60 * 24 * 3), "about 3 days");
  assert.equal(Router.money(12.345), "$12.35");
  assert.equal(Router.money(1234.5), "$1,235");
});

// ---------- stablecoins ----------
const coinBase = { from: "EA", to: "BR", amount: 5000, priority: "cheapest", when: "weekend", footprint: "eu-pi", stable: "auto" };
const coinPlan = (o) => Router.plan(Object.assign({}, coinBase, o));

test("stablecoin data is complete", () => {
  for (const c of Catalog.COINS) {
    assert.ok(["USD", "EUR"].includes(c.peg), c.id);
    for (const ch of c.chains) assert.ok(Catalog.CHAINS[ch], c.id + " chain " + ch);
  }
  for (const j of J) {
    assert.ok(["good", "limited", "none"].includes(Catalog.COVERAGE[j.id]), j.id + " coverage");
    assert.ok((Catalog.CRYPTO_REGS[j.id] || []).length >= 1, j.id + " crypto rules");
  }
  assert.equal(Catalog.CRYPTO_STAGES.length, 7);
  const bp = require("../../core-banking-blueprint/catalog.js");
  const names = new Set(bp.COMPONENTS.map((b) => b.name));
  for (const s of Catalog.CRYPTO_STAGES) for (const b of s.blocks) assert.ok(names.has(b), "unknown block: " + b);
  for (const c of Catalog.CRYPTO_CHECKS) assert.ok(c.stage >= 1 && c.stage <= 7, c.id);
});

test("stablecoin is off unless asked for, and the buffer needs a coin", () => {
  const off = Router.plan(Object.assign({}, coinBase, { stable: "off", buffer: true }));
  assert.equal(off.request.stable, "off");
  assert.equal(off.request.buffer, false);
  assert.ok(off.routes.every((r) => !r.coin));
  assert.equal(Router.normalise({ from: "EA", to: "BR", stable: "nonsense" }).stable, "off");
});

test("a coin route is built from on ramp, chain and off ramp, or float and off ramp", () => {
  const p = coinPlan({});
  const r = p.routes.find((x) => x.coin);
  assert.ok(r, "a coin route exists");
  assert.deepEqual(r.legs.map((l) => l.type), ["payin", "onramp", "chain", "offramp"]);
  const f = coinPlan({ buffer: true }).routes.find((x) => x.coin);
  assert.deepEqual(f.legs.map((l) => l.type), ["payin", "buffer", "offramp"]);
  assert.equal(f.nodes.length, f.legs.length + 1);
  assert.equal(r.nodes.length, r.legs.length + 1);
});

test("at the weekend a stablecoin beats the bank network on a thin corridor", () => {
  const p = coinPlan({});
  const bank = p.ways.rows[0], coin = p.ways.rows[1], fl = p.ways.rows[2];
  assert.ok(coin.usesCoin && fl.usesCoin);
  assert.ok(coin.typ < bank.typ / 10, "far faster");
  assert.ok(coin.pct < bank.pct, "cheaper");
  assert.ok(fl.typ <= coin.typ, "a float is at least as fast");
});

test("totals on a coin route equal the sum of its legs", () => {
  for (const o of [{}, { buffer: true }, { priority: "fastest" }]) {
    for (const r of coinPlan(o).routes) {
      const usd = r.legs.reduce((t, l) => t + l.cost.fees + l.cost.fx + l.cost.partner + l.cost.tax, 0);
      assert.ok(Math.abs(usd - r.totals.usd) < 1e-9);
      const typ = r.legs.reduce((t, l) => t + l.minutes.typ, 0);
      assert.ok(Math.abs(typ - r.totals.minutes.typ) < 1e-9);
    }
  }
});

test("USDT is left out when a European party is involved, and allowed elsewhere", () => {
  const eu = coinPlan({ stable: "USDT" });
  assert.ok(eu.routes.every((r) => !r.coin), "no coin route");
  assert.ok(eu.excluded.some((e) => /EU crypto law/.test(e.why) && e.ccy === "USDT"));
  const us = Router.plan({ from: "US", to: "NG", amount: 200, priority: "cheapest", when: "weekend", footprint: "global", stable: "USDT" });
  assert.ok(us.routes[0].coin && us.routes[0].coin.id === "USDT");
});

test("no coin route touches a country where the services are banned", () => {
  const p = Router.plan({ from: "EA", to: "CN", amount: 1000, priority: "balanced", when: "weekday", footprint: "global", stable: "auto" });
  assert.ok(p.routes.every((r) => !r.coin));
  assert.ok(/China/.test(p.ways.why));
  const q = Router.plan({ from: "CN", to: "EA", amount: 1000, priority: "balanced", when: "weekday", footprint: "bank", stable: "auto" });
  assert.ok(q.routes.every((r) => !r.coin));
});

test("a limited cash out market costs more than a good one", () => {
  const find = (to) => Router.search(Router.context({ from: "US", to, amount: 1000, priority: "cheapest", when: "weekday", footprint: "bank", stable: "USDC" }), 400).find((r) => r.coin);
  const good = find("AE"), limited = find("PH");
  const off = (r) => r.legs[r.legs.length - 1];
  assert.equal(off(good).cover, "good");
  assert.equal(off(limited).cover, "limited");
  assert.ok(off(limited).cost.fees > off(good).cost.fees);
});

test("crypto checks and rules appear only when a coin is used", () => {
  const p = coinPlan({ buffer: true });
  const r = p.routes.find((x) => x.coin);
  const ids = r.compliance.checks.map((c) => c.id);
  for (const id of ["wallet", "coin", "peg", "custody", "vasp", "float"]) assert.ok(ids.includes(id), id);
  assert.ok(r.compliance.regs.some((g) => g.crypto && /MiCA/.test(g.name)));
  assert.ok(r.compliance.globalRegs.some((g) => g.crypto));
  assert.equal(r.stages.length, 7);
  const bankRoute = p.routes.find((x) => !x.coin);
  const bankIds = bankRoute.compliance.checks.map((c) => c.id);
  for (const id of ["wallet", "coin", "peg", "custody", "vasp", "float"]) assert.ok(!bankIds.includes(id), id);
  assert.ok(bankRoute.compliance.regs.every((g) => !g.crypto));
  const noFloat = coinPlan({}).routes.find((x) => x.coin).compliance.checks.map((c) => c.id);
  assert.ok(!noFloat.includes("float"));
});

test("treasury compares a bank conversion with a stablecoin", () => {
  const t = Router.treasury({ poolFrom: "EUR", poolTo: "BRL", amount: 100000, priority: "cheapest", when: "weekend", footprint: "bank" });
  assert.ok(t.bank.totals.usd > 0 && t.coin.totals.usd > 0);
  assert.deepEqual(t.coin.legs.map((l) => l.type), ["onramp", "chain", "offramp"]);
  assert.equal(t.bank.nodes.length, 2);
  assert.equal(t.coin.nodes.length, 4);
  const wk = Router.treasury({ poolFrom: "EUR", poolTo: "BRL", amount: 100000, priority: "cheapest", when: "weekend", footprint: "bank" });
  const wd = Router.treasury({ poolFrom: "EUR", poolTo: "BRL", amount: 100000, priority: "cheapest", when: "weekday", footprint: "bank" });
  assert.ok(wk.bank.totals.usd > wd.bank.totals.usd, "bank conversion costs more at the weekend");
  assert.ok(Math.abs(wk.coin.totals.usd - wd.coin.totals.usd) < 1e-6, "the coin leg is the same any day");
  const cn = Router.treasury({ poolFrom: "EUR", poolTo: "CNY", amount: 1000, priority: "cheapest", when: "weekday", footprint: "bank" });
  assert.equal(cn.coin, null);
  assert.ok(cn.why);
});

test("the heat map follows the stablecoin setting", () => {
  const off = Router.matrix({ from: "EA", to: "BR", amount: 5000, priority: "fastest", when: "weekend", footprint: "eu-pi" });
  const on = Router.matrix({ from: "EA", to: "BR", amount: 5000, priority: "fastest", when: "weekend", footprint: "eu-pi", stable: "auto" });
  assert.ok(on.cells["EA>BR"].minutes < off.cells["EA>BR"].minutes);
  assert.equal(on.cells["EA>BR"].coin, "USDC");
});
