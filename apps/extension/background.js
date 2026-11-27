// LiveChatLens MV3 Service Worker (v2.0.1-US)
// Minimal-permission orchestration: on-demand allFrames injection, activeTab screenshot capture,
// and opt-in CORS-free RFC 3161 TSA hash-only anchoring (zero transcript text leaves device).

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "LCL_START_INSPECT") {
    handleStartInspect(message.tabId)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (message?.type === "LCL_STOP_INSPECT") {
    handleStopInspect(message.tabId)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "LCL_CAPTURE_EVIDENCE_SCREENSHOT") {
    chrome.tabs
      .captureVisibleTab(null, { format: "png" })
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (message?.type === "LCL_REQUEST_RFC3161") {
    handleRfc3161Request(message.reqBytes, message.tsaUrl)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (message?.type === "LCL_SESSION_UPDATE") {
    chrome.runtime.sendMessage({
      type: "LCL_PANEL_SNAPSHOT",
      tabId: sender.tab?.id,
      frameId: sender.frameId ?? 0,
      session: message.session,
    }).catch(() => {});
  }

  return false;
});

async function handleRfc3161Request(reqByteArray, explicitTsaUrl) {
  const tsaUrl = explicitTsaUrl || "https://freetsa.org/tsr";
  if (!Array.isArray(reqByteArray) || reqByteArray.length < 32 || reqByteArray.length > 256) {
    return { ok: false, error: "Invalid RFC 3161 DER TimeStampReq payload." };
  }
  const body = new Uint8Array(reqByteArray);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(tsaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/timestamp-query" },
      body,
      signal: controller.signal,
    });
    if (!resp.ok) {
      return { ok: false, error: `TSA HTTP ${resp.status}` };
    }
    const tsrBytes = new Uint8Array(await resp.arrayBuffer());
    return { ok: true, tsaUrl, tsrBytes: Array.from(tsrBytes) };
  } finally {
    clearTimeout(timer);
  }
}

async function handleStartInspect(explicitTabId) {
  let tabId = explicitTabId;
  if (!tabId) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = activeTab?.id;
  }
  if (!tabId) {
    return { ok: false, error: "No active tab found." };
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["content.js"],
  });

  await chrome.tabs.sendMessage(tabId, { type: "LCL_BEGIN_OBSERVING" }).catch(() => {});
  return { ok: true, tabId, framesInjected: results.length };
}

async function handleStopInspect(explicitTabId) {
  let tabId = explicitTabId;
  if (!tabId) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = activeTab?.id;
  }
  if (!tabId) return;
  await chrome.tabs.sendMessage(tabId, { type: "LCL_END_OBSERVING" }).catch(() => {});
}
