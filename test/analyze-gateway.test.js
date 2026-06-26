const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { createAppServer } = require("../server");
const {
  analysisCacheKey,
  createConcurrencyLimiter,
  createDuplicateSuppressor,
  createRateLimiter,
} = require("../src/lib/security/request-controls");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://${address.address}:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function postJson(baseUrl, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    const request = http.request(`${baseUrl}${pathname}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...headers,
      },
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        raw += chunk;
      });
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode,
          body: raw ? JSON.parse(raw) : null,
        });
      });
    });

    request.on("error", reject);
    request.end(payload);
  });
}

test("analysis cache key ignores URL fragments and skips user-provided evidence", () => {
  assert.equal(
    analysisCacheKey({ productUrl: "https://shop.example/product#reviews" }),
    "analysis:https://shop.example/product"
  );
  assert.equal(
    analysisCacheKey({
      productUrl: "https://shop.example/product",
      userProvidedEvidence: { kind: "visible_text", content: "Material: cotton" },
    }),
    ""
  );
});

test("rate, concurrency, and duplicate controls are independently enforceable", async () => {
  const rateLimiter = createRateLimiter({ windowMs: 10000, max: 1 });
  assert.equal(rateLimiter.check("client").allowed, true);
  assert.equal(rateLimiter.check("client").allowed, false);

  const concurrencyLimiter = createConcurrencyLimiter({ max: 1 });
  let release;
  const first = concurrencyLimiter.run(() => new Promise((resolve) => {
    release = resolve;
  }));
  await assert.rejects(
    concurrencyLimiter.run(async () => "second"),
    /Too many analysis requests/
  );
  release("first");
  assert.equal(await first, "first");

  let calls = 0;
  const duplicateSuppressor = createDuplicateSuppressor({ ttlMs: 10000 });
  const firstDuplicate = duplicateSuppressor.getOrCreate("same", async () => {
    calls += 1;
    return "shared";
  });
  const secondDuplicate = duplicateSuppressor.getOrCreate("same", async () => {
    calls += 1;
    return "other";
  });

  assert.equal(firstDuplicate.shared, false);
  assert.equal(secondDuplicate.shared, true);
  assert.equal(await secondDuplicate.promise, "shared");
  assert.equal(calls, 1);
});

test("local /api/analyze rejects oversized bodies and rate limits before analysis work", async () => {
  const originalMaxBody = process.env.MAX_API_BODY_BYTES;
  const originalRateMax = process.env.ANALYZE_RATE_LIMIT_MAX;
  const originalRateWindow = process.env.ANALYZE_RATE_LIMIT_WINDOW_MS;
  process.env.MAX_API_BODY_BYTES = "64";
  process.env.ANALYZE_RATE_LIMIT_MAX = "1";
  process.env.ANALYZE_RATE_LIMIT_WINDOW_MS = "60000";

  let analyzerCalls = 0;
  const server = createAppServer({
    analyzer: async (productUrl) => {
      analyzerCalls += 1;
      return {
        metadata: { productUrl },
        report: { ok: true },
      };
    },
  });
  const baseUrl = await listen(server);

  try {
    const oversized = await postJson(baseUrl, "/api/analyze", {
      productUrl: "https://shop.example/product",
      padding: "x".repeat(100),
    });
    assert.equal(oversized.statusCode, 413);
    assert.equal(oversized.body.code, "request_body_too_large");
    assert.equal(analyzerCalls, 0);

    const first = await postJson(baseUrl, "/api/analyze", {
      productUrl: "https://shop.example/product",
    });
    assert.equal(first.statusCode, 200);
    assert.equal(analyzerCalls, 1);

    const second = await postJson(baseUrl, "/api/analyze", {
      productUrl: "https://shop.example/other",
    });
    assert.equal(second.statusCode, 429);
    assert.equal(second.body.code, "rate_limited");
    assert.equal(analyzerCalls, 1);
  } finally {
    await close(server);
    if (originalMaxBody === undefined) {
      delete process.env.MAX_API_BODY_BYTES;
    } else {
      process.env.MAX_API_BODY_BYTES = originalMaxBody;
    }
    if (originalRateMax === undefined) {
      delete process.env.ANALYZE_RATE_LIMIT_MAX;
    } else {
      process.env.ANALYZE_RATE_LIMIT_MAX = originalRateMax;
    }
    if (originalRateWindow === undefined) {
      delete process.env.ANALYZE_RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.ANALYZE_RATE_LIMIT_WINDOW_MS = originalRateWindow;
    }
  }
});
