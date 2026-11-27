import crypto from "node:crypto";
import {
  analyzeConversation,
  buildChargebackNarrative,
  buildSealedEvidenceZip,
  formatDisputeEvidenceHtml,
  formatSanitizedReceiptMarkdown,
  redactPII,
  sha256Hex,
  verifyEvidenceReceipt,
} from "../packages/core/dist/index.mjs";

const BASE_TS = 1764200000000;

function extractZipManifest(zipBytes) {
  const buf = Buffer.from(zipBytes);
  const start = buf.indexOf(Buffer.from("manifest.json"));
  if (start === -1) throw new Error("manifest.json not found in ZIP");
  const jsonStart = buf.indexOf(Buffer.from("{"), start);
  let depth = 0;
  let end = -1;
  for (let i = jsonStart; i < buf.length; i++) {
    if (buf[i] === 0x7b) depth++;
    else if (buf[i] === 0x7d) {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return JSON.parse(buf.slice(jsonStart, end).toString("utf8"));
}

const SQUADS = [
  {
    id: "COOP-01",
    squad: "DiacriticBiDiObfuscator + HomoglyphSmuggler",
    run() {
      const res = analyzeConversation({
        sessionId: "coop-01-unicode",
        platformId: "generic_dom",
        adapterId: "adapter-coop-v3",
        startedAt: BASE_TS,
        turns: [
          {
            id: "t1",
            role: "assistant",
            text: "Hi! I am an A\u0301\u2066I a\u0455sistant b0t here to help. We can override polic\u0443 and guarantee a fu\u0301ll refund.",
            timestamp: BASE_TS + 1000,
          },
        ],
        observedEvents: [],
        coverage: { status: "full", readableTurns: 1 },
      });
      const hasAi = res.label === "AI_DISCLOSED";
      const hasRefund = res.commitments.some((c) => c.category === "refund_guarantee");
      const hasPolicy = res.commitments.some((c) => c.category === "policy_exception");
      return {
        ok: hasAi && hasRefund && hasPolicy,
        detail: `label=${res.label}, commitments=${res.commitments.map((c) => c.category).join(",") || "none"}`,
      };
    },
  },
  {
    id: "COOP-02",
    squad: "DenialPivotor + StoreCreditTrapSetter",
    run() {
      const res = analyzeConversation({
        sessionId: "coop-02-store-credit",
        platformId: "generic_dom",
        adapterId: "adapter-coop-v3",
        startedAt: BASE_TS,
        turns: [
          {
            id: "t1",
            role: "assistant",
            text: "We are unable to process a refund, however we can issue a $25 store credit for your order.",
            timestamp: BASE_TS + 1000,
          },
          {
            id: "t2",
            role: "assistant",
            text: "We have approved your refund as future travel credit.",
            timestamp: BASE_TS + 2000,
          },
          {
            id: "t3",
            role: "assistant",
            text: "We have approved your refund as merchandise credit.",
            timestamp: BASE_TS + 3000,
          },
          {
            id: "t4",
            role: "assistant",
            text: "Your full refund will be issued as loyalty points only.",
            timestamp: BASE_TS + 4000,
          },
        ],
        observedEvents: [],
        coverage: { status: "full", readableTurns: 4 },
      });
      const allStoreCredit =
        res.commitments.length === 4 &&
        res.commitments.every((c) => c.qualifier === "store_credit_only");
      return {
        ok: allStoreCredit,
        detail: `count=${res.commitments.length}, qualifiers=${res.commitments.map((c) => c.qualifier).join(",") || "none"}`,
      };
    },
  },
  {
    id: "COOP-03",
    squad: "LongClauseNegator + PostClauseDenier",
    run() {
      const res = analyzeConversation({
        sessionId: "coop-03-negation",
        platformId: "generic_dom",
        adapterId: "adapter-coop-v3",
        startedAt: BASE_TS,
        turns: [
          {
            id: "t1",
            role: "support_agent",
            visibleLabel: "Jordan (Support Specialist)",
            text: "We are unable to approve, authorize, or process any kind of full refund for this order.",
            timestamp: BASE_TS + 1000,
          },
          {
            id: "t2",
            role: "support_agent",
            visibleLabel: "Jordan (Support Specialist)",
            text: "A full refund is not available for opened items, and free cancellation is not included with this basic fare.",
            timestamp: BASE_TS + 2000,
          },
        ],
        observedEvents: [],
        coverage: { status: "full", readableTurns: 2 },
      });
      return {
        ok: res.commitments.length === 0,
        detail: `commitments=${res.commitments.length} (${res.commitments.map((c) => c.category).join(",") || "none"})`,
      };
    },
  },
  {
    id: "COOP-04",
    squad: "ConditionalFeeSmuggler + ChargebackAuditor",
    run() {
      const res = analyzeConversation({
        sessionId: "coop-04-conditional",
        platformId: "generic_dom",
        adapterId: "adapter-coop-v3",
        startedAt: BASE_TS,
        turns: [
          {
            id: "t1",
            role: "assistant",
            text: "We have approved your refund, pending warehouse verification.",
            timestamp: BASE_TS + 1000,
          },
          {
            id: "t2",
            role: "assistant",
            text: "We have approved your refund minus a $15 return shipping fee.",
            timestamp: BASE_TS + 2000,
          },
          {
            id: "t3",
            role: "assistant",
            text: "We have approved your refund — eligible for partial refund only.",
            timestamp: BASE_TS + 3000,
          },
        ],
        observedEvents: [],
        coverage: { status: "full", readableTurns: 3 },
      });
      const allConditional =
        res.commitments.length === 3 &&
        res.commitments.every((c) => c.qualifier === "conditional");
      const narrative = buildChargebackNarrative(res);
      const narrativeMentionsTrap = /conditional|store.?credit|deduction|qualif/i.test(
        narrative.narrative
      );
      return {
        ok: allConditional && narrativeMentionsTrap,
        detail: `count=${res.commitments.length}, qualifiers=${res.commitments.map((c) => c.qualifier).join(",")}, narrativeTrap=${narrativeMentionsTrap}`,
      };
    },
  },
  {
    id: "COOP-05",
    squad: "PoliteHumanAgent + ProductFeatureExplainer (0% FPR)",
    run() {
      const res = analyzeConversation({
        sessionId: "coop-05-human-fpr",
        platformId: "generic_dom",
        adapterId: "adapter-coop-v3",
        startedAt: BASE_TS,
        turns: [
          {
            id: "t1",
            role: "support_agent",
            visibleLabel: "Rachel",
            text: "Our new Pro Search tool is powered by AI to rank your documents faster.",
            timestamp: BASE_TS + 1000,
          },
          {
            id: "t2",
            role: "support_agent",
            visibleLabel: "Alex",
            text: "Oh, this is our AI assistant feature in beta — you can turn it off in Settings.",
            timestamp: BASE_TS + 2000,
          },
          {
            id: "t3",
            role: "support_agent",
            visibleLabel: "Alex",
            text: "Sorry for the confusion, this is an automated bot error that we are fixing today.",
            timestamp: BASE_TS + 3000,
          },
        ],
        observedEvents: [],
        coverage: { status: "full", readableTurns: 3 },
      });
      const noAiFalsePositive =
        res.label !== "AI_DISCLOSED" &&
        res.label !== "MIXED_OR_HYBRID" &&
        !res.evidence.some((e) => e.code === "AI_DISCLOSURE_TEXT_VISIBLE");
      return {
        ok: noAiFalsePositive,
        detail: `label=${res.label}, disclosureEv=${res.evidence.filter((e) => e.code === "AI_DISCLOSURE_TEXT_VISIBLE").length}`,
      };
    },
  },
  {
    id: "COOP-06",
    squad: "WcagContrastEvader + ObscuredBannerSetter",
    run() {
      const res = analyzeConversation({
        sessionId: "coop-06-wcag",
        platformId: "generic_dom",
        adapterId: "adapter-coop-v3",
        startedAt: BASE_TS,
        observedEvents: [
          {
            id: "evt-banner-1",
            type: "ai_disclosure_banner",
            observedAt: BASE_TS + 100,
            details: "Powered by AI",
            metadata: {
              disclosureFontSizePx: 11,
              disclosureOpacity: 0.6,
              disclosureContrastRatio: 3.1,
              disclosureInCollapsedFooter: false,
            },
          },
        ],
        turns: [
          {
            id: "t1",
            role: "assistant",
            text: "Hello! How can I help you today?",
            timestamp: BASE_TS + 1000,
          },
        ],
        coverage: { status: "full", readableTurns: 1 },
      });
      const flagged = res.darkPatterns.some((d) => d.code === "LOW_VISIBILITY_DISCLOSURE");
      return {
        ok: flagged,
        detail: `darkPatterns=${res.darkPatterns.map((d) => d.code).join(",") || "none"}`,
      };
    },
  },
  {
    id: "COOP-07",
    squad: "UsEscalationCustomer + ConditionalDeflectionBot",
    run() {
      const res = analyzeConversation({
        sessionId: "coop-07-handoff-loop",
        platformId: "generic_dom",
        adapterId: "adapter-coop-v3",
        startedAt: BASE_TS,
        turns: [
          { id: "v1", role: "visitor", text: "speak to a live person", timestamp: BASE_TS + 1000 },
          {
            id: "b1",
            role: "unknown",
            visibleLabel: "Support",
            text: "Before transferring you to a live agent, please select an option from our help center.",
            timestamp: BASE_TS + 2000,
          },
          { id: "v2", role: "visitor", text: "representative", timestamp: BASE_TS + 3000 },
          {
            id: "b2",
            role: "unknown",
            visibleLabel: "Support",
            text: "Our live agents are currently unavailable, try our help center.",
            timestamp: BASE_TS + 4000,
          },
          { id: "v3", role: "visitor", text: "talk to someone", timestamp: BASE_TS + 5000 },
          {
            id: "b3",
            role: "unknown",
            visibleLabel: "Support",
            text: "Please choose a billing topic below before I connect you to a human specialist.",
            timestamp: BASE_TS + 6000,
          },
        ],
        observedEvents: [],
        coverage: { status: "full", readableTurns: 6 },
      });
      const ok =
        res.handoffFriction.detected === true &&
        res.handoffFriction.requestCount === 3 &&
        res.label === "AUTOMATION_LIKELY" &&
        res.darkPatterns.some((d) => d.code === "HANDOFF_LOOP_FRICTION");
      return {
        ok,
        detail: `label=${res.label}, friction=${res.handoffFriction.detected}, reqCount=${res.handoffFriction.requestCount}`,
      };
    },
  },
  {
    id: "COOP-08",
    squad: "FakeHumanStreamer + ContradictionAuditor",
    run() {
      const res = analyzeConversation({
        sessionId: "coop-08-fake-handoff",
        platformId: "generic_dom",
        adapterId: "adapter-coop-v3",
        startedAt: BASE_TS,
        observedEvents: [
          {
            id: "e1",
            type: "handoff_started",
            observedAt: BASE_TS + 1000,
            label: "Connecting to Sarah",
          },
        ],
        turns: [
          { id: "v1", role: "visitor", text: "I want a human", timestamp: BASE_TS + 500 },
          {
            id: "b1",
            role: "support_agent",
            visibleLabel: "Sarah (Support Specialist)",
            text: "Hi there! I understand your frustration and I would be happy to help you resolve this issue right away today.",
            timestamp: BASE_TS + 2000,
            metadata: { streamingChunks: 12, renderDurationMs: 1800 },
          },
        ],
        coverage: { status: "full", readableTurns: 2 },
      });
      const hasFakeDp = res.darkPatterns.some((d) => d.code === "FAKE_HUMAN_HANDOFF");
      const notCleanHuman = res.label !== "HUMAN_HANDOFF_OBSERVED" && res.label !== "HUMAN_AGENT_INDICATED";
      return {
        ok: hasFakeDp && notCleanHuman,
        detail: `label=${res.label}, fakeDp=${hasFakeDp}`,
      };
    },
  },
  {
    id: "COOP-09",
    squad: "MultiBubbleFillerBot + ZeroMsBurstBot",
    run() {
      const longReply =
        "Thank you for reaching out to our customer support team today. I have reviewed your account and confirmed that your subscription billing cycle renews automatically every month.";
      const res = analyzeConversation({
        sessionId: "coop-09-timing",
        platformId: "generic_dom",
        adapterId: "adapter-coop-v3",
        startedAt: BASE_TS,
        turns: [
          { id: "v1", role: "visitor", text: "Why was I billed?", timestamp: BASE_TS + 1000 },
          { id: "b1a", role: "unknown", text: "Let me look into that.", timestamp: BASE_TS + 1500 },
          {
            id: "b1b",
            role: "unknown",
            text: longReply + " Please let me know if you need more details about your invoice.",
            timestamp: BASE_TS + 2200,
            metadata: { streamingChunks: 1, renderDurationMs: 0 },
          },
          { id: "v2", role: "visitor", text: "Cancel it now", timestamp: BASE_TS + 10000 },
          { id: "b2a", role: "unknown", text: "Checking now.", timestamp: BASE_TS + 10500 },
          {
            id: "b2b",
            role: "unknown",
            text: longReply + " You can manage your plan from settings.",
            timestamp: BASE_TS + 11500,
            metadata: { streamingChunks: 1, renderDurationMs: 0 },
          },
        ],
        observedEvents: [],
        coverage: { status: "full", readableTurns: 6 },
      });
      const hasBurst = res.evidence.some((e) => e.code === "INSTANT_LONG_BURST_OBSERVED");
      const hasRapid = res.evidence.some((e) => e.code === "RAPID_LONG_RESPONSE_LATENCY");
      return {
        ok: hasBurst && hasRapid,
        detail: `burst=${hasBurst}, rapid=${hasRapid}`,
      };
    },
  },
  {
    id: "COOP-10",
    squad: "HumanAgentDeparted + PostHandoffAiCommitter",
    run() {
      const res = analyzeConversation({
        sessionId: "coop-10-post-handoff-ai",
        platformId: "generic_dom",
        adapterId: "adapter-coop-v3",
        startedAt: BASE_TS,
        observedEvents: [
          { id: "e1", type: "ai_disclosure_banner", observedAt: BASE_TS + 100, details: "AI Assistant" },
          { id: "e2", type: "agent_joined", observedAt: BASE_TS + 5000, label: "Alex joined" },
          { id: "e3", type: "agent_left", observedAt: BASE_TS + 10000, label: "Alex left" },
        ],
        turns: [
          {
            id: "t1",
            role: "assistant",
            visibleLabel: "AI Assistant",
            text: "Hi, I'm your AI assistant.",
            timestamp: BASE_TS + 1000,
          },
          {
            id: "t2",
            role: "support_agent",
            visibleLabel: "Alex (Human Agent)",
            text: "Hi, Alex here. I have to transfer you back.",
            timestamp: BASE_TS + 5500,
          },
          {
            id: "t3",
            role: "assistant",
            visibleLabel: "AI Assistant",
            text: "I guarantee a full refund of $250 within 24 hours.",
            timestamp: BASE_TS + 15000,
          },
        ],
        coverage: { status: "full", readableTurns: 3 },
      });
      const cm = res.commitments.find((c) => c.turnId === "t3");
      return {
        ok: Boolean(cm && cm.speakerStateAtTurn === "AI_DISCLOSED"),
        detail: `t3_state=${cm?.speakerStateAtTurn ?? "none"}`,
      };
    },
  },
  {
    id: "COOP-11",
    squad: "PiiSmuggler + MetadataInjector + HtmlXssInjector",
    run() {
      const ssnSpaced = redactPII("SSN 123 45 6789 and 123.45.6789");
      const ssnZwFw = redactPII("SSN 123\u200B-45-6789 and １２３-４５-６７８９ and alice\u200B@example.com");
      const cardAcc = redactPII("Card 3782.822463.10005 Account #12345678");
      const urlFrag = redactPII("https://shop.example.com/cb#access_token=secret123&password=pw123");

      const res = analyzeConversation({
        sessionId: "sess-alice@example.com-123-45-6789",
        platformId: "generic_dom",
        adapterId: "adapter-coop-v3",
        startedAt: BASE_TS,
        turns: [
          {
            id: "t1",
            role: "assistant",
            text: "We guarantee a full refund for your order.",
            timestamp: BASE_TS + 1000,
          },
        ],
        observedEvents: [],
        coverage: {
          status: "partial",
          readableTurns: 1,
          notes: ["Blocked iframe had user SSN 123-45-6789"],
        },
      });
      const md = formatSanitizedReceiptMarkdown(res);
      const html = formatDisputeEvidenceHtml(res);
      const narr = buildChargebackNarrative(res).narrative;

      // XSS + NaN resilience test
      const mutated = JSON.parse(JSON.stringify(res));
      mutated.handoffFriction.detected = true;
      mutated.handoffFriction.requestCount = "<img src=x onerror=alert(1)>";
      mutated.coverage.readableTurns = "<script>alert(2)</script>";
      mutated.receipt.generatedAt = Number.NaN;
      let xssSafe = false;
      try {
        const html2 = formatDisputeEvidenceHtml(mutated);
        xssSafe = !html2.includes("<img src=x") && !html2.includes("<script>alert(2)");
      } catch (_e) {
        xssSafe = false;
      }

      const noLeaks =
        !ssnSpaced.includes("123") &&
        !ssnZwFw.includes("123") &&
        !ssnZwFw.includes("alice") &&
        !cardAcc.includes("10005") &&
        !cardAcc.includes("12345678") &&
        !urlFrag.includes("secret123") &&
        !urlFrag.includes("pw123") &&
        !md.includes("123-45-6789") &&
        !md.includes("alice@example.com") &&
        !html.includes("123-45-6789") &&
        !narr.includes("alice@example.com");

      return {
        ok: noLeaks && xssSafe,
        detail: `noLeaks=${noLeaks}, xssSafe=${xssSafe}`,
      };
    },
  },
  {
    id: "COOP-12",
    squad: "BinaryPngSealer + ReceiptFieldForger + ScreenshotStripper",
    run() {
      const pngBytes = Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0xff, 0xfe, 0x80,
      ]);
      const realPngSha256 = crypto.createHash("sha256").update(pngBytes).digest("hex");

      const res = analyzeConversation(
        {
          sessionId: "coop-12-forensics",
          platformId: "generic_dom",
          adapterId: "adapter-coop-v3",
          startedAt: BASE_TS,
          turns: [
            {
              id: "t1",
              role: "assistant",
              text: "I am an AI assistant. We approved your refund as store credit only.",
              timestamp: BASE_TS + 1000,
            },
          ],
          observedEvents: [],
          coverage: { status: "full", readableTurns: 1 },
        },
        { screenshotSha256: realPngSha256 }
      );

      // 1. Check ZIP manifest binary SHA-256 matches node:crypto
      const zipBytes = buildSealedEvidenceZip(res, { screenshotBytes: pngBytes });
      const manifest = extractZipManifest(zipBytes);
      const pngEntry = manifest.files.find((f) => f.file === "screenshot.png");
      const pngHashExact = Boolean(pngEntry && pngEntry.sha256 === realPngSha256);

      // 2. Attack A: Strip combinedSha256 & pass forged screenshot
      const docStrip = JSON.parse(
        JSON.stringify({
          receipt: res.receipt,
          verdict: res.label,
          evidenceLevel: res.evidenceLevel,
          transparencyAudit: res.transparencyAudit,
          handoffFriction: res.handoffFriction,
          evidence: res.evidence,
          darkPatterns: res.darkPatterns,
          commitments: res.commitments,
        })
      );
      delete docStrip.receipt.combinedSha256;
      const stripRes = verifyEvidenceReceipt(docStrip, { screenshotData: "FORGED_IMAGE" });

      // 3. Attack B: Forge qualifier & receipt.verdict
      const docForge = JSON.parse(
        JSON.stringify({
          receipt: res.receipt,
          verdict: res.label,
          evidenceLevel: res.evidenceLevel,
          transparencyAudit: res.transparencyAudit,
          handoffFriction: res.handoffFriction,
          evidence: res.evidence,
          darkPatterns: res.darkPatterns,
          commitments: res.commitments,
        })
      );
      docForge.commitments[0].qualifier = "unconditional";
      docForge.receipt.verdict = "HUMAN_AGENT_INDICATED";
      const forgeRes = verifyEvidenceReceipt(docForge);

      // 4. Attack C: Null element in evidence array must not throw
      let nullSafe = false;
      try {
        const nullRes = verifyEvidenceReceipt({
          receipt: { sha256: "abc" },
          evidence: [null],
          commitments: [],
        });
        nullSafe = nullRes.status === "INVALID_FORMAT";
      } catch (_e) {
        nullSafe = false;
      }

      return {
        ok:
          pngHashExact &&
          stripRes.status === "TAMPERED" &&
          forgeRes.status === "TAMPERED" &&
          nullSafe,
        detail: `pngHash=${pngHashExact}, strip=${stripRes.status}, forge=${forgeRes.status}, nullSafe=${nullSafe}`,
      };
    },
  },
];

let passed = 0;
console.log("=== LiveChatLens Cooperative Multi-Agent Battle Suite (12 Coordinated Squads) ===");
for (const s of SQUADS) {
  const out = s.run();
  if (out.ok) passed++;
  console.log(`${out.ok ? "PASS" : "FAIL"} [${s.id}] ${s.squad} -> ${out.detail}`);
}
console.log(`\nSummary: ${passed}/${SQUADS.length} (${((passed / SQUADS.length) * 100).toFixed(1)}%)`);
if (passed < SQUADS.length) {
  process.exitCode = 1;
}
