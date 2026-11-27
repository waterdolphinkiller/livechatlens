
import { buildChargebackNarrative } from "./dispute.mjs";


function toPdfAscii(input){
  return String(input ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00B7/g, "|")
    .replace(/\u00A7/g, "Sec.")
    .replace(/[^\x20-\x7E]/g, "?");
}

function escapePdfString(str){
  return toPdfAscii(str)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(text, maxChars){
  const clean = toPdfAscii(text).replace(/\s+/g, " ").trim();
  if (!clean) return [""];
  const words = clean.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += maxChars) {
        lines.push(word.slice(i, i + maxChars));
      }
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function pdfSafeIso(ts){
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    return "1970-01-01T00:00:00.000Z";
  }
  return new Date(ts).toISOString();
}


/**
 * Pure TypeScript, zero-dependency PDF 1.4 binary generator for US Credit Card
 * Chargeback & AI Transparency Evidence Reports.
 * Works identically in Chrome MV3 Side Panel, Web Playground, and Node.js.
 */
export function buildDisputeEvidencePdf(
  result,
  options = {}){
  const narrativeObj = buildChargebackNarrative(result, {
    issuer: options.issuer ?? "generic",
  });
  const ops = [];

  function pushHeading(title){
    ops.push({ font: "F2", size: 11.5, text: title, x: 48, spaceAfter: 8, ruleAbove: true });
  };
  function pushBody(text, indent = 48, maxChars = 88){
    const wrapped = wrapText(text, maxChars);
    for (let i = 0; i < wrapped.length; i++) {
      ops.push({
        font: "F1",
        size: 9.8,
        text: wrapped[i] ?? "",
        x: indent,
        spaceAfter: i === wrapped.length - 1 ? 6 : 3,
      });
    }
  };
  function pushMono(text, indent = 48){
    const wrapped = wrapText(text, 80);
    for (let i = 0; i < wrapped.length; i++) {
      ops.push({
        font: "F3",
        size: 8.5,
        text: wrapped[i] ?? "",
        x: indent,
        spaceAfter: i === wrapped.length - 1 ? 5 : 2,
      });
    }
  };

  // Document Title Header
  ops.push({
    font: "F2",
    size: 15,
    text: "LIVECHATLENS - US CHARGEBACK & AI TRANSPARENCY EVIDENCE REPORT",
    x: 48,
    spaceAfter: 5,
  });
  ops.push({
    font: "F1",
    size: 9,
    text: `PII-Redacted Tamper-Evident Record | Receipt v${result.receipt.receiptVersion} | Captured (UTC): ${pdfSafeIso(result.receipt.generatedAt)}`,
    x: 48,
    spaceAfter: 12,
  });

  // Session Metadata
  pushHeading("1. SESSION METADATA & OBSERVABLE VERDICT");
  pushBody(`Session ID: ${result.receipt.sessionId}   |   Platform Adapter: ${result.receipt.platformId}`);
  pushBody(`Verdict: ${result.label} (Evidence Level: ${result.evidenceLevel})   |   Transparency Audit: ${result.transparencyAudit.status}`);
  pushBody(
    `Handoff Friction: ${result.handoffFriction.detected ? `YES (${result.handoffFriction.requestCount} requests)` : "None observed"}   |   Coverage: ${result.coverage.status} (${result.coverage.readableTurns} turns)`
  );
  if (result.receipt.pageUrlRedacted) {
    pushBody(`Sanitized Page URL: ${result.receipt.pageUrlRedacted}`);
  }

  // Cryptographic Integrity Seal
  pushHeading("2. CRYPTOGRAPHIC INTEGRITY SEAL (SHA-256)");
  pushMono(`Transcript & Ledger SHA-256: ${result.receipt.sha256}`);
  if (result.receipt.screenshotSha256) {
    pushMono(`Screenshot PNG SHA-256:      ${result.receipt.screenshotSha256}`);
  }
  if (result.receipt.combinedSha256) {
    pushMono(`Combined Integrity SHA-256:  ${result.receipt.combinedSha256}`);
  }
  if (options.tsaTimestampUtc) {
    pushMono(
      `RFC 3161 TSA Anchor:         ${options.tsaTimestampUtc} (${options.tsaUrl ?? "external TSA"})`
    );
  }

  // Bank Dispute Narrative
  pushHeading(`3. READY-TO-PASTE BANK DISPUTE STATEMENT (${narrativeObj.issuer.toUpperCase()})`);
  pushBody(`Subject: ${narrativeObj.subject}`);
  pushBody(narrativeObj.narrative);
  pushBody(`Suggested Card Network Codes: ${narrativeObj.reasonCodes.join(" ; ") || "General Consumer Dispute"}`);
  pushBody(narrativeObj.fcbaReminder);

  // Flagged Commitments
  pushHeading(`4. FLAGGED COMMITMENTS & MERCHANT PROMISES (${result.commitments.length})`);
  if (result.commitments.length === 0) {
    pushBody("No high-stakes refund, cancellation, pricing, or deadline commitments flagged.");
  } else {
    for (const cm of result.commitments) {
      pushBody(
        `- [${cm.category} | ${cm.qualifier}] Turn ${cm.turnId} (${cm.speakerStateAtTurn}): "${cm.excerptRedacted}"`,
        52,
        84
      );
      pushBody(`  Guidance: ${cm.riskNote}`, 58, 80);
    }
  }

  // Dark Patterns
  pushHeading(`5. TRANSPARENCY & ESCALATION DARK PATTERNS (${result.darkPatterns.length})`);
  if (result.darkPatterns.length === 0) {
    pushBody("None observed.");
  } else {
    for (const dp of result.darkPatterns) {
      pushBody(`- [${dp.code}] ${dp.explanation}`, 52, 84);
    }
  }

  // Evidence Ledger
  pushHeading(`6. OBSERVABLE EVIDENCE LEDGER (${result.evidence.length})`);
  if (result.evidence.length === 0) {
    pushBody("No direct or strong observable evidence recorded.");
  } else {
    for (const ev of result.evidence) {
      pushBody(
        `- [${ev.strength.toUpperCase()}] ${ev.code} (${ev.turnIds.join(", ") || "session"}): ${ev.explanation}`,
        52,
        84
      );
    }
  }

  // Limitations & Non-Legal-Advice Notice
  pushHeading("7. LIMITATIONS & NON-LEGAL-ADVICE NOTICE");
  pushBody(
    "This report records observable browser interface labels, DOM timing, and conversation patterns for personal record-keeping and credit card dispute documentation. US state laws referenced for context (e.g., CA SB 1001, CA AB 1609, Utah Code Sec. 13-77-103, Maine LD 1727, FTC Act Sec. 5) vary by jurisdiction and facts. This report is not legal advice."
  );
  for (const lim of result.limitations) {
    pushBody(`- ${lim}`, 52, 84);
  }

  // Paginate onto US Letter (612 x 792 pt)
  const pageStreams = [];
  let cmds = [];
  let y = 744;

  function flushPage(){
    const pageNum = pageStreams.length + 1;
    cmds.push(`BT /F1 8 Tf 48 28 Td (Generated locally by LiveChatLens US - Zero-upload PII-redacted evidence | Page ${pageNum}) Tj ET`);
    pageStreams.push(cmds.join("\n"));
    cmds = [];
    y = 744;
  };

  for (const op of ops) {
    const needed = op.size + op.spaceAfter + (op.ruleAbove ? 12 : 0);
    if (y - needed < 52) {
      flushPage();
    }
    if (op.ruleAbove) {
      y -= 6;
      cmds.push(`0.82 0.85 0.90 RG 0.6 w 48 ${y.toFixed(1)} m 564 ${y.toFixed(1)} l S 0 0 0 RG`);
      y -= 12;
    }
    cmds.push(`BT /${op.font} ${op.size.toFixed(1)} Tf ${op.x} ${y.toFixed(1)} Td (${escapePdfString(op.text)}) Tj ET`);
    y -= op.size + op.spaceAfter;
  }
  if (cmds.length > 0 || pageStreams.length === 0) {
    flushPage();
  }

  // Assemble PDF 1.4 objects
  // Object 1: Catalog, Object 2: Pages, Object 3: F1 Helvetica, Object 4: F2 Helvetica-Bold, Object 5: F3 Courier
  // Then for each page i: Content object (6 + i*2) and Page object (7 + i*2)
  const encoder = new TextEncoder();
  const objects = [];
  const pageObjNums = [];

  for (let i = 0; i < pageStreams.length; i++) {
    pageObjNums.push(7 + i * 2);
  }

  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageObjNums.length} >>\nendobj\n`
  );
  objects.push(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
  objects.push(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);
  objects.push(`5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n`);

  for (let i = 0; i < pageStreams.length; i++) {
    const stream = pageStreams[i] ?? "";
    const streamLen = encoder.encode(stream).length;
    const contentId = 6 + i * 2;
    const pageId = 7 + i * 2;
    objects.push(
      `${contentId} 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
    objects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
    );
  }

  const header = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const parts = [encoder.encode(header)];
  let offset = parts[0].length;
  const offsets = [0];

  for (const objStr of objects) {
    offsets.push(offset);
    const bytes = encoder.encode(objStr);
    parts.push(bytes);
    offset += bytes.length;
  }

  const xrefOffset = offset;
  const xrefLines = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];
  for (let i = 1; i < offsets.length; i++) {
    xrefLines.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  xrefLines.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );
  parts.push(encoder.encode(xrefLines.join("")));

  const totalLen = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
