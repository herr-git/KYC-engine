/* The router. Given a transfer (from where, to where, how much, what matters most, when, and what
 * accounts the firm has), it finds the best ways to get the money there.
 *
 * Think of a small map. The sender's bank is the start. The receiver's bank is the end. In between sit
 * pools: one account per currency that the firm holds at a local custodian bank. The moves are:
 *   pay in   from the sender into the pool in the sender's currency, over that country's local scheme
 *   convert  from one pool to another, with a liquidity provider
 *   pay out  from a pool to the receiver, over the receiver's local scheme
 *   swift    from a pool to the receiver through a chain of correspondent banks (the fallback)
 *   stablecoin (optional)  on ramp into a coin, send it on a chain, off ramp into the receiver's local scheme,
 *            or draw from a prefunded float at the receiving end
 *
 * Every move has a cost and a time. A route is a sequence of moves, and its score is a plain sum of the
 * moves, so the page can show it line by line. The same search fills the corridor heat map.
 *
 * All numbers come from catalog.js and are illustrative. Works in the browser and in Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./catalog.js"), require("./banks.js"));
  else root.Router = factory(root.PrcCatalog, root.Banks);
})(typeof self !== "undefined" ? self : this, function (Catalog, Banks) {
  "use strict";

  var M = Catalog.MODEL;
  var JUR = {}, JUR_BY_CCY = {}, BANK = {}, SCHEMES_BY_CCY = {}, SCHEME = {};
  Catalog.JURISDICTIONS.forEach(function (j) { JUR[j.id] = j; JUR_BY_CCY[j.ccy] = j; SCHEMES_BY_CCY[j.ccy] = []; });
  Catalog.SCHEMES.forEach(function (s) { SCHEMES_BY_CCY[s.ccy].push(s); SCHEME[s.id] = s; });
  Banks.BANKS.forEach(function (b) { BANK[b.id] = b; });
  var CCYS = Catalog.JURISDICTIONS.map(function (j) { return j.ccy; });
  var WHEN = { weekday: 0, evening: 1, weekend: 2 };

  var TAX_BPS = { BRL: 40 };   // placeholder: a tax on conversions into the currency, rate depends on the purpose
  var REPORTS = {
    AU: "International funds transfer instruction report to AUSTRAC",
    CA: "Electronic funds transfer report to FINTRAC for 10,000 Canadian dollars or more",
    JP: "Payment report under the foreign exchange act above a set amount",
    BR: "Foreign exchange operation reported to the central bank",
    IN: "Purpose code reported to the central bank through the authorised dealer",
    CN: "Cross-border receipt and payment reported through the bank to the foreign exchange regulator"
  };
  var ANNUAL_CAP = {
    IN: "India: individuals sending money abroad are limited each year by the central bank's remittance scheme.",
    CN: "China: individuals have an annual conversion quota, and business payments need supporting documents.",
    NG: "Nigeria: foreign exchange access follows central bank circulars that change often.",
    ZA: "South Africa: individuals have an annual allowance for sending money abroad."
  };

  // ---------- small helpers ----------
  function sum(a) { return a.reduce(function (t, x) { return t + x; }, 0); }
  function round(n, d) { var k = Math.pow(10, d || 0); return Math.round(n * k) / k; }
  function money(n) {
    if (n >= 100) return "$" + Math.round(n).toLocaleString("en-US");
    if (n >= 1) return "$" + n.toFixed(2);
    return "$" + n.toFixed(2);
  }
  function minutesText(m) {
    if (m < 1) return "a few seconds";
    if (m < 2) return "about a minute";
    if (m < 60) return "about " + Math.round(m) + " minutes";
    var h = m / 60;
    if (h < 2) return "about an hour";
    if (h < 24) return "about " + Math.round(h) + " hours";
    var d = h / 24;
    if (d < 1.5) return "about a day";
    return "about " + Math.round(d) + " days";
  }
  function custodianOf(ccy) {
    var list = (Banks.BY_CURRENCY[ccy] || []).filter(function (e) { return e.role === "custodian"; });
    return list.length ? BANK[list[0].bank] : null;
  }
  function settlementOf(ccy) {
    var list = (Banks.BY_CURRENCY[ccy] || []).filter(function (e) { return e.role === "settlement"; });
    return list.length ? BANK[list[0].bank] : null;
  }
  function presetModes(id) {
    var p = Catalog.FOOTPRINTS.filter(function (f) { return f.id === id; })[0] || Catalog.FOOTPRINTS[0];
    var out = {}; CCYS.forEach(function (c) { out[c] = p.modes[c]; });
    return out;
  }

  var STABLE_CHOICES = ["off", "auto"].concat(Catalog.COINS.map(function (c) { return c.id; }));
  function normalise(req) {
    var r = {
      from: req.from, to: req.to,
      amount: Math.max(1, +req.amount || 1000),
      priority: M.priorities[req.priority] ? req.priority : "balanced",
      when: WHEN[req.when] !== undefined ? req.when : "weekday",
      delivery: req.delivery === "wallet" ? "wallet" : "bank",
      modes: {}
    };
    r.stable = STABLE_CHOICES.indexOf(req.stable) >= 0 ? req.stable : "off";
    r.buffer = r.stable !== "off" && !!req.buffer;
    var base = req.modes || presetModes(req.footprint || "eu-pi");
    CCYS.forEach(function (c) { r.modes[c] = base[c] === "direct" || base[c] === "partner" ? base[c] : "none"; });
    r.destCcy = req.destCcy && JUR_BY_CCY[req.destCcy] ? req.destCcy : JUR[r.to].ccy;
    return r;
  }

  // ---------- legs ----------
  function waitMinutes(s, when) {
    if (s.hours === "24x7" || s.kind === "instant" || s.kind === "wallet") return 0;
    return M.wait[s.kind === "batch" ? "batch" : "rtgs"][WHEN[when]];
  }
  function partnerCost(ccy, amount) {
    var tier = JUR_BY_CCY[ccy].tier;
    return M.partner.fixed + amount * M.partner.bps[tier - 1] / 10000;
  }
  function fxPair(a, b) {
    var anchored = a === "USD" || a === "EUR" || b === "USD" || b === "EUR";
    return JUR_BY_CCY[a].spread + JUR_BY_CCY[b].spread + (anchored ? 0 : M.crossPenalty);
  }
  function pool(ccy, modes) {
    var bank = custodianOf(ccy);
    return { kind: "hold", ccy: ccy, mode: modes[ccy], bank: bank ? bank.name : "a local custodian bank", bic: bank && bank.bic ? bank.bic : null };
  }

  function schemeLeg(type, s, ccy, R) {
    var mode = R.modes[ccy];
    var fee = s.fixed + R.amount * s.bps / 10000;
    var partner = mode === "partner" ? partnerCost(ccy, R.amount) : 0;
    var wait = waitMinutes(s, R.when);
    var extra = mode === "partner" ? M.partnerSpeed : { best: 0, typ: 0, worst: 0 };
    var j = JUR_BY_CCY[ccy];
    return {
      type: type, scheme: s.id, schemeName: s.name, ccy: ccy, mode: mode,
      cost: { fees: fee, fx: 0, partner: partner, tax: 0 },
      minutes: { best: s.speed.best + extra.best, typ: s.speed.typ + wait + extra.typ, worst: s.speed.worst + wait + extra.worst },
      wait: wait, hands: 1 + (mode === "partner" ? 1 : 0),
      text: (type === "payin" ? "Collect " + ccy + " from the sender by " : "Pay out in " + ccy + " by ") + s.name + (mode === "partner" ? ", through a local partner" : ""),
      jur: j.id
    };
  }
  function fxLeg(a, b, R) {
    var bps = fxPair(a, b) + (R.when === "weekend" ? M.weekendFx : 0);
    var controlled = JUR_BY_CCY[a].control > 0 || JUR_BY_CCY[b].control > 0;
    var sp = controlled ? M.fxSpeedControlled : M.fxSpeed;
    var tax = TAX_BPS[b] ? R.amount * TAX_BPS[b] / 10000 : 0;
    return {
      type: "fx", from: a, to: b, ccy: b,
      cost: { fees: 0, fx: M.fxFixed + R.amount * bps / 10000, partner: 0, tax: tax },
      minutes: { best: sp.best, typ: sp.typ, worst: sp.worst },
      wait: 0, hands: 1, bps: bps,
      text: "Convert " + a + " to " + b + " with a liquidity provider" + (R.when === "weekend" ? " (market closed, wider spread)" : ""),
      jur: null
    };
  }
  function swiftLeg(holdCcy, R) {
    var dj = JUR[R.to], w = M.swift;
    var banks = w.banks[dj.tier - 1];
    var fee = w.fixed + w.perBank * banks + w.beneficiaryFee + R.amount * w.bps / 10000;
    var convBps = 0;
    if (holdCcy !== R.destCcy) convBps = w.convertBps[dj.tier - 1] + (dj.control >= 2 ? w.convertControl : 0);
    var sp = w.speed[dj.tier - 1];
    var wait = M.wait.rtgs[WHEN[R.when]];
    var partner = R.modes[holdCcy] === "partner" ? partnerCost(holdCcy, R.amount) * 0.5 : 0;
    return {
      type: "swift", ccy: holdCcy, mode: R.modes[holdCcy], banks: banks, converts: holdCcy !== R.destCcy,
      cost: { fees: fee, fx: R.amount * convBps / 10000, partner: partner, tax: 0 },
      minutes: { best: sp.best, typ: sp.typ + wait, worst: sp.worst + wait },
      wait: wait, hands: banks + 1 + (R.modes[holdCcy] === "partner" ? 1 : 0),
      text: "Send " + holdCcy + " through the bank network (SWIFT), about " + banks + " bank" + (banks > 1 ? "s" : "") + " in between" +
        (holdCcy !== R.destCcy ? ", and the receiver's bank converts at its own rate" : ""),
      jur: dj.id
    };
  }


  // ---------- stablecoin legs ----------
  var ST = M.stable, COIN = {};
  Catalog.COINS.forEach(function (c) { COIN[c.id] = c; });
  function coverageOf(jurId) { return Catalog.COVERAGE[jurId] || "limited"; }
  function hasInstant(ccy) { return SCHEMES_BY_CCY[ccy].some(function (s) { return s.hours === "24x7" || s.kind === "instant"; }); }
  function pctBps(n) { return n / 10000; }

  // Local money in the pool becomes coins at a licensed on ramp.
  function onrampLeg(h, coin, R) {
    var j = JUR_BY_CCY[h], cov = coverageOf(j.id);
    if (cov === "none") return null;
    var peg = COIN[coin].peg, conv = h !== peg;
    var wait = hasInstant(h) ? 0 : M.wait.rtgs[WHEN[R.when]];
    var partner = R.modes[h] === "partner" ? partnerCost(h, R.amount) * 0.5 : 0;
    var bps = ST.onramp[cov] + (conv ? fxPair(h, peg) : 0);
    return {
      type: "onramp", coin: coin, ccy: h, from: h, to: coin, converts: conv, mode: R.modes[h], cover: cov,
      cost: { fees: ST.onramp.fixed + R.amount * pctBps(ST.onramp[cov]), fx: conv ? R.amount * pctBps(fxPair(h, peg)) : 0, partner: partner, tax: 0 },
      minutes: { best: ST.onSpeed.best, typ: ST.onSpeed.typ + wait, worst: ST.onSpeed.worst + wait },
      wait: wait, hands: 1 + (partner ? 1 : 0), bps: bps,
      text: "Buy " + coin + " with " + h + " at a licensed on ramp" + (conv ? " (includes the conversion)" : ""),
      jur: j.id
    };
  }
  // Coins move between two wallets on a blockchain.
  function chainLeg(coin, chainId, R) {
    var ch = Catalog.CHAINS[chainId];
    return {
      type: "chain", coin: coin, chain: chainId, ccy: null,
      cost: { fees: ch.fee + R.amount * pctBps(ST.chainOps), fx: 0, partner: 0, tax: 0 },
      minutes: { best: ch.speed.best, typ: ch.speed.typ, worst: ch.speed.worst },
      wait: 0, hands: 1,
      text: "Send " + coin + " on " + ch.name + " to the wallet at the receiving end", jur: null
    };
  }
  function bestChain(coin, R) {
    var best = null;
    COIN[coin].chains.forEach(function (id) {
      var l = chainLeg(coin, id, R); l.w = weightOf(l, R);
      if (!best || l.w < best.w) best = l;
    });
    return best;
  }
  // Coins become local money and go out over the receiver's local scheme, by a partner who holds the licence there.
  function offrampLegs(coin, R, fits) {
    var out = [], dest = JUR[R.to], cov = coverageOf(dest.id);
    if (cov === "none" || dest.ccy !== R.destCcy) return out;
    var peg = COIN[coin].peg, conv = dest.ccy !== peg;
    SCHEMES_BY_CCY[dest.ccy].forEach(function (s) {
      if ((R.delivery === "wallet") !== (s.kind === "wallet")) return;
      if (!fits(s)) return;
      var wait = waitMinutes(s, R.when), spread = conv ? fxPair(peg, dest.ccy) : 0;
      var tax = conv && TAX_BPS[dest.ccy] ? R.amount * pctBps(TAX_BPS[dest.ccy]) : 0;
      out.push({
        type: "offramp", coin: coin, scheme: s.id, schemeName: s.name, ccy: dest.ccy, converts: conv, cover: cov, mode: "partner",
        cost: { fees: ST.offramp.fixed + R.amount * pctBps(ST.offramp[cov]) + s.fixed + R.amount * pctBps(s.bps), fx: R.amount * pctBps(spread), partner: 0, tax: tax },
        minutes: { best: ST.offSpeed.best + s.speed.best, typ: ST.offSpeed.typ + s.speed.typ + wait, worst: ST.offSpeed.worst + s.speed.worst + wait },
        wait: wait, hands: 2,
        text: "Sell " + coin + " for " + dest.ccy + " at a local partner, who pays out by " + s.name + (conv ? " (includes the conversion)" : ""),
        jur: dest.id
      });
    });
    return out;
  }
  // Coins become local money inside one of your own pools (treasury).
  function offrampPoolLeg(coin, b, R) {
    var j = JUR_BY_CCY[b], cov = coverageOf(j.id);
    if (cov === "none") return null;
    var peg = COIN[coin].peg, conv = b !== peg;
    var tax = conv && TAX_BPS[b] ? R.amount * pctBps(TAX_BPS[b]) : 0;
    return {
      type: "offramp", coin: coin, ccy: b, converts: conv, cover: cov, mode: R.modes[b], toPool: true,
      cost: { fees: ST.offramp.fixed + R.amount * pctBps(ST.offramp[cov]), fx: conv ? R.amount * pctBps(fxPair(peg, b)) : 0, partner: 0, tax: tax },
      minutes: { best: ST.offSpeed.best, typ: ST.offSpeed.typ, worst: ST.offSpeed.worst },
      wait: 0, hands: 1,
      text: "Sell " + coin + " for " + b + " into your own " + b + " pool" + (conv ? " (includes the conversion)" : ""),
      jur: j.id
    };
  }
  // A float of coins already sitting at the receiving end replaces the on ramp and the chain on the customer's clock.
  function bufferLeg(on, ch, R) {
    var B = ST.buffer, carry = B.carryPercentPerYear * 100 * B.floatDays / 365 + B.reserveBps;
    return {
      type: "buffer", coin: on.coin, chain: ch.chain, ccy: on.ccy, from: on.from, to: on.coin, converts: on.converts, mode: on.mode, carryBps: carry,
      cost: { fees: B.netting * (on.cost.fees + ch.cost.fees) + R.amount * pctBps(carry), fx: B.netting * on.cost.fx, partner: B.netting * on.cost.partner, tax: 0 },
      minutes: { best: B.speed.best, typ: B.speed.typ, worst: B.speed.worst },
      wait: 0, hands: 1,
      text: "Draw " + on.coin + " from a prefunded float at the receiving end. Includes a holding cost and a share of the batched top up",
      jur: null
    };
  }
  function totalsOf(legs, R) {
    var cost = { fees: 0, fx: 0, partner: 0, tax: 0 }, min = { best: 0, typ: 0, worst: 0 }, hands = 0, fxHops = 0;
    legs.forEach(function (l) {
      Object.keys(cost).forEach(function (k) { cost[k] += l.cost[k]; });
      min.best += l.minutes.best; min.typ += l.minutes.typ; min.worst += l.minutes.worst;
      hands += l.hands; if (l.type === "fx" || l.converts) fxHops++;
    });
    var total = cost.fees + cost.fx + cost.partner + cost.tax;
    return { usd: total, pct: total / R.amount * 100, bps: total / R.amount * 10000, cost: cost, minutes: min, hands: hands, fxHops: fxHops };
  }

  function weightOf(leg, R) {
    var pr = M.priorities[R.priority];
    var total = leg.cost.fees + leg.cost.fx + leg.cost.partner + leg.cost.tax;
    return total / R.amount * 10000 * pr.bps + leg.minutes.typ / 60 * pr.hours + leg.hands * M.hopWeight[R.priority];
  }

  // Build everything the search needs for one request.
  function context(req, fxShare) {
    var R = normalise(req), ctx = { R: R, fx: fxShare || {}, payin: [], finals: {}, excluded: [], holds: [], coinSpecs: [] };
    var seenEx = {};
    function skip(s, why) { if (!seenEx[s.id]) { seenEx[s.id] = true; ctx.excluded.push({ scheme: s.id, name: s.name, ccy: s.ccy, why: why }); } }
    function fits(s) {
      if (s.limit && R.amount > s.limit) { skip(s, "above its cap of about " + money(s.limit)); return false; }
      if (s.min && R.amount < s.min) { skip(s, "below its minimum of about " + money(s.min)); return false; }
      return true;
    }
    CCYS.forEach(function (c) { if (R.modes[c] !== "none") ctx.holds.push(c); });
    if (!fxShare) {
      ctx.holds.forEach(function (a) {
        ctx.holds.forEach(function (b) { if (a !== b) ctx.fx[a + ">" + b] = (function () { var l = fxLeg(a, b, R); l.w = weightOf(l, R); return l; })(); });
      });
    }
    var sendCcy = JUR[R.from].ccy;
    if (R.modes[sendCcy] !== "none") {
      SCHEMES_BY_CCY[sendCcy].forEach(function (s) {
        if (s.kind === "wallet" || !fits(s)) return;
        var l = schemeLeg("payin", s, sendCcy, R); l.w = weightOf(l, R); ctx.payin.push(l);
      });
    }
    ctx.holds.forEach(function (h) {
      var list = [];
      if (h === R.destCcy && JUR[R.to].ccy === R.destCcy) {
        SCHEMES_BY_CCY[h].forEach(function (s) {
          if ((R.delivery === "wallet") !== (s.kind === "wallet")) return;
          if (!fits(s)) return;
          var l = schemeLeg("payout", s, h, R); l.w = weightOf(l, R); list.push(l);
        });
      }
      if (R.delivery !== "wallet") { var sw = swiftLeg(h, R); sw.w = weightOf(sw, R); list.push(sw); }
      ctx.finals[h] = list;
    });
    // Stablecoin paths start from the sender's own pool, so they need an account in the sender's currency.
    if (R.stable !== "off" && R.modes[sendCcy] !== "none") {
      var coins = R.stable === "auto" ? Catalog.COINS : [COIN[R.stable]];
      coins.forEach(function (c) {
        var eu = JUR[R.from].eea || JUR[R.to].eea;
        if (!c.mica && eu) { ctx.excluded.push({ scheme: "coin-" + c.id, name: c.name, ccy: c.id, why: "not authorised under the EU crypto law, so a regulated firm cannot offer it" }); return; }
        if (c.id && coverageOf(JUR[R.from].id) === "none") return;
        var on = onrampLeg(sendCcy, c.id, R); if (!on) return;
        var offs = offrampLegs(c.id, R, fits); if (!offs.length) return;
        var ch = bestChain(c.id, R);
        on.w = weightOf(on, R); offs.forEach(function (o) { o.w = weightOf(o, R); });
        var mid;
        if (R.buffer) { var bf = bufferLeg(on, ch, R); bf.w = weightOf(bf, R); mid = [bf]; }
        else mid = [on, ch];
        ctx.coinSpecs.push({ coin: c.id, mid: mid, offs: offs });
      });
    }
    return ctx;
  }

  function coinNode(l, which) {
    var ch = l.chain ? Catalog.CHAINS[l.chain].name : "";
    if (l.type === "buffer") return { kind: "coin", ccy: l.coin, bank: "float at the receiving end", note: "prefunded", chain: ch };
    if (which === "send") return { kind: "coin", ccy: l.coin, bank: "wallet at a qualified custodian", note: "sending end", chain: ch };
    return { kind: "coin", ccy: l.coin, bank: "on " + ch, note: "receiving end", chain: ch };
  }
  function routeFrom(legs, ctx) {
    var R = ctx.R, tot = totalsOf(legs, R);
    var nodes = [{ kind: "src", label: "Sender in " + (JUR[R.from].short || JUR[R.from].name), ccy: JUR[R.from].ccy }];
    var coin = null;
    legs.forEach(function (l) {
      if (l.type === "payin") nodes.push(pool(l.ccy, R.modes));
      else if (l.type === "fx") nodes.push(pool(l.to, R.modes));
      else if (l.type === "onramp") { nodes.push(coinNode(l, "send")); coin = { id: l.coin, buffer: false }; }
      else if (l.type === "chain") { nodes.push(coinNode(l, "recv")); coin.chain = l.chain; }
      else if (l.type === "buffer") { nodes.push(coinNode(l)); coin = { id: l.coin, buffer: true, chain: l.chain }; }
    });
    nodes.push({ kind: "dst", label: "Receiver in " + (JUR[R.to].short || JUR[R.to].name), ccy: R.destCcy });
    var holds = nodes.filter(function (n) { return n.kind === "hold"; }).map(function (n) { return n.ccy; });
    var last = legs[legs.length - 1];
    return {
      legs: legs, nodes: nodes, holds: holds, coin: coin,
      final: last.type === "payout" ? last.schemeName : last.type === "offramp" ? last.schemeName + " (via " + last.coin + ")" : "bank network (SWIFT)",
      totals: tot,
      score: sum(legs.map(function (l) { return l.w; })),
      shape: holds.join(">") + "|" + last.type + (last.scheme || "") + (coin ? "|coin" : "")
    };
  }

  // Enumerate every path with at most two conversions.
  function search(ctx, keep) {
    var best = [], R = ctx.R, holds = ctx.holds;
    function push(legs) {
      var s = 0; for (var i = 0; i < legs.length; i++) s += legs[i].w;
      best.push({ legs: legs, s: s });
    }
    ctx.payin.forEach(function (p) {
      var a = p.ccy;
      (ctx.finals[a] || []).forEach(function (f) { push([p, f]); });
      holds.forEach(function (x) {
        if (x === a) return;
        var f1 = ctx.fx[a + ">" + x];
        (ctx.finals[x] || []).forEach(function (f) { push([p, f1, f]); });
        holds.forEach(function (y) {
          if (y === a || y === x) return;
          var f2 = ctx.fx[x + ">" + y];
          (ctx.finals[y] || []).forEach(function (f) { push([p, f1, f2, f]); });
        });
      });
    });
    ctx.coinSpecs.forEach(function (cs) {
      ctx.payin.forEach(function (p) {
        if (p.ccy !== cs.mid[0].from && p.ccy !== cs.mid[0].ccy) return;
        cs.offs.forEach(function (o) { push([p].concat(cs.mid, [o])); });
      });
    });
    best.sort(function (u, v) { return u.s - v.s; });
    return best.slice(0, keep || 400).map(function (b) { return routeFrom(b.legs, ctx); });
  }

  function topRoutes(ctx, n) {
    var all = search(ctx, 400), seen = {}, out = [];
    all.forEach(function (r) {
      if (out.length >= n || seen[r.shape]) return;
      seen[r.shape] = true; out.push(r);
    });
    return out;
  }

  // ---------- compliance and rules ----------
  function touched(route, R) {
    var set = {}; set[R.from] = true; set[R.to] = true;
    route.legs.forEach(function (l) {
      if (l.ccy && JUR_BY_CCY[l.ccy]) set[JUR_BY_CCY[l.ccy].id] = true;
      if (l.type === "fx") set[JUR_BY_CCY[l.from].id] = true;
    });
    return Object.keys(set);
  }

  function complianceFor(route, R) {
    var jurs = touched(route, R), checks = [], lastLeg = route.legs[route.legs.length - 1];
    var cross = R.from !== R.to;
    function add(id, detail) {
      var c = Catalog.CHECKS.concat(Catalog.CRYPTO_CHECKS).filter(function (x) { return x.id === id; })[0];
      checks.push({ id: id, name: c.name, stage: c.stage, plain: c.plain, detail: detail });
    }
    add("cdd", "Sender is in " + JUR[R.from].name + ". The firm's own customer rules decide how much to ask for.");
    var coin = route.coin, payout = lastLeg.type === "payout" || lastLeg.type === "offramp" ? SCHEME[lastLeg.scheme] : null;
    if (payout && payout.check) add("payee", payout.name + ": " + payout.check + ".");
    else if (lastLeg.type === "swift") add("payee", "The bank network offers no name check. Validate the account format and rely on the receiving bank.");
    else add("payee", (payout ? payout.name : "The scheme") + " offers no name check. Validate the account format.");
    var lists = [];
    jurs.forEach(function (id) { JUR[id].lists.forEach(function (l) { if (lists.indexOf(l) < 0) lists.push(l); }); });
    lists.push("United Nations list");
    add("sanctions", "Lists in play: " + lists.join(", ") + ".");
    if (cross) {
      var t = [];
      if (jurs.indexOf("US") >= 0) t.push("US legs: details travel with transfers of 3,000 dollars or more.");
      if (jurs.indexOf("EA") >= 0 || jurs.indexOf("DK") >= 0) t.push("European legs: details travel with every transfer, with no minimum.");
      if (!t.length) t.push("Many countries apply no minimum. The global standard allows a small one.");
      if (coin) t.push("The coin leg is a crypto transfer, where the same details travel from the first unit in the European Union and the United Kingdom and above 3,000 dollars in the United States. The receiving provider must be able to receive them.");
      add("travel", t.join(" "));
    }
    var ctl = jurs.filter(function (id) { return JUR[id].control >= 1; });
    if (ctl.length) add("purpose", "Needed for: " + ctl.map(function (id) { return JUR[id].short || JUR[id].name; }).join(", ") + ".");
    var lim = [];
    [R.from, R.to].forEach(function (id) { if (JUR[id].control >= 2 && ANNUAL_CAP[id]) lim.push(ANNUAL_CAP[id]); });
    route.legs.forEach(function (l) {
      var s = l.scheme ? SCHEME[l.scheme] : null;
      if (s && s.limit && R.amount > s.limit * 0.3) lim.push(s.name + " caps a payment at about " + money(s.limit) + ".");
    });
    if (lim.length) add("limits", lim.join(" "));
    var taxLeg = route.legs.filter(function (l) { return l.cost.tax > 0; })[0];
    if (taxLeg) add("tax", "A placeholder of " + (TAX_BPS[taxLeg.to] / 100).toFixed(2) + " percent is included for conversion into " + taxLeg.to + ". The real rate depends on the purpose.");
    add("monitor", "Corridor " + JUR[R.from].name + " to " + JUR[R.to].name + ". The Transaction monitoring simulator shows how rules on a corridor behave.");
    add("safeguard", "Pools used: " + route.holds.map(function (c) { var b = custodianOf(c); return c + " at " + (b ? b.name : "a custodian"); }).join(", ") + ".");
    if (coin) add("custody", coin.id + " is held in segregated wallets at a qualified custodian (for example " + Catalog.STABLE_EXAMPLES.custodians.slice(0, 3).join(", ") + "), and matched to the ledger every day.");
    var lic = [];
    route.legs.forEach(function (l) {
      if (l.type === "swift" || l.type === "fx" || l.type === "onramp" || l.type === "chain" || l.type === "buffer" || l.type === "offramp") return;
      var name = JUR_BY_CCY[l.ccy].short || JUR_BY_CCY[l.ccy].name;
      lic.push(name + (l.mode === "partner" ? ": a local partner holds the licence. The contract must cover who is liable." : ": you need your own licence or direct membership."));
    });
    if (lic.length) add("licence", lic.join(" "));
    if (coin) {
      var sendJ = JUR[R.from], dstJ = JUR[R.to], cv = function (j) { return coverageOf(j.id); };
      var ch = Catalog.CHAINS[coin.chain].name, ci = COIN[coin.id];
      add("wallet", "Screen the sending and receiving addresses on " + ch + " before the coins move and again when they land. Stop on any link to a sanctioned or high risk address.");
      add("coin", coin.id + " is issued by " + ci.issuer + ". " + (ci.mica ? "It qualifies as an electronic money token under the European Union crypto law." : "It does not qualify under the European Union crypto law, which matters only if an EU party is involved.") +
        " Cash out in " + (dstJ.short || dstJ.name) + " is rated " + cv(dstJ) + ", and cash in from " + (sendJ.short || sendJ.name) + " is rated " + cv(sendJ) + ".");
      add("peg", Catalog.MODEL.stable.pegWatch + " Hold no more than a set share of one issuer.");
      add("vasp", (sendJ.short || sendJ.name) + ": the on ramp needs a crypto licence of its own or a licensed partner. " + (dstJ.short || dstJ.name) + ": a licensed local partner sells the coins and pays out, and the contract must cover who is liable.");
      if (coin.buffer) add("float", "Size the float to about " + Catalog.MODEL.stable.buffer.floatDays + " days of this corridor's volume (an assumption), top it up in batches when it falls below 30 percent, and cap how much sits with any one partner or custodian.");
    }
    var rep = [R.from, R.to].filter(function (id, i, a) { return REPORTS[id] && a.indexOf(id) === i; });
    if (rep.length) add("report", rep.map(function (id) { return (JUR[id].short || JUR[id].name) + ": " + REPORTS[id] + "."; }).join(" "));
    if ((JUR[R.from].eea || R.from === "GB") && !JUR[R.to].eea) add("data", "Personal data goes from " + (JUR[R.from].short || JUR[R.from].name) + " to " + (JUR[R.to].short || JUR[R.to].name) + ".");

    var regs = [];
    jurs.forEach(function (id) {
      (Catalog.REGS[id] || []).forEach(function (r) { regs.push({ jur: id, jurName: JUR[id].short || JUR[id].name, name: r[0], why: r[1] }); });
    });
    if (coin) {
      jurs.forEach(function (id) {
        (Catalog.CRYPTO_REGS[id] || []).forEach(function (r) { regs.push({ jur: id, jurName: JUR[id].short || JUR[id].name, name: r[0], why: r[1], crypto: true }); });
      });
    }
    var globalRegs = Catalog.GLOBAL_REGS.map(function (r) { return { name: r[0], why: r[1] }; });
    if (coin) Catalog.CRYPTO_GLOBAL_REGS.forEach(function (r) { globalRegs.push({ name: r[0], why: r[1], crypto: true }); });
    if ((JUR[R.from].eea || R.from === "GB") && !JUR[R.to].eea) globalRegs.push({ name: Catalog.DATA_REG[0], why: Catalog.DATA_REG[1] });
    return { jurisdictions: jurs, checks: checks, regs: regs, globalRegs: globalRegs };
  }

  // What each stage of the transfer flow looks like for this route.
  function stageNotes(route, R, comp) {
    var legs = route.legs, fx = legs.filter(function (l) { return l.type === "fx"; });
    var rails = legs.filter(function (l) { return l.schemeName; }).map(function (l) { return l.schemeName; });
    var last = legs[legs.length - 1], coin = route.coin;
    if (coin) return coinStageNotes(route, R, comp);
    return [
      "Quote about " + money(route.totals.usd) + " in total (" + route.totals.pct.toFixed(2) + " percent), arriving " + minutesText(route.totals.minutes.typ) + ".",
      comp.checks.length + " checks apply. Screening covers " + comp.jurisdictions.length + " jurisdictions.",
      "Chosen: " + route.holds.join(" to ") + (last.type === "swift" ? ", then the bank network." : ", then " + last.schemeName + ".") + " Keep the next best route ready as a fallback.",
      fx.length ? fx.length + " conversion" + (fx.length > 1 ? "s" : "") + ": " + fx.map(function (l) { return l.from + " to " + l.to; }).join(", ") + ". Pools used: " + route.holds.join(", ") + "." : "No conversion. Pools used: " + route.holds.join(", ") + ".",
      (rails.length ? rails.join(" and ") : "Bank network") + (last.type === "swift" ? " plus a chain of about " + last.banks + " bank" + (last.banks > 1 ? "s" : "") + "." : "."),
      "Match " + route.holds.length + " pool" + (route.holds.length > 1 ? "s" : "") + " to bank statements every day. Watch for returns on " + (last.type === "swift" ? "the bank network" : last.schemeName) + ".",
      (comp.checks.filter(function (c) { return c.id === "report"; }).length ? "A regulator report is due. " : "No extra regulator report from the catalog. ") + "Keep the audit trail for every leg."
    ];
  }

  function coinStageNotes(route, R, comp) {
    var legs = route.legs, last = legs[legs.length - 1], coin = route.coin, ch = Catalog.CHAINS[coin.chain].name;
    var send = JUR[R.from].ccy, ci = COIN[coin.id];
    var chainLeg = legs.filter(function (l) { return l.type === "chain"; })[0];
    return [
      "Quote about " + money(route.totals.usd) + " in total (" + route.totals.pct.toFixed(2) + " percent), arriving " + minutesText(route.totals.minutes.typ) + ". The quote includes the coin legs and the network fee.",
      comp.checks.length + " checks apply, including wallet screening and the travel rule message to the receiving provider. Screening covers " + comp.jurisdictions.length + " jurisdictions.",
      "Chosen: " + send + " to " + coin.id + (coin.buffer ? " from a prefunded float" : " on " + ch) + ", then " + last.schemeName + ". " + Catalog.MODEL.stable.pegWatch + " Keep the best bank route ready as a fallback.",
      coin.buffer ? "Draw " + coin.id + " from the float at the receiving end. The float is topped up in batches on weekdays, outside the customer's wait."
        : "Buy " + coin.id + " with the " + send + " pool" + (legs[1] && legs[1].converts ? " (this includes the conversion)" : "") + ". The coins sit in a segregated wallet until the next step.",
      coin.buffer ? "The off ramp partner pays out through " + last.schemeName + " straight away. Nothing waits for a blockchain." : "Send on " + ch + ", about " + minutesText(chainLeg.minutes.typ).replace("about ", "") + " to be final, then the off ramp partner pays out through " + last.schemeName + ".",
      "Match three records every day: bank statements, on chain wallet balances and the ledger. Watch for returns on " + last.schemeName + ".",
      (comp.checks.filter(function (c) { return c.id === "report"; }).length ? "A regulator report is due. " : "No extra regulator report from the catalog. ") + "Keep the audit trail for every leg, including the transaction hash."
    ];
  }

  // A quicker scheme for the same leg, when the chosen one is slow and the swap is cheap.
  function tipsFor(route, ctx) {
    var tips = [];
    route.legs.forEach(function (leg) {
      var pool = leg.type === "payin" ? ctx.payin : leg.type === "payout" ? (ctx.finals[leg.ccy] || []).filter(function (l) { return l.type === "payout"; }) : null;
      if (!pool) return;
      var best = null;
      pool.forEach(function (alt) {
        if (alt.scheme === leg.scheme) return;
        var saved = leg.minutes.typ - alt.minutes.typ;
        var extra = (alt.cost.fees + alt.cost.partner) - (leg.cost.fees + leg.cost.partner);
        if (saved < 60) return;
        if (!best || extra < best.extra) best = { scheme: alt.schemeName, saved: saved, extra: extra, type: leg.type, ccy: leg.ccy };
      });
      if (best) tips.push(best);
    });
    return tips;
  }

  // ---------- what to acquire ----------
  function acquisitions(R, baseline) {
    var cands = [];
    var baseScore = baseline ? baseline.score : Infinity;
    CCYS.forEach(function (c) {
      var mode = R.modes[c];
      if (mode === "direct") return;
      (mode === "none" ? ["partner", "direct"] : ["direct"]).forEach(function (next) {
        var modes = {}; CCYS.forEach(function (k) { modes[k] = R.modes[k]; });
        modes[c] = next;
        var ctx = context({ from: R.from, to: R.to, amount: R.amount, priority: R.priority, when: R.when, delivery: R.delivery, destCcy: R.destCcy, modes: modes, stable: R.stable, buffer: R.buffer });
        var top = topRoutes(ctx, 1)[0];
        if (!top || top.holds.indexOf(c) < 0) return;      // the new access would not even be used
        var gain = baseScore === Infinity ? 1e9 : baseScore - top.score;
        if (baseScore !== Infinity && gain <= 0.5) return;
        var j = JUR_BY_CCY[c];
        var months = Catalog.LEAD_MONTHS[next].slice();
        if (j.control >= 1) { months[0] += Catalog.LEAD_MONTHS.restrictedExtra[0]; months[1] += Catalog.LEAD_MONTHS.restrictedExtra[1]; }
        cands.push({
          ccy: c, jur: j.id, name: j.short || j.name, from: mode, to: next, gain: gain, route: top,
          note: Catalog.ACCESS_NOTES[c][next === "partner" ? 0 : 1], months: months,
          saveUsd: baseline ? baseline.totals.usd - top.totals.usd : null,
          savePct: baseline ? baseline.totals.pct - top.totals.pct : null,
          minutesSaved: baseline ? baseline.totals.minutes.typ - top.totals.minutes.typ : null
        });
      });
    });
    // Group by currency: a partner option and a direct option can both be worth showing.
    var byCcy = {};
    cands.forEach(function (a) { (byCcy[a.ccy] = byCcy[a.ccy] || []).push(a); });
    var out = Object.keys(byCcy).map(function (c) {
      var opts = byCcy[c].sort(function (a, b) { return a.months[1] - b.months[1]; });
      return { ccy: c, jur: opts[0].jur, name: opts[0].name, gain: Math.max.apply(null, opts.map(function (o) { return o.gain; })), options: opts };
    });
    out.sort(function (a, b) { return b.gain - a.gain; });
    return out.slice(0, 3);
  }

  // ---------- public ----------
  function plan(req) {
    var ctx = context(req), R = ctx.R;
    var routes = topRoutes(ctx, 3);
    var out = { request: R, routes: routes, excluded: ctx.excluded, noRoute: routes.length === 0, reason: null };
    routes.forEach(function (r) { r.compliance = complianceFor(r, R); r.stages = stageNotes(r, R, r.compliance); r.tips = tipsFor(r, ctx); });
    if (out.noRoute) {
      var sendCcy = JUR[R.from].ccy;
      out.reason = R.modes[sendCcy] === "none"
        ? "There is no account to collect " + sendCcy + " from the sender. Add one under your footprint."
        : "No route fits. Check the amount against scheme caps and the delivery choice.";
    }
    out.acquire = acquisitions(R, routes[0] || null);
    out.ways = ways(R);
    return out;
  }

  // The same transfer three ways: banks only, with a stablecoin, and with a stablecoin plus a prefunded float.
  function ways(R) {
    var coin = R.stable === "off" ? "auto" : R.stable;
    function best(stable, buffer) {
      var ctx = context({ from: R.from, to: R.to, amount: R.amount, priority: R.priority, when: R.when, delivery: R.delivery, destCcy: R.destCcy, modes: R.modes, stable: stable, buffer: buffer });
      var top = topRoutes(ctx, 1)[0];
      return top || null;
    }
    var bank = best("off", false), withCoin = best(coin, false), withFloat = best(coin, true);
    function row(id, label, r) {
      if (!r) return { id: id, label: label, none: true };
      return { id: id, label: label, usesCoin: !!r.coin, pct: r.totals.pct, usd: r.totals.usd, typ: r.totals.minutes.typ, best: r.totals.minutes.best, worst: r.totals.minutes.worst,
        title: r.coin ? r.coin.id + (r.coin.buffer ? " float" : " on " + Catalog.CHAINS[r.coin.chain].name) : "bank route" };
    }
    var rows = [row("bank", "Banks only", bank), row("coin", "With a stablecoin", withCoin), row("float", "Stablecoin with a prefunded float", withFloat)];
    var why = null;
    if (!withCoin || !withCoin.coin) {
      var dj = JUR[R.to], sj = JUR[R.from];
      if (coverageOf(dj.id) === "none" || coverageOf(sj.id) === "none") why = "Stablecoin legs are not allowed in " + (coverageOf(dj.id) === "none" ? (dj.short || dj.name) : (sj.short || sj.name)) + ".";
      else if (R.modes[sj.ccy] === "none") why = "A stablecoin route starts from your own account in the sender's currency, and there is none.";
      else if (R.destCcy !== dj.ccy) why = "A stablecoin route pays out in the receiver's local currency, and this transfer asks for another.";
      else why = "A bank route scores better here. The coin legs add an on ramp, a cash out spread or a slower local scheme.";
    }
    return { rows: rows, why: why };
  }

  // Treasury: move value between two of your own pools, by a bank conversion or through a stablecoin.
  function treasury(req) {
    var R = normalise({ from: req.from || "US", to: req.to || "US", amount: req.amount, priority: req.priority, when: req.when, modes: req.modes, footprint: req.footprint }), a = req.poolFrom, b = req.poolTo, out = { from: a, to: b, amount: R.amount, bank: null, coin: null, why: null };
    if (!JUR_BY_CCY[a] || !JUR_BY_CCY[b] || a === b) { out.why = "Choose two different pools."; return out; }
    var fx = fxLeg(a, b, R); fx.w = weightOf(fx, R);
    out.bank = { legs: [fx], totals: totalsOf([fx], R), nodes: [pool(a, R.modes), pool(b, R.modes)] };
    var best = null, eu = JUR_BY_CCY[a].eea || JUR_BY_CCY[b].eea;
    Catalog.COINS.forEach(function (c) {
      if (!c.mica && eu) return;
      var on = onrampLeg(a, c.id, R), off = offrampPoolLeg(c.id, b, R); if (!on || !off) return;
      var ch = bestChain(c.id, R);
      [on, off].forEach(function (l) { l.w = weightOf(l, R); });
      var legs = [on, ch, off], score = sum(legs.map(function (l) { return l.w; }));
      if (!best || score < best.score) best = { coin: c.id, chain: ch.chain, legs: legs, score: score };
    });
    if (best) out.coin = { coin: best.coin, chain: best.chain, legs: best.legs, totals: totalsOf(best.legs, R), nodes: [pool(a, R.modes), coinNode(best.legs[0], "send"), coinNode(best.legs[1], "recv"), pool(b, R.modes)] };
    else out.why = "No stablecoin path: cash in or cash out is not allowed for one of the two currencies.";
    out.carryBps = ST.buffer.carryPercentPerYear * 100 * ST.buffer.floatDays / 365 + ST.buffer.reserveBps;
    out.weekendNote = R.when === "weekend" ? "The foreign exchange market is shut, so the bank conversion carries a wider spread. Coin markets stay open." : null;
    return out;
  }

  // Corridor heat map: best route for every pair of countries under the same settings.
  function matrix(req) {
    var base = normalise(req), cells = {}, ids = Catalog.JURISDICTIONS.map(function (j) { return j.id; });
    // The conversion legs do not depend on the pair, so build them once.
    var shared = context({ from: ids[0], to: ids[1], amount: base.amount, priority: base.priority, when: base.when, modes: base.modes }).fx;
    ids.forEach(function (from) {
      ids.forEach(function (to) {
        if (from === to) { cells[from + ">" + to] = { same: true }; return; }
        var r = { from: from, to: to, amount: base.amount, priority: base.priority, when: base.when, modes: base.modes, delivery: "bank", stable: base.stable, buffer: base.buffer };
        var ctx = context(r, shared);
        var top = search(ctx, 1)[0];
        cells[from + ">" + to] = top ? { ok: true, pct: top.totals.pct, usd: top.totals.usd, minutes: top.totals.minutes.typ, holds: top.holds, final: top.final, coin: top.coin ? top.coin.id : null, hands: top.totals.hands } : { ok: false };
      });
    });
    return { ids: ids, cells: cells };
  }

  function directory() {
    return Catalog.JURISDICTIONS.map(function (j) {
      var by = (Banks.BY_CURRENCY[j.ccy] || []);
      return {
        jur: j, schemes: SCHEMES_BY_CCY[j.ccy],
        settlement: by.filter(function (e) { return e.role === "settlement"; }).map(function (e) { return BANK[e.bank]; }),
        custodians: by.filter(function (e) { return e.role === "custodian"; }).map(function (e) { return BANK[e.bank]; }),
        access: Catalog.ACCESS_NOTES[j.ccy]
      };
    });
  }

  return {
    JUR: JUR, JUR_BY_CCY: JUR_BY_CCY, SCHEME: SCHEME, SCHEMES_BY_CCY: SCHEMES_BY_CCY, BANK: BANK, CCYS: CCYS,
    normalise: normalise, context: context, search: search, topRoutes: topRoutes, plan: plan, matrix: matrix,
    directory: directory, treasury: treasury, COIN: COIN, complianceFor: complianceFor, presetModes: presetModes, fxPair: fxPair, weightOf: weightOf,
    money: money, minutesText: minutesText, custodianOf: custodianOf, settlementOf: settlementOf, round: round
  };
});
