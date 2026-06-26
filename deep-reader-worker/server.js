const http = require("http");
const crypto = require("crypto");
const { readDeepProductPage } = require("./lib/deep-reader");
const {
  isPrivateOrReservedIp,
  validatePublicUrl,
} = require("./lib/security/public-url");
const packageJson = require("./package.json");
const playwrightPackageJson = require("playwright/package.json");

const port = Number(process.env.PORT || 8080);
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 65536);
const maxResponseEvidenceChars = Number(process.env.MAX_RESPONSE_EVIDENCE_CHARS || 500000);
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 30);
const concurrencyMax = Math.max(1, Number(process.env.CONCURRENCY_MAX || 2));
const requestCounts = new Map();
let activeDeepReads = 0;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function clientIp(request) {
  if (process.env.TRUST_PROXY_HEADERS === "1") {
    const trustedHeader = String(
      request.headers["x-nf-client-connection-ip"] ||
      request.headers["cf-connecting-ip"] ||
      request.headers["true-client-ip"] ||
      request.headers["x-forwarded-for"] ||
      ""
    ).split(",")[0].trim();

    if (trustedHeader) {
      return trustedHeader;
    }
  }

  return request.socket.remoteAddress || "unknown";
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

function configuredWorkerToken() {
  return String(process.env.DEEP_READER_WORKER_TOKEN || process.env.WORKER_SHARED_TOKEN || "").trim();
}

function authRequired() {
  if (process.env.DEEP_READER_WORKER_REQUIRE_AUTH === "1") {
    return true;
  }

  if (process.env.ALLOW_UNAUTHENTICATED_DEEP_READ === "1") {
    return false;
  }

  return process.env.NODE_ENV === "production";
}

function constantTimeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length || leftBuffer.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function tokenFromRequest(request) {
  const authorization = String(request.headers.authorization || "");
  if (/^bearer\s+/i.test(authorization)) {
    return authorization.replace(/^bearer\s+/i, "").trim();
  }

  return String(request.headers["x-deep-reader-token"] || "").trim();
}

function verifyWorkerAuth(request) {
  if (!authRequired()) {
    return true;
  }

  return constantTimeEquals(tokenFromRequest(request), configuredWorkerToken());
}

async function runWithConcurrency(task) {
  if (activeDeepReads >= concurrencyMax) {
    return { limited: true };
  }

  activeDeepReads += 1;
  try {
    return { limited: false, value: await task() };
  } finally {
    activeDeepReads -= 1;
  }
}

function failureReasonFor(value) {
  const normalized = String(value || "").toLowerCase();
  if (/bot|captcha|verification/.test(normalized)) return "blocked_by_bot_protection";
  if (/access|denied|private|forbidden/.test(normalized)) return "access_denied";
  if (/timeout/.test(normalized)) return "timeout";
  if (/no relevant interactive sections/.test(normalized)) return "no_relevant_interactive_sections_found";
  if (/unsupported|rendering|playwright|chromium/.test(normalized)) return "unsupported_rendering_pattern";
  return "unknown_error";
}

function mapEvidence(result) {
  const rows = [];
  let remainingChars = maxResponseEvidenceChars;

  function take(value) {
    if (remainingChars <= 0) return "";
    const text = String(value || "").slice(0, remainingChars);
    remainingChars -= text.length;
    return text;
  }

  for (const item of result.textEvidence || []) {
    const text = take(item.text);
    if (!text) break;

    rows.push({
      sourceUrl: item.sourceUrl || result.sourceUrl,
      sectionLabel: item.sectionLabel || "Deep page read",
      interactionType: item.interactionType ? item.interactionType.replace(/_/g, "-") : "read",
      selector: item.selector || "",
      text,
      json: null,
      confidence: "high",
      capturedAt: item.timestamp || result.completedAt || new Date().toISOString(),
    });
  }

  for (const item of result.structuredData || []) {
    const text = take(item.summary);
    if (!text) break;

    rows.push({
      sourceUrl: item.sourceUrl || result.sourceUrl,
      sectionLabel: item.sectionLabel || "Structured product data",
      interactionType: "structured-data",
      selector: item.selector || "",
      text,
      json: null,
      confidence: "medium",
      capturedAt: item.timestamp || result.completedAt || new Date().toISOString(),
    });
  }

  for (const item of result.networkResponses || []) {
    const text = take(item.summary);
    if (!text) break;

    rows.push({
      sourceUrl: item.sourceUrl || result.sourceUrl,
      sectionLabel: "Network response",
      interactionType: "network-response",
      selector: "",
      text,
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
    sendJson(response, 200, {
      ok: true,
      service: packageJson.name,
      playwrightVersion: playwrightPackageJson.version,
      nodeEnv: process.env.NODE_ENV || "",
    });
    return;
  }

  if (request.method !== "POST" || request.url !== "/deep-read") {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  if (!verifyWorkerAuth(request)) {
    sendJson(response, 401, { error: "unauthorized", failureReason: "access_denied" });
    return;
  }

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    sendJson(response, 429, { error: "rate_limited", failureReason: "unknown_error" });
    return;
  }

  if (activeDeepReads >= concurrencyMax) {
    sendJson(response, 429, { error: "concurrency_limited", failureReason: "unknown_error" });
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

  const limitedResult = await runWithConcurrency(() => Promise.race([
    readDeepProductPage(validation.url, { force: true, timeoutMs: maxDurationMs }),
    timeoutResult,
  ]));

  if (limitedResult.limited) {
    sendJson(response, 429, { error: "concurrency_limited", failureReason: "unknown_error" });
    return;
  }

  const result = limitedResult.value;

  const responsePayload = mapResult(result, validation.url);
  sendJson(response, responsePayload.status === "failed" ? 200 : 200, responsePayload);
});

if (require.main === module) {
  server.listen(port, () => {
    console.log(`deep-reader-worker listening on :${port}`);
  });
}

module.exports = {
  authRequired,
  clientIp,
  failureReasonFor,
  isPrivateIp: isPrivateOrReservedIp,
  mapResult,
  tokenFromRequest,
  validatePublicUrl,
  verifyWorkerAuth,
};
