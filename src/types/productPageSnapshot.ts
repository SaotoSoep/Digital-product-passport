export type ProductPageExtractionStatus = "success" | "partial" | "failed";

export type ExtractedTextValue = string | "not_found";

export type ProductPageFieldStatus = "found" | "not_found" | "fallback" | "unavailable";

export interface ProductPageFieldFallback {
  status: "fallback";
  source: string;
  sourceLabel: string;
  values: string[];
  note: string;
}

export interface ProductPageEvidenceField {
  key: string;
  label: string;
  status: Exclude<ProductPageFieldStatus, "fallback">;
  values: string[];
  sourceUrl: string | null;
  extractedAt: string | null;
  source: string;
  sourceLabel: string;
  note: string;
  fallback: ProductPageFieldFallback | null;
}

export interface ProductPageEvidence {
  extractionStatus: ProductPageExtractionStatus;
  sourceUrl: string | null;
  extractionTimestamp: string | null;
  summary: string;
  fields: {
    pageTitle: ProductPageEvidenceField;
    canonicalUrl: ProductPageEvidenceField;
    productName: ProductPageEvidenceField;
    brand: ProductPageEvidenceField;
    materialComposition: ProductPageEvidenceField;
    careText: ProductPageEvidenceField;
    sustainabilityClaims: ProductPageEvidenceField;
  };
  foundFields: string[];
  missingFields: string[];
  unavailableFields: string[];
  fallbackFields: string[];
  notes: string[];
}

export interface ProductPageSnapshot {
  sourceUrl: string;
  extractionTimestamp: string;
  extractionStatus: ProductPageExtractionStatus;
  pageTitle: ExtractedTextValue;
  canonicalUrl: ExtractedTextValue;
  likelyProductName: ExtractedTextValue;
  likelyBrand: ExtractedTextValue;
  materialCompositionText: string[];
  careText: string[];
  sustainabilityClaimSnippets: string[];
  extractionNotes: string[];
}
