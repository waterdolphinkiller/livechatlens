#!/usr/bin/env node
/**
 * LiveChatLens External US Corpus Blind-Test Evaluator (v1.2.0-US)
 *
 * Online mode (run on any internet-connected machine):
 *   node scripts/eval-us-corpora.mjs --live --limit 100
 *   - Samples real rows from Hugging Face Bitext 27K Customer Support LLM Dataset
 *   - Samples real narratives from the US CFPB Consumer Complaint Database API
 *
 * Offline mode (for CI & sandbox verification):
 *   node scripts/eval-us-corpora.mjs --offline
 */
import fs from "node:fs";
import path from "node:path";
import { analyzeConversation } from "../packages/core/dist/index.mjs";

const BITEXT_HF_API =
  "https://datasets-server.huggingface.co/rows?dataset=bitext%2FBitext-customer-support-llm-chatbot-training-dataset&config=default&split=train&offset=0&length=";
const CFPB_API =
  "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/?has_narrative=true&sort=created_date_desc&size=";

const args = process.argv.slice(2);
const isLive = args.includes("--live");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 && args[limitIdx + 1] ? Math.min(200, Number(args[limitIdx + 1])) : 50;

const BASE_TS = 1764250000000;

function makeSession(id, texts, role = "unknown", visibleLabel = undefined) {
  const turns = [];
  texts.forEach((text, i) => {
    turns.push({ id: `v${i + 1}`, role: "visitor", text: "Help with my order/account.", timestamp: BASE_TS + i * 20000 });
    turns.push({
      id: `r${i + 1}`,
      role,
      visibleLabel,
      text,
      timestamp: BASE_TS + i * 20000 + 8000,
    });
  });
  return {
    sessionId: id,
    platformId: "us_corpus_eval",
    adapterId: "eval-harness",
    startedAt: BASE_TS,
    turns,
    observedEvents: [],
    coverage: { status: "full", readableTurns: turns.length },
  };
}

async function runOffline() {
  const samplePath = path.resolve(process.cwd(), "fixtures/us-corpora-sample.json");
  const data = JSON.parse(fs.readFileSync(samplePath, "utf8"));

  let boilerplateHits = 0;
  for (const s of data.bitextLlmSamples) {
    const res = analyzeConversation(makeSession(s.id, s.turns));
    if (res.evidence.some((e) => e.code === "LLM_EMPATHY_BOILERPLATE_PATTERN")) {
      boilerplateHits++;
    }
  }

  let commitmentMatches = 0;
  let qualifierMatches = 0;
  let denialFalsePositives = 0;
  for (const c of data.cfpbCommitmentSamples) {
    const res = analyzeConversation(makeSession(c.id, [c.text, "Let me know if you need anything else."]));
    if (c.expectedCategory === null) {
      if (res.commitments.length === 0) commitmentMatches++;
      else denialFalsePositives++;
    } else {
      const hit = res.commitments.find((x) => x.category === c.expectedCategory);
      if (hit) {
        commitmentMatches++;
        if (hit.qualifier === c.expectedQualifier) qualifierMatches++;
      }
    }
  }

  let humanFalsePositives = 0;
  for (const h of data.usHumanSupportSamples) {
    const res = analyzeConversation(makeSession(h.id, h.turns, "support_agent", h.agentLabel));
    if (res.label !== "HUMAN_AGENT_INDICATED") humanFalsePositives++;
  }

  const positiveCommitmentCount = data.cfpbCommitmentSamples.filter((c) => c.expectedCategory !== null).length;

  console.log(
    JSON.stringify(
      {
        mode: "offline_sample",
        bitextBoilerplateTriggerRate: `${boilerplateHits}/${data.bitextLlmSamples.length}`,
        cfpbCommitmentAccuracy: `${commitmentMatches}/${data.cfpbCommitmentSamples.length}`,
        cfpbQualifierAccuracy: `${qualifierMatches}/${positiveCommitmentCount}`,
        denialFalsePositives,
        usHumanFalsePositiveRate: `${humanFalsePositives}/${data.usHumanSupportSamples.length}`,
      },
      null,
      2
    )
  );

  if (
    boilerplateHits !== data.bitextLlmSamples.length ||
    commitmentMatches !== data.cfpbCommitmentSamples.length ||
    qualifierMatches !== positiveCommitmentCount ||
    denialFalsePositives > 0 ||
    humanFalsePositives > 0
  ) {
    process.exit(1);
  }
}

async function runLive() {
  console.log(`Fetching live US corpora (limit=${limit}) from Hugging Face Bitext & US CFPB API...`);
  const bitextRes = await fetch(`${BITEXT_HF_API}${limit}`);
  if (!bitextRes.ok) throw new Error(`Bitext API HTTP ${bitextRes.status}`);
  const bitextJson = await bitextRes.json();
  const rows = bitextJson.rows || [];

  let boilerplateSessions = 0;
  let totalSessions = 0;
  for (let i = 0; i + 1 < rows.length; i += 2) {
    const r1 = rows[i]?.row?.response;
    const r2 = rows[i + 1]?.row?.response;
    if (!r1 || !r2) continue;
    totalSessions++;
    const res = analyzeConversation(makeSession(`hf-bitext-${i}`, [r1, r2]));
    if (res.evidence.some((e) => e.code === "LLM_EMPATHY_BOILERPLATE_PATTERN")) {
      boilerplateSessions++;
    }
  }

  const cfpbRes = await fetch(`${CFPB_API}${limit}`);
  if (!cfpbRes.ok) throw new Error(`CFPB API HTTP ${cfpbRes.status}`);
  const cfpbJson = await cfpbRes.json();
  const hits = cfpbJson.hits?.hits || [];

  let narrativesWithCommitments = 0;
  let storeCreditTraps = 0;
  let conditionalTraps = 0;

  for (const h of hits) {
    const text = h._source?.complaint_what_happened || "";
    if (!text) continue;
    const res = analyzeConversation(makeSession(`cfpb-${h._id}`, [text]));
    if (res.commitments.length > 0) narrativesWithCommitments++;
    if (res.commitments.some((c) => c.qualifier === "store_credit_only")) storeCreditTraps++;
    if (res.commitments.some((c) => c.qualifier === "conditional")) conditionalTraps++;
  }

  console.log(
    JSON.stringify(
      {
        mode: "live_us_corpora",
        bitextSessionsEvaluated: totalSessions,
        bitextBoilerplateTriggerRate: totalSessions ? Number((boilerplateSessions / totalSessions).toFixed(3)) : 0,
        cfpbNarrativesEvaluated: hits.length,
        cfpbNarrativesWithCommitments: narrativesWithCommitments,
        storeCreditTrapsDetected: storeCreditTraps,
        conditionalTrapsDetected: conditionalTraps,
      },
      null,
      2
    )
  );
}

if (isLive) {
  runLive().catch((err) => {
    console.error("Live US corpus fetch failed (check internet access):", err.message);
    process.exit(1);
  });
} else {
  runOffline();
}
