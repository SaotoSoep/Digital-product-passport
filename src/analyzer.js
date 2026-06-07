const { URL } = require("url");
const {
  createFailedProductPageSnapshot,
  extractProductPageSnapshot,
} = require("./lib/product-page/snapshot");
const { buildProductPageEvidence } = require("./lib/product-passport/evidence");
const { buildPassportReadiness } = require("./lib/product-passport/readiness");

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

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
    label: "No broad web search, external registry lookup, or independent source check in this version",
  });

  return sources;
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
          topic: candidate.topic,
          label: candidate.label || candidate.topic,
          url: candidate.url,
          snippets,
          note: source.note,
        };
      } catch (error) {
        return {
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
      sourceLabel: "MVP keyword fallback",
      note: "Derived from the report's lightweight keyword analysis, not from the normalized product-page field.",
    };
  }

  const claimValues = (report.sustainabilityClaimsFound || [])
    .map((claim) => claim.brandClaim || claim.claim)
    .filter(isUsefulFallbackValue);

  if (claimValues.length > 0) {
    fallbackByKey.sustainabilityClaims = {
      values: claimValues,
      sourceLabel: "MVP claim fallback",
      note: "Shown separately because the report detected claim-like wording outside the normalized snapshot field.",
    };
  }

  if (isUsefulFallbackValue(report.washingCareAdvice && report.washingCareAdvice.summary)) {
    fallbackByKey.careText = {
      values: [report.washingCareAdvice.summary],
      sourceLabel: "MVP care fallback",
      note: "Derived from the report's lightweight care-text scan, not from the normalized product-page field.",
    };
  }

  if (isUsefulFallbackValue(report.productionOriginTransparency && report.productionOriginTransparency.detail)) {
    fallbackByKey.productionOrigin = {
      values: [report.productionOriginTransparency.detail],
      sourceLabel: "MVP origin fallback",
      note: "Derived from the report's lightweight origin scan, not from the normalized product-page field.",
    };
  }

  if (isUsefulFallbackValue(report.supplierTransparency && report.supplierTransparency.detail)) {
    fallbackByKey.supplierDetails = {
      values: [report.supplierTransparency.detail],
      sourceLabel: "MVP supplier fallback",
      note: "Derived from the report's lightweight supplier scan, not from the normalized product-page field.",
    };
  }

  return fallbackByKey;
}

function withProductPageEvidence(report, productPageSnapshot) {
  const productPageEvidence = buildProductPageEvidence(
    productPageSnapshot,
    collectReportFallbacks(report)
  );

  return {
    ...report,
    productPageEvidence,
    passportReadiness: buildPassportReadiness(productPageEvidence, productPageSnapshot),
  };
}

