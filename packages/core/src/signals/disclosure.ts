import type { ConversationSession, DarkPatternFlag, EvidenceItem } from "../types.js";
import { createRedactedExcerpt, normalizeForDetection } from "../sanitizer.js";

// Strictly require self-identification or interaction-framing so human agents
// discussing an "AI assistant" product feature or bot error are never falsely flagged.
const AI_DISCLOSURE_PATTERNS: RegExp[] = [
  /\b(?:i am|i'm|you(?:'re| are) (?:chatting|speaking|talking) with)\s+(?:(?:an?|your|our)\s+)?(?:(?:ai|artificial intelligence|virtual|automated)\s+){1,2}(?:support\s+)?(?:assistant|agent|bot|chatbot|concierge|helper)\b/i,
  /\b(?:this\s+(?:chat|conversation|support|assistant|bot|reply|response)|chat|support|replies?|responses?|i\s+am|i'm|we(?:'re|\s+are))\b.{0,28}\b(?:powered\s+by|generated\s+by|answered\s+by)\s+(?:(?:an?|our)\s+)?(?:ai|generative\s+ai|llm|artificial\s+intelligence)\b/i,
  /^(?:powered|generated|answered)\s+by\s+(?:(?:an?|our)\s+)?(?:ai|generative\s+ai|llm|artificial\s+intelligence)\b/i,
  /\b(?:this is|you are interacting with)\s+(?:(?:an?|our)\s+)?(?:ai|virtual|automated)\s+(?:support\s+)?(?:assistant|agent|bot|helper)(?!\s+(?:feature|tool|bug|error|issue|product|setting|option|update|beta|transfer|handoff))\b/i,
  /(?:我是|您正在与|您正在和|当前由|本回复由).{0,10}(?:AI|人工智能|智能客服|智能助手|虚拟助手|AI助手|AI客服|機器人|智能助理|智能小管家)/i,
  /(?:由\s*AI\s*生成|由人工智能生成)/i,
  /\b(?:saya ialah|anda sedang berbual dengan|dibantu oleh)\s+(?:pembantu\s+ai|pembantu\s+maya|pembantu\s+digital|ejen\s+ai|bot\s+ai|kecerdasan\s+buatan)\b/i,
];

const AI_LABEL_PATTERNS: RegExp[] = [
  /(?<![a-zA-Z])(?:ai\s*assistant|ai\s*agent|ai\s*bot|virtual\s*assistant|digital\s*concierge|smart\s*helper|fin\s*ai|ai\s*support)\b/i,
  /(?:AI\s*客服|AI\s*助手|智能客服|智能助手|智能小管家|Pembantu\s*AI|Pembantu\s*Digital)/i,
];

const BURIED_TOS_PATTERNS: RegExp[] = [
  /\b(?:by\s+chatting\s+you\s+agree|terms\s+of\s+service|tos|privacy\s+policy).{0,60}(?:automated\s+systems?|ai\s+systems?|virtual\s+assistants?)\s+may\s+assist\b/i,
  /\bautomated\s+systems?\s+may\s+assist\s+with\s+responses\b/i,
];

export interface DisclosureDetectionOutput {
  evidence: EvidenceItem[];
  darkPatterns: DarkPatternFlag[];
  machineReadableMarkers: string[];
}

