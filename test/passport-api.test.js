const assert = require("node:assert/strict");
const test = require("node:test");

const { MemoryPassportStore } = require("../src/lib/storage/memory");
const { safeHandlePassportApi } = require("../src/http/passport-api");

test("responds to backend health checks", async () => {
  const response = await safeHandlePassportApi({
    method: "GET",
    pathname: "/api/health",
    store: new MemoryPassportStore(),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).status, "ok");
});

test("returns null for routes outside the passport API", async () => {
  const response = await safeHandlePassportApi({
    method: "GET",
    pathname: "/assets/app.js",
    store: new MemoryPassportStore(),
  });

  assert.equal(response, null);
});
