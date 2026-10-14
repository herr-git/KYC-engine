/* Search over the passage library. No AI model runs here. The page ranks passages by word overlap
 * and shows exact quotes. It refuses when nothing fits, or when the question asks for something the
 * library does not hold. Works in the browser and in Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Rulebook = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STOP = {};
  ("a an the of for in on at to from by with and or but if then than that this these those is are was were be been being do does did " +
    "have has had it its we you i they them our your my their can could should would may might must shall will what which who whom how " +
    "when where why there here about any all some not no yes as so such into out up down over under again also just only very more most " +
    "rule rules regulation regulations say says said tell give need needs needed required require requires requirement requirements " +
    "please explain mean means meaning allowed able get got one two like").split(" ").forEach(function (w) { STOP[w] = 1; });

  // Words that mean the same thing for this subject. A question using one finds passages using another.
  var GROUPS = [
    ["kyc", "know your customer", "customer due diligence", "cdd", "identity check", "identity verification", "onboarding", "onboard"],
    ["pep", "peps", "politically exposed person", "politically exposed persons", "politically exposed"],
    ["sar", "str", "suspicious activity report", "suspicious transaction report", "suspicion report", "report suspicion", "suspicious report"],
    ["fiu", "financial intelligence unit"],
    ["edd", "enhanced due diligence", "enhanced measures", "high risk customer", "higher risk customer"],
    ["travel rule", "originator", "beneficiary", "information accompanying", "sender information", "recipient information"],
    ["crypto", "crypto-asset", "crypto-assets", "cryptocurrency", "cryptocurrencies", "bitcoin", "virtual asset", "virtual assets", "digital asset", "digital assets", "token", "tokens"],
    ["unhosted wallet", "self-hosted", "self hosted", "private wallet", "non-custodial", "own wallet", "external wallet"],
    ["vasp", "casp", "virtual asset service provider", "crypto-asset service provider", "crypto exchange", "exchange", "crypto firm", "crypto business"],
    ["ubo", "beneficial owner", "beneficial owners", "ultimate beneficial owner"],
    ["tipping off", "tip off", "tell the customer", "inform the customer", "disclose to the customer", "disclosure to the customer"],
    ["transaction monitoring", "monitoring", "monitor", "ongoing monitoring", "scrutiny of transactions", "scrutiny"],
    ["privacy coin", "privacy coins", "monero", "zcash", "anonymity-enhancing coin", "anonymity enhancing coins", "anonymous coin"],
    ["record", "records", "retention", "retain", "keep records", "record keeping", "record-keeping"],
    ["simplified", "simplified due diligence", "sdd", "lighter checks", "reduced checks", "low risk customer", "lower risk"],
    ["risk based", "risk-based", "rba", "risk based approach", "risk-based approach", "proportionate"],
    ["unusual", "unusually", "suspicious", "red flag", "red flags", "anomalous", "atypical"],
    ["refresh", "periodic review", "review frequency", "perpetual kyc", "update customer information", "keep information up to date"],
    ["high risk country", "high-risk country", "high risk countries", "high-risk countries", "high risk jurisdiction", "higher-risk countries", "grey list", "black list", "call for action"],
    ["amlr", "anti-money laundering regulation", "aml regulation", "2024/1624", "new aml regulation"],
    ["tfr", "transfer of funds regulation", "2023/1113"],
    ["fatf", "financial action task force", "international standard", "international standards"],
    ["cash", "cash payment", "cash payments"]
  ];

  // Questions this library cannot answer well. Each gets a clear message instead of a guess.
  var SCOPE_RULES = [
    { id: "jurisdiction", test: function (q) { return /\b(denmark|danish|hvidvask\w*|sweden|swedish|norway|norwegian|germany|german|bafin|france|french|netherlands|dutch|spain|italy|poland|polish|ireland|irish|switzerland|swiss|finma|canada|canadian|australia|australian|austrac|singapore|hong kong|japan|brazil|india|nigeria|uae|dubai|united kingdom|england|british|fca|fincen|ofac|bank secrecy act)\b/i.test(q) || /\b(UK|US|USA|U\.S\.|EU member state law)\b/.test(q); },
      message: "This library holds only the EU regulations and FATF standard listed below. It does not cover the law of any single country, the UK or the US. Check your national regulator for local rules." },
    { id: "penalties", test: function (q) { return /\b(fine|fines|fined|penalt\w*|punish\w*|imprison\w*|prison|jail|criminal liability|sanctions regime fines|enforcement action)\b/i.test(q); },
      message: "Penalties are not in this library. The EU regulation says penalties are set in the Member States, and national law decides them. Check your national regulator." },
    { id: "not-covered", test: function (q) { return /\b(sanctions?|embargo\w*|asset freez\w*|correspondent|shell banks?|whistleblow\w*|insurance|insurer|casino\w*|gambling|trusts?|foundations?|lawyers?|notar\w*|accountants?|real estate|estate agents?|art dealers?|precious (metals?|stones?)|pawn\w*|investigat\w* (powers|authorit\w*)|supervis\w*|registers? of beneficial)\b/i.test(q); },
      message: "That subject is not among the passages in this library, so any answer from here would be a guess. Read the full official texts listed below." },
    { id: "other-law", test: function (q) { return /\b(mica|markets in crypto|gdpr|data protection|tax|taxes|vat|capital requirements?|prudential|psd2|mifid|dora|ai act)\b/i.test(q); },
      message: "That topic belongs to a different law that this library does not hold, such as the crypto-asset markets regulation, data protection, tax or prudential rules." }
  ];

  var ADVICE = /\b(my|our|this|that|the) (customer|client|transaction|payment|account|case|user)\b.*\b(suspicious|launder\w*|report|file|block|freeze|reject|safe|ok|okay|fine|legal|illegal|compliant)\b|\bshould (i|we) (report|file|block|freeze|reject|onboard|close|exit|offboard|escalate|approve)\b|\bis (this|that|he|she|it|[a-z]+) (a )?(suspicious|money launderer|launder\w*|compliant|legal|illegal)\b|\bam i (compliant|allowed|liable)\b/i;

  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 5 && /(ing|ers)$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /(es|ed)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }

  function words(text) {
    return text.toLowerCase().replace(/[‘’']/g, "").replace(/[^a-z0-9\/\-\s]/g, " ").split(/\s+/).filter(Boolean);
  }

  function terms(text) {
    var out = [];
    words(text).forEach(function (w) {
      if (STOP[w]) return;
      var parts = w.indexOf("-") >= 0 ? [w].concat(w.split("-")) : [w];
      parts.forEach(function (p) { if (p && !STOP[p] && !(p.length === 1 && !/\d/.test(p))) out.push(stem(p)); });
    });
    return out;
  }

  var GROUP_TERMS = GROUPS.map(function (g) {
    return { phrases: g, terms: Array.from(new Set([].concat.apply([], g.map(terms)))) };
  });

  function phraseIn(text, phrase) {
    var padded = " " + words(text).join(" ") + " ";
    return padded.indexOf(" " + words(phrase).join(" ") + " ") >= 0;
  }

  function build(lib) {
    var docs = lib.passages.map(function (p) {
      var weighted = {};
      function add(text, w) { terms(text).forEach(function (t) { weighted[t] = (weighted[t] || 0) + w; }); }
      add(p.topic, 3); add(p.asks.join(" "), 3); add(p.keywords.join(" "), 2.5);
      add(p.plain, 1.5); add(p.quote, 1); add(p.cite, 1);
      var len = 0; Object.keys(weighted).forEach(function (t) { len += weighted[t]; });
      return { p: p, w: weighted, len: len };
    });
    var df = {};
    docs.forEach(function (d) { Object.keys(d.w).forEach(function (t) { df[t] = (df[t] || 0) + 1; }); });
    var avg = docs.reduce(function (a, d) { return a + d.len; }, 0) / docs.length;
    return { docs: docs, df: df, N: docs.length, avg: avg, lib: lib };
  }

  /** Returns { status, notes, results } where status is answer, advice, scope or none. */
  function ask(index, question, limit) {
    limit = limit || 4;
    var q = String(question || "").trim();
    var res = { status: "none", notes: [], results: [], question: q };
    if (q.length < 3) return res;

    for (var i = 0; i < SCOPE_RULES.length; i++) {
      if (SCOPE_RULES[i].test(q)) { res.status = "scope"; res.notes.push(SCOPE_RULES[i].message); res.scope = SCOPE_RULES[i].id; return res; }
    }
    var advice = ADVICE.test(q);

    var base = Array.from(new Set(terms(q)));
    if (!base.length) return res;
    var expanded = {};
    var conceptOf = {};
    base.forEach(function (t) { conceptOf[t] = [t]; });
    GROUP_TERMS.forEach(function (g) {
      var hit = g.phrases.some(function (ph) { return phraseIn(q, ph); });
      if (!hit) return;
      g.terms.forEach(function (t) { if (base.indexOf(t) < 0) expanded[t] = 0.6; });
      base.forEach(function (t) { if (g.terms.indexOf(t) >= 0) conceptOf[t] = conceptOf[t].concat(g.terms); });
    });

    var k1 = 1.4, b = 0.6;
    var scored = index.docs.map(function (d) {
      var score = 0, covered = 0;
      function contrib(t, weight) {
        var tf = d.w[t]; if (!tf) return 0;
        var idf = Math.log(1 + (index.N - (index.df[t] || 0) + 0.5) / ((index.df[t] || 0) + 0.5));
        return weight * idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * d.len / index.avg));
      }
      base.forEach(function (t) {
        var s = contrib(t, 1);
        if (!s) s = Math.max.apply(null, [0].concat(conceptOf[t].map(function (x) { return contrib(x, 0.8); })));
        if (s > 0) covered += 1;
        score += s;
      });
      Object.keys(expanded).forEach(function (t) { score += contrib(t, expanded[t]) * 0.5; });
      return { passage: d.p, score: score, coverage: covered / base.length };
    }).filter(function (r) { return r.score > 0; }).sort(function (a, c) { return c.score - a.score; });

    if (!scored.length) { if (advice) { res.status = "advice"; res.notes.push(adviceNote()); } return res; }
    var best = scored[0];
    var enough = best.coverage >= 0.5 && best.score >= 2.2;
    if (!enough) { if (advice) { res.status = "advice"; res.notes.push(adviceNote()); } return res; }
    res.results = scored.filter(function (r) { return r.score >= best.score * 0.55 && r.coverage >= Math.max(0.34, best.coverage - 0.35); }).slice(0, limit);
    res.status = advice ? "advice" : "answer";
    if (advice) res.notes.push(adviceNote());
    return res;
  }

  function adviceNote() {
    return "I cannot judge a specific customer, transaction or decision. Only a trained person who knows the facts can. These are the rules that bear on the question.";
  }

  return { build: build, ask: ask, terms: terms };
});