function buildPartialReport(productUrl, retailer, note, productPageSnapshot, brandInsight = null, accessDiagnostics = null) {
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
    },
    report: withProductPageEvidence(report, productPageSnapshot),
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
    return buildPartialReport(
      productUrl,
      retailer,
      error.accessIssue ? error.accessIssue.detail : fallbackNote,
      productPageSnapshot,
      brandInsight,
      error.accessIssue || null
    );
  }

  productPageSnapshot = extractProductPageSnapshot(html, productUrl);

  const extracted = {
    openGraphTitle: extractMetaContent(html, "property", "og:title"),
    twitterTitle: extractMetaContent(html, "name", "twitter:title"),
    metaDescription: extractMetaContent(html, "name", "description"),
    openGraphDescription: extractMetaContent(html, "property", "og:description"),
    pageTitle: extractTitle(html),
  };

  const visibleHtml = removeNonVisibleMarkup(html);
  const bodyText = stripTags(visibleHtml);
  const snippets = uniqueSnippets([
    ...extractTextBlocks(visibleHtml),
    ...splitIntoSnippets(bodyText),
  ], 400);
  const materialMatches = findKeywordMatches(snippets, materialKeywords);
  const claimMatches = findKeywordMatches(
    prioritizeSustainabilitySnippets(snippets),
    sustainabilityKeywords
  );
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

  const snapshotMaterials = productPageSnapshot.materialCompositionText || [];
  const snapshotCareText = productPageSnapshot.careText || [];
  const snapshotOriginText = productPageSnapshot.originText || [];
  const snapshotSupplierText = productPageSnapshot.supplierDetailText || [];
  const materialEvidence = snapshotMaterials.length > 0
    ? snapshotMaterials
    : materialMatches.map((match) => match.snippet);
  const careEvidence = snapshotCareText.length > 0
    ? snapshotCareText
    : careMatches.map((match) => match.snippet);
  const originEvidence = snapshotOriginText.length > 0
    ? snapshotOriginText
    : originMatches.map((match) => match.snippet);
  const supplierEvidence = snapshotSupplierText.length > 0
    ? snapshotSupplierText
    : originEvidence.filter((value) => /supplier|factory|address|employees|workers|leverancier|fabriek/i.test(value));
  const primaryMaterial = snapshotMaterials[0] || (materialMatches[0] ? materialMatches[0].keyword : "Material not clearly identified");
  const materialConfidence = snapshotMaterials.length > 0
    ? "High"
    : materialMatches.length > 0
      ? "Medium"
      : "Low";
  const claims = buildClaims(claimMatches);
  const brandInsight = await withTimeout(
    fetchBrandInsight({
      brand: productPageSnapshot.likelyBrand,
      productUrl,
      productHtml: html,
    }),
    6500,
    brandInsightTimeoutFallback(productPageSnapshot.likelyBrand)
  );
  const transparencyScore = calculateTransparencyScore(
    materialEvidence,
    originEvidence,
    careEvidence,
    pageReadable
  );
  const claimStrengthScore = calculateClaimStrengthScore(claims);
  const note = materialMatches.length === 0 && claims.length === 0 && careMatches.length === 0
    ? fallbackNote
    : undefined;

  const report = {
    note,
    productSummary: cleanText(
      [title, description, visibleProductText]
        .filter(Boolean)
        .join(" ")
    ) || `${retailer} product page fetched, but only limited descriptive text was visible.`,
    materialExplained: {
      rawMaterial: primaryMaterial,
      simpleExplanation: materialEvidence.length > 0
        ? materialExplanation(primaryMaterial)
        : "No clear material wording was found in the fetched page text, so the composition remains uncertain.",
      confidence: materialConfidence,
    },
    sustainabilityClaimsFound: claims,
    productionOriginTransparency: {
      status: originEvidence.length > 0 ? "Found some origin or manufacturing detail" : "Not found",
      detail: originEvidence.length > 0
        ? originEvidence[0]
        : "No clear product-level country-of-origin, factory, or traceability text was found in the fetched page content.",
      confidence: originEvidence.length > 0 ? "Medium" : "Low",
    },
    supplierTransparency: {
      status: supplierEvidence.length > 0 ? "Found supplier or factory detail" : "Not found",
      detail: supplierEvidence.length > 0
        ? supplierEvidence[0]
        : "No clear product-level supplier, factory, address, or employee-count information was found in the fetched page content.",
      confidence: supplierEvidence.length > 0 ? "Medium" : "Low",
    },
    washingCareAdvice: {
      summary: careEvidence.length > 0
        ? careEvidence[0]
        : "No clear care instructions were detected in the fetched page text. Check the garment label before washing.",
      confidence: careEvidence.length > 0 ? "Medium" : "Low",
    },
    brandInsight,
    transparencyScore: {
      score: transparencyScore,
      outOf: 100,
      rationale: "This score reflects only what was visible on the fetched product page, without an external source check.",
    },
    claimStrengthScore: {
      score: claimStrengthScore,
      outOf: 100,
      rationale: claims.length > 0
        ? "Claims were found on the page, but they remain brand-provided information unless checked against independent evidence."
        : "No clear sustainability claim text was found on the fetched page.",
    },
    conclusion: claims.length > 0
      ? "Some claim-like wording was visible on the product page, but this MVP treats it as brand-provided information rather than external proof."
      : "The fetched page provided limited transparency detail and no clearly extractable independent sustainability evidence.",
    sources: buildSources(productUrl, extracted),
    unknowns: buildUnknowns(materialEvidence, originEvidence, careEvidence, claims),
  };

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      analysisMode: "live-fetch-v1",
      productUrl,
      retailer,
      productPageSnapshot,
    },
    report: withProductPageEvidence(report, productPageSnapshot),
  };
}

module.exports = {
  analyzeProductUrl,
};
