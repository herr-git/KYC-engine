// Scoring logic for the playground. A direct port of the Python engine's rules,
// kept free of page code so a test can run it in Node and compare it to the engine.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RiskModel = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var BANDS = ["low", "medium", "high", "blocked"];
  var RULES = [
    { key: "sanctions", label: "A sanctions match overrides the score", detail: "A confirmed match blocks the customer. A possible match sends them to high and to a person for review." },
    { key: "pep", label: "A foreign politically exposed person is at least high", detail: "Someone who holds or held a senior public role abroad needs extra checks, whatever else their score says." },
    { key: "jurisdiction", label: "A link to a high-risk country is at least high", detail: "Applies to residence, nationality or any country they send money to, for countries on the call-for-action list." },
    { key: "document", label: "A failed identity document is at least high", detail: "The document did not pass the authenticity check." },
    { key: "mixer", label: "Mixing service exposure is at least high", detail: "A mixing service hides where crypto came from." },
    { key: "compounding", label: "Several elevated factors together lift the band", detail: "Two factors at or above the elevated line give at least medium. Three give at least high." },
    { key: "requiredData", label: "A missing required check lifts the band to medium", detail: "Country, watchlist and identity checks must be present. If one failed, a person reviews the case." },
    { key: "missingData", label: "Too much missing data lifts the band to medium", detail: "Applies when the missing checks carry more than 30% of the total weight." }
  ];

  function severity(band) { return BANDS.indexOf(band); }

  // Turn raw slider values into weights that add up to 1.
  // If every slider is zero there is nothing to weigh, so fall back to equal weights.
  function normaliseWeights(raw, keys) {
    var total = 0, i;
    for (i = 0; i < keys.length; i++) total += Math.max(0, raw[keys[i]] || 0);
    var out = {}, equal = total <= 0;
    for (i = 0; i < keys.length; i++) {
      out[keys[i]] = equal ? 1 / keys.length : Math.max(0, raw[keys[i]] || 0) / total;
    }
    return { weights: out, usedEqualFallback: equal };
  }

  function bandForScore(score, s) {
    if (score >= s.high) return "high";
    if (score >= s.medium) return "medium";
    return "low";
  }

  // customer: one row of PLAYGROUND_DATA.customers
  // s: { weights (already normalised), medium, high, elevatedFrom, mediumIfAtLeast, highIfAtLeast,
  //      maxMissingWeight, requiredFactors, rules: { key: boolean } }
  function evaluate(customer, s, factorKeys) {
    var score = 0, i, k, f;
    for (i = 0; i < factorKeys.length; i++) {
      k = factorKeys[i];
      score += customer.f[k].score * s.weights[k];
    }
    var band = bandForScore(score, s);
    var floor = "low", overrides = [], review = [];
    var on = s.rules;

    function raise(b, reason) {
      overrides.push(reason + " -> minimum band " + b);
      if (severity(b) > severity(floor)) floor = b;
    }

    var sig = customer.sig;
    if (on.sanctions) {
      if (sig.sanctionsConfirmed) raise("blocked", "Confirmed sanctions match");
      else if (sig.sanctionsPotential) {
        raise("high", "Potential sanctions match");
        review.push("Potential sanctions match needs analyst confirmation");
      }
    }
    if (on.pep && sig.pepForeign) {
      raise("high", "Foreign politically exposed person match");
      review.push("Foreign politically exposed person requires enhanced due diligence");
    }
    if (on.jurisdiction && sig.callForAction.length) {
      raise("high", "High-risk jurisdiction (" + sig.callForAction.join(", ") + ")");
    }
    if (on.document && sig.documentFailed) {
      raise("high", "Identity document failed authenticity check");
      review.push("Possible forged identity document");
    }
    if (on.mixer && sig.mixer) raise("high", "Direct exposure to a mixing service");

    if (on.compounding) {
      var elevated = [];
      for (i = 0; i < factorKeys.length; i++) {
        k = factorKeys[i]; f = customer.f[k];
        if (f.ok && f.score >= s.elevatedFrom) elevated.push(k);
      }
      if (elevated.length >= s.highIfAtLeast) raise("high", elevated.length + " elevated factors together (" + elevated.join(", ") + ")");
      else if (elevated.length >= s.mediumIfAtLeast) raise("medium", elevated.length + " elevated factors together (" + elevated.join(", ") + ")");
    }

    if (on.requiredData) {
      var missingRequired = [];
      for (i = 0; i < factorKeys.length; i++) {
        k = factorKeys[i];
        if (!customer.f[k].ok && s.requiredFactors.indexOf(k) !== -1) missingRequired.push(k);
      }
      if (missingRequired.length) {
        raise("medium", "Required data missing: " + missingRequired.join(", "));
        review.push("Cannot complete onboarding checks without: " + missingRequired.join(", "));
      }
    }

    if (on.missingData) {
      var missingWeight = 0, names = [];
      for (i = 0; i < factorKeys.length; i++) {
        k = factorKeys[i];
        if (!customer.f[k].ok) { missingWeight += s.weights[k]; names.push(k); }
      }
      if (missingWeight > s.maxMissingWeight + 1e-9) {
        raise("medium", "Too much missing data (" + Math.round(missingWeight * 100) + "% of weight: " + names.join(", ") + ")");
        review.push("Score is unreliable: no data for " + names.join(", "));
      }
    }

    var liftedByRule = false;
    if (severity(floor) > severity(band)) { band = floor; liftedByRule = true; }
    return {
      score: score,
      band: band,
      liftedByRule: liftedByRule,
      overrides: overrides,
      reviewReasons: review,
      review: review.length > 0 || band === "high" || band === "blocked"
    };
  }

  // Most severe band first, then highest score. Same order as the Python engine.
  function rank(results) {
    return results.slice().sort(function (a, b) {
      var d = severity(b.band) - severity(a.band);
      return d !== 0 ? d : b.score - a.score;
    });
  }

  return { BANDS: BANDS, RULES: RULES, severity: severity, normaliseWeights: normaliseWeights, bandForScore: bandForScore, evaluate: evaluate, rank: rank };
});
