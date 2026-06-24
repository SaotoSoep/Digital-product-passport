const { createHash } = require("node:crypto");
const { EVIDENCE_SOURCE_TYPES } = require("./evidence");

const CLAIM_CATEGORIES = Object.freeze({
  MATERIAL: "material",
  CERTIFICATION: "certification",
  RECYCLED_CONTENT: "recycled-content",
  ORGANIC: "organic",
  CARBON: "carbon",
  WATER: "water",
  ETHICAL_PRODUCTION: "ethical-production",
  OTHER: "other",
});

const SUPPORT_FIELD_KEYS = new Set([
  "materialComposition",
  "certifications",
  "productionOrigin",
  "supplierDetails",
  "durabilityClaims",
]);

const CLAIM_FIELD_KEYS = new Set([
  "sustainabilityClaims",
  "certifications",
  "durabilityClaims",
]);

const MATERIAL_TERMS = [
  "cotton", "katoen", "linen", "linnen", "wool", "wol", "polyester",
  "polyamide", "nylon", "viscose", "elastane", "leather", "leer", "silk",
  "zijde", "lyocell", "tencel", "modal", "hemp", "hennep",
];

const CERTIFICATION_TERMS = [
  "gots", "global organic textile standard", "ocs", "organic content standard",
  "grs", "global recycled standard", "oeko-tex", "oeko tex", "standard 100",
  "fairtrade", "fair trade", "fair wear", "bluesign", "bci", "better cotton",
  "rws", "responsible wool standard", "fsc",
];

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function canonicalText(value) {
  return cleanText(value).toLowerCase();
}

function normalizedWords(value) {
  return new Set(canonicalText(value).match(/[a-z0-9%]+/g) || []);
}

function createClaimId(claimText, evidenceIds = []) {
  const identity = [
    canonicalText(claimText),
    ...evidenceIds.map(canonicalText).sort(),
  ].join("\u001f");
  return `clv_${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`;
}

function wordingOverlap(left, right) {
  const leftWords = normalizedWords(left);
  const rightWords = normalizedWords(right);
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length;
  return overlap / leftWords.size;
}

function containsAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function claimCategory(claimText) {
  const text = canonicalText(claimText);

  if (/\b(gots|ocs|grs|oeko|fairtrade|fair trade|fair wear|bluesign|certif|gecertificeerd|certificate|standard 100)\b/.test(text)) {
    return CLAIM_CATEGORIES.CERTIFICATION;
  }
  if (/\b(recycled|gerecycled|grs|global recycled)\b/.test(text)) {
    return CLAIM_CATEGORIES.RECYCLED_CONTENT;
  }
  if (/\b(organic|biologisch|gots|ocs)\b/.test(text)) {
    return CLAIM_CATEGORIES.ORGANIC;
  }
  if (/\b(carbon|co2|climate|emissions?|klimaat)\b/.test(text)) {
    return CLAIM_CATEGORIES.CARBON;
  }
  if (/\b(water|waterv?erbruik|waterless)\b/.test(text)) {
    return CLAIM_CATEGORIES.WATER;
  }
  if (/\b(fair|ethical|ethisch|living wage|worker|workers|factory|supplier|social compliance)\b/.test(text)) {
    return CLAIM_CATEGORIES.ETHICAL_PRODUCTION;
  }
  if (containsAny(text, MATERIAL_TERMS)) {
    return CLAIM_CATEGORIES.MATERIAL;
  }

  return CLAIM_CATEGORIES.OTHER;
}

function sourceTypeForClaim(records) {
  if (records.some((record) => record.sourceType === EVIDENCE_SOURCE_TYPES.EXTERNAL)) {
    return "external-source";
  }

  return "product-page";
}

function confidenceRank(value) {
  return { high: 3, medium: 2, low: 1 }[value] || 1;
}

function weakestConfidence(records) {
  const values = records
    .map((record) => record.extractionConfidence)
    .filter((value) => ["high", "medium", "low"].includes(value));

  if (values.length === 0) return "low";
  return values.sort((left, right) => confidenceRank(left) - confidenceRank(right))[0];
}

function hasPercentage(value) {
  return /\b\d{1,3}\s*%/.test(value);
}

function hasSameMaterial(left, right) {
  return MATERIAL_TERMS.some((term) => left.includes(term) && right.includes(term));
}

function hasSameCertification(left, right) {
  return CERTIFICATION_TERMS.some((term) => left.includes(term) && right.includes(term));
}

function supportStrength(claimText, record) {
  const claim = canonicalText(claimText);
  const excerpt = canonicalText(record.excerpt);

  if (!claim || !excerpt || record.status !== "found") {
    return "none";
  }

  const category = claimCategory(claim);
  const overlap = wordingOverlap(claim, excerpt);

  if (claim === excerpt || claim.includes(excerpt) || excerpt.includes(claim) || overlap >= 0.8) {
    return "direct";
  }

  if (
    [CLAIM_CATEGORIES.ORGANIC, CLAIM_CATEGORIES.RECYCLED_CONTENT, CLAIM_CATEGORIES.MATERIAL].includes(category) &&
    record.fieldKey === "materialComposition" &&
    hasSameMaterial(claim, excerpt)
  ) {
    return hasPercentage(claim) && hasPercentage(excerpt) ? "direct" : "partial";
  }

  if (
    [CLAIM_CATEGORIES.CERTIFICATION, CLAIM_CATEGORIES.ORGANIC, CLAIM_CATEGORIES.RECYCLED_CONTENT].includes(category) &&
    record.fieldKey === "certifications" &&
    (hasSameCertification(claim, excerpt) || containsAny(excerpt, CERTIFICATION_TERMS))
  ) {
    return hasSameCertification(claim, excerpt) ? "direct" : "partial";
  }

  if (
    category === CLAIM_CATEGORIES.ETHICAL_PRODUCTION &&
    ["productionOrigin", "supplierDetails"].includes(record.fieldKey) &&
    /\b(factory|supplier|worker|employees?|country|made in|address)\b/.test(excerpt)
  ) {
    return "partial";
  }

  if (category === CLAIM_CATEGORIES.WATER && /\b(water|waterv?erbruik|waterless)\b/.test(excerpt)) {
    return record.fieldKey === "certifications" ? "direct" : "partial";
  }

  if (category === CLAIM_CATEGORIES.CARBON && /\b(carbon|co2|climate|emissions?|klimaat)\b/.test(excerpt)) {
    return record.fieldKey === "certifications" ? "direct" : "partial";
  }

  if (record.fieldKey === "durabilityClaims" && overlap >= 0.35) {
    return "partial";
  }

  return overlap >= 0.45 ? "partial" : "none";
}

