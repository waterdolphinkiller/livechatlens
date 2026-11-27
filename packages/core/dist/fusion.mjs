
import { detectDisclosureSignals } from "./signals/disclosure.mjs";
import { detectAutomationSignals } from "./signals/automation.mjs";
import { detectHandoffAndHumanSignals, detectHandoffFriction } from "./signals/handoff.mjs";
import { detectTimingSignals } from "./signals/timing.mjs";
import { detectBoilerplateStyleSignals } from "./signals/style.mjs";
import { detectCommitmentFlags } from "./signals/commitments.mjs";
import { buildDefensePrompts } from "./signals/defense.mjs";
import { redactPII } from "./sanitizer.mjs";
import { sha256Hex } from "./hash.mjs";

const AI_LABEL_HINT =
  /(?<![a-zA-Z])(?:ai|bot|virtual|automated|concierge|smart\s+helper)(?![a-zA-Z])|(?:智能|机器)/i;

function computeTransparencyAudit(
  session,
  disclosureEvidence,
  machineReadableMarkers,
  verdict){
  const responderTurns = session.turns.filter(
    (t) => t.role !== "visitor" && t.role !== "system"
  );
  const firstResponder = responderTurns[0];

  if (disclosureEvidence.length > 0) {
    const bannerEvidence = disclosureEvidence.find(
      (e) => e.code === "AI_DISCLOSURE_BANNER_VISIBLE"
    );
    if (bannerEvidence) {
      const firstResponderTs = firstResponder?.timestamp ?? session.startedAt;
      const isBeforeOrAtFirst = bannerEvidence.observedAt <= firstResponderTs;
      return {
        status: isBeforeOrAtFirst ? "disclosed_first_turn" : "disclosed_late",
        firstResponderTurnId: firstResponder?.id,
        disclosureTurnId: bannerEvidence.turnIds[0],
        firstResponderIndex: firstResponder ? 1 : undefined,
        disclosureIndex: isBeforeOrAtFirst ? 1 : undefined,
        machineReadableMarkers,
        notes: [
          isBeforeOrAtFirst
            ? "Observed an AI disclosure banner at or before the first responder message."
            : "Observed an AI disclosure banner after responder messages had already started.",
          ...(machineReadableMarkers.length > 0
            ? [`Detected machine-readable AI marker(s): ${machineReadableMarkers.join(", ")}.`]
            : []),
          "Observational UI check only — not legal advice or a formal regulatory compliance determination.",
        ],
      };
    }

    const turnIndexMap = new Map();
    responderTurns.forEach((turn, idx) => {
      turnIndexMap.set(turn.id, idx + 1);
    });

    let earliestIdx = Number.POSITIVE_INFINITY;
    let earliestTurnId;

    for (const ev of disclosureEvidence) {
      for (const tid of ev.turnIds) {
        const idx = turnIndexMap.get(tid);
        if (idx !== undefined && idx < earliestIdx) {
          earliestIdx = idx;
          earliestTurnId = tid;
        }
      }
    }

    if (earliestIdx === 1) {
      return {
        status: "disclosed_first_turn",
        firstResponderTurnId: firstResponder?.id,
        disclosureTurnId: earliestTurnId,
        firstResponderIndex: 1,
        disclosureIndex: 1,
        machineReadableMarkers,
        notes: [
          "AI interaction was disclosed on the first responder turn.",
          ...(machineReadableMarkers.length > 0
            ? [`Detected machine-readable AI marker(s): ${machineReadableMarkers.join(", ")}.`]
            : []),
          "Observational UI check only — not legal advice or a formal regulatory compliance determination.",
        ],
      };
    }

    if (Number.isFinite(earliestIdx) && earliestIdx > 1) {
      return {
        status: "disclosed_late",
        firstResponderTurnId: firstResponder?.id,
        disclosureTurnId: earliestTurnId,
        firstResponderIndex: 1,
        disclosureIndex: earliestIdx,
        machineReadableMarkers,
        notes: [
          `AI disclosure was first observed on responder turn #${earliestIdx}, after ${earliestIdx - 1} prior responder turn(s) without visible disclosure.`,
          "Observational UI check only — not legal advice or a formal regulatory compliance determination.",
        ],
      };
    }
  }

  if (
    (verdict === "INCONCLUSIVE" || verdict === "AI_ASSISTED_POSSIBLE") &&
    responderTurns.length >= 2 &&
    session.coverage.status === "full"
  ) {
    return {
      status: "not_disclosed",
      firstResponderTurnId: firstResponder?.id,
      firstResponderIndex: firstResponder ? 1 : undefined,
      machineReadableMarkers,
      notes: [
        verdict === "AI_ASSISTED_POSSIBLE"
          ? "Observed weak streaming/render timing clues consistent with AI generation, with no visible AI disclosure."
          : "No visible AI disclosure was observed across readable responder turns. This does not prove the responder is AI or human.",
        "Observational UI check only — not legal advice or a formal regulatory compliance determination.",
      ],
    };
  }

  return {
    status: "not_applicable",
    firstResponderTurnId: firstResponder?.id,
    machineReadableMarkers,
    notes: [
      "First-turn AI disclosure audit is not applicable (either non-AI/scripted/human-indicated flow or insufficient readable coverage).",
    ],
  };
}

