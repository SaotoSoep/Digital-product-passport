const { createHash } = require("node:crypto");

const EVIDENCE_SOURCE_TYPES = Object.freeze({
  BRAND_STATEMENT: "brand_statement",
  PUBLIC_PAGE: "public_page_evidence",
  EXTERNAL: "external_evidence",
  USER_PROVIDED: "user_provided_evidence",
  MISSING: "missing_information",
  INTERPRETATION: "interpretation",
});

const FIELD_DEFINITIONS = [
  {
    key: "pageTitle",
    label: "Page title",
    snapshotKey: "pageTitle",
    type: "single",
  },
  {
    key: "canonicalUrl",
    label: "Canonical URL",
    snapshotKey: "canonicalUrl",
    type: "single",
  },
  {
    key: "productName",
    label: "Product name",
    snapshotKey: "likelyProductName",
    type: "single",
  },
  {
    key: "brand",
    label: "Brand",
    snapshotKey: "likelyBrand",
    type: "single",
  },
  {
    key: "productIdentifiers",
    label: "Product identifiers",
    snapshotKey: "productIdentifiersText",
    type: "list",
  },
  {
    key: "colorVariant",
    label: "Color/variant",
    snapshotKey: "colorText",
    type: "list",
  },
  {
    key: "productDescription",
    label: "Product description",
    snapshotKey: "productDescriptionText",
    type: "list",
    deepReadDependent: true,
  },
  {
    key: "materialComposition",
    label: "Material/composition",
    snapshotKey: "materialCompositionText",
    type: "list",
    deepReadDependent: true,
  },
  {
    key: "careText",
    label: "Care text",
    snapshotKey: "careText",
    type: "list",
    deepReadDependent: true,
  },
  {
    key: "sustainabilityClaims",
    label: "Sustainability claim text",
    snapshotKey: "sustainabilityClaimSnippets",
    type: "list",
    deepReadDependent: true,
  },
  {
    key: "supplierDetails",
    label: "Supplier/factory details",
    snapshotKey: "supplierDetailText",
    type: "list",
    deepReadDependent: true,
  },
  {
    key: "productionOrigin",
    label: "Origin/manufacturing",
    snapshotKey: "originText",
    type: "list",
    deepReadDependent: true,
  },
  {
    key: "certifications",
    label: "Certification or standard references",
    snapshotKey: "certificationText",
    type: "list",
    deepReadDependent: true,
  },
  {
    key: "durabilityClaims",
    label: "Durability, repair, or warranty claims",
    snapshotKey: "durabilityClaimSnippets",
    type: "list",
    deepReadDependent: true,
  },
];

function cleanEvidenceValue(value) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  return cleaned && cleaned !== "not_found" ? cleaned : "";
}

