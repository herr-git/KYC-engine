(function () {
  "use strict";
  var lib = globalThis.RULEBOOK, index = Rulebook.build(lib);
  var $ = function (id) { return document.getElementById(id); };
  var SUGGESTIONS = [
    "When do we have to do customer due diligence?",
    "How long must we keep customer records?",
    "What information must travel with a crypto transfer?",
    "What are the rules for politically exposed persons?",
    "How often must customer information be refreshed?",
    "What is the limit for cash payments?",
    "Do the rules apply to transfers to a self-hosted wallet?",
    "Can we tell a customer we reported them?",
    "What about privacy coins?",
    "What are the fines in Denmark?"
  ];

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  function card(r) {
    var p = r.passage, s = lib.sources[p.source];
    var c = el("article", "card");
    var top = el("div", "card-top");
    top.appendChild(el("span", "cite", p.cite));
    top.appendChild(el("span", "src", s.short));
    c.appendChild(top);
    c.appendChild(el("p", "topic", p.topic));
    var q = el("blockquote", "", "“" + p.quote + "”");
    q.setAttribute("lang", "en");
    c.appendChild(q);
    if (p.excerpt) c.appendChild(el("p", "", "")).appendChild(el("span", "tag", "Partial quote: the original list is longer. Read the full text before relying on it."));
    var pl = el("div", "plain");
    pl.appendChild(el("b", "", "Plain-language note by the project author, not official text"));
    pl.appendChild(document.createTextNode(p.plain));
    c.appendChild(pl);
    var l = el("p", "links");
    var a = el("a", "", "Open the official text");
    a.href = s.url; a.target = "_blank"; a.rel = "noopener";
    l.appendChild(a); l.appendChild(document.createTextNode(" (" + s.title + ", " + s.edition + ")"));
    c.appendChild(l);
    return c;
  }

  function show(question) {
    var out = $("out"); out.textContent = "";
    var r = Rulebook.ask(index, question);
    if (!r.question) return;
    var asked = el("p", "asked"); asked.appendChild(document.createTextNode("You asked: ")); asked.appendChild(el("strong", "", r.question));
    out.appendChild(asked);
    r.notes.forEach(function (n) { out.appendChild(el("p", "notice", n)); });
    if (r.status === "scope") return;
    if (!r.results.length) {
      if (r.status !== "advice") out.appendChild(el("p", "empty", "I found no passage that clearly answers this. The rulebook here covers customer checks, risk, politically exposed persons, suspicious activity reporting, record keeping, cash limits, crypto transfers and a few FATF standards. Try rewording, or read the official texts listed below."));
      return;
    }
    r.results.forEach(function (x) { out.appendChild(card(x)); });
    if (out.scrollIntoView) out.scrollIntoView({ block: "start", behavior: "smooth" });
    try { history.replaceState(null, "", "#q=" + encodeURIComponent(r.question)); } catch (e) {}
  }

  $("count").textContent = lib.passages.length;
  SUGGESTIONS.forEach(function (s) {
    var b = el("button", "chip", s); b.type = "button";
    b.addEventListener("click", function () { $("q").value = s; show(s); });
    $("suggestions").appendChild(b);
  });
  Object.keys(lib.sources).forEach(function (k) {
    var s = lib.sources[k], li = el("li"), a = el("a", "", s.title + ", " + s.short);
    a.href = s.url; a.target = "_blank"; a.rel = "noopener";
    li.appendChild(a); li.appendChild(document.createTextNode(". " + s.edition + "."));
    $("sources").appendChild(li);
  });
  $("ask").addEventListener("submit", function (e) { e.preventDefault(); show($("q").value); });
  var m = /^#q=(.*)$/.exec(location.hash);
  if (m) { try { $("q").value = decodeURIComponent(m[1]); show($("q").value); } catch (e) {} }
})();
