const crypto = require("crypto");

const DEFAULT_REQUEST_BODY_LIMIT_BYTES = 128 * 1024;

class RequestBodyError extends Error {
  constructor(reason, message, statusCode = 400) {
    super(message);
    this.name = "RequestBodyError";
    this.reason = reason;
    this.statusCode = statusCode;
  }
}

class ConcurrencyLimitError extends Error {
  constructor() {
    super("Too many analysis requests are already running. Please retry shortly.");
    this.name = "ConcurrencyLimitError";
    this.statusCode = 429;
    this.reason = "concurrency_limited";
  }
}

function numberFromEnv(name, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, min), max);
}

function createRateLimiter({
  windowMs = 60000,
  max = 20,
  now = () => Date.now(),
} = {}) {
  const buckets = new Map();

  function prune(currentTime) {
    for (const [key, bucket] of buckets) {
      if (currentTime > bucket.resetAt) {
        buckets.delete(key);
      }
    }
  }

  return {
    check(key = "unknown") {
      const currentTime = now();
      prune(currentTime);

      const current = buckets.get(key) || { count: 0, resetAt: currentTime + windowMs };
      if (currentTime > current.resetAt) {
        current.count = 0;
        current.resetAt = currentTime + windowMs;
      }

      current.count += 1;
      buckets.set(key, current);

      return {
        allowed: current.count <= max,
        retryAfterMs: Math.max(0, current.resetAt - currentTime),
        remaining: Math.max(0, max - current.count),
      };
    },
    reset() {
      buckets.clear();
    },
  };
}

function createConcurrencyLimiter({ max = 3 } = {}) {
  let active = 0;

  return {
    async run(task) {
      if (active >= max) {
        throw new ConcurrencyLimitError();
      }

      active += 1;
      try {
        return await task();
      } finally {
        active -= 1;
      }
    },
    activeCount() {
      return active;
    },
  };
}

function createDuplicateSuppressor({
  ttlMs = 30000,
  maxEntries = 100,
  now = () => Date.now(),
} = {}) {
  const entries = new Map();

  function prune(currentTime) {
    for (const [key, entry] of entries) {
      if (currentTime > entry.expiresAt) {
        entries.delete(key);
      }
    }

    while (entries.size > maxEntries) {
      entries.delete(entries.keys().next().value);
    }
  }

  return {
    getOrCreate(key, factory) {
      const currentTime = now();
      prune(currentTime);

      const existing = entries.get(key);
      if (existing) {
        return { shared: true, promise: existing.promise };
      }

      const promise = Promise.resolve()
        .then(factory)
        .catch((error) => {
          entries.delete(key);
          throw error;
        });

      entries.set(key, {
        promise,
        expiresAt: currentTime + ttlMs,
      });

      return { shared: false, promise };
    },
    reset() {
      entries.clear();
    },
  };
}

function trustedProxyHeaderEnabled() {
  return process.env.TRUST_PROXY_HEADERS === "1";
}

function firstHeaderValue(value) {
  return String(value || "")
    .split(",")[0]
    .trim();
}

function clientKeyFromNodeRequest(request) {
  if (trustedProxyHeaderEnabled()) {
    const trustedHeader = firstHeaderValue(
      request.headers["x-nf-client-connection-ip"] ||
      request.headers["cf-connecting-ip"] ||
      request.headers["true-client-ip"] ||
      request.headers["x-forwarded-for"]
    );
    if (trustedHeader) {
      return trustedHeader;
    }
  }

  return request.socket?.remoteAddress || "unknown";
}

function clientKeyFromWebRequest(request) {
  const headers = request.headers;
  const platformHeader = firstHeaderValue(
    headers.get("x-nf-client-connection-ip") ||
    headers.get("cf-connecting-ip") ||
    headers.get("true-client-ip")
  );
  if (platformHeader) {
    return platformHeader;
  }

  if (trustedProxyHeaderEnabled()) {
    const trustedHeader = firstHeaderValue(headers.get("x-forwarded-for"));
    if (trustedHeader) {
      return trustedHeader;
    }
  }

  return "netlify-request";
}

function normalizeAnalysisUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString();
  } catch (error) {
    return "";
  }
}

function hasUserProvidedEvidence(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    String(value.content || value.fileName || "").trim()
  );
}

function analysisCacheKey(body) {
  if (!body || hasUserProvidedEvidence(body.userProvidedEvidence)) {
    return "";
  }

  const normalizedUrl = normalizeAnalysisUrl(body.productUrl);
  return normalizedUrl ? `analysis:${normalizedUrl}` : "";
}

function safeHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function readNodeJsonBody(request, maxBytes = DEFAULT_REQUEST_BODY_LIMIT_BYTES) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(request.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      reject(new RequestBodyError(
        "request_body_too_large",
        "Request body is too large",
        413
      ));
      request.resume();
      return;
    }

    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    function fail(error) {
      if (settled) return;
      settled = true;
      reject(error);
      request.destroy();
    }

    request.on("data", (chunk) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        fail(new RequestBodyError(
          "request_body_too_large",
          "Request body is too large",
          413
        ));
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (settled) return;
      settled = true;

      const rawBody = Buffer.concat(chunks).toString("utf8");
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new RequestBodyError("invalid_json", "Invalid JSON body", 400));
      }
    });

    request.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

async function readWebJsonBody(request, maxBytes = DEFAULT_REQUEST_BODY_LIMIT_BYTES) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyError("request_body_too_large", "Request body is too large", 413);
  }

  let rawBody = "";

  if (request.body && typeof request.body.getReader === "function") {
    const reader = request.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = Buffer.from(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new RequestBodyError("request_body_too_large", "Request body is too large", 413);
      }
      chunks.push(chunk);
    }

    rawBody = Buffer.concat(chunks).toString("utf8");
  } else {
    rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > maxBytes) {
      throw new RequestBodyError("request_body_too_large", "Request body is too large", 413);
    }
  }

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw new RequestBodyError("invalid_json", "Invalid JSON body", 400);
  }
}

module.exports = {
  ConcurrencyLimitError,
  DEFAULT_REQUEST_BODY_LIMIT_BYTES,
  RequestBodyError,
  analysisCacheKey,
  clientKeyFromNodeRequest,
  clientKeyFromWebRequest,
  createConcurrencyLimiter,
  createDuplicateSuppressor,
  createRateLimiter,
  numberFromEnv,
  readNodeJsonBody,
  readWebJsonBody,
  safeHash,
};
