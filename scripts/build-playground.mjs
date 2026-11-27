import fs from "node:fs";
import path from "node:path";

/**
 * Bundles the compiled zero-dependency @livechatlens/core modules + BENCHMARK_FIXTURES
 * into:
 *   1. apps/extension/core-bundle.js  (Chrome MV3 Side Panel)
 *   2. apps/demo/index.html           (Standalone Web Playground)
 *   3. artifacts/.../livechatlens-playground.html (Canvas preview)
 */
const root = process.cwd();

const orderedModules = [
  "packages/core/dist/hash.mjs",
  "packages/core/dist/sanitizer.mjs",
  "packages/core/dist/parser.mjs",
  "packages/core/dist/signals/disclosure.mjs",
  "packages/core/dist/signals/automation.mjs",
  "packages/core/dist/signals/handoff.mjs",
  "packages/core/dist/signals/timing.mjs",
  "packages/core/dist/signals/style.mjs",
  "packages/core/dist/signals/commitments.mjs",
  "packages/core/dist/signals/defense.mjs",
  "packages/core/dist/fusion.mjs",
  "packages/core/dist/dispute.mjs",
  "packages/core/dist/pdf.mjs",
  "packages/core/dist/regulatory.mjs",
  "packages/core/dist/tsa.mjs",
  "packages/core/dist/verifier.mjs",
  "packages/core/dist/zip.mjs",
  "packages/core/dist/fixtures/conversations/index.mjs",
];

function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/\bexport\s+(?=(?:const|let|var|async\s+function|function)\b)/g, "");
}

const bundledParts = orderedModules.map((rel) => {
  const raw = fs.readFileSync(path.join(root, rel), "utf8");
  return `// --- ${rel} ---\n${stripModuleSyntax(raw)}`;
});

const coreIife = `
window.LiveChatLensCore = (function() {
${bundledParts.join("\n\n")}
  return {
    analyzeConversation,
    formatSanitizedReceiptMarkdown,
    formatDisputeEvidenceHtml,
    ISSUER_PROFILES,
    buildChargebackNarrative,
    buildDisputeEvidencePdf,
    buildRegulatoryComplaintPacket,
    buildRfc3161Request,
    inspectRfc3161Token,
    requestRfc3161Timestamp,
    sha256BytesHex,
    verifyEvidenceReceipt,
    buildSealedEvidenceZip,
    parseTranscriptText,
    redactPII,
    createRedactedExcerpt,
    sha256Hex,
    buildDefensePrompts,
    BENCHMARK_FIXTURES,
  };
})();
`;

// 1. Write Chrome MV3 extension core bundle
const extBundlePath = path.join(root, "apps/extension/core-bundle.js");
fs.mkdirSync(path.dirname(extBundlePath), { recursive: true });
fs.writeFileSync(extBundlePath, coreIife, "utf8");

// 2. Build standalone Web Playground HTML
const templatePath = path.join(root, "apps/demo/template.html");
const template = fs.readFileSync(templatePath, "utf8");
if (!template.includes("/* __LIVECHATLENS_CORE_BUNDLE__ */")) {
  throw new Error("Missing core bundle marker in apps/demo/template.html");
}

const builtHtml = template.replace("/* __LIVECHATLENS_CORE_BUNDLE__ */", () => coreIife);

const repoOutPath = path.join(root, "apps/demo/index.html");
fs.writeFileSync(repoOutPath, builtHtml, "utf8");

const canvasOutDir = "/working_dir/c_4617ac2c39ee0f10/artifacts/file_generation/ttl=63d/output";
fs.mkdirSync(canvasOutDir, { recursive: true });
const canvasOutPath = path.join(canvasOutDir, "livechatlens-playground.html");
fs.writeFileSync(canvasOutPath, builtHtml, "utf8");

console.log(`Built extension bundle + single-file Web Playground (${builtHtml.length} bytes):`);
console.log(`  - ${extBundlePath}`);
console.log(`  - ${repoOutPath}`);
console.log(`  - ${canvasOutPath}`);
