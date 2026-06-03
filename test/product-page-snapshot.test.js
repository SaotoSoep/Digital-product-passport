const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  extractProductPageSnapshot,
  fetchProductPageSnapshot,
} = require("../src/lib/product-page/snapshot");

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

test("extracts visible product page fields from static HTML", () => {
  const snapshot = extractProductPageSnapshot(
    fixture("product-rich.html"),
    "https://shop.example/products/relaxed-overshirt?color=blue",
    new Date("2026-06-02T12:00:00.000Z")
  );

  assert.equal(snapshot.sourceUrl, "https://shop.example/products/relaxed-overshirt?color=blue");
  assert.equal(snapshot.extractionTimestamp, "2026-06-02T12:00:00.000Z");
  assert.equal(snapshot.extractionStatus, "success");
  assert.equal(snapshot.pageTitle, "Relaxed Organic Cotton Overshirt | Northline Studio");
  assert.equal(snapshot.canonicalUrl, "https://shop.example/products/relaxed-overshirt");
  assert.equal(snapshot.likelyProductName, "Relaxed Organic Cotton Overshirt");
  assert.equal(snapshot.likelyBrand, "Northline Studio");
  assert.match(snapshot.materialCompositionText[0], /78% organic cotton/);
  assert.match(snapshot.careText[0], /machine wash at 30°C/);
  assert(snapshot.sustainabilityClaimSnippets.some((snippet) => /responsible style/.test(snippet)));
  assert(snapshot.extractionNotes.some((note) => note.includes("likely brand: found")));
});

test("marks absent product page fields as not_found or empty", () => {
  const snapshot = extractProductPageSnapshot(
    fixture("product-partial.html"),
    "https://shop.example/products/black-top",
    new Date("2026-06-02T12:00:00.000Z")
  );

  assert.equal(snapshot.extractionStatus, "partial");
  assert.equal(snapshot.pageTitle, "Black Everyday Top");
  assert.equal(snapshot.canonicalUrl, "not_found");
  assert.equal(snapshot.likelyBrand, "not_found");
  assert.deepEqual(snapshot.materialCompositionText, []);
  assert.deepEqual(snapshot.careText, []);
  assert.deepEqual(snapshot.sustainabilityClaimSnippets, []);
  assert(snapshot.extractionNotes.some((note) => note.includes("material/composition text: not_found")));
});

test("returns a failed snapshot when fetch cannot return readable HTML", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 503,
    headers: {
      get: () => "text/html",
    },
    text: async () => "",
  });

  const snapshot = await fetchProductPageSnapshot(
    "https://shop.example/products/unavailable",
    fakeFetch,
    new Date("2026-06-02T12:00:00.000Z")
  );

  assert.equal(snapshot.extractionStatus, "failed");
  assert.equal(snapshot.pageTitle, "not_found");
  assert.equal(snapshot.canonicalUrl, "not_found");
  assert.match(snapshot.extractionNotes[0], /request failed with status 503/);
});
