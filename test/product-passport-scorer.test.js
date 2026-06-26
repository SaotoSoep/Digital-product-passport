const assert = require("node:assert/strict");
const test = require("node:test");

const {
  scoreClaimStrength,
  scoreProductPassport,
  scoreTransparency,
} = require("../src/lib/product-passport/scorer");
const {
  EVIDENCE_SOURCE_TYPES,
  createCanonicalEvidenceRecord,
} = require("../src/lib/product-passport/evidence");

const FIELD_KEYS = [
  "productName", "brand", "productIdentifiers", "productDescription",
  "materialComposition", "productionOrigin", "supplierDetails", "careText",
  "sustainabilityClaims", "certifications", "durabilityClaims",
];

function evidence(foundValues = {}, overrides = {}) {
  const fields = Object.fromEntries(FIELD_KEYS.map((key) => [key, {
    key,
    label: key,
    status: Object.hasOwn(foundValues, key) ? "found" : "not_found",
    values: foundValues[key] || [],
  }]));

  return {
    extractionStatus: "success",
    fields,
    ...overrides,
  };
}

function withExternalCertification(input, excerpt, sourceUrl = "https://cert.example/products/certificate") {
  const record = createCanonicalEvidenceRecord({
    fieldKey: "certifications",
    sourceType: EVIDENCE_SOURCE_TYPES.EXTERNAL,
    status: "found",
    sourceUrl,
    excerpt,
    captureMethod: "test_external_evidence",
    capturedAt: "2026-06-24T08:00:00.000Z",
    extractionConfidence: "high",
  });

  input.evidenceLedger = {
    version: 1,
    records: [...(input.evidenceLedger?.records || []), record],
  };
  return input;
}

function factor(result, key) {
  return result.factors.find((item) => item.key === key);
}

const cases = [
  {
    name: "rich",
    input: evidence({
      productName: ["Traceable shirt"], brand: ["Example"], productIdentifiers: ["SKU 42"],
      productDescription: ["A cotton shirt"], materialComposition: ["100% organic cotton"],
      productionOrigin: ["Made in Portugal"], supplierDetails: ["Factory ABC, Porto"],
      careText: ["Wash at 30°C"], sustainabilityClaims: ["100% certified organic cotton"],
      certifications: ["GOTS certificate 123"], durabilityClaims: ["Two-year repair warranty"],
    }),
    transparency: { status: "scored", score: 100 },
    claim: { status: "scored", score: 60 },
  },
  {
    name: "sparse",
    input: evidence({ productName: ["Plain top"] }, { extractionStatus: "partial" }),
    transparency: { status: "scored", score: 3 },
    claim: { status: "not_available", score: null },
  },
  {
    name: "claim-only",
    input: evidence({ sustainabilityClaims: ["We make responsible fashion"] }),
    transparency: { status: "scored", score: 10 },
    claim: { status: "scored", score: 5 },
  },
  {
    name: "independently supported",
    input: withExternalCertification(evidence({
      productIdentifiers: ["SKU 99"],
      materialComposition: ["80% recycled polyester, 20% cotton"],
      sustainabilityClaims: ["Contains 80% recycled polyester"],
      certifications: ["GRS certificate CU-123456"],
    }), "GRS certificate CU-123456 applies to SKU 99."),
    transparency: { status: "scored", score: 43 },
    claim: { status: "scored", score: 80 },
  },
  {
    name: "blocked",
    input: evidence({}, { extractionStatus: "failed" }),
    transparency: { status: "not_available", score: null },
    claim: { status: "not_available", score: null },
  },
  {
    name: "contradictory",
    input: evidence({
      productName: ["Mixed tee"],
      materialComposition: ["80% cotton", "60% cotton"],
      sustainabilityClaims: ["80% organic cotton"],
    }),
    transparency: { status: "scored", score: 23 },
    claim: { status: "scored", score: 30 },
  },
];

test("scores representative evidence deterministically", async (t) => {
  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const first = scoreProductPassport(scenario.input);
      const second = scoreProductPassport(structuredClone(scenario.input));

      assert.deepEqual(first, second);
      assert.deepEqual(
        { status: first.transparencyScore.status, score: first.transparencyScore.score },
        scenario.transparency
      );
      assert.deepEqual(
        { status: first.claimStrengthScore.status, score: first.claimStrengthScore.score },
        scenario.claim
      );
    });
  }
});

test("brand wording without independent product-specific support cannot score high", () => {
  const result = scoreClaimStrength(evidence({
    sustainabilityClaims: ["Our responsible collection uses better materials"],
    productionOrigin: ["Made in Portugal"],
    supplierDetails: ["Factory ABC"],
  }));

  assert.equal(result.status, "scored");
  assert(result.score <= 35);
  assert.equal(result.cap.value, 35);
});

