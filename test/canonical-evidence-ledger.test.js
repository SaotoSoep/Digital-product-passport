const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildCanonicalClaims,
  buildProductPageEvidence,
  createCanonicalEvidenceRecord,
  createEvidenceId,
  validateClaimCitation,
} = require("../src/lib/product-passport/evidence");

function snapshot(overrides = {}) {
  return {
    sourceUrl: "https://shop.example/products/traceable-shirt?variant=blue",
    extractionTimestamp: "2026-06-19T08:00:00.000Z",
    extractionStatus: "partial",
    pageTitle: "Traceable shirt",
    canonicalUrl: "https://shop.example/products/traceable-shirt",
    likelyProductName: "Traceable shirt",
    likelyBrand: "Example Brand",
    productIdentifiersText: [],
    colorText: [],
    productDescriptionText: [],
    materialCompositionText: ["100% organic cotton"],
    careText: ["Machine wash at 30°C"],
    sustainabilityClaimSnippets: ["Made with lower-impact organic cotton"],
    supplierDetailText: [],
    originText: [],
    certificationText: ["GOTS certified"],
    durabilityClaimSnippets: [],
    extractionNotes: [],
    ...overrides,
  };
}

test("creates stable evidence IDs independent of capture timestamp", () => {
  const first = buildProductPageEvidence(snapshot());
  const second = buildProductPageEvidence(snapshot({
    extractionTimestamp: "2026-06-20T08:00:00.000Z",
  }));

  assert.deepEqual(
    first.fields.materialComposition.evidenceIds,
    second.fields.materialComposition.evidenceIds
  );
  assert.match(first.fields.materialComposition.evidenceIds[0], /^ev_[a-f0-9]{16}$/);
  assert.equal(createEvidenceId(first.evidenceLedger.records[0]), first.evidenceLedger.records[0].id);
});

test("separates public facts, brand statements, and interpretations", () => {
  const evidence = buildProductPageEvidence(snapshot(), {
    productionOrigin: { values: ["Possibly made in Europe"] },
  });
  const byId = new Map(evidence.evidenceLedger.records.map((record) => [record.id, record]));

  assert.equal(byId.get(evidence.fields.materialComposition.evidenceIds[0]).sourceType, "public_page_evidence");
  assert.equal(byId.get(evidence.fields.sustainabilityClaims.evidenceIds[0]).sourceType, "brand_statement");
  assert.equal(
    byId.get(evidence.fields.productionOrigin.fallback.evidenceIds[0]).sourceType,
    "interpretation"
  );
});

test("preserves checked-not-found separately from unavailable", () => {
  const missing = buildProductPageEvidence(snapshot());
  const unavailable = buildProductPageEvidence(snapshot({ extractionStatus: "failed" }));
  const missingRecord = missing.evidenceLedger.records.find((record) => record.fieldKey === "productionOrigin");
  const unavailableRecord = unavailable.evidenceLedger.records.find((record) => record.fieldKey === "productionOrigin");

  assert.equal(missingRecord.status, "not_found");
  assert.equal(missingRecord.verificationStatus, "not_found");
  assert.equal(unavailableRecord.status, "unavailable");
  assert.equal(unavailableRecord.verificationStatus, "unavailable");
  assert.notEqual(missingRecord.id, unavailableRecord.id);
});

test("validates citations and refuses independent verification from brand wording alone", () => {
  const evidence = buildProductPageEvidence(snapshot());
  const evidenceId = evidence.fields.sustainabilityClaims.evidenceIds[0];

  assert.deepEqual(validateClaimCitation({ evidenceIds: ["ev_unknown"] }, evidence).reason, "unknown_evidence_id");
  assert.equal(validateClaimCitation({
    evidenceIds: [evidenceId],
    verificationStatus: "independently_verified",
  }, evidence).reason, "brand_statement_requires_separate_source");
  assert.equal(validateClaimCitation({
    originalWording: "Made entirely from ocean plastic",
    evidenceIds: [evidenceId],
  }, evidence).reason, "wording_not_supported");

  const external = createCanonicalEvidenceRecord({
    fieldKey: "certifications",
    sourceType: "external_evidence",
    sourceUrl: "https://certifier.example/certificates/123",
    excerpt: "Made with lower-impact organic cotton",
    captureMethod: "public_registry",
    extractionConfidence: "high",
  });
  evidence.evidenceLedger.records.push(external);
  assert.equal(validateClaimCitation({
    originalWording: "Made with lower-impact organic cotton",
    evidenceIds: [evidenceId, external.id],
    verificationStatus: "independently_verified",
  }, evidence).valid, true);
});

test("downgrades unsupported AI facts to interpretation without a citation", () => {
  const evidence = buildProductPageEvidence(snapshot());
  const claims = buildCanonicalClaims({
    sustainabilityClaimsFound: [{ claim: "This shirt removes plastic from the ocean" }],
  }, evidence);
  const unsupported = claims.find((claim) => /removes plastic/.test(claim.originalWording));

  assert.equal(unsupported.sourceType, "interpretation");
  assert.equal(unsupported.verificationStatus, "interpretation");
  assert.deepEqual(unsupported.evidenceIds, []);
  assert.match(unsupported.note, /not present in the evidence ledger/i);
});
