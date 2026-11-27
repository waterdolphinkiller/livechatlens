# AGENTS.md — LiveChatLens Engineering & Epistemic Rules

1. Read `PRODUCT_PLAN.md` and `docs/architecture-and-audit.md` before making architectural changes.
2. Never treat writing style or response speed as proof of human or AI identity.
3. Never output `VERIFIED_HUMAN`; never remove the `INCONCLUSIVE` abstention path.
4. Every verdict must trace back to one or more `EvidenceItem` records in the Evidence Ledger.
5. Never upload raw chat transcripts or request broad `<all_urls>` host permissions by default.
6. Redact PII (emails, phone numbers, card numbers, OTPs, IDs) before storing evidence excerpts or exporting receipts.
7. Transparency Audit signals report observable UI disclosure timing (e.g., Turn 1 vs. late vs. none) and must always include a non-legal-advice disclaimer.
8. Commitment Risk flags highlight high-stakes promises (pricing, refunds, cancellations, warranties) paired with observed speaker state, without claiming legal enforceability.
9. Every platform adapter added in Phase 4+ must include a sanitized DOM fixture and automated regression test.
10. Any change to scoring or fusion rules must be verified against the benchmark suite, reporting Macro-F1 and Human False-Positive Rate (FPR).