test("partially met prerequisites are exposed as missing-factor explanations", () => {
  const result = scoreClaimStrength(evidence({
    productIdentifiers: ["SKU 99"],
    sustainabilityClaims: ["Certified recycled polyester"],
    certifications: ["GRS certificate CU-123456"],
  }));
  const partialSupport = scoreClaimStrength(evidence({
    sustainabilityClaims: ["Certified recycled polyester"],
    certifications: ["GRS certificate CU-123456"],
  }));

  assert.equal(result.status, "scored");
  assert(partialSupport.missingFactors.some((factor) => factor.key === "independent_support"));
  assert.match(
    partialSupport.missingFactors.find((factor) => factor.key === "independent_support").reason,
    /brand or product-page evidence/i
  );
});

test("independent support points require qualifying external product-linked evidence", async (t) => {
  const scenarios = [
    {
      name: "brand certificate mention only",
      input: evidence({
        sustainabilityClaims: ["Certified organic cotton"],
        certifications: ["GOTS certificate 123"],
      }),
      impact: 0,
      status: "partial",
      reason: /brand or product-page evidence/i,
      hasEvidenceIds: false,
    },
    {
      name: "brand certificate mention plus SKU",
      input: evidence({
        productIdentifiers: ["SKU 42"],
        sustainabilityClaims: ["Certified organic cotton"],
        certifications: ["GOTS certificate 123"],
      }),
      impact: 0,
      status: "partial",
      reason: /brand or product-page evidence/i,
      hasEvidenceIds: false,
    },
    {
      name: "external certificate without product linkage",
      input: withExternalCertification(evidence({
        productIdentifiers: ["SKU 42"],
        sustainabilityClaims: ["Certified organic cotton"],
        certifications: ["GOTS certificate 123"],
      }), "GOTS certificate 123 covers the supplier standard."),
      impact: 0,
      status: "partial",
      reason: /did not link to this product identifier/i,
      hasEvidenceIds: true,
    },
    {
      name: "external certificate linked to product identifier",
      input: withExternalCertification(evidence({
        productIdentifiers: ["SKU 42"],
        sustainabilityClaims: ["Certified organic cotton"],
        certifications: ["GOTS certificate 123"],
      }), "GOTS certificate 123 applies to SKU 42."),
      impact: 35,
      status: "present",
      reason: /external evidence links certification support/i,
      hasEvidenceIds: true,
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, () => {
      const result = scoreClaimStrength(scenario.input);
      const independentSupport = factor(result, "independent_support");

      assert.equal(independentSupport.impact, scenario.impact);
      assert.equal(independentSupport.status, scenario.status);
      assert.match(independentSupport.reason, scenario.reason);
      assert.equal(independentSupport.evidenceIds.length > 0, scenario.hasEvidenceIds);
    });
  }
});

test("absence statements are not rewarded as claims or supporting evidence", () => {
  const input = evidence({
    productName: ["Minimal trousers"],
    materialComposition: ["Polyester blend"],
    sustainabilityClaims: ["No clear sustainability certification, factory, supplier, or origin information is shown."],
    certifications: ["No clear sustainability certification is shown."],
    productionOrigin: ["Supplier: , or origin information is shown on this product page.", "Factory: ,", "No clear origin information is shown."],
    supplierDetails: ["Supplier: , or origin information is shown on this product page.", "Factory: ,", "No clear supplier information is shown."],
  });
  const result = scoreProductPassport(input);

  assert.equal(result.claimStrengthScore.status, "not_available");
  assert.equal(result.claimStrengthScore.score, null);
  assert.equal(result.transparencyScore.score, 23);
});

test("scored boundaries stay within 0–100 and unavailable results never use proxy numbers", () => {
  const scored = [
    scoreTransparency(cases[0].input),
    scoreTransparency(cases[5].input),
    scoreClaimStrength(cases[0].input),
    scoreClaimStrength(cases[5].input),
  ];
  const unavailable = [
    scoreTransparency(cases[4].input),
    scoreClaimStrength(cases[4].input),
    scoreClaimStrength(cases[1].input),
  ];

  for (const result of scored) {
    assert.equal(result.status, "scored");
    assert(Number.isInteger(result.score));
    assert(result.score >= 0 && result.score <= 100);
    assert(result.topPositiveFactors.length <= 2);
    assert(result.missingFactors.length <= 2);
  }

  for (const result of unavailable) {
    assert.equal(result.status, "not_available");
    assert.equal(result.score, null);
  }
});
