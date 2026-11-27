import { analyzeConversation } from "../packages/core/dist/index.mjs";
import { BENCHMARK_FIXTURES } from "../packages/core/dist/fixtures/conversations/index.mjs";

const labels = [
  "AI_DISCLOSED",
  "AUTOMATION_LIKELY",
  "HUMAN_HANDOFF_OBSERVED",
  "HUMAN_AGENT_INDICATED",
  "MIXED_OR_HYBRID",
  "INCONCLUSIVE",
];

let exactMatches = 0;
let humanSamples = 0;
let humanFalsePositives = 0;
let abstentions = 0;
const confusion = {};

for (const fixture of BENCHMARK_FIXTURES) {
  const res = analyzeConversation(fixture.session, {
    generatedAt: fixture.session.startedAt + 60000,
  });

  const expected = fixture.expectedVerdict;
  const predicted = res.label;
  if (expected === predicted) exactMatches++;
  if (predicted === "INCONCLUSIVE") abstentions++;

  if (fixture.groundTruthClass === "templated_human") {
    humanSamples++;
    if (predicted === "AI_DISCLOSED" || predicted === "AUTOMATION_LIKELY") {
      humanFalsePositives++;
    }
  }

  confusion[expected] = confusion[expected] || {};
  confusion[expected][predicted] = (confusion[expected][predicted] || 0) + 1;
}

// Compute Macro-F1 across present expected classes
const presentClasses = [...new Set(BENCHMARK_FIXTURES.map((f) => f.expectedVerdict))];
let f1Sum = 0;
const perClass = {};

for (const cls of presentClasses) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const fixture of BENCHMARK_FIXTURES) {
    const res = analyzeConversation(fixture.session, {
      generatedAt: fixture.session.startedAt + 60000,
    });
    if (fixture.expectedVerdict === cls && res.label === cls) tp++;
    else if (fixture.expectedVerdict !== cls && res.label === cls) fp++;
    else if (fixture.expectedVerdict === cls && res.label !== cls) fn++;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  f1Sum += f1;
  perClass[cls] = {
    precision: Number(precision.toFixed(3)),
    recall: Number(recall.toFixed(3)),
    f1: Number(f1.toFixed(3)),
  };
}

const summary = {
  totalFixtures: BENCHMARK_FIXTURES.length,
  exactMatches,
  accuracy: Number((exactMatches / BENCHMARK_FIXTURES.length).toFixed(3)),
  macroF1: Number((f1Sum / presentClasses.length).toFixed(3)),
  humanFalsePositiveRate: humanSamples === 0 ? 0 : Number((humanFalsePositives / humanSamples).toFixed(3)),
  abstentionRate: Number((abstentions / BENCHMARK_FIXTURES.length).toFixed(3)),
  perClass,
  confusionMatrix: confusion,
};

console.log(JSON.stringify(summary, null, 2));
