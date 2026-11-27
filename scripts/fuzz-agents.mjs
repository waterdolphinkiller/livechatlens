import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  analyzeConversation,
  buildChargebackNarrative,
  buildSealedEvidenceZip,
  formatDisputeEvidenceHtml,
  formatSanitizedReceiptMarkdown,
  parseTranscriptText,
  redactPII,
  verifyEvidenceReceipt,
} from "../packages/core/dist/index.mjs";

// Deterministic PRNG (Mulberry32) so every fuzz failure is 100% reproducible by seed
function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = Number(process.env.LCL_FUZZ_SEED || 20261127);
const rng = createRng(SEED);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (min, max) => min + Math.floor(rng() * (max - min + 1));

const BASE_TS = 1764200000000;
const failures = [];
let maxLatencyMs = 0;

function recordFailure(track, iteration, reason, sample) {
  if (failures.length < 30) {
    failures.push({ track, iteration, reason, sample });
  }
}

function mutateUnicode(str) {
  const invisibles = ["\u200B", "\u200C", "\u200D", "\u00AD", "\u2060", "\u202E", "\u2066"];
  const diacritics = ["\u0301", "\u0300", "\u0308", "\u0302"];
  const homoglyphs = {
    A: "\u0410",
    a: "\u0430",
    E: "\u0415",
    e: "\u0435",
    I: "\u0406",
    i: "\u0456",
    O: "\u041E",
    o: "\u03BF",
    C: "\u0421",
    c: "\u0441",
    P: "\u0420",
    p: "\u0440",
    s: "\u0455",
    y: "\u0443",
  };
  let out = "";
  for (const ch of str) {
    let c = ch;
    if (homoglyphs[c] && rng() < 0.25) {
      c = homoglyphs[c];
    }
    out += c;
    if (/[a-zA-Z]/.test(ch) && rng() < 0.12) {
      out += pick(diacritics);
    }
    if (/[a-zA-Z]/.test(ch) && rng() < 0.12) {
      out += pick(invisibles);
    }
  }
  return out;
}

function toFullwidthDigits(s) {
  return s.replace(/\d/g, (d) => String.fromCharCode(0xff10 + Number(d)));
}

