const assert = require("node:assert/strict");
const test = require("node:test");

const { MemoryPassportStore } = require("../src/lib/storage/memory");
const {
  createPassport,
  getPublishedPassport,
  listPassports,
  publishPassport,
  updatePassport,
} = require("../src/passports");

function fakeAnalysis(productUrl) {
  return {
    metadata: {
      productUrl,
      retailer: "shop.example",
      productPageSnapshot: {
        sourceUrl: productUrl,
        extractionTimestamp: "2026-06-02T12:00:00.000Z",
        extractionStatus: "success",
        pageTitle: "Relaxed Organic Cotton Overshirt | Northline Studio",
        canonicalUrl: "https://shop.example/products/relaxed-overshirt",
        likelyProductName: "Relaxed Organic Cotton Overshirt",
        likelyBrand: "Northline Studio",
        materialCompositionText: ["78% organic cotton, 22% recycled polyester"],
        careText: ["Machine wash at 30C."],
        sustainabilityClaimSnippets: ["Made with organic cotton."],
        extractionNotes: ["page title: found"],
      },
    },
    report: {
      productSummary: "Relaxed overshirt with visible product evidence.",
      unknowns: ["Factory details were not independently verified."],
    },
  };
}

test("creates and stores a draft passport from a product URL analysis", async () => {
  const store = new MemoryPassportStore();
  const passport = await createPassport({
    productUrl: "https://shop.example/products/relaxed-overshirt",
    store,
    analyzer: fakeAnalysis,
    clock: () => "2026-06-03T10:00:00.000Z",
  });

  assert.match(passport.id, /^pp_/);
  assert.equal(passport.status, "draft");
  assert.equal(passport.productName, "Relaxed Organic Cotton Overshirt");
  assert.equal(passport.brand, "Northline Studio");
  assert.equal(passport.extractionStatus, "success");
  assert.equal(passport.createdAt, "2026-06-03T10:00:00.000Z");
  assert.equal(store.listEvents(passport.id)[0].eventType, "passport.created");
});

test("lists, updates, and publishes passports", async () => {
  const store = new MemoryPassportStore();
  const passport = await createPassport({
    productUrl: "https://shop.example/products/relaxed-overshirt",
    store,
    analyzer: fakeAnalysis,
    clock: () => "2026-06-03T10:00:00.000Z",
  });

  const updated = updatePassport({
    store,
    id: passport.id,
    patch: {
      productName: "Edited Overshirt",
      brand: "Northline",
    },
    clock: () => "2026-06-03T10:05:00.000Z",
  });

  assert.equal(updated.productName, "Edited Overshirt");
  assert.equal(updated.brand, "Northline");

  const published = publishPassport({
    store,
    id: passport.id,
    clock: () => "2026-06-03T10:10:00.000Z",
  });

  assert.equal(published.status, "published");
  assert.match(published.publicId, /^pub_/);
  assert.equal(published.publishedAt, "2026-06-03T10:10:00.000Z");
  assert.equal(getPublishedPassport({ store, publicId: published.publicId }).id, passport.id);
  assert.deepEqual(listPassports({ store, status: "published" }).map((item) => item.id), [passport.id]);
});

test("rejects unsupported product URLs", async () => {
  const store = new MemoryPassportStore();

  await assert.rejects(
    () => createPassport({
      productUrl: "ftp://shop.example/product",
      store,
      analyzer: fakeAnalysis,
    }),
    /Product URL must start/
  );
});

test("requires the publish endpoint for publishing", async () => {
  const store = new MemoryPassportStore();
  const passport = await createPassport({
    productUrl: "https://shop.example/products/relaxed-overshirt",
    store,
    analyzer: fakeAnalysis,
  });

  assert.throws(
    () => updatePassport({
      store,
      id: passport.id,
      patch: {
        status: "published",
      },
    }),
    /publish endpoint/
  );
});