function canonicalPart(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function createEvidenceId({ fieldKey, sourceType, status, sourceUrl, excerpt }) {
  const identity = [fieldKey, sourceType, status, sourceUrl, excerpt]
    .map(canonicalPart)
    .join("\u001f");
  return `ev_${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`;
}

function createCanonicalEvidenceRecord(input) {
  const allowedTypes = new Set(Object.values(EVIDENCE_SOURCE_TYPES));
  const sourceType = allowedTypes.has(input?.sourceType)
    ? input.sourceType
    : EVIDENCE_SOURCE_TYPES.INTERPRETATION;
  const status = input?.status || "found";
  const record = {
    id: "",
    fieldKey: cleanEvidenceValue(input?.fieldKey) || "unspecified",
    sourceType,
    verificationStatus: verificationStatus(sourceType, status),
    status,
    sourceUrl: /^https?:\/\//i.test(String(input?.sourceUrl || "")) ? String(input.sourceUrl) : null,
    excerpt: cleanEvidenceValue(input?.excerpt),
    captureMethod: cleanEvidenceValue(input?.captureMethod) || "manual_record",
    capturedAt: input?.capturedAt || null,
    extractionConfidence: ["high", "medium", "low"].includes(input?.extractionConfidence)
      ? input.extractionConfidence
      : "medium",
  };
  record.id = createEvidenceId(record);
  return record;
}

function sourceTypeForField(fieldKey, status, fallback = false) {
  if (fallback) {
    return EVIDENCE_SOURCE_TYPES.INTERPRETATION;
  }

  if (status !== "found") {
    return EVIDENCE_SOURCE_TYPES.MISSING;
  }

  return ["sustainabilityClaims", "certifications", "durabilityClaims"].includes(fieldKey)
    ? EVIDENCE_SOURCE_TYPES.BRAND_STATEMENT
    : EVIDENCE_SOURCE_TYPES.PUBLIC_PAGE;
}

function verificationStatus(sourceType, status) {
  if (status === "not_found") return "not_found";
  if (status === "unavailable") return "unavailable";
  if (sourceType === EVIDENCE_SOURCE_TYPES.EXTERNAL) return "independently_verified";
  if (sourceType === EVIDENCE_SOURCE_TYPES.USER_PROVIDED) return "user_provided";
  if (sourceType === EVIDENCE_SOURCE_TYPES.BRAND_STATEMENT) return "brand_statement_only";
  if (sourceType === EVIDENCE_SOURCE_TYPES.INTERPRETATION) return "interpretation";
  return "source_confirmed";
}

function extractionConfidence(field, status, fallback = false) {
  if (fallback || status === "unavailable") return "low";
  if (status === "not_found") return "medium";
  return field.source === "product_page_deep_read" ? "high" : "medium";
}

function makeEvidenceRecord(field, excerpt, status = field.status, fallback = false) {
  const userProvided = !fallback && field.source === "user_provided_evidence";
  const sourceType = userProvided
    ? EVIDENCE_SOURCE_TYPES.USER_PROVIDED
    : sourceTypeForField(field.key, status, fallback);
  const sourceUrl = fallback || userProvided ? null : field.sourceUrl || null;
  const captureMethod = fallback
    ? field.fallback?.source || "agent_interpretation"
    : field.source || "product_page_basic_extraction";
  return createCanonicalEvidenceRecord({
    fieldKey: field.key,
    sourceType,
    status,
    sourceUrl,
    excerpt,
    captureMethod,
    capturedAt: fallback ? null : field.extractedAt || null,
    extractionConfidence: extractionConfidence(field, status, fallback),
  });
}

function buildCanonicalEvidenceLedger(productPageEvidence) {
  const records = [];
  const fields = productPageEvidence?.fields || {};

  for (const field of Object.values(fields)) {
    field.evidenceIds = [];
    field.valueEvidenceIds = [];

    if (field.status === "found") {
      for (const value of field.values) {
        const record = makeEvidenceRecord(field, value);
        records.push(record);
        field.evidenceIds.push(record.id);
        field.valueEvidenceIds.push(record.id);
      }
    } else {
      const excerpt = field.status === "unavailable"
        ? `${field.label}: source unavailable; this field could not be checked.`
        : `${field.label}: checked and not found.`;
      const record = makeEvidenceRecord(field, excerpt);
      records.push(record);
      field.evidenceIds.push(record.id);
    }

    if (field.fallback) {
      field.fallback.evidenceIds = [];
      for (const value of field.fallback.values) {
        const record = makeEvidenceRecord(field, value, "interpretation", true);
        records.push(record);
        field.fallback.evidenceIds.push(record.id);
      }
    }
  }

  productPageEvidence.evidenceLedger = {
    version: 1,
    records,
  };
  return productPageEvidence.evidenceLedger;
}

function normalizedWords(value) {
  return new Set(canonicalPart(value).match(/[a-z0-9%]+/g) || []);
}

function wordingMatches(claim, excerpt) {
  const left = canonicalPart(claim);
  const right = canonicalPart(excerpt);
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return true;
  const claimWords = normalizedWords(left);
  const excerptWords = normalizedWords(right);
  const overlap = [...claimWords].filter((word) => excerptWords.has(word)).length;
  return claimWords.size >= 3 && overlap / claimWords.size >= 0.7;
}

function evidenceIndex(evidence) {
  return new Map((evidence?.evidenceLedger?.records || []).map((record) => [record.id, record]));
}

function validateClaimCitation(claim, evidence) {
  const index = evidenceIndex(evidence);
  const ids = Array.isArray(claim?.evidenceIds) ? claim.evidenceIds : [];
  const records = ids.map((id) => index.get(id)).filter(Boolean);
  const invalidIds = ids.filter((id) => !index.has(id));
  const independent = records.some((record) => record.sourceType === EVIDENCE_SOURCE_TYPES.EXTERNAL);
  const verifiedBrandError = claim?.verificationStatus === "independently_verified" &&
    records.some((record) => record.sourceType === EVIDENCE_SOURCE_TYPES.BRAND_STATEMENT) && !independent;
  const wording = claim?.originalWording || claim?.claim || claim?.brandClaim;
  const wordingUnsupported = Boolean(wording) && records.length > 0 &&
    !records.some((record) => record.status !== "found" || wordingMatches(wording, record.excerpt));

  return {
    valid: invalidIds.length === 0 && records.length > 0 && !verifiedBrandError && !wordingUnsupported,
    records,
    invalidIds,
    reason: invalidIds.length > 0
      ? "unknown_evidence_id"
      : records.length === 0
      ? "missing_citation"
      : verifiedBrandError
      ? "brand_statement_requires_separate_source"
      : wordingUnsupported
      ? "wording_not_supported"
      : null,
  };
}

const CLAIM_FIELDS = [
  ["materialComposition", "material"],
  ["productionOrigin", "origin"],
  ["supplierDetails", "origin"],
  ["careText", "care"],
  ["certifications", "certification"],
  ["sustainabilityClaims", "sustainability"],
];

function buildCanonicalClaims(report, evidence) {
  const index = evidenceIndex(evidence);
  const claims = [];

  for (const [fieldKey, category] of CLAIM_FIELDS) {
    const field = evidence?.fields?.[fieldKey];
    if (!field) continue;

    if (field.status === "found") {
      field.values.forEach((wording, position) => {
        const evidenceId = field.valueEvidenceIds[position];
        const record = index.get(evidenceId);
        claims.push({
          id: `claim_${evidenceId.slice(3)}`,
          category,
          originalWording: wording,
          sourceType: record.sourceType,
          verificationStatus: record.verificationStatus,
          confidenceDimension: record.extractionConfidence,
          evidenceIds: [evidenceId],
        });
      });
    } else {
      claims.push({
        id: `claim_${field.evidenceIds[0].slice(3)}`,
        category,
        originalWording: field.status === "unavailable" ? "Information unavailable" : "Information not found",
        sourceType: EVIDENCE_SOURCE_TYPES.MISSING,
        verificationStatus: field.status,
        confidenceDimension: field.status === "unavailable" ? "low" : "medium",
        evidenceIds: field.evidenceIds.slice(0, 1),
      });
    }
  }

  const reportedClaims = Array.isArray(report?.sustainabilityClaimsFound)
    ? report.sustainabilityClaimsFound
    : [];
  const supportingRecords = [...index.values()].filter((record) =>
    record.status === "found" && ["sustainabilityClaims", "certifications"].includes(record.fieldKey)
  );

  for (const reportedClaim of reportedClaims) {
    const wording = cleanEvidenceValue(reportedClaim.brandClaim || reportedClaim.claim);
    if (!wording || claims.some((claim) => claim.category === "sustainability" && canonicalPart(claim.originalWording) === canonicalPart(wording))) continue;
    const matches = supportingRecords.filter((record) => wordingMatches(wording, record.excerpt));
    const independent = matches.some((record) => record.sourceType === EVIDENCE_SOURCE_TYPES.EXTERNAL);
    const userProvided = matches.some((record) => record.sourceType === EVIDENCE_SOURCE_TYPES.USER_PROVIDED);
    claims.push({
      id: `claim_${createHash("sha256").update(canonicalPart(wording)).digest("hex").slice(0, 16)}`,
      category: "sustainability",
      originalWording: wording,
      sourceType: matches[0]?.sourceType || EVIDENCE_SOURCE_TYPES.INTERPRETATION,
      verificationStatus: independent
        ? "independently_verified"
        : userProvided
        ? "user_provided"
        : matches.length > 0
        ? "brand_statement_only"
        : "interpretation",
      confidenceDimension: matches.length > 0 ? matches[0].extractionConfidence : "low",
      evidenceIds: matches.map((record) => record.id),
      note: matches.length > 0
        ? userProvided
          ? "The wording came from user-provided evidence and was not independently fetched or verified."
          : "Brand wording is cited, but no separate qualifying source independently verifies it."
        : "AI-generated wording was not present in the evidence ledger and was downgraded to interpretation.",
    });
  }

  return claims;
}

function normalizeValues(value) {
  if (Array.isArray(value)) {
    return value.map(cleanEvidenceValue).filter(Boolean);
  }

  const cleaned = cleanEvidenceValue(value);
  return cleaned ? [cleaned] : [];
}

function normalizeFallback(fallback) {
  if (!fallback) {
    return null;
  }

  const values = normalizeValues(fallback.values || fallback.value);

  if (values.length === 0) {
    return null;
  }

  return {
    status: "fallback",
    source: fallback.source || "agent_interpretation",
    sourceLabel: fallback.sourceLabel || "Report fallback",
    values,
    note: fallback.note || "Shown separately because no product-page value was found for this field.",
  };
}

function buildField(snapshot, definition, fallbackByKey = {}) {
  const values = normalizeValues(snapshot && snapshot[definition.snapshotKey]);
  const extractionUnavailable = !snapshot || snapshot.extractionStatus === "failed";
  const status = extractionUnavailable
    ? "unavailable"
    : values.length > 0
    ? "found"
    : "not_found";
  const fallback = status === "found" ? null : normalizeFallback(fallbackByKey[definition.key]);

  return {
    key: definition.key,
    label: definition.label,
    status,
    values,
    sourceUrl: snapshot ? snapshot.sourceUrl : null,
    extractedAt: snapshot ? snapshot.extractionTimestamp : null,
    source: status === "found"
      ? "product_page_basic_extraction"
      : status === "not_found"
      ? "product_page_basic_extraction"
      : "extraction_unavailable",
    sourceLabel: status === "found"
      ? "Product page basic extraction"
      : status === "not_found"
      ? "Product page basic extraction checked"
      : "Product page extraction unavailable",
    note: status === "found"
      ? "Found in publicly visible product-page data."
      : status === "not_found"
      ? "Not found in the normalized product-page extraction."
      : "Product-page extraction failed, so this field could not be checked.",
    fallback,
    deepReadDependent: Boolean(definition.deepReadDependent),
  };
}

function refreshEvidenceSummary(evidence) {
  const fieldList = Object.values(evidence.fields || {});
  evidence.foundFields = fieldList
    .filter((field) => field.status === "found")
    .map((field) => field.label);
  evidence.missingFields = fieldList
    .filter((field) => field.status === "not_found")
    .map((field) => field.label);
  evidence.unavailableFields = fieldList
    .filter((field) => field.status === "unavailable")
    .map((field) => field.label);
  evidence.fallbackFields = fieldList
    .filter((field) => field.fallback)
    .map((field) => field.label);
  return evidence;
}

function mergeUserProvidedEvidence(productPageEvidence, providedSnapshot, descriptor = {}) {
  if (!productPageEvidence || !providedSnapshot) {
    return productPageEvidence;
  }

  const providedEvidence = buildProductPageEvidence(providedSnapshot);
  const label = cleanEvidenceValue(descriptor.label) || "User-provided evidence";
  const providedAt = descriptor.providedAt || providedSnapshot.extractionTimestamp || null;

  for (const [key, providedField] of Object.entries(providedEvidence.fields)) {
    const targetField = productPageEvidence.fields[key];
    if (!targetField || targetField.status === "found" || providedField.status !== "found") {
      continue;
    }

    targetField.status = "found";
    targetField.values = [...providedField.values];
    targetField.sourceUrl = null;
    targetField.extractedAt = providedAt;
    targetField.source = "user_provided_evidence";
    targetField.sourceLabel = label;
    targetField.note = "Provided by the user for this one-off analysis; not independently fetched or verified.";
    targetField.fallback = null;
  }

  productPageEvidence.userProvidedEvidence = {
    kind: descriptor.kind || "visible_text",
    label,
    fileName: cleanEvidenceValue(descriptor.fileName) || null,
    providedAt,
    contentLength: Number(descriptor.contentLength || 0),
    content: String(descriptor.content || ""),
    extractionStatus: providedEvidence.extractionStatus,
    fields: Object.fromEntries(
      Object.entries(providedEvidence.fields)
        .filter(([, field]) => field.status === "found")
        .map(([key, field]) => [key, { label: field.label, values: field.values }])
    ),
  };

  refreshEvidenceSummary(productPageEvidence);
  productPageEvidence.summary = `${productPageEvidence.summary} User-provided evidence is stored separately and only fills fields that public extraction did not find.`;
  return productPageEvidence;
}

function buildScoringEligibility(evidence) {
  const fields = evidence?.fields || {};
  const found = (key) => fields[key]?.status === "found" && fields[key].values?.length > 0;
  const hasIdentity = found("productName") || found("productIdentifiers");
  const disclosureKeys = [
    "materialComposition",
    "careText",
    "productionOrigin",
    "supplierDetails",
    "sustainabilityClaims",
    "certifications",
    "durabilityClaims",
  ];
  const disclosureCount = disclosureKeys.filter(found).length;
  const hasClaimSupport = ["materialComposition", "certifications", "durabilityClaims"]
    .some(found);

  return {
    transparency: {
      eligible: hasIdentity && disclosureCount >= 2,
      reason: hasIdentity && disclosureCount >= 2
        ? "Minimum identity and product-disclosure evidence is present."
        : "Not available until product identity and at least two substantive disclosure fields are evidenced.",
    },
    claimStrength: {
      eligible: hasIdentity && found("sustainabilityClaims") && hasClaimSupport,
      reason: hasIdentity && found("sustainabilityClaims") && hasClaimSupport
        ? "A product claim, product identity, and supporting product evidence are present."
        : "Not available until a product claim, product identity, and supporting material, certification, or durability evidence are present.",
    },
  };
}

function buildSummary(status, foundFields, missingFields, unavailableFields, fallbackFields) {
  if (status === "failed") {
    return fallbackFields.length > 0
      ? "Product-page extraction failed. The report remains usable, with fallback values clearly separated from product-page evidence."
      : "Product-page extraction failed. The report remains usable, but no product-page fields could be checked.";
  }

  if (status === "success") {
    return `Product-page extraction found ${foundFields.length} checked field(s). Missing fields are shown explicitly, and fallback values remain separated from product-page evidence.`;
  }

  const missingCount = missingFields.length + unavailableFields.length;
  return `Product-page extraction is partial: ${foundFields.length} field(s) found and ${missingCount} field(s) not found.`;
}

function buildProductPageEvidence(snapshot, fallbackByKey = {}) {
  const fields = {};

  for (const definition of FIELD_DEFINITIONS) {
    fields[definition.key] = buildField(snapshot, definition, fallbackByKey);
  }

  const fieldList = Object.values(fields);
  const foundFields = fieldList
    .filter((field) => field.status === "found")
    .map((field) => field.label);
  const missingFields = fieldList
    .filter((field) => field.status === "not_found")
    .map((field) => field.label);
  const unavailableFields = fieldList
    .filter((field) => field.status === "unavailable")
    .map((field) => field.label);
  const fallbackFields = fieldList
    .filter((field) => field.fallback)
    .map((field) => field.label);
  const extractionStatus = snapshot ? snapshot.extractionStatus : "failed";

  const evidence = {
    extractionStatus,
    sourceUrl: snapshot ? snapshot.sourceUrl : null,
    extractionTimestamp: snapshot ? snapshot.extractionTimestamp : null,
    summary: buildSummary(
      extractionStatus,
      foundFields,
      missingFields,
      unavailableFields,
      fallbackFields
    ),
    fields,
    foundFields,
    missingFields,
    unavailableFields,
    fallbackFields,
    notes: snapshot && Array.isArray(snapshot.extractionNotes)
      ? snapshot.extractionNotes.filter(Boolean)
      : [],
  };
  buildCanonicalEvidenceLedger(evidence);
  return evidence;
}

module.exports = {
  EVIDENCE_SOURCE_TYPES,
  FIELD_DEFINITIONS,
  buildCanonicalClaims,
  buildCanonicalEvidenceLedger,
  buildProductPageEvidence,
  buildScoringEligibility,
  createCanonicalEvidenceRecord,
  createEvidenceId,
  mergeUserProvidedEvidence,
  refreshEvidenceSummary,
  validateClaimCitation,
};
