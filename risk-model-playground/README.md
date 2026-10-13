# Risk model playground

An interactive page for one question: how much do a risk model's settings decide who gets flagged?

Visitors move the weight of each factor, slide the cut-offs between low, medium and high, and switch safety rules on and off. 300 synthetic customers re-rank live, and the page shows who changed band compared with the defaults.

It uses the scoring from the [KYC risk engine](../kyc-risk-engine/) in this repository. No server is needed, so it runs on GitHub Pages.

## What to try

- Pick **Country-heavy** and watch customers from risky countries crowd upward. Industry guides name over-weighting geography as a common model weakness.
- Pick **Weighted score only**. This turns every safety rule off. The confirmed sanctions customer and the foreign politically exposed person drop out of the top bands, which shows why the rules exist.
- Drag the cut-off lines on the chart, or use the arrow keys when a line is selected.
- Push the high cut-off down until most customers are high. The page warns that a model rating around 30% of customers high is not well tuned.
- Open **Worked examples** for eight hand-made cases, each with a short story and a full breakdown.
- Use **Copy link to these settings** to share an exact configuration.

## How it works

1. `tools/export_data.py` builds 300 synthetic customers: 8 hand-made cases plus 292 generated with a fixed random seed.
2. It runs each one through the real Python engine and records the seven factor scores, the facts the safety rules check, and the engine's own answer at default settings.
3. That output is saved as `data.js`.
4. In the browser, `model.js` re-weights the stored factor scores and re-applies the rules. It is a direct port of the engine's rules.
5. `app.js` draws the page.

The browser never invents a score. It only recombines scores the engine produced.

## Checks

```bash
node --test tests/model.test.mjs     # browser logic matches the Python engine for all 300 customers
python tools/export_data.py --check  # data.js is up to date with the engine
```

The main test compares the browser's score, band, review flag and applied rules with the Python engine for every customer at default settings. Other tests cover the weight scaling, the all-zero fallback, the ranking order, and the effect of turning rules off.

## Run it

Open `index.html` in a browser. No build step.

To regenerate the data after changing the engine:

```bash
python tools/export_data.py
```

## Publish on GitHub Pages

1. In the repository, open **Settings**, then **Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Pick the `main` branch and the `/ (root)` folder, then save.
4. After a minute the page is live at `https://<username>.github.io/<repository>/risk-model-playground/`.

## Limits

- Every customer is synthetic and every number is made up. The share of customers who end up high says nothing about real populations.
- Weights, cut-offs and country scores are illustrative, not a real risk list.
- The page re-weights stored factor scores. It does not let you change what the data sources return or edit the scoring tables.
- Fonts load from Google Fonts. Without a connection the page falls back to system fonts.

## Files

```
index.html, styles.css    page and look
app.js                    controls, chart, ranked list
model.js                  scoring and rules, testable in Node
data.js                   generated from the engine, do not edit by hand
tools/export_data.py      builds data.js from the Python engine
tests/model.test.mjs      parity and behaviour tests
```
