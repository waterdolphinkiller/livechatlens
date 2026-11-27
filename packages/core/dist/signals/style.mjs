
import { createRedactedExcerpt, normalizeForDetection } from "../sanitizer.mjs";

/**
 * Layer E (Weak Linguistic Boilerplate Clue — grounded in Bitext 27K Customer Support LLM corpus):
 * Detects dense multi-turn clusters of stock LLM customer-support empathy + step-by-step scaffolding.
 * Strictly emits a WEAK supporting signal ONLY when >=2 distinct patterns appear across >=2 responder turns.
 * Never overrides HUMAN_AGENT_INDICATED or proves AI identity on its own.
 */
const LLM_SUPPORT_BOILERPLATE_PATTERNS = [
  /\brest\s+assured,\s+i(?:'m|\s+am)\s+here\s+to\s+(?:assist|guide|help)\s+you\b/i,
  /\bmake\s+this\s+process\s+as\s+(?:seamless|smooth)\s+as\s+possible\b/i,
  /\bi(?:'m|\s+am)\s+here\s+to\s+(?:help\s+)?streamline\s+the\s+process\b/i,
  /\bi(?:'m|\s+am)\s+sensitive\s+to\s+the\s+fact\s+that\b/i,
  /\bi(?:'ve|\s+have)\s+come\s+to\s+understand\s+that\s+you\s+need\s+assistance\b/i,
  /\bhere(?:'s|\s+is)\s+what\s+you\s+need\s+to\s+do\s*:\s*(?:\n|\s)*1\./i,
  /\blet(?:'s|\s+us)\s+go\s+through\s+the\s+steps\s+together\s*:/i,
  /\bassist\s+you\s+every\s+step\s+of\s+the\s+way\b/i,
];

export function detectBoilerplateStyleSignals(session){
  const matchedTurnIds = [];
  const matchedPatternIdx = new Set();
  let lastTs = session.startedAt;
  let sampleText = "";

  for (const turn of session.turns) {
    if (turn.role === "visitor" || turn.role === "system") {
      continue;
    }
    const norm = normalizeForDetection(turn.text);
    let turnHit = false;
    for (let i = 0; i < LLM_SUPPORT_BOILERPLATE_PATTERNS.length; i++) {
      const re = LLM_SUPPORT_BOILERPLATE_PATTERNS[i];
      if (re && re.test(norm)) {
        matchedPatternIdx.add(i);
        turnHit = true;
      }
    }
    if (turnHit) {
      matchedTurnIds.push(turn.id);
      lastTs = turn.timestamp ?? lastTs;
      if (!sampleText) sampleText = turn.text;
    }
  }

  // Require >=2 responder turns AND >=2 distinct boilerplate patterns to keep Human FPR near 0%
  if (matchedTurnIds.length < 2 || matchedPatternIdx.size < 2) {
    return [];
  }

  return [
    {
      id: "ev-style-llm-boilerplate-1",
      code: "LLM_EMPATHY_BOILERPLATE_PATTERN",
      direction: "ai_language",
      strength: "weak",
      observedAt: lastTs,
      turnIds: matchedTurnIds,
      excerptRedacted: createRedactedExcerpt(sampleText, 120),
      explanation: `Observed ${matchedPatternIdx.size} stock LLM customer-support empathy/scaffolding templates across ${matchedTurnIds.length} responder turns (Bitext-calibrated weak clue).`,
      alternativeExplanation:
        "Trained human support agents using corporate macros or AI-assisted reply drafting can produce similar structured empathy phrasing; style alone does not prove AI identity.",
      source: "conversation_pattern",
    },
  ];
}
