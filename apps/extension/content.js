// LiveChatLens Content Script & Deep Shadow-DOM / Platform Adapter (v1.4.0-US)
// Features: Open Shadow DOM traversal & observation, WCAG 2.1 alpha-composited contrast audit,
// ancestor-opacity/0px visibility checks, virtual-scroll incremental turn memory, and MutationObserver streaming tracker.
// Read-only: never clicks controls, never sends messages, never reads unrelated form fields.

(function initLiveChatLensContent() {
  if (window.__LCL_CONTENT_INITIALIZED__) {
    return;
  }
  window.__LCL_CONTENT_INITIALIZED__ = true;

  function parseColor(str) {
    const raw = (str || "").trim().toLowerCase();
    if (!raw || raw === "transparent") {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    // Comma-separated rgb()/rgba()
    let m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(raw);
    if (m) {
      return {
        r: Number(m[1]),
        g: Number(m[2]),
        b: Number(m[3]),
        a: m[4] === undefined ? 1 : Number(m[4]),
      };
    }
    // CSS Color 4 space-separated rgb(r g b / a)
    m = /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(raw);
    if (m) {
      let a = 1;
      if (m[4] !== undefined) {
        a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : Number(m[4]);
      }
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
    }
    // 3-digit or 6-digit hex
    m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
    if (m) {
      const hex = m[1];
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
          a: 1,
        };
      }
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    return null;
  }

  function alphaComposite(fg, bg) {
    const a = Math.max(0, Math.min(1, fg.a));
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
      a: 1,
    };
  }

  function relativeLuminance(rgb) {
    const toLinear = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
  }

  function resolveEffectiveBackground(el) {
    let cur = el;
    while (cur && cur.nodeType === Node.ELEMENT_NODE) {
      const bg = parseColor(window.getComputedStyle(cur).backgroundColor);
      if (bg && bg.a > 0.1) return alphaComposite(bg, { r: 255, g: 255, b: 255, a: 1 });
      cur = cur.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  function computeEffectiveOpacity(el) {
    let eff = 1;
    let cur = el;
    while (cur && cur.nodeType === Node.ELEMENT_NODE) {
      const st = window.getComputedStyle(cur);
      if (st.display === "none" || st.visibility === "hidden") return 0;
      const op = parseFloat(st.opacity);
      if (Number.isFinite(op)) eff *= op;
      cur = cur.parentElement;
    }
    return Math.round(eff * 100) / 100;
  }

  function computeWcagContrast(el, effectiveOpacity = 1) {
    try {
      const fg = parseColor(window.getComputedStyle(el).color);
      const bg = resolveEffectiveBackground(el);
      if (!fg) return 7;
      const blendedFg = alphaComposite(
        { r: fg.r, g: fg.g, b: fg.b, a: fg.a * effectiveOpacity },
        bg
      );
      const l1 = relativeLuminance(blendedFg);
      const l2 = relativeLuminance(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      return Math.round(ratio * 100) / 100;
    } catch (_e) {
      return 7;
    }
  }

  function querySelectorAllDeep(root, selector, maxDepth = 4) {
    const results = [];
    const shadowRoots = [];
    let foundShadow = false;

    function walk(node, depth) {
      if (!node || depth > maxDepth) return;
      try {
        if (node.querySelectorAll) {
          const direct = node.querySelectorAll(selector);
          for (const el of direct) results.push(el);
          const allEls = node.querySelectorAll("*");
          for (const el of allEls) {
            if (el.shadowRoot) {
              foundShadow = true;
              shadowRoots.push(el.shadowRoot);
              walk(el.shadowRoot, depth + 1);
            }
          }
        }
      } catch (_e) {}
    }

    walk(root, 0);
    return { nodes: results, shadowDomDetected: foundShadow, shadowRoots };
  }

  function querySelectorDeep(root, selector) {
    const res = querySelectorAllDeep(root, selector);
    return {
      node: res.nodes[0] || null,
      shadowDomDetected: res.shadowDomDetected,
      shadowRoots: res.shadowRoots,
    };
  }

  const PROVIDER_PROBES = [
    {
      id: "salesforce_agentforce",
      containerSelector: ".embeddedMessagingConversationContainer, [data-aura-class*='embeddedMessaging'], .chasitorControls",
      messageSelector: ".embeddedMessagingConversationMessage, [data-message-id], [data-chat-message]",
    },
    {
      id: "ada",
      containerSelector: "#ada-chat-frame, .ada-embed-container, [data-testid='ada-chat']",
      messageSelector: "[data-testid='message-bubble'], .ada-message, [data-chat-message]",
    },
    {
      id: "sierra",
      containerSelector: "[data-sierra-chat], .sierra-chat-container",
      messageSelector: "[data-sierra-message], [data-chat-message]",
    },
    {
      id: "gorgias",
      containerSelector: "#gorgias-chat-container, .gorgias-chat-key",
      messageSelector: ".message-container, [data-chat-message]",
    },
    {
      id: "intercom",
      containerSelector: ".intercom-lightweight-app, #intercom-container, [data-testid='intercom-messenger']",
      messageSelector: "[data-testid='message-part'], .intercom-comment-container, [data-chat-message]",
    },
    {
      id: "zendesk",
      containerSelector: "[data-garden-id='messaging'], #webWidget",
      messageSelector: "[data-garden-id='messaging.message'], [data-chat-message]",
    },
    {
      id: "crisp",
      containerSelector: "#crisp-chatbox, .crisp-client",
      messageSelector: ".cc-1s2d, [data-chat-message]",
    },
    {
      id: "tidio",
      containerSelector: "#tidio-chat",
      messageSelector: ".message-operator, .message-visitor, [data-chat-message]",
    },
    {
      id: "generic_dom",
      containerSelector: "[data-lcl-chat-root], [role='log'], [aria-live='polite'], .chat-messages, .livechat-messages",
      messageSelector: "[data-chat-message], [data-message-id], .chat-message, .message-item, li[data-role]",
    },
  ];

  const ALL_MESSAGE_SELECTORS = Array.from(
    new Set(
      PROVIDER_PROBES.flatMap((p) =>
        p.messageSelector.split(",").map((s) => s.trim())
      )
    )
  ).join(", ");

  let observer = null;
  const observedShadowRoots = new WeakSet();
  let startedAt = Date.now();
  let debounceTimer = null;
  const nodeRenderStats = new WeakMap();
  const turnMemory = new Map();
  const eventMemory = new Map();

  function attachShadowObservers(shadowRoots) {
    if (!observer || !shadowRoots) return;
    for (const sr of shadowRoots) {
      if (!observedShadowRoots.has(sr)) {
        observedShadowRoots.add(sr);
        try {
          observer.observe(sr, { childList: true, subtree: true, characterData: true });
        } catch (_e) {}
      }
    }
  }


  function detectHeuristicChatContainer() {
    const candidates = querySelectorAllDeep(document, "div, section, ul, main, [role='log'], [aria-live]").nodes;
    let best = null;
    let bestCount = 0;
    for (const el of candidates) {
      const tag = (el.tagName || "").toUpperCase();
      if (tag === "BODY" || tag === "HTML" || tag === "NAV" || tag === "HEADER" || tag === "FOOTER") continue;
      const kids = el.children || [];
      if (kids.length < 2) continue;
      const msgLike = [];
      for (const child of kids) {
        const cTag = (child.tagName || "").toUpperCase();
        if (cTag === "SCRIPT" || cTag === "STYLE" || cTag === "NAV" || cTag === "INPUT" || cTag === "FORM") continue;
        const txt = (child.textContent || "").trim();
        if (txt.length >= 10 && txt.length <= 4000) {
          msgLike.push(child);
        }
      }
      if (msgLike.length >= 2 && msgLike.length > bestCount) {
        bestCount = msgLike.length;
        best = { container: el, nodes: msgLike };
      }
    }
    return best;
  }

  function detectProviderDeep() {
    let anyShadow = false;
    for (const p of PROVIDER_PROBES) {
      const hit = querySelectorDeep(document, p.containerSelector);
      if (hit.shadowDomDetected) anyShadow = true;
      attachShadowObservers(hit.shadowRoots);
      if (hit.node) return { provider: p, container: hit.node, shadowDomDetected: anyShadow };
    }
    return { provider: null, container: null, shadowDomDetected: anyShadow };
  }

  function detectBlockedChatIframes() {
    const iframes = Array.from(document.querySelectorAll("iframe"));
    const chatFrameHints = /(?:intercom|zendesk|zdassets|salesforce|force\.com|agentforce|ada\.support|sierra|gorgias|crisp|tidio|drift|livechat|freshchat|hubspot|tawk|chat)/i;
    const blockedOrigins = [];
    for (const frame of iframes) {
      const hintText = `${frame.id} ${frame.name} ${frame.title} ${frame.src}`;
      if (!chatFrameHints.test(hintText)) continue;
      try {
        const doc = frame.contentDocument;
        if (!doc && frame.src) {
          const origin = new URL(frame.src).origin + "/*";
          if (!blockedOrigins.includes(origin)) blockedOrigins.push(origin);
        }
      } catch (_e) {
        if (frame.src) {
          try {
            const origin = new URL(frame.src).origin + "/*";
            if (!blockedOrigins.includes(origin)) blockedOrigins.push(origin);
          } catch (_urlErr) {}
        }
      }
    }
    return blockedOrigins;
  }

  function inferRoleFromNode(node) {
    const attrRole = (
      node.getAttribute("data-role") ||
      node.getAttribute("data-sender") ||
      ""
    ).toLowerCase();
    if (attrRole.includes("visitor") || attrRole.includes("user") || attrRole.includes("customer")) return "visitor";
    if (attrRole.includes("system") || attrRole.includes("notice")) return "system";
    if (attrRole.includes("assistant") || attrRole.includes("ai") || attrRole.includes("bot")) return "assistant";
    if (attrRole.includes("agent") || attrRole.includes("human") || attrRole.includes("support")) return "support_agent";
    const cls = (node.className || "").toString().toLowerCase();
    if (cls.includes("visitor") || cls.includes("outgoing") || cls.includes("user")) return "visitor";
    if (cls.includes("system") || cls.includes("notice")) return "system";
    return "unknown";
  }

  function extractSnapshot() {
    const { provider, container, shadowDomDetected } = detectProviderDeep();
    const blockedIframeOrigins = detectBlockedChatIframes();
    let msgSearch = container
      ? querySelectorAllDeep(container, provider.messageSelector)
      : { nodes: [], shadowDomDetected: false, shadowRoots: [] };
    attachShadowObservers(msgSearch.shadowRoots);
    let messageNodes = msgSearch.nodes;
    let usedHeuristic = false;
    if (messageNodes.length === 0) {
      const heur = detectHeuristicChatContainer();
      if (heur && heur.nodes.length >= 2) {
        messageNodes = heur.nodes;
        usedHeuristic = true;
      }
    }

    if (!eventMemory.has("evt-widget-open")) {
      eventMemory.set("evt-widget-open", {
        id: "evt-widget-open",
        type: "widget_opened",
        observedAt: startedAt,
        label: provider
          ? `Detected adapter: ${provider.id}${shadowDomDetected ? " (Shadow DOM)" : ""}`
          : "Scanning active tab",
      });
    }

    if (container) {
      const bannerHit = querySelectorDeep(
        container,
        "[data-lcl-banner], .chat-disclosure-banner, [data-disclosure]"
      );
      const bannerNode = bannerHit.node;
      if (bannerNode && bannerNode.textContent && bannerNode.textContent.trim()) {
        const computed = window.getComputedStyle(bannerNode);
        const parsedFs = parseFloat(computed.fontSize);
        const fontSizePx = Number.isFinite(parsedFs) ? parsedFs : 13;
        const effectiveOpacity = computeEffectiveOpacity(bannerNode);
        const contrastRatio = computeWcagContrast(bannerNode, effectiveOpacity);
        eventMemory.set("evt-banner-1", {
          id: "evt-banner-1",
          type: "ai_disclosure_banner",
          observedAt: startedAt + 100,
          label: "Visible disclosure banner",
          details: bannerNode.textContent.trim().slice(0, 200),
          metadata: {
            disclosureFontSizePx: Math.round(fontSizePx * 10) / 10,
            disclosureOpacity: effectiveOpacity,
            disclosureContrastRatio: contrastRatio,
            disclosureInCollapsedFooter: Boolean(bannerNode.closest("details:not([open]), footer")),
          },
        });
      }
    }

    messageNodes.forEach((node, idx) => {
      const textNode = node.querySelector("[data-message-text], .message-text") || node;
      const text = (textNode.textContent || "").trim();
      if (!text) return;

      const labelNode = node.querySelector("[data-sender-label], .sender-label");
      const visibleLabel =
        node.getAttribute("data-visible-label") ||
        (labelNode ? (labelNode.textContent || "").trim() : undefined);

      const stats = nodeRenderStats.get(node);
      const metadata = {};
      if (stats) {
        metadata.streamingChunks = stats.chunks;
        metadata.renderDurationMs = Math.max(0, stats.lastAt - stats.firstAt);
      }

      if (
        node.getAttribute("data-ai-generated") === "true" ||
        node.getAttribute("data-ai-system") ||
        (node.getAttribute("aria-roledescription") || "").toLowerCase().includes("ai")
      ) {
        metadata.machineReadableAi = true;
        metadata.aiMarker =
          node.getAttribute("data-ai-system") ||
          (node.getAttribute("data-ai-generated") === "true"
            ? "data-ai-generated=true"
            : "aria-roledescription=ai");
      }

      if (node.querySelector("img.agent-avatar, [data-human-avatar='true']")) {
        metadata.hasHumanAvatar = true;
      }

      const stableId =
        node.getAttribute("data-message-id") || `dom-t${idx + 1}-${text.slice(0, 20)}`;
      const existing = turnMemory.get(stableId);

      turnMemory.set(stableId, {
        id: stableId,
        role: inferRoleFromNode(node),
        visibleLabel: visibleLabel || existing?.visibleLabel || undefined,
        text,
        timestamp:
          existing?.timestamp ||
          Number(node.getAttribute("data-timestamp")) ||
          startedAt + (turnMemory.size + 1) * 1000,
        sourceElement: provider ? provider.id : "generic_dom",
        metadata: Object.keys(metadata).length > 0 ? { ...(existing?.metadata || {}), ...metadata } : existing?.metadata,
      });
    });

    const turns = Array.from(turnMemory.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const observedEvents = Array.from(eventMemory.values());

    let coverageStatus = "empty";
    const notes = [];
    if (turns.length > 0) {
      coverageStatus = blockedIframeOrigins.length > 0 ? "partial" : "full";
    } else if (blockedIframeOrigins.length > 0) {
      coverageStatus = "blocked_cross_origin_iframe";
      notes.push(
        `Detected ${blockedIframeOrigins.length} cross-origin chat iframe(s). Grant optional host permission in the Side Panel to inspect inside.`
      );
    } else {
      notes.push("No readable live-chat container detected on this frame yet.");
    }

    return {
      sessionId: `tab-${location.hostname || "local"}-${startedAt}`,
      platformId: provider ? provider.id : (usedHeuristic ? "heuristic_dom" : "unknown_web"),
      adapterId: provider ? `adapter-${provider.id}-v3` : (usedHeuristic ? "adapter-heuristic-v1" : "adapter-generic-v3"),
      pageUrl: location.href,
      startedAt,
      turns,
      observedEvents,
      coverage: {
        status: coverageStatus,
        readableTurns: turns.length,
        iframeDetected: blockedIframeOrigins.length > 0,
        shadowDomDetected: shadowDomDetected || msgSearch.shadowDomDetected,
        blockedIframeOrigins,
        notes,
      },
    };
  }

  function emitSnapshot() {
    const snapshot = extractSnapshot();
    chrome.runtime.sendMessage({
      type: "LCL_SESSION_UPDATE",
      session: snapshot,
    }).catch(() => {});
  }

  function beginObserving() {
    if (observer) observer.disconnect();
    startedAt = Date.now();
    turnMemory.clear();
    eventMemory.clear();
    const target = document.body || document.documentElement;
    if (!target) return;

    observer = new MutationObserver((mutations) => {
      const now = Date.now();
      for (const m of mutations) {
        const el =
          m.target.nodeType === Node.ELEMENT_NODE
            ? m.target
            : m.target.parentElement;
        if (!el) continue;
        const msgRoot = el.closest(ALL_MESSAGE_SELECTORS);
        if (msgRoot) {
          const prev = nodeRenderStats.get(msgRoot) || { chunks: 0, firstAt: now, lastAt: now };
          prev.chunks += 1;
          prev.lastAt = now;
          nodeRenderStats.set(msgRoot, prev);
        }
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(emitSnapshot, 180);
    });

    observer.observe(target, { childList: true, subtree: true, characterData: true });
    emitSnapshot();
  }

  function endObserving() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "LCL_BEGIN_OBSERVING") {
      beginObserving();
      sendResponse({ ok: true });
    } else if (message?.type === "LCL_END_OBSERVING") {
      endObserving();
      sendResponse({ ok: true });
    }
  });
})();
