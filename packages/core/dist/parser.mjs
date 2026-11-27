
const VISITOR_LABELS = /^(?:me|user|customer|visitor|you|client|我|用户|顾客|访客|买家|saya|pelanggan)$/i;
const SYSTEM_LABELS = /^(?:system|notice|banner|info|系统|提示|系统提示|notis|sistem)$/i;
const AI_LABELS = /\b(?:ai|bot|assistant|virtual|fin\s*ai|chatbot)\b|(?:AI|智能|机器|助手|Pembantu\s*AI)/i;
const AGENT_LABELS = /\b(?:live\s+agent|human\s+agent|support\s+specialist|customer\s+care\s+officer|representative|advisor)\b|(?:人工客服|真人客服|客服专员|pegawai\s+khidmat)/i;

const LINE_PATTERN =
  /^(?:\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*)?([^:：\n]{1,42})[:：]\s*(.+)$/;

function inferRole(label){
  const trimmed = label.trim();
  if (VISITOR_LABELS.test(trimmed)) return "visitor";
  if (SYSTEM_LABELS.test(trimmed)) return "system";
  if (AI_LABELS.test(trimmed)) return "assistant";
  if (AGENT_LABELS.test(trimmed)) return "support_agent";
  return "unknown";
}

function parseClockOffsetMs(clockText, baseMs, fallbackIdx){
  if (!clockText) {
    return baseMs + fallbackIdx * 8000;
  }
  const parts = clockText.split(":").map((n) => Number(n));
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  return baseMs + ((h * 3600 + m * 60 + s) * 1000);
}

/**
 * Parses free-form pasted live-chat transcripts into a normalized ConversationSession.
 * Supports formats like:
 *   [10:04] AI Assistant: Hi! How can I help?
 *   Me: Can I get a full refund?
 *   客服专员 · Aina: 您好，请问订单号是多少？
 */
export function parseTranscriptText(
  rawText,
  options = {}){
  const startedAt = options.startedAt ?? 1764200000000;
  const sessionId = options.sessionId ?? "pasted-session";
  const platformId = options.platformId ?? "pasted_transcript";

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const turns = [];
  const observedEvents = [
    { id: "evt-open", type: "widget_opened", observedAt: startedAt, label: "Pasted transcript loaded" },
  ];

  let turnSeq = 1;
  let evtSeq = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = LINE_PATTERN.exec(line);

    if (match) {
      const clock = match[1];
      const rawLabel = (match[2] ?? "").trim();
      const text = (match[3] ?? "").trim();
      const role = inferRole(rawLabel);
      const ts = parseClockOffsetMs(clock, startedAt, i + 1);

      if (role === "system") {
        const lower = text.toLowerCase();
        if (/(?:ai|virtual|automated|智能|人工|transfer|handoff|转接)/i.test(lower)) {
          const isHandoff = /(?:transfer|handoff|human|live\s+agent|转接|人工客服|pegawai)/i.test(text);
          observedEvents.push({
            id: `evt-sys-${evtSeq++}`,
            type: isHandoff ? "handoff_started" : "ai_disclosure_banner",
            observedAt: ts,
            label: rawLabel,
            details: text,
          });
        }
      }

      turns.push({
        id: `t${turnSeq++}`,
        role,
        visibleLabel: role === "visitor" || role === "system" ? undefined : rawLabel,
        text,
        timestamp: ts,
      });
    } else if (turns.length > 0) {
      // Continuation line belongs to previous turn
      const prev = turns[turns.length - 1];
      if (prev) {
        prev.text = `${prev.text}\n${line}`;
      }
    } else {
      turns.push({
        id: `t${turnSeq++}`,
        role: "unknown",
        text: line,
        timestamp: startedAt + (i + 1) * 8000,
      });
    }
  }

  return {
    sessionId,
    platformId,
    adapterId: "transcript-parser-v1",
    startedAt,
    turns,
    observedEvents,
    coverage: {
      status: turns.length > 0 ? "full" : "empty",
      readableTurns: turns.length,
      notes: ["Parsed from user-pasted plain text transcript."],
    },
  };
}
