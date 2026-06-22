const assert = require("node:assert/strict");
const test = require("node:test");

const {
  failureReasonFor,
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
  assert.equal(isPrivateIp("93.184.216.34"), false);
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
