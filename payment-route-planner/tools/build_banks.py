#!/usr/bin/env python3
"""Build banks.js: the demo list of settlement banks and custodians used by the route planner.

Two sources, kept apart and labelled on every row:
  registry  the open bank registry bundled with the schwifty package (MIT licence). It is built from
            published central bank and national directories, and covers about 45 mostly European
            countries plus a few others. Only the bank code (BIC, the public bank identifier) is taken.
  curated   the bank name and country, written from public knowledge, for countries the registry does
            not cover. No identifier is invented: curated rows have no BIC.

This is a demonstration list. It is not a directory, it is not complete, it can be out of date, and
being listed is not an endorsement.

Run:  pip install schwifty && python3 tools/build_banks.py
"""
import json, os, re, sys

import schwifty

REG = os.path.join(os.path.dirname(schwifty.__file__), "bank_registry")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "banks.js")

# role: settlement = central bank where the scheme settles; custodian = commercial bank that
# commonly offers accounts and clearing for the currency; correspondent = global multi-currency bank
# (name, country, registry-name-pattern or None, role)
BANKS = {
    "USD": [("Federal Reserve", "US", None, "settlement"),
            ("The Bank of New York Mellon", "US", None, "custodian"),
            ("JPMorgan Chase", "US", None, "custodian"),
            ("Citibank", "US", None, "custodian")],
    "EUR": [("Eurosystem (European Central Bank and national central banks)", "DE", None, "settlement"),
            ("Deutsche Bank", "DE", r"deutsche bank", "custodian"),
            ("BNP Paribas", "FR", r"bnp paribas", "custodian"),
            ("ING Bank", "NL", r"\bing\b", "custodian"),
            ("Commerzbank", "DE", r"commerzbank", "custodian")],
    "GBP": [("Bank of England", "GB", None, "settlement"),
            ("Barclays", "GB", r"barclays", "custodian"),
            ("HSBC UK", "GB", r"hsbc", "custodian"),
            ("Lloyds Bank", "GB", r"lloyds", "custodian"),
            ("NatWest", "GB", r"natwest|national westminster", "custodian")],
    "JPY": [("Bank of Japan", "JP", None, "settlement"),
            ("MUFG Bank", "JP", None, "custodian"),
            ("Mizuho Bank", "JP", None, "custodian"),
            ("Sumitomo Mitsui Banking Corporation", "JP", None, "custodian")],
    "AUD": [("Reserve Bank of Australia", "AU", None, "settlement"),
            ("Commonwealth Bank of Australia", "AU", None, "custodian"),
            ("ANZ", "AU", None, "custodian"),
            ("Westpac", "AU", None, "custodian"),
            ("National Australia Bank", "AU", None, "custodian")],
    "CAD": [("Bank of Canada", "CA", None, "settlement"),
            ("Royal Bank of Canada", "CA", None, "custodian"),
            ("Toronto-Dominion Bank", "CA", None, "custodian"),
            ("Scotiabank", "CA", None, "custodian")],
    "CHF": [("Swiss National Bank", "CH", r"^schweizerische nationalbank", "settlement"),
            ("UBS Switzerland", "CH", r"^ubs switzerland ag", "custodian"),
            ("PostFinance", "CH", r"^postfinance", "custodian"),
            ("Zürcher Kantonalbank", "CH", r"z[uü]rcher kantonalbank", "custodian")],
    "SGD": [("Monetary Authority of Singapore", "SG", None, "settlement"),
            ("DBS Bank", "SG", None, "custodian"),
            ("OCBC Bank", "SG", None, "custodian"),
            ("United Overseas Bank", "SG", None, "custodian")],
    "AED": [("Central Bank of the UAE", "AE", r"central bank of uae", "settlement"),
            ("Emirates NBD", "AE", r"emirates nbd", "custodian"),
            ("First Abu Dhabi Bank", "AE", r"first abu dhabi|national bank of abu dhabi", "custodian"),
            ("Mashreq", "AE", r"mashreq", "custodian")],
    "DKK": [("Danmarks Nationalbank", "DK", r"danmarks nationalbank", "settlement"),
            ("Danske Bank", "DK", r"danske bank", "custodian"),
            ("Nordea Danmark", "DK", r"nordea", "custodian"),
            ("Jyske Bank", "DK", r"jyske", "custodian")],
    "BRL": [("Banco Central do Brasil", "BR", None, "settlement"),
            ("Itaú Unibanco", "BR", None, "custodian"),
            ("Banco do Brasil", "BR", None, "custodian"),
            ("Bradesco", "BR", None, "custodian")],
    "MXN": [("Banco de México", "MX", None, "settlement"),
            ("BBVA México", "MX", None, "custodian"),
            ("Banorte", "MX", None, "custodian"),
            ("Santander México", "MX", None, "custodian")],
    "INR": [("Reserve Bank of India", "IN", None, "settlement"),
            ("State Bank of India", "IN", None, "custodian"),
            ("HDFC Bank", "IN", None, "custodian"),
            ("ICICI Bank", "IN", None, "custodian")],
    "ZAR": [("South African Reserve Bank", "ZA", None, "settlement"),
            ("Standard Bank", "ZA", None, "custodian"),
            ("FirstRand (FNB)", "ZA", None, "custodian"),
            ("Absa", "ZA", None, "custodian")],
    "THB": [("Bank of Thailand", "TH", None, "settlement"),
            ("Bangkok Bank", "TH", None, "custodian"),
            ("Kasikornbank", "TH", None, "custodian"),
            ("Siam Commercial Bank", "TH", None, "custodian")],
    "PHP": [("Bangko Sentral ng Pilipinas", "PH", None, "settlement"),
            ("BDO Unibank", "PH", None, "custodian"),
            ("Bank of the Philippine Islands", "PH", None, "custodian"),
            ("Metrobank", "PH", None, "custodian")],
    "KES": [("Central Bank of Kenya", "KE", None, "settlement"),
            ("KCB Bank", "KE", None, "custodian"),
            ("Equity Bank", "KE", None, "custodian"),
            ("Co-operative Bank of Kenya", "KE", None, "custodian")],
    "NGN": [("Central Bank of Nigeria", "NG", None, "settlement"),
            ("Access Bank", "NG", None, "custodian"),
            ("Zenith Bank", "NG", None, "custodian"),
            ("Guaranty Trust Bank", "NG", None, "custodian")],
    "CNY": [("People's Bank of China", "CN", None, "settlement"),
            ("Industrial and Commercial Bank of China", "CN", None, "custodian"),
            ("Bank of China", "CN", None, "custodian"),
            ("China Construction Bank", "CN", None, "custodian")],
    "TRY": [("Central Bank of the Republic of Türkiye", "TR", None, "settlement"),
            ("Ziraat Bankası", "TR", r"ziraat", "custodian"),
            ("Türkiye İş Bankası", "TR", r"i[sş] bankas", "custodian"),
            ("Garanti BBVA", "TR", r"garanti", "custodian")],
}

