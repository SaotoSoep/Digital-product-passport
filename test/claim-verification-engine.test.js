const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.DEEP_READER_WORKER_URL = "";

const { analyzeProductUrl } = require("../src/analyzer");
const { createFailedProductPageSnapshot } = require("../src/lib/product-page/snapshot");
const { buildProductPageEvidence } = require("../src/lib/product-passport/evidence");
const {
  buildClaimVerifications,
} = require("../src/lib/product-passport/claim-verification");

function snapshot(overrides = {}) {
  return {
    sourceUrl: "https://shop.example/products/claim-test",
    extractionTimestamp: "2026-06-24T08:00:00.000Z",
    extractionStatus: "success",
    pageTitle: "Claim test product",
    canonicalUrl: "https://shop.example/products/claim-test",
    likelyProductName: "Claim test product",
    likelyBrand: "Example Brand",
    productIdentifiersText: ["SKU 123"],
    colorText: [],
    productDescriptionText: ["A product used for claim verification tests."],
    materialCompositionText: [],
    careText: [],
    sustainabilityClaimSnippets: [],
    supplierDetailText: [],
    originText: [],
    certificationText: [],
    durabilityClaimSnippets: [],
    extractionNotes: [],
    ...overrides,
  };
}

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

test("verifies a claim when product-specific supporting evidence is present", () => {
  const evidence = buildProductPageEvidence(snapshot({
    materialCompositionText: ["Material composition: 80% organic cotton, 20% recycled polyester."],
    sustainabilityClaimSnippets: ["Contains 80% organic cotton"],
  }));
  const [verification] = buildClaimVerifications({}, evidence);

  assert.equal(verification.claimText, "Contains 80% organic cotton");
  assert.equal(verification.claimCategory, "organic");
  assert.equal(verification.evidenceStatus, "present");
  assert.equal(verification.verificationStatus, "verified");
  assert.equal(verification.extractionConfidence, "medium");
  assert.equal(verification.evidenceIds.length, 2);
});

test("marks broad claim wording as partially supported when related evidence is present", () => {
  const evidence = buildProductPageEvidence(snapshot({
    materialCompositionText: ["Material composition: 100% cotton."],
    sustainabilityClaimSnippets: ["Sustainably sourced cotton"],
  }));
  const [verification] = buildClaimVerifications({}, evidence);

  assert.equal(verification.claimCategory, "material");
  assert.equal(verification.evidenceStatus, "present");
  assert.equal(verification.verificationStatus, "partially-supported");
});

test("keeps unsupported claim wording separate from truth claims", () => {
  const evidence = buildProductPageEvidence(snapshot({
    sustainabilityClaimSnippets: ["Climate positive"],
  }));
  const [verification] = buildClaimVerifications({}, evidence);

  assert.equal(verification.claimCategory, "carbon");
  assert.equal(verification.evidenceStatus, "missing");
  assert.equal(verification.verificationStatus, "unverified");
  assert.equal(verification.evidenceIds.length, 1);
});

test("blocked pages produce unavailable claim verification, not unverified", () => {
  const failed = createFailedProductPageSnapshot(
    "https://shop.example/products/blocked",
    "blocked by bot protection",
    new Date("2026-06-24T08:00:00.000Z")
  );
  const evidence = buildProductPageEvidence(failed);
  const [verification] = buildClaimVerifications({}, evidence);

  assert.equal(verification.claimText, "Sustainability claims unavailable");
  assert.equal(verification.evidenceStatus, "unavailable");
  assert.equal(verification.verificationStatus, "unavailable");
  assert.equal(verification.evidenceIds.length, 1);
});

test("AI claims without evidence are removed from claim verification output", () => {
  const evidence = buildProductPageEvidence(snapshot({
    materialCompositionText: ["Material composition: 100% cotton."],
  }));
  const verifications = buildClaimVerifications({
    sustainabilityClaimsFound: [{ claim: "This product removes plastic from the ocean" }],
  }, evidence);

  assert.deepEqual(verifications, []);
});

test("H&M-style sample returns verified claim verification from page evidence after AI failure", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    url: "https://www2.hm.com/en_nl/productpage.123456.html",
    headers: {
      get: () => "text/html; charset=utf-8",
    },
    text: async () => fixture("product-rich.html"),
  });

  try {
    const analysis = await analyzeProductUrl("https://www2.hm.com/en_nl/productpage.123456.html");
    const verifications = analysis.report.claimVerifications;

    assert(verifications.length > 0);
    assert(verifications.some((claim) => claim.verificationStatus === "verified"));
    assert(verifications.every((claim) => claim.evidenceIds.length > 0));
    assert.deepEqual(
      analysis.report.sustainabilityClaimsFound.map((claim) => claim.claim),
      verifications.map((claim) => claim.claimText)
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("Zara sample removes unsupported AI fallback claims when evidence is only material disclosure", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    url: "https://www.zara.com/nl/en/basic-cotton-shirt-p00000000.html",
    headers: {
      get: () => "text/html; charset=utf-8",
    },
    text: async () => `<!doctype html>
      <html>
        <head>
          <title>Basic Cotton Shirt | ZARA</title>
          <meta name="description" content="Basic shirt with cotton fabric." />
        </head>
        <body>
          <h1>Basic Cotton Shirt</h1>
          <p>Material composition: 100% cotton.</p>
        </body>
      </html>`,
  });

  try {
    const analysis = await analyzeProductUrl("https://www.zara.com/nl/en/basic-cotton-shirt-p00000000.html");

    assert.deepEqual(analysis.report.claimVerifications, []);
    assert.deepEqual(analysis.report.sustainabilityClaimsFound, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test("Mango blocked sample reports unavailable claim verification", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    url: "https://shop.mango.com/nl/en/p/women/blocked-product",
    headers: {
      get: () => "text/html; charset=utf-8",
    },
    text: async () => `<!doctype html>
      <html>
        <head><title>Access denied</title></head>
        <body>Access Denied. You do not have permission to access this page.</body>
      </html>`,
  });

  try {
    const analysis = await analyzeProductUrl("https://shop.mango.com/nl/en/p/women/blocked-product");
    const [verification] = analysis.report.claimVerifications;

    assert.equal(analysis.metadata.productPageSnapshot.extractionStatus, "failed");
    assert.equal(verification.evidenceStatus, "unavailable");
    assert.equal(verification.verificationStatus, "unavailable");
  } finally {
    global.fetch = originalFetch;
  }
});
