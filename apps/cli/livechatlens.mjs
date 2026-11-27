#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  analyzeConversation,
  buildDisputeEvidencePdf,
  buildRegulatoryComplaintPacket,
  buildSealedEvidenceZip,
  formatDisputeEvidenceHtml,
  formatSanitizedReceiptMarkdown,
  parseTranscriptText,
  verifyEvidenceReceipt,
} from "../../packages/core/dist/index.mjs";

function printHelp() {
  console.log(`LiveChatLens CLI v2.0.0-US — Local-First Live-Chat AI Transparency, CA AB 1609 & Chargeback Evidence Auditor

Usage:
  node apps/cli/livechatlens.mjs <transcript.txt|session.json> [options]
  node apps/cli/livechatlens.mjs verify <receipt.json>
  node apps/cli/livechatlens.mjs ab1609 <transcript.txt|session.json> [gate options]

Options:
  --format <json|markdown|html|pdf|zip|regulatory>  Output format (default: json)
  --issuer <generic|chase|amex|citi|capital_one>    US card issuer template (default: generic)
  --out <path>                                      Write report, PDF, or sealed ZIP to file
  --fail-on-dark-patterns                           Exit with code 2 if any dark pattern is detected
  --fail-on-late-disclosure                         Exit with code 2 if AI is disclosed late or undisclosed
  --fail-on-store-credit-trap                       Exit with code 2 if store_credit_only or policy_exception is flagged
  --fail-on-commitment                              Exit with code 2 if any high-stakes commitment is flagged
  --help                                            Show this help message
`);
}

