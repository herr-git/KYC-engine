# Core banking blueprint

A planning page for the building blocks of a modern core banking and crypto platform. Choose what you want to offer, such as a ledger, accounts, deposits, loans, cards, payments, wealth, treasury, permissions, reports or crypto custody. The page shows:

- **a summary strip**: how many blocks you need, a bar of buy, hybrid, build and partner, and where the work sits across three phases
- **a stack with connecting lines**: ten layers from customer screens down to the security platform, each block coloured and shaped by its verdict, with your choices outlined thickly. Lines show which block relies on which. Select a block to light up what it needs (solid) and what needs it (dashed), with a panel that lists both. On phones the lines are hidden and the panel carries the same information
- **a heat map**: every block rated 0 to 5 for how standard it is, how likely it is to set you apart and how heavy its legal burden is, with effort and a verdict meter. Sortable, with a tooltip on every cell. Select a row for the detail and the score written out line by line
- **two walk throughs**: a card payment and a crypto deposit, step by step, each step naming the block that does the work
- every block you need, including the ones your choices pull in (lending needs accounts, a ledger, credit decisions, case handling and more)
- market practice notes with a picture of an old core against a modular core, a short glossary, and a plain text version to paste into an email

Open `index.html` in a browser. No build step, no server, no AI model at runtime.

## How the recommendation is worked out

Each of the 33 blocks has three ratings from 0 to 5, written in `catalog.js`: how **standard** it is across the industry, how likely it is to **set a firm apart**, and how heavy its **legal and audit burden** is. The score is a plain sum, and the page shows every line.

| Part of the score | Effect |
| --- | --- |
| Standard across the industry | plus its rating |
| Could set a firm apart | minus its rating |
| Engineering team: none or tiny, small, strong | plus 2, plus 1, minus 1 |
| Time to launch: under 6 months, 6 to 18, over 18 | plus 2, plus 1, none |
| Volumes (only for blocks where cost per transaction matters): small, medium, large | plus 1, none, minus 1 |
| Heavy legal burden (rating 4 or 5) and no strong team | plus 1 |
| You mark the block as where you compete (up to three) | minus 3 |

A total of 4 or more means buy. From 1 to under 4 means hybrid. Below 1 means build. If you say you rely on a partner bank, the blocks a partner normally supplies (ledger of record, accounts, deposits, payments access, cards and crypto custody) are marked partner, with a reminder to keep your own records and reconcile daily.

This is deliberately simple. You can disagree with a rating, change it in `catalog.js`, and see the effect.

## Checks

`node --test tests/planner.test.mjs` checks that:

- every block is complete and its dependencies exist, with no cycles
- no block is ordered before something it depends on
- the score always equals the sum of the lines shown
- more engineering strength, more time or more volume never pushes a block toward buying
- sanity cases hold: card processing, identity checks and sanctions screening are bought in every setting, while customer screens and product rules are built when the team is strong
- marking a block as your edge always lowers its score by the same amount
- the partner case, the presets, the plain text export and the crypto stack behave as described
- the dependency lines match the catalog, run both ways, and never point outside the plan; a block higher in the stack rests on more blocks
- every block has a short name, the walk throughs only name real blocks, the verdict meter stays inside its track, and the phase summary adds up
- the content has no em or en dashes

The page was also checked in a browser in light, dark and phone widths. The verdict colours come from a validated palette (blue, orange, aqua and violet, checked for colour blindness in light and dark), and every colour is paired with a shape and a label. The heat map uses one blue ramp with the number printed in each cell.

## Honest limits

- **It is one author's synthesis.** The content is drafted with AI assistance from common industry practice and quotes no source. It needs review by someone who has run these systems before it is relied on, and the ratings are judgement calls.
- **The ratings are opinions.** A different firm would rate some blocks differently. That is why the arithmetic is shown.
- **Examples are not endorsements.** Product names are ones the author knows of. They are not a market survey, they may be out of date, and no claim is made about any product's current features.
- **Rules and dates need checking.** The notes mention European rules on resilience, payments and crypto. Check the current official text before relying on them. The Ask the rulebook project in this repository shows how quotes can be tied to the official source.
- **No costs or timelines.** Effort is only a rough size (small, medium, large, extra large). Real cost and time depend on your firm.
- **It cannot know your situation.** Contracts, people, existing systems and risk appetite change the answer. It starts the conversation. It does not replace an architecture review or a supplier selection.
- **No real data.** Nothing here uses any real firm's data or configuration.

## Related projects in this repository

- `kyc-risk-engine`: the scoring behind the onboarding and identity checks block.
- `transaction-monitoring-simulator`: the transaction monitoring block, with rule settings and false alarms.
- `ask-the-rulebook`: the travel rule and other duties, quoted from the official text.

## Publishing

On GitHub, Pages serves the repository root. This project then lives at `/core-banking-blueprint/`.
