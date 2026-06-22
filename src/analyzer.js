const { URL } = require("url");
require("dotenv").config({ quiet: true });
const OpenAI = require("openai");
const {
  createFailedProductPageSnapshot,
  extractProductPageSnapshot,
} = require("./lib/product-page/snapshot");
const {
  buildDeepEvidenceHtml,
  createFailedDeepRead,
  readDeepProductPage,
} = require("./lib/product-page/deep-reader");
const { callDeepReaderWorker } = require("./lib/product-page/deep-reader-worker-client");
const {
  buildCanonicalClaims,
  buildCanonicalEvidenceLedger,
  buildProductPageEvidence,
} = require("./lib/product-passport/evidence");
const { buildPassportReadiness } = require("./lib/product-passport/readiness");
const { scoreProductPassport } = require("./lib/product-passport/scorer");

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const OPENAI_MODEL = "gpt-4o-mini";
const AI_PAGE_TEXT_LIMIT = 8000;
const DEFAULT_ANALYSIS_DEEP_READER_TIMEOUT_MS = 25000;
const MAX_ANALYSIS_DEEP_READER_TIMEOUT_MS = 30000;
const MIN_LOCAL_DEEP_READER_FALLBACK_MS = 5000;

const SYSTEM_PROMPT = `You are a product transparency analyst. You receive raw text scraped from a fashion or consumer product page and return a structured Product Passport Report as JSON.

Rules:
- Return ONLY valid JSON. No markdown fences, no explanation, no preamble, no trailing text.
- Never invent information that is not present in the page text.
- Clearly distinguish between: brand_claim (what the brand says), public_evidence (what is verifiable from the page), and unknown (not found or not verifiable).
- Use confidence levels: "high", "medium", or "low" based only on what is explicitly stated on the page.
- If a field cannot be determined, use null. Do not guess.
- Keep structured facts atomic and concise. Do not paste a combined supplier/manufacturing sentence into multiple fields.
- For origin, return only the manufacturing country, factory name, supplier name, factory address, and employee count when explicitly present.
- Do not include price, weight, season, category, colour, or prose descriptions in product identifiers.
- Preserve identifier labels (for example Product no., SKU, GTIN, or size) and never merge different identifiers into an unlabeled string.
- Treat product categories and navigation breadcrumbs as page context only. Never include them in colour, variant, identifier, origin, or other product-passport fields.
- For colour or variant information, keep only an explicitly stated colour/variant name and an explicit colour reference such as a hex code.
- For sustainability_claims: if a claim has no supporting certificate or third-party verification on the page, set type to "unverified" and confidence to "low".
- Do not calculate transparency or claim-strength scores. Application code calculates them deterministically from canonical evidence.

Return exactly this JSON structure, nothing else:
{
  "product_summary": "string - plain language, 2-3 sentences describing what this product is",
  "brand": "string or null",
  "product_name": "string or null",
  "price": "string or null",
  "materials": [
    {
      "name": "string - material name",
      "percentage": "string or null - e.g. 80%",
      "explanation": "string - plain language, what this material means for the consumer"
    }
  ],
  "sustainability_claims": [
    {
      "claim": "string - exact or near-exact wording from the page",
      "type": "product_level_certified | brand_level | unverified",
      "evidence": "string - what on the page supports this claim, or null if nothing supports it",
      "confidence": "high | medium | low"
    }
  ],
  "origin": {
    "country": "string or null",
    "factory": "string or null",
    "supplier": "string or null",
    "address": "string or null",
    "employees": "string or null",
    "confidence": "high | medium | low"
  },
  "care_instructions": ["string"],
  "missing_information": [
    "string - one item per missing or unverifiable piece of information"
  ],
  "conclusion": "string - 2-3 sentences, consumer-friendly"
}`;

let openAiClient;

const materialKeywords = [
  "organic cotton",
  "biologisch katoen",
  "recycled polyester",
  "gerecycled polyester",
  "polyamide",
  "elastane",
  "polyester",
  "viscose",
  "cotton",
  "katoen",
  "linen",
  "linnen",
  "wool",
  "wol",
  "nylon",
  "leather",
  "leer",
];

const sustainabilityKeywords = [
  "sustainability",
  "duurzaamheid",
  "sustainable",
  "duurzaam",
  "responsible",
  "verantwoord",
  "conscious",
  "recycled",
  "gerecycled",
  "organic",
  "biologisch",
  "renewable",
  "renewable raw materials",
  "hernieuwbaar",
  "hernieuwbare grondstoffen",
  "lower impact",
  "traceable",
  "certified",
  "vegan",
  "eco",
];

const sustainabilityContextKeywords = [
  "sustainability",
  "duurzaamheid",
  "sustainable",
  "duurzaam",
  "responsible",
  "verantwoord",
  "conscious",
  "lower impact",
  "traceable",
  "certified",
  "gecertificeerd",
  "vegan",
  "eco",
];

const careKeywords = [
  "machine wash",
  "tumble dry",
  "dry clean",
  "washing",
  "wassen",
  "wasvoorschrift",
  "onderhoud",
  "bleach",
  "bleken",
  "iron",
  "strijken",
  "wash",
  "30°c",
  "40°c",
  "30c",
  "40c",
];

const originKeywords = [
  "made in",
  "country of origin",
  "manufactured",
  "factory",
  "supplier",
  "traceable",
  "origin",
  "production",
];

const brandInsightKeywords = [
  "brand",
  "design",
  "fashion",
  "customer",
  "commitment",
  "people",
  "environment",
  "quality",
  "kwaliteit",
  "sustainability",
  "duurzaamheid",
  "sustainable",
  "duurzaam",
  "durable",
  "long-lasting",
  "materials",
  "materialen",
  "natural materials",
  "natuurlijke materialen",
  "production",
  "productie",
  "supplier",
  "leverancier",
  "oeko-tex",
  "slow fashion",
  "timeless",
  "tijdloos",
];

const brandInsightLinkKeywords = [
  "brand",
  "sustainability",
  "duurzaamheid",
  "quality",
  "kwaliteit",
  "about",
  "ons bedrijf",
  "over ons",
  "design philosophy",
  "design filosofie",
  "re-fashion",
  "trust",
  "partners",
];

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lsquo;|&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;|&bdquo;/gi, '"')
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&hellip;/gi, "...")
    .replace(/&reg;/gi, "®")
    .replace(/&trade;/gi, "™")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function titleCaseBrand(value) {
  const cleaned = cleanText(value)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "not_found";
  }

  const upperBrands = new Set(["cos", "oska"]);
  if (upperBrands.has(cleaned.toLowerCase())) {
    return cleaned.toUpperCase();
  }

  return cleaned
    .split(" ")
    .map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : "")
    .join(" ");
}

function inferBrandFromUrl(productUrl) {
  try {
    const host = new URL(productUrl).hostname.replace(/^www\./, "");
    const parts = host.split(".").filter(Boolean);
    const secondLevelDomain = parts.length >= 2 ? parts[parts.length - 2] : parts[0];

    if (!secondLevelDomain || ["com", "co", "shop", "store"].includes(secondLevelDomain)) {
      return "not_found";
    }

    return titleCaseBrand(secondLevelDomain);
  } catch (error) {
    return "not_found";
  }
}

function inferProductNameFromUrl(productUrl) {
  try {
    const pathname = new URL(productUrl).pathname;
    const filename = pathname.split("/").filter(Boolean).pop() || "";
    const slug = filename
      .replace(/\.html?$/i, "")
      .replace(/-p\d+.*$/i, "")
      .replace(/\b(product|detail)\b/gi, "")
      .replace(/[-_]+/g, " ")
      .trim();

    return slug ? slug.toUpperCase() : "not_found";
  } catch (error) {
    return "not_found";
  }
}

function stripTags(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function removeNonVisibleMarkup(html) {
  const source = String(html || "");
  const lower = source.toLowerCase();
  const tags = ["script", "style", "noscript", "svg"];
  let index = 0;
  let output = "";

  while (index < source.length) {
    let nextStart = -1;
    let nextTag = "";

    for (const tag of tags) {
      const position = lower.indexOf(`<${tag}`, index);
      if (position !== -1 && (nextStart === -1 || position < nextStart)) {
        nextStart = position;
        nextTag = tag;
      }
    }

    if (nextStart === -1) {
      output += source.slice(index);
      break;
    }

    output += source.slice(index, nextStart);

    const closeTag = `</${nextTag}>`;
    const closeIndex = lower.indexOf(closeTag, nextStart);
    if (closeIndex === -1) {
      break;
    }

    output += " ";
    index = closeIndex + closeTag.length;
  }

  return output;
}

function cleanText(text) {
  return decodeHtmlEntities(String(text || ""))
    .replace(/\s+/g, " ")
    .trim();
}

function getOpenAiClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  if (!openAiClient) {
    openAiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return openAiClient;
}

function titleCaseConfidence(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "high") {
    return "High";
  }

  if (normalized === "medium") {
    return "Medium";
  }

  return "Low";
}

