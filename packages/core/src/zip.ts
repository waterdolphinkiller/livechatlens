import type { AnalysisResult } from "./types.js";
import { sha256BytesHex, sha256Hex } from "./hash.js";
import { buildChargebackNarrative, formatDisputeEvidenceHtml } from "./dispute.js";
import type { IssuerProfileId } from "./dispute.js";
import { buildDisputeEvidencePdf } from "./pdf.js";
import { buildRegulatoryComplaintPacket } from "./regulatory.js";
import { formatSanitizedReceiptMarkdown } from "./fusion.js";

// Precomputed CRC-32 table for standard ZIP archive headers
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    crc = (CRC_TABLE[(crc ^ b) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipSafeIso(ts: number): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    return "1970-01-01T00:00:00.000Z";
  }
  return new Date(ts).toISOString();
}

export interface ZipEntryInput {
  name: string;
  data: Uint8Array;
}

/**
 * Pure TypeScript, zero-dependency Store-mode (method 0) ZIP archive creator.
 * Works identically in Chrome MV3 Side Panel, Web Playground, and Node.js.
 */
export function createZipBytes(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const size = data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x5621, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5621, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralSize = centralParts.reduce((acc, p) => acc + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLen = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const part of localParts) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(eocd, pos);
  return out;
}

export interface SealedBundleOptions {
  screenshotBytes?: Uint8Array;
  issuer?: IssuerProfileId;
  tsaTokenBytes?: Uint8Array;
  tsaUrl?: string;
  tsaTimestampUtc?: string;
}

/**
 * Builds a single-file Sealed Evidence ZIP containing:
 *  - receipt.json (verifiable via `livechatlens verify`)
 *  - chargeback-evidence.pdf (bank-upload-ready native PDF 1.4 report)
 *  - chargeback-report.html (printable US Chargeback Report)
 *  - chargeback-narrative.txt (issuer-tailored paste-ready bank dispute statement)
 *  - evidence-receipt.md (Markdown summary)
 *  - screenshot.png (optional captured screenshot)
 *  - timestamp.tsr (optional RFC 3161 TSA token)
 *  - manifest.json (per-file exact binary SHA-256 inventory + bundle seal)
 */
export function buildSealedEvidenceZip(
  result: AnalysisResult,
  options: SealedBundleOptions = {}
): Uint8Array {
  const encoder = new TextEncoder();
  const issuer = options.issuer ?? "generic";
  const narrativeObj = buildChargebackNarrative(result, { issuer });

  const receiptJsonStr = JSON.stringify(
    {
      receipt: result.receipt,
      verdict: result.label,
      evidenceLevel: result.evidenceLevel,
      summary: result.summary,
      transparencyAudit: result.transparencyAudit,
      handoffFriction: result.handoffFriction,
      darkPatterns: result.darkPatterns,
      evidence: result.evidence,
      commitments: result.commitments,
      limitations: result.limitations,
    },
    null,
    2
  );

  const pdfBytes = buildDisputeEvidencePdf(result, {
    issuer,
    tsaTimestampUtc: options.tsaTimestampUtc,
    tsaUrl: options.tsaUrl,
  });
  const reportHtmlStr = formatDisputeEvidenceHtml(result, { issuer });
  const receiptMdStr = formatSanitizedReceiptMarkdown(result);
  const regPack = buildRegulatoryComplaintPacket(result);
  const regulatoryTxtStr = [
    "=== US CFPB CONSUMER COMPLAINT DRAFT ===",
    `Portal: ${regPack.cfpb.portalUrl}`,
    `Suggested Product: ${regPack.cfpb.suggestedProduct}`,
    `Suggested Issue: ${regPack.cfpb.suggestedIssue}`,
    "",
    "What Happened:",
    regPack.cfpb.whatHappened,
    "",
    "Desired Resolution:",
    regPack.cfpb.desiredResolution,
    "",
    "=== CALIFORNIA AG / AB 1609 & SB 1001 TRANSPARENCY NOTICE ===",
    `Portal: ${regPack.californiaAb1609.portalUrl}`,
    "",
    regPack.californiaAb1609.complaintDraft,
    "",
    regPack.nonLegalAdviceNotice,
  ].join("\n");
  const narrativeTxtStr = [
    `Issuer Profile: ${narrativeObj.issuer.toUpperCase()} (${narrativeObj.charCount}/${narrativeObj.maxChars} chars)`,
    `Subject: ${narrativeObj.subject}`,
    `Suggested Card Network Codes: ${narrativeObj.reasonCodes.join(" | ") || "General Consumer Dispute"}`,
    ``,
    narrativeObj.narrative,
    ``,
    narrativeObj.fcbaReminder,
  ].join("\n");

  const coreEntries: ZipEntryInput[] = [
    { name: "receipt.json", data: encoder.encode(receiptJsonStr) },
    { name: "chargeback-evidence.pdf", data: pdfBytes },
    { name: "chargeback-report.html", data: encoder.encode(reportHtmlStr) },
    { name: "chargeback-narrative.txt", data: encoder.encode(narrativeTxtStr) },
    { name: "evidence-receipt.md", data: encoder.encode(receiptMdStr) },
    { name: "regulatory-complaint-pack.txt", data: encoder.encode(regulatoryTxtStr) },
  ];

  if (options.screenshotBytes && options.screenshotBytes.length > 0) {
    coreEntries.push({
      name: "screenshot.png",
      data: options.screenshotBytes,
    });
  }

  if (options.tsaTokenBytes && options.tsaTokenBytes.length > 0) {
    coreEntries.push({
      name: "timestamp.tsr",
      data: options.tsaTokenBytes,
    });
  }

  const fileRecords = coreEntries.map((e) => ({
    file: e.name,
    bytes: e.data.length,
    sha256: sha256BytesHex(e.data),
  }));

  const manifestObj = {
    bundleVersion: "2.0.0",
    tool: "LiveChatLens US",
    issuerProfile: issuer,
    sessionId: result.receipt.sessionId,
    generatedAtUtc: zipSafeIso(result.receipt.generatedAt),
    receiptSha256: result.receipt.sha256,
    combinedSha256: result.receipt.combinedSha256 ?? null,
    rfc3161Anchor:
      options.tsaTokenBytes && options.tsaTokenBytes.length > 0
        ? {
            tsaUrl: options.tsaUrl ?? "external_tsa",
            tokenFile: "timestamp.tsr",
            tokenSha256: sha256BytesHex(options.tsaTokenBytes),
            timestampUtc: options.tsaTimestampUtc ?? null,
          }
        : null,
    files: fileRecords,
    manifestSealSha256: sha256Hex(JSON.stringify(fileRecords)),
  };

  const manifestBytes = encoder.encode(JSON.stringify(manifestObj, null, 2));
  const finalEntries: ZipEntryInput[] = [
    { name: "manifest.json", data: manifestBytes },
    ...coreEntries,
  ];

  return createZipBytes(finalEntries);
}
