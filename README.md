# AI Portfolio

Hands-on projects that show how AI can be applied in regulated financial services, with the controls a regulated firm would expect.

## Projects

| Project | What it shows |
|---|---|
| [kyc-risk-engine](kyc-risk-engine/) | Explainable customer risk scoring for KYC and anti-money laundering: data source integration, ranking, hard-stop rules, audit trail, and an AI explanation layer that cannot change the decision |
| [risk-model-playground](risk-model-playground/) | An interactive page on top of the engine. Move the weights, cut-offs and safety rules, and watch 300 synthetic customers change band. A test proves the page gives the same answers as the engine |
| [transaction-monitoring-simulator](transaction-monitoring-simulator/) | The second half of KYC: watch payments after onboarding. Set alert rules on 400 synthetic customers and see how many real problems each rule catches against how many false alarms it creates, with crypto payments and a link to the KYC risk bands |

## Ground rules for everything in this repository

- Synthetic data only. No real customer data, and no employer code or confidential material.
- AI assists where it is safe to do so. Decisions that carry regulatory weight stay in readable, testable rules.
- Each project states its limits.
