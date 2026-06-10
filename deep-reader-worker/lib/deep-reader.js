const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const SECTION_KEYWORDS = [
  "beschrijving", "details", "materiaal", "materialen", "samenstelling", "zorg informatie", "wasvoorschrift", "onderhoud", "duurzaamheid", "herkomst", "productie", "beschikbaarheid",
  "description", "details", "material", "materials", "composition", "care", "washing", "sustainability", "origin", "production", "traceability", "availability",
  "description", "détails", "details", "matière", "composition", "entretien", "lavage", "durabilité", "origine", "production", "traçabilité", "disponibilité",
];

const EXPAND_KEYWORDS = [
  "read more", "show more", "view more", "see more", "more information", "product information",
  "lees meer", "toon meer", "meer informatie", "bekijk meer",
  "voir plus", "afficher plus", "plus d'informations", "en savoir plus",
];

const BLOCKER_KEYWORDS = [
  "accept", "agree", "allow all", "accept all", "reject", "decline", "continue", "got it", "ok",
  "accepteren", "alles accepteren", "weigeren", "doorgaan", "sluiten",
  "accepter", "tout accepter", "refuser", "continuer", "fermer",
];

const CLOSE_KEYWORDS = ["close", "sluiten", "fermer", "×", "x"];

const DANGEROUS_KEYWORDS = [
  "add to bag", "add to cart", "basket", "cart", "checkout", "buy now", "wishlist", "favorite", "favourite", "login", "log in", "account", "payment", "quantity",
  "toevoegen", "winkelmand", "afrekenen", "favoriet", "verlanglijst", "inloggen", "account", "betaling", "aantal",
  "panier", "paiement", "connexion", "compte", "favoris", "acheter", "quantité",
];

const NETWORK_KEYWORDS = [
  "product", "variant", "inventory", "availability", "sustainability", "material", "care", "composition", "recommendation",
  "artikel", "voorraad", "beschikbaarheid", "materiaal", "onderhoud", "samenstelling",
];

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function includesAny(value, keywords) {
  const lower = cleanText(value).toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function isRelevantLabel(label) {
  return includesAny(label, SECTION_KEYWORDS) || includesAny(label, EXPAND_KEYWORDS);
}

function isDangerousLabel(label) {
  return includesAny(label, DANGEROUS_KEYWORDS);
}

function summarizeJson(value, limit = 2400) {
  const snippets = [];
  const seen = new Set();

  function visit(node, path = "", depth = 0) {
    if (snippets.join(" ").length >= limit || depth > 8 || node === null || node === undefined) {
      return;
    }

    if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
      const key = path.toLowerCase();
      const text = cleanText(`${path}: ${node}`);
      if (
        text.length >= 8 &&
        (includesAny(key, [...SECTION_KEYWORDS, ...NETWORK_KEYWORDS]) || includesAny(text, [...SECTION_KEYWORDS, ...NETWORK_KEYWORDS])) &&
        !seen.has(text.toLowerCase())
      ) {
        snippets.push(text);
        seen.add(text.toLowerCase());
      }
      return;
    }

    if (Array.isArray(node)) {
      node.slice(0, 30).forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      return;
    }

    if (typeof node === "object") {
      Object.entries(node).slice(0, 80).forEach(([key, item]) => {
        visit(item, path ? `${path}.${key}` : key, depth + 1);
      });
    }
  }

  visit(value);
  return snippets.join(" | ").slice(0, limit);
}

function shouldRunDeepReader() {
  if (process.env.DEEP_PRODUCT_PAGE_READER === "0") {
    return false;
  }

  if (process.env.NODE_ENV === "test") {
    return false;
  }

  return !process.argv.some((arg) => arg === "--test" || arg.startsWith("--test-"));
}

function createFailedDeepRead(sourceUrl, reason, status = "failed") {
  return {
    status,
    sourceUrl,
    failureReason: reason,
    counts: {
      tabsClicked: 0,
      accordionsOpened: 0,
      readMoreExpanded: 0,
      structuredDataBlocks: 0,
      relevantNetworkResponses: 0,
    },
    sectionLabels: [],
    textEvidence: [],
    structuredData: [],
    networkResponses: [],
    completedAt: new Date().toISOString(),
  };
}

function textHash(text) {
  let hash = 0;
  const value = String(text || "");
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return `${value.length}:${hash}`;
}

