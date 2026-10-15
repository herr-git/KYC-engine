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
- Switch on a stablecoin and see it compete with bank routes, with or without a prefunded float.
- Compare moving value between your own pools by a bank conversion or through a stablecoin (treasury).

## How routes are scored
- A route is a path of moves: pay in, convert, pay out, or send through a correspondent bank chain (SWIFT).
- Every path with at most two conversions is tried.
- Score is the sum over legs of cost in basis points, time in hours, and a penalty per extra party. Each priority weighs these differently.
- Each leg cost is a fixed fee plus basis points. Partners add a fee. Conversions add a spread, a fixed fee, a cross-pair penalty, and a weekend surcharge.
- Business-day schemes wait for their next window, so evenings and weekends change the answer.
- Every number is visible in the leg table, so you can check the sum.

## Stablecoins
A stablecoin is a token that tries to hold one currency's value and moves on a blockchain at any hour. The planner uses it three ways:
- Remittance: buy coins with the sender's pool (on ramp), send them on the cheapest fast chain, and a local partner sells them and pays out by the receiver's local scheme (off ramp).
- Buffer: a float of coins already sits at the receiving end, so the customer does not wait for the on ramp or the chain. The model charges a holding cost (a yearly rate over a few days of float, plus a small reserve for coin risk) and half of the top up cost, because top ups are batched and netted.
- Treasury: move value between two of your own pools by a bank conversion or through a coin, and see which is cheaper and faster for the amount and timing chosen.

How it is modelled:
- Three coins (USDC, EURC, USDT) on four chains, each with an illustrative network fee and finality time.
- A cash in and cash out rating per country (good, limited, none). Limited markets cost more. None, such as mainland China, removes every coin route.
- USDT is left out whenever a European party is involved, because it does not qualify under the European Union crypto law. The "Left out" line says so.
- Crypto markets stay open at the weekend, so the coin legs carry no weekend surcharge. Funding the on ramp still waits for the bank when the pool's currency has no instant scheme.
- Extra checks when a coin is used: wallet screening, coin allowed, peg and issuer limits, custody, crypto licence at each end, and a float limit. Extra rules by country are tagged "crypto".
- "Three ways to send this" runs the same transfer by banks only, with a coin, and with a coin plus a float.

## Honest limits
- Fees, speeds, limits, spreads and lead times are reasonable round numbers for a demonstration. They are not quotes.
- Regulation entries are headline summaries, not legal advice. Crypto rules change quickly, so treat the stablecoin ones as a starting list to check.
- Coin and custodian names are examples of the kind of firm or asset. No endorsement. Coins can trade below their price, and issuers can freeze addresses.
- A stablecoin route needs an account in the sender's currency, pays out in the receiver's local currency, and does not model the receiver holding the coin itself.
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
