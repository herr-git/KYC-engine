/* Alert rules for the transaction monitoring simulator.
 *
 * This is a port of tools/reference_rules.py. A test compares the two on every rule, every
 * setting and every customer. It works in the browser and in Node (UMD style).
 *
 * Payment format: [minute, direction, amountEur, country, asset, mixer]
 *   direction 0 = money in, 1 = money out
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Monitor = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DAY = 1440;
  var WEEK = 7 * DAY;
  var LIMIT = 10000;
  var JUST_UNDER_FROM = 9000;
  var PASS_THROUGH_MIN_IN = 2000;
  var PASS_THROUGH_SHARE_PERCENT = 90;
  var SPIKE_MIN_AMOUNT = 500;

  function isHigh(c) { return c.band === "high" || c.band === "blocked"; }

  function range(from, to) { var o = []; for (var i = from; i < to; i++) o.push(i); return o; }

  // Each rule has an ordered list of settings. Index 0 is the loosest, the last is the strictest.
  // "find" returns the positions of the payments that triggered the rule.
  var RULES = [
    {
      key: "large",
      name: "Large payment",
      question: "Is any single payment big?",
      levels: [1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000],
      defaultLevel: 3,
      describe: function (v) { return v.toLocaleString("en-GB") + " EUR or more in one payment"; },
      short: function (v) { return v.toLocaleString("en-GB") + " EUR"; },
      find: function (c, level, tighten) {
        var limit = this.levels[level];
        if (tighten && isHigh(c)) limit = limit / 2;
        return c.p.reduce(function (o, p, i) { if (p[2] >= limit) o.push(i); return o; }, []);
      }
    },
    {
      key: "many",
      name: "Many payments in a day",
      question: "Did the customer make lots of payments on one day?",
      levels: [3, 4, 5, 6, 8, 10, 12, 15, 20, 30],
      defaultLevel: 4,
      describe: function (v) { return v + " or more payments on the same day"; },
      short: function (v) { return v + " a day"; },
      find: function (c, level, tighten) {
        var n = this.levels[level];
        if (tighten && isHigh(c)) n = Math.max(2, Math.ceil(n / 2));
        var byDay = {};
        c.p.forEach(function (p, i) { var d = Math.floor(p[0] / DAY); (byDay[d] = byDay[d] || []).push(i); });
        var out = [];
        Object.keys(byDay).map(Number).sort(function (a, b) { return a - b; }).forEach(function (d) {
          if (byDay[d].length >= n) out = out.concat(byDay[d]);
        });
        return out;
      }
    },
    {
      key: "country",
      name: "Risky country",
      question: "Is money going to or from a country the KYC engine rates as risky?",
      levels: [25, 45, 60, 85, 90, 100],
      defaultLevel: 2,
      describe: function (v, scores) { return "Country risk score " + v + " or higher (" + countriesAtOrAbove(v, scores) + ")"; },
      short: function (v) { return "score " + v + "+"; },
      find: function (c, level, tighten, scores) {
        var floor = this.levels[level];
        return c.p.reduce(function (o, p, i) { if (scores[p[3]].score >= floor) o.push(i); return o; }, []);
      }
    },
    {
      key: "justUnder",
      name: "Just under the limit",
      question: "Are several payments squeezed just below 10,000 EUR within a week?",
      levels: [2, 3, 4, 5, 6],
      defaultLevel: 1,
      describe: function (v) { return v + " or more payments of 9,000 to 9,999 EUR within 7 days"; },
      short: function (v) { return v + " in a week"; },
      find: function (c, level) {
        var k = this.levels[level];
        var band = c.p.reduce(function (o, p, i) { if (p[2] >= JUST_UNDER_FROM && p[2] < LIMIT) o.push(i); return o; }, []);
        var hit = {};
        for (var a = 0; a < band.length; a++) {
          var start = c.p[band[a]][0];
          var win = [];
          for (var b = a; b < band.length; b++) if (c.p[band[b]][0] - start < WEEK) win.push(band[b]);
          if (win.length >= k) win.forEach(function (i) { hit[i] = true; });
        }
        return Object.keys(hit).map(Number).sort(function (x, y) { return x - y; });
      }
    },
    {
      key: "passThrough",
      name: "Money in, money straight out",
      question: "Did a big deposit leave again almost at once?",
      levels: [72, 48, 24, 12, 6, 2],
      defaultLevel: 2,
      describe: function (v) { return "90% or more of a deposit over 2,000 EUR sent on within " + v + " hours"; },
      short: function (v) { return "within " + v + " h"; },
      find: function (c, level) {
        var windowMin = this.levels[level] * 60;
        var pays = c.p;
        var hit = {};
        pays.forEach(function (p, i) {
          if (p[1] !== 0 || p[2] < PASS_THROUGH_MIN_IN) return;
          var outs = [];
          var sum = 0;
          pays.forEach(function (q, j) {
            if (q[1] === 1 && q[0] > p[0] && q[0] <= p[0] + windowMin) { outs.push(j); sum += q[2]; }
          });
          if (sum * 100 >= p[2] * PASS_THROUGH_SHARE_PERCENT) { hit[i] = true; outs.forEach(function (j) { hit[j] = true; }); }
        });
        return Object.keys(hit).map(Number).sort(function (x, y) { return x - y; });
      }
    },
    {
      key: "spike",
      name: "Sudden jump in spending",
      question: "Is a payment far bigger than this customer's usual payment?",
      levels: [3, 5, 8, 10, 15, 25, 40],
      defaultLevel: 3,
      describe: function (v) { return "A payment out that is " + v + " times the customer's usual size (and at least 500 EUR)"; },
      short: function (v) { return v + " times usual"; },
      find: function (c, level) {
        var m = this.levels[level];
        return c.p.reduce(function (o, p, i) {
          if (p[1] === 1 && p[2] >= SPIKE_MIN_AMOUNT && p[2] >= m * c.typical) o.push(i);
          return o;
        }, []);
      }
    },
    {
      key: "mixer",
      name: "Mixing service link",
      question: "Did the customer pay a wallet linked to a mixing service?",
      levels: [1],
      defaultLevel: 0,
      describe: function () { return "Any payment to a wallet that analytics link to a mixing service"; },
      short: function () { return "any link"; },
      find: function (c) {
        return c.p.reduce(function (o, p, i) { if (p[5] === 1) o.push(i); return o; }, []);
      }
    }
  ];

  var BY_KEY = {};
  RULES.forEach(function (r) { BY_KEY[r.key] = r; });

  function countriesAtOrAbove(score, scores) {
    var names = Object.keys(scores).filter(function (cc) { return scores[cc].score >= score; })
      .sort(function (a, b) { return scores[a].score - scores[b].score; })
      .map(function (cc) { return scores[cc].name.replace(/^the /, ""); });
    return names.length ? names.join(", ") : "none";
  }

  /** Positions of the payments that trigger one rule for one customer. */
  function triggers(customer, key, level, tighten, scores) {
    return BY_KEY[key].find(customer, level, !!tighten, scores);
  }

  /**
   * settings = { tighten: bool, rules: { key: { on: bool, level: int } } }
   * Returns one entry per customer that at least one switched-on rule flags.
   */
  function evaluate(customers, settings, scores) {
    var flagged = [];
    customers.forEach(function (c) {
      var hits = {};
      var any = false;
      RULES.forEach(function (r) {
        var s = settings.rules[r.key];
        if (!s || !s.on) return;
        var idx = r.find(c, s.level, !!settings.tighten, scores);
        if (idx.length) { hits[r.key] = idx; any = true; }
      });
      if (any) flagged.push({ customer: c, hits: hits });
    });
    return flagged;
  }

  /** Counts for a list of flagged customers against the planted truth. */
  function tally(flagged, customers) {
    var real = customers.filter(function (c) { return c.real; }).length;
    var caught = flagged.filter(function (f) { return f.customer.real; }).length;
    var n = flagged.length;
    return {
      flagged: n,
      caught: caught,
      falseAlarms: n - caught,
      missed: real - caught,
      realTotal: real,
      fineTotal: customers.length - real,
      precision: n ? caught / n : null,
      recall: real ? caught / real : null
    };
  }

  /** One rule on its own at every setting. Used for the trade-off curves. */
  function sweep(key, customers, tighten, scores) {
    var rule = BY_KEY[key];
    return rule.levels.map(function (v, level) {
      var one = { tighten: tighten, rules: {} };
      one.rules[key] = { on: true, level: level };
      var t = tally(evaluate(customers, one, scores), customers);
      return { level: level, value: v, flagged: t.flagged, caught: t.caught, falseAlarms: t.falseAlarms };
    });
  }

  function defaultSettings() {
    var s = { tighten: false, rules: {} };
    RULES.forEach(function (r) { s.rules[r.key] = { on: true, level: r.defaultLevel }; });
    return s;
  }

  // Starting points for the page. Each one is a full set of settings.
  function make(on, levels, tighten) {
    var s = { tighten: !!tighten, rules: {} };
    RULES.forEach(function (r) {
      s.rules[r.key] = { on: on.indexOf(r.key) >= 0, level: levels && levels[r.key] !== undefined ? levels[r.key] : r.defaultLevel };
    });
    return s;
  }
  var ALL = RULES.map(function (r) { return r.key; });
  function allAt(fn) { var o = {}; RULES.forEach(function (r) { o[r.key] = fn(r); }); return o; }
  var PRESETS = [
    { id: "start", label: "Starting rules",
      note: "Every rule on at a common middle setting. It catches nearly every real problem and buries analysts in false alarms.",
      settings: make(ALL) },
    { id: "big", label: "Big amounts only",
      note: "The simplest rule, and where many firms begin. Problems that stay under the amount walk straight past it.",
      settings: make(["large"], { large: 5 }) },
    { id: "tuned", label: "Tuned on this data",
      note: "Chosen by searching this exact data for the most problems caught with the fewest false alarms. It looks better here than it would on new payments. That trap is called overfitting.",
      settings: make(["large", "many", "country", "justUnder", "passThrough", "mixer"],
        { large: 8, many: 2, country: 5, justUnder: 2, passThrough: 2 }) },
    { id: "loose", label: "Catch everything",
      note: "Every rule at its loosest setting. Every real problem is caught, and so is nearly everyone else.",
      settings: make(ALL, allAt(function () { return 0; })) },
    { id: "quiet", label: "Strictest",
      note: "Every rule at its strictest setting. Far fewer alerts, but real problems start to slip through.",
      settings: make(ALL, allAt(function (r) { return r.levels.length - 1; })) }
  ];

  return {
    PRESETS: PRESETS, RULES: RULES, BY_KEY: BY_KEY, DAY: DAY, isHigh: isHigh, range: range,
    triggers: triggers, evaluate: evaluate, tally: tally, sweep: sweep,
    defaultSettings: defaultSettings, countriesAtOrAbove: countriesAtOrAbove
  };
});
