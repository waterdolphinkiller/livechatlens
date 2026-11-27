(function initSidePanel() {
  const {
    analyzeConversation,
    formatSanitizedReceiptMarkdown,
    buildChargebackNarrative,
    buildDisputeEvidencePdf,
    buildRegulatoryComplaintPacket,
    buildSealedEvidenceZip,
    buildRfc3161Request,
    inspectRfc3161Token,
    sha256BytesHex,
  } = window.LiveChatLensCore;

  let lastResult = null;
  let lastSession = null;
  let blockedOrigins = [];
  let selectedIssuer = "chase";
  let tsaAnchor = null;

  const el = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function flashButton(btn, label) {
    const orig = btn.textContent;
    btn.textContent = label;
    setTimeout(() => {
      btn.textContent = orig;
    }, 1400);
  }

  function renderNarrativeBox(result) {
    if (!result) return;
    const nar = buildChargebackNarrative(result, { issuer: selectedIssuer });
    el("narrativeChars").textContent = `${nar.charCount}/${nar.maxChars}`;
    el("narrativePreview").textContent = nar.narrative;
  }

  function renderResult(result) {
    lastResult = result;
    el("verdictBadge").textContent = `${result.label} (${result.evidenceLevel})`;
    el("coverageBadge").textContent = `coverage: ${result.coverage.status}${
      result.coverage.shadowDomDetected ? " · Shadow DOM" : ""
    } · ${result.coverage.readableTurns} turns`;
    el("summaryText").textContent = result.summary;
    const mrText = result.transparencyAudit.machineReadableMarkers?.length
      ? ` · Machine-readable: ${result.transparencyAudit.machineReadableMarkers.join(", ")}`
      : "";
    el("transparencyLine").textContent = `Transparency Audit: ${result.transparencyAudit.status}${mrText}`;
    el("hashText").textContent = result.receipt.sha256;

    if (result.receipt.combinedSha256) {
      el("combinedHashRow").classList.remove("hidden");
      el("combinedHashText").textContent = result.receipt.combinedSha256;
    } else {
      el("combinedHashRow").classList.add("hidden");
    }

    renderNarrativeBox(result);

    blockedOrigins = result.coverage.blockedIframeOrigins || [];
    if (blockedOrigins.length > 0) {
      el("iframeUnlockBox").classList.remove("hidden");
    } else {
      el("iframeUnlockBox").classList.add("hidden");
    }

    const dpBox = el("darkPatternContainer");
    if (!result.darkPatterns || !result.darkPatterns.length) {
      dpBox.innerHTML = "";
    } else {
      dpBox.innerHTML = result.darkPatterns
        .map(
          (dp) => `
          <div class="alert-box">
            <div><strong>Dark Pattern · ${escapeHtml(dp.code)}</strong></div>
            <div class="muted" style="color:#fecdd3; margin-top:2px;">${escapeHtml(dp.explanation)}</div>
          </div>`
        )
        .join("");
    }

    const evBox = el("evidenceContainer");
    if (!result.evidence.length) {
      evBox.innerHTML = `<div class="muted">No direct or strong observable evidence recorded.</div>`;
    } else {
      evBox.innerHTML = result.evidence
        .map(
          (ev) => `
          <div style="padding: 7px 0; border-bottom: 1px solid rgba(148,163,184,0.12);">
            <div><strong>[${escapeHtml(ev.strength.toUpperCase())}] ${escapeHtml(ev.code)}</strong></div>
            <div>${escapeHtml(ev.explanation)}</div>
            ${ev.excerptRedacted ? `<div class="muted">Redacted excerpt: ${escapeHtml(ev.excerptRedacted)}</div>` : ""}
          </div>`
        )
        .join("");
    }

    const cmBox = el("commitmentContainer");
    if (!result.commitments.length) {
      cmBox.innerHTML = `<div class="muted">No refund, pricing, or auto-renewal commitments flagged.</div>`;
    } else {
      cmBox.innerHTML = result.commitments
        .map(
          (cm) => `
          <div class="risk-box">
            <div><strong>${escapeHtml(cm.category)}</strong> [${escapeHtml(cm.qualifier)}] · ${escapeHtml(cm.speakerStateAtTurn)}</div>
            <div style="margin: 4px 0;">“${escapeHtml(cm.excerptRedacted)}”</div>
            <div class="muted">${escapeHtml(cm.riskNote)}</div>
          </div>`
        )
        .join("");
    }

    const defBox = el("defenseContainer");
    if (!result.defensePrompts || !result.defensePrompts.length) {
      defBox.innerHTML = "";
    } else {
      defBox.innerHTML = result.defensePrompts
        .map(
          (p) => `
          <div class="prompt-box">
            <div class="row">
              <strong>${escapeHtml(p.title)}</strong>
              <button class="btn copy-prompt-btn" data-text="${escapeHtml(p.en)}" type="button">Copy Prompt</button>
            </div>
            <div class="muted" style="margin-top: 4px;">${escapeHtml(p.en)}</div>
          </div>`
        )
        .join("");
    }
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  el("issuerSelect").addEventListener("change", (ev) => {
    selectedIssuer = ev.target.value;
    if (lastResult) renderNarrativeBox(lastResult);
  });

  el("copyNarrativeBtn").addEventListener("click", () => {
    if (!lastResult) return;
    const nar = buildChargebackNarrative(lastResult, { issuer: selectedIssuer });
    navigator.clipboard?.writeText(nar.narrative).catch(() => {});
    flashButton(el("copyNarrativeBtn"), "Copied!");
  });

  el("copyCfpbBtn").addEventListener("click", () => {
    if (!lastResult) return;
    const reg = buildRegulatoryComplaintPacket(lastResult);
    navigator.clipboard
      ?.writeText(`${reg.cfpb.whatHappened}\n\nDesired Resolution: ${reg.cfpb.desiredResolution}`)
      .catch(() => {});
    flashButton(el("copyCfpbBtn"), "Copied!");
  });

  el("copyAb1609Btn").addEventListener("click", () => {
    if (!lastResult) return;
    const reg = buildRegulatoryComplaintPacket(lastResult);
    navigator.clipboard?.writeText(reg.californiaAb1609.complaintDraft).catch(() => {});
    flashButton(el("copyAb1609Btn"), "Copied!");
  });

  el("anchorTsaBtn").addEventListener("click", () => {
    if (!lastResult) return;
    const tsaOrigin = "https://freetsa.org/*";
    const tsaUrl = "https://freetsa.org/tsr";
    chrome.permissions.request({ origins: [tsaOrigin] }, (granted) => {
      if (!granted) {
        el("tsaStatusLine").textContent = "RFC 3161 TSA Anchor: Permission declined (stays 100% offline).";
        return;
      }
      el("tsaStatusLine").textContent = "RFC 3161 TSA Anchor: Sending 32-byte SHA-256 hash only…";
      const reqBytes = buildRfc3161Request(lastResult.receipt.sha256);
      chrome.runtime.sendMessage(
        { type: "LCL_REQUEST_RFC3161", tsaUrl, reqBytes: Array.from(reqBytes) },
        (res) => {
          if (!res?.ok || !Array.isArray(res.tsrBytes)) {
            el("tsaStatusLine").textContent = `RFC 3161 TSA failed: ${res?.error || "unreachable"}`;
            return;
          }
          const tsrBytes = new Uint8Array(res.tsrBytes);
          const insp = inspectRfc3161Token(tsrBytes, lastResult.receipt.sha256);
          if (!insp.pkiStatusGranted || !insp.digestEmbedded) {
            el("tsaStatusLine").textContent = `RFC 3161 TSA invalid: ${insp.summary}`;
            return;
          }
          tsaAnchor = {
            tsaUrl: res.tsaUrl,
            tokenBytes: tsrBytes,
            timestampUtc: insp.genTimeUtc || new Date().toISOString(),
          };
          el("tsaStatusLine").textContent = `RFC 3161 Anchored: ${tsaAnchor.timestampUtc} (${tsaAnchor.tsaUrl})`;
        }
      );
    });
  });

  el("startBtn").addEventListener("click", () => {
    el("statusPill").textContent = "Inspecting";
    chrome.runtime.sendMessage({ type: "LCL_START_INSPECT" }, (res) => {
      if (!res?.ok) {
        el("statusPill").textContent = "Blocked";
        el("summaryText").textContent =
          res?.error || "Cannot inspect restricted browser pages (e.g. chrome://). Open a merchant website first.";
      }
    });
  });

  el("unlockIframeBtn").addEventListener("click", () => {
    if (!blockedOrigins.length) return;
    chrome.permissions.request({ origins: blockedOrigins }, (granted) => {
      if (granted) {
        el("iframeUnlockBox").classList.add("hidden");
        chrome.runtime.sendMessage({ type: "LCL_START_INSPECT" });
      }
    });
  });

  el("pauseBtn").addEventListener("click", () => {
    el("statusPill").textContent = "Paused";
    chrome.runtime.sendMessage({ type: "LCL_STOP_INSPECT" });
  });

  el("clearBtn").addEventListener("click", () => {
    lastResult = null;
    lastSession = null;
    blockedOrigins = [];
    tsaAnchor = null;
    el("statusPill").textContent = "Cleared";
    el("verdictBadge").textContent = "INCONCLUSIVE";
    el("coverageBadge").textContent = "coverage: empty";
    el("summaryText").textContent = "Local session memory cleared.";
    el("darkPatternContainer").innerHTML = "";
    el("evidenceContainer").innerHTML = `<div class="muted">No observable evidence yet.</div>`;
    el("commitmentContainer").innerHTML = `<div class="muted">No refund, pricing, or auto-renewal commitments flagged.</div>`;
    el("defenseContainer").innerHTML = "";
    el("narrativePreview").textContent = "Run inspection to generate an issuer-tailored bank dispute statement.";
    el("narrativeChars").textContent = "0/1000";
    el("hashText").textContent = "—";
    el("tsaStatusLine").textContent = "RFC 3161 TSA Anchor: Not anchored (optional)";
    el("combinedHashRow").classList.add("hidden");
    el("iframeUnlockBox").classList.add("hidden");
  });

  el("defenseContainer").addEventListener("click", (e) => {
    const btn = e.target.closest(".copy-prompt-btn");
    if (!btn) return;
    const text = btn.getAttribute("data-text") || "";
    navigator.clipboard?.writeText(text).catch(() => {});
    flashButton(btn, "Copied!");
  });

  el("capturePackBtn").addEventListener("click", () => {
    if (!lastSession) return;
    chrome.runtime.sendMessage({ type: "LCL_CAPTURE_EVIDENCE_SCREENSHOT" }, (res) => {
      if (!res?.ok || !res.dataUrl) {
        el("summaryText").textContent = "Screenshot failed — make sure the merchant tab is focused and try again.";
        return;
      }
      const b64 = res.dataUrl.split(",")[1] || "";
      const binStr = atob(b64);
      const pngBytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) pngBytes[i] = binStr.charCodeAt(i);
      const screenshotSha256 = sha256BytesHex(pngBytes);

      const boundResult = analyzeConversation(lastSession, {
        generatedAt: Date.now(),
        screenshotSha256,
      });
      renderResult(boundResult);

      const sealedZip = buildSealedEvidenceZip(boundResult, {
        screenshotBytes: pngBytes,
        issuer: selectedIssuer,
        tsaTokenBytes: tsaAnchor?.tokenBytes,
        tsaUrl: tsaAnchor?.tsaUrl,
        tsaTimestampUtc: tsaAnchor?.timestampUtc,
      });
      downloadFile(
        `livechatlens-sealed-${selectedIssuer}-${lastSession.sessionId}.zip`,
        sealedZip,
        "application/zip"
      );
    });
  });

  el("exportPdfBtn").addEventListener("click", () => {
    if (!lastResult || !lastSession) return;
    const pdfBytes = buildDisputeEvidencePdf(lastResult, {
      issuer: selectedIssuer,
      tsaTimestampUtc: tsaAnchor?.timestampUtc,
      tsaUrl: tsaAnchor?.tsaUrl,
    });
    downloadFile(
      `livechatlens-chargeback-${selectedIssuer}-${lastSession.sessionId}.pdf`,
      pdfBytes,
      "application/pdf"
    );
  });

  el("exportMdBtn").addEventListener("click", () => {
    if (!lastResult || !lastSession) return;
    downloadFile(
      `livechatlens-${lastSession.sessionId}.md`,
      formatSanitizedReceiptMarkdown(lastResult),
      "text/markdown;charset=utf-8"
    );
  });

  el("exportJsonBtn").addEventListener("click", () => {
    if (!lastResult || !lastSession) return;
    downloadFile(
      `livechatlens-${lastSession.sessionId}.json`,
      JSON.stringify(lastResult, null, 2),
      "application/json;charset=utf-8"
    );
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "LCL_PANEL_SNAPSHOT" && message.session) {
      lastSession = message.session;
      tsaAnchor = null;
      el("tsaStatusLine").textContent = "RFC 3161 TSA Anchor: Not anchored (optional)";
      const result = analyzeConversation(message.session, { generatedAt: Date.now() });
      renderResult(result);
    }
  });
})();