async function collectVisibleText(page, evidence, metadata) {
  const text = cleanText(await page.locator("body").innerText({ timeout: 5000 }).catch(() => ""));
  if (text.length < 20) {
    return false;
  }

  const key = textHash(text);
  if (evidence.seenText.has(key)) {
    return false;
  }

  evidence.seenText.add(key);
  evidence.textEvidence.push({
    sourceUrl: page.url(),
    sectionLabel: metadata.sectionLabel || "Page",
    interactionType: metadata.interactionType || "read",
    selector: metadata.selector || "",
    text: text.slice(0, 12000),
    timestamp: new Date().toISOString(),
  });
  return true;
}

async function handleBlockers(page) {
  for (let pass = 0; pass < 3; pass += 1) {
    const candidates = await page.evaluate(({ blockerKeywords, closeKeywords, dangerousKeywords }) => {
      function clean(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
      }
      function hasAny(value, keywords) {
        const lower = clean(value).toLowerCase();
        return keywords.some((keyword) => lower.includes(keyword));
      }
      function selectorFor(element) {
        if (element.id) return `#${CSS.escape(element.id)}`;
        const testId = element.getAttribute("data-testid") || element.getAttribute("data-test");
        if (testId) return `[data-testid="${CSS.escape(testId)}"], [data-test="${CSS.escape(testId)}"]`;
        const aria = element.getAttribute("aria-label");
        if (aria) return `${element.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
        return "";
      }

      return [...document.querySelectorAll("button, [role='button'], a, input[type='button'], input[type='submit']")]
        .map((element) => {
          const text = clean(element.innerText || element.value || element.getAttribute("aria-label") || element.getAttribute("title") || "");
          const rect = element.getBoundingClientRect();
          return { text, selector: selectorFor(element), visible: rect.width > 0 && rect.height > 0 };
        })
        .filter((item) => item.visible && item.selector && !hasAny(item.text, dangerousKeywords))
        .filter((item) => hasAny(item.text, blockerKeywords) || hasAny(item.text, closeKeywords))
        .slice(0, 5);
    }, {
      blockerKeywords: BLOCKER_KEYWORDS.map((item) => item.toLowerCase()),
      closeKeywords: CLOSE_KEYWORDS.map((item) => item.toLowerCase()),
      dangerousKeywords: DANGEROUS_KEYWORDS.map((item) => item.toLowerCase()),
    });

    if (candidates.length === 0) {
      break;
    }

    for (const candidate of candidates) {
      await page.locator(candidate.selector).first().click({ timeout: 1500 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
    }
  }
}

async function progressiveScroll(page, evidence) {
  let previousHeight = 0;
  let stableSteps = 0;
  let unchangedTextSteps = 0;

  for (let step = 0; step < 10 && stableSteps < 2 && unchangedTextSteps < 3; step += 1) {
    const current = await page.evaluate(() => ({
      y: window.scrollY,
      height: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    }));

    const foundNewText = await collectVisibleText(page, evidence, {
      sectionLabel: `Scroll position ${step + 1}`,
      interactionType: "scroll",
      selector: "window",
    });
    unchangedTextSteps = foundNewText ? 0 : unchangedTextSteps + 1;

    if (current.height === previousHeight && current.y + current.viewport >= current.height - 8) {
      stableSteps += 1;
    } else {
      stableSteps = 0;
    }

    previousHeight = current.height;
    await page.evaluate(() => window.scrollBy(0, Math.floor(window.innerHeight * 0.75)));
    await page.waitForTimeout(250);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
}

async function findInteractiveCandidates(page, clickedSelectors) {
  return page.evaluate(({ sectionKeywords, expandKeywords, dangerousKeywords, clicked }) => {
    function clean(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }
    function hasAny(value, keywords) {
      const lower = clean(value).toLowerCase();
      return keywords.some((keyword) => lower.includes(keyword));
    }
    function cssPath(element) {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const stable = ["data-testid", "data-test", "data-cy", "aria-controls", "aria-label", "name"]
        .map((attr) => [attr, element.getAttribute(attr)])
        .find(([, value]) => value);
      if (stable) {
        return `${element.tagName.toLowerCase()}[${stable[0]}="${CSS.escape(stable[1])}"]`;
      }
      const parts = [];
      let node = element;
      while (node && node.nodeType === 1 && parts.length < 4) {
        const tag = node.tagName.toLowerCase();
        const parent = node.parentElement;
        if (!parent) {
          parts.unshift(tag);
          break;
        }
        const siblings = [...parent.children].filter((child) => child.tagName === node.tagName);
        const index = siblings.indexOf(node) + 1;
        parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
        node = parent;
      }
      return parts.join(" > ");
    }

    return [...document.querySelectorAll("button, [role='button'], [role='tab'], summary, details > summary, [aria-expanded], a")]
      .map((element) => {
        const text = clean(element.innerText || element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "");
        const href = element.getAttribute("href") || "";
        const selector = cssPath(element);
        const rect = element.getBoundingClientRect();
        const role = element.getAttribute("role") || element.tagName.toLowerCase();
        const expanded = element.getAttribute("aria-expanded");
        const type = role === "tab"
          ? "tab"
          : (role === "summary" || element.tagName.toLowerCase() === "summary" || expanded === "false")
          ? "accordion"
          : hasAny(text, expandKeywords)
          ? "read_more"
          : "section_control";
        return { text, href, selector, role, type, visible: rect.width > 0 && rect.height > 0 };
      })
      .filter((item) => item.visible && item.selector && !clicked.includes(item.selector))
      .filter((item) => !item.href || !/^https?:\/\//i.test(item.href))
      .filter((item) => !hasAny(`${item.text} ${item.href}`, dangerousKeywords))
      .filter((item) => hasAny(item.text, sectionKeywords) || hasAny(item.text, expandKeywords) || item.role === "tab")
      .slice(0, 35);
  }, {
    sectionKeywords: SECTION_KEYWORDS.map((item) => item.toLowerCase()),
    expandKeywords: EXPAND_KEYWORDS.map((item) => item.toLowerCase()),
    dangerousKeywords: DANGEROUS_KEYWORDS.map((item) => item.toLowerCase()),
    clicked: [...clickedSelectors],
  });
}

async function clickRelevantControls(page, evidence) {
  const clickedSelectors = new Set();

  for (let pass = 0; pass < 4; pass += 1) {
    const candidates = await findInteractiveCandidates(page, clickedSelectors);
    if (candidates.length === 0) {
      break;
    }

    for (const candidate of candidates) {
      if (!candidate.selector || clickedSelectors.has(candidate.selector) || isDangerousLabel(`${candidate.text} ${candidate.href}`)) {
        continue;
      }

      clickedSelectors.add(candidate.selector);
      const before = textHash(await page.locator("body").innerText({ timeout: 3000 }).catch(() => ""));
      const locator = page.locator(candidate.selector).first();
      await locator.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
      const clicked = await locator.click({ timeout: 2500 }).then(() => true).catch(() => false);
      if (!clicked) {
        continue;
      }

      await page.waitForFunction((previous) => {
        const text = document.body ? document.body.innerText : "";
        let hash = 0;
        for (let index = 0; index < text.length; index += 1) {
          hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
        }
        return `${text.length}:${hash}` !== previous;
      }, before, { timeout: 2500 }).catch(() => page.waitForTimeout(300));

      if (candidate.type === "tab") evidence.counts.tabsClicked += 1;
      else if (candidate.type === "accordion") evidence.counts.accordionsOpened += 1;
      else if (candidate.type === "read_more") evidence.counts.readMoreExpanded += 1;

      evidence.sectionLabels.add(candidate.text || candidate.type);
      await collectVisibleText(page, evidence, {
        sectionLabel: candidate.text || candidate.type,
        interactionType: candidate.type,
        selector: candidate.selector,
      });
    }
  }
}

async function extractStructuredData(page, sourceUrl) {
  return page.evaluate(({ sourceUrlValue }) => {
    function clean(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }
    function relevant(value) {
      return /product|variant|material|composition|care|washing|sustainability|origin|production|traceability|availability|voorraad|materiaal|samenstelling|onderhoud|beschikbaarheid/i.test(value);
    }

    return [...document.scripts]
      .map((script, index) => {
        const raw = clean(script.textContent || "");
        if (!raw || raw.length < 20 || (!/^[\[{]/.test(raw) && !script.id && !script.type)) return null;
        try {
          const parsed = JSON.parse(raw);
          const summary = JSON.stringify(parsed).slice(0, 5000);
          if (!relevant(`${script.id} ${script.type} ${summary}`)) return null;
          return {
            sourceUrl: sourceUrlValue,
            sectionLabel: script.id || script.type || `embedded-json-${index + 1}`,
            interactionType: "structured_data",
            selector: script.id ? `#${script.id}` : `script:nth-of-type(${index + 1})`,
            json: parsed,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean)
      .slice(0, 20);
  }, { sourceUrlValue: sourceUrl });
}

async function readDeepProductPage(productUrl, options = {}) {
  if (!shouldRunDeepReader() && !options.force) {
    return createFailedDeepRead(productUrl, "deep reader disabled in this runtime", "skipped");
  }

  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (error) {
    return createFailedDeepRead(productUrl, "unsupported rendering pattern: Playwright is not installed");
  }

  const evidence = {
    status: "partial",
    sourceUrl: productUrl,
    failureReason: "",
    counts: {
      tabsClicked: 0,
      accordionsOpened: 0,
      readMoreExpanded: 0,
      structuredDataBlocks: 0,
      relevantNetworkResponses: 0,
    },
    sectionLabels: new Set(),
    textEvidence: [],
    structuredData: [],
    networkResponses: [],
    seenText: new Set(),
    completedAt: "",
  };

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1365, height: 900 },
      locale: "nl-NL",
    });
    const page = await context.newPage();

    page.on("response", async (response) => {
      try {
        const url = response.url();
        const contentType = response.headers()["content-type"] || "";
        if (!contentType.includes("json") || !includesAny(url, NETWORK_KEYWORDS)) {
          return;
        }
        const json = await response.json();
        const summary = summarizeJson(json);
        if (!summary) return;
        evidence.networkResponses.push({
          sourceUrl: url,
          responseType: contentType,
          summary,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        // Ignore unreadable streaming or cross-origin responses.
      }
    });

    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: options.timeoutMs || 25000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

    const blockerText = cleanText(await page.locator("body").innerText({ timeout: 5000 }).catch(() => ""));
    if (/access denied/i.test(blockerText)) {
      return createFailedDeepRead(productUrl, "access denied");
    }
    if (/captcha|bot verification|checking your browser|akamai|bm-verify/i.test(blockerText)) {
      return createFailedDeepRead(productUrl, "blocked by bot protection");
    }

    await handleBlockers(page);
    await collectVisibleText(page, evidence, { sectionLabel: "Initial page", interactionType: "initial_load", selector: "body" });
    await progressiveScroll(page, evidence);
    await clickRelevantControls(page, evidence);
    await progressiveScroll(page, evidence);

    evidence.structuredData = (await extractStructuredData(page, productUrl))
      .map((item) => ({
        ...item,
        summary: summarizeJson(item.json),
        json: undefined,
      }))
      .filter((item) => item.summary);

    evidence.counts.structuredDataBlocks = evidence.structuredData.length;
    evidence.counts.relevantNetworkResponses = evidence.networkResponses.length;
    evidence.sectionLabels = [...evidence.sectionLabels];
    evidence.status = "success";
    evidence.completedAt = new Date().toISOString();

    if (
      evidence.counts.tabsClicked === 0 &&
      evidence.counts.accordionsOpened === 0 &&
      evidence.counts.readMoreExpanded === 0 &&
      evidence.textEvidence.length <= 1
    ) {
      evidence.status = "partial";
      evidence.failureReason = "no relevant interactive sections found";
    }

    delete evidence.seenText;
    return evidence;
  } catch (error) {
    const message = error && error.message ? error.message : "unsupported rendering pattern";
    if (/timeout/i.test(message)) {
      return createFailedDeepRead(productUrl, "page timeout");
    }
    if (/executable doesn't exist|playwright was just installed|browser.*not.*install/i.test(message)) {
      return createFailedDeepRead(productUrl, "unsupported rendering pattern");
    }
    return createFailedDeepRead(productUrl, message || "unsupported rendering pattern");
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

function buildDeepEvidenceHtml(deepReadEvidence) {
  if (!deepReadEvidence || !Array.isArray(deepReadEvidence.textEvidence)) {
    return "";
  }

  const blocks = [];
  for (const item of deepReadEvidence.textEvidence) {
    blocks.push(`<section data-deep-reader-section="${cleanText(item.sectionLabel)}"><h2>${cleanText(item.sectionLabel)}</h2><p>${cleanText(item.text)}</p></section>`);
  }
  for (const item of deepReadEvidence.structuredData || []) {
    blocks.push(`<section data-deep-reader-section="${cleanText(item.sectionLabel)}"><h2>${cleanText(item.sectionLabel)}</h2><p>${cleanText(item.summary)}</p></section>`);
  }
  for (const item of deepReadEvidence.networkResponses || []) {
    blocks.push(`<section data-deep-reader-section="${cleanText(item.sourceUrl)}"><h2>${cleanText(item.sourceUrl)}</h2><p>${cleanText(item.summary)}</p></section>`);
  }

  return blocks.length > 0
    ? `<div id="deep-product-page-reader-evidence">${blocks.join("\n")}</div>`
    : "";
}

module.exports = {
  SECTION_KEYWORDS,
  buildDeepEvidenceHtml,
  createFailedDeepRead,
  readDeepProductPage,
  shouldRunDeepReader,
  summarizeJson,
};
