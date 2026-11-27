
import { createRedactedExcerpt } from "../sanitizer.mjs";

/**
 * Layer D (Timing / DOM Render Behaviour):
 * 1. Token-by-token streaming updates captured by MutationObserver (>=4 chunks, >=100 chars)
 * 2. Near-instant long-form text bursts (including 0ms single-commit bursts)
 * 3. Multi-turn rapid response latency (<= 5s for >= 120-char replies across >= 2 turns,
 *    measured from the most recent visitor turn even across multi-bubble filler replies)
 * Strictly emits WEAK supporting signals — never treated as proof of AI identity.
 */
export function detectTimingSignals(session){
  const items = [];
  let seq = 1;
  const rapidLatencyTurnIds = [];
  let lastRapidTs = session.startedAt;
  let minLatencyMs = Number.POSITIVE_INFINITY;
  let lastVisitorTs;

  for (let i = 0; i < session.turns.length; i++) {
    const turn = session.turns[i];
    if (!turn || turn.role === "system") {
      continue;
    }
    if (turn.role === "visitor") {
      if (typeof turn.timestamp === "number") {
        lastVisitorTs = turn.timestamp;
      }
      continue;
    }

    const observedAt = turn.timestamp ?? session.startedAt;
    const textLen = turn.text.trim().length;
    const meta = turn.metadata;

    if (meta) {
      const streamingChunks =
        typeof meta.streamingChunks === "number" ? meta.streamingChunks : 0;
      const hasRenderDuration = typeof meta.renderDurationMs === "number";
      const renderDurationMs = hasRenderDuration ? meta.renderDurationMs : -1;

      if (streamingChunks >= 4 && textLen >= 100) {
        items.push({
          id: `ev-timing-stream-${seq++}`,
          code: "STREAMING_TOKEN_RENDER_OBSERVED",
          direction: "ai_language",
          strength: "weak",
          observedAt,
          turnIds: [turn.id],
          excerptRedacted: createRedactedExcerpt(turn.text, 100),
          explanation: `Message rendered incrementally across ${streamingChunks} rapid DOM updates (${renderDurationMs >= 0 ? renderDurationMs : "n/a"} ms), consistent with streamed LLM output.`,
          alternativeExplanation:
            "Some chat widgets animate canned replies or agent messages incrementally; streaming alone does not prove an LLM generated the text.",
          source: "platform_adapter",
        });
      } else if (
        hasRenderDuration &&
        renderDurationMs >= 0 &&
        renderDurationMs <= 1200 &&
        (renderDurationMs > 0 || streamingChunks >= 1) &&
        textLen >= 220
      ) {
        items.push({
          id: `ev-timing-burst-${seq++}`,
          code: "INSTANT_LONG_BURST_OBSERVED",
          direction: "automation",
          strength: "weak",
          observedAt,
          turnIds: [turn.id],
          excerptRedacted: createRedactedExcerpt(turn.text, 100),
          explanation: `A ${textLen}-character reply appeared in ${renderDurationMs} ms, faster than typical manual typing.`,
          alternativeExplanation:
            "Human support agents routinely paste saved macros or knowledge-base answers in a single burst.",
          source: "platform_adapter",
        });
      }
    }

    if (lastVisitorTs !== undefined && typeof turn.timestamp === "number") {
      const deltaMs = turn.timestamp - lastVisitorTs;
      if (deltaMs >= 0 && deltaMs <= 5000 && textLen >= 120) {
        rapidLatencyTurnIds.push(turn.id);
        lastRapidTs = turn.timestamp;
        if (deltaMs < minLatencyMs) minLatencyMs = deltaMs;
        lastVisitorTs = undefined;
      }
    }
  }

  if (rapidLatencyTurnIds.length >= 2) {
    items.push({
      id: `ev-timing-latency-${seq++}`,
      code: "RAPID_LONG_RESPONSE_LATENCY",
      direction: "automation",
      strength: "weak",
      observedAt: lastRapidTs,
      turnIds: rapidLatencyTurnIds,
      explanation: `Observed ${rapidLatencyTurnIds.length} long replies (>=120 chars) arriving within <=5 seconds of visitor messages (fastest: ${minLatencyMs} ms).`,
      alternativeExplanation:
        "Human agents pasting saved macros or canned KB snippets can also reply within seconds; response speed alone does not prove AI identity.",
      source: "conversation_pattern",
    });
  }

  return items;
}
