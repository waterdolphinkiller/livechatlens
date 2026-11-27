# Chrome Web Store Submission Listing — LiveChatLens US (v2.0.0)

## Store Title
LiveChatLens — Live-Chat AI Inspector & US Chargeback Evidence Pack

## Short Description (<= 132 chars)
Spot hidden AI chatbots, store-credit traps & dark patterns in live chat. Export PII-redacted PDF + SHA-256 chargeback packs locally.

## Detailed Description
Chatting with customer support about a refund, canceled subscription, or billing dispute? LiveChatLens inspects live-chat widgets 100% locally in your browser — with zero cloud uploads, zero tracking, and zero false accusations of human agents.

### What LiveChatLens Does
- **AI Transparency & Dark-Pattern Audit**: Detects upfront AI disclosures, late disclosures, WCAG AA low-contrast/hidden banners, buried Terms of Service notices, repeated human-escalation loops, and suspected fake human handoffs across Salesforce Agentforce, Intercom Fin, Zendesk, Ada, Sierra, Gorgias, Crisp, Tidio, and obfuscated CSS-in-JS widgets.
- **US Commitment & Trap Guard**: Flags high-stakes refund guarantees, auto-renewal cancellations, fee waivers, store-credit/travel-voucher traps (`store_credit_only`), and conditional restocking-fee promises — while ignoring policy denials via our Negation Guard.
- **Bank-Ready Chargeback Evidence Pack (1-Click)**: Exports a PII-redacted, tamper-evident Sealed Evidence ZIP containing:
  - `chargeback-evidence.pdf` (native US Letter PDF ready for Chase, Amex, Citi & Capital One dispute portals)
  - `chargeback-narrative.txt` (issuer-tailored dispute statement with Visa 13.6/13.2/13.5, Mastercard 4853/4841 & Amex C02/C28/C31 codes + FCBA 60-day reminder)
  - `regulatory-complaint-pack.txt` (paste-ready CFPB & California AB 1609 / SB 1001 documentation)
  - `receipt.json` + `manifest.json` (SHA-256 tamper-evident seal + optional privacy-preserving RFC 3161 TSA timestamp support)

### Strict Privacy & Epistemic Honesty
- **100% Local-First**: All analysis, PII redaction (US SSN, cards, bank accounts, phones, emails, auth URLs), PDF generation, and ZIP sealing run locally in your browser.
- **No Style-Guessing AI Classifier**: LiveChatLens never claims writing style proves human or AI identity — it abstains (`INCONCLUSIVE`) when direct evidence is absent, maintaining a 0% human false-positive rate in benchmarks.
- **Read-Only**: Never clicks buttons, never sends messages, and never reads unrelated form fields.

## Single-Purpose Statement (Chrome Web Store Review)
LiveChatLens has a single purpose: read-only, user-initiated inspection of live-chat customer support widgets in the active tab to surface observable AI disclosures, consumer commitment traps, and export PII-redacted local evidence packs.

## Permission Justifications
- `activeTab`: Inspects the currently active tab only when the user explicitly clicks the LiveChatLens Side Panel button.
- `sidePanel`: Renders the local LiveChatLens inspection dashboard alongside the active support chat.
- `scripting`: Injects the read-only `content.js` observer into the active tab upon user action.
- `optional_host_permissions`: Requested only if the user explicitly opts in to inspect a cross-origin chat widget iframe (e.g., Intercom or Zendesk).
