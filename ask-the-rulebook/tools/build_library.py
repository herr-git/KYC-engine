#!/usr/bin/env python3
"""Build library.js: the passages the page can show, each with a quote cut from the official text.

Quotes are never typed by hand. passages.json says where a quote starts and ends. This script finds
those words in the official document and copies everything between them. If the words are missing,
found twice, or the source file is not the expected edition, the build fails.

Usage:
    python tools/build_library.py                 write library.js
    python tools/build_library.py --check         fail if library.js is out of date or a quote cannot be verified
    python tools/build_library.py --update-lock   record the fingerprints of the source PDFs
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

from sources import SOURCES, SOURCE_FILES, normalised, sha256  # noqa: E402

LOCK = HERE / "sources.lock.json"

SOURCE_META = {
    "amlr": {
        "title": "Regulation (EU) 2024/1624",
        "short": "EU Anti-Money Laundering Regulation",
        "url": "https://eur-lex.europa.eu/eli/reg/2024/1624/oj",
        "edition": "Official Journal of the European Union, L series, 19 June 2024",
    },
    "tfr": {
        "title": "Regulation (EU) 2023/1113",
        "short": "EU Transfer of Funds Regulation",
        "url": "https://eur-lex.europa.eu/eli/reg/2023/1113/oj",
        "edition": "Official Journal of the European Union, L 150, 9 June 2023",
    },
    "fatf": {
        "title": "The FATF Recommendations",
        "short": "FATF Recommendations",
        "url": "https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html",
        "edition": "International Standards on Combating Money Laundering and the Financing of Terrorism and Proliferation, updated June 2026",
    },
}

MAX_QUOTE = 2400
# Signs that the PDF extraction picked up something that is not the law itself.
BAD_PATTERNS = [
    (re.compile("­"), "soft hyphen from the PDF"),
    (re.compile(r"\(\d{1,3}\) (?:Council|Regulation|Directive|Commission|Decision)"), "a footnote ran into the quote"),
    (re.compile(r"\bxxx\b"), "placeholder text"),
    (re.compile(r"  "), "double space"),
]


def cut_quote(p: dict, text: str) -> str:
    start, end = p["start"], p["end"]
    hits = [m.start() for m in re.finditer(re.escape(start), text)]
    if p.get("after"):
        anchor = text.find(p["after"])
        if anchor < 0:
            raise ValueError(f"{p['id']}: 'after' text not found: {p['after']!r}")
        hits = [h for h in hits if h >= anchor]
    if not hits:
        raise ValueError(f"{p['id']}: start text not found: {start!r}")
    if len(hits) > 1:
        raise ValueError(f"{p['id']}: start text found {len(hits)} times, make it more specific: {start!r}")
    i = hits[0]
    j = text.find(end, i)
    if j < 0:
        raise ValueError(f"{p['id']}: end text not found after start: {end!r}")
    quote = text[i : j + len(end)]
    if len(quote) > MAX_QUOTE:
        raise ValueError(f"{p['id']}: quote is {len(quote)} characters, over the {MAX_QUOTE} limit")
    for pattern, why in BAD_PATTERNS:
        if pattern.search(quote):
            raise ValueError(f"{p['id']}: quote contains {why}")
    return quote


def check_lock(update: bool) -> None:
    current = {sid: sha256(SOURCES / f) for sid, f in SOURCE_FILES.items() if (SOURCES / f).exists()}
    missing = [f for sid, f in SOURCE_FILES.items() if sid not in current]
    if missing:
        raise SystemExit(f"Missing source files in sources/: {', '.join(missing)}. See sources/README.md.")
    if update:
        LOCK.write_text(json.dumps(current, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print("Wrote", LOCK.name)
        return
    if not LOCK.exists():
        raise SystemExit("No sources.lock.json. Run with --update-lock once, after checking the PDFs are the right editions.")
    locked = json.loads(LOCK.read_text(encoding="utf-8"))
    for sid, digest in current.items():
        if locked.get(sid) != digest:
            raise SystemExit(f"{SOURCE_FILES[sid]} is not the edition this library was built from.")


def build() -> dict:
    spec = json.loads((HERE / "passages.json").read_text(encoding="utf-8"))
    texts = {sid: normalised(sid) for sid in SOURCE_FILES}
    out, ids = [], set()
    for p in spec["passages"]:
        if p["id"] in ids:
            raise ValueError(f"duplicate passage id {p['id']}")
        ids.add(p["id"])
        quote = cut_quote(p, texts[p["source"]])
        out.append({
            "id": p["id"], "source": p["source"], "cite": p["cite"], "topic": p["topic"],
            "quote": quote, "excerpt": bool(p.get("excerpt")), "plain": p["plain"],
            "asks": p["asks"], "keywords": p.get("keywords", []),
        })
    return {"sources": SOURCE_META, "passages": out}


def render(lib: dict) -> str:
    body = json.dumps(lib, ensure_ascii=False, separators=(",", ":"))
    return "// Generated by tools/build_library.py. Do not edit by hand.\n" f"globalThis.RULEBOOK = {body};\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--update-lock", action="store_true")
    args = ap.parse_args()
    check_lock(args.update_lock)
    if args.update_lock:
        return 0
    text = render(build())
    target = ROOT / "library.js"
    if args.check:
        if not target.exists() or target.read_text(encoding="utf-8") != text:
            print("library.js is out of date. Run: python tools/build_library.py")
            return 1
        print("library.js is up to date and every quote matches the official text")
        return 0
    target.write_text(text, encoding="utf-8")
    print(f"Wrote library.js: {len(text) / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