function asCleanArray(value) {
  return Array.isArray(value)
    ? value.map(cleanText).filter(Boolean)
    : [];
}

function sanitizeConclusion(value) {
  const conclusion = cleanText(value);
  const productVerdict = /\b(?:is|appears|seems|represents)\s+(?:an?\s+)?(?:sustainable|unsustainable|eco[- ]?friendly|green)\b/i;

  if (productVerdict.test(conclusion)) {
    return "The report describes disclosed materials, claims, and supporting evidence without judging the product itself. Review the listed missing factors before relying on the claims.";
  }

  return conclusion;
}

function parseAiJson(raw) {
  const cleaned = String(raw || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

function normalizeAiReport(value) {
  const report = value && typeof value === "object" ? value : {};
  const origin = report.origin && typeof report.origin === "object" ? report.origin : {};
  const materials = Array.isArray(report.materials)
    ? report.materials
        .filter((material) => material && typeof material === "object")
        .map((material) => ({
          name: cleanText(material.name),
          percentage: material.percentage === null ? null : cleanText(material.percentage),
          explanation: cleanText(material.explanation),
        }))
        .filter((material) => material.name)
    : [];
  const sustainabilityClaims = Array.isArray(report.sustainability_claims)
    ? report.sustainability_claims
        .filter((claim) => claim && typeof claim === "object")
        .map((claim) => ({
          claim: cleanText(claim.claim),
          type: cleanText(claim.type) || "unverified",
          evidence: claim.evidence === null ? null : cleanText(claim.evidence),
          confidence: titleCaseConfidence(claim.confidence),
        }))
        .filter((claim) => claim.claim)
    : [];
  const missingInformation = asCleanArray(report.missing_information);

  return {
    product_summary: cleanText(report.product_summary),
    brand: report.brand === null ? null : cleanText(report.brand),
    product_name: report.product_name === null ? null : cleanText(report.product_name),
    price: report.price === null ? null : cleanText(report.price),
    materials,
    sustainability_claims: sustainabilityClaims,
    origin: {
      country: origin.country === null ? null : cleanText(origin.country),
      factory: origin.factory === null ? null : cleanText(origin.factory),
      supplier: origin.supplier === null ? null : cleanText(origin.supplier),
      address: origin.address === null ? null : cleanText(origin.address),
      employees: origin.employees === null ? null : cleanText(origin.employees),
      confidence: titleCaseConfidence(origin.confidence),
    },
    care_instructions: asCleanArray(report.care_instructions),
    missing_information: materials.length === 0 && !missingInformation.some((item) => item.toLowerCase() === "materials not publicly listed")
      ? ["materials not publicly listed", ...missingInformation]
      : missingInformation,
    conclusion: cleanText(report.conclusion),
  };
}

async function analyzeTextWithOpenAi({ productUrl, pageText }) {
  const client = getOpenAiClient();
  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: 1500,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `Analyse the following product page and return the JSON report.\n\nURL: ${productUrl}\n\nPage content:\n${pageText.slice(0, AI_PAGE_TEXT_LIMIT)}`,
      },
    ],
  });
  const raw = response.choices &&
    response.choices[0] &&
    response.choices[0].message &&
    response.choices[0].message.content;

  if (!raw) {
    throw new Error("OpenAI response did not include JSON text");
  }

  return normalizeAiReport(parseAiJson(raw));
}

function formatEvidenceList(label, values) {
  const rows = Array.isArray(values)
    ? values.map(cleanText).filter(Boolean)
    : [];

  if (rows.length === 0) {
    return "";
  }

  return `${label}:\n${rows.map((value) => `- ${value}`).join("\n")}`;
}

function buildSnapshotEvidenceText(snapshot) {
  if (!snapshot) {
    return "";
  }

  return cleanText([
    "Normalized product-page evidence from visible sections, accordions, tabs, and embedded product data.",
    snapshot.likelyBrand && snapshot.likelyBrand !== "not_found" ? `Brand: ${snapshot.likelyBrand}` : "",
    snapshot.likelyProductName && snapshot.likelyProductName !== "not_found" ? `Product name: ${snapshot.likelyProductName}` : "",
    formatEvidenceList("Product identifiers", snapshot.productIdentifiersText),
    formatEvidenceList("Color or variant", snapshot.colorText),
    formatEvidenceList("Product description", snapshot.productDescriptionText),
    formatEvidenceList("Material composition", snapshot.materialCompositionText),
    formatEvidenceList("Care instructions", snapshot.careText),
    formatEvidenceList("Supplier and factory details", snapshot.supplierDetailText),
    formatEvidenceList("Origin and manufacturing", snapshot.originText),
    formatEvidenceList("Sustainability claims", snapshot.sustainabilityClaimSnippets),
    formatEvidenceList("Certifications or standards", snapshot.certificationText),
    formatEvidenceList("Durability, repair, or warranty", snapshot.durabilityClaimSnippets),
  ].filter(Boolean).join("\n\n"));
}

function buildAiPageText({ title, description, visibleProductText, bodyText, productPageSnapshot }) {
  return cleanText([
    buildSnapshotEvidenceText(productPageSnapshot),
    title,
    description,
    visibleProductText,
    bodyText,
  ].filter(Boolean).join("\n\n"));
}

function appendDeepEvidenceHtml(html, deepEvidenceHtml) {
  if (!deepEvidenceHtml) {
    return html;
  }

  return /<\/body>/i.test(String(html || ""))
    ? String(html || "").replace(/<\/body>/i, `${deepEvidenceHtml}</body>`)
    : `${html || ""}\n${deepEvidenceHtml}`;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(titleMatch ? titleMatch[1] : "");
}

function extractMetaContent(html, attribute, key) {
  const metaTags = String(html || "").match(/<meta\b[^>]*>/gi) || [];

  for (const tag of metaTags) {
    const attrs = {};
    for (const match of tag.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)) {
      attrs[match[1].toLowerCase()] = match[2];
    }

    if (attrs[attribute.toLowerCase()] === key && attrs.content) {
      return cleanText(attrs.content);
    }
  }

  return "";
}

function splitIntoSnippets(text) {
  return text
    .split(/(?<=[.!?])\s+|\s{2,}/)
    .map((snippet) => snippet.trim())
    .filter((snippet) => snippet.length >= 20 && snippet.length <= 320);
}