function buildTurnSpeakerStates(
  session,
  evidence,
  overallVerdict){
  const states = new Map();
  const firstDisclosureTs = evidence
    .filter((e) => e.direction === "ai_disclosure")
    .reduce((min, e) => Math.min(min, e.observedAt), Number.POSITIVE_INFINITY);
  const firstHandoffTs = evidence
    .filter((e) => e.direction === "human_handoff")
    .reduce((min, e) => Math.min(min, e.observedAt), Number.POSITIVE_INFINITY);
  const agentLeftTs = session.observedEvents
    .filter((e) => e.type === "agent_left")
    .reduce((min, e) => Math.min(min, e.observedAt), Number.POSITIVE_INFINITY);

  for (const turn of session.turns) {
    if (turn.role === "visitor" || turn.role === "system") {
      continue;
    }
    const ts = turn.timestamp ?? session.startedAt;
    const isExplicitAiTurn =
      turn.role === "assistant" ||
      Boolean(turn.visibleLabel && AI_LABEL_HINT.test(turn.visibleLabel));
    const humanHasLeft = Number.isFinite(agentLeftTs) && ts >= agentLeftTs;

    if ((humanHasLeft || isExplicitAiTurn) && Number.isFinite(firstDisclosureTs)) {
      states.set(turn.id, "AI_DISCLOSED");
    } else if (Number.isFinite(firstHandoffTs) && ts > firstHandoffTs && !humanHasLeft) {
      states.set(turn.id, "HUMAN_AGENT_INDICATED");
    } else if (Number.isFinite(firstDisclosureTs) && overallVerdict === "MIXED_OR_HYBRID") {
      states.set(turn.id, "AI_DISCLOSED");
    } else {
      states.set(turn.id, overallVerdict);
    }
  }
  return states;
}

function buildTimeline(
  session,
  evidence,
  commitments,
  darkPatterns){
  const entries = [];

  for (const evt of session.observedEvents) {
    if (evt.type === "widget_opened") {
      entries.push({
        observedAt: evt.observedAt,
        kind: "event",
        title: "Chat widget opened",
        detail: evt.label ?? `Platform adapter: ${session.adapterId}`,
        turnIds: evt.turnId ? [evt.turnId] : [],
      });
    }
  }

  for (const ev of evidence) {
    entries.push({
      observedAt: ev.observedAt,
      kind: "evidence",
      title: ev.code,
      detail: ev.explanation,
      turnIds: ev.turnIds,
      strength: ev.strength,
    });
  }

  for (const dp of darkPatterns) {
    entries.push({
      observedAt: dp.observedAt,
      kind: "dark_pattern",
      title: `DARK_PATTERN:${dp.code}`,
      detail: dp.explanation,
      turnIds: dp.turnIds,
    });
  }

  for (const cm of commitments) {
    entries.push({
      observedAt: cm.observedAt,
      kind: "commitment",
      title: `COMMITMENT_FLAG:${cm.category}`,
      detail: `${cm.riskNote} Excerpt: "${cm.excerptRedacted}"`,
      turnIds: [cm.turnId],
    });
  }

  entries.sort((a, b) => a.observedAt - b.observedAt);
  return entries;
}

