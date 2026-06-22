const MATERIAL_TERMS = [
  "cotton", "katoen", "linen", "linnen", "wool", "wol", "polyester",
  "polyamide", "nylon", "viscose", "elastane", "leather", "leer", "silk", "zijde",
];

const ABSENCE_SENSITIVE_FIELDS = new Set([
  "sustainabilityClaims", "certifications", "productionOrigin", "supplierDetails", "durabilityClaims",
]);

const TRANSPARENCY_FACTORS = [
  { key: "identity", label: "Product identity", weight: 10, fields: ["productName", "brand", "productIdentifiers"] },
  { key: "description", label: "Product description", weight: 5, fields: ["productDescription"] },
  { key: "materials", label: "Material composition", weight: 20, fields: ["materialComposition"] },
  { key: "origin", label: "Production origin", weight: 15, fields: ["productionOrigin"] },
  { key: "supplier", label: "Supplier or factory", weight: 15, fields: ["supplierDetails"] },
  { key: "care", label: "Care instructions", weight: 10, fields: ["careText"] },
  { key: "claims", label: "Claim wording disclosed", weight: 10, fields: ["sustainabilityClaims"] },
  { key: "certifications", label: "Certification references", weight: 10, fields: ["certifications"] },
  { key: "durability", label: "Durability, repair, or warranty", weight: 5, fields: ["durabilityClaims"] },
];

function field(evidence, key) {
  return evidence && evidence.fields ? evidence.fields[key] : null;
}

function found(evidence, key) {
  const item = field(evidence, key);
  return Boolean(
    item &&
    item.status === "found" &&
    Array.isArray(item.values) &&
    item.values.some((value) => !isAbsenceStatement(value, key))
  );
}

function values(evidence, key) {
  return found(evidence, key)
    ? field(evidence, key).values
        .map((value) => String(value))
        .filter((value) => !isAbsenceStatement(value, key))
    : [];
}

function isAbsenceStatement(value, key) {
  if (!ABSENCE_SENSITIVE_FIELDS.has(key)) {
    return false;
  }

  const text = String(value || "").toLowerCase();
  return /\bno clear (?:sustainability )?(?:claim|certification|certificate|factory|supplier|origin|evidence|information)\b/.test(text) ||
    /\b(?:is|are|was|were) not (?:shown|listed|provided|disclosed|found|available)\b/.test(text) ||
    /\bwithout (?:supporting |independent |product-specific )?(?:evidence|certification|certificate|proof)\b/.test(text) ||
    /\b(?:supplier|factory|origin) information is shown on this product page\b/.test(text) ||
    /^\s*(?:supplier|factory|origin|country)\s*:\s*[,;]?\s*$/.test(text);
}

function unavailableResult(kind, reason) {
  return {
    status: "not_available",
    score: null,
    outOf: 100,
    rationale: reason,
    factors: [],
    topPositiveFactors: [],
    missingFactors: [],
    deductions: [],
    cap: null,
    kind,
  };
}

function detectContradictions(evidence) {
  const explicit = Array.isArray(evidence && evidence.contradictions)
    ? evidence.contradictions.map(String).filter(Boolean)
    : [];
  const fieldConflicts = Object.values((evidence && evidence.fields) || {})
    .flatMap((item) => Array.isArray(item.conflicts) ? item.conflicts : [])
    .map(String)
    .filter(Boolean);
  const materialPercentages = new Map();

  for (const row of values(evidence, "materialComposition")) {
    for (const match of row.toLowerCase().matchAll(/(\d{1,3})\s*%\s*([a-zà-ÿ-]+)/g)) {
      const material = match[2];
      const percentages = materialPercentages.get(material) || new Set();
      percentages.add(Number(match[1]));
      materialPercentages.set(material, percentages);
    }
  }

  const compositionConflicts = [...materialPercentages.entries()]
    .filter(([, percentages]) => percentages.size > 1)
    .map(([material]) => `Conflicting percentages were found for ${material}.`);

  return [...new Set([...explicit, ...fieldConflicts, ...compositionConflicts])];
}

function positiveAndMissing(factors) {
  const positives = factors
    .filter((factor) => factor.impact > 0)
    .sort((a, b) => b.impact - a.impact || a.label.localeCompare(b.label))
    .slice(0, 2);
  const missing = factors
    .filter((factor) => factor.status !== "present")
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))
    .slice(0, 2);

  return { positives, missing };
}

function scoreTransparency(evidence) {
  if (!evidence || evidence.extractionStatus === "failed") {
    return unavailableResult("transparency", "Not available because the product page could not be read reliably.");
  }

  const substantiveFields = TRANSPARENCY_FACTORS.flatMap((factor) => factor.fields);
  if (!substantiveFields.some((key) => found(evidence, key))) {
    return unavailableResult("transparency", "Not available because there is insufficient product-level disclosure evidence to apply the rubric.");
  }

  const factors = TRANSPARENCY_FACTORS.map((factor) => {
    const foundCount = factor.fields.filter((key) => found(evidence, key)).length;
    const impact = Math.round((factor.weight * foundCount) / factor.fields.length);
    return {
      key: factor.key,
      label: factor.label,
      weight: factor.weight,
      impact,
      status: foundCount === factor.fields.length
        ? "present"
        : foundCount > 0
        ? "partial"
        : "missing",
      reason: impact > 0
        ? `${foundCount} of ${factor.fields.length} weighted disclosure field(s) found.`
        : "No canonical product-page evidence was found for this factor.",
    };
  });
  const contradictions = detectContradictions(evidence);
  const deductionValue = Math.min(15, contradictions.length * 10);
  const deductions = deductionValue > 0 ? [{
    key: "contradictions",
    label: "Contradictory disclosure",
    impact: -deductionValue,
    reason: contradictions.join(" "),
  }] : [];
  const rawScore = factors.reduce((sum, factor) => sum + factor.impact, 0) - deductionValue;
  const score = Math.max(0, Math.min(100, rawScore));
  const { positives, missing } = positiveAndMissing(factors);

  return {
    status: "scored",
    score,
    outOf: 100,
    rationale: `Disclosure score ${score}/100 from canonical product-page fields${deductionValue ? ` after a ${deductionValue}-point contradiction deduction` : ""}.`,
    factors,
    topPositiveFactors: positives,
    missingFactors: missing,
    deductions,
    cap: null,
    kind: "transparency",
  };
}

