const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { analyzeProductUrl } = require("../src/analyzer");
const { buildProductPageEvidence } = require("../src/lib/product-passport/evidence");
const { buildPassportReadiness } = require("../src/lib/product-passport/readiness");
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
  assert.equal(evidence.fields.productDescription.status, "not_found");
  assert.equal(evidence.fields.materialComposition.status, "not_found");
  assert.equal(evidence.fields.certifications.status, "not_found");
  assert.equal(evidence.fields.durabilityClaims.status, "not_found");
  assert(evidence.foundFields.includes("Page title"));
  assert(evidence.missingFields.includes("Material/composition"));
  assert(evidence.missingFields.includes("Certification or standard references"));
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

test("builds a passport readiness analysis from normalized evidence", () => {
  const snapshot = {
    sourceUrl: "https://shop.example/products/linen-henley",
    extractionTimestamp: "2026-06-06T12:00:00.000Z",
    extractionStatus: "success",
    pageTitle: "Linen Henley",
    canonicalUrl: "https://shop.example/products/linen-henley",
    likelyProductName: "Linen Henley",
    likelyBrand: "Example Studio",
    productIdentifiersText: ["Product no. 1340205001"],
    colorText: ["Color: DARK BROWN"],
    productDescriptionText: [
      "Offered in a rich espresso tone.",
      "Offered in a neutral off-white tone.",
    ],
    materialCompositionText: ["Shell: 86% Linen, 14% Polyamide"],
    careText: ["Machine wash cold. gentle cycle"],
    sustainabilityClaimSnippets: [],
    originText: ["Factory: Shanghai Jingrong; Address: Shanghai, Mainland China; 659 workers"],
    certificationText: [],
    durabilityClaimSnippets: [],
    structuredProductData: null,
    extractionNotes: [],
  };
  const evidence = buildProductPageEvidence(snapshot);
  const readiness = buildPassportReadiness(evidence, snapshot);

  assert.equal(readiness.status, "useful");
  assert(readiness.readyFields.some((item) => item.key === "materialComposition"));
  assert(readiness.readyFields.some((item) => item.key === "productionOrigin"));
  assert(readiness.missingFields.some((item) => item.key === "rawMaterialProvenance"));
  assert(readiness.missingFields.some((item) => item.key === "proofDocuments"));
  assert(readiness.warnings.some((item) => item.key === "colorDescriptionConflict"));
  assert(readiness.warnings.some((item) => item.key === "syntheticMaterial"));
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
    assert.equal(evidence.fields.productionOrigin.status, "not_found");
    assert.equal(evidence.fields.certifications.status, "not_found");
    assert.equal(evidence.fields.durabilityClaims.status, "not_found");
    assert.equal(analysis.report.passportReadiness.status, "partial");
    assert(analysis.report.passportReadiness.missingFields.some((item) => item.key === "proofDocuments"));
    assert.match(evidence.fields.materialComposition.values[0], /katoen/);
    assert.match(evidence.fields.careText.values[0], /Wasvoorschrift/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("reports bot verification blocks and still fetches public brand context", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const requestedUrl = String(url);

    if (requestedUrl.includes("zara.com/nl/en/linen-blend")) {
      return {
        ok: true,
        status: 200,
        url: requestedUrl,
        headers: {
          get: () => "text/html; charset=utf-8",
        },
        text: async () => `<!DOCTYPE html>
          <html>
            <head>
              <meta http-equiv="refresh" content="5; URL='/nl/en/item.html?bm-verify=AAQAAAAN'" />
              <title>&nbsp;</title>
            </head>
            <body>Browser verification</body>
          </html>`,
      };
    }

    if (requestedUrl.includes("inditex.com/itxcomweb/en/sustainability")) {
      return {
        ok: true,
        status: 200,
        url: requestedUrl,
        headers: {
          get: () => "text/html; charset=utf-8",
        },
        text: async () => `<!DOCTYPE html>
          <html>
            <head>
              <title>INDITEX | Sustainability</title>
              <meta name="description" content="Inditex shares sustainability information about raw materials, circularity, stores, and supply chain work." />
            </head>
            <body>
              <p>Raw materials used in our clothing include lower-impact fibres and recycled fibres.</p>
              <p>Our stores run on renewable electricity and play a role in our transition to a more circular model.</p>
            </body>
          </html>`,
      };
    }

    return {
      ok: false,
      status: 404,
      url: requestedUrl,
      headers: {
        get: () => "text/html; charset=utf-8",
      },
      text: async () => "<html><title>Not found</title></html>",
    };
  };

  try {
    const analysis = await analyzeProductUrl(
      "https://www.zara.com/nl/en/linen-blend-sarouel-trousers-p08372031.html?v1=545479761&v2=2418881"
    );

    assert.equal(analysis.metadata.productPageSnapshot.extractionStatus, "failed");
    assert.equal(analysis.metadata.productPageSnapshot.likelyBrand, "Zara");
    assert.equal(analysis.metadata.productPageSnapshot.likelyProductName, "LINEN BLEND SAROUEL TROUSERS");
    assert.equal(analysis.report.accessDiagnostics.type, "bot_verification");
    assert.equal(analysis.report.brandInsight.status, "found");
    assert.equal(analysis.report.brandInsight.brand, "Zara");
    assert(analysis.report.brandInsight.sources.some((source) => source.url.includes("inditex.com")));
  } finally {
    global.fetch = originalFetch;
  }
});