function loadSession(inputPath) {
  const raw = fs.readFileSync(inputPath, "utf8");
  return inputPath.toLowerCase().endsWith(".json")
    ? JSON.parse(raw)
    : parseTranscriptText(raw, {
        sessionId: `cli-${path.basename(inputPath, path.extname(inputPath))}`,
      });
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

// Subcommand 1: verify <receipt.json>
if (args[0] === "verify") {
  const receiptPath = args[1];
  if (!receiptPath || !fs.existsSync(receiptPath)) {
    console.error(`Error: Receipt JSON file not found: ${receiptPath || "(none)"}`);
    process.exit(1);
  }
  const doc = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const vRes = verifyEvidenceReceipt(doc);
  console.log(JSON.stringify(vRes, null, 2));
  process.exit(vRes.status === "VALID" ? 0 : 2);
}

// Subcommand 2: ab1609 <input> (California AB 1609 / SB 1001 B2B CI Compliance Gate)
if (args[0] === "ab1609") {
  const inputPath = args[1];
  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath || "(none)"}`);
    process.exit(1);
  }
  const failDark = args.includes("--fail-on-dark-patterns") || args.includes("--fail-on-dark-pattern");
  const failLate = args.includes("--fail-on-late-disclosure");
  const failTrap = args.includes("--fail-on-store-credit-trap");
  const session = loadSession(inputPath);
  const result = analyzeConversation(session, { generatedAt: Date.now() });
  const violations = [];

  if (failDark && result.darkPatterns.length > 0) {
    violations.push(`darkPatterns=${result.darkPatterns.map((d) => d.code).join(",")}`);
  }
  if (
    failLate &&
    (result.transparencyAudit.status === "disclosed_late" ||
      result.transparencyAudit.status === "not_disclosed")
  ) {
    violations.push(`transparency=${result.transparencyAudit.status}`);
  }
  if (
    failTrap &&
    result.commitments.some(
      (c) => c.qualifier === "store_credit_only" || c.category === "policy_exception"
    )
  ) {
    violations.push("store_credit_or_policy_exception_trap");
  }

  const gateReport = {
    gate: "LiveChatLens CA AB 1609 / US Chatbot Compliance Gate (v2.0.0-US)",
    input: inputPath,
    status: violations.length === 0 ? "PASS" : "FAIL",
    verdict: result.label,
    transparencyStatus: result.transparencyAudit.status,
    handoffFrictionDetected: result.handoffFriction.detected,
    darkPatterns: result.darkPatterns.map((d) => d.code),
    commitments: result.commitments.map((c) => `${c.category}:${c.qualifier}`),
    violations,
    receiptSha256: result.receipt.sha256,
  };
  console.log(JSON.stringify(gateReport, null, 2));
  process.exit(violations.length === 0 ? 0 : 2);
}

let inputPath = "";
let format = "json";
let issuer = "generic";
let outPath = "";
let failOnDarkPattern = false;
let failOnLateDisclosure = false;
let failOnCommitment = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--format" && args[i + 1]) {
    format = args[++i];
  } else if (arg === "--issuer" && args[i + 1]) {
    issuer = args[++i];
  } else if (arg === "--out" && args[i + 1]) {
    outPath = args[++i];
  } else if (arg === "--fail-on-dark-pattern" || arg === "--fail-on-dark-patterns") {
    failOnDarkPattern = true;
  } else if (arg === "--fail-on-late-disclosure") {
    failOnLateDisclosure = true;
  } else if (arg === "--fail-on-commitment") {
    failOnCommitment = true;
  } else if (!arg.startsWith("-")) {
    inputPath = arg;
  }
}

if (!inputPath || !fs.existsSync(inputPath)) {
  console.error(`Error: Input file not found: ${inputPath || "(none)"}`);
  process.exit(1);
}

const session = loadSession(inputPath);
const result = analyzeConversation(session, { generatedAt: Date.now() });

if (format === "zip") {
  const zipTarget = outPath || `livechatlens-sealed-${result.receipt.sessionId}.zip`;
  const zipBytes = buildSealedEvidenceZip(result, { issuer });
  fs.mkdirSync(path.dirname(path.resolve(zipTarget)), { recursive: true });
  fs.writeFileSync(zipTarget, zipBytes);
  console.log(`Wrote Sealed Evidence ZIP to ${zipTarget} (${zipBytes.length} bytes, SHA-256: ${result.receipt.sha256})`);
} else if (format === "pdf") {
  const pdfTarget = outPath || `livechatlens-chargeback-${result.receipt.sessionId}.pdf`;
  const pdfBytes = buildDisputeEvidencePdf(result, { issuer });
  fs.mkdirSync(path.dirname(path.resolve(pdfTarget)), { recursive: true });
  fs.writeFileSync(pdfTarget, pdfBytes);
  console.log(`Wrote Bank-Ready PDF to ${pdfTarget} (${pdfBytes.length} bytes, SHA-256: ${result.receipt.sha256})`);
} else {
  let rendered;
  if (format === "markdown" || format === "md") {
    rendered = formatSanitizedReceiptMarkdown(result);
  } else if (format === "html") {
    rendered = formatDisputeEvidenceHtml(result, { issuer });
  } else if (format === "regulatory") {
    rendered = JSON.stringify(buildRegulatoryComplaintPacket(result), null, 2);
  } else {
    rendered = JSON.stringify(result, null, 2);
  }

  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, rendered, "utf8");
    console.log(`Wrote ${format} report to ${outPath} (SHA-256: ${result.receipt.sha256})`);
  } else {
    console.log(rendered);
  }
}

const violations = [];
if (failOnDarkPattern && result.darkPatterns.length > 0) {
  violations.push(`darkPatterns=${result.darkPatterns.map((d) => d.code).join(",")}`);
}
if (
  failOnLateDisclosure &&
  (result.transparencyAudit.status === "disclosed_late" ||
    result.transparencyAudit.status === "not_disclosed")
) {
  violations.push(`transparency=${result.transparencyAudit.status}`);
}
if (failOnCommitment && result.commitments.length > 0) {
  violations.push(`commitments=${result.commitments.map((c) => c.category).join(",")}`);
}

if (violations.length > 0) {
  console.error(`LiveChatLens CI Gate FAILED: ${violations.join(" | ")}`);
  process.exit(2);
}