function extractZipManifest(zipBytes) {
  const buf = Buffer.from(zipBytes);
  const start = buf.indexOf(Buffer.from("manifest.json"));
  if (start === -1) return null;
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

// ============================================================================
// TRACK 1: 300x Unicode / BiDi / Diacritic / Homoglyph Obfuscation Fuzzer
// ============================================================================
let t1Pass = 0;
const T1_TOTAL = 300;
const aiPhrases = [
  "Hi! I am an AI assistant here to help.",
  "Hello, you are chatting with our virtual assistant today.",
  "This chat is powered by AI to answer your questions.",
  "I'm your automated support bot.",
];
const commitPhrases = [
  "We guarantee a full refund for your order.",
  "We have approved your refund within 3 business days.",
  "We will waive the cancellation fee today.",
  "We can override policy and issue a one-time courtesy credit.",
];

for (let i = 0; i < T1_TOTAL; i++) {
  const aiText = mutateUnicode(pick(aiPhrases));
  const cmText = mutateUnicode(pick(commitPhrases));
  const t0 = performance.now();
  const res = analyzeConversation({
    sessionId: `fuzz-t1-${i}`,
    platformId: "generic_dom",
    adapterId: "fuzz-v1",
    startedAt: BASE_TS,
    turns: [
      { id: "t1", role: "assistant", text: `${aiText} ${cmText}`, timestamp: BASE_TS + 1000 },
    ],
    observedEvents: [],
    coverage: { status: "full", readableTurns: 1 },
  });
  const dt = performance.now() - t0;
  if (dt > maxLatencyMs) maxLatencyMs = dt;

  if (res.label === "AI_DISCLOSED" && res.commitments.length >= 1) {
    t1Pass++;
  } else {
    recordFailure("T1_UnicodeObfuscation", i, `label=${res.label}, cm=${res.commitments.length}`, `${aiText} ${cmText}`);
  }
}

// ============================================================================
// TRACK 2: 300x US PII Zero-Leakage End-to-End Fuzzer
// ============================================================================
let t2Pass = 0;
const T2_TOTAL = 300;
for (let i = 0; i < T2_TOTAL; i++) {
  const ssnA = String(randInt(101, 665));
  const ssnB = String(randInt(10, 99));
  const ssnC = String(randInt(1001, 9999));
  const ssnSep = pick(["-", " ", "."]);
  let ssnRaw = `${ssnA}${ssnSep}${ssnB}${ssnSep}${ssnC}`;
  if (rng() < 0.25) ssnRaw = `${ssnA}\u200B${ssnSep}${ssnB}${ssnSep}${ssnC}`;
  if (rng() < 0.25) ssnRaw = toFullwidthDigits(ssnRaw);

  const emailRaw = `user${randInt(100, 999)}.test@usbank-demo.org`;
  const acctDigits = String(randInt(10000000, 99999999));
  const secretToken = `tok_${randInt(100000, 999999)}_xyz`;
  const urlRaw = rng() < 0.5
    ? `https://merchant.example.com/chat?session=${secretToken}&user=${emailRaw}`
    : `https://merchant.example.com/chat#access_token=${secretToken}`;
  const cardRaw = rng() < 0.5
    ? `4111-2222-3333-${randInt(1000, 9999)}`
    : `3782.${randInt(100000, 999999)}.${randInt(10000, 99999)}`;

  const res = analyzeConversation({
    sessionId: `sess-${emailRaw}-${ssnRaw}`,
    platformId: "generic_dom",
    adapterId: "fuzz-v1",
    pageUrl: urlRaw,
    startedAt: BASE_TS,
    turns: [
      {
        id: "t1",
        role: "assistant",
        text: `We approved your full refund for SSN ${ssnRaw}, Card ${cardRaw}, Account #${acctDigits}, Email ${emailRaw}.`,
        timestamp: BASE_TS + 1000,
      },
    ],
    observedEvents: [],
    coverage: {
      status: "partial",
      readableTurns: 1,
      notes: [`Iframe note leaked ${ssnRaw} and ${emailRaw}`],
    },
  });

  const md = formatSanitizedReceiptMarkdown(res);
  const html = formatDisputeEvidenceHtml(res);
  const narr = buildChargebackNarrative(res).narrative;
  const combined = `${md}\n${html}\n${narr}\n${JSON.stringify(res.receipt)}`;

  const leaked =
    combined.includes(ssnC) && combined.includes(ssnA) ||
    combined.includes(emailRaw) ||
    combined.includes(acctDigits) ||
    combined.includes(secretToken) ||
    combined.includes("4111-2222") ||
    combined.includes("3782.");

  if (!leaked) {
    t2Pass++;
  } else {
    recordFailure("T2_PiiZeroLeak", i, "PII leaked in exported artifact", { ssnRaw, emailRaw, acctDigits, secretToken, cardRaw });
  }
}

// ============================================================================
// TRACK 3: 300x Human 0% False-Positive Rate Property Fuzzer
// ============================================================================
let t3Pass = 0;
const T3_TOTAL = 300;
const humanOpeners = [
  "Hi, I'm Sarah from the Austin support team.",
  "Hey there! Happy to look into that for you.",
  "Thanks for waiting — the AI bot transferred you to me.",
  "Our new Pro Search tool is powered by AI, and I can show you how to toggle it.",
  "Sorry about that, this is an automated bot error we're patching today.",
  "Oh, this is our AI assistant feature in beta — you can disable it in Settings.",
];
const humanDenials = [
  "Unfortunately, we cannot offer a full refund after 30 days.",
  "A full refund is not available for opened final-sale items.",
  "Free cancellation is not included with this basic fare.",
  "We are unable to approve, authorize, or process any kind of full refund for this order.",
  "We do not waive the restocking fee on non-defective returns.",
  "I checked your invoice and your subscription is already active through Friday.",
];

for (let i = 0; i < T3_TOTAL; i++) {
  const res = analyzeConversation({
    sessionId: `fuzz-t3-${i}`,
    platformId: "generic_dom",
    adapterId: "fuzz-v1",
    startedAt: BASE_TS,
    turns: [
      { id: "v1", role: "visitor", text: "Can I get a refund?", timestamp: BASE_TS + 1000 },
      { id: "h1", role: "support_agent", visibleLabel: "Sarah", text: pick(humanOpeners), timestamp: BASE_TS + 12000 },
      { id: "v2", role: "visitor", text: "What about cancellation?", timestamp: BASE_TS + 20000 },
      { id: "h2", role: "support_agent", visibleLabel: "Sarah", text: pick(humanDenials), timestamp: BASE_TS + 35000 },
    ],
    observedEvents: [],
    coverage: { status: "full", readableTurns: 4 },
  });

  const ok =
    res.label !== "AI_DISCLOSED" &&
    res.label !== "MIXED_OR_HYBRID" &&
    res.commitments.length === 0;
  if (ok) {
    t3Pass++;
  } else {
    recordFailure("T3_HumanZeroFPR", i, `label=${res.label}, cm=${res.commitments.length}`, res.commitments);
  }
}

// ============================================================================
// TRACK 4: 250x Cryptographic Verifier & Binary ZIP Integrity Fuzzer
// ============================================================================
let t4Pass = 0;
const T4_TOTAL = 250;
for (let i = 0; i < T4_TOTAL; i++) {
  const pngLen = randInt(16, 128);
  const pngBytes = new Uint8Array(pngLen);
  pngBytes[0] = 0x89; pngBytes[1] = 0x50; pngBytes[2] = 0x4e; pngBytes[3] = 0x47;
  for (let b = 4; b < pngLen; b++) pngBytes[b] = randInt(0, 255);
  const realPngSha = crypto.createHash("sha256").update(pngBytes).digest("hex");

  const res = analyzeConversation(
    {
      sessionId: `fuzz-t4-${i}`,
      platformId: "generic_dom",
      adapterId: "fuzz-v1",
      startedAt: BASE_TS + i * 1000,
      turns: [
        {
          id: "t1",
          role: "assistant",
          text: `I am an AI assistant. We approved your refund of $${randInt(10, 999)} as store credit only.`,
          timestamp: BASE_TS + i * 1000 + 500,
        },
      ],
      observedEvents: [],
      coverage: { status: "full", readableTurns: 1 },
    },
    { screenshotSha256: realPngSha }
  );

  const zipBytes = buildSealedEvidenceZip(res, { screenshotBytes: pngBytes });
  const manifest = extractZipManifest(zipBytes);
  const pngEntry = manifest?.files?.find((f) => f.file === "screenshot.png");

  const doc = JSON.parse(
    JSON.stringify({
      receipt: res.receipt,
      verdict: res.label,
      evidenceLevel: res.evidenceLevel,
      transparencyAudit: res.transparencyAudit,
      evidence: res.evidence,
      darkPatterns: res.darkPatterns,
      commitments: res.commitments,
    })
  );
  const vValid = verifyEvidenceReceipt(doc);

  // Apply 1 random tamper mutation
  const tampered = JSON.parse(JSON.stringify(doc));
  const mode = i % 5;
  if (mode === 0) tampered.commitments[0].qualifier = "unconditional";
  else if (mode === 1) tampered.receipt.verdict = "HUMAN_AGENT_INDICATED";
  else if (mode === 2) delete tampered.receipt.combinedSha256;
  else if (mode === 3) tampered.receipt.commitmentCount = 99;
  else tampered.evidence[0].explanation += ".";

  const vTampered = verifyEvidenceReceipt(
    tampered,
    mode === 2 ? { screenshotData: "FORGED" } : {}
  );

  if (
    pngEntry?.sha256 === realPngSha &&
    vValid.status === "VALID" &&
    vTampered.status === "TAMPERED"
  ) {
    t4Pass++;
  } else {
    recordFailure("T4_CryptoZipFuzz", i, `pngOk=${pngEntry?.sha256 === realPngSha}, valid=${vValid.status}, tampered=${vTampered.status}, mode=${mode}`);
  }
}

// ============================================================================
// TRACK 5: 200x Malformed / XSS / ReDoS Chaos Fuzzer
// ============================================================================
let t5Pass = 0;
const T5_TOTAL = 200;
const chaosPayloads = [
  "",
  "   \n\t\r  ",
  "a".repeat(25000),
  "1".repeat(25000),
  "https://evil.example.com/?" + "a".repeat(15000) + "=1",
  "<script>alert(1)</script><img src=x onerror=alert(2)>",
  "We are unable to " + "approve, ".repeat(500) + "full refund",
  "🚀💥🔥\u202E\u2066\u0000\uFFFF",
];

for (let i = 0; i < T5_TOTAL; i++) {
  const payload = i < chaosPayloads.length
    ? chaosPayloads[i]
    : pick(chaosPayloads) + " " + mutateUnicode("refund $99 " + randInt(1, 999999));

  const t0 = performance.now();
  let ok = true;
  try {
    const parsed = parseTranscriptText(payload);
    const res = analyzeConversation({
      sessionId: `<img src=x onerror=alert(${i})>`,
      platformId: "generic_dom",
      adapterId: "chaos-v1",
      startedAt: i % 7 === 0 ? Number.NaN : BASE_TS,
      turns: parsed.turns.length > 0
        ? parsed.turns
        : [{ id: "t1", role: "unknown", text: payload, timestamp: i % 5 === 0 ? Number.NaN : BASE_TS }],
      observedEvents: [],
      coverage: { status: "full", readableTurns: 1 },
    });
    const html = formatDisputeEvidenceHtml(res);
    buildChargebackNarrative(res);
    buildSealedEvidenceZip(res);
    if (html.includes("<script>alert(") || html.includes("<img src=x onerror=")) {
      ok = false;
      recordFailure("T5_ChaosFuzz", i, "Unescaped XSS in HTML output");
    }
    const vBad = verifyEvidenceReceipt(i % 2 === 0 ? null : { receipt: { sha256: "x" }, evidence: [null], commitments: [] });
    if (vBad.status !== "INVALID_FORMAT") {
      ok = false;
      recordFailure("T5_ChaosFuzz", i, `Expected INVALID_FORMAT, got ${vBad.status}`);
    }
  } catch (err) {
    ok = false;
    recordFailure("T5_ChaosFuzz", i, `Uncaught error: ${err?.message || err}`);
  }
  const dt = performance.now() - t0;
  if (dt > maxLatencyMs) maxLatencyMs = dt;
  if (dt > 150) {
    ok = false;
    recordFailure("T5_ChaosFuzz", i, `Potential ReDoS / slow execution: ${dt.toFixed(1)}ms`);
  }
  if (ok) t5Pass++;
}

// ============================================================================
// TRACK 6: 150x US Semantic Qualifier Combinatorial Fuzzer
// ============================================================================
let t6Pass = 0;
const T6_TOTAL = 150;
const scTraps = [
  "We are unable to issue cash, however we can issue a $45 store credit.",
  "We have approved your refund as future travel credit.",
  "We have approved your refund as merchandise credit.",
  "Your full refund will be issued as loyalty points only.",
  "We approved your refund via store credit.",
];
const condTraps = [
  "We have approved your refund, pending warehouse verification.",
  "We have approved your refund minus a $15 return shipping fee.",
  "We have approved your refund — eligible for partial refund only.",
  "Your full refund is approved subject to inspection of the returned box.",
];

for (let i = 0; i < T6_TOTAL; i++) {
  const isSc = i % 2 === 0;
  const text = isSc ? pick(scTraps) : pick(condTraps);
  const res = analyzeConversation({
    sessionId: `fuzz-t6-${i}`,
    platformId: "generic_dom",
    adapterId: "fuzz-v1",
    startedAt: BASE_TS,
    turns: [{ id: "t1", role: "assistant", text, timestamp: BASE_TS + 1000 }],
    observedEvents: [],
    coverage: { status: "full", readableTurns: 1 },
  });
  const expectedQual = isSc ? "store_credit_only" : "conditional";
  const ok =
    res.commitments.length >= 1 &&
    res.commitments[0].qualifier === expectedQual;
  if (ok) {
    t6Pass++;
  } else {
    recordFailure("T6_UsQualifierFuzz", i, `expected=${expectedQual}, got=${res.commitments[0]?.qualifier ?? "none"}`, text);
  }
}

const totalCases = T1_TOTAL + T2_TOTAL + T3_TOTAL + T4_TOTAL + T5_TOTAL + T6_TOTAL;
const totalPassed = t1Pass + t2Pass + t3Pass + t4Pass + t5Pass + t6Pass;

const report = {
  suite: "LiveChatLens Fuzzing & Mutation Multi-Agent Engine (v1.4.0-US)",
  seed: SEED,
  totalCases,
  totalPassed,
  totalFailed: totalCases - totalPassed,
  passRate: `${((totalPassed / totalCases) * 100).toFixed(2)}%`,
  maxLatencyMs: Number(maxLatencyMs.toFixed(2)),
  tracks: {
    "T1 · Unicode/BiDi/Homoglyph Mutation (300)": `${t1Pass}/${T1_TOTAL}`,
    "T2 · US PII Zero-Leakage E2E (300)": `${t2Pass}/${T2_TOTAL}`,
    "T3 · Human 0% FPR Property (300)": `${t3Pass}/${T3_TOTAL}`,
    "T4 · Crypto Verifier & Binary ZIP (250)": `${t4Pass}/${T4_TOTAL}`,
    "T5 · Chaos / XSS / ReDoS Resilience (200)": `${t5Pass}/${T5_TOTAL}`,
    "T6 · US Semantic Qualifier Combinatorics (150)": `${t6Pass}/${T6_TOTAL}`,
  },
  sampleFailures: failures.slice(0, 10),
};

console.log(JSON.stringify(report, null, 2));
if (totalPassed < totalCases) {
  process.exitCode = 1;
}
