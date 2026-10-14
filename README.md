# Fintech systems lab

Product thinking on how regulated financial systems are designed, built and checked, with working demos. Built with AI assistance. All data is synthetic or public.

The projects follow one path: check the customer, watch the payments, know the rules, and see the platform underneath.

## 1. Compliance engines

Checks a regulated firm runs on customers and payments.

| Project | What it shows |
|---|---|
| [kyc-risk-engine](kyc-risk-engine/) | Explainable customer risk scoring for know your customer (KYC) and anti-money laundering: data source integration, ranking, hard-stop rules, audit trail, and an AI explanation layer that cannot change the decision |
| [risk-model-playground](risk-model-playground/) | An interactive page on top of the engine. Move the weights, cut-offs and safety rules, and watch 300 synthetic customers change band. A test proves the page gives the same answers as the engine |
| [transaction-monitoring-simulator](transaction-monitoring-simulator/) | The second half of KYC: watch payments after onboarding. Set alert rules on 400 synthetic customers and see how many real problems each rule catches against how many false alarms it creates, with crypto payments and a link to the KYC risk bands |

## 2. Rules and sources

What the law actually says.

| Project | What it shows |
|---|---|
| [ask-the-rulebook](ask-the-rulebook/) | A question box over public anti-money laundering rules. Answers are exact quotes from the official text with citations, cut by a program that fails if a quote is not word for word. No AI writes the answers, and it refuses what it does not cover |

## 3. Platform architecture

The systems the checks run on.

| Project | What it shows |
|---|---|
| [core-banking-blueprint](core-banking-blueprint/) | The building blocks of a modern core banking and crypto platform. Choose what you want to offer and see every block you need, how the blocks connect, whether to build, buy or use a partner for each one with the score shown line by line, and a sensible order of work |

## Ground rules for everything in this repository

- Synthetic or public data only (fake customers, or published laws). No real customer data, and no employer code or confidential material.
- AI assists where it is safe to do so. Decisions that carry regulatory weight stay in readable, testable rules.
- Each project states its limits.
