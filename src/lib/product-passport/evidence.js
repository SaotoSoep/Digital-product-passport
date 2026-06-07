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
  },
  {
    key: "materialComposition",
    label: "Material/composition",
    snapshotKey: "materialCompositionText",
    type: "list",
  },
  {
    key: "careText",
    label: "Care text",
    snapshotKey: "careText",
    type: "list",
  },
  {
    key: "sustainabilityClaims",
    label: "Sustainability claim text",
    snapshotKey: "sustainabilityClaimSnippets",
    type: "list",
  },
  {
    key: "supplierDetails",
    label: "Supplier/factory details",
    snapshotKey: "supplierDetailText",
    type: "list",
  },
  {
    key: "productionOrigin",
    label: "Origin/manufacturing",
    snapshotKey: "originText",
    type: "list",
  },
  {
    key: "certifications",
    label: "Certification or standard references",
    snapshotKey: "certificationText",
    type: "list",
  },
  {
    key: "durabilityClaims",
    label: "Durability, repair, or warranty claims",
    snapshotKey: "durabilityClaimSnippets",
    type: "list",
  },
];

function cleanEvidenceValue(value) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  return cleaned && cleaned !== "not_found" ? cleaned : "";
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
    source: fallback.source || "mvp_report_fallback",
    sourceLabel: fallback.sourceLabel || "MVP report fallback",
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
      ? "submitted_product_page"
      : status === "not_found"
      ? "submitted_product_page_checked"
      : "extraction_unavailable",
    sourceLabel: status === "found"
      ? "Submitted product page"
      : status === "not_found"
      ? "Submitted product page checked"
      : "Product page extraction unavailable",
    note: status === "found"
      ? "Found in publicly visible product-page data."
      : status === "not_found"
      ? "Not found in the normalized product-page extraction."
      : "Product-page extraction failed, so this field could not be checked.",
    fallback,
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

  return {
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
}

module.exports = {
  FIELD_DEFINITIONS,
  buildProductPageEvidence,
};
