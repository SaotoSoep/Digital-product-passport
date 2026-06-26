const assert = require("node:assert/strict");
const test = require("node:test");

const {
  fetchPublicText,
  isPrivateOrReservedIp,
  validatePublicUrl,
} = require("../src/lib/security/public-url");

test("blocks private, reserved, encoded, and local product URLs", async () => {
  const cases = [
    "http://localhost/product",
    "http://%6cocalhost/product",
    "http://127.0.0.1/product",
    "http://0177.0.0.1/product",
    "http://2130706433/product",
    "http://[::1]/product",
    "http://printer.local/product",
    "file:///tmp/product.html",
  ];

  for (const url of cases) {
    const result = await validatePublicUrl(url);
    assert.equal(result.ok, false, url);
  }

  assert.equal(isPrivateOrReservedIp("10.1.2.3"), true);
  assert.equal(isPrivateOrReservedIp("172.20.1.2"), true);
  assert.equal(isPrivateOrReservedIp("192.168.1.2"), true);
  assert.equal(isPrivateOrReservedIp("169.254.1.2"), true);
  assert.equal(isPrivateOrReservedIp("100.64.1.2"), true);
  assert.equal(isPrivateOrReservedIp("93.184.216.34"), false);
  assert.equal(isPrivateOrReservedIp("fd00::1"), true);
  assert.equal(isPrivateOrReservedIp("fe80::1"), true);
  assert.equal(isPrivateOrReservedIp("2606:2800:220:1:248:1893:25c8:1946"), false);
});

test("uses DNS lookup results to reject private ranges and lookup failures", async () => {
  const publicResult = await validatePublicUrl("https://shop.example/product", {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
  });
  assert.equal(publicResult.ok, true);
  assert.equal(publicResult.url, "https://shop.example/product");

  assert.deepEqual(
    await validatePublicUrl("https://internal.example/product", {
      lookup: async () => [{ address: "192.168.1.10", family: 4 }],
    }),
    { ok: false, reason: "private_url_blocked" }
  );

  assert.deepEqual(
    await validatePublicUrl("https://missing.example/product", {
      lookup: async () => {
        throw new Error("ENOTFOUND");
      },
    }),
    { ok: false, reason: "dns_lookup_failed" }
  );
});

test("revalidates redirects before reading response bodies", async () => {
  let calls = 0;
  const result = await fetchPublicText("https://shop.example/product", {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImpl: async (url) => {
      calls += 1;
      if (url === "https://shop.example/product") {
        return new Response("", {
          status: 302,
          headers: { location: "https://cdn.example/product" },
        });
      }

      return new Response("<html>ok</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.text, "<html>ok</html>");

  await assert.rejects(
    fetchPublicText("https://shop.example/product", {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      fetchImpl: async () => new Response("", {
        status: 302,
        headers: { location: "http://127.0.0.1/admin" },
      }),
    }),
    /blocked location/
  );
});

test("rejects oversized responses before returning body text", async () => {
  await assert.rejects(
    fetchPublicText("https://shop.example/product", {
      maxBytes: 10,
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      fetchImpl: async () => new Response("01234567890", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    }),
    /response is too large/
  );
});
