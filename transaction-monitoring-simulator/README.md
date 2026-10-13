# Transaction monitoring simulator

An interactive page for one question: when you set alert rules on payments, how many real problems do you catch, and how many false alarms do you pay for it?

The visitor switches on rules such as a large payment, many payments in a day, or a risky country. The page shows what each rule catches against what it wrongly flags, and plots the trade-off. It is the second half of the work in the [KYC risk engine](../kyc-risk-engine/): know the customer at the start, then watch what they do.

It needs no server, so it runs on GitHub Pages.

## What to try

- Start with **Starting rules**. Nearly every real problem is caught, but only about 1 alert in 6 is real.
- Pick **Big amounts only**. It is simple and flags few customers, yet it misses most problems because they stay under the amount.
- Pick **Tuned on this data**. It looks excellent here. It was found by searching this exact data, so it would do worse on new payments. That trap is called overfitting.
- Drag a dot along its line on the chart. Each line is one rule on its own, from loosest to strictest.
- Open **Missed problems**. Select one to see what it would take to catch it, and what that would cost in false alarms. One pattern slips past all seven rules at every setting.
- Switch on **Look harder at high-risk customers**. It halves the amount and count limits for customers the KYC engine rates high or blocked.
- Use **Copy link to these rules** to share exact settings.

## The seven rules

| Rule | Alerts when |
|---|---|
| Large payment | One payment reaches the amount |
| Many payments in a day | The customer makes that many payments on one day |
| Risky country | A payment goes to or from a country at or above a risk score (scores come from the KYC engine's config) |
| Just under the limit | Several payments of 9,000 to 9,999 EUR fall within 7 days, which can mean someone is dodging a 10,000 EUR limit |
| Money in, money straight out | 90% or more of a deposit over 2,000 EUR leaves again within the chosen number of hours |
| Sudden jump in spending | A payment out is many times the customer's usual payment size |
| Mixing service link | A payment goes to a wallet linked to a mixing service, which hides where crypto came from |

An alert is raised per customer. Counting customers, not single payments, matches how a review team works: one case, one person looking.

## How it works

1. `tools/build_data.py` creates 400 synthetic customers and about 8,000 payments over 30 days, with a fixed random seed.
2. 32 customers follow a planted laundering pattern: splitting a sum under a limit, money passing straight through, small payments to high-risk countries, mixing service use, a dormant account that suddenly moves money, many small payments in a day, and one quiet pattern built to avoid every rule.
3. The other 368 behave in ways that look odd but are innocent: an active trader, a car purchase, money sent to family abroad, a freelancer paying contractors, a firm paying suppliers.
4. Because the generator planted the problems, the page always knows the right answer, and can count real catches against false alarms.
5. `monitor.js` runs the rules in the browser. `tools/reference_rules.py` is the same logic in Python.
6. `app.js` draws the page.

## Checks

```bash
node --test tests/monitor.test.mjs   # browser rules match Python for every rule, setting and customer
python -m pytest -q tests            # generator, reference rules, and data freshness
python tools/build_data.py --check   # data.js and tests/expected.json are up to date
```

The main test compares the browser with the Python rules for all seven rules at every setting, with and without extra scrutiny, on all 400 customers. It also checks the triggering payments at default settings, the edges of each rule (exactly 5,000 EUR, exactly 90%, exactly seven days), that stricter settings never add alerts, and that each planted pattern trips the rule built for it. A test caught one real bug while building this: the country list came out in a different order on each run until it was sorted.

## Run it

Open `index.html` in a browser. No build step. To regenerate the data after changing the generator or rules:

```bash
python tools/build_data.py
```

## Publish on GitHub Pages

1. In the repository, open **Settings**, then **Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Pick the `main` branch and the `/ (root)` folder, then save.
4. After a minute the page is live at `https://<username>.github.io/<repository>/transaction-monitoring-simulator/`.

## Limits (read before reusing)

- Everything is synthetic and every number is made up. The results say nothing about real payment data.
- 8% of customers are real problems here. In real life genuine cases are far rarer, often under 1%, so real false alarm rates are much worse than this page shows.
- Thresholds, the 25 minutes per review, and the country scores are illustrative. A real firm sets them from its own documented risk assessment and has them validated.
- The planted patterns are textbook cases. Real criminals adapt, and real data is messier.
- Rules look at one customer at a time. Real systems also look across customers, for example at wallets that connect many accounts. The page says so when a problem slips past every rule.
- No machine learning model is used. Modern systems often add one to rank alerts, and that would need its own validation.
- Fonts load from Google Fonts. Without a connection the page falls back to system fonts.
