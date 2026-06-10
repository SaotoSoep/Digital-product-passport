const CRITICAL_FIELD_KEYS = [
  "productName",
  "brand",
  "materialComposition",
  "careText",
  "supplierDetails",
  "productionOrigin",
];

const STRUCTURAL_DPP_GAPS = [
  {
    key: "rawMaterialProvenance",
    label: "Raw material provenance",
    detail: "The page does not prove where the fibres or feedstock originally came from.",
  },
  {
    key: "supplyChainSteps",
    label: "Full supply-chain steps",
    detail: "Spinning, knitting/weaving, dyeing, finishing, and transport steps are not fully mapped.",
  },
  {
    key: "impactData",
    label: "Environmental impact data",
    detail: "No product-level carbon, water, energy, chemistry, or microfibre impact values were found.",
  },
  {
    key: "circularity",
    label: "Circularity and end-of-life",
    detail: "Repair guidance, recyclability, take-back, resale, and end-of-life instructions are incomplete.",
  },
  {
    key: "batchTraceability",
    label: "Batch or lot traceability",
    detail: "No batch, lot, manufacturing date, or shipment-level traceability was found.",
  },
  {
    key: "proofDocuments",
    label: "Proof documents and audits",
    detail: "No independent audit, certificate file, test report, or third-party verification evidence was attached.",
  },
];

const COLOR_GROUPS = [
  ["white", ["white", "off-white", "off white", "ivory", "cream"]],
  ["brown", ["brown", "dark brown", "espresso", "mahogany", "maroon", "rust"]],
  ["black", ["black"]],
  ["blue", ["blue", "navy", "indigo"]],
  ["green", ["green", "olive"]],
  ["grey", ["grey", "gray", "charcoal"]],
  ["red", ["red", "burgundy"]],
  ["pink", ["pink"]],
  ["yellow", ["yellow"]],
  ["orange", ["orange"]],
  ["purple", ["purple", "violet"]],
];

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function fieldValues(fields, key) {
  const field = fields && fields[key];
  return field && Array.isArray(field.values)
    ? field.values.map(cleanText).filter(Boolean)
    : [];
}

function fieldStatus(fields, key) {
  return fields && fields[key] ? fields[key].status : "not_found";
}

function fieldWasFound(fields, key) {
  return fieldStatus(fields, key) === "found" && fieldValues(fields, key).length > 0;
}

function firstValue(fields, key) {
  return fieldValues(fields, key)[0] || "";
}

function addReadyField(readyFields, fields, key, label, detail, maxValues = 3) {
  const values = fieldValues(fields, key);

  if (values.length === 0) {
    return;
  }

  readyFields.push({
    key,
    label,
    value: values.slice(0, maxValues).join(" "),
    detail,
    source: fields[key].sourceLabel,
  });
}

function colorGroupsIn(values) {
  const text = cleanText(values.join(" ")).toLowerCase();
  const groups = new Set();

  for (const [group, terms] of COLOR_GROUPS) {
    if (terms.some((term) => new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(text))) {
      groups.add(group);
    }
  }

  return groups;
}

function buildWarnings(evidence, snapshot) {
  const fields = evidence.fields || {};
  const warnings = [];
  const colorGroups = colorGroupsIn(fieldValues(fields, "colorVariant"));
  const descriptionGroups = colorGroupsIn([
    ...fieldValues(fields, "productDescription"),
    ...((snapshot && snapshot.productDescriptionText) || []),
  ]);

  if (colorGroups.size > 0 && descriptionGroups.size > 0) {
    const conflicts = [...descriptionGroups].filter((group) => !colorGroups.has(group));

    if (conflicts.length > 0) {
      warnings.push({
        key: "colorDescriptionConflict",
        label: "Variant description conflict",
        detail: "The page or structured data mentions a different colour than the selected variant. Treat variant-specific fields as leading and review the description manually.",
      });
    }
  }

  if (Object.values(fields).some((field) => field && field.fallback)) {
    warnings.push({
      key: "fallbackValuesPresent",
      label: "Fallback values separated",
      detail: "Some values were inferred by the lightweight analyzer rather than found in normalized product-page evidence.",
    });
  }

  const materialText = firstValue(fields, "materialComposition").toLowerCase();
  if (/\b(polyamide|nylon|polyester|elastane|acrylic)\b/.test(materialText)) {
    warnings.push({
      key: "syntheticMaterial",
      label: "Synthetic material present",
      detail: "The material composition includes a synthetic fibre. This is useful passport data, but impact and recyclability should be verified separately.",
    });
  }

  return warnings;
}

