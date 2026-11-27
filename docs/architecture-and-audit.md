# LiveChatLens — Phase 1 Architecture, Test Matrix & MV3 Privacy Checklist

## 1. Architecture Summary (Phase 1 Core Engine)

LiveChatLens is structured as a zero-dependency, framework-independent TypeScript core (`packages/core`) decoupled from browser DOM extraction (`packages/adapters`) and extension UI (`apps/extension`).

```text
ConversationSession (normalized, no raw HTML)
  ├── Layer A: Direct Disclosure Signal (EN / ZH / MS / Manglish)
  ├── Layer C: Automation & Template Signal (menus, auto-reply, near-duplicate turns)
  ├── Layer F: Human Handoff & Agent Identity Signal
  ├── New Track 1: Transparency Timing Audit (first-turn vs. late vs. none)
  ├── New Track 2: Commitment & Quote Risk Radar (price, refund, policy promises)
  └── Evidence Fusion + Abstention Engine + PII Sanitizer + SHA-256 Receipt
```

### Key Design Decisions
- **Zero runtime dependencies in `@livechatlens/core`**: Portable across Chrome MV3 Service Worker/Content Script, Web Playground, Node CLI, and AI Coding Agent skills.
- **Deterministic & Reproducible**: Identical input sessions produce identical verdicts, evidence items, and SHA-256 receipt digests (when `generatedAt` is pinned).
- **Human False-Positive First**: Human agents using canned macros (`templated_human`) are guarded by explicit `alternativeExplanation` notes and human-identity precedence.

## 2. Test Matrix (8 Benchmark Fixtures)

| Fixture ID | Scenario | Expected Verdict | Expected Transparency | Key Assertion |
|---|---|---|---|---|
| `01_disclosed_ai_en` | Turn-1 AI disclosure + price quote | `AI_DISCLOSED` | `disclosed_first_turn` | Direct disclosure + pricing commitment flagged |
| `02_rule_based_faq_bot` | Menu-driven FAQ bot repeating templates | `AUTOMATION_LIKELY` | `not_applicable` | Repeated template & menu options; NOT mislabeled as `AI_DISCLOSED` |
| `03_undisclosed_llm_sample` | Fluent replies, zero UI labels/disclosures | `INCONCLUSIVE` | `not_disclosed` | Honest abstention in Phase 1 (no ML guessing) |
| `04_templated_human_macro` | Named human agent using canned replies | `HUMAN_AGENT_INDICATED` | `not_applicable` | Human identity prevents false-positive Bot verdict |
| `05_hybrid_ai_to_human_handoff` | AI assistant → explicit human transfer | `MIXED_OR_HYBRID` | `disclosed_first_turn` | Both AI disclosure & human handoff in timeline |
| `06_late_disclosure_refund_risk_zh_my` | ZH/EN/MS mixed chat, refund promise before late AI disclosure + PII | `AI_DISCLOSED` | `disclosed_late` | Late disclosure flagged, refund risk flagged, PII redacted |
| `07_short_ambiguous_inconclusive` | 2-turn short greeting, no labels | `INCONCLUSIVE` | `not_applicable` | Abstention triggered on insufficient turns |
| `08_cross_origin_iframe_limited` | Unreadable cross-origin widget | `INCONCLUSIVE` | `not_applicable` | Coverage limitation explicitly surfaced |

## 3. Manifest V3 Privacy & Permissions Checklist (Phase 3 Readiness)

- [x] **Minimal Permissions**: Start with `activeTab` + `scripting` + `sidePanel` only. Never request `<all_urls>` by default.
- [x] **Cross-Origin Iframe Strategy**: Use `chrome.scripting.executeScript({ target: { tabId, allFrames: true } })` for permitted frames; if a third-party chat widget runs in an unpermitted cross-origin iframe, prompt user for optional per-origin permission (`chrome.permissions.request`) or gracefully degrade with `coverage.status = "blocked_cross_origin_iframe"`.
- [x] **Local-Only Processing**: Zero network calls in core engine; zero telemetry by default.
- [x] **Memory-Only Session Storage**: Active session transcripts stay in memory and are cleared on tab close or `Clear session`.
- [x] **Sanitized Exports**: All exported JSON/Markdown Evidence Receipts pass through `redactPII()` before leaving memory.
- [x] **Non-Legal-Advice Disclaimer**: Every analysis result includes explicit limitations stating it reflects observable UI/conversation signals only.
