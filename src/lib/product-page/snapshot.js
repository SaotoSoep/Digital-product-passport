const PRODUCT_NAME_KEYWORDS = [
  "shirt",
  "dress",
  "jacket",
  "jeans",
  "trousers",
  "coat",
  "skirt",
  "top",
  "sweater",
  "hoodie",
  "blazer",
  "overshirt",
  "cardigan",
];

const MATERIAL_KEYWORDS = [
  "composition",
  "material",
  "materials",
  "fabric",
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

const CARE_KEYWORDS = [
  "care",
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

const SUSTAINABILITY_KEYWORDS = [
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

function cleanText(text) {
  return decodeHtmlEntities(String(text || ""))
    .replace(/\s+/g, " ")
    .trim();
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

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTitle(html) {
  const titleMatch = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(titleMatch ? titleMatch[1] : "");
}

function extractMetaContent(html, attribute, key) {
  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${escapeRegex(key)}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>|<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+${attribute}=["']${escapeRegex(key)}["'][^>]*>`,
    "i"
  );
  const match = String(html || "").match(pattern);
  return cleanText(match ? match[1] || match[2] : "");
}

function extractCanonicalUrl(html, sourceUrl) {
  const match = String(html || "").match(
    /<link[^>]+rel=["'][^"']*\bcanonical\b[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>|<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*\bcanonical\b[^"']*["'][^>]*>/i
  );
  const href = cleanText(match ? match[1] || match[2] : "");

  if (!href) {
    return "not_found";
  }

  try {
    return new URL(href, sourceUrl).toString();
  } catch (error) {
    return href;
  }
}

function extractJsonLdValues(html, sourceUrl) {
  const scripts = [...String(html || "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const values = {
    name: "",
    brand: "",
    description: "",
  };

  function visit(node) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const type = Array.isArray(node["@type"]) ? node["@type"].join(" ") : node["@type"];
    const isProduct = String(type || "").toLowerCase().includes("product");

    if (isProduct) {
      if (!values.name && typeof node.name === "string") {
        values.name = cleanText(node.name);
      }

      if (!values.description && typeof node.description === "string") {
        values.description = cleanText(node.description);
      }

      if (!values.brand) {
        if (typeof node.brand === "string") {
          values.brand = cleanText(node.brand);
        } else if (node.brand && typeof node.brand.name === "string") {
          values.brand = cleanText(node.brand.name);
        }
      }
    }

    Object.values(node).forEach(visit);
  }

  for (const script of scripts) {
    try {
      visit(JSON.parse(decodeHtmlEntities(script[1])));
    } catch (error) {
      continue;
    }
  }

  return values;
}

function splitIntoSnippets(text) {
  return cleanText(text)
    .split(/(?<=[.!?])\s+|\n+|\s{2,}/)
    .map((snippet) => cleanText(snippet))
    .filter((snippet) => snippet.length >= 12 && snippet.length <= 320);
}

function findSnippets(snippets, keywords, limit = 3) {
  const matches = [];
  const seen = new Set();

  for (const snippet of snippets) {
    const normalized = snippet.toLowerCase();
    const hasKeyword = keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));

    if (hasKeyword && !seen.has(normalized)) {
      matches.push(snippet);
      seen.add(normalized);
    }

    if (matches.length >= limit) {
      break;
    }
  }

  return matches;
}

function extractHeadings(html) {
  return [...String(html || "").matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((match) => stripTags(match[1]))
    .filter(Boolean);
}

function pickProductName({ jsonLdName, openGraphTitle, twitterTitle, headings, pageTitle }) {
  const candidates = [jsonLdName, openGraphTitle, twitterTitle, headings[0], pageTitle]
    .map(cleanText)
    .filter(Boolean);

  return candidates[0] || "not_found";
}

function pickBrand({ jsonLdBrand, brandMeta, snippets }) {
  if (jsonLdBrand) {
    return jsonLdBrand;
  }

  if (brandMeta) {
    return brandMeta;
  }

  const brandSnippet = snippets.find((snippet) => /^brand\s*[:\-]/i.test(snippet));
  if (!brandSnippet) {
    return "not_found";
  }

  return cleanText(brandSnippet.replace(/^brand\s*[:\-]\s*/i, "")) || "not_found";
}

function determineStatus(snapshot) {
  const foundCount = [
    snapshot.pageTitle,
    snapshot.canonicalUrl,
    snapshot.likelyProductName,
    snapshot.likelyBrand,
    snapshot.materialCompositionText.length ? "found" : "",
    snapshot.careText.length ? "found" : "",
    snapshot.sustainabilityClaimSnippets.length ? "found" : "",
  ].filter((value) => value && value !== "not_found").length;

  if (foundCount >= 4) {
    return "success";
  }

  if (foundCount > 0) {
    return "partial";
  }

  return "failed";
}

function buildNotes(snapshot) {
  const notes = [];
  const fields = [
    ["page title", snapshot.pageTitle],
    ["canonical URL", snapshot.canonicalUrl],
    ["likely product name", snapshot.likelyProductName],
    ["likely brand", snapshot.likelyBrand],
  ];

  for (const [label, value] of fields) {
    notes.push(`${label}: ${value && value !== "not_found" ? "found" : "not_found"}`);
  }

  notes.push(`material/composition text: ${snapshot.materialCompositionText.length ? "found" : "not_found"}`);
  notes.push(`care text: ${snapshot.careText.length ? "found" : "not_found"}`);
  notes.push(`sustainability claim snippets: ${snapshot.sustainabilityClaimSnippets.length ? "found" : "not_found"}`);

  return notes;
}

function createFailedProductPageSnapshot(sourceUrl, reason, now = new Date()) {
  return {
    sourceUrl,
    extractionTimestamp: now.toISOString(),
    extractionStatus: "failed",
    pageTitle: "not_found",
    canonicalUrl: "not_found",
    likelyProductName: "not_found",
    likelyBrand: "not_found",
    materialCompositionText: [],
    careText: [],
    sustainabilityClaimSnippets: [],
    extractionNotes: [`extraction failed: ${reason || "unable to fetch or parse product page"}`],
  };
}

function extractProductPageSnapshot(html, sourceUrl, now = new Date()) {
  const bodyText = stripTags(html);
  const snippets = splitIntoSnippets(bodyText).slice(0, 500);
  const pageTitle = extractTitle(html) || "not_found";
  const openGraphTitle = extractMetaContent(html, "property", "og:title");
  const twitterTitle = extractMetaContent(html, "name", "twitter:title");
  const brandMeta = extractMetaContent(html, "property", "product:brand") || extractMetaContent(html, "name", "brand");
  const jsonLd = extractJsonLdValues(html, sourceUrl);
  const headings = extractHeadings(html);

  const snapshot = {
    sourceUrl,
    extractionTimestamp: now.toISOString(),
    extractionStatus: "partial",
    pageTitle,
    canonicalUrl: extractCanonicalUrl(html, sourceUrl),
    likelyProductName: pickProductName({
      jsonLdName: jsonLd.name,
      openGraphTitle,
      twitterTitle,
      headings,
      pageTitle,
    }),
    likelyBrand: pickBrand({
      jsonLdBrand: jsonLd.brand,
      brandMeta,
      snippets,
    }),
    materialCompositionText: findSnippets(snippets, MATERIAL_KEYWORDS),
    careText: findSnippets(snippets, CARE_KEYWORDS),
    sustainabilityClaimSnippets: findSnippets(snippets, SUSTAINABILITY_KEYWORDS),
    extractionNotes: [],
  };

  snapshot.extractionStatus = determineStatus(snapshot);
  snapshot.extractionNotes = buildNotes(snapshot);

  return snapshot;
}

async function fetchProductPageSnapshot(productUrl, fetchImpl = fetch, now = new Date()) {
  if (!fetchImpl) {
    return createFailedProductPageSnapshot(productUrl, "fetch is unavailable", now);
  }

  const response = await fetchImpl(productUrl, {
    headers: {
      "User-Agent": "ProductPassportAgentMVP/0.1 (+public-page-fetch)",
      "Accept-Language": "en-US,en;q=0.8",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    return createFailedProductPageSnapshot(productUrl, `request failed with status ${response.status}`, now);
  }

  const contentType = response.headers && typeof response.headers.get === "function"
    ? response.headers.get("content-type") || ""
    : "";

  if (!contentType.includes("text/html")) {
    return createFailedProductPageSnapshot(productUrl, "URL did not return an HTML page", now);
  }

  const html = await response.text();
  return extractProductPageSnapshot(html, productUrl, now);
}

module.exports = {
  CARE_KEYWORDS,
  MATERIAL_KEYWORDS,
  SUSTAINABILITY_KEYWORDS,
  cleanText,
  createFailedProductPageSnapshot,
  extractProductPageSnapshot,
  fetchProductPageSnapshot,
  stripTags,
};
