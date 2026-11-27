import type { AnalysisResult } from "./types.js";

function regSafeIso(ts: number): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    return "1970-01-01T00:00:00.000Z";
  }
  return new Date(ts).toISOString();
}

export interface CfpbComplaintDraft {
  portalUrl: string;
  suggestedProduct: string;
  suggestedIssue: string;
  whatHappened: string;
  desiredResolution: string;
}

export interface CaliforniaAb1609Draft {
  portalUrl: string;
  referencedStatutes: string[];
  observedFindings: string[];
  complaintDraft: string;
}

export interface RegulatoryComplaintPacket {
  cfpb: CfpbComplaintDraft;
  californiaAb1609: CaliforniaAb1609Draft;
  nonLegalAdviceNotice: string;
}

/**
 * Generates structured, PII-redacted consumer regulatory documentation drafts
 * for the US CFPB Complaint Portal and California AG / FTC chatbot transparency reporting.
 * Strictly observational record-keeping — not legal advice.
 */
export function buildRegulatoryComplaintPacket(
  result: AnalysisResult
): RegulatoryComplaintPacket {
  const dateStr = regSafeIso(result.receipt.generatedAt).slice(0, 10);
  const categories = [...new Set(result.commitments.map((c) => c.category))];
  const qualifiers = [...new Set(result.commitments.map((c) => c.qualifier))];
  const dpCodes = [...new Set(result.darkPatterns.map((d) => d.code))];

  const hasRefund = categories.includes("refund_guarantee");
  const hasCancel = categories.includes("cancellation_terms");
  const hasStoreCredit = qualifiers.includes("store_credit_only");
  const hasConditional = qualifiers.includes("conditional");

  const suggestedProduct = hasCancel
    ? "Credit card or prepaid card"
    : hasRefund
    ? "Credit card or prepaid card"
    : "Credit card or prepaid card";

  const suggestedIssue = hasCancel
    ? "Problem with a purchase shown on your statement / Canceled recurring charge or fee waiver"
    : hasStoreCredit
    ? "Problem with a purchase shown on your statement / Refund substituted with store credit"
    : hasRefund
    ? "Problem with a purchase shown on your statement / Promised refund not processed"
    : "Other problem with merchant billing or automated customer service";

  const excerptSummary =
    result.commitments.length > 0
      ? result.commitments
          .slice(0, 2)
          .map((c) => `"${c.excerptRedacted}" (${c.category}, ${c.qualifier})`)
          .join("; ")
      : "the disputed customer-support statements recorded in the attached evidence bundle";

  const trapNote = hasStoreCredit
    ? " The merchant attempted to substitute non-cash store credit or a travel voucher rather than refunding the original payment card."
    : hasConditional
    ? " The merchant attached undisclosed conditional inspection, approval, or fee-deduction terms."
    : "";

  const frictionNote = result.handoffFriction.detected
    ? ` I requested a live human representative ${result.handoffFriction.requestCount} times during the session without being transferred.`
    : "";

  const whatHappened = [
    `On ${dateStr}, I contacted the merchant's online support${result.receipt.pageUrlRedacted ? ` (${result.receipt.pageUrlRedacted})` : ""} (Session ${result.receipt.sessionId}).`,
    `During this session (observed speaker status: ${result.label}; transparency audit: ${result.transparencyAudit.status}), the support channel stated: ${excerptSummary}.${trapNote}${frictionNote}`,
    `Attached is my locally generated, PII-redacted LiveChatLens Sealed Evidence Pack (SHA-256: ${result.receipt.sha256.slice(0, 24)}…).`,
  ].join(" ");

  const desiredResolution = hasCancel
    ? "Honor the written live-chat cancellation / fee-waiver commitment, stop all recurring billing immediately, and credit back the disputed charge to my original payment method."
    : "Honor the written live-chat refund commitment by issuing a full cash credit back to my original payment card rather than non-cash store credit or undisclosed deductions.";

  const observedFindings: string[] = [];
  if (result.transparencyAudit.status === "disclosed_late") {
    observedFindings.push(
      `Late AI disclosure: AI/automated support was not disclosed until responder turn #${result.transparencyAudit.disclosureIndex ?? "?"}.`
    );
  }
  if (result.transparencyAudit.status === "not_disclosed") {
    observedFindings.push(
      "No upfront AI disclosure was observed across readable responder turns."
    );
  }
  if (dpCodes.includes("LOW_VISIBILITY_DISCLOSURE")) {
    observedFindings.push(
      "Low-visibility AI disclosure banner detected (failed WCAG AA contrast, font-size, or opacity visibility thresholds)."
    );
  }
  if (dpCodes.includes("BURIED_TOS_DISCLOSURE")) {
    observedFindings.push(
      "AI/automation notice was buried inside Terms of Service or privacy fine print rather than clearly disclosed upfront."
    );
  }
  if (dpCodes.includes("HANDOFF_LOOP_FRICTION") || result.handoffFriction.detected) {
    observedFindings.push(
      `Human escalation friction: consumer requested a live human agent ${result.handoffFriction.requestCount} times without an observed transfer path.`
    );
  }
  if (dpCodes.includes("FAKE_HUMAN_HANDOFF")) {
    observedFindings.push(
      "Suspected fake human handoff: a turn labeled as a human support specialist exhibited conflicting AI markers or streamed LLM output."
    );
  }
  if (hasStoreCredit) {
    observedFindings.push(
      "Store-credit / travel-voucher trap: refund promise restricted to non-cash store credit."
    );
  }
  if (observedFindings.length === 0) {
    observedFindings.push(
      "No dark-pattern or late-disclosure violations flagged; packet serves as neutral timestamped session documentation."
    );
  }

  const referencedStatutes = [
    "California B.O.T. Act (Bus. & Prof. Code § 17941 / SB 1001) — AI bot disclosure in commercial transactions",
    "California AB 1609 (effective Jan 1, 2027) — Clear AI chatbot disclosure and route to a human representative",
    "Utah Code § 13-77-103 — Consumer-facing GenAI disclosure requirements",
    "Maine 10 M.R.S. § 1500-DD (LD 1727) — Clear and conspicuous AI chatbot disclosure",
    "FTC Act Section 5 (15 U.S.C. § 45) — Unfair or deceptive acts or practices",
  ];

  const complaintDraft = [
    `Date of Interaction (UTC): ${dateStr}`,
    `Session ID: ${result.receipt.sessionId}${result.receipt.pageUrlRedacted ? ` | URL: ${result.receipt.pageUrlRedacted}` : ""}`,
    `Observed Verdict: ${result.label} | Transparency Status: ${result.transparencyAudit.status}`,
    `Evidence SHA-256: ${result.receipt.sha256}`,
    ``,
    `Observable UI & Conversation Findings:`,
    ...observedFindings.map((f) => `- ${f}`),
    ``,
    `Summary: During a US consumer support chat, I encountered the observable interface and commitment issues documented above. A PII-redacted, tamper-evident LiveChatLens Sealed Evidence Pack is attached for independent verification.`,
  ].join("\n");

  return {
    cfpb: {
      portalUrl: "https://www.consumerfinance.gov/complaint/",
      suggestedProduct,
      suggestedIssue,
      whatHappened,
      desiredResolution,
    },
    californiaAb1609: {
      portalUrl: "https://oag.ca.gov/contact/consumer-complaint-against-business-or-company",
      referencedStatutes,
      observedFindings,
      complaintDraft,
    },
    nonLegalAdviceNotice:
      "Observational documentation only — not legal advice. Verify exact statutory applicability and filing deadlines for your jurisdiction before submitting.",
  };
}
