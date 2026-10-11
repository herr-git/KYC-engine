# Market discovery: how KYC risk scoring engines work in practice

Research date: 11 October 2026. This is a desk review of public material, mostly vendor blogs and glossaries. Vendor material is written to sell products, so treat the market claims as indications, not facts. Primary regulatory texts (FATF, the EU AML Regulation, the European Banking Authority guidelines) were not read in full for this document. Verify against them before relying on anything here.

## 1. What these engines do

- Take what a company knows about a customer and turn it into a risk score and a band (low, medium, high).
- The band decides how much checking the customer gets: standard checks, or enhanced due diligence (extra checks) for higher risk.
- This is the "risk-based approach" that anti-money laundering rules expect: more effort on riskier customers, less on safer ones.

## 2. The standard model: four factor groups

Nearly every source describes the same structure.

- Customer: who they are, occupation, ownership, politically exposed person (PEP) status.
- Geography: where they live, their nationality, where their money goes.
- Product or service: what they use. Virtual assets and correspondent banking are treated as inherently riskier than a retail deposit account.
- Delivery channel: face to face versus remote onboarding, and whether liveness (proof the person is real and present) was checked.

Two further points that recur:

- Weight and score are separate ideas. Weight is how much a factor matters overall. Score is how risky this customer's value is for that factor.
- Two firms using identical factors can produce very different ratings, purely from different weights. The weights should come from the firm's own written risk assessment.

Some descriptions list behaviour (transaction patterns) as a fifth group of its own. One source cites the Wolfsberg Group guidance as combining product and transaction behaviour into a single group, next to customer, geography and delivery channel.

## 3. Data sources engines connect to

- Identity verification: document authenticity, face match, liveness.
- Screening data: sanctions lists, PEP lists, adverse media (negative news).
- Country risk feeds.
- For crypto firms: blockchain analytics showing how much of a wallet's history touches high-risk services such as mixers.
- Beneficial ownership data for business customers (who ultimately owns or controls the company).

A recurring warning: a scoring engine fed with unverified ownership data or stale geography flags produces a confident number that is wrong.

## 4. Static versus dynamic scoring

- Older practice: score at onboarding, then re-review on a fixed cycle (one, three or five years depending on tier).
- Current direction: event-driven re-scoring, often called perpetual KYC. The score updates when something changes, and analysts only look at exceptions.
- A rating is a snapshot. It only matters if it changes something downstream: due diligence depth, monitoring intensity, review frequency.

## 5. Where machine learning fits

One vendor describes three patterns:

- A machine-learned behaviour score used as one input to the overall customer risk.
- A fully machine-learned score, either replacing or running beside the parameter-based score.
- Machine learning applied to a single contributing element, for example generating a country risk score.

Marketing claims about machine learning reducing false alerts are common. I did not find independent evidence in this review, so I do not repeat any numbers.

## 6. Known weaknesses of these models

- Over-weighting geography, so country alone can push a customer into the top tier and waste enhanced-review effort.
- Opaque machine learning: a customer lands at 82 out of 100 and nobody can say why.
- Bad calibration. One source argues that a model rating around 30 percent of customers high risk is not rigorous.
- Averaging hides danger. Several moderate-risk signals can matter more together than a weighted average suggests.
- Stale or unverified input data.

## 7. Regulation and explainability

- The risk-based approach comes from FATF Recommendation 1 and is built into EU anti-money laundering law. The EU now has a directly applicable AML Regulation (Regulation 2024/1624) alongside the older directive framework.
- Regulators generally do not prescribe what counts as high or low risk. Each firm defines it and must be able to defend it.
- Sources say the EU AI Act treats AI systems used for customer risk scoring as high-risk when they influence the level of due diligence or whether a relationship is accepted. Simple rules-based systems with no machine learning are described as likely lower-risk categories.
- Sources describe the high-risk obligations as applying from August 2026, and the new EU anti-money laundering authority (AMLA) as due to publish guidelines on risk factors and methodology around July 2026. These dates have been subject to change in the past. Verify the current position.
- The practical overlap: be able to produce a record of which factors drove each score, and keep human analysts responsible for the final call.
- Several vendors recommend a hybrid design: transparent rules that compliance staff can read, with machine learning alongside. One vendor argues explanations should be in natural language grounded in behaviour, not only a number.

## 8. Vendor landscape (indicative, not a recommendation)

