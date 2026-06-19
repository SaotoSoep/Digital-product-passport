const PRODUCT_NAME_KEYWORDS = [
  "shirt",
  "broek",
  "dress",
  "jurk",
  "jacket",
  "jas",
  "jeans",
  "trousers",
  "coat",
  "skirt",
  "rok",
  "top",
  "sweater",
  "trui",
  "hoodie",
  "blazer",
  "overshirt",
  "cardigan",
];

const MATERIAL_LABEL_KEYWORDS = [
  "composition",
  "material composition",
  "materiaalsamenstelling",
  "material:",
  "materials:",
  "materiaal:",
  "fabric:",
  "stof:",
];

const MATERIAL_TERMS = [
  "organic cotton",
  "biologisch katoen",
  "recycled polyester",
  "gerecycled polyester",
  "natural fibres",
  "natural fibers",
  "natuurlijke vezels",
  "polyamide",
  "elastane",
  "elasthane",
  "elastaan",
  "spandex",
  "polyester",
  "viscose",
  "cotton",
  "katoen",
  "linen",
  "linnen",
  "lyocell",
  "tencel",
  "modal",
  "acrylic",
  "acryl",
  "wool",
  "wol",
  "nylon",
  "leather",
  "leer",
  "hemp",
  "hennep",
  "silk",
  "zijde",
  "cashmere",
  "kasjmier",
];

const MATERIAL_KEYWORDS = [
  ...MATERIAL_LABEL_KEYWORDS,
  ...MATERIAL_TERMS,
];