function buildEvidenceReceipt(
  session,
  label,
  evidenceLevel,
  transparencyStatus,
  summary,
  handoffFriction,
  evidence,
  commitments,
  darkPatterns,
  generatedAt,
  screenshotSha256){
  const sanitizedSessionId = redactPII(session.sessionId);
  const pageUrlRedacted = session.pageUrl ? redactPII(session.pageUrl) : undefined;
  const canonicalPayload = JSON.stringify({
    receiptVersion: "1.4.0",
    generatedAt,
    sessionId: sanitizedSessionId,
    platformId: session.platformId,
    pageUrlRedacted: pageUrlRedacted ?? "",
    verdict: label,
    evidenceLevel,
    transparencyStatus,
    evidence: evidence.map((e) => ({
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
    commitments: commitments.map((c) => ({
      turnId: c.turnId,
      observedAt: c.observedAt,
      category: c.category,
      qualifier: c.qualifier,
      speakerStateAtTurn: c.speakerStateAtTurn,
      excerptRedacted: c.excerptRedacted,
      riskNote: c.riskNote,
    })),
  });

  const sha256 = sha256Hex(canonicalPayload);
  const combinedSha256 = screenshotSha256
    ? sha256Hex(`${sha256}:${screenshotSha256}`)
    : undefined;

  return {
    receiptVersion: "1.4.0",
    generatedAt,
    sessionId: sanitizedSessionId,
    platformId: session.platformId,
    pageUrlRedacted,
    verdict: label,
    evidenceLevel,
    transparencyStatus,
    redactedTurnCount: session.turns.length,
    evidenceCount: evidence.length,
    commitmentCount: commitments.length,
    darkPatternCount: darkPatterns.length,
    sha256,
    screenshotSha256,
    combinedSha256,
  };
}

export function analyzeConversation(
  session,
  options = {}){
  const generatedAt = options.generatedAt ?? session.startedAt;
  const minTurns = options.minTurnsForNonDirectVerdict ?? 2;

  const limitations = [
    "Results reflect observable interface labels, DOM render timing, and conversation patterns — not cryptographic or legal proof of identity.",
    "No probabilistic cloud/local ML text classifier is active; LiveChatLens abstains rather than guessing from writing style alone.",
  ];

  if (session.coverage.status !== "full") {
    limitations.push(
      `Coverage limited (${session.coverage.status}): readable turns = ${session.coverage.readableTurns}.`
    );
  }
  if (session.coverage.notes && session.coverage.notes.length > 0) {
    limitations.push(...session.coverage.notes.map((n) => redactPII(n)));
  }

  const emptyFriction = {
    detected: false,
    requestCount: 0,
    requestTurnIds: [],
    escalated: false,
    summary: "Insufficient readable conversation coverage to evaluate handoff friction.",
  };

  if (
    session.coverage.status === "blocked_cross_origin_iframe" ||
    session.coverage.status === "blocked_closed_shadow_dom" ||
    session.coverage.status === "empty" ||
    session.turns.length === 0
  ) {
    const emptySummary = `Unable to analyze conversation reliably due to limited coverage (${session.coverage.status}).`;
    const transparencyAudit = {
      status: "not_applicable",
      machineReadableMarkers: [],
      notes: ["Insufficient readable conversation coverage to evaluate transparency."],
    };
    const receipt = buildEvidenceReceipt(
      session,
      "INCONCLUSIVE",
      "insufficient",
      transparencyAudit.status,
      emptySummary,
      emptyFriction,
      [],
      [],
      [],
      generatedAt,
      options.screenshotSha256
    );
    return {
      label: "INCONCLUSIVE",
      evidenceLevel: "insufficient",
      summary: emptySummary,
      evidence: [],
      timeline: buildTimeline(session, [], [], []),
      transparencyAudit,
      handoffFriction: emptyFriction,
      darkPatterns: [],
      commitments: [],
      defensePrompts: [],
      limitations,
      coverage: session.coverage,
      abstentionReason: `coverage_${session.coverage.status}`,
      receipt,
    };
  }

  const disclosureOut = detectDisclosureSignals(session);
  const disclosureEvidence = disclosureOut.evidence;
  const automationEvidence = detectAutomationSignals(session);
  const handoffOut = detectHandoffAndHumanSignals(session);
  const handoffAndHumanEvidence = handoffOut.evidence;
  const timingEvidence = detectTimingSignals(session);
  const styleEvidence = detectBoilerplateStyleSignals(session);

  const hasDirectAI = disclosureEvidence.some((e) => e.strength === "direct");
  const hasHandoff = handoffAndHumanEvidence.some(
    (e) => e.direction === "human_handoff" && e.strength === "direct"
  );
  const hasHumanIdentity = handoffAndHumanEvidence.some(
    (e) => e.direction === "human_identity" && e.strength === "direct"
  );
  const hasFakeHandoffContradiction = handoffAndHumanEvidence.some(
    (e) => e.code === "FAKE_HUMAN_HANDOFF_CONTRADICTION"
  );

  const frictionOut = detectHandoffFriction(
    session,
    (hasHandoff || hasHumanIdentity) && !hasFakeHandoffContradiction
  );

  const evidence = [
    ...disclosureEvidence,
    ...automationEvidence,
    ...handoffAndHumanEvidence,
    ...frictionOut.evidence,
    ...timingEvidence,
    ...styleEvidence,
  ].sort((a, b) => a.observedAt - b.observedAt);

  const darkPatterns = [
    ...disclosureOut.darkPatterns,
    ...handoffOut.darkPatterns,
    ...frictionOut.darkPatterns,
  ].sort((a, b) => a.observedAt - b.observedAt);

  const strongAutomationCount =
    automationEvidence.filter((e) => e.strength === "strong").length +
    frictionOut.evidence.filter((e) => e.strength === "strong").length;
  const hasStreamingSignal = timingEvidence.some(
    (e) => e.code === "STREAMING_TOKEN_RENDER_OBSERVED"
  );
  const responderTurnsCount = session.turns.filter(
    (t) => t.role !== "visitor" && t.role !== "system"
  ).length;

  let label = "INCONCLUSIVE";
  let evidenceLevel = "insufficient";
  let summary = "Insufficient observable evidence to classify this conversation.";
  let abstentionReason;

  if (hasFakeHandoffContradiction) {
    label = "MIXED_OR_HYBRID";
    evidenceLevel = "strong";
    summary =
      "A purported human support handoff or agent turn exhibited conflicting AI markers or heavy token-streaming behavior (suspected fake handoff).";
  } else if (hasDirectAI && (hasHandoff || hasHumanIdentity)) {
    label = "MIXED_OR_HYBRID";
    evidenceLevel = "direct";
    summary =
      "Observed explicit AI disclosure alongside human handoff or support agent identity signals in the same session.";
  } else if (hasDirectAI) {
    label = "AI_DISCLOSED";
    evidenceLevel = "direct";
    summary =
      darkPatterns.length > 0
        ? "AI disclosure or machine-readable AI marker was detected, alongside UI visibility or persona dark-pattern flags."
        : "The chat interface or responder explicitly disclosed an AI or virtual assistant.";
  } else if (hasHandoff) {
    label = "HUMAN_HANDOFF_OBSERVED";
    evidenceLevel = "direct";
    summary =
      "Observed an explicit handoff to a human support agent, without prior visible AI disclosure.";
  } else if (hasHumanIdentity) {
    label = "HUMAN_AGENT_INDICATED";
    evidenceLevel = "direct";
    summary =
      strongAutomationCount > 0
        ? "A support agent identity label is visible. Template/macro repetition was also observed, which is common for human agents using canned replies."
        : "The chat interface displays a support agent identity label without AI disclosure.";
  } else if (strongAutomationCount >= 1 && responderTurnsCount >= minTurns) {
    label = "AUTOMATION_LIKELY";
    evidenceLevel = strongAutomationCount >= 2 ? "strong" : "moderate";
    summary = frictionOut.report.detected
      ? "Observed scripted automation or repeated replies alongside unfulfilled repeated requests to reach a human agent."
      : "Observed scripted FAQ menus, auto-reply notices, or repeated template patterns. This indicates automation or canned macros, not necessarily an LLM.";
  } else if (hasStreamingSignal && responderTurnsCount >= minTurns) {
    label = "AI_ASSISTED_POSSIBLE";
    evidenceLevel = "weak";
    summary =
      "Observed token-by-token streaming DOM updates without explicit AI disclosure. This is a weak behavioral clue — not proof of AI identity.";
  } else {
    label = "INCONCLUSIVE";
    evidenceLevel = evidence.length > 0 ? "weak" : "insufficient";
    abstentionReason =
      responderTurnsCount < minTurns
        ? "insufficient_responder_turns"
        : "no_direct_or_strong_signals";
    summary =
      "No direct AI disclosure, handoff event, or strong automation signals were observed. LiveChatLens abstains rather than guessing from writing style.";
  }

  const transparencyAudit = computeTransparencyAudit(
    session,
    disclosureEvidence,
    disclosureOut.machineReadableMarkers,
    label
  );
  const turnSpeakerStates = buildTurnSpeakerStates(session, evidence, label);
  const commitments = detectCommitmentFlags(session, turnSpeakerStates);
  const defensePrompts = buildDefensePrompts(
    label,
    transparencyAudit,
    commitments,
    frictionOut.report
  );
  const timeline = buildTimeline(session, evidence, commitments, darkPatterns);
  const receipt = buildEvidenceReceipt(
    session,
    label,
    evidenceLevel,
    transparencyAudit.status,
    summary,
    frictionOut.report,
    evidence,
    commitments,
    darkPatterns,
    generatedAt,
    options.screenshotSha256
  );

  return {
    label,
    evidenceLevel,
    summary,
    evidence,
    timeline,
    transparencyAudit,
    handoffFriction: frictionOut.report,
    darkPatterns,
    commitments,
    defensePrompts,
    limitations,
    coverage: session.coverage,
    abstentionReason,
    receipt,
  };
}

export function formatSanitizedReceiptMarkdown(result){
  const lines = [
    `# LiveChatLens Evidence Receipt`,
    ``,
    `- **Session ID:** \`${result.receipt.sessionId}\``,
    `- **Platform:** \`${result.receipt.platformId}\``,
  ];

  if (result.receipt.pageUrlRedacted) {
    lines.push(`- **Page URL (Sanitized):** \`${result.receipt.pageUrlRedacted}\``);
  }

  lines.push(
    `- **Verdict:** \`${result.label}\` (Evidence Level: \`${result.evidenceLevel}\`)`,
    `- **Transparency Audit:** \`${result.transparencyAudit.status}\``,
    `- **Handoff Friction Detected:** ${result.handoffFriction.detected ? `YES (${result.handoffFriction.requestCount} requests)` : "No"}`,
    `- **Dark Patterns Flagged:** ${result.darkPatterns.length}`,
    `- **Commitments Flagged:** ${result.commitments.length}`,
    `- **Transcript SHA-256:** \`${result.receipt.sha256}\``
  );

  if (result.receipt.screenshotSha256) {
    lines.push(`- **Screenshot PNG SHA-256:** \`${result.receipt.screenshotSha256}\``);
  }
  if (result.receipt.combinedSha256) {
    lines.push(`- **Combined Tamper-Evident SHA-256:** \`${result.receipt.combinedSha256}\``);
  }

  lines.push(``, `## Summary`, result.summary, ``, `## Observable Evidence (${result.evidence.length})`);

  if (result.evidence.length === 0) {
    lines.push(`- None observed.`);
  } else {
    for (const ev of result.evidence) {
      lines.push(
        `- **[${ev.strength.toUpperCase()}] ${ev.code}** (turns: ${ev.turnIds.join(", ") || "session"}): ${ev.explanation}`
      );
    }
  }

  if (result.darkPatterns.length > 0) {
    lines.push(``, `## Transparency & Escalation Dark Patterns (${result.darkPatterns.length})`);
    for (const dp of result.darkPatterns) {
      lines.push(`- **${dp.code}**: ${dp.explanation}`);
    }
  }

  if (result.commitments.length > 0) {
    lines.push(``, `## Flagged Commitments & Quote Risks (${result.commitments.length})`);
    for (const cm of result.commitments) {
      lines.push(
        `- **${cm.category}** [${cm.qualifier}] (turn \`${cm.turnId}\`, observed state: \`${cm.speakerStateAtTurn}\`): "${cm.excerptRedacted}" — ${cm.riskNote}`
      );
    }
  }

  lines.push(``, `## Limitations`);
  for (const lim of result.limitations) {
    lines.push(`- ${lim}`);
  }

  return lines.join("\n");
}
