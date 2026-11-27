import type { AnalysisResult, CommitmentCategory, CommitmentQualifier } from "./types.js";

export type IssuerProfileId = "generic" | "chase" | "amex" | "citi" | "capital_one";

export interface IssuerProfile {
  id: IssuerProfileId;
  label: string;
  maxChars: number;
  networkHint: string;
}

export const ISSUER_PROFILES: Record<IssuerProfileId, IssuerProfile> = {
  generic: {
    id: "generic",
    label: "Generic US Card Issuer",
    maxChars: 1500,
    networkHint: "Visa / Mastercard / Amex",
  },
  chase: {
    id: "chase",
    label: "Chase (Visa)",
    maxChars: 1000,
    networkHint: "Visa 13.6 / 13.2 / 13.5",
  },
  amex: {
    id: "amex",
    label: "American Express",
    maxChars: 750,
    networkHint: "Amex C02 / C28 / C31",
  },
  citi: {
    id: "citi",
    label: "Citi (Mastercard / Visa)",
    maxChars: 1000,
    networkHint: "Mastercard 4853 / 4841 · Visa 13.x",
  },
  capital_one: {
    id: "capital_one",
    label: "Capital One",
    maxChars: 800,
    networkHint: "Visa / Mastercard Dispute Portal",
  },
};

export interface ChargebackNarrativeOptions {
  issuer?: IssuerProfileId;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeIsoTimestamp(ts: number): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    return "1970-01-01T00:00:00.000Z";
  }
  return new Date(ts).toISOString();
}

function mapUsChargebackCodes(
  categories: CommitmentCategory[],
  qualifiers: CommitmentQualifier[]
): string[] {
  const codes: string[] = [];
  if (categories.includes("refund_guarantee")) {
    codes.push("Credit Not Processed — Visa 13.6 · Amex C02 · Mastercard 4853");
  }
  if (categories.includes("cancellation_terms")) {
    codes.push("Canceled Recurring / Fee Waiver — Visa 13.2 · Mastercard 4841 · Amex C18/C28");
  }
  if (
    categories.includes("pricing_quote") ||
    categories.includes("policy_exception") ||
    qualifiers.includes("store_credit_only") ||
    qualifiers.includes("conditional")
  ) {
    codes.push("Misrepresentation / Not as Described — Visa 13.5 / 13.3 · Amex C31");
  }
  if (categories.includes("deadline_promise")) {
    codes.push("Services Not Provided / Late Delivery — Visa 13.1 · Amex C08");
  }
  return codes;
}

export interface ChargebackNarrative {
  issuer: IssuerProfileId;
  maxChars: number;
  charCount: number;
  subject: string;
  reasonCodes: string[];
  narrative: string;
  fcbaReminder: string;
}

/**
 * Generates a concise, factual, paste-ready US credit card dispute statement
 * tailored for Chase, Amex, Citi, Capital One, and Generic US bank dispute portals,
 * respecting each issuer's character limit while preserving qualifier warnings and SHA-256 seal.
 */
