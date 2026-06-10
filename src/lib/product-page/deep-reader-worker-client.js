const DEFAULT_WORKER_TIMEOUT_MS = 90000;
const MAX_WORKER_RESPONSE_CHARS = 750000;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeFailureReason(reason) {
  const normalized = cleanText(reason).toLowerCase().replace(/\s+/g, "_");
  const allowed = new Set([
    "blocked_by_bot_protection",
    "access_denied",
    "timeout",
    "unsupported_rendering_pattern",
    "unknown_error",
  ]);

  if (allowed.has(normalized)) {
    return normalized;
  }

  if (/bot|captcha|verification/.test(normalized)) return "blocked_by_bot_protection";
  if (/access|denied|forbidden/.test(normalized)) return "access_denied";
  if (/timeout|timed_out/.test(normalized)) return "timeout";
  if (/unsupported|rendering|playwright|chromium/.test(normalized)) return "unsupported_rendering_pattern";
  return "unknown_error";
}

function workerFailureToInternalReason(reason) {
  const normalized = normalizeFailureReason(reason);
  const labels = {
    blocked_by_bot_protection: "blocked by bot protection",
    access_denied: "access denied",
    timeout: "page timeout",
    unsupported_rendering_pattern: "unsupported rendering pattern",
    unknown_error: "unknown error",
  };

  return labels[normalized];
}

function workerFailureMode(reason) {
  const normalized = normalizeFailureReason(reason);
  if (normalized === "access_denied" || normalized === "blocked_by_bot_protection") {
    return "Deep read blocked";
  }
  if (normalized === "timeout") {
    return "Deep read timeout";
  }
  if (normalized === "unsupported_rendering_pattern") {
    return "Deep read unsupported";
  }
  return "Deep read unavailable";
}

function createWorkerFailedDeepRead(sourceUrl, reason, status = "failed") {
  return {
    status,
    sourceUrl,
    failureReason: workerFailureToInternalReason(reason),
    productionSource: "production_deep_read",
    counts: {
      tabsClicked: 0,
      accordionsOpened: 0,
      readMoreExpanded: 0,
      structuredDataBlocks: 0,
      relevantNetworkResponses: 0,
    },
    sectionLabels: [],
    textEvidence: [],
    structuredData: [],
    networkResponses: [],
    completedAt: new Date().toISOString(),
    mode: workerFailureMode(reason),
  };
}

function normalizeWorkerDeepReadResponse(payload, submittedUrl) {
  if (!payload || typeof payload !== "object") {
    return createWorkerFailedDeepRead(submittedUrl, "unknown_error");
  }

  const summary = payload.deepReadSummary || {};
  const evidenceRows = Array.isArray(payload.evidence) ? payload.evidence : [];
  const textEvidence = [];
  const structuredData = [];
  const networkResponses = [];

  for (const item of evidenceRows) {
    if (!item || typeof item !== "object") continue;

    const interactionType = cleanText(item.interactionType || "read");
    const base = {
      sourceUrl: cleanText(item.sourceUrl || payload.finalUrl || payload.sourceUrl || submittedUrl),
      sectionLabel: cleanText(item.sectionLabel || "Deep page read"),
      interactionType,
      selector: cleanText(item.selector || ""),
      timestamp: cleanText(item.capturedAt || item.timestamp || new Date().toISOString()),
    };

    if (item.json !== null && item.json !== undefined) {
      structuredData.push({
        ...base,
        summary: cleanText(item.text || JSON.stringify(item.json).slice(0, 2400)),
      });
    } else if (/network/i.test(interactionType)) {
      networkResponses.push({
        sourceUrl: base.sourceUrl,
        responseType: cleanText(item.responseType || "application/json"),
        summary: cleanText(item.text || ""),
        timestamp: base.timestamp,
      });
    } else {
      textEvidence.push({
        ...base,
        text: cleanText(item.text || "").slice(0, 12000),
      });
    }
  }

  return {
    status: ["success", "partial", "failed"].includes(payload.status) ? payload.status : "failed",
    sourceUrl: cleanText(payload.sourceUrl || submittedUrl),
    finalUrl: cleanText(payload.finalUrl || payload.sourceUrl || submittedUrl),
    failureReason: payload.failureReason ? workerFailureToInternalReason(payload.failureReason) : "",
    productionSource: "product_page_deep_read",
    mode: payload.status === "success"
      ? "Deep read successful"
      : payload.status === "partial"
      ? "Production deep read partial"
      : workerFailureMode(payload.failureReason),
    counts: {
      tabsClicked: Number(summary.tabsClicked || 0),
      accordionsOpened: Number(summary.accordionsOpened || 0),
      readMoreExpanded: Number(summary.readMoreExpanded || 0),
      structuredDataBlocks: Number(summary.structuredDataBlocksFound || 0),
      relevantNetworkResponses: Number(summary.networkResponsesCaptured || 0),
    },
    sectionLabels: Array.isArray(summary.sectionLabelsDiscovered)
      ? summary.sectionLabelsDiscovered.map(cleanText).filter(Boolean)
      : [],
    textEvidence,
    structuredData,
    networkResponses,
    completedAt: new Date().toISOString(),
  };
}

async function callDeepReaderWorker(productUrl, options = {}) {
  const workerUrl = cleanText(options.workerUrl || process.env.DEEP_READER_WORKER_URL);

  if (!workerUrl) {
    return null;
  }

  const timeoutMs = Number(options.timeoutMs || process.env.DEEP_READER_WORKER_TIMEOUT_MS || DEFAULT_WORKER_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await (options.fetchImpl || fetch)(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: productUrl,
        options: {
          localeHints: ["nl", "en", "fr"],
          maxDurationMs: Math.max(5000, timeoutMs - 1000),
          includeNetworkEvidence: true,
          includeStructuredData: true,
        },
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    if (rawText.length > MAX_WORKER_RESPONSE_CHARS) {
      return createWorkerFailedDeepRead(productUrl, "unknown_error");
    }

    if (!response.ok) {
      let payload = {};
      try {
        payload = JSON.parse(rawText);
      } catch (error) {
        payload = {};
      }
      return createWorkerFailedDeepRead(productUrl, payload.failureReason || "unknown_error");
    }

    return normalizeWorkerDeepReadResponse(JSON.parse(rawText), productUrl);
  } catch (error) {
    if (error && error.name === "AbortError") {
      return createWorkerFailedDeepRead(productUrl, "timeout");
    }

    return createWorkerFailedDeepRead(productUrl, "unknown_error");
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  callDeepReaderWorker,
  createWorkerFailedDeepRead,
  normalizeFailureReason,
  normalizeWorkerDeepReadResponse,
  workerFailureMode,
  workerFailureToInternalReason,
};
