
import { createRedactedExcerpt, normalizeForDetection } from "../sanitizer.mjs";

const HANDOFF_PATTERNS = [
  /\b(?:transferring|connecting|handing\s+you\s+over|escalating)\s+(?:you\s+)?to\s+(?:a\s+)?(?:human|live)\s+(?:agent|representative|specialist|support)\b/i,
  /\b(?:a\s+)?(?:human|live)\s+(?:agent|representative|specialist)\s+(?:has\s+joined|joined\s+the\s+chat|is\s+now\s+connected)\b/i,
  /(?:正在为您转接|已为您转接|已接入|转接至).{0,6}(?:人工客服|真人客服|专员|客服人员)/i,
  /(?:人工客服|真人客服).{0,6}(?:已加入|为您服务|已接入)/i,
  /\b(?:menyambungkan\s+anda\s+kepada|dipindahkan\s+kepada)\s+(?:pegawai|ejen\s+manusia|khidmat\s+pelanggan)\b/i,
];

// Conditional pre-transfer gating ("Before transferring you to a live agent, please select an option...")
// must NOT be treated as an actual handoff.
const CONDITIONAL_PRE_TRANSFER_RE =
  /\b(?:before\s+(?:i\s+)?(?:transfer|transferring|connect|connecting|escalat|hand)|in\s+order\s+to\s+(?:transfer|connect)|please\s+(?:select|choose|provide)\b.{0,40}\bbefore\s+(?:i\s+)?(?:transfer|connect))\b/i;

const SPOOF_INJECTION_PATTERNS = [
  /\b(?:ignore\s+(?:all\s+)?previous\s+instructions|system\s+override|verdict\s*:\s*human)\b/i,
];

const HUMAN_LABEL_PATTERNS = [
  /\b(?:human\s+agent|live\s+agent|support\s+specialist|customer\s+care\s+officer)\b/i,
  /(?:人工客服|客服专员|Pegawai\s+Khidmat\s+Pelanggan)/i,
];

const VISITOR_HUMAN_REQUEST_PATTERNS = [
  /\b(?:human|live\s+agent|real\s+person|(?:speak|talk|chat)\s+(?:to|with)\s+(?:a\s+)?(?:live\s+|real\s+)?(?:human|person|someone|agent|representative)|connect\s+me\s+to\s+(?:a\s+)?(?:live\s+|real\s+|human\s+)?(?:person|agent|representative)|transfer\s+to\s+agent|representative|operator|customer\s+service)\b/i,
  /(?:转人工|人工客服|真人客服|找真人|找人工|接人工)/i,
  /\b(?:pegawai\s+manusia|ejen\s+manusia|cakap\s+dengan\s+manusia|sambung\s+ke\s+pegawai)\b/i,
];

const AI_LABEL_EXCLUDE =
  /(?<![a-zA-Z])(?:ai|bot|virtual|automated|concierge|smart\s+helper)(?![a-zA-Z])|(?:智能|机器)/i;