export function buildChargebackNarrative(
  result: AnalysisResult,
  options: ChargebackNarrativeOptions = {}
): ChargebackNarrative {
  const issuerId: IssuerProfileId =
    options.issuer && ISSUER_PROFILES[options.issuer] ? options.issuer : "generic";
  const profile = ISSUER_PROFILES[issuerId];
  const categories = [...new Set(result.commitments.map((c) => c.category))];
  const qualifiers = [...new Set(result.commitments.map((c) => c.qualifier))];
  const reasonCodes = mapUsChargebackCodes(categories, qualifiers);
  const dateStr = safeIsoTimestamp(result.receipt.generatedAt).slice(0, 10);
  const urlPart = result.receipt.pageUrlRedacted
    ? ` on ${result.receipt.pageUrlRedacted}`
    : "";

  const excerptCap = profile.maxChars <= 800 ? 90 : 150;
  const promiseSummary =
    result.commitments.length > 0
      ? result.commitments
          .slice(0, profile.maxChars <= 800 ? 1 : 2)
          .map((c) => {
            const ex =
              c.excerptRedacted.length > excerptCap
                ? `${c.excerptRedacted.slice(0, excerptCap - 1)}…`
                : c.excerptRedacted;
            return `"${ex}" (${c.category}, ${c.qualifier})`;
          })
          .join("; ")
      : "the disputed merchant terms recorded in the attached chat transcript";

  const hasStoreCreditTrap = qualifiers.includes("store_credit_only");
  const hasConditionalTrap = qualifiers.includes("conditional");

  const qualifierCaveat = hasStoreCreditTrap
    ? " Note: Merchant offered non-cash store credit / travel voucher instead of a card refund."
    : hasConditionalTrap
    ? " Note: Merchant attached conditional inspection or fee-deduction qualifiers."
    : "";

  const disclosureNote =
    result.transparencyAudit.status === "disclosed_late"
      ? " AI/automated support was not disclosed until after the promise."
      : result.handoffFriction.detected
      ? ` Requested a live human ${result.handoffFriction.requestCount}x without transfer.`
      : "";

  const subject = hasStoreCreditTrap
    ? "Billing Dispute — Store-Credit Substitution / Refund Terms Misrepresented"
    : categories.includes("refund_guarantee")
    ? "Billing Dispute — Promised Refund / Credit Not Processed"
    : categories.includes("cancellation_terms")
    ? "Billing Dispute — Canceled Recurring Subscription / Fee Waiver Not Honored"
    : "Billing Dispute — Merchant Live-Chat Terms Misrepresented";

  const sealPart = `Attached: PII-redacted LiveChatLens Evidence Pack (SHA-256: ${result.receipt.sha256.slice(0, 20)}…).`;

  let narrative = [
    `On ${dateStr}, I contacted merchant support${urlPart} (Session ${result.receipt.sessionId}).`,
    `Support (${result.label}) stated: ${promiseSummary}.${qualifierCaveat}${disclosureNote}`,
    `I relied on this in good faith, and the merchant failed to honor the stated terms.`,
    sealPart,
  ].join(" ");

  if (narrative.length > profile.maxChars) {
    const budget = Math.max(120, profile.maxChars - sealPart.length - 5);
    narrative = `${narrative.slice(0, budget).trimEnd()}… ${sealPart}`;
  }

  return {
    issuer: issuerId,
    maxChars: profile.maxChars,
    charCount: narrative.length,
    subject,
    reasonCodes,
    narrative,
    fcbaReminder:
      "FCBA Reminder: Under the US Fair Credit Billing Act, send written billing-error notice to your credit card issuer within 60 days of your statement date and attach your order receipt + this Sealed Evidence Pack.",
  };
}

/**
 * Generates a self-contained, print-ready US Credit Card Chargeback & Consumer Dispute Evidence Report (HTML).
 */
