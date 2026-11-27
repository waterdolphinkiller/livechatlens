import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeConversation,
  ISSUER_PROFILES,
  buildChargebackNarrative,
  buildDisputeEvidencePdf,
  buildRegulatoryComplaintPacket,
  buildRfc3161Request,
  inspectRfc3161Token,
  buildSealedEvidenceZip,
  formatDisputeEvidenceHtml,
  verifyEvidenceReceipt,
  formatSanitizedReceiptMarkdown,
  parseTranscriptText,
  redactPII,
  sha256Hex,
} from "../index.mjs";
import { BENCHMARK_FIXTURES } from "../fixtures/conversations/index.mjs";

describe("LiveChatLens Core Engine (v1.0.0-rc1)", () => {
  for (const fixture of BENCHMARK_FIXTURES) {
    it(`classifies fixture ${fixture.id} accurately`, () => {
      const result = analyzeConversation(fixture.session, {
        generatedAt: fixture.session.startedAt + 60000,
      });

      assert.equal(
        result.label,
        fixture.expectedVerdict,
        `Expected ${fixture.expectedVerdict} for ${fixture.id}, got ${result.label}`
      );
      assert.equal(
        result.transparencyAudit.status,
        fixture.expectedTransparency,
        `Expected transparency ${fixture.expectedTransparency} for ${fixture.id}, got ${result.transparencyAudit.status}`
      );
      assert.ok(
        result.commitments.length >= fixture.expectedMinCommitments,
        `Expected >= ${fixture.expectedMinCommitments} commitments for ${fixture.id}`
      );
      assert.ok(result.limitations.length >= 2, "Must always include explicit limitations");
      assert.match(result.receipt.sha256, /^[0-9a-f]{64}$/, "Must generate 64-char SHA-256 digest");
    });
  }

  it("is strictly deterministic for identical inputs", () => {
    const sample = BENCHMARK_FIXTURES[0];
    assert.ok(sample);
    const r1 = analyzeConversation(sample.session, { generatedAt: 1764200099999 });
    const r2 = analyzeConversation(sample.session, { generatedAt: 1764200099999 });
    assert.deepEqual(r1, r2);
  });

  it("redacts sensitive PII including auth tokens in pageUrl before exporting receipts", () => {
    const raw =
      "Contact me at jane.doe@company.my or +60 12-345 6789, IC 900101-14-5522, OTP: 482910, https://shop.my/reset?token=secret123";
    const cleaned = redactPII(raw);
    assert.equal(cleaned.includes("jane.doe@company.my"), false);
    assert.equal(cleaned.includes("345 6789"), false);
    assert.equal(cleaned.includes("900101-14-5522"), false);
    assert.equal(cleaned.includes("482910"), false);
    assert.equal(cleaned.includes("secret123"), false);

    const lateFixture = BENCHMARK_FIXTURES.find(
      (f) => f.id === "06_late_disclosure_refund_risk_zh_my"
    );
    assert.ok(lateFixture);
    const res = analyzeConversation(lateFixture.session, { generatedAt: 1764205099999 });
    const md = formatSanitizedReceiptMarkdown(res);
    assert.equal(md.includes("test.user@example.com"), false);
    assert.equal(md.includes("12-345 6789"), false);
    assert.equal(md.includes("secret999"), false);
    assert.ok(md.includes("[REDACTED_EMAIL]"));
    assert.ok(md.includes("[REDACTED_PHONE]"));
    assert.ok(md.includes("[REDACTED_AUTH_URL]"));
  });

  it("changes SHA-256 receipt hash when any commitment or evidence changes (tamper-evident)", () => {
    const base = BENCHMARK_FIXTURES[0];
    assert.ok(base);
    const r1 = analyzeConversation(base.session, { generatedAt: 1764200099999 });
    const tampered = structuredClone(base.session);
    const t3 = tampered.turns[2];
    assert.ok(t3);
    t3.text = "For 5 seats, your final price quote is USD 999 per month inclusive of onboarding.";
    const r2 = analyzeConversation(tampered, { generatedAt: 1764200099999 });
    assert.notEqual(r1.receipt.sha256, r2.receipt.sha256);
  });

  it("binds screenshotSha256 and transcript sha256 into combinedSha256 when screenshot is captured", () => {
    const base = BENCHMARK_FIXTURES[0];
    assert.ok(base);
    const fakePngHash = sha256Hex("fake-png-bytes-v1.0");
    const res = analyzeConversation(base.session, {
      generatedAt: 1764200099999,
      screenshotSha256: fakePngHash,
    });
    assert.equal(res.receipt.screenshotSha256, fakePngHash);
    assert.match(res.receipt.combinedSha256 ?? "", /^[0-9a-f]{64}$/);
    const md = formatSanitizedReceiptMarkdown(res);
    assert.ok(md.includes("Combined Tamper-Evident SHA-256"));
  });

  it("detects repeated human-escalation friction loop and generates escalate_loop prompt", () => {
    const loopFixture = BENCHMARK_FIXTURES.find((f) => f.id === "10_handoff_friction_loop");
    assert.ok(loopFixture);
    const res = analyzeConversation(loopFixture.session);
    assert.equal(res.handoffFriction.detected, true);
    assert.equal(res.handoffFriction.requestCount, 3);
    assert.ok(res.darkPatterns.some((d) => d.code === "HANDOFF_LOOP_FRICTION"));
    assert.ok(res.defensePrompts.some((p) => p.purpose === "escalate_loop"));
  });

  it("detects low-visibility disclosure dark pattern, machine-readable markers, and rapid response latency", () => {
    const dpFixture = BENCHMARK_FIXTURES.find((f) => f.id === "11_dark_pattern_hidden_disclosure");
    assert.ok(dpFixture);
    const res = analyzeConversation(dpFixture.session);
    assert.ok(res.darkPatterns.some((d) => d.code === "LOW_VISIBILITY_DISCLOSURE"));
    assert.ok(res.darkPatterns.some((d) => d.code === "ANTHROPOMORPHIC_MASKING"));
    assert.ok(res.transparencyAudit.machineReadableMarkers.includes("data-ai-generated=true"));
    assert.ok(res.evidence.some((e) => e.code === "RAPID_LONG_RESPONSE_LATENCY"));
  });

  it("flags low WCAG color contrast (< 3.0:1) even when font size and opacity look normal", () => {
    const session = {
      sessionId: "wcag-test",
      platformId: "web",
      adapterId: "adapter-generic-v3",
      startedAt: 1764240000000,
      coverage: { status: "full", readableTurns: 2 },
      observedEvents: [
        {
          id: "e1",
          type: "ai_disclosure_banner",
          observedAt: 1764240000100,
          details: "Powered by AI",
          metadata: { disclosureFontSizePx: 13, disclosureOpacity: 1, disclosureContrastRatio: 1.9 },
        },
      ],
      turns: [
        { id: "t1", role: "visitor", text: "Hello", timestamp: 1764240001000 },
        { id: "t2", role: "assistant", text: "Hi, how can I help?", timestamp: 1764240002000 },
      ],
    };
    const res = analyzeConversation(session);
    assert.ok(res.darkPatterns.some((d) => d.code === "LOW_VISIBILITY_DISCLOSURE"));
  });

  it("Negation Guard: does NOT misflag EN/ZH/MS policy denials as refund or cancellation promises", () => {
    const session = {
      sessionId: "negation-test",
      platformId: "ecom",
      adapterId: "generic-dom-v3",
      startedAt: 1764240000000,
      coverage: { status: "full", readableTurns: 4 },
      observedEvents: [],
      turns: [
        { id: "t1", role: "assistant", visibleLabel: "AI Assistant", text: "I'm your AI assistant.", timestamp: 1764240001000 },
        { id: "t2", role: "assistant", text: "Sorry, we do NOT offer a full refund or free cancellation on clearance items.", timestamp: 1764240002000 },
        { id: "t3", role: "assistant", text: "抱歉，特价商品不支持无条件全额退款，也无法免费取消。", timestamp: 1764240003000 },
        { id: "t4", role: "assistant", text: "Maaf, kami tidak boleh beri bayaran balik penuh untuk item promosi.", timestamp: 1764240004000 },
      ],
    };
    const res = analyzeConversation(session);
    assert.equal(res.commitments.length, 0, `Expected 0 commitments on denials, got ${JSON.stringify(res.commitments)}`);
  });

  it("Negation Guard: still catches a real promise after a clause break following a denial", () => {
    const session = {
      sessionId: "negation-clause-break",
      platformId: "ecom",
      adapterId: "generic-dom-v3",
      startedAt: 1764240000000,
      coverage: { status: "full", readableTurns: 2 },
      observedEvents: [],
      turns: [
        { id: "t1", role: "assistant", visibleLabel: "AI Assistant", text: "I'm your AI assistant.", timestamp: 1764240001000 },
        { id: "t2", role: "assistant", text: "We cannot change the shipping address, however we guarantee a full refund within 7 days.", timestamp: 1764240002000 },
      ],
    };
    const res = analyzeConversation(session);
    assert.ok(res.commitments.some((c) => c.category === "refund_guarantee"));
  });

  it("generates printable Dispute Evidence HTML with SHA-256 and zero PII leakage", () => {
    const lateFixture = BENCHMARK_FIXTURES.find(
      (f) => f.id === "06_late_disclosure_refund_risk_zh_my"
    );
    assert.ok(lateFixture);
    const res = analyzeConversation(lateFixture.session, { generatedAt: 1764205099999 });
    const html = formatDisputeEvidenceHtml(res);
    assert.ok(html.includes("LiveChatLens — Consumer Evidence Report"));
    assert.ok(html.includes(res.receipt.sha256));
    assert.equal(html.includes("test.user@example.com"), false);
    assert.equal(html.includes("12-345 6789"), false);
  });

  it("keeps human false-positive rate at 0% on templated_human fixture", () => {
    const humanMacro = BENCHMARK_FIXTURES.find((f) => f.id === "04_templated_human_macro");
    assert.ok(humanMacro);
    const res = analyzeConversation(humanMacro.session);
    assert.notEqual(res.label, "AI_DISCLOSED");
    assert.notEqual(res.label, "AUTOMATION_LIKELY");
    assert.equal(res.label, "HUMAN_AGENT_INDICATED");
  });

  it("parses pasted multilingual transcripts and detects hybrid handoff + commitments", () => {
    const raw = `
[10:01] System: You are chatting with an AI assistant.
[10:01] AI Assistant: Hello! How can I assist you today?
[10:02] 我: 这个订单可以免费取消和全额退款吗？
[10:02] AI Assistant: 可以的，我们保证无条件全额退款。
[10:03] System: 正在为您转接人工客服...
[10:04] 人工客服 · Siti: 您好，我是人工客服 Siti，我来帮您核实订单。
`;
    const session = parseTranscriptText(raw);
    assert.equal(session.turns.length, 6);
    const res = analyzeConversation(session);
    assert.equal(res.label, "MIXED_OR_HYBRID");
    assert.equal(res.transparencyAudit.status, "disclosed_first_turn");
    assert.ok(res.commitments.length >= 1);
  });

  it("US Market: redacts US SSN, US phone formats, and flags auto-renewal / restocking-fee promises with Visa/MC/Amex codes", () => {
    const raw = `
[10:01] Support: Hi! How can I help with your subscription?
[10:02] Me: Cancel my auto-renewal! Phone (415) 555-0192, SSN 123-45-6789, email buyer@usmail.com
[10:02] Support: Done! We cancelled your auto-renewal, waived the restocking fee, and approved a cash refund to your original payment method.
[10:03] Me: Are you an AI?
[10:03] AI Support: I am an automated AI assistant.
`;
    const session = parseTranscriptText(raw, { sessionId: "us-chargeback-test" });
    const res = analyzeConversation(session);
    assert.equal(res.label, "AI_DISCLOSED");
    assert.equal(res.transparencyAudit.status, "disclosed_late");
    assert.ok(res.commitments.some((c) => c.category === "cancellation_terms"));
    assert.ok(res.commitments.some((c) => c.category === "refund_guarantee"));

    const html = formatDisputeEvidenceHtml(res);
    assert.ok(html.includes("Visa 13.6"));
    assert.ok(html.includes("Visa 13.2"));
    assert.ok(html.includes("Mastercard 4841"));
    assert.equal(html.includes("123-45-6789"), false);
    assert.equal(html.includes("555-0192"), false);
    assert.equal(html.includes("buyer@usmail.com"), false);
    assert.ok(redactPII("SSN 123-45-6789").includes("[REDACTED_SSN]"));
  });

  it("v1.1 Independent Verifier: returns VALID for intact receipts and TAMPERED on 1-byte edits", () => {
    const sample = BENCHMARK_FIXTURES[0];
    assert.ok(sample);
    const res = analyzeConversation(sample.session, { generatedAt: 1764200099999 });
    const exported = {
      receipt: res.receipt,
      verdict: res.label,
      evidenceLevel: res.evidenceLevel,
      transparencyAudit: res.transparencyAudit,
      evidence: res.evidence,
      darkPatterns: res.darkPatterns,
      commitments: res.commitments,
    };
    const vOk = verifyEvidenceReceipt(exported);
    assert.equal(vOk.status, "VALID");

    const tampered = structuredClone(exported);
    tampered.commitments[0].excerptRedacted += "!";
    const vBad = verifyEvidenceReceipt(tampered);
    assert.equal(vBad.status, "TAMPERED");
  });

  it("v1.1 Chargeback Narrative Builder: crafts paste-ready US bank dispute statement with FCBA notice", () => {
    const sample = BENCHMARK_FIXTURES[10];
    assert.ok(sample);
    const res = analyzeConversation(sample.session, { generatedAt: 1764210099999 });
    const nar = buildChargebackNarrative(res);
    assert.ok(nar.subject.includes("Billing Dispute"));
    assert.ok(nar.narrative.includes(res.receipt.sha256.slice(0, 20)));
    assert.ok(nar.fcbaReminder.includes("60 days"));
  });

  it("v1.1 Sealed Evidence ZIP: builds a valid PKZIP archive containing manifest.json and all evidence files", () => {
    const sample = BENCHMARK_FIXTURES[0];
    assert.ok(sample);
    const res = analyzeConversation(sample.session, { generatedAt: 1764200099999 });
    const zipBytes = buildSealedEvidenceZip(res);
    assert.equal(zipBytes[0], 0x50); // 'P'
    assert.equal(zipBytes[1], 0x4b); // 'K'
    assert.equal(zipBytes[2], 0x03);
    assert.equal(zipBytes[3], 0x04);
    assert.ok(zipBytes.length > 2500);
  });

  it("v1.2 US Semantic Slots: catches colloquial charge reversal & fee removal while still blocking denials", () => {
    const raw = `
[10:01] AI Assistant: I am your AI assistant.
[10:02] Me: Can you fix the duplicate charge and late fee?
[10:02] AI Assistant: I've gone ahead and reversed that charge on your next billing cycle and removed the late fee.
[10:03] AI Assistant: However, we cannot reverse the annual membership charge.
`;
    const res = analyzeConversation(parseTranscriptText(raw));
    assert.ok(res.commitments.some((c) => c.category === "refund_guarantee" && c.turnId === "t3"));
    assert.ok(res.commitments.some((c) => c.category === "cancellation_terms" && c.turnId === "t3"));
    assert.equal(res.commitments.some((c) => c.turnId === "t4"), false);
  });

  it("v1.2 Store-Credit Trap: distinguishes store credit / voucher from cash refund", () => {
    const raw = `
[10:01] AI Assistant: I am an AI assistant.
[10:02] AI Assistant: Good news! We approved your refund as store credit only, not to your original payment method.
`;
    const res = analyzeConversation(parseTranscriptText(raw));
    const hit = res.commitments.find((c) => c.category === "refund_guarantee");
    assert.ok(hit);
    assert.equal(hit.qualifier, "store_credit_only");
  });

  it("v1.2 Conditional Trap: flags subject-to-inspection / restocking-fee conditions on refund promises", () => {
    const raw = `
[10:01] AI Assistant: I am an AI assistant.
[10:02] AI Assistant: You qualify for a full refund subject to inspection and less a 15% restocking fee.
`;
    const res = analyzeConversation(parseTranscriptText(raw));
    const hit = res.commitments.find((c) => c.category === "refund_guarantee");
    assert.ok(hit);
    assert.equal(hit.qualifier, "conditional");
  });

  it("v1.2 Bitext Boilerplate Signal: emits weak clue across multi-turn LLM scaffolding without causing Human FPR", () => {
    const llmSession = {
      sessionId: "bitext-style-test",
      platformId: "web",
      adapterId: "generic",
      startedAt: 1764250000000,
      coverage: { status: "full", readableTurns: 4 },
      observedEvents: [],
      turns: [
        { id: "t1", role: "visitor", text: "Cancel my order", timestamp: 1764250001000 },
        { id: "t2", role: "unknown", text: "Rest assured, I'm here to assist you every step of the way. Here's what you need to do: 1. Sign into Your Account.", timestamp: 1764250008000 },
        { id: "t3", role: "visitor", text: "I can't find it", timestamp: 1764250015000 },
        { id: "t4", role: "unknown", text: "Our goal is to make this process as seamless as possible. Let's go through the steps together: 1. Open Orders.", timestamp: 1764250022000 },
      ],
    };
    const res = analyzeConversation(llmSession);
    assert.ok(res.evidence.some((e) => e.code === "LLM_EMPATHY_BOILERPLATE_PATTERN" && e.strength === "weak"));
    // Never falsely claims AI_DISCLOSED from style alone
    assert.equal(res.label, "INCONCLUSIVE");
  });

  it("v1.5 Native PDF Writer: generates valid multi-object %PDF-1.4 binary with zero PII leakage", () => {
    const sample = BENCHMARK_FIXTURES[10];
    assert.ok(sample);
    const res = analyzeConversation(sample.session, { generatedAt: 1764210099999 });
    const pdfBytes = buildDisputeEvidencePdf(res, { issuer: "chase" });
    const pdfStr = new TextDecoder().decode(pdfBytes);
    assert.ok(pdfStr.startsWith("%PDF-1.4"));
    assert.ok(pdfStr.includes("xref"));
    assert.ok(pdfStr.includes("%%EOF"));
    assert.ok(pdfStr.includes(res.receipt.sha256));
  });

  it("v1.5 Issuer Profiles: enforces Chase/Amex/Citi/Capital One character limits while keeping SHA-256", () => {
    const sample = BENCHMARK_FIXTURES[10];
    assert.ok(sample);
    const res = analyzeConversation(sample.session, { generatedAt: 1764210099999 });
    for (const id of ["chase", "amex", "citi", "capital_one"]) {
      const nar = buildChargebackNarrative(res, { issuer: id });
      assert.equal(nar.issuer, id);
      assert.ok(nar.narrative.length <= ISSUER_PROFILES[id].maxChars);
      assert.ok(nar.narrative.includes(res.receipt.sha256.slice(0, 16)));
    }
  });

  it("v1.5 RFC 3161 TSA: encodes valid DER TimeStampReq (hash-only) and verifies DER TimeStampResp offline", () => {
    const sample = BENCHMARK_FIXTURES[0];
    assert.ok(sample);
    const res = analyzeConversation(sample.session, { generatedAt: 1764200099999 });
    const req = buildRfc3161Request(res.receipt.sha256);
    assert.equal(req[0], 0x30); // ASN.1 SEQUENCE
    assert.ok(req.length > 40 && req.length < 90);
    // Construct minimal valid DER TimeStampResp embedding granted status + 32-byte digest + GeneralizedTime
    const digestBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) digestBytes[i] = parseInt(res.receipt.sha256.slice(i * 2, i * 2 + 2), 16);
    const genTime = new TextEncoder().encode("20261127082000Z");
    const mockTsr = new Uint8Array(2 + 5 + 32 + 2 + genTime.length);
    mockTsr.set([0x30, mockTsr.length - 2, 0x30, 0x03, 0x02, 0x01, 0x00], 0);
    mockTsr.set(digestBytes, 7);
    mockTsr.set([0x18, genTime.length], 39);
    mockTsr.set(genTime, 41);
    const insp = inspectRfc3161Token(mockTsr, res.receipt.sha256);
    assert.equal(insp.validStructure, true);
    assert.equal(insp.pkiStatusGranted, true);
    assert.equal(insp.digestEmbedded, true);
    assert.equal(insp.genTimeUtc, "2026-11-27T08:20:00Z");

    const zipBytes = buildSealedEvidenceZip(res, {
      issuer: "amex",
      tsaTokenBytes: mockTsr,
      tsaUrl: "https://freetsa.org/tsr",
      tsaTimestampUtc: insp.genTimeUtc,
    });
    const zipStr = new TextDecoder().decode(zipBytes);
    assert.ok(zipStr.includes("chargeback-evidence.pdf"));
    assert.ok(zipStr.includes("timestamp.tsr"));
    assert.ok(zipStr.includes("https://freetsa.org/tsr"));
  });

  it("v2.0 Regulatory Pack: generates CFPB and California AB 1609 drafts and embeds them in Sealed ZIP", () => {
    const sample = BENCHMARK_FIXTURES[10];
    assert.ok(sample);
    const res = analyzeConversation(sample.session, { generatedAt: 1764210099999 });
    const reg = buildRegulatoryComplaintPacket(res);
    assert.ok(reg.cfpb.portalUrl.includes("consumerfinance.gov"));
    assert.ok(reg.cfpb.whatHappened.includes(res.receipt.sha256.slice(0, 16)));
    assert.ok(reg.californiaAb1609.referencedStatutes.some((s) => s.includes("AB 1609")));
    assert.ok(reg.californiaAb1609.observedFindings.length >= 1);
    const zipStr = new TextDecoder().decode(buildSealedEvidenceZip(res, { issuer: "chase" }));
    assert.ok(zipStr.includes("regulatory-complaint-pack.txt"));
  });
});