export function detectDisclosureSignals(session: ConversationSession): DisclosureDetectionOutput {
  const items: EvidenceItem[] = [];
  const darkPatterns: DarkPatternFlag[] = [];
  const machineReadableMarkers: string[] = [];
  let seq = 1;
  let dpSeq = 1;

  for (const event of session.observedEvents) {
    if (event.type === "ai_disclosure_banner") {
      items.push({
        id: `ev-disclosure-evt-${seq++}`,
        code: "AI_DISCLOSURE_BANNER_VISIBLE",
        direction: "ai_disclosure",
        strength: "direct",
        observedAt: event.observedAt,
        turnIds: event.turnId ? [event.turnId] : [],
        excerptRedacted: event.details ? createRedactedExcerpt(event.details) : event.label,
        explanation: "The chat interface displayed an explicit AI disclosure banner or notice.",
        source: "visible_ui",
      });

      const meta = event.metadata;
      if (meta) {
        const fontSize = typeof meta.disclosureFontSizePx === "number" ? meta.disclosureFontSizePx : 14;
        const opacity = typeof meta.disclosureOpacity === "number" ? meta.disclosureOpacity : 1;
        const contrastRatio =
          typeof meta.disclosureContrastRatio === "number" ? meta.disclosureContrastRatio : 7;
        const collapsed = meta.disclosureInCollapsedFooter === true;
        const wcagThreshold = fontSize < 18 ? 4.5 : 3.0;
        if (fontSize < 11 || opacity < 0.55 || contrastRatio < wcagThreshold || collapsed) {
          darkPatterns.push({
            id: `dp-vis-${dpSeq++}`,
            code: "LOW_VISIBILITY_DISCLOSURE",
            observedAt: event.observedAt,
            turnIds: event.turnId ? [event.turnId] : [],
            explanation: `AI disclosure banner appears visually obscured (fontSize=${fontSize}px, opacity=${opacity}, WCAG contrast=${contrastRatio}:1 vs ${wcagThreshold}:1 AA minimum${collapsed ? ", collapsed footer" : ""}), which may hinder clear notice.`,
          });
        }
      }
    }
  }

  for (const turn of session.turns) {
    if (turn.role === "visitor") {
      continue;
    }

    const observedAt = turn.timestamp ?? session.startedAt;
    const meta = turn.metadata;
    const normText = normalizeForDetection(turn.text);
    const normLabel = normalizeForDetection(turn.visibleLabel ?? "");

    if (meta && (meta.machineReadableAi === true || typeof meta.aiMarker === "string")) {
      const markerName = typeof meta.aiMarker === "string" ? meta.aiMarker : "data-ai-generated=true";
      if (!machineReadableMarkers.includes(markerName)) {
        machineReadableMarkers.push(markerName);
      }
      items.push({
        id: `ev-disclosure-mr-${seq++}`,
        code: "AI_MACHINE_READABLE_MARKER",
        direction: "ai_disclosure",
        strength: "direct",
        observedAt,
        turnIds: [turn.id],
        excerptRedacted: createRedactedExcerpt(markerName, 80),
        explanation: `DOM node carries a machine-readable AI attribute (${markerName}).`,
        source: "platform_adapter",
      });
    }

    if (normLabel && AI_LABEL_PATTERNS.some((re) => re.test(normLabel))) {
      items.push({
        id: `ev-disclosure-label-${seq++}`,
        code: "AI_ROLE_LABEL_VISIBLE",
        direction: "ai_disclosure",
        strength: "direct",
        observedAt,
        turnIds: [turn.id],
        excerptRedacted: createRedactedExcerpt(normLabel),
        explanation: `Visible speaker label explicitly indicates an AI or digital assistant ("${createRedactedExcerpt(normLabel, 48)}").`,
        source: "visible_ui",
      });
    }

    if (AI_DISCLOSURE_PATTERNS.some((re) => re.test(normText))) {
      items.push({
        id: `ev-disclosure-text-${seq++}`,
        code: "AI_DISCLOSURE_TEXT_VISIBLE",
        direction: "ai_disclosure",
        strength: "direct",
        observedAt,
        turnIds: [turn.id],
        excerptRedacted: createRedactedExcerpt(turn.text),
        explanation: "Message content explicitly discloses an AI or virtual assistant.",
        alternativeExplanation:
          "A human agent could occasionally paste a standard AI-labeled greeting, though explicit disclosure is treated as direct UI evidence.",
        source: "visible_ui",
      });
    }

    if (BURIED_TOS_PATTERNS.some((re) => re.test(normText))) {
      items.push({
        id: `ev-disclosure-tos-${seq++}`,
        code: "BURIED_TOS_AUTOMATION_NOTICE",
        direction: "automation",
        strength: "strong",
        observedAt,
        turnIds: [turn.id],
        excerptRedacted: createRedactedExcerpt(turn.text),
        explanation: "Automation/AI assistance is only mentioned inside a parenthetical ToS or privacy footnote.",
        source: "visible_ui",
      });
      darkPatterns.push({
        id: `dp-tos-${dpSeq++}`,
        code: "BURIED_TOS_DISCLOSURE",
        observedAt,
        turnIds: [turn.id],
        explanation:
          "AI/automation disclosure is buried inside a Terms of Service / privacy notice rather than clearly stated upfront.",
      });
    }

    if (meta && meta.hasHumanAvatar === true && items.length > 0 && darkPatterns.length > 0) {
      const alreadyFlagged = darkPatterns.some((d) => d.code === "ANTHROPOMORPHIC_MASKING");
      if (!alreadyFlagged) {
        darkPatterns.push({
          id: `dp-anthro-${dpSeq++}`,
          code: "ANTHROPOMORPHIC_MASKING",
          observedAt,
          turnIds: [turn.id],
          explanation:
            "Chat widget pairs a human-like persona/avatar with obscured or low-visibility AI disclosure.",
        });
      }
    }
  }

  return { evidence: items, darkPatterns, machineReadableMarkers };
}
