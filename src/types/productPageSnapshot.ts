export type ProductPageExtractionStatus = "success" | "partial" | "failed";

export type ExtractedTextValue = string | "not_found";

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