export function formatDisputeEvidenceHtml(
  result: AnalysisResult,
  options: ChargebackNarrativeOptions = {}
): string {
  const generatedIso = safeIsoTimestamp(result.receipt.generatedAt);
  const narrativeObj = buildChargebackNarrative(result, options);
  const suggestedCodes = narrativeObj.reasonCodes;

  const evidenceRows =
    result.evidence.length === 0
      ? `<tr><td colspan="4" class="muted">No direct or strong observable evidence recorded.</td></tr>`
      : result.evidence
          .map(
            (ev) => `
          <tr>
            <td><code>${esc(ev.strength.toUpperCase())}</code></td>
            <td><code>${esc(ev.code)}</code></td>
            <td>${esc(ev.turnIds.join(", ") || "session")}</td>
            <td>${esc(ev.explanation)}${ev.excerptRedacted ? `<div class="excerpt">Redacted excerpt: “${esc(ev.excerptRedacted)}”</div>` : ""}</td>
          </tr>`
          )
          .join("");

  const commitmentRows =
    result.commitments.length === 0
      ? `<tr><td colspan="4" class="muted">No high-stakes pricing, refund, cancellation, or warranty commitments flagged.</td></tr>`
      : result.commitments
          .map(
            (cm) => `
          <tr>
            <td><strong>${esc(cm.category)}</strong><div><code>${esc(cm.qualifier)}</code></div></td>
            <td><code>${esc(cm.turnId)}</code></td>
            <td><code>${esc(cm.speakerStateAtTurn)}</code></td>
            <td>“${esc(cm.excerptRedacted)}”<div class="note">${esc(cm.riskNote)}</div></td>
          </tr>`
          )
          .join("");

  const darkPatternRows =
    result.darkPatterns.length === 0
      ? `<p class="muted">None observed.</p>`
      : `<ul>${result.darkPatterns
          .map((d) => `<li><strong>${esc(d.code)}</strong>: ${esc(d.explanation)}</li>`)
          .join("")}</ul>`;

  const chargebackBlock =
    suggestedCodes.length === 0
      ? `<p class="muted">No specific card-network dispute codes mapped (no binding pricing/refund/cancellation commitments flagged).</p>`
      : `<ul>${suggestedCodes.map((c) => `<li><strong>${esc(c)}</strong></li>`).join("")}</ul>
         <p class="muted">${esc(narrativeObj.fcbaReminder)}</p>`;

  return `<!DOCTYPE html>
<html lang="en-US">
<head>
  <meta charset="UTF-8" />
  <title>LiveChatLens — US Consumer &amp; Chargeback Evidence Report (${esc(result.receipt.sessionId)})</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 32px auto; max-width: 860px; padding: 0 20px; line-height: 1.55; font-size: 13px; }
    header { border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
    h1 { margin: 0; font-size: 20px; }
    h2 { font-size: 13.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #334155; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; margin-top: 22px; }
    .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 18px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; }
    .meta-item strong { display: inline-block; min-width: 155px; color: #334155; }
    .hash-box { background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 12px 14px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; word-break: break-all; margin-top: 14px; }
    .cb-box { background: #eff6ff; border: 1px solid #93c5fd; border-radius: 8px; padding: 12px 14px; margin-top: 10px; }
    .narrative-box { background: #f8fafc; border-left: 4px solid #0284c7; padding: 12px 14px; border-radius: 6px; margin-top: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 600; }
    .excerpt { margin-top: 4px; color: #475569; font-style: italic; }
    .note { margin-top: 4px; color: #92400e; }
    .muted { color: #64748b; }
    .disclaimer { margin-top: 24px; padding: 12px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; font-size: 11.5px; color: #78350f; }
    @media print { body { margin: 0; max-width: none; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>LiveChatLens — Consumer Evidence Report</h1>
      <div class="muted">US Chargeback &amp; AI Transparency Record · PII-Redacted · Receipt v${esc(result.receipt.receiptVersion)}</div>
    </div>
    <div class="muted">Captured (UTC): ${esc(generatedIso)}</div>
  </header>

  <section class="meta-grid">
    <div class="meta-item"><strong>Session ID:</strong> <code>${esc(result.receipt.sessionId)}</code></div>
    <div class="meta-item"><strong>Platform Adapter:</strong> <code>${esc(result.receipt.platformId)}</code></div>
    <div class="meta-item"><strong>Verdict:</strong> <code>${esc(result.label)}</code> (${esc(result.evidenceLevel)})</div>
    <div class="meta-item"><strong>Transparency Audit:</strong> <code>${esc(result.transparencyAudit.status)}</code></div>
    <div class="meta-item"><strong>Handoff Friction:</strong> ${result.handoffFriction.detected ? `YES (${esc(result.handoffFriction.requestCount)} requests)` : "None observed"}</div>
    <div class="meta-item"><strong>Coverage:</strong> <code>${esc(result.coverage.status)}</code> (${esc(result.coverage.readableTurns)} turns)</div>
    ${result.receipt.pageUrlRedacted ? `<div class="meta-item" style="grid-column: span 2;"><strong>Sanitized Page URL:</strong> <code>${esc(result.receipt.pageUrlRedacted)}</code></div>` : ""}
  </section>

  <div class="hash-box">
    <div><strong>Transcript &amp; Ledger SHA-256:</strong> ${esc(result.receipt.sha256)}</div>
    ${result.receipt.screenshotSha256 ? `<div><strong>Screenshot PNG SHA-256:</strong> ${esc(result.receipt.screenshotSha256)}</div>` : ""}
    ${result.receipt.combinedSha256 ? `<div><strong>Combined Integrity SHA-256:</strong> ${esc(result.receipt.combinedSha256)}</div>` : ""}
  </div>

  <h2>1. Ready-to-Paste Bank Dispute Statement (${esc(narrativeObj.issuer.toUpperCase())})</h2>
  <div class="narrative-box">
    <div><strong>Subject:</strong> ${esc(narrativeObj.subject)}</div>
    <p style="margin: 8px 0 0;">${esc(narrativeObj.narrative)}</p>
  </div>

  <h2>2. Suggested US Card-Network Dispute Codes</h2>
  <div class="cb-box">${chargebackBlock}</div>

  <h2>3. Flagged Commitments &amp; Merchant Promises (${result.commitments.length})</h2>
  <table>
    <thead><tr><th>Category &amp; Qualifier</th><th>Turn</th><th>Observed Speaker State</th><th>Redacted Excerpt &amp; Guidance</th></tr></thead>
    <tbody>${commitmentRows}</tbody>
  </table>

  <h2>4. Transparency &amp; Escalation Dark Patterns (${result.darkPatterns.length})</h2>
  ${darkPatternRows}

  <h2>5. Observable Evidence Ledger (${result.evidence.length})</h2>
  <table>
    <thead><tr><th>Strength</th><th>Signal Code</th><th>Turns</th><th>Observation</th></tr></thead>
    <tbody>${evidenceRows}</tbody>
  </table>

  <div class="disclaimer">
    <strong>Important Limitations &amp; Non-Legal-Advice Notice:</strong>
    This report records observable browser interface labels, DOM timing, and conversation patterns for personal record-keeping and merchant/card-issuer dispute documentation. US state transparency laws referenced for context (e.g., CA SB 1001, CA AB 1609, Utah Code § 13-77-103, Maine LD 1727, FTC Act § 5) vary by jurisdiction and facts — this report is not legal advice.
    <ul>${result.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
  </div>
</body>
</html>`;
}
