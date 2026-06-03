const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { analyzeProductUrl } = require("../src/analyzer");
const { buildProductPageEvidence } = require("../src/lib/product-passport/evidence");
const {
  createFailedProductPageSnapshot,
  extractProductPageSnapshot,
} = require("../src/lib/product-page/snapshot");

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

test("normalizes found and not_found ProductPageSnapshot fields", () => {
  const snapshot = extractProductPageSnapshot(
    fixture("product-partial.html"),
    "https://shop.example/products/black-top",
    new Date("2026-06-02T12:00:00.000Z")
  );
  const evidence = buildProductPageEvidence(snapshot);

  assert.equal(evidence.extractionStatus, "partial");
  assert.equal(evidence.fields.pageTitle.status, "found");
  assert.deepEqual(evidence.fields.pageTitle.values, ["Black Everyday Top"]);
  assert.equal(evidence.fields.brand.status, "not_found");
  assert.deepEqual(evidence.fields.brand.values, []);
  assert.equal(evidence.fields.materialComposition.status, "not_found");
  assert(evidence.foundFields.includes("Page title"));
  assert(evidence.missingFields.includes("Material/composition"));
});

test("keeps fallback values separate from product-page evidence", () => {
  const snapshot = extractProductPageSnapshot(
    fixture("product-partial.html"),
    "https://shop.example/products/black-top",
    new Date("2026-06-02T12:00:00.000Z")
  );
  const evidence = buildProductPageEvidence(snapshot, {
    materialComposition: {
      values: ["MVP keyword fallback: cotton"],
      sourceLabel: "MVP keyword fallback",
    },
  });

  assert.equal(evidence.fields.materialComposition.status, "not_found");
  assert.equal(evidence.fields.materialComposition.fallback.status, "fallback");
  assert.deepEqual(evidence.fields.materialComposition.fallback.values, ["MVP keyword fallback: cotton"]);
  assert(evidence.fallbackFields.includes("Material/composition"));
});

test("marks all fields unavailable when extraction failed", () => {
  const snapshot = createFailedProductPageSnapshot(
    "https://shop.example/products/unavailable",
    "request failed with status 503",
    new Date("2026-06-02T12:00:00.000Z")
  );
  const evidence = buildProductPageEvidence(snapshot);

  assert.equal(evidence.extractionStatus, "failed");
  assert.equal(evidence.fields.pageTitle.status, "unavailable");
  assert.equal(evidence.fields.careText.status, "unavailable");
  assert.deepEqual(evidence.missingFields, []);
  assert(evidence.unavailableFields.includes("Care text"));
  assert.match(evidence.notes[0], /request failed with status 503/);
});

test("adds normalized product-page evidence to the report using an OSKA-style fixture", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    headers: {
      get: () => "text/html; charset=utf-8",
    },
    text: async () => fixture("product-oska-style.html"),
  });

  try {
    const analysis = await analyzeProductUrl(
      "https://nl.oska.com/nl/products/detail/broek-622-katoen-linnen-streep-10260110512/?sizes=9&color=6539"
    );
    const evidence = analysis.report.productPageEvidence;

    assert.equal(evidence.fields.productName.status, "found");
    assert.equal(evidence.fields.brand.status, "found");
    assert.equal(evidence.fields.materialComposition.status, "found");
    assert.equal(evidence.fields.careText.status, "found");
    assert.equal(evidence.fields.sustainabilityClaims.status, "not_found");
    assert.match(evidence.fields.materialComposition.values[0], /katoen/);
    assert.match(evidence.fields.careText.values[0], /Wasvoorschrift/);
  } finally {
    global.fetch = originalFetch;
  }
});
