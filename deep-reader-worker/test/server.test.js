const assert = require("node:assert/strict");
const test = require("node:test");

const {
  clientIp,
  failureReasonFor,
  verifyWorkerAuth,
  isPrivateIp,
  validatePublicUrl,
} = require("../server");

test("accepts a public HTTP(S) URL after resolving only public addresses", async () => {
  const result = await validatePublicUrl(
    "https://shop.example/products/linen-shirt?color=blue",
    async () => [{ address: "93.184.216.34", family: 4 }]
  );

  assert.deepEqual(result, {
    ok: true,
    url: "https://shop.example/products/linen-shirt?color=blue",
  });
});

test("rejects local, private, and unsupported URLs", async () => {
  assert.deepEqual(await validatePublicUrl("file:///tmp/product.html"), {
    ok: false,
    reason: "unsupported_protocol",
  });
  assert.deepEqual(await validatePublicUrl("http://localhost/product"), {
    ok: false,
    reason: "private_url_blocked",
  });
  assert.deepEqual(
    await validatePublicUrl("https://internal.example/product", async () => [
      { address: "192.168.1.20", family: 4 },
    ]),
    { ok: false, reason: "private_url_blocked" }
  );
  assert.equal(isPrivateIp("127.0.0.1"), true);
  assert.equal(isPrivateIp("fd00::1"), true);
  assert.equal(isPrivateIp("fe80::1"), true);
  assert.equal(isPrivateIp("93.184.216.34"), false);
});

test("requires worker auth in production and accepts bearer token", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalToken = process.env.DEEP_READER_WORKER_TOKEN;
  const originalAllow = process.env.ALLOW_UNAUTHENTICATED_DEEP_READ;

  process.env.NODE_ENV = "production";
  process.env.DEEP_READER_WORKER_TOKEN = "shared-secret";
  delete process.env.ALLOW_UNAUTHENTICATED_DEEP_READ;

  try {
    assert.equal(verifyWorkerAuth({ headers: {} }), false);
    assert.equal(
      verifyWorkerAuth({ headers: { authorization: "Bearer shared-secret" } }),
      true
    );
    assert.equal(
      verifyWorkerAuth({ headers: { "x-deep-reader-token": "shared-secret" } }),
      true
    );
    assert.equal(
      verifyWorkerAuth({ headers: { authorization: "Bearer wrong" } }),
      false
    );
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalToken === undefined) {
      delete process.env.DEEP_READER_WORKER_TOKEN;
    } else {
      process.env.DEEP_READER_WORKER_TOKEN = originalToken;
    }
    if (originalAllow === undefined) {
      delete process.env.ALLOW_UNAUTHENTICATED_DEEP_READ;
    } else {
      process.env.ALLOW_UNAUTHENTICATED_DEEP_READ = originalAllow;
    }
  }
});

test("does not trust spoofed x-forwarded-for unless proxy headers are enabled", () => {
  const originalTrust = process.env.TRUST_PROXY_HEADERS;
  const request = {
    headers: { "x-forwarded-for": "203.0.113.10" },
    socket: { remoteAddress: "10.0.0.5" },
  };

  try {
    delete process.env.TRUST_PROXY_HEADERS;
    assert.equal(clientIp(request), "10.0.0.5");

    process.env.TRUST_PROXY_HEADERS = "1";
    assert.equal(clientIp(request), "203.0.113.10");
  } finally {
    if (originalTrust === undefined) {
      delete process.env.TRUST_PROXY_HEADERS;
    } else {
      process.env.TRUST_PROXY_HEADERS = originalTrust;
    }
  }
});

test("maps reader failures to the public failure contract", () => {
  const cases = [
    ["CAPTCHA verification shown", "blocked_by_bot_protection"],
    ["HTTP access denied", "access_denied"],
    ["page timeout", "timeout"],
    ["no relevant interactive sections found", "no_relevant_interactive_sections_found"],
    ["Chromium rendering failed", "unsupported_rendering_pattern"],
    ["unexpected navigation error", "unknown_error"],
  ];

  for (const [input, expected] of cases) {
    assert.equal(failureReasonFor(input), expected);
  }
});