function buildMissingFields(evidence) {
  const fields = evidence.fields || {};
  const missingFields = [];

  const fieldGapMap = [
    ["productIdentifiers", "Commercial identifiers", "Product, SKU, GTIN, or size-level identifiers were not found."],
    ["colorVariant", "Colour and variant", "Selected colour or variant data was not found."],
    ["materialComposition", "Exact material composition", "Fibre percentages or material composition were not found."],
    ["careText", "Care and use instructions", "Machine-wash, drying, ironing, or dry-cleaning instructions were not found."],
    ["supplierDetails", "Supplier and factory details", "Supplier, factory, country, address, or employee count was not found."],
    ["productionOrigin", "Production origin", "Country or broader manufacturing location was not found."],
    ["certifications", "Certifications and standards", "No certification or recognised standard reference was found."],
    ["durabilityClaims", "Durability, repair, or warranty", "No direct longevity, repairability, test, or warranty information was found."],
  ];

  for (const [key, label, detail] of fieldGapMap) {
    const status = fieldStatus(fields, key);

    if (status === "not_found" || status === "unavailable") {
      missingFields.push({
        key,
        label,
        detail: status === "unavailable"
          ? "The product page source could not be fully checked, so this field is unavailable rather than confirmed absent."
          : detail,
        status,
      });
    }
  }

  return [
    ...missingFields,
    ...STRUCTURAL_DPP_GAPS,
  ];
}

function buildReadyFields(evidence) {
  const fields = evidence.fields || {};
  const readyFields = [];
  const identityValues = [
    firstValue(fields, "productName"),
    firstValue(fields, "brand"),
  ].filter(Boolean);

  if (identityValues.length > 0) {
    readyFields.push({
      key: "identity",
      label: "Product identity",
      value: identityValues.join(" · "),
      detail: "Core product identity was extracted from the submitted product page.",
      source: "Submitted product page",
    });
  }

  addReadyField(readyFields, fields, "productIdentifiers", "Commercial identifiers", "Product/SKU, GTIN, size-level identifiers, price, or season code were found.");
  addReadyField(readyFields, fields, "colorVariant", "Colour and variant", "Selected colour, colour reference, or category data was found.");
  addReadyField(readyFields, fields, "productDescription", "Description and construction", "Description, fit, closure, or construction information was found.", 1);
  addReadyField(readyFields, fields, "materialComposition", "Material composition", "Composition data can be used as a passport starting point.");
  addReadyField(readyFields, fields, "careText", "Care and use", "Care instructions can support use-phase guidance.");
  addReadyField(readyFields, fields, "supplierDetails", "Supplier and factory details", "Supplier, factory, country, address, or employee count was found.");
  addReadyField(readyFields, fields, "productionOrigin", "Production origin", "Supplier, factory, country, or manufacturing detail was found.");
  addReadyField(readyFields, fields, "sustainabilityClaims", "Brand claims", "Sustainability or traceability claim wording was found, but still needs proof.");
  addReadyField(readyFields, fields, "certifications", "Certifications and standards", "Certification or standard wording was found on the page.");
  addReadyField(readyFields, fields, "durabilityClaims", "Durability and repair", "Durability, repair, warranty, or use-life wording was found.");

  return readyFields;
}

function buildPassportReadiness(evidence, snapshot) {
  const safeEvidence = evidence || { fields: {}, extractionStatus: "failed" };
  const fields = safeEvidence.fields || {};
  const readyFields = buildReadyFields(safeEvidence);
  const missingFields = buildMissingFields(safeEvidence);
  const warnings = buildWarnings(safeEvidence, snapshot);
  const criticalFound = CRITICAL_FIELD_KEYS.filter((key) => fieldWasFound(fields, key)).length;
  const hasMaterialAndOrigin = fieldWasFound(fields, "materialComposition") &&
    (fieldWasFound(fields, "supplierDetails") || fieldWasFound(fields, "productionOrigin"));
  const status = safeEvidence.extractionStatus === "failed"
    ? "limited"
    : hasMaterialAndOrigin && criticalFound >= 4
      ? "useful"
      : "partial";
  const label = status === "useful"
    ? "Useful passport starting point"
    : status === "limited"
      ? "Limited passport evidence"
      : "Partial passport profile";

  return {
    status,
    label,
    summary: `${readyFields.length} passport-ready data group(s) found. ${missingFields.length} DPP gap(s) still need evidence or verification.`,
    readyFields,
    missingFields,
    warnings,
    counts: {
      ready: readyFields.length,
      missing: missingFields.length,
      warnings: warnings.length,
    },
  };
}

module.exports = {
  buildPassportReadiness,
};
