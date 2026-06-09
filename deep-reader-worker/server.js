const http = require("http");
const dns = require("dns").promises;
const net = require("net");
const { URL } = require("url");
const { readDeepProductPage } = require("./lib/deep-reader");

const port = Number(process.env.PORT || 8080);
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 65536);
const maxResponseEvidenceChars = Number(process.env.MAX_RESPONSE_EVIDENCE_CHARS || 500000);
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 30);
const requestCounts = new Map();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function clientIp(request) {
  return String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function rateLimited(ip) {
  const now = Date.now();
  const current = requestCounts.get(ip) || { count: 0, resetAt: now + rateLimitWindowMs };
  if (now > current.resetAt) {
    current.count = 0;
    current.resetAt = now + rateLimitWindowMs;
  }
  current.count += 1;
  requestCounts.set(ip, current);
  return current.count > rateLimitMax;
}

function isPrivateIp(address) {
  if (!address) return true;
  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      parts[0] === 0
    );
  }

  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  }

  return true;
}

async function validatePublicUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    return { ok: false, reason: "invalid_url" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, reason: "unsupported_protocol" };
  }

  if (process.env.ALLOW_PRIVATE_URLS === "1") {
    return { ok: true, url: parsed.toString() };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    return { ok: false, reason: "private_url_blocked" };
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: false });
    if (addresses.some((item) => isPrivateIp(item.address))) {
      return { ok: false, reason: "private_url_blocked" };
    }
  } catch (error) {
    return { ok: false, reason: "dns_lookup_failed" };
  }

  return { ok: true, url: parsed.toString() };
}

function failureReasonFor(value) {
  const normalized = String(value || "").toLowerCase();
  if (/bot|captcha|verification/.test(normalized)) return "blocked_by_bot_protection";
  if (/access|denied|private|forbidden/.test(normalized)) return "access_denied";
  if (/timeout/.test(normalized)) return "timeout";
  if (/unsupported|rendering|playwright|chromium/.test(normalized)) return "unsupported_rendering_pattern";
  return "unknown_error";
}

function mapEvidence(result) {
  const rows = [];

  for (const item of result.textEvidence || []) {
    rows.push({
      sourceUrl: item.sourceUrl || result.sourceUrl,
      sectionLabel: item.sectionLabel || "Deep page read",
      interactionType: item.interactionType ? item.interactionType.replace(/_/g, "-") : "read",
      selector: item.selector || "",
      text: String(item.text || "").slice(0, maxResponseEvidenceChars),
      json: null,
      confidence: "high",
      capturedAt: item.timestamp || result.completedAt || new Date().toISOString(),
    });
  }

  for (const item of result.structuredData || []) {
    rows.push({
      sourceUrl: item.sourceUrl || result.sourceUrl,
      sectionLabel: item.sectionLabel || "Structured product data",
      interactionType: "structured-data",
      selector: item.selector || "",
      text: item.summary || "",
      json: null,
      confidence: "medium",
      capturedAt: item.timestamp || result.completedAt || new Date().toISOString(),
    });
  }

  for (const item of result.networkResponses || []) {
    rows.push({
      sourceUrl: item.sourceUrl || result.sourceUrl,
      sectionLabel: "Network response",
      interactionType: "network-response",
      selector: "",
      text: item.summary || "",
      json: null,
      confidence: "medium",
      capturedAt: item.timestamp || result.completedAt || new Date().toISOString(),
    });
  }

  return rows;
}

function mapResult(result, sourceUrl) {
  return {
    status: ["success", "partial", "failed"].includes(result.status) ? result.status : "failed",
    failureReason: result.failureReason ? failureReasonFor(result.failureReason) : null,
    sourceUrl,
    finalUrl: result.finalUrl || result.sourceUrl || sourceUrl,
    deepReadSummary: {
      tabsClicked: result.counts?.tabsClicked || 0,
      accordionsOpened: result.counts?.accordionsOpened || 0,
      readMoreExpanded: result.counts?.readMoreExpanded || 0,
      structuredDataBlocksFound: result.counts?.structuredDataBlocks || 0,
      networkResponsesCaptured: result.counts?.relevantNetworkResponses || 0,
      sectionLabelsDiscovered: Array.isArray(result.sectionLabels) ? result.sectionLabels : [],
    },
    evidence: mapEvidence(result),
  };
}

function collectBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBodyBytes) {
        reject(new Error("request_body_too_large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method !== "POST" || request.url !== "/deep-read") {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    sendJson(response, 429, { error: "rate_limited", failureReason: "unknown_error" });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await collectBody(request));
  } catch (error) {
    sendJson(response, 400, { error: "invalid_json", failureReason: "unknown_error" });
    return;
  }

  const validation = await validatePublicUrl(payload.url);
  if (!validation.ok) {
    sendJson(response, 400, { error: validation.reason, failureReason: "access_denied" });
    return;
  }

  const options = payload.options && typeof payload.options === "object" ? payload.options : {};
  const maxDurationMs = Math.min(Math.max(Number(options.maxDurationMs || 45000), 5000), 60000);

  const timeoutResult = new Promise((resolve) => {
    setTimeout(() => resolve({
      status: "failed",
      sourceUrl: validation.url,
      failureReason: "page timeout",
      counts: {},
      sectionLabels: [],
      textEvidence: [],
      structuredData: [],
      networkResponses: [],
      completedAt: new Date().toISOString(),
    }), maxDurationMs);
  });

  const result = await Promise.race([
    readDeepProductPage(validation.url, { force: true, timeoutMs: maxDurationMs }),
    timeoutResult,
  ]);

  const responsePayload = mapResult(result, validation.url);
  sendJson(response, responsePayload.status === "failed" ? 200 : 200, responsePayload);
});

server.listen(port, () => {
  console.log(`deep-reader-worker listening on :${port}`);
});

module.exports = {
  failureReasonFor,
  isPrivateIp,
  mapResult,
  validatePublicUrl,
};
