/* The catalog: every building block of a modern core banking and crypto platform.
 *
 * This is the author's synthesis of common industry practice, written down so that it can be read,
 * argued with and tested. It is not official guidance and it quotes no source.
 *
 * Ratings, each from 0 to 5:
 *   commodity  how standard the block is across the industry (high means many proven products exist)
 *   diff       how likely the block is to set a firm apart from its competitors
 *   reg        how heavy the legal, audit and certification burden is
 * scale: true when cost per transaction matters, so volume changes the build or buy answer.
 * phase: the usual order of work. 1 foundation, 2 products and operations, 3 specialist.
 * partner: true when a partner bank or provider would normally supply it under its own licence.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Catalog = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var LAYERS = [
    { id: "experience", name: "Customer experience", note: "What customers and staff see and touch." },
    { id: "integration", name: "Connecting everything", note: "How the parts talk to each other." },
    { id: "products", name: "Products", note: "What the firm sells." },
    { id: "money", name: "Moving and managing money", note: "Rails, currencies, cash and matching." },
    { id: "crypto", name: "Crypto layer", note: "Keys, chains and the link back to the books." },
    { id: "customer", name: "Customers and control", note: "Who the customer is and who may do what." },
    { id: "risk", name: "Financial crime and fraud", note: "Stopping bad money and bad actors." },
    { id: "core", name: "The core", note: "Where money is recorded." },
    { id: "data", name: "Data, reporting and operations", note: "Seeing, reporting and handling exceptions." },
    { id: "platform", name: "Platform and security", note: "The ground everything stands on." }
  ];

  // Choices shown to the visitor, grouped. Everything not listed here is a supporting block that is
  // added automatically when something chosen needs it.
  var WANT_GROUPS = [
    { name: "The core", ids: ["ledger", "accounts"] },
    { name: "Products", ids: ["deposits", "loans", "cards", "wealth"] },
    { name: "Money movement and treasury", ids: ["payments", "fx", "treasury"] },
    { name: "Crypto", ids: ["custody", "trading", "ramp"] },
    { name: "Control and insight", ids: ["permissions", "channels", "reporting", "regreporting"] }
  ];

  var COMPONENTS = [
    {
      id: "channels", layer: "experience", name: "Digital channels",
      plain: "The app, website and staff screens that customers and employees actually use.",
      why: "It is the part customers judge you on, and the easiest place to stand apart.",
      includes: ["Mobile and web apps", "Onboarding and payment flows", "Back office screens for staff", "Accessibility", "Analytics and experiments"],
      depends: ["integration", "permissions", "comms"],
      commodity: 2, diff: 5, reg: 2, scale: false, phase: 2, effort: "L", partner: false,
      options: ["Build on your own design system", "Buy a white label app and customise it", "Use the core platform's own screens for staff only"],
      examples: [],
      pitfalls: ["Business rules copied into the app, so the app and the core disagree", "Skipping accessibility, which is a legal duty for consumer banking services in the EU under the European Accessibility Act"],
      ask: ["Which screens can we change ourselves without waiting for your release?", "What do you provide for accessibility testing?"]
    },
    {
      id: "comms", layer: "experience", name: "Statements, documents and notifications",
      plain: "Producing statements, letters and contracts, and sending messages by app, email and text.",
      why: "Statements and some notices are legal duties, and clear messages cut support calls.",
      includes: ["Statement generation", "Document templates and storage", "Push, email and text delivery", "Customer language settings", "Proof of delivery"],
      depends: ["customer"],
      commodity: 4, diff: 1, reg: 2, scale: false, phase: 1, effort: "M", partner: false,
      options: ["Buy delivery services, build the templates and content", "Module inside a core platform"],
      examples: ["Twilio"],
      pitfalls: ["Statements built from a separate database that can disagree with the ledger", "Notification previews that leak account details on a locked phone"],
      ask: ["Can a statement be regenerated exactly as it was sent?", "What proves that a legal notice was delivered?"]
    },
    {
      id: "integration", layer: "integration", name: "API gateway, events and orchestration", always: true,
      plain: "How the parts talk to each other: a front door for outside callers, a stream of events inside, and workflows that chain steps together.",
      why: "A modern core is many modules. Without this layer you get tangled one to one links that nobody dares change.",
      includes: ["API gateway and developer access", "Event streaming", "Workflows, such as onboarding a customer end to end", "Idempotency: repeating a request never repeats its effect", "Versioned interfaces"],
      depends: [],
      commodity: 4, diff: 3, reg: 2, scale: false, phase: 1, effort: "M", partner: false,
      options: ["Buy the gateway and streaming, build the workflows that carry your business logic", "Orchestration features of a composable core platform"],
      examples: ["Apache Kafka", "Kong", "Temporal"],
      pitfalls: ["Treating events as a log that can be edited after the fact", "Retries that charge a customer twice because requests are not idempotent"],
      ask: ["How do you guarantee that a retried payment request is applied once?", "How do you change an interface without breaking partners?"]
    },
    {
      id: "deposits", layer: "products", name: "Deposits and savings",
      plain: "Savings and term products: accruing interest, paying it out, handling early withdrawals and notice periods.",
      why: "Deposits fund a bank and bring in customers, and the daily interest arithmetic has to be exact.",
      includes: ["Interest accrual and payout", "Term and notice deposits", "Early withdrawal rules", "Tax withholding and reporting", "A single customer view of deposits, ready for the deposit guarantee scheme"],
      depends: ["accounts", "product_engine"],
      commodity: 4, diff: 2, reg: 3, scale: false, phase: 2, effort: "M", partner: true,
      options: ["Deposit module of a core platform", "A partner bank holds the deposits"],
      examples: ["Temenos", "Mambu"],
      pitfalls: ["Rounding differences that add up across millions of accounts", "No single customer view file when the guarantee scheme asks for one"],
      ask: ["Can you produce the single customer view file the scheme requires, and how often is it tested?", "When is interest accrued, and when is it posted to the ledger?"]
    },
    {
      id: "loans", layer: "products", name: "Lending: origination and servicing",
      plain: "From application to repayment: offers, contracts, payout, schedules, arrears, collections and write offs.",
      why: "Lending is where a bank earns most of its margin and carries most of its risk.",
      includes: ["Application and offer", "Contracts and documents", "Repayment schedules and interest", "Arrears, collections and restructuring", "Data for loss provisioning (expected credit losses)"],
      depends: ["accounts", "product_engine", "credit_decision", "comms", "case_mgmt"],
      commodity: 3, diff: 3, reg: 4, scale: false, phase: 2, effort: "XL", partner: false,
      options: ["Specialist lending platform", "Lending module of a core platform", "Build in house for one narrow product"],
      examples: ["Mambu", "Temenos", "Oracle"],
      pitfalls: ["Schedules that cannot cope with a holiday, a part payment or a rate change", "Collections run in spreadsheets"],
      ask: ["Show one loan with a rate change and a missed payment, end to end.", "How do arrears flow into our loss provisioning?"]
    },
    {
      id: "credit_decision", layer: "products", name: "Credit decisioning",
      plain: "Deciding whether to lend, how much and at what price, using data and a model or rules.",
      why: "It is often the real competitive edge in lending, and regulators expect each decision to be explainable.",
      includes: ["Data from credit bureaus and open banking", "Scorecards or models", "Policy rules", "Limit and price setting", "Decision explanation and monitoring"],
      depends: ["customer"],
      commodity: 2, diff: 5, reg: 3, scale: false, phase: 2, effort: "L", partner: false,
      options: ["Buy bureau data, build the decision logic", "Decision engine platform with your own rules"],
      examples: [],
      pitfalls: ["A model nobody can explain to a declined customer", "Training on past approvals, so past bias is learned again"],
      ask: ["Can you show why one specific customer was declined?", "How do we test for unfair outcomes between groups of customers?"]
    },
    {
      id: "cards", layer: "products", name: "Card issuing and processing (debit and credit)",
      plain: "Giving customers cards and handling every swipe or tap: approving or declining in milliseconds, settling with the card scheme, and tokens for phone wallets.",
      why: "Cards need certified connections to the card schemes and strict data security. Almost nobody builds this from scratch.",
      includes: ["Card production and delivery", "Authorisation: approve or decline in real time", "Clearing and settlement with the scheme", "Phone wallet tokens", "Chargebacks and disputes", "Payment card data security compliance (PCI DSS)", "Credit cards only: billing cycles, minimum payments and interest"],
      depends: ["accounts", "fraud", "comms"],
      commodity: 5, diff: 1, reg: 5, scale: true, phase: 2, effort: "XL", partner: true,
      options: ["Card programme provider (an issuer processor)", "Card module of a core platform", "Sponsor bank programme"],
      examples: ["Marqeta", "Adyen", "Enfuce", "Thredd"],
      pitfalls: ["Authorisation that must call a slow ledger, so approvals time out", "Underestimating disputes, which are a whole back office process", "Treating credit cards like debit cards when billing cycles change everything"],
      ask: ["How fast is an approval, and what happens if your service is down?", "Who handles chargebacks, and who carries the loss?"]
    },
    {
      id: "wealth", layer: "products", name: "Wealth and investments",
      plain: "Letting customers hold and trade investments or receive advice: portfolios, orders, custody of securities, fees and suitability checks.",
      why: "It brings in customers with larger balances, and it comes with heavy rules about who may be sold what.",
      includes: ["Portfolio and holdings records", "Order routing to brokers or exchanges", "Custody of securities, usually with a specialist", "Model portfolios and rebalancing", "Suitability and appropriateness checks", "Fees, tax lots and statements"],
      depends: ["accounts", "kyc", "comms", "reporting"],
      commodity: 3, diff: 3, reg: 5, scale: false, phase: 3, effort: "XL", partner: false,
      options: ["Wealth platform", "Wealth module of a core platform", "Broker or custodian partner behind an interface"],
      examples: ["Avaloq", "Temenos", "InvestCloud"],
      pitfalls: ["Treating investments like cash, when prices, settlement dates and corporate actions all differ", "Suitability recorded once and never refreshed"],
      ask: ["Who is the legal custodian of customer assets?", "How are dividends, splits and other corporate actions handled?"]
    },
    {
      id: "payments", layer: "money", name: "Payments hub",
      plain: "One place that sends and receives payments over many rails (instant, batch, cross border) and routes each one correctly.",
      why: "Rails and message formats keep changing. Instant payments and the ISO 20022 message standard are examples. A hub absorbs that change so the rest of the bank does not feel it.",
      includes: ["Rail connections, such as euro credit transfers and instant payments", "Cross border messaging", "Message format conversion, including ISO 20022", "Routing, cut off times and retries", "Returns, recalls and investigation requests", "Checking that a payee's name matches the account"],
      depends: ["accounts", "sanctions", "recon", "aml_monitoring"],
      commodity: 4, diff: 2, reg: 5, scale: true, phase: 2, effort: "XL", partner: true,
      options: ["Payments hub platform", "Payments module of a core platform", "A partner bank provides access to the rails", "Buy the connections, build the routing"],
      examples: ["ACI Worldwide", "Volante", "Form3"],
      pitfalls: ["Treating instant payments like batch payments: there is no time to investigate after sending", "Screening that blocks a payment after the money has already moved"],
      ask: ["Which rails are live today, and who certifies the connection?", "What happens to a payment in flight when your system restarts?"]
    },
    {
      id: "fx", layer: "money", name: "Foreign exchange and multi-currency",
      plain: "Quoting and converting between currencies, and holding balances in several.",
      why: "Any cross border customer needs it, and it is a main source of fee income.",
      includes: ["Rate sources and margins", "Quotes with an expiry time", "Multi-currency accounts", "Limits on open currency positions", "Records of the rates used"],
      depends: ["accounts", "ledger"],
      commodity: 4, diff: 2, reg: 3, scale: true, phase: 2, effort: "M", partner: false,
      options: ["A liquidity provider plus your own pricing", "FX module of a core platform"],
      examples: [],
      pitfalls: ["Stale rates inside a quote the customer is still holding", "Margins hidden inside the rate, which makes them hard to show to a regulator"],
      ask: ["How long is a quote valid, and who carries the risk after that?", "Which currencies and cut off times are covered?"]
    },
    {
      id: "treasury", layer: "money", name: "Treasury and liquidity",
      plain: "Making sure the firm has the right cash in the right place and currency, and managing the risk on its own balance sheet.",
      why: "A profitable firm still fails if it cannot pay on the day. Treasury also decides what to do with idle customer money.",
      includes: ["Cash positions across accounts and banks", "Accounts held at, and for, other banks (nostro and vostro)", "Liquidity ratios and forecasts", "Interest rate and currency risk", "Hedging and investing surplus cash"],
      depends: ["ledger", "fx", "recon"],
      commodity: 4, diff: 2, reg: 4, scale: false, phase: 3, effort: "L", partner: false,
      options: ["Treasury management system", "Treasury module of a core platform for smaller firms", "Spreadsheets and bank portals at the very start, an honest option for a small firm"],
      examples: ["Kyriba", "Finastra"],
      pitfalls: ["Cash positions known only the next morning", "One person holding the whole picture in a spreadsheet"],
      ask: ["How fresh is the cash position, and from which sources?", "Does it produce the liquidity reports the regulator requires?"]
    },
    {
      id: "recon", layer: "money", name: "Reconciliation",
      plain: "Daily matching of your own records against outside ones: banks, card schemes, custodians and blockchains. Differences become investigations.",
      why: "It is the safety net that catches every other error. Without it, problems surface as customer complaints.",
      includes: ["Loading bank, scheme and custodian files", "Automatic matching rules", "A queue of breaks and their age", "Adjustments with approval", "Reports for auditors"],
      depends: ["ledger", "case_mgmt"],
      commodity: 3, diff: 2, reg: 4, scale: false, phase: 1, effort: "M", partner: false,
      options: ["Reconciliation platform", "Build for one narrow flow"],
      examples: ["SmartStream", "Duco", "Trintech"],
      pitfalls: ["Matching only totals, which hides errors that cancel out", "Breaks that stay open for months"],
      ask: ["How much volume matches automatically, and what does the break queue look like?", "Can you reconcile on chain balances against our records?"]
    },
    {
      id: "chain_connect", layer: "crypto", name: "Blockchain connectivity",
      plain: "Reading from and writing to the blockchains you support: watching deposits, sending transactions and paying network fees.",
      why: "It is how the firm learns that money arrived on chain and how it sends money out. Mistakes here cannot be reversed.",
      includes: ["Node access, your own or a provider's", "Deposit address generation and monitoring", "Transaction building, fee estimates and broadcast", "Confirmation rules: how many blocks before a deposit counts", "Handling of chain reorganisations and forks", "Adding new assets and networks"],
      depends: ["integration"],
      commodity: 3, diff: 1, reg: 3, scale: true, phase: 2, effort: "L", partner: false,
      options: ["Node provider or the custody provider's interface", "Run your own nodes for the chains that matter most", "A mix of both"],
      examples: ["Alchemy", "Infura", "Blockdaemon"],
      pitfalls: ["Crediting a deposit too early, then the chain reverses it", "Underestimating the work of adding each new network"],
      ask: ["What is your confirmation policy per chain, and can we set our own?", "What happens to our deposits during your outage?"]
    },
    {
      id: "crypto_ledger", layer: "crypto", name: "Multi-asset and on-chain ledger",
      plain: "Records customer crypto balances inside your own books and ties them to what is really on chain, keeping the firm's money and customers' claims apart.",
      why: "The wallet holds the assets. The ledger says who owns what. The two must always agree.",
      includes: ["Many assets, each with its own decimal precision", "Customer, firm and fee accounts", "Mapping from on chain transactions to ledger entries", "Separate wallets per customer or one pooled (omnibus) wallet", "Pending states for unconfirmed transfers", "A daily check that assets held equal customer claims"],
      depends: ["ledger", "chain_connect", "recon"],
      commodity: 2, diff: 3, reg: 5, scale: true, phase: 2, effort: "L", partner: false,
      options: ["Multi-asset ledger platform", "Extend the main ledger to many assets", "The custody provider's ledger plus your own copy"],
      examples: ["Formance"],
      pitfalls: ["Assuming one decimal precision fits every asset", "Keeping customer claims only in the custody provider's system, so you cannot prove them yourself"],
      ask: ["Can we run a check that holdings cover customer claims every day?", "How are pending and failed transfers shown to the customer?"]
    },
    {
      id: "custody", layer: "crypto", name: "Crypto custody and key management",
      plain: "Safely holding the private keys that control customer crypto, with approvals before anything moves.",
      why: "Whoever controls the keys controls the money. This is where the largest crypto losses have happened.",
      includes: ["Key generation and storage in hardware or with multi-party computation", "Hot, warm and cold wallet tiers", "Policies: limits, approved addresses, several approvers", "Recovery of keys after a disaster", "Insurance and independent audits", "Keeping customer assets separate from the firm's own"],
      depends: ["chain_connect", "crypto_ledger", "permissions"],
      commodity: 3, diff: 1, reg: 5, scale: true, phase: 2, effort: "XL", partner: true,
      options: ["A regulated third party custodian", "Custody technology licensed from a provider and run by you", "Self built key management, rare and specialist"],
      examples: ["Fireblocks", "BitGo", "Anchorage Digital", "Copper"],
      pitfalls: ["Recovery that depends on one person or one device", "Hot wallet limits so high that one breach is fatal"],
      ask: ["Who is the legal custodian, and what happens in the custodian's insolvency?", "Can we see an independent audit of how keys are handled?"]
    },
    {
      id: "chain_analytics", layer: "crypto", name: "Blockchain analytics (wallet screening)",
      plain: "Checking the history of a wallet address for known risk: sanctions, scams, mixing services, criminal markets.",
      why: "Crypto firms must know where funds came from and where they go. This is how they find out.",
      includes: ["Wallet risk scores", "Transaction tracing", "Alerts when exposure appears later", "Evidence and reports for cases", "Coverage of the chains you support"],
      depends: ["customer", "case_mgmt"],
      commodity: 5, diff: 0, reg: 4, scale: false, phase: 2, effort: "S", partner: false,
      options: ["Buy: this is a data business and the data is the product"],
      examples: ["Chainalysis", "Elliptic", "TRM Labs"],
      pitfalls: ["Screening deposits but not withdrawals", "Treating a score as a verdict instead of one input"],
      ask: ["Which of our chains and tokens are covered, and how fresh is the data?", "How do you explain a score to a regulator?"]
    },
    {
      id: "travel_rule", layer: "crypto", name: "Travel rule messaging",
      plain: "Sending and receiving the sender and receiver details that must accompany crypto transfers between firms.",
      why: "The EU Transfer of Funds Regulation requires it for crypto transfers. The Ask the rulebook project in this repository quotes the relevant articles.",
      includes: ["Finding the other firm", "Secure exchange of messages", "Extra checks for transfers to private wallets", "Matching the data and holding or rejecting a transfer", "Record keeping"],
      depends: ["customer", "crypto_ledger"],
      commodity: 4, diff: 0, reg: 5, scale: false, phase: 2, effort: "M", partner: false,
      options: ["Buy a network membership, build the rules that decide hold or release"],
      examples: ["Notabene", "Sygna"],
      pitfalls: ["Sending the data after the transfer instead of with it", "Finding that a counterparty uses a different network and has no way to talk to you"],
      ask: ["Which counterparties can we reach through you?", "What happens to a transfer when the other side does not respond?"]
    },
    {
      id: "trading", layer: "crypto", name: "Crypto trading and liquidity",
      plain: "Letting customers buy, sell and swap crypto: pricing, order handling and sourcing liquidity from market makers or exchanges.",
      why: "Trading earns the margin, and it exposes the firm to price and operational risk.",
      includes: ["Quotes and order types", "Liquidity sources and smart routing", "A best execution policy", "Monitoring for market abuse", "Inventory and risk limits", "Settlement and fees"],
      depends: ["crypto_ledger", "custody", "aml_monitoring"],
      commodity: 3, diff: 4, reg: 4, scale: true, phase: 3, effort: "XL", partner: false,
      options: ["A liquidity provider plus your own pricing", "An exchange engine, licensed or built", "A broker connection"],
      examples: [],
      pitfalls: ["Quoting prices the firm cannot actually hedge", "No monitoring of customers who manipulate thin markets"],
      ask: ["Who bears the loss when the price moves between quote and fill?", "What market abuse monitoring is included?"]
    },
    {
      id: "ramp", layer: "crypto", name: "Fiat on and off ramp",
      plain: "Moving between ordinary money and crypto: customers pay in by bank transfer or card and withdraw back to a bank.",
      why: "It is almost every customer's first step, and it joins two worlds that run at different speeds under different rules.",
      includes: ["Bank and card pay in", "Payout to bank accounts", "Matching a payment to a customer and an order", "Handling of chargebacks and reversals", "Source of funds checks on larger amounts"],
      depends: ["accounts", "payments", "crypto_ledger", "travel_rule", "chain_analytics"],
      commodity: 3, diff: 3, reg: 4, scale: true, phase: 3, effort: "L", partner: false,
      options: ["Partner with a ramp provider", "Build it on a payments hub and bank accounts"],
      examples: ["MoonPay", "Ramp Network", "Banxa"],
      pitfalls: ["Card payments that are reversed after the crypto has left", "A bank closing your account because of crypto exposure"],
      ask: ["How do you handle a reversal after the crypto was delivered?", "Which banks sit behind this, and how concentrated is that risk?"]
    },
    {
      id: "customer", layer: "customer", name: "Customer and party data",
      plain: "The one trusted record of who each customer is, how they are linked to others and what they have agreed to.",
      why: "Accounts, risk checks and reports all hang off it. Two versions of the same customer is where compliance problems start.",
      includes: ["Person and company records", "Relationships: owners, directors, joint holders", "Consents and preferences", "Version history", "Risk rating, fed by the KYC checks"],
      depends: [],
      commodity: 3, diff: 2, reg: 3, scale: false, phase: 1, effort: "M", partner: false,
      options: ["Module of a core platform", "Dedicated customer data platform", "Build in house"],
      examples: [],
      pitfalls: ["Treating a company like a person, so owners and controllers get lost", "No history, so you cannot show what you knew on the day"],
      ask: ["Can we see what the record looked like on any past date?", "How are beneficial owners and controllers modelled?"]
    },
    {
      id: "kyc", layer: "customer", name: "Onboarding and identity checks (know your customer)",
      plain: "Checking who a customer really is before and while you serve them: documents, face match, company registers and regular refresh.",
      why: "It is required by law, and it is the front door for fraud. The KYC risk engine in this repository shows the scoring part.",
      includes: ["Document and face checks", "Company register and ownership lookups", "Customer risk scoring", "Periodic refresh of customer information", "Case handling for exceptions"],
      depends: ["customer", "case_mgmt"],
      commodity: 5, diff: 1, reg: 5, scale: true, phase: 1, effort: "L", partner: false,
      options: ["Buy identity verification services, build the risk scoring and decision rules", "A platform that bundles checks and workflow"],
      examples: ["Sumsub", "Signicat", "Veriff"],
      pitfalls: ["A provider that does not cover the countries your customers come from", "Hard stop rules hidden inside a vendor tool that compliance cannot read"],
      ask: ["Can compliance read and change every rule, with each change logged?", "What is the false rejection rate for our customer mix?"]
    },
    {
      id: "permissions", layer: "customer", name: "Permissions and approvals",
      plain: "Who may see and do what: customers using their accounts, and staff using back office tools, including approvals where one person prepares and another approves.",
      why: "Most insider fraud and many audit findings come from access that was too wide. Strong customer authentication is also a legal duty for online payments in the EU.",
      includes: ["Staff roles with least privilege", "Four eyes approval for risky actions", "Customer login and strong authentication", "Delegated access, such as a company where several people act", "Regular access reviews"],
      depends: [],
      commodity: 3, diff: 2, reg: 4, scale: false, phase: 1, effort: "M", partner: false,
      options: ["Buy an identity and access platform, build the entitlement rules for your products", "Module of a core platform"],
      examples: ["Keycloak", "Auth0", "Okta"],
      pitfalls: ["Roles that grow until everyone is an administrator", "Approvals that one person can both prepare and approve through two accounts"],
      ask: ["Can we model a company where three people must approve a payment?", "How do you prove who approved what?"]
    },
    {
      id: "sanctions", layer: "risk", name: "Sanctions and watchlist screening",
      plain: "Checking customers and payments against official sanctions and watchlists.",
      why: "Breaking sanctions carries severe penalties, and the lists change often.",
      includes: ["List data and updates", "Name matching that copes with spelling and alphabet differences", "Screening at onboarding, on list changes and on every payment", "Alert review and decisions", "Evidence of every check"],
      depends: ["customer", "case_mgmt"],
      commodity: 5, diff: 0, reg: 5, scale: true, phase: 1, effort: "M", partner: false,
      options: ["Buy a screening service with maintained lists", "Screening module inside a payments hub"],
      examples: ["World-Check", "Dow Jones", "ComplyAdvantage"],
      pitfalls: ["Matching so strict that real hits are missed, or so loose that analysts drown", "Screening that runs after the payment is released"],
      ask: ["How quickly do list updates reach us, and are existing customers rescreened?", "Show the evidence trail for one cleared alert."]
    },
    {
      id: "aml_monitoring", layer: "risk", name: "Transaction monitoring (anti-money laundering)",
      plain: "Watching what customers do after onboarding to spot patterns that may be money laundering, then raising alerts for people to review.",
      why: "The law requires ongoing monitoring and reporting of suspicious activity. The transaction monitoring simulator in this repository shows how rule settings trade missed cases against false alarms.",
      includes: ["Rules and scenarios", "Models for unusual behaviour", "An alert queue linked to cases", "Filing of suspicious activity reports", "Tuning and testing of thresholds", "Crypto only: signals from the chain"],
      depends: ["customer", "case_mgmt"],
      commodity: 4, diff: 2, reg: 5, scale: true, phase: 2, effort: "L", partner: false,
      options: ["Buy a monitoring platform, build firm specific rules", "Build rules on your own data platform, common where the data team is strong"],
      examples: ["Hawk", "Napier AI", "Actimize"],
      pitfalls: ["Thresholds set once and never tuned", "Alerts with no link to the customer's risk rating"],
      ask: ["How do we test a rule change before it goes live?", "Can we explain every alert to a regulator?"]
    },
    {
      id: "fraud", layer: "risk", name: "Fraud detection",
      plain: "Spotting stolen cards, account takeover, scams where customers are tricked into paying, and accounts used to pass on stolen money, all in real time.",
      why: "Fraud losses and lost trust arrive on the same day. Regulators in several countries are moving more of the scam losses onto firms.",
      includes: ["Real time scoring of payments and logins", "Device and behaviour signals", "Scam warnings and payment friction", "Detection of accounts used to pass on stolen money", "Loss reporting and feedback to the models"],
      depends: ["customer", "case_mgmt"],
      commodity: 4, diff: 2, reg: 4, scale: true, phase: 2, effort: "L", partner: false,
      options: ["Buy a fraud platform and add your own rules", "Shared data from a consortium of firms"],
      examples: ["Feedzai", "BioCatch", "Sardine"],
      pitfalls: ["Blocking good customers so often that they leave", "Models trained on last year's fraud and blind to this year's"],
      ask: ["What is the decision time, and what happens if the service is down?", "Can we add or override a rule the same day?"]
    },
    {
      id: "ledger", layer: "core", name: "Ledger (double entry bookkeeping engine)",
      plain: "The system of record for money. Every movement is written as equal debits and credits, entries are never changed, and balances come from the entries.",
      why: "If the ledger is right, everything else can be fixed. If it is wrong, nothing can be trusted. It is the part hardest to replace later.",
      includes: ["Double entry posting with balanced entries", "Entries that are never edited: corrections are new entries", "Many currencies and assets", "Holds and reservations: money set aside but not yet moved", "Real time balances", "Link to the accounting general ledger", "Posting that is safe to repeat"],
      depends: ["audit"],
      commodity: 3, diff: 3, reg: 5, scale: true, phase: 1, effort: "XL", partner: true,
      options: ["Ledger inside a core banking platform", "Dedicated ledger platform or open source ledger database", "Build in house on a relational database"],
      examples: ["Thought Machine", "Mambu", "TigerBeetle", "Formance"],
      pitfalls: ["Storing a balance as a number you update, instead of deriving it from entries", "Checking the balance and posting in separate steps, so two payments can spend the same money", "A ledger designed for one currency and stretched to many later"],
      ask: ["How is a double spend prevented under heavy parallel load?", "How do we get a balance as it was at any past moment?", "What is the plan if we ever leave you?"]
    },
    {
      id: "product_engine", layer: "core", name: "Product catalogue and pricing engine",
      plain: "Where you define what you sell: interest rates, fees, limits, terms and the rules that apply to each product.",
      why: "This is where your business differs from the next one. Changing products fast without a code release is the main promise of a modern core.",
      includes: ["Product definitions and versions", "Interest and fee rules", "Limits and eligibility", "Bundles and tiers", "Start dates and simulation before launch"],
      depends: ["audit"],
      commodity: 2, diff: 4, reg: 2, scale: false, phase: 1, effort: "L", partner: false,
      options: ["Configurable product engine in a core platform", "Build in house when pricing is your edge"],
      examples: [],
      pitfalls: ["Product rules scattered across channels, so the app and the statement disagree", "Changing a live product with no way to test the effect first"],
      ask: ["Who can launch a new product, and in how many days?", "How are existing customers moved when a product changes?"]
    },
    {
      id: "accounts", layer: "core", name: "Accounts and balances",
      plain: "The customer facing account: its number, owner, status, sub-accounts and holds, backed by the ledger.",
      why: "It is what a customer means by 'my money'. It turns ledger entries into something people and payments can use.",
      includes: ["Opening and closing accounts", "Bank account numbers (IBAN) and local formats", "Sub-accounts and savings pots", "Joint and business accounts", "Blocks, freezes and dormancy", "Data for statements"],
      depends: ["customer", "ledger", "product_engine", "permissions"],
      commodity: 3, diff: 3, reg: 4, scale: true, phase: 1, effort: "L", partner: true,
      options: ["Account module of a core platform", "A banking as a service partner provides accounts under its licence", "Build on top of your own ledger"],
      examples: ["Temenos", "Finastra", "Mambu"],
      pitfalls: ["Mixing the account (what the customer sees) with the ledger (what is booked), so every change to one breaks the other", "No way to freeze one account without freezing the whole customer"],
      ask: ["How do you handle a court order to freeze funds on one account?", "Can an account hold several currencies, and how?"]
    },
    {
      id: "reporting", layer: "data", name: "Management reporting and data platform",
      plain: "A copy of the data organised for analysis: dashboards, finance and risk numbers, and data for models, without slowing down the live system.",
      why: "Leaders cannot run the firm without it, and regulatory reports draw on the same data.",
      includes: ["Data warehouse or lakehouse", "Pipelines from every system", "Shared definitions of each metric", "Access controls and masking of personal data", "Dashboards"],
      depends: ["ledger", "integration"],
      commodity: 4, diff: 2, reg: 3, scale: false, phase: 2, effort: "L", partner: false,
      options: ["Buy a cloud data platform, build the models and definitions", "Reporting module of a core platform, usually limited"],
      examples: ["Snowflake", "Databricks", "Google BigQuery"],
      pitfalls: ["Every team defining 'active customer' differently", "Reporting straight off the live database, which slows payments"],
      ask: ["How fresh is the data, and can we trace each number to its source?", "How do you hide personal data from people who do not need it?"]
    },
    {
      id: "regreporting", layer: "data", name: "Regulatory reporting",
      plain: "Producing the reports supervisors require: capital, liquidity, large exposures, payment fraud statistics, crypto activity and more.",
      why: "Missing or wrong reports bring supervisory attention. Formats change every year, which favours buying.",
      includes: ["Report templates per regulator", "Data mapping from the ledger and reporting platform", "Validation and sign off", "Submission channels", "Tracking of changes when rules change"],
      depends: ["ledger", "reporting"],
      commodity: 4, diff: 1, reg: 5, scale: false, phase: 2, effort: "L", partner: false,
      options: ["Buy a regulatory reporting service", "Module of a core platform"],
      examples: ["Wolters Kluwer", "AxiomSL"],
      pitfalls: ["Numbers assembled by hand in the last week of the quarter", "No trace from a reported number back to the ledger"],
      ask: ["Who updates the templates when the regulator changes them, and how fast?", "Can I trace any figure to the underlying entries?"]
    },
    {
      id: "case_mgmt", layer: "data", name: "Operations and case management",
      plain: "The back office tool where staff review alerts, handle complaints, investigate payments and do manual work with full records.",
      why: "Every automated system throws exceptions. Staff need one place to handle them with proper approvals.",
      includes: ["Work queues and assignments", "Case notes and evidence", "Service level timers", "Approval flows", "Links to the customer, account and payment"],
      depends: ["permissions"],
      commodity: 4, diff: 1, reg: 3, scale: false, phase: 1, effort: "M", partner: false,
      options: ["Case management platform", "Build on a workflow tool", "Module of a core platform"],
      examples: ["Salesforce", "ServiceNow", "Camunda"],
      pitfalls: ["Each team keeping its own spreadsheet because the tool is awkward", "No link back to the evidence behind a decision"],
      ask: ["Can one case combine an alert, a complaint and a payment investigation?", "How are approvals and overrides recorded?"]
    },
    {
      id: "platform", layer: "platform", name: "Cloud, resilience and security platform", always: true,
      plain: "The ground everything runs on: hosting, networks, encryption keys, monitoring, backups and recovery.",
      why: "Regulators expect proof that you can survive an outage and an attack. In the EU the Digital Operational Resilience Act puts this into law for financial firms.",
      includes: ["Hosting and networks", "Encryption key management with hardware security modules", "Monitoring and alerting", "Backup and disaster recovery, tested on a schedule", "Secrets and access management for engineers"],
      depends: [],
      commodity: 5, diff: 0, reg: 4, scale: false, phase: 1, effort: "L", partner: false,
      options: ["A major cloud provider plus managed services", "A private data centre, rare for a new build"],
      examples: ["Amazon Web Services", "Microsoft Azure", "Google Cloud"],
      pitfalls: ["Recovery that is written down but never rehearsed", "One cloud account for everything, so one mistake reaches production data"],
      ask: ["What recovery time and data loss can you prove, not promise?", "Who can reach production data, and how is that logged?"]
    },
    {
      id: "audit", layer: "platform", name: "Audit trail and event log", always: true,
      plain: "A permanent, tamper evident record of who did what and when, for both people and systems.",
      why: "Auditors, regulators and your own investigators will ask for it, and it lets you rebuild what happened after an incident.",
      includes: ["An append only event store", "Logs of staff and system actions", "Retention and legal hold", "Search for investigators"],
      depends: [],
      commodity: 3, diff: 1, reg: 5, scale: false, phase: 1, effort: "M", partner: false,
      options: ["Build a thin layer on a proven event store or log platform", "Module inside a core platform"],
      examples: [],
      pitfalls: ["Logs that can be edited by the people they describe", "Keeping everything forever, which collides with data protection deletion duties"],
      ask: ["Can an administrator change or delete a record, and would we see it?", "How do you honour a deletion request without breaking the audit trail?"]
    }
  ];

  var NOTES = [
    {
      title: "How a modern core banking system fits together",
      bullets: [
        "Older cores were one large program holding accounts, products, the ledger and often the screens too. Changing one thing meant testing everything.",
        "The modern pattern is called composable or modular. The core is split into services with clear interfaces: ledger, accounts, product rules, payments and so on. You can replace one without replacing all.",
        "Most real banks land in the middle. They use a platform for the heavy, regulated parts and write their own services where they want to differ.",
        "Event streaming lets every part learn about a change as it happens, instead of waiting for the night batch.",
        "Cloud hosting is now normal. Regulators expect an exit plan for any provider that a critical function depends on."
      ]
    },
    {
      title: "The ledger is the heart",
      bullets: [
        "Double entry: every movement has equal debits and credits, so the books always balance and an error shows up as an imbalance.",
        "Entries are never edited. A correction is a new entry that reverses the old one. That gives you history for free.",
        "A balance is the sum of entries, not a number someone overwrites. Hold and release steps are entries too.",
        "Checking the balance and posting must happen as one step. Otherwise two payments arriving together can spend the same money.",
        "Make every posting safe to repeat. Networks fail and callers retry. A repeat must not move money twice.",
        "Keep the real time ledger apart from the accounting general ledger. The first serves customers by the millisecond. The second serves finance and auditors, often summarised.",
        "Design for many currencies and assets from the start. Adding them later is one of the most painful rebuilds."
      ]
    },
    {
      title: "Build, buy or both, in plain terms",
      bullets: [
        "Buy what is standard and heavily regulated: card scheme connections, sanctions lists, identity checks, blockchain analytics. A vendor spreads the certification cost over many clients.",
        "Build what makes you different: product rules, credit decisions, the customer experience.",
        "In between, buy a platform and build the extension. Most of the hard work is then in the interfaces.",
        "Regulators treat outsourcing as your responsibility. You can hand over the work. You cannot hand over the accountability.",
        "Count the hidden costs: integration, testing, running two systems during migration, and the exit if the vendor fails or raises prices.",
        "Judge vendors on the hard cases, not the demo: a failed payment, a freeze order, a restatement, a rate change on a live loan."
      ]
    },
    {
      title: "The partner bank model, and its catch",
      bullets: [
        "Many fintechs launch on a partner bank's licence, often called banking as a service. It is faster and cheaper than becoming a bank.",
        "The partner holds the licence, the deposits and the access to payment rails. You own the customer and the experience.",
        "You still need your own records. Keep a copy of every balance and entry, and reconcile with the partner every day.",
        "The 2024 collapse of Synapse, a United States intermediary in this model, left customers unable to reach funds partly because records did not match. It is widely reported and a clear lesson in keeping your own books.",
        "Concentration is a risk. A partner can limit your activity, change terms or leave the business."
      ]
    },
    {
      title: "What is different with crypto",
      bullets: [
        "Transfers cannot be reversed. A mistake is a loss, not a ticket.",
        "Keys are money. How keys are stored, who approves a move and how they are recovered is the core of the design.",
        "A deposit is only final after enough confirmations, and the number differs by chain. Crediting too early invites reversal losses.",
        "Two ledgers must agree: the chain and your books. Reconcile every day, and be able to show that assets held cover customer claims.",
        "Decide early between separate wallets per customer and one pooled wallet. It changes cost, privacy, reconciliation and what happens in an insolvency.",
        "There is no end of day. Markets and chains run all night and every weekend, so operations and monitoring must too.",
        "Rules attach to the firm. In the EU, the markets in crypto-assets regulation sets authorisation and custody duties, and the Transfer of Funds Regulation adds the travel rule. Check national start dates."
      ]
    },
    {
      title: "Moving off an old core",
      bullets: [
        "A single big switch over a weekend is the riskiest path. It has worked, and it has produced famous outages.",
        "Many firms move step by step: new products on the new core first, then customer groups, then the old products.",
        "Run both in parallel for a period and reconcile the results every day. Disagreement is the early warning.",
        "Clean the data before moving it. Migrating dirty data only makes it expensive and hard to fix.",
        "Plan the way back. Ask what you would do on the first day if the new system had to be switched off."
      ]
    },
    {
      title: "Ways this goes wrong",
      bullets: [
        "Choosing from the demo and not from the hard cases.",
        "Underestimating integration, which is often more than half of the effort.",
        "Treating permissions, audit and recovery as things to add later.",
        "Using batch thinking in an instant payment world.",
        "Having no one who owns the data model, so every team invents its own meaning for 'customer' and 'account'.",
        "Signing without a tested exit plan.",
        "Never rehearsing recovery."
      ]
    }
  ];

  var GLOSSARY = [
    { term: "Ledger", def: "The book of record for money. Each movement is written as entries and never edited." },
    { term: "Double entry", def: "Every movement is recorded twice, as a debit in one place and an equal credit in another, so the books must balance." },
    { term: "Idempotent", def: "Safe to repeat. Sending the same request twice has the same effect as sending it once." },
    { term: "Composable core", def: "A core built from separate services with clear interfaces, so that parts can be swapped one at a time." },
    { term: "Rails", def: "The networks that carry payments, such as instant payments, bank batches, card schemes and cross border messaging." },
    { term: "ISO 20022", def: "The modern message standard for payments. Messages carry richer data than the older formats." },
    { term: "Nostro and vostro", def: "Accounts a bank keeps at another bank (nostro, 'ours with you') or another bank keeps with it (vostro, 'yours with us')." },
    { term: "Banking as a service", def: "A licensed bank lets a fintech offer accounts and payments through the bank's licence and rails." },
    { term: "Orchestration", def: "Software that chains steps across several systems into one process, such as onboarding a customer." },
    { term: "Omnibus wallet", def: "One pooled crypto wallet that holds many customers' assets, with the split recorded in the firm's books." },
    { term: "Multi-party computation (MPC)", def: "A way to protect crypto keys by splitting them into pieces held in different places, so no single place can move funds." },
    { term: "Confirmations", def: "The number of new blocks added after a transaction. More confirmations make a reversal less likely." },
    { term: "Travel rule", def: "The duty to send sender and receiver details along with a transfer, so firms can screen both ends." },
    { term: "Four eyes", def: "A control where one person prepares an action and a different person approves it." },
    { term: "Reconciliation", def: "Matching your own records with an outside party's records and investigating each difference." }
  ];

  // Short names for chips, tiles and heat map rows.
  var SHORT = {
    channels: "Digital channels", comms: "Statements and messages", integration: "APIs and events", deposits: "Deposits",
    loans: "Lending", credit_decision: "Credit decisions", cards: "Cards", wealth: "Wealth", payments: "Payments",
    fx: "Foreign exchange", treasury: "Treasury", recon: "Reconciliation", chain_connect: "Chain connectivity",
    crypto_ledger: "Crypto ledger", custody: "Crypto custody", chain_analytics: "Chain analytics", travel_rule: "Travel rule",
    trading: "Crypto trading", ramp: "Fiat on and off ramp", customer: "Customer data", kyc: "Onboarding checks",
    permissions: "Permissions", sanctions: "Sanctions screening", aml_monitoring: "Transaction monitoring",
    fraud: "Fraud detection", ledger: "Ledger", product_engine: "Products and pricing", accounts: "Accounts",
    reporting: "Management reports", regreporting: "Regulatory reports", case_mgmt: "Case management",
    platform: "Cloud and security", audit: "Audit trail"
  };
  COMPONENTS.forEach(function (c) { c.short = SHORT[c.id]; });

  // Two walk throughs that show how the blocks work together. Each step names the block that does the work.
  var FLOWS = [
    {
      id: "card", title: "A card payment, in under a second",
      steps: [
        { text: "Customer taps the card in a shop", block: "cards" },
        { text: "Fraud score in milliseconds", block: "fraud" },
        { text: "Balance checked and money held", block: "ledger" },
        { text: "Approved or declined", block: "cards" },
        { text: "Final amount arrives from the card scheme and the hold becomes a booking", block: "ledger" },
        { text: "Daily match against the scheme's files", block: "recon" },
        { text: "Customer sees it in the app", block: "channels" }
      ]
    },
    {
      id: "crypto", title: "A crypto deposit becoming a customer balance",
      steps: [
        { text: "Customer sends crypto to their deposit address", block: "chain_connect" },
        { text: "Wait for enough confirmations", block: "chain_connect" },
        { text: "Wallet screened for risk", block: "chain_analytics" },
        { text: "Sender details checked", block: "travel_rule" },
        { text: "Customer balance credited in the books", block: "crypto_ledger" },
        { text: "Keys stay locked behind approval rules", block: "custody" },
        { text: "Daily proof: holdings cover customer claims", block: "recon" }
      ]
    }
  ];

  return { LAYERS: LAYERS, FLOWS: FLOWS, WANT_GROUPS: WANT_GROUPS, COMPONENTS: COMPONENTS, NOTES: NOTES, GLOSSARY: GLOSSARY };
});