function indexEvidence(evidence) {
  return new Map((evidence?.evidenceLedger?.records || []).map((record) => [record.id, record]));
}

function recordsForFieldValues(evidence, fieldKey) {
  const index = indexEvidence(evidence);
  const field = evidence?.fields?.[fieldKey];

  if (!field || field.status !== "found") {
    return [];
  }

  return (field.valueEvidenceIds || [])
    .map((id, position) => ({
      record: index.get(id),
      value: field.values[position],
    }))
    .filter((item) => item.record && cleanText(item.value));
}

function supportRecordsFor(claimText, evidence, excludedEvidenceId) {
  const records = (evidence?.evidenceLedger?.records || [])
    .filter((record) =>
      SUPPORT_FIELD_KEYS.has(record.fieldKey) &&
      record.id !== excludedEvidenceId &&
      record.status === "found"
    )
    .map((record) => ({
      record,
      strength: supportStrength(claimText, record),
    }))
    .filter((item) => item.strength !== "none");

  return records;
}

function verificationStatus(supportRecords) {
  if (supportRecords.some((item) => item.strength === "direct")) {
    return "verified";
  }
  if (supportRecords.length > 0) {
    return "partially-supported";
  }
  return "unverified";
}

function buildVerificationFromClaimRecord(claimText, claimRecord, evidence) {
  const supportRecords = supportRecordsFor(claimText, evidence, claimRecord.id);
  const supportingEvidenceIds = supportRecords.map((item) => item.record.id);
  const evidenceIds = [...new Set([claimRecord.id, ...supportingEvidenceIds])];
  const records = evidenceIds
    .map((id) => indexEvidence(evidence).get(id))
    .filter(Boolean);
  const status = verificationStatus(supportRecords);

  return {
    id: createClaimId(claimText, evidenceIds),
    claimText: cleanText(claimText),
    claimCategory: claimCategory(claimText),
    sourceType: sourceTypeForClaim(records),
    evidenceStatus: supportRecords.length > 0 ? "present" : "missing",
    verificationStatus: status,
    extractionConfidence: weakestConfidence(records),
    evidenceIds,
  };
}

function buildUnavailableClaimVerification(evidence) {
  const field = evidence?.fields?.sustainabilityClaims;
  const evidenceId = field?.evidenceIds?.[0];
  const record = evidenceId
    ? indexEvidence(evidence).get(evidenceId)
    : null;
  const evidenceIds = record ? [record.id] : [];
  const claimText = "Sustainability claims unavailable";

  return {
    id: createClaimId(claimText, evidenceIds),
    claimText,
    claimCategory: CLAIM_CATEGORIES.OTHER,
    sourceType: "product-page",
    evidenceStatus: "unavailable",
    verificationStatus: "unavailable",
    extractionConfidence: record?.extractionConfidence || "low",
    evidenceIds,
  };
}

function deduplicateVerifications(verifications) {
  const seen = new Set();
  const deduped = [];

  for (const verification of verifications) {
    const key = canonicalText(verification.claimText);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(verification);
  }

  return deduped;
}

function buildClaimVerifications(_report, evidence) {
  if (!evidence || evidence.extractionStatus === "failed") {
    return [buildUnavailableClaimVerification(evidence)];
  }

  const verifications = [];

  for (const fieldKey of CLAIM_FIELD_KEYS) {
    for (const { record, value } of recordsForFieldValues(evidence, fieldKey)) {
      verifications.push(buildVerificationFromClaimRecord(value, record, evidence));
    }
  }

  return deduplicateVerifications(verifications);
}

function toLegacySustainabilityClaim(verification) {
  const statusType = {
    verified: "supported",
    "partially-supported": "partially_supported",
    unverified: "unverified",
    unavailable: "unavailable",
  }[verification.verificationStatus] || "unverified";

  return {
    claim: verification.claimText,
    type: statusType,
    evidenceStatus: verification.evidenceStatus,
    verificationStatus: verification.verificationStatus,
    confidence: verification.extractionConfidence,
    evidenceIds: verification.evidenceIds,
    whyItMatters: verification.verificationStatus === "verified"
      ? "The claim has product-page evidence that directly supports the wording."
      : verification.verificationStatus === "partially-supported"
      ? "Some related product-page evidence was found, but it does not fully verify the claim."
      : verification.evidenceStatus === "unavailable"
      ? "The product page could not be read reliably enough to assess this claim."
      : "The claim text was found, but supporting product-specific evidence was not found.",
  };
}

module.exports = {
  CLAIM_CATEGORIES,
  buildClaimVerifications,
  claimCategory,
  supportStrength,
  toLegacySustainabilityClaim,
};
