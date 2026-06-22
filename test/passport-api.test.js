const assert = require("node:assert/strict");
const test = require("node:test");

const { MemoryPassportStore } = require("../src/lib/storage/memory");
const { safeHandlePassportApi } = require("../src/http/passport-api");

function existingDraft(productUrl = "https://shop.example/product") {
  return {
    id: "pp_existing",
    publicId: null,
    status: "draft",
    productUrl,
    retailer: "shop.example",
    productName: "Product",
    brand: "Brand",
    extractionStatus: "partial",
    report: {},
    snapshot: null,
    createdAt: "2026-06-22T10:00:00.000Z",
    updatedAt: "2026-06-22T10:00:00.000Z",
    publishedAt: null,
  };
}

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

test("requires an explicit choice before creating a duplicate draft", async () => {
  const store = new MemoryPassportStore();
  store.createPassport(existingDraft());

  const response = await safeHandlePassportApi({
    method: "POST",
    pathname: "/api/passports",
    body: { productUrl: "https://shop.example/product" },
    store,
  });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 409);
  assert.equal(body.code, "duplicate_draft");
  assert.equal(body.existingDraft.id, "pp_existing");
  assert.equal(store.listPassports().length, 1);
});