| Group | Examples named in the sources | What they mainly offer |
|---|---|---|
| Identity verification | Onfido (acquired by Entrust in February 2024), Veriff, Jumio, Sumsub, Persona | Document and face checks, liveness, onboarding workflows |
| Screening data | ComplyAdvantage, Refinitiv World-Check, Dow Jones Risk and Compliance | Sanctions, PEP and adverse media data, with some risk scoring |
| Risk engine and case management | Fenergo, NICE Actimize, Sanction Scanner, Flagright, Unit21 | Configurable scoring, review workflows, monitoring |
| Explainability and analyst tooling | Napier AI, Lucinity | Case narratives and explainable machine learning |

Market structure notes from the sources:

- Layers are often bought from different vendors and stitched together. One competitor's comparison page claims ComplyAdvantage's data supplies Sumsub's anti-money laundering screening since a March 2026 partnership. That is a competitor's claim and I did not confirm it with either company.
- One integrator reports that SDK-based identity providers typically need two to four weeks with a dedicated engineer to reach production-ready mobile onboarding. This is a single consultancy's experience.
- Buyers are advised to check whether monitoring, fraud and risk scoring share one case view or sit in separate modules.

## 9. What this means for the reference implementation

| Market practice | How this repository handles it |
|---|---|
| Four factor groups with separate weights and scores | Seven factors with weights in a config file, validated to sum to 1 |
| Data from several vendors | Connector interface, one class per source, mocks included |
| Source outages and missing data | A failed source becomes "data unavailable", a default score, and forced manual review when a required source is missing |
| Averaging hides danger | Highest-risk touchpoint for geography, hard override rules, and an escalation rule when several factors are elevated |
| Explainability and audit | Every factor carries its evidence, and every decision is logged with a fingerprint of the exact config used |
| Hybrid rules plus AI | Rules decide. An optional AI layer writes the explanation only and cannot change a score or band |
| Analyst prioritisation | Customers are ranked by band, then score |
| Dynamic scoring | Not built. See limits in the README |

## Sources

- Regula, risk-based approach in KYC: https://regulaforensics.com/blog/risk-based-approach-in-kyc/
- Sphinx, customer risk rating in AML: https://sphinxhq.com/blog-posts/customer-risk-rating-aml
- Youverify, customer risk rating model: https://youverify.co/en/blogs/customer-risk-rating-model
- Flagright, customer risk profiling: https://flagright.com/post/customer-risk-profiling-a-key-to-aml-compliance
- Wecan Group, customer risk scoring playbook: https://wecangroup.ch/blog/customer-risk-scoring-risk-based-approach
- Fenergo, risk-based approach: https://www.fenergo.com/blogs/risk-based-approach
- NICE Actimize, KYC risk assessment with AI: https://www.niceactimize.com/blog/kyc-and-pkyc-risk-assessment-strengthening-client-risk-rating-through-ai-and-machine-learning
- SymphonyAI, machine learning in KYC: https://www.symphonyai.com/resources/blog/financial-services/the-evolution-of-kyc-shaping-a-dynamic-customer-risk-profile-with-machine-learning/
- Sanctions.io, EU AI Act and AML: https://www.sanctions.io/blog/what-the-eu-ai-act-means-for-aml-compliance
- Unit21, EU AI Act FAQs: https://www.unit21.ai/blog/eu-ai-act-2026-faqs-what-fraud-and-aml-teams-need-to-know
- Flagright, explainable AML platforms: https://info.flagright.com/task/blog/aml-platforms-explainable-ai-compliance
- Fintech Global, Napier AI on explainability: https://fintech.global/2026/09/09/why-explainable-ai-is-the-key-to-aml-compliance/
- University of Luxembourg, AML and machine learning slides: https://www.uni.lu/wp-content/uploads/sites/8/2025/05/Stanislaw-Tozsa.pdf
- Sanction Scanner, Sumsub alternatives: https://www.sanctionscanner.com/alternatives/top-sumsub-alternatives-in-2026-1422
- DashDevs, KYC provider comparison: https://dashdevs.com/blog/how-to-choose-a-kyc-provider-onfido-veriff-plaid/
- CB Insights, Onfido versus Sumsub: https://www.cbinsights.com/compare/onfido-vs-sum-substance
- US patent 7801811, money laundering risk assessment (classic attribute-and-weight design): https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7801811