function materialOverlap(claimText, materialText) {
  return MATERIAL_TERMS.some((term) => claimText.includes(term) && materialText.includes(term));
}

function scoreClaimStrength(evidence) {
  if (!evidence || evidence.extractionStatus === "failed") {
    return unavailableResult("claim_strength", "Not available because the product page could not be read reliably.");
  }

  const claimText = values(evidence, "sustainabilityClaims").join(" ").toLowerCase();
  if (!claimText) {
    return unavailableResult("claim_strength", "Not available because no product-level sustainability claim was found to assess.");
  }

  const materialText = values(evidence, "materialComposition").join(" ").toLowerCase();
  const hasMaterialSupport = Boolean(materialText) && materialOverlap(claimText, materialText);
  const hasCertification = found(evidence, "certifications");
  const hasProductIdentifier = found(evidence, "productIdentifiers");
  const hasTraceability = found(evidence, "productionOrigin") || found(evidence, "supplierDetails");
  const hasFullTraceability = found(evidence, "productionOrigin") && found(evidence, "supplierDetails");
  const hasDurabilitySupport = found(evidence, "durabilityClaims");
  const isSpecific = /\d|%|certif|gecertificeerd|recycled|gerecycled|organic|biologisch|traceab|product/i.test(claimText);
  const productSpecificSupport = hasMaterialSupport || hasDurabilitySupport || (hasCertification && hasProductIdentifier);
  const independentProductSupport = hasCertification && hasProductIdentifier;

  const factors = [
    {
      key: "specificity", label: "Specific claim wording", weight: 20,
      impact: isSpecific ? 20 : 5, status: isSpecific ? "present" : "partial",
      reason: isSpecific ? "The claim contains concrete product or material wording." : "The claim is broad brand wording.",
    },
    {
      key: "product_support", label: "Product-specific supporting data", weight: 25,
      impact: hasMaterialSupport ? 25 : hasDurabilitySupport ? 15 : 0,
      status: hasMaterialSupport || hasDurabilitySupport ? "present" : "missing",
      reason: hasMaterialSupport
        ? "The disclosed composition supports material wording in the claim."
        : hasDurabilitySupport
        ? "Product-level durability, repair, or warranty evidence supports the claim."
        : "No matching product-specific composition or performance support was found.",
    },
    {
      key: "independent_support", label: "Independent product-linked support", weight: 35,
      impact: independentProductSupport ? 35 : hasCertification ? 15 : 0,
      status: independentProductSupport ? "present" : hasCertification ? "partial" : "missing",
      reason: independentProductSupport
        ? "A certification reference is linked alongside a product identifier."
        : hasCertification
        ? "A certification reference is present, but no product identifier links it to this item."
        : "No certification or independent support was found on the product page.",
    },
    {
      key: "traceability", label: "Origin and supplier traceability", weight: 15,
      impact: hasFullTraceability ? 15 : hasTraceability ? 8 : 0,
      status: hasFullTraceability ? "present" : hasTraceability ? "partial" : "missing",
      reason: hasFullTraceability ? "Both production origin and supplier/factory details are disclosed." : hasTraceability ? "One traceability field is disclosed." : "No origin or supplier support was found.",
    },
    {
      key: "performance", label: "Durability or test support", weight: 5,
      impact: hasDurabilitySupport ? 5 : 0, status: hasDurabilitySupport ? "present" : "missing",
      reason: hasDurabilitySupport ? "Durability, repair, or warranty evidence is disclosed." : "No durability or test support was found.",
    },
  ];

  const contradictions = detectContradictions(evidence);
  const deductionValue = Math.min(25, contradictions.length * 15);
  const deductions = deductionValue > 0 ? [{
    key: "contradictions", label: "Contradictory evidence", impact: -deductionValue,
    reason: contradictions.join(" "),
  }] : [];
  const uncappedScore = Math.max(0, factors.reduce((sum, factor) => sum + factor.impact, 0) - deductionValue);
  const cap = independentProductSupport && productSpecificSupport
    ? null
    : { value: productSpecificSupport || hasCertification ? 60 : 35, reason: "High claim strength requires both independent and product-specific support." };
  const score = Math.max(0, Math.min(100, cap ? Math.min(uncappedScore, cap.value) : uncappedScore));
  const { positives, missing } = positiveAndMissing(factors);

  return {
    status: "scored",
    score,
    outOf: 100,
    rationale: `Evidence-strength score ${score}/100${cap && uncappedScore > cap.value ? ` after applying the ${cap.value}-point evidence cap` : ""}.`,
    factors,
    topPositiveFactors: positives,
    missingFactors: missing,
    deductions,
    cap,
    kind: "claim_strength",
  };
}

function scoreProductPassport(evidence) {
  return {
    transparencyScore: scoreTransparency(evidence),
    claimStrengthScore: scoreClaimStrength(evidence),
  };
}

module.exports = {
  TRANSPARENCY_FACTORS,
  detectContradictions,
  scoreClaimStrength,
  scoreProductPassport,
  scoreTransparency,
};