const CARE_KEYWORDS = [
  "care",
  "onderhoud",
  "wasvoorschrift",
  "machine wash",
  "tumble dry",
  "dry clean",
  "washing",
  "wassen",
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

const ORIGIN_KEYWORDS = [
  "made in",
  "country of origin",
  "manufactured",
  "factory",
  "supplier",
  "traceable",
  "origin",
  "production",
  "geproduceerd",
  "gemaakt in",
  "herkomst",
  "fabriek",
  "leverancier",
];

const SUPPLIER_DETAIL_KEYWORDS = [
  "materials and suppliers",
  "supplier",
  "leverancier",
  "factory",
  "fabriek",
  "country",
  "country of production",
  "production country",
  "address",
  "employees",
  "workers",
  "noofworkers",
  "no. of workers",
];

const SUPPLIER_LABEL_KEYWORDS = [
  "supplier",
  "leverancier",
  "country",
  "factory",
  "fabriek",
  "address",
  "employees",
  "workers",
];

const SUSTAINABILITY_KEYWORDS = [
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

const SUSTAINABILITY_LABEL_KEYWORDS = [
  "sustainability",
  "duurzaamheid",
  "sustainable",
  "duurzaam",
  "responsible",
  "verantwoord",
  "conscious",
  "lower impact",
  "traceable",
  "vegan",
  "eco",
];

const CERTIFICATION_KEYWORDS = [
  "certified",
  "certificate",
  "certification",
  "gecertificeerd",
  "certificaat",
  "gots",
  "global organic textile standard",
  "oeko-tex",
  "oeko tex",
  "standard 100",
  "bluesign",
  "fair wear",
  "fairtrade",
  "bci",
  "better cotton",
  "cradle to cradle",
  "grs",
  "global recycled standard",
  "rws",
  "responsible wool standard",
];

const DURABILITY_KEYWORDS = [
  "durable",
  "durability",
  "long-lasting",
  "long lasting",
  "repair",
  "repairable",
  "warranty",
  "guarantee",
  "reinforced",
  "abrasion",
  "wear test",
  "heavyweight",
  "stevige",
  "duurzaam in gebruik",
  "reparatie",
  "garantie",
  "versterkt",
  "slijtvast",
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
    .replace(/&reg;/gi, "®")
    .replace(/&trade;/gi, "™")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function cleanText(text) {
  return decodeHtmlEntities(String(text || ""))
    .replace(/\s+/g, " ")
    .trim();
}

function cleanProductDescriptionText(value) {
  const text = cleanText(value)
    .replace(/([a-z)])([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+(?=(Hook, bar|Machine wash|Inside leg|Model wears|Relaxed fit)\b)/g, " ");
  const parts = text.split(/(?<=[.!?])\s+/);
  const seen = new Set();
  const uniqueParts = [];

  for (const part of parts) {
    const cleaned = cleanText(part);
    const key = cleaned.toLowerCase();

    if (!cleaned || seen.has(key)) {
      continue;
    }

    uniqueParts.push(cleaned);
    seen.add(key);
  }

  return uniqueParts.join(" ");
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

function extractScriptBlocks(html) {
  const source = String(html || "");
  const lower = source.toLowerCase();
  const scripts = [];
  let index = 0;

  while (index < source.length) {
    const start = lower.indexOf("<script", index);
    if (start === -1) {
      break;
    }

    const openEnd = lower.indexOf(">", start);
    if (openEnd === -1) {
      break;
    }

    const closeStart = lower.indexOf("</script>", openEnd + 1);
    if (closeStart === -1) {
      break;
    }

    scripts.push({
      attrs: source.slice(start + "<script".length, openEnd),
      content: source.slice(openEnd + 1, closeStart),
    });

    index = closeStart + "</script>".length;
  }

  return scripts;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTitle(html) {
  const titleMatch = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
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
  const scripts = extractScriptBlocks(html)
    .filter((script) => /type=["']application\/ld\+json["']/i.test(script.attrs));
  const values = {
    name: "",
    brand: "",
    description: "",
    material: "",
    origin: "",
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

      if (!values.material) {
        if (typeof node.material === "string") {
          values.material = cleanText(node.material);
        } else if (Array.isArray(node.material)) {
          values.material = node.material.map(cleanText).filter(Boolean).join(", ");
        }
      }

      if (!values.origin) {
        if (typeof node.countryOfOrigin === "string") {
          values.origin = cleanText(node.countryOfOrigin);
        } else if (node.countryOfOrigin && typeof node.countryOfOrigin.name === "string") {
          values.origin = cleanText(node.countryOfOrigin.name);
        }
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
      visit(JSON.parse(decodeHtmlEntities(script.content)));
    } catch (error) {
      continue;
    }
  }

  return values;
}

function parseJsonValue(value) {
  const text = decodeHtmlEntities(String(value || "")).trim();

  if (!text || !/^[\[{]/.test(text)) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function parseNestedJson(value) {
  if (typeof value !== "string") {
    return value;
  }

  const parsed = parseJsonValue(value);
  return parsed || value;
}

function productCandidateScore(candidate, sourcePath, sourceUrl) {
  let score = 0;
  const sourcePathname = new URL(sourceUrl).pathname.toLowerCase();
  const candidateUri = cleanText(candidate.uri || candidate.url || "").toLowerCase();

  if (candidate.sku || candidate.productSku || candidate.product) score += 2;
  if (candidate.name || candidate.defaultName) score += 2;
  if (candidate.brandName || candidate.brand) score += 2;
  if (candidate.variantName || candidate.defaultVariantName) score += 1;
  if (candidate.price || candidate.priceAsNumber) score += 1;
  if (candidate.var_article_description_desc || candidate.descriptionHtml) score += 3;
  if (candidate.var_material_composition_desc) score += 7;
  if (candidate.var_supplier_info_desc) score += 7;
  if (candidate.var_care_instruction) score += 4;
  if (candidate.items && Array.isArray(candidate.items)) score += 3;
  if (candidateUri && sourcePathname.includes(candidateUri.replace(/^\//, ""))) score += 4;
  if (/relatedProducts\[\d+\]/.test(sourcePath)) score -= 7;

  return score;
}

function directProductCandidates(parsed) {
  const candidates = [];
  const pageProps = parsed && (
    parsed.pageProps ||
    (parsed.props && parsed.props.pageProps)
  );

  if (!pageProps || typeof pageProps !== "object") {
    return candidates;
  }

  if (pageProps.product && typeof pageProps.product === "object") {
    candidates.push({ path: "pageProps.product", node: pageProps.product });
  }

  if (Array.isArray(pageProps.blocks)) {
    pageProps.blocks.forEach((block, index) => {
      if (block && block.product && typeof block.product === "object") {
        candidates.push({
          path: `pageProps.blocks[${index}].product`,
          node: block.product,
        });
      }
    });
  }

  return candidates;
}

function findEmbeddedProductCandidate(html, sourceUrl) {
  const scripts = extractScriptBlocks(html);
  const candidates = [];
  let visitedNodes = 0;
  const maxVisitedNodes = 5000;

  function visit(node, path) {
    if (!node || typeof node !== "object" || visitedNodes >= maxVisitedNodes) {
      return;
    }

    visitedNodes += 1;

    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(parseNestedJson(item), `${path}[${index}]`));
      return;
    }

    const hasProductShape = [
      "sku",
      "productSku",
      "product",
      "name",
      "brandName",
      "variantName",
      "var_material_composition_desc",
      "var_supplier_info_desc",
      "var_care_instruction",
    ].filter((key) => Object.prototype.hasOwnProperty.call(node, key)).length;

    if (hasProductShape >= 3) {
      candidates.push({
        score: productCandidateScore(node, path, sourceUrl),
        node,
      });
    }

    for (const [key, value] of Object.entries(node)) {
      if (/navbar|menu|footer|category|categories|faceted|sizeGuide|countryConfig|appConfigs/i.test(key)) {
        continue;
      }

      visit(parseNestedJson(value), `${path}.${key}`);
    }
  }

  for (const script of scripts) {
    const attrs = script.attrs || "";
    const content = script.content || "";
    const looksLikeJsonScript = /type=["']application\/(?:json|ld\+json)["']/i.test(attrs) ||
      /id=["']__NEXT_DATA__["']/i.test(attrs);
    const parsed = looksLikeJsonScript ? parseJsonValue(content) : null;

    if (parsed) {
      const directCandidates = directProductCandidates(parsed)
        .map((candidate) => ({
          score: productCandidateScore(candidate.node, candidate.path, sourceUrl),
          node: candidate.node,
        }));
      const bestDirectCandidate = directCandidates
        .sort((a, b) => b.score - a.score)[0];

      if (bestDirectCandidate && bestDirectCandidate.score > 0) {
        return bestDirectCandidate.node;
      }

      candidates.push(...directCandidates);
      visit(parsed, "script");
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] && candidates[0].score > 0 ? candidates[0].node : null;
}

function parseMaterialComposition(value) {
  const parsed = parseNestedJson(value);
  const groups = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  const rows = [];

  for (const group of groups) {
    if (!group || typeof group !== "object") {
      continue;
    }

    const materials = Array.isArray(group.materials) ? group.materials : [];
    const materialText = materials
      .map((item) => {
        if (!item || typeof item !== "object") {
          return "";
        }

        const material = cleanText(item.material || item.name || "");
        const percentage = item.percentage !== undefined && item.percentage !== null
          ? `${item.percentage}%`
          : "";

        return cleanText([percentage, material].filter(Boolean).join(" "));
      })
      .filter(Boolean)
      .join(", ");

    if (materialText) {
      rows.push(cleanText([group.type, materialText].filter(Boolean).join(": ")));
    }
  }

  if (rows.length > 0) {
    return rows;
  }

  return typeof parsed === "string" ? [cleanText(parsed)].filter(Boolean) : [];
}

function parseSupplierInfo(value) {
  const parsed = parseNestedJson(value);
  const suppliers = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];

  return suppliers
    .map((supplier) => {
      if (!supplier || typeof supplier !== "object") {
        return "";
      }

      const address = supplier.address || {};
      const addressParts = [
        address.addressStreetLine1,
        address.addressStreetLine2,
        address.postalCode,
        address.city,
        address.countryName,
      ].map(cleanText).filter(Boolean);
      const factory = cleanText(supplier.factoryName || supplier.suppliername || "");
      const supplierName = cleanText(supplier.suppliername || "");
      const workers = supplier.noOfWorkers
        ? `${supplier.noOfWorkers} workers`
        : "";

      return cleanText([
        factory ? `Factory: ${factory}` : "",
        supplierName && supplierName !== factory ? `Supplier: ${supplierName}` : "",
        addressParts.length ? `Address: ${addressParts.join(", ")}` : "",
        workers,
      ].filter(Boolean).join("; "));
    })
    .filter(Boolean);
}

function normalizeSupplierInfo(value) {
  const parsed = parseNestedJson(value);
  const suppliers = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];

  return suppliers
    .map((supplier) => {
      if (!supplier || typeof supplier !== "object") {
        return null;
      }

      const address = supplier.address || {};
      const addressParts = [
        address.addressStreetLine1,
        address.addressStreetLine2,
        address.postalCode,
        address.city,
        address.countryName,
      ].map(cleanText).filter(Boolean);

      return {
        supplierName: cleanText(supplier.suppliername || ""),
        factoryName: cleanText(supplier.factoryName || ""),
        country: cleanText(address.countryName || ""),
        address: addressParts.join(", "),
        employees: supplier.noOfWorkers ? String(supplier.noOfWorkers) : "",
      };
    })
    .filter(Boolean);
}

function buildSupplierDetailText(supplierDetails) {
  return (supplierDetails || [])
    .map((supplier) => cleanText([
      supplier.supplierName ? `Supplier: ${supplier.supplierName}` : "",
      supplier.country ? `Country: ${supplier.country}` : "",
      supplier.factoryName ? `Factory: ${supplier.factoryName}` : "",
      supplier.address ? `Address: ${supplier.address}` : "",
      supplier.employees ? `Employees: ${supplier.employees}` : "",
    ].filter(Boolean).join("; ")))
    .filter(Boolean);
}

function buildProductionOriginText(supplierDetails) {
  return (supplierDetails || [])
    .map((supplier) => cleanText([
      supplier.country ? `Country: ${supplier.country}` : "",
      supplier.factoryName ? `Factory: ${supplier.factoryName}` : "",
    ].filter(Boolean).join("; ")))
    .filter(Boolean);
}

function buildProductionOriginTextFromRows(rows) {
  return (rows || [])
    .map((row) => {
      const facts = {};
      const pattern = /(?:^|;\s*)(Country|Factory):\s*(.*?)(?=;\s*(?:Supplier|Country|Factory|Address|Employees|Workers):|$)/gi;

      for (const match of cleanText(row).matchAll(pattern)) {
        facts[match[1].toLowerCase()] = cleanText(match[2]);
      }

      return cleanText([
        facts.country ? `Country: ${facts.country}` : "",
        facts.factory ? `Factory: ${facts.factory}` : "",
      ].filter(Boolean).join("; "));
    })
    .filter(Boolean);
}

function parseGtinValues(value) {
  const parsed = parseNestedJson(value);
  const values = [];

  function visit(node) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (node.GTIN) {
      values.push(cleanText(node.GTIN));
    }

    Object.values(node).forEach((item) => visit(parseNestedJson(item)));
  }

  visit(parsed);
  return uniqueValues(values, 8);
}

function stripInlineHtml(value) {
  return stripTags(String(value || ""));
}

function normalizeEmbeddedProductData(candidate) {
  if (!candidate) {
    return null;
  }

  const materialComposition = parseMaterialComposition(candidate.var_material_composition_desc);
  const supplierInfo = parseSupplierInfo(candidate.var_supplier_info_desc);
  const supplierDetails = normalizeSupplierInfo(candidate.var_supplier_info_desc);
  const gtins = parseGtinValues(candidate.var_gtin_desc);
  const itemIdentifiers = Array.isArray(candidate.items)
    ? candidate.items
      .map((item) => {
        const size = cleanText(item.name || "");
        const sku = cleanText(item.sku || item.ean || "");
        return cleanText([size, sku].filter(Boolean).join(": "));
      })
      .filter(Boolean)
    : [];
  const color = cleanText(candidate.variantName || candidate.defaultVariantName || candidate.var_colour_desc_desc || candidate.var_pdp_color_desc || "");
  const colorHex = cleanText(candidate.var_colour_details_desc || (candidate.var_color && candidate.var_color.hex) || "");

  return {
    productId: cleanText(candidate.product || ""),
    sku: cleanText(candidate.sku || candidate.var_number_key || ""),
    productSku: cleanText(candidate.productSku || ""),
    gtins,
    itemIdentifiers,
    name: cleanText(candidate.name || candidate.defaultName || ""),
    brandName: cleanText(candidate.brandName || candidate.pr_external_brand || ""),
    variantName: color,
    colorHex,
    price: cleanText(candidate.price || ""),
    netWeight: cleanText(candidate.var_net_weight_desc || ""),
    weightUnit: cleanText(candidate.var_weight_unit || ""),
    season: cleanText(candidate.var_season_desc || ""),
    productDescription: cleanProductDescriptionText(stripInlineHtml(
      candidate.var_article_description_desc ||
      candidate.pr_long_description_desc ||
      candidate.descriptionHtml ||
      candidate.description ||
      ""
    )),
    materialComposition,
    supplierInfo,
    supplierDetails,
    careInstructions: Array.isArray(candidate.var_care_instruction)
      ? uniqueValues(candidate.var_care_instruction, 8)
      : uniqueValues([candidate.var_care_instruction], 8),
  };
}

function buildIdentifierText(embeddedProductData) {
  if (!embeddedProductData) {
    return [];
  }

  const values = [];

  if (embeddedProductData.sku) values.push(`Product no. ${embeddedProductData.sku}`);
  if (embeddedProductData.productSku) values.push(`Product SKU ${embeddedProductData.productSku}`);
  if (embeddedProductData.productId) values.push(`Internal product ID ${embeddedProductData.productId}`);
  if (embeddedProductData.gtins.length > 0) values.push(`GTIN: ${embeddedProductData.gtins.join(", ")}`);
  if (embeddedProductData.itemIdentifiers.length > 0) values.push(`Size identifiers: ${embeddedProductData.itemIdentifiers.join("; ")}`);

  return uniqueValues(values, 8);
}

function buildColorText(embeddedProductData) {
  if (!embeddedProductData) {
    return [];
  }

  return uniqueValues([
    embeddedProductData.variantName ? `Color: ${embeddedProductData.variantName}` : "",
    embeddedProductData.colorHex ? `Color reference: ${embeddedProductData.colorHex}` : "",
  ], 2);
}

function splitIntoSnippets(text) {
  return cleanText(text)
    .split(/(?<=[.!?])\s+|\n+|\s{2,}/)
    .map((snippet) => cleanText(snippet))
    .filter((snippet) => snippet.length >= 12 && snippet.length <= 320);
}

function extractTextBlocks(html) {
  return [...String(html || "").matchAll(/<(p|li|dd|dt|figcaption|td|th)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => stripTags(match[2]))
    .filter((snippet) => snippet.length >= 12 && snippet.length <= 320);
}

function findSnippets(snippets, keywords, limit = 3) {
  const matches = [];
  const seen = new Set();

  for (const snippet of snippets) {
    if (looksLikeNavigationSnippet(snippet)) {
      continue;
    }

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

function snippetHasSupplierDetailKeyword(snippet) {
  const normalized = cleanText(snippet).toLowerCase();
  if (
    /\bcountry of origin\b/.test(normalized) &&
    !/\b(supplier|leverancier|factory|fabriek|address|employees|workers)\b/.test(normalized)
  ) {
    return false;
  }

  return SUPPLIER_DETAIL_KEYWORDS.some((keyword) =>
    normalized.includes(keyword.toLowerCase())
  );
}

function looksLikeSupplierLabel(snippet) {
  const normalized = cleanText(snippet)
    .replace(/[:：]\s*$/, "")
    .toLowerCase();

  return SUPPLIER_LABEL_KEYWORDS.includes(normalized);
}

function extractTableLikeSupplierRows(html) {
  const rows = [];

  for (const rowMatch of String(html || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)]
      .map((match) => stripTags(match[1]))
      .filter(Boolean);
    const rowText = cleanText(cells.join(": "));

    if (cells.length >= 2 && snippetHasSupplierDetailKeyword(rowText)) {
      rows.push(rowText);
    }
  }

  for (const pairMatch of String(html || "").matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const rowText = cleanText(`${stripTags(pairMatch[1])}: ${stripTags(pairMatch[2])}`);

    if (snippetHasSupplierDetailKeyword(rowText)) {
      rows.push(rowText);
    }
  }

  return rows;
}

function extractSupplierPairsFromPlainText(text) {
  const normalized = cleanText(text);
  const labels = ["Supplier", "Country", "Factory", "Address", "Employees", "Workers"];
  const rows = [];

  for (const label of labels) {
    const otherLabels = labels
      .filter((otherLabel) => otherLabel !== label)
      .map(escapeRegex)
      .join("|");
    const pattern = new RegExp(`\\b${escapeRegex(label)}\\b\\s*:?\\s*([\\s\\S]{1,180}?)(?=\\s+\\b(?:${otherLabels})\\b\\s*:?|$)`, "i");
    const match = normalized.match(pattern);
    const value = cleanText(match && match[1]);

    if (value && !SUPPLIER_LABEL_KEYWORDS.includes(value.toLowerCase())) {
      rows.push(`${label}: ${value}`);
    }
  }

  return rows.length >= 2 ? rows : [];
}

function findSupplierDetailSnippets(html, snippets, bodyText, embeddedProductData, limit = 8) {
  const embeddedSupplierDetails = buildSupplierDetailText(
    embeddedProductData && embeddedProductData.supplierDetails
  );
  const tableRows = extractTableLikeSupplierRows(html);
  const plainTextRows = extractSupplierPairsFromPlainText(bodyText);
  const contextualRows = [];

  for (let index = 0; index < snippets.length; index += 1) {
    const snippet = cleanText(snippets[index]);
    if (!snippet) {
      continue;
    }

    if (snippetHasSupplierDetailKeyword(snippet)) {
      contextualRows.push(snippet);
    }

    if (looksLikeSupplierLabel(snippet)) {
      const value = cleanText(snippets[index + 1] || "");
      if (value && !looksLikeSupplierLabel(value)) {
        contextualRows.push(`${snippet}: ${value}`);
      }
    }
  }

  return uniqueValues([
    ...embeddedSupplierDetails,
    ...tableRows,
    ...plainTextRows,
    ...contextualRows,
  ], limit);
}

function findPrioritizedSnippets(snippets, primaryKeywords, fallbackKeywords, limit = 3) {
  const primaryMatches = findSnippets(snippets, primaryKeywords, limit);
  return primaryMatches.length > 0
    ? primaryMatches
    : findSnippets(snippets, fallbackKeywords, limit);
}

function uniqueValues(values, limit = 3) {
  const seen = new Set();
  const result = [];

  for (const value of values.map(cleanText).filter(Boolean)) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      result.push(value);
      seen.add(key);
    }

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function looksLikeNavigationSnippet(value) {
  const text = cleanText(value);

  if (!text) {
    return true;
  }

  const lower = text.toLowerCase();
  const colorCodeCount = (text.match(/\b\d{3}[A-Z]{3,}\b/g) || []).length;

  return (
    colorCodeCount >= 3 ||
    lower.includes("producten zoeken") ||
    lower.includes("uw browser ondersteunt") ||
    lower.includes("visuals may include") ||
    lower.includes("misschien vind je het ook leuk") ||
    lower.includes("see more - our blog") ||
    lower.includes("shop oska") ||
    lower.includes("skip to content") ||
    lower.includes("maattabel") ||
    lower.includes("stylecoaching") ||
    lower.includes("lookbook") ||
    lower.includes("winkels") ||
    /^(duurzaamheid|sustainability|quality|kwaliteit|kleuren|colours|videos|magazine|about)$/i.test(text)
  );
}

function findCompositionSnippets(snippets, limit = 3) {
  const exactCompositions = [];
  const genericCompositions = [];

  for (const snippet of snippets) {
    const text = cleanText(snippet);
    const composition = extractMaterialCompositionValue(text);

    if (!composition) {
      continue;
    }

    if (isGenericMaterialComposition(composition)) {
      genericCompositions.push(composition);
    } else {
      exactCompositions.push(composition);
    }
  }

  return uniqueValues(
    exactCompositions.length > 0 ? exactCompositions : genericCompositions,
    limit
  );
}

function extractMaterialCompositionValue(value) {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  const materialPattern = MATERIAL_TERMS
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|");
  const compositionPattern = new RegExp(`\\b(\\d{1,3}\\s*%\\s*(?:${materialPattern}))\\b`, "gi");
  const matches = [...text.matchAll(compositionPattern)]
    .map((match) => cleanText(match[1]).replace(/(\d{1,3})\s*%\s*/g, "$1% "))
    .filter(Boolean);

  return uniqueValues(matches, 8).join(", ");
}

function isGenericMaterialComposition(value) {
  const normalized = cleanText(value).toLowerCase();
  return /\b(natural fibres|natural fibers|natuurlijke vezels)\b/.test(normalized);
}

function findDescriptionSnippets(snippets, limit = 3) {
  const excludedKeywords = [
    ...CARE_KEYWORDS,
    ...CERTIFICATION_KEYWORDS,
    ...DURABILITY_KEYWORDS,
  ];

  return snippets
    .filter((snippet) => {
      const text = cleanText(snippet);
      const lower = text.toLowerCase();

      return (
        text.length >= 80 &&
        /[.!?]/.test(text) &&
        !looksLikeNavigationSnippet(text) &&
        !/\b\d{1,3}\s*%\s*[A-Za-zÀ-ÿ-]+/.test(text) &&
        !excludedKeywords.some((keyword) => lower.includes(keyword.toLowerCase()))
      );
    })
    .slice(0, limit);
}

function cleanBrandName(value) {
  return cleanText(value)
    .replace(/\b(Netherlands|Nederland|Online|Shop|Official|Store)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  const candidate = candidates[0];

  if (!candidate) {
    return "not_found";
  }

  const titleProductMatch = /\s[-|]\s/.test(candidate)
    ? candidate.match(/^[^-|]+[-|]\s*(.+)$/)
    : null;
  if (titleProductMatch && titleProductMatch[1]) {
    return cleanText(titleProductMatch[1]);
  }

  return candidate;
}

function pickBrand({ jsonLdBrand, brandMeta, snippets, pageTitle, sourceUrl }) {
  if (jsonLdBrand) {
    return jsonLdBrand;
  }

  if (brandMeta) {
    return brandMeta;
  }

  const registeredMarkSnippet = snippets.find((snippet) => /\b[A-Z][A-Z0-9&.'-]{1,24}\s*(?:®|&reg;|™)/.test(snippet));
  const registeredMarkMatch = registeredMarkSnippet && registeredMarkSnippet.match(/\b([A-Z][A-Z0-9&.'-]{1,24})\s*(?:®|&reg;|™)/);

  if (registeredMarkMatch) {
    return registeredMarkMatch[1];
  }

  const brandSnippet = snippets.find((snippet) => /^brand\s*[:\-]/i.test(snippet) || /^merk\s*[:\-]/i.test(snippet));
  if (brandSnippet) {
    return cleanText(brandSnippet.replace(/^(brand|merk)\s*[:\-]\s*/i, "")) || "not_found";
  }

  if (/\s[-|]\s/.test(cleanText(pageTitle))) {
    const titlePrefix = cleanText(pageTitle).split(/\s[-|]\s/)[0];
    const cleanedTitlePrefix = cleanBrandName(titlePrefix);
    if (cleanedTitlePrefix && cleanedTitlePrefix.length >= 2 && cleanedTitlePrefix.length <= 28) {
      return cleanedTitlePrefix;
    }
  }

  return "not_found";
}

function determineStatus(snapshot) {
  const foundCount = [
    snapshot.pageTitle,
    snapshot.canonicalUrl,
    snapshot.likelyProductName,
    snapshot.likelyBrand,
    snapshot.productIdentifiersText.length ? "found" : "",
    snapshot.colorText.length ? "found" : "",
    snapshot.productDescriptionText.length ? "found" : "",
    snapshot.materialCompositionText.length ? "found" : "",
    snapshot.careText.length ? "found" : "",
    snapshot.sustainabilityClaimSnippets.length ? "found" : "",
    snapshot.supplierDetailText.length ? "found" : "",
    snapshot.originText.length ? "found" : "",
    snapshot.certificationText.length ? "found" : "",
    snapshot.durabilityClaimSnippets.length ? "found" : "",
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

  notes.push(`product description text: ${snapshot.productDescriptionText.length ? "found" : "not_found"}`);
  notes.push(`product identifiers: ${snapshot.productIdentifiersText.length ? "found" : "not_found"}`);
  notes.push(`color/variant data: ${snapshot.colorText.length ? "found" : "not_found"}`);
  notes.push(`material/composition text: ${snapshot.materialCompositionText.length ? "found" : "not_found"}`);
  notes.push(`care text: ${snapshot.careText.length ? "found" : "not_found"}`);
  notes.push(`sustainability claim snippets: ${snapshot.sustainabilityClaimSnippets.length ? "found" : "not_found"}`);
  notes.push(`supplier detail text: ${snapshot.supplierDetailText.length ? "found" : "not_found"}`);
  notes.push(`origin/manufacturing text: ${snapshot.originText.length ? "found" : "not_found"}`);
  notes.push(`certification text: ${snapshot.certificationText.length ? "found" : "not_found"}`);
  notes.push(`durability claim snippets: ${snapshot.durabilityClaimSnippets.length ? "found" : "not_found"}`);

  return notes;
}

function createFailedProductPageSnapshot(sourceUrl, reason, now = new Date(), accessIssue = null) {
  return {
    sourceUrl,
    extractionTimestamp: now.toISOString(),
    extractionStatus: "failed",
    pageTitle: "not_found",
    canonicalUrl: "not_found",
    likelyProductName: "not_found",
    likelyBrand: "not_found",
    productIdentifiersText: [],
    colorText: [],
    productDescriptionText: [],
    materialCompositionText: [],
    careText: [],
    sustainabilityClaimSnippets: [],
    supplierDetailText: [],
    originText: [],
    certificationText: [],
    durabilityClaimSnippets: [],
    structuredProductData: null,
    accessIssue,
    extractionNotes: [`extraction failed: ${reason || "unable to fetch or parse product page"}`],
  };
}

function extractProductPageSnapshot(html, sourceUrl, now = new Date()) {
  const visibleHtml = removeNonVisibleMarkup(html);
  const bodyText = stripTags(visibleHtml);
  const blockSnippets = uniqueValues(extractTextBlocks(visibleHtml), 500);
  const snippets = uniqueValues([
    ...blockSnippets,
    ...splitIntoSnippets(bodyText),
  ], 500);
  const fieldSnippets = blockSnippets.length > 0 ? blockSnippets : snippets;
  const pageTitle = extractTitle(html) || "not_found";
  const openGraphTitle = extractMetaContent(html, "property", "og:title");
  const twitterTitle = extractMetaContent(html, "name", "twitter:title");
  const metaDescription = extractMetaContent(html, "name", "description");
  const openGraphDescription = extractMetaContent(html, "property", "og:description");
  const brandMeta = extractMetaContent(html, "property", "product:brand") || extractMetaContent(html, "name", "brand");
  const jsonLd = extractJsonLdValues(html, sourceUrl);
  const embeddedProductData = normalizeEmbeddedProductData(
    findEmbeddedProductCandidate(html, sourceUrl)
  );
  const headings = extractHeadings(html);
  const productDescriptionText = uniqueValues([
    embeddedProductData && embeddedProductData.productDescription,
    jsonLd.description,
    metaDescription,
    openGraphDescription,
  ], 3);
  const jsonLdMaterialText = jsonLd.material ? [`Material: ${jsonLd.material}`] : [];
  const jsonLdOriginText = jsonLd.origin ? [`Country of origin: ${jsonLd.origin}`] : [];
  const materialSnippets = findPrioritizedSnippets(
    fieldSnippets,
    MATERIAL_LABEL_KEYWORDS,
    MATERIAL_KEYWORDS
  );
  const compositionSnippets = findCompositionSnippets(fieldSnippets);
  const sustainabilitySnippets = findPrioritizedSnippets(
    fieldSnippets,
    SUSTAINABILITY_LABEL_KEYWORDS,
    SUSTAINABILITY_KEYWORDS
  );
  const embeddedMaterialComposition = (embeddedProductData && embeddedProductData.materialComposition) || [];
  const supplierDetailSnippets = findSupplierDetailSnippets(
    visibleHtml,
    fieldSnippets,
    bodyText,
    embeddedProductData
  );
  const structuredProductionOrigin = buildProductionOriginText(
    embeddedProductData && embeddedProductData.supplierDetails
  );
  const visibleProductionOrigin = buildProductionOriginTextFromRows(supplierDetailSnippets);
  const generalOriginSnippets = findSnippets(fieldSnippets, ORIGIN_KEYWORDS)
    .filter((snippet) => !snippetHasSupplierDetailKeyword(snippet));

  const snapshot = {
    sourceUrl,
    extractionTimestamp: now.toISOString(),
    extractionStatus: "partial",
    pageTitle,
    canonicalUrl: extractCanonicalUrl(html, sourceUrl),
    likelyProductName: pickProductName({
      jsonLdName: (embeddedProductData && embeddedProductData.name) || jsonLd.name,
      openGraphTitle,
      twitterTitle,
      headings,
      pageTitle,
    }),
    likelyBrand: pickBrand({
      jsonLdBrand: (embeddedProductData && embeddedProductData.brandName) || jsonLd.brand,
      brandMeta,
      snippets,
      pageTitle,
      sourceUrl,
    }),
    productIdentifiersText: buildIdentifierText(embeddedProductData),
    colorText: buildColorText(embeddedProductData),
    productDescriptionText: uniqueValues([
      ...productDescriptionText,
      ...findDescriptionSnippets(fieldSnippets),
    ].map(cleanProductDescriptionText), 3),
    materialCompositionText: uniqueValues([
      ...embeddedMaterialComposition,
      ...compositionSnippets,
      ...(embeddedMaterialComposition.length > 0 || compositionSnippets.length > 0 ? [] : materialSnippets),
      ...jsonLdMaterialText,
    ]),
    careText: uniqueValues([
      ...((embeddedProductData && embeddedProductData.careInstructions) || []),
      ...findSnippets(fieldSnippets, CARE_KEYWORDS),
    ], 8),
    sustainabilityClaimSnippets: sustainabilitySnippets,
    supplierDetailText: supplierDetailSnippets,
    originText: uniqueValues([
      ...structuredProductionOrigin,
      ...visibleProductionOrigin,
      ...generalOriginSnippets,
      ...jsonLdOriginText,
    ]),
    certificationText: findSnippets(fieldSnippets, CERTIFICATION_KEYWORDS),
    durabilityClaimSnippets: findSnippets(fieldSnippets, DURABILITY_KEYWORDS),
    structuredProductData: embeddedProductData,
    accessIssue: null,
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
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,nl;q=0.8",
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
  CERTIFICATION_KEYWORDS,
  DURABILITY_KEYWORDS,
  MATERIAL_KEYWORDS,
  MATERIAL_LABEL_KEYWORDS,
  ORIGIN_KEYWORDS,
  SUSTAINABILITY_LABEL_KEYWORDS,
  SUSTAINABILITY_KEYWORDS,
  cleanText,
  createFailedProductPageSnapshot,
  extractProductPageSnapshot,
  fetchProductPageSnapshot,
  stripTags,
};
