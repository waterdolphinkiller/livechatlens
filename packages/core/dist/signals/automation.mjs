
import { createRedactedExcerpt, normalizeForDetection } from "../sanitizer.mjs";

const AUTO_REPLY_PATTERNS = [
  /\b(?:automated\s+reply|auto-reply|out\s+of\s+office|outside\s+business\s+hours|select\s+an?\s+option|reply\s+with\s+a\s+number|type\s+["']?\d["']?\s+for)\b/i,
  /(?:自动回复|非工作时间|请回复数字|请选择以下选项|输入数字|固定菜单|系統自動回覆)/i,
  /\b(?:balasan\s+automatik|sila\s+pilih\s+pilihan|taip\s+nombor|luar\s+waktu\s+pejabat)\b/i,
];

// Supports plain numeric menus (1. / 2.) and Emoji keycap menus (1️⃣ / 2️⃣)
const NUMBERED_MENU_PATTERN =
  /(?:(?:^|\n|\s)(?:1[.)、]|\[1\]|1\uFE0F?\u20E3)\s*\S+.+(?:\n|\s+)(?:2[.)、]|\[2\]|2\uFE0F?\u20E3)\s*\S+)/m;

const SELF_SERVICE_DEFLECTION_RE =
  /\b(?:orders?\s+(?:page|section)|my\s+orders|tracking\s+(?:link|details|page)|help\s+center|faq\s+page|self-service\s+portal)\b|(?:订单页面|自助查询|帮助中心|常见问题)/i;

function tokenize(text){
  const normalized = normalizeForDetection(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return new Set();
  }
  const words = normalized.split(" ").filter((w) => w.length > 1);
  if (words.length >= 3) {
    return new Set(words);
  }
  const compact = normalized.replace(/\s+/g, "");
  const grams = new Set();
  for (let i = 0; i < compact.length - 1; i++) {
    grams.add(compact.slice(i, i + 2));
  }
  return grams;
}

function jaccardSimilarity(a, b){
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection++;
    }
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function detectAutomationSignals(session){
  const items = [];
  let seq = 1;

  for (const event of session.observedEvents) {
    if (event.type === "menu_rendered") {
      items.push({
        id: `ev-auto-menu-evt-${seq++}`,
        code: "FAQ_MENU_WIDGET_OBSERVED",
        direction: "automation",
        strength: "strong",
        observedAt: event.observedAt,
        turnIds: event.turnId ? [event.turnId] : [],
        excerptRedacted: event.details ? createRedactedExcerpt(event.details) : event.label,
        explanation: "The chat widget rendered a scripted quick-reply or FAQ menu.",
        alternativeExplanation:
          "Menu prompts indicate scripted automation routing, not necessarily a generative LLM.",
        source: "platform_adapter",
      });
    }
  }

  const responderTurns = session.turns.filter(
    (t) => t.role !== "visitor" && t.role !== "system"
  );

  const deflectionTurnIds = [];
  let lastDeflectionTs = session.startedAt;

  for (const turn of responderTurns) {
    const observedAt = turn.timestamp ?? session.startedAt;
    const normText = normalizeForDetection(turn.text);

    if (AUTO_REPLY_PATTERNS.some((re) => re.test(normText))) {
      items.push({
        id: `ev-auto-notice-${seq++}`,
        code: "AUTO_REPLY_OR_MENU_PROMPT",
        direction: "automation",
        strength: "strong",
        observedAt,
        turnIds: [turn.id],
        excerptRedacted: createRedactedExcerpt(turn.text),
        explanation: "Message contains explicit auto-reply, out-of-hours, or menu-selection phrasing.",
        alternativeExplanation:
          "Could be an automated pre-chat router before a human joins, or a human pasting a standard intake prompt.",
        source: "conversation_pattern",
      });
    } else if (NUMBERED_MENU_PATTERN.test(normText)) {
      items.push({
        id: `ev-auto-numbered-${seq++}`,
        code: "NUMBERED_FAQ_MENU_TEXT",
        direction: "automation",
        strength: "strong",
        observedAt,
        turnIds: [turn.id],
        excerptRedacted: createRedactedExcerpt(turn.text),
        explanation: "Message presents a numbered or emoji-keycap option menu typical of rule-based FAQ bots.",
        alternativeExplanation:
          "Human support agents occasionally send numbered checklists as macros.",
        source: "conversation_pattern",
      });
    }

    if (SELF_SERVICE_DEFLECTION_RE.test(normText)) {
      deflectionTurnIds.push(turn.id);
      lastDeflectionTs = observedAt;
    }
  }

  // Paraphrase deflection loop: >= 3 turns repeatedly redirecting to self-service pages
  if (deflectionTurnIds.length >= 3) {
    items.push({
      id: `ev-auto-deflect-${seq++}`,
      code: "REPEATED_TOPIC_DEFLECTION",
      direction: "automation",
      strength: "strong",
      observedAt: lastDeflectionTs,
      turnIds: deflectionTurnIds,
      explanation: `Responder redirected the user to self-service pages across ${deflectionTurnIds.length} separate turns despite follow-up messages.`,
      alternativeExplanation:
        "Support agents following strict Tier-1 scripts may also repeatedly point customers to self-service portals.",
      source: "conversation_pattern",
    });
  }

  const tokenCache = responderTurns.map((t) => ({ turn: t, tokens: tokenize(t.text) }));
  const flaggedPairs = new Set();

  for (let i = 0; i < tokenCache.length; i++) {
    const first = tokenCache[i];
    if (!first || first.turn.text.trim().length < 24) {
      continue;
    }
    for (let j = i + 1; j < tokenCache.length; j++) {
      const second = tokenCache[j];
      if (!second || second.turn.text.trim().length < 24) {
        continue;
      }
      const similarity = jaccardSimilarity(first.tokens, second.tokens);
      if (similarity >= 0.82) {
        const pairKey = `${first.turn.id}:${second.turn.id}`;
        if (!flaggedPairs.has(pairKey)) {
          flaggedPairs.add(pairKey);
          items.push({
            id: `ev-auto-repeat-${seq++}`,
            code: "REPEATED_TEMPLATE_REPLY",
            direction: "automation",
            strength: similarity >= 0.95 ? "strong" : "weak",
            observedAt: second.turn.timestamp ?? session.startedAt,
            turnIds: [first.turn.id, second.turn.id],
            excerptRedacted: createRedactedExcerpt(second.turn.text),
            explanation: `Responder sent highly repetitive template replies across multiple turns (similarity ${Math.round(similarity * 100)}%).`,
            alternativeExplanation:
              "Human support agents frequently use canned macros or saved FAQ snippets; repetition alone does not prove an AI or bot.",
            source: "conversation_pattern",
          });
        }
      }
    }
  }

  return items;
}
