import type {
  CommitmentFlag,
  DarkPatternFlag,
  EvidenceItem,
  EvidenceLevel,
  EvidenceReceipt,
  HandoffFrictionReport,
  TransparencyAudit,
  VerdictLabel,
} from "./types.js";
import { sha256Hex } from "./hash.js";

export interface ExportedReceiptDocument {
  receipt: EvidenceReceipt;
  verdict?: VerdictLabel;
  label?: VerdictLabel;
  evidenceLevel?: EvidenceLevel;
  summary?: string;
  transparencyAudit?: TransparencyAudit;
  handoffFriction?: HandoffFrictionReport;
  evidence: EvidenceItem[];
  darkPatterns?: DarkPatternFlag[];
  commitments: CommitmentFlag[];
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface VerificationResult {
  status: "VALID" | "TAMPERED" | "INVALID_FORMAT";
  expectedSha256?: string;
  recomputedSha256?: string;
  combinedValid?: boolean;
  checks: VerificationCheck[];
  summary: string;
}

function isObjectRecord(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Independently recomputes the canonical SHA-256 digest of an exported LiveChatLens
 * Evidence Receipt JSON (and optional screenshot string/dataUrl) to detect any 1-byte tampering.
 */
export function verifyEvidenceReceipt(
  doc: ExportedReceiptDocument,
  options: { screenshotData?: string } = {}
): VerificationResult {
  const checks: VerificationCheck[] = [];

  if (
    !doc ||
    typeof doc !== "object" ||
    !doc.receipt ||
    typeof doc.receipt !== "object" ||
    typeof doc.receipt.sha256 !== "string" ||
    !Array.isArray(doc.evidence) ||
    !Array.isArray(doc.commitments) ||
    (doc.darkPatterns !== undefined && !Array.isArray(doc.darkPatterns))
  ) {
    return {
      status: "INVALID_FORMAT",
      checks: [
        {
          name: "schema_structure",
          passed: false,
          detail: "Missing required receipt, evidence, or commitments fields.",
        },
      ],
      summary: "Invalid receipt format — cannot verify cryptographic integrity.",
    };
  }

  const darkPatterns = doc.darkPatterns ?? [];
  if (
    !doc.evidence.every((e) => isObjectRecord(e)) ||
    !doc.commitments.every((c) => isObjectRecord(c)) ||
    !darkPatterns.every((d) => isObjectRecord(d))
  ) {
    return {
      status: "INVALID_FORMAT",
      checks: [
        {
          name: "schema_structure",
          passed: false,
          detail: "Malformed null or non-object entry inside evidence, commitments, or darkPatterns.",
        },
      ],
      summary: "Invalid receipt format — array entries must be valid objects.",
    };
  }

  checks.push({
    name: "schema_structure",
    passed: true,
    detail: `Receipt v${doc.receipt.receiptVersion} for session "${doc.receipt.sessionId}".`,
  });

  const topVerdict = doc.verdict ?? doc.label;
  const verdict = topVerdict ?? doc.receipt.verdict;
  const evidenceLevel = doc.evidenceLevel ?? doc.receipt.evidenceLevel;
  const transparencyStatus =
    doc.transparencyAudit?.status ?? doc.receipt.transparencyStatus;

  const headerConsistent =
    (topVerdict === undefined || topVerdict === doc.receipt.verdict) &&
    (doc.evidenceLevel === undefined || doc.evidenceLevel === doc.receipt.evidenceLevel) &&
    (doc.transparencyAudit?.status === undefined ||
      doc.transparencyAudit.status === doc.receipt.transparencyStatus) &&
    (doc.receipt.evidenceCount === undefined || doc.receipt.evidenceCount === doc.evidence.length) &&
    (doc.receipt.commitmentCount === undefined || doc.receipt.commitmentCount === doc.commitments.length) &&
    (doc.receipt.darkPatternCount === undefined || doc.receipt.darkPatternCount === darkPatterns.length);

  checks.push({
    name: "header_consistency",
    passed: headerConsistent,
    detail: headerConsistent
      ? "Top-level verdict, evidenceLevel, and transparencyStatus match receipt header."
      : "TAMPER DETECTED: Top-level fields conflict with receipt header fields.",
  });

  const isV14 = doc.receipt.receiptVersion === "1.4.0";
  const canonicalPayload = isV14
    ? JSON.stringify({
        receiptVersion: doc.receipt.receiptVersion,
        generatedAt: doc.receipt.generatedAt,
        sessionId: doc.receipt.sessionId,
        platformId: doc.receipt.platformId,
        pageUrlRedacted: doc.receipt.pageUrlRedacted ?? "",
        verdict,
        evidenceLevel,
        transparencyStatus,
        evidence: doc.evidence.map((e) => ({
          code: e.code,
          direction: e.direction,
          strength: e.strength,
          observedAt: e.observedAt,
          turnIds: e.turnIds,
          excerptRedacted: e.excerptRedacted ?? "",
          explanation: e.explanation,
        })),
        darkPatterns: darkPatterns.map((d) => ({
          code: d.code,
          turnIds: d.turnIds,
          explanation: d.explanation,
        })),
        commitments: doc.commitments.map((c) => ({
          turnId: c.turnId,
          observedAt: c.observedAt,
          category: c.category,
          qualifier: c.qualifier,
          speakerStateAtTurn: c.speakerStateAtTurn,
          excerptRedacted: c.excerptRedacted,
          riskNote: c.riskNote,
        })),
      })
    : JSON.stringify({
        receiptVersion: doc.receipt.receiptVersion,
        generatedAt: doc.receipt.generatedAt,
        sessionId: doc.receipt.sessionId,
        platformId: doc.receipt.platformId,
        pageUrlRedacted: doc.receipt.pageUrlRedacted ?? "",
        verdict,
        evidenceLevel,
        transparencyStatus,
        evidence: doc.evidence.map((e) => ({
          code: e.code,
          direction: e.direction,
          strength: e.strength,
          observedAt: e.observedAt,
          turnIds: e.turnIds,
          excerptRedacted: e.excerptRedacted ?? "",
        })),
        darkPatterns: darkPatterns.map((d) => ({
          code: d.code,
          turnIds: d.turnIds,
        })),
        commitments: doc.commitments.map((c) => ({
          turnId: c.turnId,
          category: c.category,
          speakerStateAtTurn: c.speakerStateAtTurn,
          excerptRedacted: c.excerptRedacted,
        })),
      });

  const recomputedSha256 = sha256Hex(canonicalPayload);
  const transcriptMatch = recomputedSha256 === doc.receipt.sha256;

  checks.push({
    name: "transcript_sha256",
    passed: transcriptMatch,
    detail: transcriptMatch
      ? `Transcript & ledger SHA-256 verified (${recomputedSha256.slice(0, 16)}…).`
      : `HASH MISMATCH: expected ${doc.receipt.sha256.slice(0, 16)}…, recomputed ${recomputedSha256.slice(0, 16)}….`,
  });

  let combinedValid: boolean | undefined;
  const hasCombined = Boolean(doc.receipt.combinedSha256);
  const hasScreenshotHash = Boolean(doc.receipt.screenshotSha256);

  if (hasCombined !== hasScreenshotHash) {
    combinedValid = false;
    checks.push({
      name: "combined_sha256",
      passed: false,
      detail: "Incomplete screenshot seal — screenshotSha256 and combinedSha256 must both be present.",
    });
  } else if (hasCombined && hasScreenshotHash) {
    const recomputedCombined = sha256Hex(
      `${recomputedSha256}:${doc.receipt.screenshotSha256}`
    );
    combinedValid = recomputedCombined === doc.receipt.combinedSha256;
    checks.push({
      name: "combined_sha256",
      passed: combinedValid,
      detail: combinedValid
        ? "Combined transcript + screenshot SHA-256 seal verified."
        : "Combined SHA-256 seal mismatch — screenshot or transcript binding was altered.",
    });

    if (options.screenshotData !== undefined) {
      const actualPngHash = sha256Hex(options.screenshotData);
      const pngMatch = actualPngHash === doc.receipt.screenshotSha256;
      if (!pngMatch) combinedValid = false;
      checks.push({
        name: "screenshot_bytes_sha256",
        passed: pngMatch,
        detail: pngMatch
          ? "Provided screenshot matches recorded screenshotSha256."
          : "Provided screenshot does NOT match recorded screenshotSha256.",
      });
    }
  } else if (options.screenshotData !== undefined) {
    combinedValid = false;
    checks.push({
      name: "screenshot_binding_missing",
      passed: false,
      detail: "Screenshot data was supplied, but receipt has no screenshotSha256 / combinedSha256 seal.",
    });
  }

  const allPassed = checks.every((c) => c.passed);
  return {
    status: allPassed ? "VALID" : "TAMPERED",
    expectedSha256: doc.receipt.sha256,
    recomputedSha256,
    combinedValid,
    checks,
    summary: allPassed
      ? "VALID — Cryptographic SHA-256 seal matches; no post-capture tampering detected."
      : "TAMPERED — One or more fields or hashes were modified after capture.",
  };
}