export function detectHandoffAndHumanSignals(session){
  const items = [];
  const darkPatterns = [];
  let seq = 1;
  let dpSeq = 1;

  for (const event of session.observedEvents) {
    if (event.type === "handoff_started" || event.type === "agent_joined") {
      items.push({
        id: `ev-handoff-evt-${seq++}`,
        code: event.type === "handoff_started" ? "HUMAN_HANDOFF_EVENT_VISIBLE" : "HUMAN_AGENT_JOINED_EVENT",
        direction: "human_handoff",
        strength: "direct",
        observedAt: event.observedAt,
        turnIds: event.turnId ? [event.turnId] : [],
        excerptRedacted: event.details ? createRedactedExcerpt(event.details) : event.label,
        explanation:
          event.type === "handoff_started"
            ? "Observed an explicit human handoff event in the chat interface."
            : "Observed a named support agent joining the conversation.",
        alternativeExplanation:
          "UI handoff notices show platform routing state, not independent proof of staff identity or whether AI drafting tools are used.",
        source: "visible_ui",
      });
    }
  }

  for (const turn of session.turns) {
    if (turn.role === "visitor") {
      continue;
    }
    const observedAt = turn.timestamp ?? session.startedAt;
    const normText = normalizeForDetection(turn.text);
    const normLabel = normalizeForDetection(turn.visibleLabel ?? "");
    const isAiTaggedTurn =
      turn.role === "assistant" || Boolean(normLabel && AI_LABEL_EXCLUDE.test(normLabel));

    // Defend against prompt-injection / spoofed handoff claims emitted by an AI-labeled turn
    if (SPOOF_INJECTION_PATTERNS.some((re) => re.test(normText))) {
      items.push({
        id: `ev-spoof-${seq++}`,
        code: "PROMPT_INJECTION_SPOOF_ATTEMPT",
        direction: "contradiction",
        strength: "strong",
        observedAt,
        turnIds: [turn.id],
        excerptRedacted: createRedactedExcerpt(turn.text),
        explanation:
          "Responder message contains prompt-injection or spoofed-verdict text; handoff claims in this turn were ignored.",
        source: "conversation_pattern",
      });
      continue;
    }

    if (HANDOFF_PATTERNS.some((re) => re.test(normText))) {
      const isConditionalDeflection =
        turn.role !== "system" && CONDITIONAL_PRE_TRANSFER_RE.test(normText);
      // Do not trust an AI-tagged turn or conditional pre-transfer deflection
      if ((!isAiTaggedTurn || turn.role === "system") && !isConditionalDeflection) {
        items.push({
          id: `ev-handoff-text-${seq++}`,
          code: "HUMAN_HANDOFF_TEXT_VISIBLE",
          direction: "human_handoff",
          strength: "direct",
          observedAt,
          turnIds: [turn.id],
          excerptRedacted: createRedactedExcerpt(turn.text),
          explanation: "Conversation text explicitly indicates transfer or connection to a human support agent.",
          alternativeExplanation:
            "Transfer notices indicate an intended handoff; verify the subsequent agent label and response.",
          source: "visible_ui",
        });
      }
    }

    if (
      normLabel &&
      !AI_LABEL_EXCLUDE.test(normLabel) &&
      (HUMAN_LABEL_PATTERNS.some((re) => re.test(normLabel)) || turn.role === "support_agent")
    ) {
      const meta = turn.metadata;
      const hasAiMarkerOnHumanNode = Boolean(meta && (meta.machineReadableAi === true || typeof meta.aiMarker === "string"));
      const hasHeavyStreamOnHumanNode = Boolean(meta && typeof meta.streamingChunks === "number" && meta.streamingChunks >= 6);

      if (hasAiMarkerOnHumanNode || hasHeavyStreamOnHumanNode) {
        items.push({
          id: `ev-fake-handoff-${seq++}`,
          code: "FAKE_HUMAN_HANDOFF_CONTRADICTION",
          direction: "contradiction",
          strength: "strong",
          observedAt,
          turnIds: [turn.id],
          excerptRedacted: createRedactedExcerpt(normLabel),
          explanation: `Turn labeled "${createRedactedExcerpt(normLabel, 48)}" as a human agent still carries AI machine-readable markers or heavy token-streaming behavior.`,
          source: "platform_adapter",
        });
        darkPatterns.push({
          id: `dp-fake-handoff-${dpSeq++}`,
          code: "FAKE_HUMAN_HANDOFF",
          observedAt,
          turnIds: [turn.id],
          explanation:
            "A purported human support agent turn exhibits conflicting machine-readable AI markers or streamed LLM output (suspected fake handoff).",
        });
      } else {
        items.push({
          id: `ev-human-label-${seq++}`,
          code: "HUMAN_AGENT_LABEL_VISIBLE",
          direction: "human_identity",
          strength: "direct",
          observedAt,
          turnIds: [turn.id],
          excerptRedacted: createRedactedExcerpt(normLabel),
          explanation: `Chat interface displays a support agent identity label ("${createRedactedExcerpt(normLabel, 48)}").`,
          alternativeExplanation:
            "A human support agent may still use canned macros or AI-assisted reply drafting.",
          source: "visible_ui",
        });
      }
    }
  }

  return { evidence: items, darkPatterns };
}


export function detectHandoffFriction(
  session,
  hasHandoffOrHuman){
  const requestTurnIds = [];
  let lastRequestTs = session.startedAt;

  for (const turn of session.turns) {
    if (turn.role !== "visitor") {
      continue;
    }
    if (VISITOR_HUMAN_REQUEST_PATTERNS.some((re) => re.test(normalizeForDetection(turn.text)))) {
      requestTurnIds.push(turn.id);
      lastRequestTs = turn.timestamp ?? lastRequestTs;
    }
  }

  const requestCount = requestTurnIds.length;
  const detected = requestCount >= 2 && !hasHandoffOrHuman;

  if (!detected) {
    return {
      report: {
        detected: false,
        requestCount,
        requestTurnIds,
        escalated: hasHandoffOrHuman,
        summary:
          requestCount === 0
            ? "No repeated human-escalation friction observed."
            : hasHandoffOrHuman
            ? `Visitor requested a human (${requestCount}x) and a handoff or human agent was observed.`
            : "Visitor requested a human once without observed escalation yet.",
      },
      evidence: [],
      darkPatterns: [],
    };
  }

  const summary = `Visitor explicitly requested a human agent ${requestCount} times (${requestTurnIds.join(", ")}) with no observed handoff or human escalation.`;

  return {
    report: {
      detected: true,
      requestCount,
      requestTurnIds,
      escalated: false,
      summary,
    },
    evidence: [
      {
        id: "ev-handoff-friction-1",
        code: "HANDOFF_FRICTION_OBSERVED",
        direction: "automation",
        strength: "strong",
        observedAt: lastRequestTs,
        turnIds: requestTurnIds,
        explanation: summary,
        alternativeExplanation:
          "Live support may be offline outside business hours or queued without a visible transfer notice.",
        source: "conversation_pattern",
      },
    ],
    darkPatterns: [
      {
        id: "dp-handoff-loop-1",
        code: "HANDOFF_LOOP_FRICTION",
        observedAt: lastRequestTs,
        turnIds: requestTurnIds,
        explanation:
          "Repeated consumer requests for a human agent did not trigger a visible escalation path (human escape friction).",
      },
    ],
  };
}
