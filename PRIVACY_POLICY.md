# Privacy Policy — LiveChatLens

**Effective Date:** November 2026  
**Data Collection Summary:** LiveChatLens collects **zero** personal data, **zero** chat transcripts, **zero** analytics, and **zero** browsing history.

## 1. 100% Local-First Processing
All live-chat DOM inspection, PII redaction (US Social Security Numbers, payment card numbers, bank account/routing numbers, phone numbers, email addresses, OTP codes, and URL authentication tokens), SHA-256 hashing, PDF generation, and Sealed Evidence ZIP creation run exclusively on your local device inside your browser or local Node.js runtime.

## 2. Optional RFC 3161 Timestamping (Opt-In Only)
If you explicitly choose to anchor an evidence seal with a third-party RFC 3161 Time Stamping Authority (TSA), LiveChatLens transmits **only the 32-byte SHA-256 cryptographic hash** of your manifest — never your chat text, URLs, screenshots, or personal information. This feature is disabled by default and never runs automatically.

## 3. Permissions & Minimal Access
- The Chrome extension operates strictly in read-only mode and only inspects the active tab when you click to open the Side Panel.
- Cross-origin chat iframe inspection uses Chrome `optional_host_permissions` and is only requested if you explicitly grant access for a specific chat provider domain.
- Exported evidence files are saved directly to your local disk under your control.

## 4. Open-Source Transparency
LiveChatLens is licensed under Apache-2.0 with zero runtime third-party dependencies so anyone can audit every line of code before use.
