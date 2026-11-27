import fs from "node:fs";
import vm from "node:vm";
import { analyzeConversation } from "../packages/core/dist/index.mjs";

const contentScriptSource = fs.readFileSync("apps/extension/content.js", "utf8");

/**
 * Minimal DOM + Shadow DOM + ComputedStyle + MutationObserver harness
 * to execute apps/extension/content.js verbatim against simulated US live-chat widgets.
 */
function createDomHarness({ hostname, href, rootTree, iframes = [] }) {
  class FakeElement {
    constructor(def, parent = null) {
      this.nodeType = 1;
      this.tagName = (def.tag || "div").toUpperCase();
      this.id = def.id || "";
      this.className = def.className || "";
      this.attrs = { ...(def.attrs || {}) };
      if (this.id) this.attrs.id = this.id;
      if (this.className) this.attrs.class = this.className;
      this.style = {
        color: "rgb(15, 23, 42)",
        backgroundColor: "rgba(0, 0, 0, 0)",
        fontSize: "14px",
        opacity: "1",
        display: "block",
        visibility: "visible",
        ...(def.style || {}),
      };
      this.parentElement = parent;
      this._ownText = def.text || "";
      this.children = (def.children || []).map((c) => new FakeElement(c, this));
      this.shadowRoot = def.shadowRoot
        ? new FakeElement({ tag: "shadow-root", children: def.shadowRoot }, this)
        : null;
    }

    get textContent() {
      if (this.children.length === 0) return this._ownText;
      return this._ownText + this.children.map((c) => c.textContent).join(" ");
    }

    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    }

    matches(selectorList) {
      return selectorList.split(",").some((raw) => {
        const sel = raw.trim();
        if (!sel) return false;
        if (sel === "*") return true;
        if (sel.startsWith("#")) return this.id === sel.slice(1);
        if (sel.startsWith(".")) return this.className.split(/\s+/).includes(sel.slice(1));
        const tagCls = /^([a-z0-9-]+)\.([a-z0-9_-]+)$/i.exec(sel);
        if (tagCls) return this.tagName.toLowerCase() === tagCls[1].toLowerCase() && this.className.split(/\s+/).includes(tagCls[2]);
        const attrEq = /^\[([^=\]]+)=['"]([^'"]+)['"]\]$/.exec(sel);
        if (attrEq) return this.getAttribute(attrEq[1]) === attrEq[2];
        const attrHas = /^\[([^=\]]+)\]$/.exec(sel);
        if (attrHas) return this.getAttribute(attrHas[1]) !== null;
        if (sel === "details:not([open])") {
          return this.tagName === "DETAILS" && this.getAttribute("open") === null;
        }
        if (sel === "footer") return this.tagName === "FOOTER";
        return this.tagName.toLowerCase() === sel.toLowerCase();
      });
    }

    closest(selectorList) {
      let cur = this;
      while (cur) {
        if (cur.matches && cur.matches(selectorList)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }

    querySelectorAll(selectorList) {
      const out = [];
      const walk = (node) => {
        for (const child of node.children) {
          if (child.matches(selectorList)) out.push(child);
          walk(child);
        }
      };
      walk(this);
      return out;
    }

    querySelector(selectorList) {
      return this.querySelectorAll(selectorList)[0] || null;
    }
  }

  const body = new FakeElement({ tag: "body", style: { backgroundColor: "rgb(255, 255, 255)" }, children: rootTree });
  const iframeEls = iframes.map((f) => ({
    id: f.id || "",
    name: f.name || "",
    title: f.title || "",
    src: f.src || "",
    get contentDocument() {
      throw new Error("Blocked cross-origin frame");
    },
  }));

  const documentObj = {
    body,
    documentElement: body,
    querySelectorAll(sel) {
      if (sel === "iframe") return iframeEls;
      return body.querySelectorAll(sel);
    },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
  };

  let lastSnapshot = null;
  let msgListener = null;
  const observedTargets = [];

  class FakeMutationObserver {
    constructor(cb) {
      this.cb = cb;
    }
    observe(target) {
      observedTargets.push(target);
    }
    disconnect() {}
  }

  const sandbox = {
    window: null,
    document: documentObj,
    location: { hostname, href },
    Node: { ELEMENT_NODE: 1 },
    MutationObserver: FakeMutationObserver,
    URL,
    Date,
    Math,
    Number,
    Object,
    Array,
    Map,
    Set,
    WeakMap,
    WeakSet,
    RegExp,
    String,
    Boolean,
    parseFloat,
    parseInt,
    setTimeout,
    clearTimeout,
    chrome: {
      runtime: {
        sendMessage(msg) {
          if (msg?.type === "LCL_SESSION_UPDATE") lastSnapshot = msg.session;
          return Promise.resolve();
        },
        onMessage: {
          addListener(fn) {
            msgListener = fn;
          },
        },
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.getComputedStyle = (el) => el.style;

  vm.runInNewContext(contentScriptSource, sandbox);
  msgListener({ type: "LCL_BEGIN_OBSERVING" }, {}, () => {});

  return { snapshot: lastSnapshot, observedTargets };
}

const WIDGET_SCENARIOS = [
  {
    name: "Salesforce Agentforce (Open Shadow DOM + AI Disclosure)",
    hostname: "help.us-carrier-demo.com",
    href: "https://help.us-carrier-demo.com/support",
    rootTree: [
      {
        tag: "div",
        id: "agentforce-host",
        shadowRoot: [
          {
            tag: "div",
            className: "embeddedMessagingConversationContainer",
            children: [
              {
                tag: "div",
                className: "embeddedMessagingConversationMessage",
                attrs: { "data-role": "assistant", "data-message-id": "sf-1", "data-ai-generated": "true" },
                text: "Hi! I am your Agentforce AI assistant. We approved your full refund as future travel credit.",
              },
            ],
          },
        ],
      },
    ],
    verify(snapshot, observedTargets) {
      const analysis = analyzeConversation(snapshot);
      return {
        ok:
          snapshot.platformId === "salesforce_agentforce" &&
          snapshot.coverage.shadowDomDetected === true &&
          observedTargets.length >= 2 &&
          analysis.label === "AI_DISCLOSED" &&
          analysis.commitments[0]?.qualifier === "store_credit_only",
        detail: `platform=${snapshot.platformId}, shadow=${snapshot.coverage.shadowDomDetected}, observers=${observedTargets.length}, label=${analysis.label}, qual=${analysis.commitments[0]?.qualifier}`,
      };
    },
  },
  {
    name: "Ada Widget (Alpha-Composited rgba(0,0,0,0.05) Invisible Banner Dark Pattern)",
    hostname: "shop.us-retail-demo.com",
    href: "https://shop.us-retail-demo.com/returns",
    rootTree: [
      {
        tag: "div",
        className: "ada-embed-container",
        style: { backgroundColor: "rgb(255, 255, 255)" },
        children: [
          {
            tag: "div",
            className: "chat-disclosure-banner",
            style: { color: "rgba(0, 0, 0, 0.05)", fontSize: "13px", opacity: "1" },
            text: "Powered by AI",
          },
          {
            tag: "div",
            attrs: { "data-testid": "message-bubble", "data-role": "assistant", "data-message-id": "ada-1" },
            text: "Hello! How can I help with your return?",
          },
        ],
      },
    ],
    verify(snapshot) {
      const analysis = analyzeConversation(snapshot);
      const bannerEvt = snapshot.observedEvents.find((e) => e.type === "ai_disclosure_banner");
      const lowVis = analysis.darkPatterns.some((d) => d.code === "LOW_VISIBILITY_DISCLOSURE");
      return {
        ok:
          snapshot.platformId === "ada" &&
          bannerEvt?.metadata?.disclosureContrastRatio < 1.5 &&
          lowVis,
        detail: `platform=${snapshot.platformId}, contrast=${bannerEvt?.metadata?.disclosureContrastRatio}, lowVis=${lowVis}`,
      };
    },
  },
  {
    name: "Sierra Widget (0px Font-Size + Ancestor Opacity 0.1 Obscured Banner)",
    hostname: "app.us-saas-demo.com",
    href: "https://app.us-saas-demo.com/billing",
    rootTree: [
      {
        tag: "div",
        className: "sierra-chat-container",
        style: { backgroundColor: "rgb(255, 255, 255)" },
        children: [
          {
            tag: "div",
            style: { opacity: "0.1" },
            children: [
              {
                tag: "div",
                attrs: { "data-lcl-banner": "true" },
                style: { color: "rgb(0, 0, 0)", fontSize: "0px", opacity: "1" },
                text: "AI Virtual Concierge",
              },
            ],
          },
          {
            tag: "div",
            attrs: { "data-sierra-message": "true", "data-role": "assistant", "data-message-id": "sr-1" },
            text: "We cancelled your auto-renewal and you won't be charged again.",
          },
        ],
      },
    ],
    verify(snapshot) {
      const analysis = analyzeConversation(snapshot);
      const bannerEvt = snapshot.observedEvents.find((e) => e.type === "ai_disclosure_banner");
      const lowVis = analysis.darkPatterns.some((d) => d.code === "LOW_VISIBILITY_DISCLOSURE");
      return {
        ok:
          snapshot.platformId === "sierra" &&
          bannerEvt?.metadata?.disclosureFontSizePx === 0 &&
          bannerEvt?.metadata?.disclosureOpacity === 0.1 &&
          lowVis &&
          analysis.commitments.some((c) => c.category === "cancellation_terms"),
        detail: `platform=${snapshot.platformId}, fs=${bannerEvt?.metadata?.disclosureFontSizePx}, op=${bannerEvt?.metadata?.disclosureOpacity}, lowVis=${lowVis}`,
      };
    },
  },
  {
    name: "Intercom Fin (Cross-Origin Iframe Blocked Graceful Fallback)",
    hostname: "support.us-fintech-demo.com",
    href: "https://support.us-fintech-demo.com/help",
    rootTree: [],
    iframes: [
      { id: "intercom-frame", name: "intercom-messenger-frame", src: "https://widget.intercom.io/messenger" },
    ],
    verify(snapshot) {
      const analysis = analyzeConversation(snapshot);
      return {
        ok:
          snapshot.coverage.status === "blocked_cross_origin_iframe" &&
          snapshot.coverage.blockedIframeOrigins.includes("https://widget.intercom.io/*") &&
          analysis.label === "INCONCLUSIVE",
        detail: `coverage=${snapshot.coverage.status}, origins=${snapshot.coverage.blockedIframeOrigins.join(",")}, label=${analysis.label}`,
      };
    },
  },
  {
    name: "Obfuscated CSS-in-JS Widget (Random Hashed Classes -> Structural Heuristic Fallback)",
    hostname: "chat.us-telecom-demo.com",
    href: "https://chat.us-telecom-demo.com/support",
    rootTree: [
      {
        tag: "div",
        className: "css-8f9a1b",
        children: [
          {
            tag: "div",
            className: "css-3c2d1e",
            attrs: { "data-sender": "customer" },
            text: "Please cancel my auto-renewal and confirm no late fee.",
          },
          {
            tag: "div",
            className: "css-9e8d7c",
            text: "Hi! I am an AI assistant. I have cancelled your auto-renewal and waived the late fee.",
          },
        ],
      },
    ],
    verify(snapshot) {
      const analysis = analyzeConversation(snapshot);
      return {
        ok:
          snapshot.platformId === "heuristic_dom" &&
          snapshot.adapterId === "adapter-heuristic-v1" &&
          snapshot.turns.length === 2 &&
          analysis.label === "AI_DISCLOSED" &&
          analysis.commitments.some((c) => c.category === "cancellation_terms"),
        detail: `platform=${snapshot.platformId}, adapter=${snapshot.adapterId}, turns=${snapshot.turns.length}, label=${analysis.label}`,
      };
    },
  },
  {
    name: "Zendesk Messaging (US E-Commerce Conditional Restocking Fee Trap)",
    hostname: "support.us-electronics-demo.com",
    href: "https://support.us-electronics-demo.com/orders",
    rootTree: [
      {
        tag: "div",
        attrs: { "data-garden-id": "messaging" },
        children: [
          {
            tag: "div",
            attrs: { "data-garden-id": "messaging.message", "data-role": "assistant", "data-message-id": "zd-1" },
            text: "Hi! I am an AI support assistant. We have approved your refund minus a $15 return shipping fee.",
          },
        ],
      },
    ],
    verify(snapshot) {
      const analysis = analyzeConversation(snapshot);
      return {
        ok:
          snapshot.platformId === "zendesk" &&
          analysis.label === "AI_DISCLOSED" &&
          analysis.commitments[0]?.qualifier === "conditional",
        detail: `platform=${snapshot.platformId}, label=${analysis.label}, qual=${analysis.commitments[0]?.qualifier}`,
      };
    },
  },
  {
    name: "Gorgias (US Shopify/DTC Store-Credit Trap + Handoff Escalation Loop)",
    hostname: "help.us-dtc-brand.com",
    href: "https://help.us-dtc-brand.com/chat",
    rootTree: [
      {
        tag: "div",
        id: "gorgias-chat-container",
        children: [
          { tag: "div", className: "message-container", attrs: { "data-role": "visitor", "data-message-id": "g-1" }, text: "speak to a live person" },
          { tag: "div", className: "message-container", attrs: { "data-role": "unknown", "data-message-id": "g-2" }, text: "Before transferring you to a live agent, please select an option." },
          { tag: "div", className: "message-container", attrs: { "data-role": "visitor", "data-message-id": "g-3" }, text: "representative please" },
          { tag: "div", className: "message-container", attrs: { "data-role": "unknown", "data-message-id": "g-4" }, text: "We approved your refund as merchandise credit." },
        ],
      },
    ],
    verify(snapshot) {
      const analysis = analyzeConversation(snapshot);
      return {
        ok:
          snapshot.platformId === "gorgias" &&
          analysis.handoffFriction.detected === true &&
          analysis.commitments[0]?.qualifier === "store_credit_only",
        detail: `platform=${snapshot.platformId}, friction=${analysis.handoffFriction.detected}, qual=${analysis.commitments[0]?.qualifier}`,
      };
    },
  },
  {
    name: "Crisp (US SaaS Buried ToS Disclosure + Anthropomorphic Masking)",
    hostname: "app.us-b2b-saas.com",
    href: "https://app.us-b2b-saas.com/billing",
    rootTree: [
      {
        tag: "div",
        id: "crisp-chatbox",
        children: [
          {
            tag: "div",
            className: "cc-1s2d",
            attrs: { "data-role": "unknown", "data-message-id": "cr-1" },
            children: [
              { tag: "img", className: "agent-avatar" },
              { tag: "span", className: "message-text", text: "Hi! By chatting you agree to our Terms of Service where automated systems may assist with responses." },
            ],
          },
          {
            tag: "div",
            className: "cc-1s2d",
            attrs: { "data-role": "unknown", "data-message-id": "cr-2" },
            text: "How can I help with your subscription today?",
          },
        ],
      },
    ],
    verify(snapshot) {
      const analysis = analyzeConversation(snapshot);
      const hasBuried = analysis.darkPatterns.some((d) => d.code === "BURIED_TOS_DISCLOSURE");
      const hasAnthro = analysis.darkPatterns.some((d) => d.code === "ANTHROPOMORPHIC_MASKING");
      return {
        ok: snapshot.platformId === "crisp" && hasBuried && hasAnthro,
        detail: `platform=${snapshot.platformId}, buried=${hasBuried}, anthro=${hasAnthro}`,
      };
    },
  },
  {
    name: "Tidio (US Retailer Suspected Fake Human Handoff via AI DOM Marker)",
    hostname: "store.us-homegoods-demo.com",
    href: "https://store.us-homegoods-demo.com/support",
    rootTree: [
      {
        tag: "div",
        id: "tidio-chat",
        children: [
          {
            tag: "div",
            className: "message-operator",
            attrs: { "data-role": "support_agent", "data-visible-label": "Emily (Support Specialist)", "data-ai-generated": "true", "data-message-id": "td-1" },
            text: "Hi! Emily here, happy to help with your return.",
          },
        ],
      },
    ],
    verify(snapshot) {
      const analysis = analyzeConversation(snapshot);
      const hasFake = analysis.darkPatterns.some((d) => d.code === "FAKE_HUMAN_HANDOFF");
      return {
        ok: snapshot.platformId === "tidio" && hasFake && analysis.label === "MIXED_OR_HYBRID",
        detail: `platform=${snapshot.platformId}, fake=${hasFake}, label=${analysis.label}`,
      };
    },
  },
  {
    name: "US Bank Human-Only Support (Discussing AI Feature + Policy Denial -> 0% Human FPR)",
    hostname: "secure.us-bank-demo.com",
    href: "https://secure.us-bank-demo.com/messages",
    rootTree: [
      {
        tag: "div",
        attrs: { "data-lcl-chat-root": "true" },
        children: [
          {
            tag: "div",
            attrs: { "data-chat-message": "true", "data-role": "support_agent", "data-visible-label": "Marcus (Human Agent)", "data-message-id": "bk-1" },
            text: "Hi, Marcus here. That alert came from our AI assistant feature in beta — a full refund is not available for wire fees.",
          },
        ],
      },
    ],
    verify(snapshot) {
      const analysis = analyzeConversation(snapshot);
      return {
        ok:
          analysis.label === "HUMAN_AGENT_INDICATED" &&
          analysis.commitments.length === 0 &&
          analysis.darkPatterns.length === 0,
        detail: `label=${analysis.label}, cm=${analysis.commitments.length}, dp=${analysis.darkPatterns.length}`,
      };
    },
  },
];

let passed = 0;
console.log("=== LiveChatLens Extension DOM & Real US Widget Regression Harness ===");
for (const w of WIDGET_SCENARIOS) {
  const { snapshot, observedTargets } = createDomHarness(w);
  const res = w.verify(snapshot, observedTargets);
  if (res.ok) passed++;
  console.log(`${res.ok ? "PASS" : "FAIL"} [${w.name}] -> ${res.detail}`);
}
console.log(`\nSummary: ${passed}/${WIDGET_SCENARIOS.length} (${((passed / WIDGET_SCENARIOS.length) * 100).toFixed(1)}%)`);
if (passed < WIDGET_SCENARIOS.length) {
  process.exitCode = 1;
}