function extractTextBlocks(html) {
  return [...String(html || "").matchAll(/<(p|li|dd|dt|figcaption|td|th)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => stripTags(match[2]))
    .filter((snippet) => snippet.length >= 20 && snippet.length <= 320);
}

function uniqueSnippets(snippets, limit = 400) {
  const seen = new Set();
  const result = [];

  for (const snippet of snippets) {
    const cleaned = cleanText(snippet);
    const key = cleaned.toLowerCase();

    if (cleaned && !seen.has(key)) {
      result.push(cleaned);
      seen.add(key);
    }

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function findKeywordMatches(snippets, keywords) {
  const matches = [];

  for (const keyword of keywords) {
    const hit = snippets.find((snippet) =>
      keywordAppearsInText(snippet, keyword)
    );

    if (hit) {
      matches.push({
        keyword,
        snippet: hit,
      });
    }
  }

  return matches;
}

function prioritizeSustainabilitySnippets(snippets) {
  const contextual = snippets.filter((snippet) =>
    sustainabilityContextKeywords.some((keyword) =>
      keywordAppearsInText(snippet, keyword)
    )
  );

  return contextual.length > 0 ? contextual : snippets;
}

function keywordAppearsInText(text, keyword) {
  const normalizedKeyword = keyword.toLowerCase();

  if (/^[a-z0-9]+$/i.test(normalizedKeyword)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizedKeyword)}([^a-z0-9]|$)`, "i")
      .test(text);
  }

  return text.toLowerCase().includes(normalizedKeyword);
}

function pickProductLikeText(snippets, pageTitle, metaDescription) {
  const candidates = [];

  if (pageTitle) {
    candidates.push(pageTitle);
  }

  if (metaDescription) {
    candidates.push(metaDescription);
  }

  const productSnippet = snippets.find((snippet) => {
    const normalized = snippet.toLowerCase();
    return (
      normalized.includes("product") ||
      normalized.includes("shirt") ||
      normalized.includes("dress") ||
      normalized.includes("jacket") ||
      normalized.includes("jeans") ||
      normalized.includes("trousers") ||
      normalized.includes("coat") ||
      normalized.includes("skirt") ||
      normalized.includes("top") ||
      normalized.includes("fabric") ||
      normalized.includes("material")
    );
  });

  if (productSnippet) {
    candidates.push(productSnippet);
  }

  return candidates.filter(Boolean).slice(0, 3).join(" ");
}

function materialExplanation(material) {
  if (material === "organic cotton") {
    return "Organic cotton is still cotton, but the brand is implying a different farming standard. That claim still needs direct proof on the page or from supporting evidence.";
  }

  if (material === "recycled polyester") {
    return "Recycled polyester suggests reused synthetic input material, but it remains a synthetic fibre and the recycled share should be checked carefully.";
  }

  if (material === "cotton") {
    return "Cotton is a common natural fibre that is often breathable and soft, but its environmental impact depends on farming and processing methods.";
  }

  if (material === "polyester") {
    return "Polyester is a synthetic fibre. If the page does not clearly say recycled polyester, it should not be treated as a sustainability benefit.";
  }

  if (material === "linen") {
    return "Linen is a plant-based fibre that is often breathable and cool to wear, though it can crease easily.";
  }

  if (material === "wool") {
    return "Wool is an animal fibre often used for warmth and structure, but the sourcing and animal welfare standards matter.";
  }

  if (material === "viscose") {
    return "Viscose is a semi-synthetic fibre made from plant cellulose, but its impact depends heavily on how the raw material and chemicals are managed.";
  }

  if (material === "elastane") {
    return "Elastane is usually added in small amounts to improve stretch and fit.";
  }

  if (material === "polyamide" || material === "nylon") {
    return "Polyamide or nylon is a synthetic fibre often used for strength and durability.";
  }

  if (material === "leather") {
    return "Leather is an animal-derived material, and the environmental and welfare picture depends on tanning and sourcing details.";
  }

  return "The material appears to be mentioned on the page, but the exact composition and sourcing are still not fully verified.";
}

function buildClaims(matches) {
  return matches.slice(0, 5).map((match) => ({
    claim: match.keyword,
    brandClaim: match.snippet,
    publicEvidence: "Visible on the submitted product page only. No independent verification was performed.",
    evidenceLevel: "Brand claim on product page",
    confidence: "Medium",
  }));
}

function calculateClaimStrengthScore(claims) {
  if (claims.length === 0) {
    return 18;
  }

  return Math.min(62, 24 + claims.length * 8);
}

function calculateTransparencyScore(materialMatches, originMatches, careMatches, pageReadable) {
  let score = 18;

  if (pageReadable) {
    score += 12;
  }

  if (materialMatches.length > 0) {
    score += 12;
  }

  if (careMatches.length > 0) {
    score += 8;
  }

  if (originMatches.length > 0) {
    score += 14;
  }

  return Math.min(score, 70);
}

function buildSources(productUrl, extracted) {
  const sources = [
    {
      source: "product_page_basic_extraction",
      type: "product_page_basic_extraction",
      label: productUrl,
    },
  ];

  if (extracted.pageTitle) {
    sources.push({
      source: "product_page_basic_extraction",
      type: "product_page_basic_extraction",
      label: extracted.pageTitle,
    });
  }

  if (extracted.metaDescription) {
    sources.push({
      source: "product_page_basic_extraction",
      type: "product_page_basic_extraction",
      label: extracted.metaDescription,
    });
  }

  if (extracted.openGraphTitle) {
    sources.push({
      source: "product_page_basic_extraction",
      type: "product_page_basic_extraction",
      label: extracted.openGraphTitle,
    });
  }

  sources.push({
    source: "agent_interpretation",
    type: "agent_interpretation",
    label: "No broad web search, external registry lookup, or independent source check in this version",
  });

  return sources;
}

function sourceLabelForDeepReadFailure(reason) {
  const text = cleanText(reason).toLowerCase();
  if (/access denied|blocked by bot protection/.test(text)) {
    return "Deep read blocked";
  }
  if (/timeout/.test(text)) {
    return "Deep read timeout";
  }
  if (/unsupported rendering pattern/.test(text)) {
    return "Deep read unsupported";
  }
  return "Deep read unavailable";
}

function deepReadBlockedNote() {
  return "The product page could not be fully read from the production browser worker. Hidden sections may not have been accessible. Missing fields below should be interpreted as unavailable, not confirmed absent.";
}

function deepReadShouldMakeMissingUnavailable(deepPageReadEvidence) {
  return Boolean(deepPageReadEvidence && deepPageReadEvidence.status === "failed");
}

function deepReadWasSuccessful(deepPageReadEvidence) {
  return Boolean(deepPageReadEvidence && (deepPageReadEvidence.status === "success" || deepPageReadEvidence.status === "partial"));
}

function detectAccessIssue({ status, html, url }) {
  const text = String(html || "");
  const compact = cleanText(stripTags(text)).slice(0, 500);

  if (status === 401 || status === 403 || status === 429) {
    return {
      type: "http_access_block",
      status,
      url,
      detail: `The product page returned HTTP ${status}, so the agent could not read normal product content.`,
    };
  }

  if (/bm-verify=/i.test(text) || /akamai|bot manager/i.test(text) && /verify|verification/i.test(text)) {
    return {
      type: "bot_verification",
      status,
      url,
      detail: "The product page returned a bot-verification challenge instead of product content.",
    };
  }

  if (/<title[^>]*>\s*access denied\s*<\/title>/i.test(text) || /\baccess denied\b/i.test(compact)) {
    return {
      type: "access_denied_page",
      status,
      url,
      detail: "The product page returned an access-denied page instead of product content.",
    };
  }

  if (/\bcaptcha\b|px-captcha|hcaptcha|recaptcha/i.test(text)) {
    return {
      type: "captcha_or_challenge",
      status,
      url,
      detail: "The product page returned a CAPTCHA or browser challenge instead of product content.",
    };
  }

  return null;
}

function createAccessError(issue) {
  const error = new Error(issue.detail);
  error.accessIssue = issue;
  return error;
}

function extractLinks(html, sourceUrl) {
  return [...String(html || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      const href = cleanText(match[1]);
      const label = stripTags(match[2]);

      try {
        return {
          url: new URL(href, sourceUrl).toString(),
          label,
        };
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
}

function topicForBrandLink(label, url) {
  const haystack = `${label} ${url}`.toLowerCase();

  if (/sustainability|duurzaamheid|re-fashion|slow-fashion/.test(haystack)) {
    return "Sustainability";
  }

  if (/quality|kwaliteit/.test(haystack)) {
    return "Quality";
  }

  if (/about|ons bedrijf|over ons|design philosophy|design filosofie/.test(haystack)) {
    return "Brand background";
  }

  if (/trust|partners/.test(haystack)) {
    return "Partners";
  }

  return "Brand context";
}

function localePrefixesFor(productUrl) {
  const prefixes = [""];

  try {
    const segments = new URL(productUrl).pathname.split("/").filter(Boolean);
    const first = segments[0] || "";
    const second = segments[1] || "";

    if (/^[a-z]{2}-[a-z]{2}$/i.test(first)) {
      prefixes.push(`/${first}`);
    }

    if (/^[a-z]{2}$/i.test(first) && /^[a-z]{2}$/i.test(second)) {
      prefixes.push(`/${first}/${second}`);
    }
  } catch (error) {
    return prefixes;
  }

  return [...new Set(prefixes)];
}

function brandSpecificCandidates(brand) {
  const normalized = cleanText(brand).toLowerCase();

  if (normalized === "zara") {
    return [
      {
        url: "https://www.inditex.com/itxcomweb/en/brands/zara",
        label: "Inditex Zara brand page",
        topic: "Brand background",
      },
      {
        url: "https://www.inditex.com/itxcomweb/en/sustainability",
        label: "Inditex sustainability",
        topic: "Sustainability",
      },
    ];
  }

  if (normalized === "cos") {
    return [
      {
        url: "https://www.cos.com/en-nl/sustainability",
        label: "COS sustainability",
        topic: "Sustainability",
      },
      {
        url: "https://www.cos.com/en-nl/product-care",
        label: "COS product care",
        topic: "Quality",
      },
    ];
  }

  if (normalized === "oska" || normalized.startsWith("oska ")) {
    return [
      {
        url: "https://www.oska.com/category/sustainability/",
        apiUrl: "https://www.oska.com/wp-json/wp/v2/posts?categories=3219&per_page=3",
        label: "OSKA sustainability",
        topic: "Sustainability",
      },
      {
        url: "https://www.oska.com/quality/",
        apiUrl: "https://www.oska.com/wp-json/wp/v2/pages/6920",
        label: "OSKA quality",
        topic: "Quality",
      },
      {
        url: "https://www.oska.com/about/",
        apiUrl: "https://www.oska.com/wp-json/wp/v2/pages/7179",
        label: "OSKA about",
        topic: "Brand background",
      },
      {
        url: "https://www.oska.com/design-philosophy/",
        apiUrl: "https://www.oska.com/wp-json/wp/v2/pages/6673",
        label: "OSKA design philosophy",
        topic: "Brand background",
      },
    ];
  }

  return [];
}

function guessedBrandCandidates(productUrl) {
  const parsedProductUrl = new URL(productUrl);
  const brandOrigin = parsedProductUrl.origin;
  const pathTemplates = [
    ["/sustainability", "Sustainability"],
    ["/sustainability/", "Sustainability"],
    ["/quality", "Quality"],
    ["/quality/", "Quality"],
    ["/about", "Brand background"],
    ["/about/", "Brand background"],
    ["/company", "Brand background"],
    ["/company/", "Brand background"],
    ["/product-care", "Quality"],
    ["/product-care/", "Quality"],
    ["/design-philosophy", "Brand background"],
    ["/design-philosophy/", "Brand background"],
    ["/re-fashion", "Sustainability"],
    ["/re-fashion/", "Sustainability"],
    ["/category/sustainability/", "Sustainability"],
  ];

  return localePrefixesFor(productUrl)
    .flatMap((prefix) =>
      pathTemplates.map(([path, topic]) => ({
        url: new URL(`${prefix}${path}`, brandOrigin).toString(),
        label: topic,
        topic,
      }))
    );
}

function brandInsightCandidates(html, productUrl, brand) {
  const seenProductLinks = new Set();
  const parsedProductUrl = new URL(productUrl);
  const productHost = parsedProductUrl.hostname.replace(/^www\./, "");
  let brandOrigin = parsedProductUrl.origin;

  const shouldScanProductLinks = String(html || "").length > 0 &&
    String(html || "").length <= 350000;
  const linkedCandidates = shouldScanProductLinks ? extractLinks(html, productUrl)
    .filter((link) => {
      const linkHost = new URL(link.url).hostname.replace(/^www\./, "");
      const sameBrandHost = linkHost === productHost || linkHost.endsWith(`.${productHost}`) || productHost.endsWith(`.${linkHost}`);
      const haystack = `${link.label} ${link.url}`.toLowerCase();
      const useful = brandInsightLinkKeywords.some((keyword) => haystack.includes(keyword));

      if (!sameBrandHost || !useful || seenProductLinks.has(link.url)) {
        return false;
      }

      brandOrigin = new URL(link.url).origin;
      seenProductLinks.add(link.url);
      return true;
    })
    .map((link) => ({
      ...link,
      topic: topicForBrandLink(link.label, link.url),
    })) : [];

  const candidates = [
    ...brandSpecificCandidates(brand),
    ...linkedCandidates,
    ...guessedBrandCandidates(productUrl),
  ];

  const seenCandidates = new Set();

  return candidates
    .filter((candidate) => {
      if (seenCandidates.has(candidate.url)) {
        return false;
      }
      seenCandidates.add(candidate.url);
      return true;
    })
    .slice(0, 18);
}

function extractBrandInsightSnippets(html) {
  const visibleHtml = removeNonVisibleMarkup(html);
  const pageTitle = extractTitle(html);
  const metaDescription = extractMetaContent(html, "name", "description") ||
    extractMetaContent(html, "property", "og:description");
  const snippets = uniqueSnippets([
    pageTitle,
    metaDescription,
    ...extractTextBlocks(visibleHtml),
    ...splitIntoSnippets(stripTags(visibleHtml)),
  ], 220);

  return snippets
    .filter((snippet) => {
      const lower = snippet.toLowerCase();
      return !(
        lower.includes("skip to content") ||
        lower.includes("go to content") ||
        lower.includes("select your language") ||
        lower.includes("change language") ||
        lower.includes("shop oska") ||
        lower.includes("see more latest") ||
        lower.includes("collection spring summer") ||
        lower.includes("category") ||
        /^(quality|sustainability|duurzaamheid|kleuren|colours|about|videos|magazine)\s*-?\s*oska/i.test(snippet)
      );
    })
    .filter((snippet) =>
      brandInsightKeywords.some((keyword) =>
        keywordAppearsInText(snippet, keyword)
      )
    )
    .filter((snippet) => snippet.length >= 40 && snippet.length <= 320)
    .slice(0, 3);
}

async function fetchJson(candidateUrl, timeoutMs = 4500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(candidateUrl, {
      signal: controller.signal,
      headers: {
        "accept": "application/json",
        "user-agent": USER_AGENT,
      },
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

function renderedJsonContentToHtml(payload) {
  const items = Array.isArray(payload) ? payload : [payload];

  return items
    .map((item) => [
      item && item.title && item.title.rendered,
      item && item.excerpt && item.excerpt.rendered,
      item && item.content && item.content.rendered,
      item && item.description,
    ].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" ");
}

async function fetchBrandInsightSource(candidate) {
  try {
    const snippets = extractBrandInsightSnippets(await fetchHtml(candidate.url, 4500));

    if (snippets.length > 0 || !candidate.apiUrl) {
      return { snippets };
    }

    const fallbackSnippets = extractBrandInsightSnippets(
      renderedJsonContentToHtml(await fetchJson(candidate.apiUrl, 4500))
    );

    return {
      snippets: fallbackSnippets,
      note: fallbackSnippets.length > 0
        ? "Readable public JSON content was used because the HTML page had no useful snippets."
        : undefined,
    };
  } catch (htmlError) {
    if (!candidate.apiUrl) {
      throw htmlError;
    }

    try {
      const payload = await fetchJson(candidate.apiUrl, 4500);
      const snippets = extractBrandInsightSnippets(renderedJsonContentToHtml(payload));

      if (snippets.length > 0) {
        return {
          snippets,
          note: htmlError.accessIssue
            ? "HTML page was blocked, so readable public JSON content was used instead."
            : "Readable public JSON content was used instead of the HTML page.",
        };
      }
    } catch (jsonError) {
      throw htmlError;
    }

    throw htmlError;
  }
}

function isReportableUnavailableSource(source) {
  const note = String(source && source.note || "");

  return !/Request failed with status 404/i.test(note);
}

async function fetchBrandInsight({ brand, productUrl, productHtml }) {
  const inferredBrand = brand && brand !== "not_found"
    ? brand
    : inferBrandFromUrl(productUrl);
  const candidates = brandInsightCandidates(productHtml || "", productUrl, inferredBrand);

  if (!inferredBrand || inferredBrand === "not_found" || candidates.length === 0) {
    return {
      status: "not_found",
      brand: inferredBrand || "not_found",
      summary: "No public brand context candidates could be derived from the submitted product URL.",
      sources: [],
    };
  }

  const sources = (await Promise.all(
    candidates.slice(0, 10).map(async (candidate) => {
      try {
        const source = await fetchBrandInsightSource(candidate);
        const snippets = source.snippets;

        if (snippets.length === 0) {
          return null;
        }

        return {
          source: "brand_page",
          topic: candidate.topic,
          label: candidate.label || candidate.topic,
          url: candidate.url,
          snippets,
          note: source.note,
        };
      } catch (error) {
        return {
          source: "brand_page",
          topic: candidate.topic,
          label: candidate.label || candidate.topic,
          url: candidate.url,
          status: "unavailable",
          snippets: [],
          note: error.accessIssue
            ? error.accessIssue.detail
            : error.message || "Could not fetch this brand context page.",
        };
      }
    })
  )).filter(Boolean);
  const foundSources = sources
    .filter((source) => Array.isArray(source.snippets) && source.snippets.length > 0)
    .slice(0, 3);

  if (foundSources.length === 0) {
    const unavailableSources = sources
      .filter((source) => source.status === "unavailable")
      .filter(isReportableUnavailableSource)
      .slice(0, 3);

    return {
      status: unavailableSources.length > 0 ? "unavailable" : "not_found",
      brand: inferredBrand,
      summary: unavailableSources.length > 0
        ? "Public brand context candidates were found, but the agent could not read useful snippets from them."
        : "Public brand context candidates were checked, but no useful quality, sustainability, or brand-background snippets could be extracted.",
      sources: unavailableSources,
    };
  }

  return {
    status: "found",
    brand: inferredBrand,
    summary: "Public brand context was found from brand or brand-owner pages. Treat this as public context, not independent product-level proof.",
    sources: foundSources,
  };
}

async function withTimeout(promise, timeoutMs, fallbackValue) {
  let timeout;

  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve(fallbackValue), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function brandInsightTimeoutFallback(brand) {
  return {
    status: "unavailable",
    brand: brand || "not_found",
    summary: "Brand context lookup timed out. Product-page passport analysis still completed.",
    sources: [],
  };
}

function buildUnknowns(materialMatches, originMatches, careMatches, claims) {
  const unknowns = [];

  if (materialMatches.length === 0) {
    unknowns.push("Exact material composition could not be clearly identified from the fetched page.");
  }

  if (originMatches.length === 0) {
    unknowns.push("Country of manufacture or production origin was not clearly visible.");
  }

  if (careMatches.length === 0) {
    unknowns.push("Specific garment washing instructions were not clearly visible.");
  }

  if (claims.length > 0) {
    unknowns.push("Any sustainability wording remains unverified beyond what appears on the product page.");
  } else {
    unknowns.push("No clear sustainability claims were found on the fetched page text.");
  }

  unknowns.push("Factory, supplier, and third-party evidence were not independently checked.");

  return unknowns;
}

function isUsefulFallbackValue(value) {
  const cleaned = cleanText(value);

  if (!cleaned) {
    return false;
  }

  return !/^(material not|not found|no clear|check the garment|the page could not|information not)/i
    .test(cleaned);
}

function collectReportFallbacks(report) {
  const fallbackByKey = {};

  if (isUsefulFallbackValue(report.materialExplained && report.materialExplained.rawMaterial)) {
    fallbackByKey.materialComposition = {
      values: [report.materialExplained.rawMaterial],
      source: "agent_interpretation",
      sourceLabel: "Report keyword fallback",
      note: "Derived from keyword analysis, not from the normalized product-page field.",
    };
  }

  const claimValues = (report.sustainabilityClaimsFound || [])
    .map((claim) => claim.brandClaim || claim.claim)
    .filter(isUsefulFallbackValue);

  if (claimValues.length > 0) {
    fallbackByKey.sustainabilityClaims = {
      values: claimValues,
      source: "agent_interpretation",
      sourceLabel: "Report claim fallback",
      note: "Shown separately because the report detected claim-like wording outside the normalized snapshot field.",
    };
  }

  if (isUsefulFallbackValue(report.washingCareAdvice && report.washingCareAdvice.summary)) {
    fallbackByKey.careText = {
      values: [report.washingCareAdvice.summary],
      source: "agent_interpretation",
      sourceLabel: "Report care fallback",
      note: "Derived from a care-text scan, not from the normalized product-page field.",
    };
  }

  if (isUsefulFallbackValue(report.productionOriginTransparency && report.productionOriginTransparency.detail)) {
    fallbackByKey.productionOrigin = {
      values: [report.productionOriginTransparency.detail],
      source: "agent_interpretation",
      sourceLabel: "Report origin fallback",
      note: "Derived from an origin scan, not from the normalized product-page field.",
    };
  }

  if (isUsefulFallbackValue(report.supplierTransparency && report.supplierTransparency.detail)) {
    fallbackByKey.supplierDetails = {
      values: [report.supplierTransparency.detail],
      source: "agent_interpretation",
      sourceLabel: "Report supplier fallback",
      note: "Derived from a supplier scan, not from the normalized product-page field.",
    };
  }

  return fallbackByKey;
}

function applyDeepReadAvailability(productPageEvidence, deepPageReadEvidence) {
  if (!productPageEvidence) {
    return productPageEvidence;
  }

  if (deepReadWasSuccessful(deepPageReadEvidence)) {
    const fields = productPageEvidence.fields || {};
    for (const field of Object.values(fields)) {
      if (field.status !== "found") {
        continue;
      }

      field.source = "product_page_deep_read";
      field.sourceLabel = "Product page deep read";
      field.note = "Found after production browser reading, including visible page content and any opened product sections.";
    }

    return productPageEvidence;
  }

  if (!deepReadShouldMakeMissingUnavailable(deepPageReadEvidence)) {
    return productPageEvidence;
  }

  const fields = productPageEvidence.fields || {};
  const sourceLabel = sourceLabelForDeepReadFailure(deepPageReadEvidence.failureReason);
  const note = deepReadBlockedNote();
  for (const field of Object.values(fields)) {
    if (field.status !== "not_found") {
      continue;
    }

    field.status = "unavailable";
    field.source = "product_page_deep_read";
    field.sourceLabel = sourceLabel;
    field.note = note;
  }

  const fieldList = Object.values(fields);
  productPageEvidence.missingFields = fieldList
    .filter((field) => field.status === "not_found")
    .map((field) => field.label);
  productPageEvidence.unavailableFields = fieldList
    .filter((field) => field.status === "unavailable")
    .map((field) => field.label);
  productPageEvidence.foundFields = fieldList
    .filter((field) => field.status === "found")
    .map((field) => field.label);
  productPageEvidence.summary = `${note} Product-page extraction found ${productPageEvidence.foundFields.length} checked field(s). ${productPageEvidence.unavailableFields.length} field(s) remain unavailable.`;
  productPageEvidence.deepReadNote = note;

  return productPageEvidence;
}

function alignReportWithCanonicalEvidence(report, evidence) {
  const fields = evidence?.fields || {};
  const foundText = (key) => fields[key]?.status === "found"
    ? fields[key].values.join("; ")
    : "";
  const material = foundText("materialComposition");
  const care = foundText("careText");
  const origin = foundText("productionOrigin");
  const supplier = foundText("supplierDetails");
  const sustainability = fields.sustainabilityClaims?.status === "found"
    ? fields.sustainabilityClaims.values
    : [];
  const hasBrandEvidence = ["sustainabilityClaims", "certifications", "durabilityClaims"]
    .some((key) => fields[key]?.status === "found");
  const unknowns = (Array.isArray(report.unknowns) ? report.unknowns : []).filter((item) => {
    const text = String(item).toLowerCase();
    if (material && /material/.test(text)) return false;
    if (care && /care|washing/.test(text)) return false;
    if ((origin || supplier) && /origin|manufactur|supplier|factory/.test(text)) return false;
    if (sustainability.length > 0 && /sustainability claim/.test(text)) return false;
    return true;
  });

  return {
    ...report,
    materialExplained: material ? {
      ...(report.materialExplained || {}),
      rawMaterial: material,
      simpleExplanation: "Direct material wording captured in the canonical evidence ledger.",
      confidence: "High",
    } : report.materialExplained,
    washingCareAdvice: care ? {
      ...(report.washingCareAdvice || {}),
      summary: care,
      confidence: "High",
    } : report.washingCareAdvice,
    productionOriginTransparency: origin ? {
      ...(report.productionOriginTransparency || {}),
      status: "Found some origin or manufacturing detail",
      detail: origin,
      confidence: "High",
    } : report.productionOriginTransparency,
    supplierTransparency: supplier ? {
      ...(report.supplierTransparency || {}),
      status: "Found supplier or factory detail",
      detail: supplier,
      confidence: "High",
    } : report.supplierTransparency,
    sustainabilityClaimsFound: sustainability.length > 0 && !(report.sustainabilityClaimsFound || []).length
      ? sustainability.map((claim) => ({
          claim,
          type: "brand_statement",
          confidence: "Medium",
          whyItMatters: "This is cited brand wording, not independent verification.",
        }))
      : report.sustainabilityClaimsFound,
    claimStrengthScore: hasBrandEvidence ? {
      ...(report.claimStrengthScore || {}),
      rationale: "Brand and certification wording was found on the product page; no separate qualifying source independently verified it.",
    } : report.claimStrengthScore,
    unknowns,
  };
}

function withProductPageEvidence(report, productPageSnapshot, deepPageReadEvidence = null) {
  const productPageEvidence = buildProductPageEvidence(
    productPageSnapshot,
    collectReportFallbacks(report)
  );
  const checkedProductPageEvidence = applyDeepReadAvailability(productPageEvidence, deepPageReadEvidence);
  buildCanonicalEvidenceLedger(checkedProductPageEvidence);
  const alignedReport = alignReportWithCanonicalEvidence(report, checkedProductPageEvidence);
  const claimCitations = buildCanonicalClaims(alignedReport, checkedProductPageEvidence);
  const deterministicScores = scoreProductPassport(checkedProductPageEvidence);
  const deepReadNote = deepReadShouldMakeMissingUnavailable(deepPageReadEvidence)
    ? deepReadBlockedNote()
    : "";
  const deepReadMode = deepReadWasSuccessful(deepPageReadEvidence)
    ? "Deep read successful"
    : deepPageReadEvidence && deepPageReadEvidence.status === "failed"
    ? deepPageReadEvidence.mode || sourceLabelForDeepReadFailure(deepPageReadEvidence.failureReason)
    : deepPageReadEvidence && deepPageReadEvidence.status === "skipped"
    ? "Localhost/demo read"
    : "Basic fallback used";

  return {
    ...alignedReport,
    deepPageReadEvidence: deepPageReadEvidence
      ? { ...deepPageReadEvidence, mode: deepPageReadEvidence.mode || deepReadMode, note: deepPageReadEvidence.note || deepReadNote }
      : deepPageReadEvidence,
    deepReadMode,
    deepReadNote,
    productPageEvidence: checkedProductPageEvidence,
    evidenceLedger: checkedProductPageEvidence.evidenceLedger,
    claimCitations,
    passportReadiness: buildPassportReadiness(checkedProductPageEvidence, productPageSnapshot),
    ...deterministicScores,
  };
}

function parseSnapshotMaterials(snapshot) {
  const rows = Array.isArray(snapshot && snapshot.materialCompositionText)
    ? snapshot.materialCompositionText
    : [];
  const materials = [];

  for (const row of rows) {
    const text = cleanText(row);
    const matches = [...text.matchAll(/(\d{1,3}\s*%)\s*([^,;]+)/g)];

    for (const match of matches) {
      const percentage = cleanText(match[1]).replace(/\s+/g, "");
      const rawName = cleanText(match[2])
        .replace(/^(shell|lining|pocket lining|composition)\s*:\s*/i, "")
        .replace(/[.]+$/g, "");
      const name = cleanText(rawName);

      if (name) {
        materials.push({
          name,
          percentage,
          explanation: materialExplanation(name.toLowerCase()),
        });
      }
    }
  }

  return materials;
}

function snapshotValues(snapshot, key) {
  const value = snapshot && snapshot[key];
  return Array.isArray(value)
    ? value.map(cleanText).filter(Boolean)
    : [];
}

function snapshotText(snapshot, key, limit = 4, separator = "; ") {
  return uniqueSnippets(snapshotValues(snapshot, key), limit).join(separator);
}

function firstMatchValue(values, label) {
  const pattern = new RegExp(`\\b${escapeRegex(label)}\\b\\s*:\\s*([^;]+)`, "i");

  for (const value of values) {
    const match = cleanText(value).match(pattern);
    if (match && cleanText(match[1])) {
      return cleanText(match[1]);
    }
  }

  return "";
}

function deriveSnapshotOrigin(snapshot) {
  const values = [
    ...((snapshot && snapshot.supplierDetailText) || []),
    ...((snapshot && snapshot.originText) || []),
  ];

  return {
    country: firstMatchValue(values, "Country"),
    factory: firstMatchValue(values, "Factory") || firstMatchValue(values, "Supplier"),
  };
}

function deriveSnapshotPrice(snapshot) {
  const identifiers = Array.isArray(snapshot && snapshot.productIdentifiersText)
    ? snapshot.productIdentifiersText
    : [];
  const priceRow = identifiers.find((value) => /^price\s*:/i.test(cleanText(value)));

  return priceRow
    ? cleanText(priceRow.replace(/^price\s*:\s*/i, ""))
    : "";
}

function withSnapshotFallbackAiReport(aiReport, productPageSnapshot) {
  const snapshotMaterials = parseSnapshotMaterials(productPageSnapshot);
  const snapshotOrigin = deriveSnapshotOrigin(productPageSnapshot);
  const snapshotCare = snapshotValues(productPageSnapshot, "careText")
    .filter((value) => !/^product care$/i.test(value));
  const materials = snapshotMaterials.length > 0
    ? snapshotMaterials
    : aiReport.materials;
  const careInstructions = snapshotCare.length > 0
    ? snapshotCare
    : aiReport.care_instructions;
  const hasAiOrigin = Boolean(aiReport.origin.country || aiReport.origin.factory);
  const hasSnapshotOrigin = Boolean(snapshotOrigin.country || snapshotOrigin.factory);
  const origin = {
    ...aiReport.origin,
    country: snapshotOrigin.country || aiReport.origin.country || null,
    factory: snapshotOrigin.factory || aiReport.origin.factory || null,
    confidence: hasAiOrigin || hasSnapshotOrigin
      ? hasSnapshotOrigin ? "High" : aiReport.origin.confidence
      : aiReport.origin.confidence,
  };
  const missingInformation = materials.length > 0
    ? aiReport.missing_information.filter((item) => item.toLowerCase() !== "materials not publicly listed")
    : aiReport.missing_information;

  return {
    ...aiReport,
    brand: aiReport.brand || (productPageSnapshot && productPageSnapshot.likelyBrand !== "not_found" ? productPageSnapshot.likelyBrand : null),
    product_name: aiReport.product_name || (productPageSnapshot && productPageSnapshot.likelyProductName !== "not_found" ? productPageSnapshot.likelyProductName : null),
    price: aiReport.price || deriveSnapshotPrice(productPageSnapshot) || null,
    materials,
    origin,
    care_instructions: careInstructions,
    missing_information: missingInformation,
  };
}

function evidenceBackedStatus(foundStatus, missingStatus, value) {
  return isUsefulFallbackValue(value) ? foundStatus : missingStatus;
}

function mapAiReportToExistingShape(aiReport, { productUrl, retailer, extracted, brandInsight, productPageSnapshot }) {
  aiReport = withSnapshotFallbackAiReport(aiReport, productPageSnapshot);
  const snapshotMaterialText = snapshotText(productPageSnapshot, "materialCompositionText");
  const snapshotCareText = snapshotValues(productPageSnapshot, "careText")
    .filter((value) => !/^product care$/i.test(value))
    .join("; ");
  const snapshotSupplierText = snapshotText(productPageSnapshot, "supplierDetailText", 2);
  const snapshotOrigin = deriveSnapshotOrigin(productPageSnapshot);
  const conciseSnapshotOriginText = [
    snapshotOrigin.country ? `Country: ${snapshotOrigin.country}` : "",
    snapshotOrigin.factory ? `Factory: ${snapshotOrigin.factory}` : "",
  ].filter(Boolean).join("; ");
  const snapshotOriginText = conciseSnapshotOriginText || snapshotText(productPageSnapshot, "originText", 2);
  const snapshotDescriptionText = snapshotText(productPageSnapshot, "productDescriptionText", 2);
  const materialNames = aiReport.materials
    .map((material) => material.percentage ? `${material.percentage} ${material.name}` : material.name)
    .filter(Boolean);
  const originDetails = [
    aiReport.origin.country ? `Country: ${aiReport.origin.country}` : "",
    aiReport.origin.factory ? `Factory: ${aiReport.origin.factory}` : "",
  ].filter(Boolean);
  const aiSupplierDetails = [
    aiReport.origin.supplier ? `Supplier: ${aiReport.origin.supplier}` : "",
    aiReport.origin.country ? `Country: ${aiReport.origin.country}` : "",
    aiReport.origin.factory ? `Factory: ${aiReport.origin.factory}` : "",
    aiReport.origin.address ? `Address: ${aiReport.origin.address}` : "",
    aiReport.origin.employees ? `Employees: ${aiReport.origin.employees}` : "",
  ].filter(Boolean);
  const primaryMaterial = snapshotMaterialText || materialNames.join(", ") || "Material not confirmed";
  const materialExplanationText = aiReport.materials.length > 0
    ? aiReport.materials
        .map((material) => [
          material.percentage ? `${material.percentage} ${material.name}` : material.name,
          material.explanation,
        ].filter(Boolean).join(": "))
        .join(" ")
    : "No material composition was publicly listed in the product-page text.";
  const careSummary = snapshotCareText || (aiReport.care_instructions.length > 0
    ? aiReport.care_instructions.join(" ")
    : "");
  const originDetail = snapshotOriginText || (originDetails.length > 0
    ? originDetails.join("; ")
    : "");
  const supplierDetail = snapshotSupplierText || aiSupplierDetails.join("; ");
  const productSummary = aiReport.product_summary || snapshotDescriptionText ||
    `${retailer} product page analyzed, but limited product summary detail was available.`;
  const finalCareSummary = careSummary
    ? careSummary
    : "No clear care instructions were detected in the fetched page text. Check the garment label before washing.";
  const sources = buildSources(productUrl, extracted);

  return {
    productSummary,
    materialExplained: {
      rawMaterial: primaryMaterial,
      simpleExplanation: materialExplanationText,
      confidence: snapshotMaterialText || aiReport.materials.length > 0 ? "High" : "Low",
      materials: aiReport.materials,
    },
    sustainabilityClaimsFound: aiReport.sustainability_claims.map((claim) => ({
      claim: claim.claim,
      evidence: claim.evidence || "No supporting certificate or third-party verification was found on the product page.",
      type: claim.type,
      confidence: claim.confidence,
      whyItMatters: claim.type === "unverified"
        ? "This is brand-provided wording without product-level certification evidence in the analyzed page text."
        : "This claim should still be checked against product-level proof before being treated as independently verified.",
    })),
    productionOriginTransparency: {
      status: evidenceBackedStatus("Found some origin or manufacturing detail", "Not found", originDetail),
      detail: originDetail || "No clear product-level country-of-origin, factory, or traceability text was found in the fetched page content.",
      confidence: originDetail ? "High" : "Low",
    },
    supplierTransparency: {
      status: evidenceBackedStatus("Found supplier or factory detail", "Not found", supplierDetail),
      detail: supplierDetail || "No clear product-level supplier, factory, address, or employee-count information was found in the fetched page content.",
      confidence: supplierDetail ? "High" : "Low",
    },
    washingCareAdvice: {
      summary: finalCareSummary,
      confidence: careSummary ? "High" : "Low",
    },
    brandInsight,
    aiAnalysis: {
      provider: "openai",
      model: OPENAI_MODEL,
      brand: aiReport.brand,
      productName: aiReport.product_name,
      price: aiReport.price,
      schema: "product-transparency-report-v1",
    },
    conclusion: sanitizeConclusion(aiReport.conclusion) || "The fetched page could be analyzed, but the resulting transparency assessment was limited by the public page text.",
    sources,
    unknowns: aiReport.missing_information.length > 0
      ? aiReport.missing_information
      : buildUnknowns(
          materialNames,
          originDetails,
          aiReport.care_instructions,
          aiReport.sustainability_claims
        ),
  };
}

function buildAiFailureReport({
  productUrl,
  retailer,
  productPageSnapshot,
  deepPageReadEvidence,
  brandInsight,
  extracted,
  message,
}) {
  const report = {
    error: true,
    message,
    note: "The product page was fetched, but the full analysis could not be completed. This fallback keeps extraction evidence available for review.",
    productSummary: `${retailer} product page fetched, but the full analysis could not be completed.`,
    materialExplained: {
      rawMaterial: "Material not confirmed",
      simpleExplanation: "No material explanation is available because the analysis step failed.",
      confidence: "Low",
    },
    sustainabilityClaimsFound: [],
    productionOriginTransparency: {
      status: "Not found",
      detail: "No origin analysis is available because the analysis step failed.",
      confidence: "Low",
    },
    supplierTransparency: {
      status: "Not found",
      detail: "No supplier or factory analysis is available because the analysis step failed.",
      confidence: "Low",
    },
    washingCareAdvice: {
      summary: "No care advice is available. Check the garment care label directly before washing.",
      confidence: "Low",
    },
    brandInsight,
    aiAnalysis: {
      provider: "openai",
      model: OPENAI_MODEL,
      status: "failed",
    },
    conclusion: "No product-level transparency assessment could be made from the fetched page content.",
    sources: buildSources(productUrl, extracted),
    unknowns: [
      "materials not publicly listed",
      "Full analysis unavailable",
      "Product-level sustainability claims not assessed",
      "Origin and manufacturing details not assessed",
      "Care instructions not assessed",
    ],
  };

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      analysisMode: "openai-analysis-v1",
      productUrl,
      retailer,
      productPageSnapshot,
      deepPageReadEvidence,
    },
    report: withProductPageEvidence(report, productPageSnapshot, deepPageReadEvidence),
  };
}

function buildPartialReport(productUrl, retailer, note, productPageSnapshot, brandInsight = null, accessDiagnostics = null, deepPageReadEvidence = null) {
  const report = {
    note,
    productSummary: `${retailer} product link received, but the page content could not be reliably read. This is a limited fallback report.`,
    materialExplained: {
      rawMaterial: "Material not confirmed",
      simpleExplanation: "The product page could not be parsed reliably enough to confirm material information.",
      confidence: "Low",
    },
    sustainabilityClaimsFound: [],
    productionOriginTransparency: {
      status: "Not found",
      detail: "The page could not be reliably read for origin or traceability information.",
      confidence: "Low",
    },
    supplierTransparency: {
      status: "Not found",
      detail: "The page could not be reliably read for supplier or factory information.",
      confidence: "Low",
    },
    washingCareAdvice: {
      summary: "Check the garment care label directly before washing. This report could not confirm page-level care instructions.",
      confidence: "Low",
    },
    brandInsight: brandInsight || {
      status: "unavailable",
      brand: productPageSnapshot && productPageSnapshot.likelyBrand !== "not_found"
        ? productPageSnapshot.likelyBrand
        : inferBrandFromUrl(productUrl),
      summary: "Brand context was not checked because the product page could not be reliably read.",
      sources: [],
    },
    accessDiagnostics,
    conclusion: "No reliable product-level transparency assessment could be made from the fetched page content.",
    sources: [
      {
        type: "Product URL submitted by user",
        label: productUrl,
      },
      ...(accessDiagnostics ? [{
        type: "Access diagnostic",
        label: accessDiagnostics.detail,
      }] : []),
      {
        type: "Extraction note",
        label: productPageSnapshot
          ? productPageSnapshot.extractionNotes.join("; ")
          : note,
      },
    ],
    unknowns: [
      "Exact product description",
      "Material composition",
      "Origin and manufacturing details",
      "Care instructions",
      "Any sustainability claim visible on the page",
    ],
  };

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      analysisMode: "live-fetch-v1",
      productUrl,
      retailer,
      productPageSnapshot,
      deepPageReadEvidence,
    },
    report: withProductPageEvidence(report, productPageSnapshot, deepPageReadEvidence),
  };
}

async function fetchHtml(productUrl, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(productUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,nl;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    const responseText = await response.text();
    const accessIssue = detectAccessIssue({
      status: response.status,
      html: responseText,
      url: response.url || productUrl,
    });

    if (accessIssue) {
      throw createAccessError(accessIssue);
    }

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    if (!contentType.includes("text/html")) {
      throw new Error("URL did not return an HTML page");
    }

    return responseText;
  } finally {
    clearTimeout(timeout);
  }
}

function deepReadEvidenceScore(result) {
  if (!result) return -1;

  const counts = result.counts || {};
  const interactionCount = Number(counts.tabsClicked || 0) +
    Number(counts.accordionsOpened || 0) +
    Number(counts.readMoreExpanded || 0);
  const evidenceCount = (result.textEvidence || []).length +
    (result.structuredData || []).length +
    (result.networkResponses || []).length;
  const statusScore = result.status === "success" ? 100 : result.status === "partial" ? 40 : 0;

  return statusScore + (interactionCount * 20) + (evidenceCount * 2);
}

function deepReadHasInteractiveEvidence(result) {
  const counts = result && result.counts || {};
  return Number(counts.tabsClicked || 0) +
    Number(counts.accordionsOpened || 0) +
    Number(counts.readMoreExpanded || 0) > 0;
}

async function readProductPageDeepEvidence(productUrl, timeoutMs, readers = {}) {
  const readWorker = readers.worker || callDeepReaderWorker;
  const readLocal = readers.local || readDeepProductPage;
  const startedAt = Date.now();
  const preferLocal = readers.preferLocal !== undefined
    ? readers.preferLocal
    : process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
  let localResult = null;

  if (preferLocal) {
    const localTimeoutMs = Math.min(timeoutMs, 30000);
    localResult = await withTimeout(
      readLocal(productUrl, { timeoutMs: localTimeoutMs }),
      localTimeoutMs + 500,
      createDeepReadTimeout(productUrl)
    );

    if (localResult.status === "success" && deepReadHasInteractiveEvidence(localResult)) {
      return localResult;
    }
  }

  const remainingBeforeWorkerMs = timeoutMs - (Date.now() - startedAt);
  if (remainingBeforeWorkerMs < 5000) {
    return localResult || createDeepReadTimeout(productUrl);
  }

  const workerTimeoutMs = Math.max(
    5000,
    Math.min(remainingBeforeWorkerMs, remainingBeforeWorkerMs - MIN_LOCAL_DEEP_READER_FALLBACK_MS)
  );
  const workerResult = await readWorker(productUrl, { timeoutMs: workerTimeoutMs });

  if (!workerResult) {
    if (localResult) return localResult;

    return withTimeout(
      readLocal(productUrl, { timeoutMs }),
      timeoutMs + 500,
      createDeepReadTimeout(productUrl)
    );
  }

  if (workerResult.status === "success" && deepReadHasInteractiveEvidence(workerResult)) {
    return workerResult;
  }

  if (localResult) {
    return deepReadEvidenceScore(localResult) > deepReadEvidenceScore(workerResult)
      ? localResult
      : workerResult;
  }

  const remainingMs = timeoutMs - (Date.now() - startedAt);
  if (remainingMs < 5000) {
    return workerResult;
  }

  const fallbackResult = await withTimeout(
    readLocal(productUrl, { timeoutMs: remainingMs }),
    remainingMs + 500,
    createDeepReadTimeout(productUrl)
  );
  return deepReadEvidenceScore(fallbackResult) > deepReadEvidenceScore(workerResult)
    ? fallbackResult
    : workerResult;
}

function createDeepReadTimeout(productUrl) {
  return createFailedDeepRead(productUrl, "page timeout");
}

async function analyzeProductUrl(productUrl) {
  if (!productUrl || typeof productUrl !== "string") {
    throw new Error("Product URL is required");
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(productUrl);
  } catch (error) {
    throw new Error("Product URL is required");
  }

  const retailer = parsedUrl.hostname.replace(/^www\./, "");
  const fallbackNote = "Could not reliably read the product page. This report is based on limited available data.";
  const configuredDeepReaderTimeoutValue = Number(
    process.env.DEEP_READER_WORKER_TIMEOUT_MS || DEFAULT_ANALYSIS_DEEP_READER_TIMEOUT_MS
  );
  const configuredDeepReaderTimeoutMs = Number.isFinite(configuredDeepReaderTimeoutValue) && configuredDeepReaderTimeoutValue > 0
    ? configuredDeepReaderTimeoutValue
    : DEFAULT_ANALYSIS_DEEP_READER_TIMEOUT_MS;
  const deepReaderTimeoutMs = Math.min(
    Math.max(configuredDeepReaderTimeoutMs, 5000),
    MAX_ANALYSIS_DEEP_READER_TIMEOUT_MS
  );

  let html;
  const deepReadPromise = withTimeout(
    readProductPageDeepEvidence(productUrl, deepReaderTimeoutMs),
    deepReaderTimeoutMs + 500,
    createDeepReadTimeout(productUrl)
  );
  const htmlPromise = fetchHtml(productUrl)
    .then((value) => ({ value, error: null }))
    .catch((error) => ({ value: null, error }));
  const [deepPageReadResult, htmlResult] = await Promise.all([deepReadPromise, htmlPromise]);
  let deepPageReadEvidence = deepPageReadResult;
  let productPageSnapshot;

  if (htmlResult.error) {
    const error = htmlResult.error;
    const deepEvidenceHtml = buildDeepEvidenceHtml(deepPageReadEvidence);
    if (deepEvidenceHtml) {
      const inferredBrand = inferBrandFromUrl(productUrl);
      const inferredProductName = inferProductNameFromUrl(productUrl);
      html = `<!doctype html><html><head><title>${inferredProductName} | ${inferredBrand}</title><meta name="brand" content="${inferredBrand}" /></head><body>${deepEvidenceHtml}</body></html>`;
    } else {
    const inferredBrand = inferBrandFromUrl(productUrl);
    const inferredProductName = inferProductNameFromUrl(productUrl);
    productPageSnapshot = createFailedProductPageSnapshot(
      productUrl,
      error.message || "unable to fetch product page",
      new Date(),
      error.accessIssue || null
    );

    if (inferredBrand !== "not_found") {
      productPageSnapshot.likelyBrand = inferredBrand;
      productPageSnapshot.extractionNotes.push(`likely brand inferred from URL: ${inferredBrand}`);
    }

    if (inferredProductName !== "not_found") {
      productPageSnapshot.likelyProductName = inferredProductName;
      productPageSnapshot.extractionNotes.push(`likely product name inferred from URL: ${inferredProductName}`);
    }

    const brandInsight = await withTimeout(
      fetchBrandInsight({
        brand: inferredBrand,
        productUrl,
        productHtml: "",
      }),
      6500,
      brandInsightTimeoutFallback(inferredBrand)
    );
    if (!deepPageReadEvidence || deepPageReadEvidence.status === "skipped") {
      deepPageReadEvidence = createFailedDeepRead(
        productUrl,
        error.accessIssue && error.accessIssue.type === "bot_verification"
          ? "blocked by bot protection"
          : error.accessIssue && error.accessIssue.type === "access_denied_page"
          ? "access denied"
          : error.message || "page timeout"
      );
    }
    return buildPartialReport(
      productUrl,
      retailer,
      error.accessIssue ? error.accessIssue.detail : fallbackNote,
      productPageSnapshot,
      brandInsight,
      error.accessIssue || null,
      deepPageReadEvidence
    );
    }
  } else {
    html = htmlResult.value;
  }

  const deepEvidenceHtml = buildDeepEvidenceHtml(deepPageReadEvidence);
  const analysisHtml = appendDeepEvidenceHtml(html, deepEvidenceHtml);

  productPageSnapshot = extractProductPageSnapshot(analysisHtml, productUrl);

  const extracted = {
    openGraphTitle: extractMetaContent(html, "property", "og:title"),
    twitterTitle: extractMetaContent(html, "name", "twitter:title"),
    metaDescription: extractMetaContent(html, "name", "description"),
    openGraphDescription: extractMetaContent(html, "property", "og:description"),
    pageTitle: extractTitle(html),
  };

  const visibleHtml = removeNonVisibleMarkup(analysisHtml);
  const bodyText = stripTags(visibleHtml);
  const snippets = uniqueSnippets([
    ...extractTextBlocks(visibleHtml),
    ...splitIntoSnippets(bodyText),
  ], 400);
  const visibleProductText = pickProductLikeText(
    snippets,
    extracted.openGraphTitle || extracted.twitterTitle || extracted.pageTitle,
    extracted.metaDescription || extracted.openGraphDescription
  );

  const title = extracted.openGraphTitle || extracted.twitterTitle || extracted.pageTitle;
  const description = extracted.metaDescription || extracted.openGraphDescription;
  const pageReadable = Boolean(title || description || visibleProductText || snippets.length > 0);

  if (!pageReadable) {
    return buildPartialReport(productUrl, retailer, fallbackNote, productPageSnapshot);
  }

  const brandInsightPromise = withTimeout(
    fetchBrandInsight({
      brand: productPageSnapshot.likelyBrand,
      productUrl,
      productHtml: html,
    }),
    6500,
    brandInsightTimeoutFallback(productPageSnapshot.likelyBrand)
  );

  let aiReport;
  let brandInsight;

  try {
    [brandInsight, aiReport] = await Promise.all([brandInsightPromise, analyzeTextWithOpenAi({
      productUrl,
      pageText: buildAiPageText({
        title,
        description,
        visibleProductText,
        bodyText,
        productPageSnapshot,
      }),
    })]);
  } catch (error) {
    brandInsight = await brandInsightPromise;
    return buildAiFailureReport({
      productUrl,
      retailer,
      productPageSnapshot,
      brandInsight,
      extracted,
      deepPageReadEvidence,
      message: error.message || "Analysis failed",
    });
  }

  const report = mapAiReportToExistingShape(aiReport, {
    productUrl,
    retailer,
    extracted,
    brandInsight,
    productPageSnapshot,
  });

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      analysisMode: "openai-analysis-v1",
      productUrl,
      retailer,
      productPageSnapshot,
      deepPageReadEvidence,
    },
    report: withProductPageEvidence(report, productPageSnapshot, deepPageReadEvidence),
  };
}

module.exports = {
  analyzeProductUrl,
  buildAiPageText,
  readProductPageDeepEvidence,
  sanitizeConclusion,
};
