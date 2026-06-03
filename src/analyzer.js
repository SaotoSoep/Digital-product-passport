const { URL } = require("url");
const {
  createFailedProductPageSnapshot,
  extractProductPageSnapshot,
} = require("./lib/product-page/snapshot");

const materialKeywords = [
  "organic cotton",
  "recycled polyester",
  "polyamide",
  "elastane",
  "polyester",
  "viscose",
  "cotton",
  "linen",
  "wool",
  "nylon",
  "leather",
];

const sustainabilityKeywords = [
  "sustainability",
  "sustainable",
  "responsible",
  "conscious",
  "recycled",
  "organic",
  "lower impact",
  "traceable",
  "certified",
  "vegan",
  "eco",
];

const careKeywords = [
  "machine wash",
  "tumble dry",
  "dry clean",
  "washing",
  "bleach",
  "iron",
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

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
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

function cleanText(text) {
  return decodeHtmlEntities(String(text || ""))
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(titleMatch ? titleMatch[1] : "");
}

function extractMetaContent(html, attribute, key) {
  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${escapeRegex(key)}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>|<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+${attribute}=["']${escapeRegex(key)}["'][^>]*>`,
    "i"
  );
  const match = html.match(pattern);
  return cleanText(match ? match[1] || match[2] : "");
}

function splitIntoSnippets(text) {
  return text
    .split(/(?<=[.!?])\s+|\s{2,}/)
    .map((snippet) => snippet.trim())
    .filter((snippet) => snippet.length >= 20);
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
    publicEvidence: "Visible on the submitted product page only. No independent verification was performed in this MVP.",
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
      type: "Product URL submitted by user",
      label: productUrl,
    },
  ];

  if (extracted.pageTitle) {
    sources.push({
      type: "HTML title tag",
      label: extracted.pageTitle,
    });
  }

  if (extracted.metaDescription) {
    sources.push({
      type: "Meta description",
      label: extracted.metaDescription,
    });
  }

  if (extracted.openGraphTitle) {
    sources.push({
      type: "OpenGraph title",
      label: extracted.openGraphTitle,
    });
  }

  sources.push({
    type: "MVP limitation",
    label: "No broad web search, certification lookup, or independent source verification in this version",
  });

  return sources;
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

  unknowns.push("Factory, supplier, and third-party certification evidence were not independently verified.");

  return unknowns;
}

function buildPartialReport(productUrl, retailer, note, productPageSnapshot) {
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      analysisMode: "live-fetch-v1",
      productUrl,
      retailer,
      productPageSnapshot,
    },
    report: {
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
      washingCareAdvice: {
        summary: "Check the garment care label directly before washing. This report could not confirm page-level care instructions.",
        confidence: "Low",
      },
      transparencyScore: {
        score: 10,
        outOf: 100,
        rationale: "Low score because the product page could not be reliably extracted.",
      },
      claimStrengthScore: {
        score: 10,
        outOf: 100,
        rationale: "No claim strength can be established when the page content is not reliably available.",
      },
      conclusion: "No reliable product-level transparency assessment could be made from the fetched page content.",
      sources: [
        {
          type: "Product URL submitted by user",
          label: productUrl,
        },
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
    },
  };
}

async function fetchHtml(productUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(productUrl, {
      headers: {
        "User-Agent": "ProductPassportAgentMVP/0.1 (+public-page-fetch)",
        "Accept-Language": "en-US,en;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      throw new Error("URL did not return an HTML page");
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
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

  let html;
  let productPageSnapshot;

  try {
    html = await fetchHtml(productUrl);
  } catch (error) {
    productPageSnapshot = createFailedProductPageSnapshot(
      productUrl,
      error.message || "unable to fetch product page"
    );
    return buildPartialReport(productUrl, retailer, fallbackNote, productPageSnapshot);
  }

  productPageSnapshot = extractProductPageSnapshot(html, productUrl);

  const extracted = {
    openGraphTitle: extractMetaContent(html, "property", "og:title"),
    twitterTitle: extractMetaContent(html, "name", "twitter:title"),
    metaDescription: extractMetaContent(html, "name", "description"),
    openGraphDescription: extractMetaContent(html, "property", "og:description"),
    pageTitle: extractTitle(html),
  };

  const bodyText = stripTags(html);
  const snippets = splitIntoSnippets(bodyText).slice(0, 400);
  const materialMatches = findKeywordMatches(snippets, materialKeywords);
  const claimMatches = findKeywordMatches(snippets, sustainabilityKeywords);
  const careMatches = findKeywordMatches(snippets, careKeywords);
  const originMatches = findKeywordMatches(snippets, originKeywords);
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

  const primaryMaterial = materialMatches[0] ? materialMatches[0].keyword : "Material not clearly identified";
  const materialConfidence = materialMatches.length > 0 ? "Medium" : "Low";
  const claims = buildClaims(claimMatches);
  const transparencyScore = calculateTransparencyScore(
    materialMatches,
    originMatches,
    careMatches,
    pageReadable
  );
  const claimStrengthScore = calculateClaimStrengthScore(claims);
  const note = materialMatches.length === 0 && claims.length === 0 && careMatches.length === 0
    ? fallbackNote
    : undefined;

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      analysisMode: "live-fetch-v1",
      productUrl,
      retailer,
      productPageSnapshot,
    },
    report: {
      note,
      productSummary: cleanText(
        [title, description, visibleProductText]
          .filter(Boolean)
          .join(" ")
      ) || `${retailer} product page fetched, but only limited descriptive text was visible.`,
      materialExplained: {
        rawMaterial: primaryMaterial,
        simpleExplanation: materialMatches.length > 0
          ? materialExplanation(primaryMaterial)
          : "No clear material wording was found in the fetched page text, so the composition remains uncertain.",
        confidence: materialConfidence,
      },
      sustainabilityClaimsFound: claims,
      productionOriginTransparency: {
        status: originMatches.length > 0 ? "Found some visible origin-related wording" : "Not found",
        detail: originMatches.length > 0
          ? originMatches[0].snippet
          : "No clear product-level country-of-origin, factory, or traceability text was found in the fetched page content.",
        confidence: originMatches.length > 0 ? "Medium" : "Low",
      },
      washingCareAdvice: {
        summary: careMatches.length > 0
          ? careMatches[0].snippet
          : "No clear care instructions were detected in the fetched page text. Check the garment label before washing.",
        confidence: careMatches.length > 0 ? "Medium" : "Low",
      },
      transparencyScore: {
        score: transparencyScore,
        outOf: 100,
        rationale: "This score reflects only what was visible on the fetched product page, without external verification.",
      },
      claimStrengthScore: {
        score: claimStrengthScore,
        outOf: 100,
        rationale: claims.length > 0
          ? "Claims were found on the page, but they remain brand claims unless independently verified."
          : "No clear sustainability claim text was found on the fetched page.",
      },
      conclusion: claims.length > 0
        ? "Some claim-like wording was visible on the product page, but this MVP treats it as brand-provided information rather than verified proof."
        : "The fetched page provided limited transparency detail and no clearly extractable verified sustainability evidence.",
      sources: buildSources(productUrl, extracted),
      unknowns: buildUnknowns(materialMatches, originMatches, careMatches, claims),
    },
  };
}

module.exports = {
  analyzeProductUrl,
};