# Global banks that hold accounts in many currencies and sit in many correspondent chains.
GLOBAL = [("Citibank", "US"), ("JPMorgan Chase", "US"), ("HSBC", "GB"),
          ("Standard Chartered", "GB"), ("Deutsche Bank", "DE"), ("The Bank of New York Mellon", "US")]


def load_registry():
    rows = []
    for fn in sorted(os.listdir(REG)):
        if not fn.endswith(".json"):
            continue
        data = json.load(open(os.path.join(REG, fn), encoding="utf-8"))
        if isinstance(data, dict):
            data = data.get("entries", [])
        for r in data:
            rows.append(r)
    return rows


# Head office identifiers, used only when the registry itself contains that exact code. Without this a
# large bank's many retail units can outnumber its head office and the wrong code would win.
PREFER = {"deutsche-bank": "DEUTDEFF", "commerzbank": "COBADEFF", "ing-bank": "INGBNL2A",
          "jyske-bank": "JYBADKKK", "danske-bank": "DABADKKK", "nordea-danmark": "NDEADKKK"}


def find_bic(rows, country, pattern, key=None):
    """Return the 8 character institution BIC for the best match, or None."""
    if not pattern:
        return None
    rx = re.compile(pattern, re.I)
    hits = [r["bic"].upper()[:8] for r in rows
            if r.get("country_code") == country and r.get("bic") and rx.search(r.get("name", ""))
            and re.fullmatch(r"[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?", r["bic"].upper())]
    if not hits:
        return None
    want = PREFER.get(key)
    if want and want in hits:
        return want
    return max(set(hits), key=hits.count)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    rows = load_registry()
    out, seen, by_ccy = [], {}, {}
    for ccy, items in BANKS.items():
        ids = []
        for name, country, pat, role in items:
            key = slug(name)
            if key not in seen:
                bic = find_bic(rows, country, pat, key)
                rec = {"id": key, "name": name, "country": country, "source": "registry" if bic else "curated"}
                if bic:
                    rec["bic"] = bic
                seen[key] = rec
                out.append(rec)
            ids.append({"bank": key, "role": role})
        by_ccy[ccy] = ids
    glob = []
    for name, country in GLOBAL:
        key = slug(name)
        if key not in seen:
            rec = {"id": key, "name": name, "country": country, "source": "curated"}
            seen[key] = rec
            out.append(rec)
        glob.append(key)
    meta = {
        "registry": "schwifty " + getattr(schwifty, "__version__", "?") + " (MIT licence), bank_registry data",
        "note": "Demonstration list only. Not a directory, not complete, possibly out of date. Being listed is not an endorsement. Curated rows have no identifier.",
        "count": len(out),
        "withBic": sum(1 for b in out if "bic" in b),
    }
    body = ("/* Generated by tools/build_banks.py. Do not edit by hand. */\n"
            "(function (root, factory) {\n"
            "  if (typeof module === \"object\" && module.exports) module.exports = factory();\n"
            "  else root.Banks = factory();\n"
            "})(typeof self !== \"undefined\" ? self : this, function () {\n"
            "  \"use strict\";\n"
            "  return " + json.dumps({"META": meta, "BANKS": out, "BY_CURRENCY": by_ccy, "GLOBAL": glob},
                                      ensure_ascii=False, indent=2) + ";\n});\n")
    open(OUT, "w", encoding="utf-8").write(body)
    print("wrote", OUT, meta)
    for b in out:
        if b["source"] == "registry":
            print("  registry:", b["name"], b["bic"])


if __name__ == "__main__":
    sys.exit(main())
