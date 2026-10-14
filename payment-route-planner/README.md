# Payment route planner

Money does not fly from one country to another. It moves through accounts, local clearing schemes and currency conversions. This tool shows the best paths for a transfer and why.

Open `index.html` in a browser. No build step, no server, no dependencies.

## What it does
- Pick a sender country, a receiver country, an amount, what matters most and when you send.
- Say which currencies your firm can hold: its own account, access through a partner bank, or none.
- Get the top three routes as a chain of banks and schemes, with cost and time per leg.
- See what was left out and why (a scheme cap, a minimum, no account).
- See "what would change the answer": the accounts worth adding, savings, time saved, and rough lead time.
- Compare all 400 corridors in a heat map of cost or time.
- Walk the seven stages of the transfer flow, mapped to blocks in the core banking blueprint.
- See the compliance checks and headline regulations that apply to the corridor.

## How routes are scored
- A route is a path of moves: pay in, convert, pay out, or send through a correspondent bank chain (SWIFT).
- Every path with at most two conversions is tried.
- Score is the sum over legs of cost in basis points, time in hours, and a penalty per extra party. Each priority weighs these differently.
- Each leg cost is a fixed fee plus basis points. Partners add a fee. Conversions add a spread, a fixed fee, a cross-pair penalty, and a weekend surcharge.
- Business-day schemes wait for their next window, so evenings and weekends change the answer.
- Every number is visible in the leg table, so you can check the sum.

## Honest limits
- Fees, speeds, limits, spreads and lead times are reasonable round numbers for a demonstration. They are not quotes.
- Regulation entries are headline summaries, not legal advice.
- Bank names are curated. Codes (BIC) come from the open schwifty registry (MIT licence) where a match exists, so only some banks carry one.
- Clean-room: no employer code or data.

## Files
- `catalog.js`: currencies, schemes, regulations, checks, stages, corridors
- `banks.js`: generated bank directory (`tools/build_banks.py`)
- `router.js`: the search, scoring, matrix and acquisition logic
- `app.js`, `styles.css`, `index.html`: the interface
- `tests/router.test.mjs`: run with `node --test tests/router.test.mjs`

## Related
- [core-banking-blueprint](../core-banking-blueprint/): the blocks each stage uses
- [ask-the-rulebook](../ask-the-rulebook/): question answering over rules

Built with AI assistance as product thinking made runnable.
