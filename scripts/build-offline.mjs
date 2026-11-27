import fs from "node:fs";
import path from "node:path";

function splitTopLevelParams(paramList) {
  const parts = [];
  let current = "";
  let depth = 0;
  for (const ch of paramList) {
    if (ch === "<" || ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ">" || ch === ")" || ch === "}" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function stripParamTypes(paramList) {
  return splitTopLevelParams(paramList)
    .map((segment) => {
      const trimmed = segment.trim();
      if (!trimmed) return segment;
      const eqIdx = segment.indexOf("=");
      if (eqIdx !== -1) {
        const left = segment.slice(0, eqIdx);
        const right = segment.slice(eqIdx);
        const colonIdx = left.indexOf(":");
        if (colonIdx !== -1) {
          return left.slice(0, colonIdx).replace(/\?\s*$/, "") + " " + right.trim();
        }
        return segment;
      }
      const colonIdx = segment.indexOf(":");
      if (colonIdx !== -1) {
        return segment.slice(0, colonIdx).replace(/\?\s*$/, "");
      }
      return segment;
    })
    .join(",");
}

function stripTypeScript(source) {
  let code = source;

  code = code.replace(/^\s*import\s+type\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "");
  code = code.replace(/^\s*export\s+\*\s+from\s+["']\.\/types\.js["'];?\s*$/gm, "");

  const lines = code.split("\n");
  const out = [];
  let skippingBlock = false;
  let braceDepth = 0;
  let skippingTypeAlias = false;

  for (const line of lines) {
    if (skippingBlock) {
      for (const ch of line) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }
      if (braceDepth <= 0) skippingBlock = false;
      continue;
    }

    if (skippingTypeAlias) {
      if (line.trim().endsWith(";")) skippingTypeAlias = false;
      continue;
    }

    if (/^\s*(?:export\s+)?interface\s+\w+/.test(line)) {
      skippingBlock = true;
      braceDepth = 0;
      for (const ch of line) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }
      if (braceDepth <= 0 && line.includes("{")) skippingBlock = false;
      continue;
    }

    if (/^\s*(?:export\s+)?type\s+\w+\s*=/.test(line)) {
      if (!line.trim().endsWith(";")) skippingTypeAlias = true;
      continue;
    }

    out.push(line);
  }

  code = out.join("\n");
  code = code.replace(/(from\s+["'][^"']+)\.js(["'])/g, "$1.mjs$2");
  code = code.replace(/\bnew\s+(Set|Map)<[^>]+>\(/g, "new $1(");
  code = code.replace(
    /^(\s*(?:export\s+)?(?:const|let|var)\s+[a-zA-Z_$][\w$]*)\s*:\s*[A-Za-z0-9_$\[\]|<>.,\s"']+?(?=\s*[=;])/gm,
    "$1"
  );
  code = code.replace(
    /(\b(?:export\s+)?(?:async\s+)?function\s+[a-zA-Z_$][\w$]*\s*)\(([\s\S]*?)\)(\s*:\s*[A-Za-z0-9_$\[\]|<>.,\s"'?]+)?(\s*\{)/g,
    (_m, head, params, _ret, brace) => `${head}(${stripParamTypes(params)})${brace}`
  );

  return code;
}

const root = process.cwd();
const filesToCompile = [
  ["packages/core/src/hash.ts", "packages/core/dist/hash.mjs"],
  ["packages/core/src/sanitizer.ts", "packages/core/dist/sanitizer.mjs"],
  ["packages/core/src/parser.ts", "packages/core/dist/parser.mjs"],
  ["packages/core/src/signals/disclosure.ts", "packages/core/dist/signals/disclosure.mjs"],
  ["packages/core/src/signals/automation.ts", "packages/core/dist/signals/automation.mjs"],
  ["packages/core/src/signals/handoff.ts", "packages/core/dist/signals/handoff.mjs"],
  ["packages/core/src/signals/timing.ts", "packages/core/dist/signals/timing.mjs"],
  ["packages/core/src/signals/style.ts", "packages/core/dist/signals/style.mjs"],
  ["packages/core/src/signals/commitments.ts", "packages/core/dist/signals/commitments.mjs"],
  ["packages/core/src/signals/defense.ts", "packages/core/dist/signals/defense.mjs"],
  ["packages/core/src/fusion.ts", "packages/core/dist/fusion.mjs"],
  ["packages/core/src/dispute.ts", "packages/core/dist/dispute.mjs"],
  ["packages/core/src/pdf.ts", "packages/core/dist/pdf.mjs"],
  ["packages/core/src/regulatory.ts", "packages/core/dist/regulatory.mjs"],
  ["packages/core/src/tsa.ts", "packages/core/dist/tsa.mjs"],
  ["packages/core/src/verifier.ts", "packages/core/dist/verifier.mjs"],
  ["packages/core/src/zip.ts", "packages/core/dist/zip.mjs"],
  ["packages/core/src/index.ts", "packages/core/dist/index.mjs"],
  ["fixtures/conversations/index.ts", "packages/core/dist/fixtures/conversations/index.mjs"],
  ["packages/core/tests/core.test.ts", "packages/core/dist/tests/core.test.mjs"],
];

for (const [srcRel, dstRel] of filesToCompile) {
  const srcPath = path.join(root, srcRel);
  const dstPath = path.join(root, dstRel);
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  let raw = fs.readFileSync(srcPath, "utf8");
  if (srcRel === "packages/core/tests/core.test.ts") {
    raw = raw.replace(
      "../../../fixtures/conversations/index.js",
      "../fixtures/conversations/index.js"
    );
  }
  const transpiled = stripTypeScript(raw);
  fs.writeFileSync(dstPath, transpiled, "utf8");
}

console.log(`Built ${filesToCompile.length} ESM modules into packages/core/dist/`);
