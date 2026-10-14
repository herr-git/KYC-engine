/* The catalog: countries, currencies, local clearing schemes, rules and checks for the route planner.
 *
 * Everything here is ILLUSTRATIVE. Scheme names, operators and rough behaviour come from public
 * knowledge. Fees, speeds, spreads and limits are reasonable round numbers chosen for a demonstration.
 * They are not quotes, not a market survey and not current. Rules are summarised at headline level and
 * must be checked against the official text before anyone relies on them.
 *
 * Money amounts are in US dollars. Times are in minutes.
 *
 * Fields on a scheme:
 *   kind    instant (seconds, any time), rtgs (one payment at a time, central bank money, business
 *           hours), batch (grouped runs), wallet (mobile money, outside bank clearing)
 *   hours   24x7 (always open), bizday (business days only)
 *   speed   best, typical and worst case minutes once the scheme is open
 *   fixed   cost per payment to the sending firm, in dollars; bps is a percentage cost in basis points
 *           (one basis point is 0.01 percent)
 *   limit   largest single payment in dollars, or null when the scheme sets none
 *   min     smallest payment in dollars, or null
 *   access  who can use the scheme and how a firm like ours would get in
 *   check   the receiver check the scheme offers, or null
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PrcCatalog = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // A short helper so each scheme fits on a few lines.
  function S(id, ccy, name, operator, kind, hours, speed, fixed, bps, limit, access, check, note) {
    return {
      id: id, ccy: ccy, name: name, operator: operator, kind: kind, hours: hours,
      speed: { best: speed[0], typ: speed[1], worst: speed[2] },
      fixed: fixed, bps: bps, limit: limit, min: null, access: access, check: check || null, note: note || ""
    };
  }

  // One row per country or region. A country always has one home currency.
  // tier: how deeply the currency trades. 1 deepest, 3 thinnest.
  // spread: the one-way cost in basis points of converting this currency against US dollars,
  //         as a firm like ours might pay a liquidity provider. The US dollar is the reference at 0.
  // control: 0 none, 1 moderate, 2 strong limits on moving the currency across borders.
  // eea: inside the European Economic Area, where the data protection regulation applies.
  var JURISDICTIONS = [
    { id: "US", name: "United States", ccy: "USD", ccyName: "US dollar", tier: 1, spread: 0, control: 0, eea: false, lists: ["US Treasury (OFAC)"], hub: true },
    { id: "EA", name: "Euro area (for example Germany, France, Spain)", short: "Euro area", ccy: "EUR", ccyName: "Euro", tier: 1, spread: 3, control: 0, eea: true, lists: ["EU consolidated list"], hub: true },
    { id: "GB", name: "United Kingdom", ccy: "GBP", ccyName: "Pound sterling", tier: 1, spread: 6, control: 0, eea: false, lists: ["UK list (OFSI)"] },
    { id: "JP", name: "Japan", ccy: "JPY", ccyName: "Japanese yen", tier: 1, spread: 6, control: 0, eea: false, lists: ["Japan list (Ministry of Finance)"] },
    { id: "AU", name: "Australia", ccy: "AUD", ccyName: "Australian dollar", tier: 1, spread: 8, control: 0, eea: false, lists: ["Australia list (DFAT)"] },
    { id: "CA", name: "Canada", ccy: "CAD", ccyName: "Canadian dollar", tier: 1, spread: 7, control: 0, eea: false, lists: ["Canada list (Global Affairs)"] },
    { id: "CH", name: "Switzerland", ccy: "CHF", ccyName: "Swiss franc", tier: 1, spread: 7, control: 0, eea: false, lists: ["Swiss list (SECO)"] },
    { id: "DK", name: "Denmark", ccy: "DKK", ccyName: "Danish krone", tier: 2, spread: 8, control: 0, eea: true, lists: ["EU consolidated list"] },
    { id: "SG", name: "Singapore", ccy: "SGD", ccyName: "Singapore dollar", tier: 2, spread: 10, control: 0, eea: false, lists: ["Singapore list (MAS)"] },
    { id: "AE", name: "United Arab Emirates", short: "UAE", ccy: "AED", ccyName: "UAE dirham", tier: 2, spread: 12, control: 0, eea: false, lists: ["UAE local list"] },
    { id: "MX", name: "Mexico", ccy: "MXN", ccyName: "Mexican peso", tier: 2, spread: 25, control: 0, eea: false, lists: ["Mexico list (UIF)"] },
    { id: "TH", name: "Thailand", ccy: "THB", ccyName: "Thai baht", tier: 2, spread: 25, control: 1, eea: false, lists: ["Thailand list (AMLO)"] },
    { id: "CN", name: "China", ccy: "CNY", ccyName: "Chinese yuan (onshore)", tier: 2, spread: 30, control: 2, eea: false, lists: ["China list"] },
    { id: "ZA", name: "South Africa", ccy: "ZAR", ccyName: "South African rand", tier: 3, spread: 35, control: 1, eea: false, lists: ["South Africa list (FIC)"] },
    { id: "IN", name: "India", ccy: "INR", ccyName: "Indian rupee", tier: 3, spread: 40, control: 2, eea: false, lists: ["India list (MHA)"] },
    { id: "PH", name: "Philippines", ccy: "PHP", ccyName: "Philippine peso", tier: 3, spread: 40, control: 1, eea: false, lists: ["Philippines list (AMLC)"] },
    { id: "BR", name: "Brazil", ccy: "BRL", ccyName: "Brazilian real", tier: 3, spread: 45, control: 1, eea: false, lists: ["Brazil list (COAF)"] },
    { id: "TR", name: "Turkey", ccy: "TRY", ccyName: "Turkish lira", tier: 3, spread: 80, control: 1, eea: false, lists: ["Turkey list (MASAK)"] },
    { id: "KE", name: "Kenya", ccy: "KES", ccyName: "Kenyan shilling", tier: 3, spread: 90, control: 1, eea: false, lists: ["Kenya list (FRC)"] },
    { id: "NG", name: "Nigeria", ccy: "NGN", ccyName: "Nigerian naira", tier: 3, spread: 150, control: 2, eea: false, lists: ["Nigeria list (NFIU)"] }
  ];

  var SCHEMES = [
    // ---- US dollar
    S("fednow", "USD", "FedNow", "Federal Reserve", "instant", "24x7", [0.05, 0.2, 1], 0.05, 0, 1000000, "Through a bank that has joined. Non-banks cannot join directly.", null, "Network cap shown. Each bank sets its own lower limit."),
    S("fedwire", "USD", "Fedwire Funds", "Federal Reserve", "rtgs", "bizday", [5, 30, 240], 0.9, 0, null, "Direct for banks with a Federal Reserve account. Everyone else goes through a bank.", null, "The usual route for large dollar payments."),
    S("ach", "USD", "ACH (Automated Clearing House)", "Nacha network", "batch", "bizday", [720, 1440, 2880], 0.25, 0, 1000000, "Through a bank that originates payments.", null, "Cheap and slow. Same day runs exist."),
    // ---- Euro
    S("sepa-inst", "EUR", "SEPA Instant Credit Transfer", "European Payments Council", "instant", "24x7", [0.05, 0.15, 0.5], 0.15, 0, 100000, "Open to licensed banks, payment institutions and e-money institutions.", "Name against account number check (verification of payee)", "Scheme cap of 100,000 euros per payment."),
    S("sepa-ct", "EUR", "SEPA Credit Transfer", "European Payments Council", "batch", "bizday", [60, 600, 1440], 0.1, 0, null, "Open to licensed banks, payment institutions and e-money institutions.", "Name against account number check (verification of payee)", "Settles by the next business day at the latest."),
    S("t2", "EUR", "T2 (Eurosystem real time gross settlement)", "European Central Bank", "rtgs", "bizday", [5, 20, 120], 3.5, 0, null, "Direct for banks with a central bank account. Others go through a bank.", null, "Used for large and urgent euro payments."),
    // ---- Pound sterling
    S("fps", "GBP", "Faster Payments", "Pay.UK", "instant", "24x7", [0.1, 0.3, 2], 0.15, 0, 1300000, "Through a sponsor bank, or direct for firms with a Bank of England settlement account.", "Name against account check (confirmation of payee)", "Network cap shown. Banks set lower limits."),
    S("chaps", "GBP", "CHAPS", "Bank of England", "rtgs", "bizday", [10, 40, 180], 6, 0, null, "Direct for banks. Others go through a sponsor bank.", null, "High value, same day, business days only."),
    S("bacs", "GBP", "Bacs Direct Credit", "Pay.UK", "batch", "bizday", [1440, 2880, 4320], 0.15, 0, null, "Through a sponsor bank or as a direct submitter.", null, "Three working day cycle."),
    // ---- Japanese yen
    S("zengin", "JPY", "Zengin System", "Zenginnet (Japanese Bankers Association)", "instant", "24x7", [0.1, 0.3, 2], 0.5, 0, 500000, "Banks and registered non-bank fund transfer providers (opened to non-banks in 2022).", null, "Domestic transfers run all day, every day."),
    S("bojnet", "JPY", "BOJ-NET funds transfer", "Bank of Japan", "rtgs", "bizday", [5, 30, 180], 3, 0, null, "Direct for banks with a Bank of Japan account.", null, ""),
    // ---- Australian dollar
    S("npp", "AUD", "New Payments Platform (NPP)", "NPP Australia", "instant", "24x7", [0.1, 0.3, 2], 0.1, 0, null, "Through a bank or a licensed provider with access. Limits are set by each bank.", "Name shown before sending (PayID)", ""),
    S("becs", "AUD", "BECS (bulk clearing)", "Australian Payments Network", "batch", "bizday", [240, 1440, 2880], 0.15, 0, null, "Through a bank.", null, ""),
    S("rits", "AUD", "RITS (high value settlement)", "Reserve Bank of Australia", "rtgs", "bizday", [5, 30, 180], 2.5, 0, null, "Direct for banks with a Reserve Bank account.", null, ""),
    // ---- Canadian dollar
    S("interac", "CAD", "Interac e-Transfer", "Interac", "instant", "24x7", [0.5, 2, 30], 0.7, 0, 15000, "Through a bank or a licensed provider.", null, "Limits are set by each institution and are often low."),
    S("lynx", "CAD", "Lynx (high value)", "Payments Canada", "rtgs", "bizday", [5, 30, 180], 3, 0, null, "Direct for banks. Others go through a bank.", null, ""),
    S("acss", "CAD", "EFT (bulk clearing)", "Payments Canada", "batch", "bizday", [720, 1440, 2880], 0.2, 0, null, "Through a bank.", null, ""),
    // ---- Swiss franc
    S("sic-ip", "CHF", "SIC instant payments", "SIX Interbank Clearing", "instant", "24x7", [0.1, 0.3, 2], 0.3, 0, 25000, "Through a bank that has joined.", null, "Instant payments have a lower cap than standard SIC."),
    S("sic", "CHF", "SIC (Swiss Interbank Clearing)", "SIX Interbank Clearing", "rtgs", "bizday", [5, 30, 180], 0.4, 0, null, "Direct for banks. Others go through a bank.", null, ""),
    // ---- Danish krone
    S("dk-instant", "DKK", "Straksclearing (instant clearing)", "Nets", "instant", "24x7", [0.1, 0.5, 5], 0.1, 0, null, "Through a Danish bank or licensed payment institution that has joined.", null, ""),
    S("dk-intraday", "DKK", "Intradagclearing (intraday clearing)", "Nets", "batch", "bizday", [60, 180, 600], 0.08, 0, null, "Through a Danish bank.", null, "Several runs per business day."),
    S("kronos2", "DKK", "Kronos2 (real time gross settlement)", "Danmarks Nationalbank", "rtgs", "bizday", [5, 30, 180], 3, 0, null, "Direct for banks with a Nationalbank account.", null, ""),
    // ---- Singapore dollar
    S("sg-fast", "SGD", "FAST (Fast and Secure Transfers)", "Banking Computer Services", "instant", "24x7", [0.1, 0.3, 2], 0.1, 0, 150000, "Banks and licensed payment institutions that have joined.", "Name shown before sending (PayNow)", ""),
    S("sg-giro", "SGD", "GIRO", "Banking Computer Services", "batch", "bizday", [720, 1440, 2880], 0.1, 0, null, "Through a bank.", null, ""),
    S("sg-meps", "SGD", "MEPS+ (high value)", "Monetary Authority of Singapore", "rtgs", "bizday", [5, 30, 180], 2, 0, null, "Direct for banks. Others go through a bank.", null, ""),
    // ---- UAE dirham
    S("uae-aani", "AED", "Aani (instant payment platform)", "Central Bank of the UAE", "instant", "24x7", [0.2, 0.5, 5], 0.2, 0, null, "Banks and licensed payment providers that have joined.", null, ""),
    S("uaefts", "AED", "UAEFTS (funds transfer system)", "Central Bank of the UAE", "rtgs", "bizday", [10, 60, 240], 2.5, 0, null, "Direct for banks. Others go through a bank.", null, "The UAE business week runs Monday to Friday."),
    // ---- Brazilian real
    S("pix", "BRL", "Pix", "Banco Central do Brasil", "instant", "24x7", [0.05, 0.2, 1], 0.05, 0, null, "Banks and payment institutions authorised by the central bank, direct or through one.", "Receiver name shown from the Pix key", "Night time limits apply to many accounts."),
    S("ted", "BRL", "TED (wire transfer)", "Banco Central do Brasil", "rtgs", "bizday", [10, 60, 240], 1.2, 0, null, "Through a bank.", null, ""),
    // ---- Mexican peso
    S("spei", "MXN", "SPEI", "Banco de México", "instant", "24x7", [0.1, 0.3, 2], 0.2, 0, null, "Banks and regulated fintechs that are participants.", null, "Runs every day all day."),
    // ---- Thai baht
    S("promptpay", "THB", "PromptPay", "National ITMX", "instant", "24x7", [0.1, 0.3, 2], 0.1, 0, null, "Banks and licensed providers that have joined.", "Receiver name shown from the proxy (phone or tax number)", ""),
    S("bahtnet", "THB", "BAHTNET (high value)", "Bank of Thailand", "rtgs", "bizday", [10, 60, 240], 2.5, 0, null, "Direct for banks.", null, ""),
    // ---- Chinese yuan
    S("cn-ibps", "CNY", "IBPS (Internet Banking Payment System)", "People's Bank of China", "instant", "24x7", [0.5, 2, 10], 0.3, 0, 7000, "Through a Chinese bank.", null, "Small payments only."),
    S("cn-hvps", "CNY", "CNAPS high value payment system", "People's Bank of China", "rtgs", "bizday", [10, 60, 240], 3, 0, null, "Through a Chinese bank.", null, ""),
    S("cips", "CNY", "CIPS (Cross-border Interbank Payment System)", "CIPS Co.", "rtgs", "bizday", [10, 60, 360], 5, 0, null, "Direct for banks. Most others use an indirect participant.", null, "Built for yuan payments across borders."),
    // ---- South African rand
    S("payshap", "ZAR", "PayShap", "BankservAfrica", "instant", "24x7", [0.1, 0.3, 2], 0.1, 0, 170, "Through a participating bank.", "Receiver name shown from the proxy", "Low cap per payment."),
    S("samos", "ZAR", "SAMOS (real time gross settlement)", "South African Reserve Bank", "rtgs", "bizday", [10, 60, 240], 2, 0, null, "Direct for banks.", null, ""),
    S("za-eft", "ZAR", "EFT (bulk clearing)", "BankservAfrica", "batch", "bizday", [240, 1440, 2880], 0.15, 0, null, "Through a bank.", null, ""),
    // ---- Indian rupee
    S("upi", "INR", "UPI (Unified Payments Interface)", "National Payments Corporation of India", "instant", "24x7", [0.05, 0.2, 1], 0.01, 0, 1200, "Banks and approved apps. Cross-border inflow is limited to set corridors.", "Receiver name shown before sending", "Typical per payment limit shown."),
    S("in-rtgs", "INR", "RTGS (Reserve Bank of India)", "Reserve Bank of India", "rtgs", "24x7", [5, 20, 120], 0.4, 0, null, "Through a bank.", null, "Large payments only, runs every day."),
    S("neft", "INR", "NEFT (National Electronic Funds Transfer)", "Reserve Bank of India", "batch", "24x7", [30, 60, 240], 0.1, 0, null, "Through a bank.", null, "Half hourly runs, every day."),
    // ---- Philippine peso
    S("instapay", "PHP", "InstaPay", "BancNet", "instant", "24x7", [0.1, 0.5, 5], 0.15, 0, 900, "Banks and e-wallet providers that have joined.", null, "Low cap per payment."),
    S("pesonet", "PHP", "PESONet", "Philippine Clearing House Corporation", "batch", "bizday", [240, 720, 1440], 0.3, 0, null, "Banks and e-wallet providers that have joined.", null, ""),
    // ---- Turkish lira
    S("tr-fast", "TRY", "FAST (Fast and Secure Transfer)", "Central Bank of Türkiye", "instant", "24x7", [0.1, 0.5, 5], 0.1, 0, 3000, "Banks and licensed payment institutions.", "Receiver name shown before sending", ""),
    S("tr-eft", "TRY", "EFT (Electronic Funds Transfer)", "Central Bank of Türkiye", "rtgs", "bizday", [10, 60, 240], 1, 0, null, "Banks and licensed payment institutions.", null, ""),
    // ---- Kenyan shilling
    S("pesalink", "KES", "PesaLink", "Integrated Payment Services", "instant", "24x7", [0.2, 1, 10], 0.5, 0, 7700, "Through a participating bank.", null, ""),
    S("mpesa", "KES", "M-Pesa (mobile money wallet)", "Safaricom", "wallet", "24x7", [0.2, 1, 10], 0.5, 90, 1100, "Through an aggregator or a direct agreement with the wallet operator. Not a bank clearing system.", "Receiver name shown from the phone number", "The wallet is how many people receive money."),
    S("kepss", "KES", "KEPSS (real time gross settlement)", "Central Bank of Kenya", "rtgs", "bizday", [10, 60, 240], 3, 0, null, "Direct for banks.", null, ""),
    // ---- Nigerian naira
    S("nip", "NGN", "NIP (NIBSS Instant Payment)", "NIBSS", "instant", "24x7", [0.1, 0.5, 5], 0.2, 0, null, "Banks and licensed providers that have joined.", "Receiver name shown before sending", ""),
    S("ng-rtgs", "NGN", "CBN RTGS", "Central Bank of Nigeria", "rtgs", "bizday", [10, 60, 240], 3, 0, null, "Direct for banks.", null, "")
  ];
  // A few minimum sizes where a scheme is built for large payments only.
  SCHEMES.forEach(function (s) { if (s.id === "in-rtgs") s.min = 2400; });

  // What it takes to reach each currency, in plain words. One line for a partner, one for direct access.
  var ACCESS_NOTES = {
    USD: ["A partner bank in the United States that offers dollar accounts and Fedwire access.", "Your own state licences and a bank account, or your own Federal Reserve account if you are a bank."],
    EUR: ["A partner bank or payment institution inside the euro area.", "A licence as a payment or e-money institution in one euro area country, then direct access to SEPA schemes."],
    GBP: ["A sponsor bank that gives you Faster Payments and CHAPS access.", "A licence from the Financial Conduct Authority and a settlement account at the Bank of England."],
    JPY: ["A Japanese bank partner that gives you Zengin access.", "Registration as a fund transfer service provider with the Financial Services Agency."],
    AUD: ["An Australian bank partner with NPP access.", "A financial services licence and your own NPP and settlement access."],
    CAD: ["A Canadian bank partner.", "Registration under the Retail Payment Activities Act and your own bank accounts."],
    CHF: ["A Swiss bank partner with SIC access.", "A licence from the Swiss financial regulator (FINMA) and a SIC account."],
    DKK: ["A Danish bank that provides accounts and instant clearing access.", "A Danish or EU payment institution licence and direct Nets access."],
    SGD: ["A Singapore bank partner with FAST access.", "A major payment institution licence from the Monetary Authority of Singapore."],
    AED: ["A UAE bank partner with Aani access.", "A Central Bank of the UAE payment services licence."],
    BRL: ["A Brazilian payment institution or bank that is a Pix participant, and an agreement for foreign exchange.", "Your own authorisation from the central bank of Brazil. This usually takes many months."],
    MXN: ["A Mexican bank partner with SPEI access.", "A Mexican fintech authorisation and your own SPEI participation."],
    INR: ["An Indian bank partner and an authorised dealer for foreign exchange.", "Authorisation from the Reserve Bank of India as a cross-border payment aggregator."],
    ZAR: ["A South African bank partner that is an authorised dealer.", "Your own authorised dealer status and payment system membership."],
    THB: ["A Thai bank partner with PromptPay access.", "A Bank of Thailand payment services licence."],
    PHP: ["A Philippine bank or e-wallet partner with InstaPay access.", "Registration with the central bank of the Philippines and your own access."],
    KES: ["A Kenyan bank or aggregator partner, including mobile money access.", "A payment service provider licence from the Central Bank of Kenya."],
    NGN: ["A Nigerian bank partner that is an authorised dealer.", "A payment service licence from the Central Bank of Nigeria."],
    CNY: ["A Chinese bank partner with the right foreign exchange permissions.", "Chinese licences are rarely open to foreign firms. Plan on a partner."],
    TRY: ["A Turkish bank partner.", "A payment institution licence from the Central Bank of Türkiye."]
  };

  // Rough months to put the access in place. [from, to]. Restricted currencies take longer.
  var LEAD_MONTHS = { partner: [2, 5], direct: [9, 24], restrictedExtra: [2, 6] };

  // Rules by country, at headline level. Each is [name, why it matters for a transfer].
  var REGS = {
    US: [
      ["Bank Secrecy Act and the Travel Rule", "Banks and money transmitters keep records and pass sender and receiver details along with transfers of 3,000 dollars or more."],
      ["OFAC sanctions", "Apply to every US dollar payment that touches a US bank, even when neither party is American."],
      ["Money transmitter licences", "Sending money for others needs registration with FinCEN and licences in most states."],
      ["Remittance Transfer Rule (Regulation E)", "Consumer transfers sent abroad from the United States need disclosures and a short cancellation window."]
    ],
    EA: [
      ["Transfer of Funds Regulation (EU 2023/1113)", "Sender and receiver details must travel with every transfer, including crypto transfers."],
      ["Payment Services Directive 2 and national laws", "Licensing, safeguarding of customer funds, strong customer authentication and liability for unauthorised payments. A replacement package is in progress, so check its status."],
      ["Instant Payments Regulation (EU 2024/886)", "Euro instant transfers must be offered and priced like normal ones, and the receiver name is checked against the account number."],
      ["EU Anti-Money Laundering Regulation (2024/1624)", "Applies from 2027 and replaces most national rules. The Ask the rulebook project quotes it."],
      ["Cross-border payments regulation (EU 2021/1230)", "Euro transfers across EU borders cost the same as domestic ones, and currency conversion charges must be shown."]
    ],
    GB: [
      ["Payment Services Regulations 2017", "Licensing by the Financial Conduct Authority, safeguarding and conduct rules."],
      ["Money Laundering Regulations 2017", "Customer checks, monitoring and suspicious activity reports."],
      ["UK sanctions (OFSI)", "Screen against the UK list. Civil breaches can be penalised without proof of intent."],
      ["Scam reimbursement rules (Payment Systems Regulator)", "Sending firms must reimburse victims of authorised push payment fraud up to a limit on Faster Payments and CHAPS."]
    ],
    JP: [
      ["Payment Services Act", "Registration as a fund transfer service provider. The registration type limits how large a transfer can be."],
      ["Act on Prevention of Transfer of Criminal Proceeds", "Customer checks and sender and receiver information on transfers."],
      ["Foreign Exchange and Foreign Trade Act", "Reports for large payments abroad, and sanctions through the Ministry of Finance."]
    ],
    AU: [
      ["Anti-Money Laundering and Counter-Terrorism Financing Act 2006", "Every international transfer instruction into or out of Australia is reported to AUSTRAC (an international funds transfer instruction report)."],
      ["Payments licensing", "Payment providers usually need an Australian financial services licence. Reform of payments licensing is under way, so check the current rules."],
      ["Autonomous sanctions (DFAT)", "Screen against the Australian sanctions list."]
    ],
    CA: [
      ["Proceeds of Crime (Money Laundering) and Terrorist Financing Act", "International electronic transfers of 10,000 Canadian dollars or more are reported to FINTRAC."],
      ["Retail Payment Activities Act", "Payment providers register with the Bank of Canada and meet operational and fund safeguarding duties."],
      ["Special Economic Measures Act", "Canadian sanctions screening."]
    ],
    CH: [
      ["Anti-Money Laundering Act and FINMA rules", "Financial intermediaries need membership of a self regulatory body or a licence from the Swiss financial regulator."],
      ["Swiss sanctions (SECO)", "Screen against the Swiss list, which follows but is not identical to the European list."]
    ],
    DK: [
      ["Danish Payments Act (Betalingsloven)", "Puts the EU payment services rules into Danish law: licensing, safeguarding and liability."],
      ["Danish Anti-Money Laundering Act (Hvidvaskloven)", "Customer checks, monitoring and reports of suspicious activity to the Danish Money Laundering Secretariat."],
      ["EU Transfer of Funds Regulation (2023/1113)", "Applies in Denmark too: sender and receiver details must travel with the payment."]
    ],
    SG: [
      ["Payment Services Act 2019", "A licence from the Monetary Authority of Singapore is needed for cross-border money transfer."],
      ["MAS anti-money laundering notices for payment services", "Customer checks and information that travels with transfers."],
      ["Sanctions regulations", "Singapore applies United Nations lists and its own targeted measures."]
    ],
    AE: [
      ["Federal anti-money laundering law and Central Bank rules", "Customer checks and suspicious transaction reports to the Financial Intelligence Unit. Check the current decree."],
      ["Central Bank payment services regulation", "A licence is needed to run payment services. Check the current regulation."],
      ["Financial free zones", "The Dubai International Financial Centre and Abu Dhabi Global Market have their own regulators and rules."]
    ],
    BR: [
      ["Foreign exchange law (Law 14,286 of 2021) and central bank rules", "Every conversion carries a stated purpose, and only authorised institutions may run foreign exchange."],
      ["IOF tax on financial operations", "A tax is charged on many foreign exchange transactions, at a rate set by the purpose."],
      ["Pix regulation", "Participants are authorised by the central bank and follow its fraud, limits and night time rules."],
      ["Anti-money laundering law (Law 9,613 of 1998)", "Customer checks and reports to the financial intelligence unit."]
    ],
    MX: [
      ["Fintech Law and Banxico rules", "Payment providers need authorisation, and SPEI is open to authorised institutions."],
      ["Anti-money laundering rules (Financial Intelligence Unit)", "Reporting of unusual and large transactions."]
    ],
    IN: [
      ["Foreign Exchange Management Act (FEMA)", "Every cross-border payment carries a purpose code. Sending money abroad is limited for individuals by the central bank's remittance scheme."],
      ["Cross-border payment aggregator rules (Reserve Bank of India)", "Firms that collect and pay out across borders for merchants need authorisation."],
      ["Prevention of Money Laundering Act", "Customer checks, record keeping and reporting."]
    ],
    ZA: [
      ["Exchange control (South African Reserve Bank)", "Cross-border payments go through authorised dealers, and individuals have an annual allowance for sending money abroad."],
      ["Financial Intelligence Centre Act", "Customer checks and reporting."],
      ["National Payment System Act", "Payment providers belong to a recognised payment system body."]
    ],
    TH: [
      ["Exchange control (Bank of Thailand)", "Documents are needed for large foreign exchange payments."],
      ["Payment Systems Act 2017", "A licence is needed for payment services."],
      ["Anti-Money Laundering Act", "Customer checks and reporting."]
    ],
    PH: [
      ["Anti-Money Laundering Act (as amended)", "Customer checks and reports to the Anti-Money Laundering Council."],
      ["National Payment Systems Act", "Payment operators and providers register with the central bank of the Philippines."],
      ["Remittance and transfer company rules", "Inward remittance runs through supervised providers."]
    ],
    KE: [
      ["National Payment System Act 2011", "Payment providers, including mobile money operators, are licensed by the Central Bank of Kenya."],
      ["Proceeds of Crime and Anti-Money Laundering Act", "Customer checks and reporting."],
      ["Data Protection Act 2019", "Rules on handling and moving personal data."]
    ],
    NG: [
      ["Central Bank of Nigeria foreign exchange rules", "Money must come in through authorised dealers. The rules change often, so check the latest circulars."],
      ["Money Laundering (Prevention and Prohibition) Act 2022", "Customer checks and reporting."],
      ["Nigeria Data Protection Act 2023", "Rules on handling and moving personal data."]
    ],
    CN: [
      ["Foreign exchange control (State Administration of Foreign Exchange)", "The yuan is not freely convertible. Trade and service payments need documents, and individuals have an annual conversion quota."],
      ["People's Bank of China anti-money laundering rules", "Customer checks and reporting."],
      ["Personal Information Protection Law", "Rules on sending personal data out of China."]
    ],
    TR: [
      ["Law on Payment Services (6493)", "Payment institutions are licensed by the Central Bank of Türkiye."],
      ["Foreign exchange rules", "Turkey has rules on foreign currency use. Check current limits."],
      ["Anti-money laundering law (MASAK)", "Customer checks and reports to the Financial Crimes Investigation Board."]
    ]
  };

  // Rules that apply to any cross-border transfer.
  var GLOBAL_REGS = [
    ["FATF Recommendation 16 (wire transfers)", "The global standard behind the travel rule: sender and receiver information must travel with cross-border transfers. The Ask the rulebook project has the exact text."],
    ["United Nations sanctions", "Binding in every country. Always screen against the United Nations list."]
  ];
  var DATA_REG = ["Data protection rules for moving personal data (GDPR transfers)", "Sending personal data from the European Economic Area to a country outside it needs a legal basis, such as an adequacy decision or standard contract terms."];

  // The compliance checks a route can trigger. The router decides which apply and fills in the detail.
  var CHECKS = [
    { id: "cdd", name: "Know your customer on the sender", stage: 2, plain: "Confirm who the sender is, who owns the money and why it is being sent, before the price is final." },
    { id: "payee", name: "Check the receiver", stage: 2, plain: "Match the receiver's name to the account where the scheme allows it, or at least validate the account format, to stop errors and scams." },
    { id: "sanctions", name: "Screen everyone in the chain", stage: 2, plain: "Screen the sender, the receiver and the banks involved against every list that applies to a currency or country on the route." },
    { id: "travel", name: "Attach sender and receiver details", stage: 2, plain: "Cross-border transfers carry the names, account numbers and other details of both sides." },
    { id: "purpose", name: "Record the purpose of payment", stage: 2, plain: "Some countries need a code or a document that says what the payment is for before they will convert or release money." },
    { id: "limits", name: "Check annual and per payment caps", stage: 2, plain: "Strong currency controls or scheme caps can block or split a payment." },
    { id: "tax", name: "Work out the transfer tax", stage: 1, plain: "Some countries charge a tax on foreign exchange or on payments abroad, and the quote must include it." },
    { id: "monitor", name: "Watch the corridor", stage: 2, plain: "Transaction monitoring looks for odd patterns on this country pair, such as many small transfers just under a limit." },
    { id: "safeguard", name: "Safeguard customer money in the pools", stage: 4, plain: "While money sits in an account between two steps it belongs to customers. It must be kept apart and matched every day." },
    { id: "licence", name: "Licence or partner permission at the other end", stage: 5, plain: "Paying out through a local scheme needs a licence or a partner that holds one. The contract must cover who is liable." },
    { id: "report", name: "File the regulator's report", stage: 7, plain: "Some countries need a report on international or large transfers within set days." },
    { id: "data", name: "Check the rules for moving personal data", stage: 1, plain: "Names and account numbers are personal data. Moving them out of some regions needs a legal basis." }
  ];

  // The transfer flow, in order. blocks names pieces of the Core banking blueprint project.
  var STAGES = [
    { n: 1, name: "Request and quote", short: "Quote",
      does: "Take the request, check the fields, price it and lock the quote for a short time.",
      inside: ["Validate account formats and required fields", "Idempotency key so a retry never pays twice", "Quote engine: fees, rate and arrival time", "Rate lock, usually seconds to minutes"],
      blocks: ["Digital channels", "Payments hub", "Foreign exchange and multi-currency"],
      stance: "Build. The quote is what customers compare you on.",
      speed: "Seconds.", cost: "Mostly software.",
      fails: "A stale rate, a wrong account format or a quote that leaves out a tax." },
    { n: 2, name: "Compliance gate", short: "Checks",
      does: "Stop before any money moves. Customer checks, screening, receiver checks and caps.",
      inside: ["Customer due diligence status", "Screening of all parties and banks", "Receiver name and account check", "Purpose of payment and caps", "Corridor risk score"],
      blocks: ["Onboarding and identity checks (know your customer)", "Sanctions and watchlist screening", "Transaction monitoring (anti-money laundering)", "Operations and case management"],
      stance: "Buy the screening. Build the rules that are yours.",
      speed: "Seconds, or hours when a person reviews an alert.", cost: "Screening fees and review staff.",
      fails: "A false alarm that holds an honest customer, or a list update that arrives late." },
    { n: 3, name: "Route decision", short: "Route",
      does: "Choose the path: which pools, which conversions, which local scheme, and a fallback.",
      inside: ["Inputs: footprint, quote, scheme status, cut off times", "Scoring: cost, speed and hands in the chain", "Output: a first choice and a ready fallback", "Rules for amounts above a scheme cap"],
      blocks: ["Payments hub", "API gateway, events and orchestration"],
      stance: "Build. This is the logic the page above demonstrates.",
      speed: "Milliseconds.", cost: "Software only.",
      fails: "A scheme that is down, a missed cut off or an amount above the cap." },
    { n: 4, name: "Fund and convert", short: "Fund",
      does: "Make sure the money is in the right pool, then convert where the route needs it.",
      inside: ["Pre-funded pools or just in time funding", "Conversion with liquidity providers", "Hedging of open positions", "Ledger entries for every move"],
      blocks: ["Treasury and liquidity", "Foreign exchange and multi-currency", "Ledger (double entry bookkeeping engine)"],
      stance: "Hybrid. Buy liquidity, build the position view.",
      speed: "Seconds to minutes, longer when a market is closed.", cost: "Conversion spread and the cost of idle funds.",
      fails: "An empty pool, a rejected conversion or a closed market at the weekend." },
    { n: 5, name: "Send on the rail", short: "Send",
      does: "Turn the instruction into the scheme's message format, send it and read the reply.",
      inside: ["Adapter per scheme or partner", "Message in the scheme format (often ISO 20022)", "Tracking reference (SWIFT gpi uses a unique end to end reference)", "Timeouts and safe retries"],
      blocks: ["Payments hub", "API gateway, events and orchestration"],
      stance: "Buy the access. Build the adapters you will reuse.",
      speed: "Seconds to days, set by the scheme.", cost: "Scheme and partner fees.",
      fails: "A rejection, a timeout that leaves the state unknown, or a duplicate on retry." },
    { n: 6, name: "Track and reconcile", short: "Match",
      does: "Follow the status, handle returns and match your books to the banks every day.",
      inside: ["Status messages and customer updates", "Return and recall handling", "Daily match of ledger to bank statements", "Break queue for differences"],
      blocks: ["Reconciliation", "Ledger (double entry bookkeeping engine)", "Operations and case management"],
      stance: "Build the matching rules. Buy the tooling if volumes are high.",
      speed: "Same day to next day.", cost: "Operations time.",
      fails: "A break nobody owns, a late return or a duplicate credit." },
    { n: 7, name: "Report and settle", short: "Report",
      does: "File the reports, book the revenue and prove that customer money was kept apart.",
      inside: ["Regulatory and tax reports", "Fee and margin booking", "Safeguarding reconciliation", "Audit trail for the whole transfer"],
      blocks: ["Regulatory reporting", "Audit trail and event log", "Management reporting and data platform"],
      stance: "Buy the reporting engine. Build the data feeds.",
      speed: "Within the regulator's deadline.", cost: "Reporting tools and staff time.",
      fails: "A missed filing deadline or a gap in the audit trail." }
  ];

  var NOTES = [
    { title: "Three ways to move money across a border",
      text: "A chain of banks passes the payment along, each taking a fee and some time. Local in, local out collects in the sender's country and pays out from a pool in the receiver's country, so the money never really crosses. A bridge asset, such as a stablecoin, can move value between pools quickly, but it still needs regulated on and off ramps at both ends." },
    { title: "Why instant domestic schemes changed the game",
      text: "Pix, UPI, Faster Payments and SEPA Instant settle in seconds, all day, every day, and cost almost nothing. The hard part moved from the last mile to getting a seat: access, licences and partners." },
    { title: "Direct, sponsored or open",
      text: "A scheme may let you join directly, require a sponsor bank, or be open to licensed non-banks. Direct costs the least per payment and takes the longest to set up. Sponsored is faster to start and adds a fee and a dependency." },
    { title: "Pre-fund or fund just in time",
      text: "Pre-funded pools make payouts instant and cost capital that sits idle. Just in time funding saves capital and is slower and more fragile. Most firms pre-fund the busy corridors and fund the rest on demand." },
    { title: "Weekends and cut offs",
      text: "The foreign exchange market closes at the weekend and many high value schemes run on business days only. A route that looks fast on a Tuesday can take until Monday. Instant schemes still work, but the conversion in the middle may not." },
    { title: "One shared message format",
      text: "ISO 20022 is the common message format that schemes and SWIFT are moving to. It carries richer data, which helps screening and the travel rule, and it makes it cheaper to add the next rail." }
  ];

  var GLOSSARY = [
    ["Clearing scheme", "The set of rules and the network banks use to send payments to each other inside a country or region, such as Pix, Faster Payments or SEPA."],
    ["Settlement", "The moment money really changes hands between banks, usually in accounts at the central bank."],
    ["Corridor", "A pair of countries, or currencies, that money moves between, such as Denmark to Brazil."],
    ["Correspondent bank", "A bank that holds accounts for other banks and passes payments on for them. Cross-border chains are made of these."],
    ["Nostro and vostro", "Your account at another bank is a nostro (ours with you). The same account seen from the other bank is a vostro (yours with us)."],
    ["Custodian", "The bank that holds the money in a currency on your behalf, in an account you can pay from."],
    ["Pool", "An account in one currency that your firm keeps funded so it can pay out quickly."],
    ["Real time gross settlement (RTGS)", "Each payment is settled one at a time, in central bank money, usually during business hours. Used for large and urgent payments."],
    ["Instant payment", "A payment that arrives within seconds, at any hour, every day of the year."],
    ["Spread", "The gap between the market rate and the rate you are given. It is the main hidden cost of a currency conversion."],
    ["Basis point", "One hundredth of a percent. 100 basis points is 1 percent."],
    ["Sponsor bank", "A bank that lets a smaller firm use a scheme through the bank's own membership."],
    ["Travel rule", "The rule that sender and receiver details must travel with a transfer so every bank can screen it."],
    ["Pre-funding", "Keeping money ready in the destination currency before a customer asks to send it."],
    ["Beneficiary", "The person or business receiving the money."]
  ];

  // Footprint presets. For each currency, direct (own account and direct or sponsored scheme access),
  // partner (reach it through a local partner who charges a fee) or none (no account in that currency).
  function mk(direct, partner) {
    var m = {};
    JURISDICTIONS.forEach(function (j) { m[j.ccy] = "none"; });
    direct.forEach(function (c) { m[c] = "direct"; });
    partner.forEach(function (c) { m[c] = "partner"; });
    return m;
  }
  var ALL = JURISDICTIONS.map(function (j) { return j.ccy; });
  var FOOTPRINTS = [
    { id: "eu-pi", name: "European payment institution", note: "Direct in euro and Danish krone. Partner accounts for dollar, pound and Swiss franc. Nothing else.", modes: mk(["EUR", "DKK"], ["USD", "GBP", "CHF"]) },
    { id: "global", name: "Global multi-currency provider", note: "Direct in euro, pound and dollar. Partners in most other places. No account for yuan, naira or lira.",
      modes: mk(["EUR", "GBP", "USD"], ["DKK", "CHF", "SGD", "AUD", "CAD", "JPY", "AED", "BRL", "MXN", "INR", "ZAR", "THB", "PHP", "KES"]) },
    { id: "bank", name: "Large bank with a global network", note: "Direct access in every currency.", modes: mk(ALL, []) },
    { id: "start", name: "Just starting out", note: "One euro account. Everything else you would have to add.", modes: mk(["EUR"], []) }
  ];

  // Example corridors to start from.
  var CORRIDORS = [
    { id: "dk-br", name: "Denmark to Brazil", from: "DK", to: "BR", amount: 5000, priority: "balanced", when: "weekday", footprint: "eu-pi" },
    { id: "ea-ae", name: "Euro area to UAE", from: "EA", to: "AE", amount: 20000, priority: "cheapest", when: "weekday", footprint: "global" },
    { id: "gb-ph", name: "UK to Philippines", from: "GB", to: "PH", amount: 1000, priority: "fastest", when: "weekend", footprint: "global" },
    { id: "us-ke", name: "US to Kenya", from: "US", to: "KE", amount: 200, priority: "cheapest", when: "weekday", footprint: "global" },
    { id: "jp-sg", name: "Japan to Singapore", from: "JP", to: "SG", amount: 20000, priority: "balanced", when: "evening", footprint: "global" },
    { id: "ea-ng", name: "Euro area to Nigeria", from: "EA", to: "NG", amount: 1000, priority: "balanced", when: "weekday", footprint: "eu-pi" }
  ];

  // Cost and time assumptions for the parts that are not a local scheme. All illustrative.
  var MODEL = {
    fxFixed: 2,            // dollars per conversion
    crossPenalty: 10,      // extra basis points for a conversion that does not touch dollars or euros
    weekendFx: 25,         // extra basis points when the foreign exchange market is closed
    fxSpeed: { best: 0.1, typ: 1, worst: 30 },
    fxSpeedControlled: { best: 5, typ: 60, worst: 1440 },
    partner: { fixed: 1, bps: [6, 10, 20] },       // by tier 1, 2, 3
    partnerSpeed: { best: 5, typ: 15, worst: 60 },
    swift: {
      fixed: 24, perBank: 12, beneficiaryFee: 8, bps: 5,
      banks: [1, 2, 3],                              // intermediaries by destination tier
      speed: [{ best: 60, typ: 240, worst: 1440 }, { best: 120, typ: 600, worst: 2880 }, { best: 240, typ: 1800, worst: 4320 }],
      convertBps: [120, 120, 250], convertControl: 100  // beneficiary bank converts at its own rate
    },
    // Extra minutes waited, for a scheme that is not open all day: [weekday, evening, weekend]
    wait: { rtgs: [0, 720, 2640], batch: [240, 840, 2760] },
    hopWeight: { cheapest: 0.05, fastest: 5, balanced: 8, fewest: 120 },
    priorities: {
      cheapest: { name: "Cheapest", bps: 1, hours: 0.002 },
      fastest: { name: "Fastest", bps: 0.05, hours: 3 },
      balanced: { name: "Balanced", bps: 1, hours: 1.5 },
      fewest: { name: "Fewest hands", bps: 0.2, hours: 0.2 }
    }
  };

  return {
    JURISDICTIONS: JURISDICTIONS, SCHEMES: SCHEMES, ACCESS_NOTES: ACCESS_NOTES, LEAD_MONTHS: LEAD_MONTHS,
    REGS: REGS, GLOBAL_REGS: GLOBAL_REGS, DATA_REG: DATA_REG, CHECKS: CHECKS, STAGES: STAGES, NOTES: NOTES,
    GLOSSARY: GLOSSARY, FOOTPRINTS: FOOTPRINTS, CORRIDORS: CORRIDORS, MODEL: MODEL
  };
});
