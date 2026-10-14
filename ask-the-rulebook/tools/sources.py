"""Load the official source texts and normalise them so quotes can be matched exactly.

The PDFs are downloaded by hand from the official websites (see sources/README.md). This
module turns each into plain text, removes the running page headers and footers, and
collapses white space. Quotes in the library are cut from this text by a script, never typed.
"""

from __future__ import annotations

import hashlib
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "sources"

# Lines that repeat on every page and must not end up inside a quote.
_NOISE = {
    "amlr": [r"^EN$", r"^OJ L, 19\.6\.2024$", r"^ELI: http://data\.europa\.eu/eli/reg/2024/1624/oj$", r"^\d+/111$"],
    "tfr": [r"^EN$", r"^9\.6\.2023$", r"^Official Journal of the European Union$", r"^L 150/\d+$"],
    "fatf": [r"^THE FATF RECOMMENDATIONS$", r"^INTERNATIONAL STANDARDS ON COMBATING MONEY LAUNDERING AND THE FINANCING OF TERRORISM & PROLIFERATION$",
             r"^\d+$", r"^ 2012-2026$", r"^.*$"],
}

SOURCE_FILES = {
    "amlr": "amlr-2024-1624.pdf",
    "tfr": "tfr-2023-1113.pdf",
    "fatf": "fatf-recommendations.pdf",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def raw_text(source_id: str) -> str:
    pdf = SOURCES / SOURCE_FILES[source_id]
    txt = pdf.with_suffix(".txt")
    if not txt.exists() or txt.stat().st_mtime < pdf.stat().st_mtime:
        subprocess.run(["pdftotext", "-enc", "UTF-8", str(pdf), str(txt)], check=True)
    return txt.read_text(encoding="utf-8")


def normalised(source_id: str) -> str:
    patterns = [re.compile(p) for p in _NOISE[source_id]]
    kept = []
    for page in raw_text(source_id).split("\f"):
        for line in page.splitlines():
            s = line.strip()
            if not s or any(p.match(s) for p in patterns):
                continue
            kept.append(s)
    text = " ".join(kept)
    return re.sub(r"\s+", " ", text)


if __name__ == "__main__":  # quick look: python tools/sources.py amlr "Article 26"
    import sys
    sid, needle = sys.argv[1], sys.argv[2]
    width = int(sys.argv[3]) if len(sys.argv) > 3 else 1500
    t = normalised(sid)
    i = t.find(needle)
    print(f"{len(t)} chars; first match at {i}")
    if i >= 0:
        print(t[i:i + width])
