"""Checks that every quote in library.js is word for word in the official text.

Needs the three PDFs in sources/ (see sources/README.md). Without them the tests are skipped,
because the PDFs are not stored in the repository.
"""
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import sources  # noqa: E402

HAVE_PDFS = all((ROOT / "sources" / f).exists() for f in sources.SOURCE_FILES.values())
needs_pdfs = pytest.mark.skipif(not HAVE_PDFS, reason="official PDFs not present in sources/")


@needs_pdfs
def test_library_is_current_and_every_quote_verifies():
    r = subprocess.run([sys.executable, str(ROOT / "tools" / "build_library.py"), "--check"],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


@needs_pdfs
def test_fingerprints_match_the_editions_used():
    import json
    lock = json.loads((ROOT / "tools" / "sources.lock.json").read_text())
    for key, name in sources.SOURCE_FILES.items():
        assert sources.sha256(ROOT / "sources" / name) == lock[key], key


def test_no_dashes_in_author_text():
    import json
    d = json.loads((ROOT / "tools" / "passages.json").read_text(encoding="utf-8"))
    for p in d["passages"]:
        for k in ("topic", "plain"):
            assert "–" not in p[k] and "—" not in p[k], (p["id"], k)
