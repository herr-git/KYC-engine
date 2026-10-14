# Ask the rulebook

A question box over public anti-money laundering (AML) rules. You ask in plain words. The page shows the passages of the official text that bear on the question, word for word, with the article number, the edition and a link. If the library does not cover the question, it says so.

Open `index.html` in a browser. No build step, no server, no AI model at runtime.

## Why it works this way

In a compliance setting a wrong answer looks worse than no answer. So this project does not generate text. It does three things:

- **Quotes are exact by construction.** `tools/passages.json` stores only where a quote starts and ends. `tools/build_library.py` cuts the quote out of the official text. It fails if the start is missing or not unique, if the end is missing, if the quote is very long, or if it carries extraction damage such as footnote text or soft hyphens.
- **Sources are fingerprinted.** The SHA-256 fingerprints of the three official PDFs are in `tools/sources.lock.json`. `python tools/build_library.py --check` fails if `library.js` is stale or any quote cannot be found word for word.
- **The page refuses.** It declines questions about a single customer or decision, about the law of one country, penalties, and subjects the library does not hold (sanctions, correspondent banking and others). It also stays silent when no passage matches well.

## Sources

| Text | Edition used |
| --- | --- |
| Regulation (EU) 2024/1624, the EU Anti-Money Laundering Regulation | Official Journal, 19 June 2024 |
| Regulation (EU) 2023/1113, the Transfer of Funds Regulation (the "travel rule") | Official Journal, 9 June 2023 |
| The FATF Recommendations (Financial Action Task Force) | Updated June 2026 |

The PDFs are not stored here. `sources/README.md` says where to download them. To rebuild, put them in `sources/` and run `python tools/build_library.py`.

## Checks

- `node --test tests/rulebook.test.mjs`: finds an expected passage in the top 3 for each in-scope question (at least 90 percent required), refuses every out-of-scope one, and checks passage fields.
- `python -m pytest tests`: every quote verifies against the PDFs, fingerprints match. Skipped when the PDFs are absent.

## Honest limits

- **Not legal advice.** It cannot judge a customer or a transaction.
- **A small library.** 51 passages, hand-picked. It is far from complete, and a good answer may simply not be in it. Some quotes are partial lists, marked on the page.
- **A snapshot.** The EU regulation applies from 10 July 2027. National law and regulator guidance may differ today. Check the official text before relying on anything.
- **Tuned on its own tests.** I set the synonyms and refusal rules while looking at the question set. I then wrote a second batch of questions without tuning first. It exposed real faults: questions on subjects the library does not hold got confident but wrong passages. I added those subjects to the refusal list and kept the questions in `tests/questions.json` (marked "blind"). So the pass rate is not an independent accuracy figure. Expect misses on wording I did not think of.
- **Plain-language notes are mine.** They are labelled on the page as the author's writing, not official text.
- **FATF copyright.** The FATF text may not be reproduced without permission, so only short, attributed excerpts are used. If FATF or anyone else wants an excerpt removed, I will remove it.

## Publishing

On GitHub open Settings, Pages, choose the branch and the repository root. This project then lives at `/ask-the-rulebook/`.
