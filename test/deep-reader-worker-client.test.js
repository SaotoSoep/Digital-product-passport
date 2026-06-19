const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  analyzeProductUrl,
  readProductPageDeepEvidence,
} = require("../src/analyzer");
const {
  callDeepReaderWorker,
  normalizeWorkerDeepReadResponse,
  workerFailureMode,
} = require("../src/lib/product-page/deep-reader-worker-client");

test("normalizes a successful worker response", () => {
  const normalized = normalizeWorkerDeepReadResponse({
    status: "success",
    failureReason: null,
    sourceUrl: "https://shop.example/product",
    finalUrl: "https://shop.example/product?loaded=1",
    deepReadSummary: {
      tabsClicked: 1,
      accordionsOpened: 2,
      readMoreExpanded: 1,
      structuredDataBlocksFound: 3,
      networkResponsesCaptured: 4,
      sectionLabelsDiscovered: ["Zorg informatie"],
    },
    evidence: [
      {
        sourceUrl: "https://shop.example/product",
        sectionLabel: "Zorg informatie",
        interactionType: "tab-click",
        selector: "button[role='tab']",
        text: "100% Linnen Fijnwasprogramma, machinewas op 30°C",
        json: null,
        confidence: "high",
        capturedAt: "2026-06-09T12:00:00.000Z",
      },
    ],
  }, "https://shop.example/product");

  assert.equal(normalized.status, "success");
  assert.equal(normalized.productionSource, "product_page_deep_read");
  assert.equal(normalized.mode, "Deep read successful");
  assert.equal(normalized.counts.tabsClicked, 1);
  assert.deepEqual(normalized.sectionLabels, ["Zorg informatie"]);
  assert.match(normalized.textEvidence[0].text, /100% Linnen/);
});

test("returns failed deep read evidence from a failed worker response", async () => {
  const result = await callDeepReaderWorker("https://shop.example/product", {
    workerUrl: "https://worker.example/deep-read",
    fetchImpl: async () => ({
      ok: true,
      text: async () => JSON.stringify({
        status: "failed",
        failureReason: "blocked_by_bot_protection",
        sourceUrl: "https://shop.example/product",
        finalUrl: "https://shop.example/product",
        deepReadSummary: {},
        evidence: [],
      }),
    }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.failureReason, "blocked by bot protection");
  assert.equal(result.mode, "Deep read blocked");
});

test("normalizes unsupported rendering worker responses", async () => {
  const result = await callDeepReaderWorker("https://shop.example/product", {
    workerUrl: "https://worker.example/deep-read",
    fetchImpl: async () => ({
      ok: true,
      text: async () => JSON.stringify({
        status: "failed",
        failureReason: "unsupported_rendering_pattern",
        sourceUrl: "https://shop.example/product",
        finalUrl: "https://shop.example/product",
        deepReadSummary: {},
        evidence: [],
      }),
    }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.failureReason, "unsupported rendering pattern");
  assert.equal(result.mode, "Deep read unsupported");
  assert.equal(workerFailureMode("access_denied"), "Deep read blocked");
  assert.equal(workerFailureMode("timeout"), "Deep read timeout");
});

test("normalizes a partial worker response without interactive sections", () => {
  const normalized = normalizeWorkerDeepReadResponse({
    status: "partial",
    failureReason: "no_relevant_interactive_sections_found",
    sourceUrl: "https://shop.example/product",
    deepReadSummary: {},
    evidence: [],
  }, "https://shop.example/product");

  assert.equal(normalized.failureReason, "no relevant interactive sections found");
  assert.equal(normalized.mode, "Production deep read partial");
});

test("falls back to a stronger local deep read when the worker finds no interactive evidence", async () => {
  let workerTimeoutMs = 0;
  let localTimeoutMs = 0;
  const result = await readProductPageDeepEvidence(
    "https://shop.example/product",
    30000,
    {
      worker: async (_url, options) => {
        workerTimeoutMs = options.timeoutMs;
        return {
          status: "partial",
          counts: {},
          textEvidence: [{ text: "Initial product page" }],
          structuredData: [],
          networkResponses: [],
        };
      },
      local: async (_url, options) => {
        localTimeoutMs = options.timeoutMs;
        return {
          status: "success",
          counts: { tabsClicked: 2, accordionsOpened: 0, readMoreExpanded: 1 },
          textEvidence: [{ text: "Material and care details" }],
          structuredData: [],
          networkResponses: [],
        };
      },
    }
  );

  assert.equal(workerTimeoutMs, 25000);
  assert(localTimeoutMs >= 25000);
  assert.equal(result.status, "success");
  assert.equal(result.counts.tabsClicked, 2);
});

test("uses a strong local deep read without waiting for the worker in local development", async () => {
  let workerCalled = false;
  const result = await readProductPageDeepEvidence(
    "https://shop.example/product",
    30000,
    {
      preferLocal: true,
      worker: async () => {
        workerCalled = true;
        return null;
      },
      local: async () => ({
        status: "success",
        counts: { tabsClicked: 1 },
        textEvidence: [{ text: "Care details" }],
        structuredData: [],
        networkResponses: [],
      }),
    }
  );

  assert.equal(result.status, "success");
  assert.equal(workerCalled, false);
});

test("keeps local and worker deep-reader implementations synchronized", () => {
  const localReader = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "product-page", "deep-reader.js"), "utf8");
  const workerReader = fs.readFileSync(path.join(__dirname, "..", "deep-reader-worker", "lib", "deep-reader.js"), "utf8");

  assert.equal(workerReader, localReader);
});

test("times out worker calls and returns timeout fallback", async () => {
  const result = await callDeepReaderWorker("https://shop.example/product", {
    workerUrl: "https://worker.example/deep-read",
    timeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.failureReason, "page timeout");
  assert.equal(result.mode, "Deep read timeout");
});

test("marks unfound fields unavailable when production deep read is access denied", async () => {
  const originalFetch = global.fetch;
  const originalWorkerUrl = process.env.DEEP_READER_WORKER_URL;

  process.env.DEEP_READER_WORKER_URL = "https://worker.example/deep-read";
  global.fetch = async (url) => {
    const requestedUrl = String(url);

    if (requestedUrl.includes("worker.example/deep-read")) {
      return {
        ok: true,
        text: async () => JSON.stringify({
          status: "failed",
          failureReason: "access_denied",
          sourceUrl: "https://shop.example/product",
          finalUrl: "https://shop.example/product",
          deepReadSummary: {},
          evidence: [],
        }),
      };
    }

    if (requestedUrl === "https://shop.example/product") {
      return {
        ok: true,
        status: 200,
        url: requestedUrl,
        headers: { get: () => "text/html; charset=utf-8" },
        text: async () => `<!doctype html><html><head><title>Cotton Sweatshirt</title></head><body><h1>Cotton Sweatshirt</h1><p>Composition: 100% cotton</p></body></html>`,
      };
    }

    return {
      ok: false,
      status: 404,
      url: requestedUrl,
      headers: { get: () => "text/html; charset=utf-8" },
      text: async () => "<html><title>Not found</title></html>",
    };
  };

  try {
    const analysis = await analyzeProductUrl("https://shop.example/product");
    const fields = analysis.report.productPageEvidence.fields;

    assert.equal(analysis.report.deepPageReadEvidence.failureReason, "access denied");
    assert.equal(analysis.report.deepPageReadEvidence.mode, "Deep read blocked");
    assert.match(analysis.report.deepReadNote, /not confirmed absent/);
    assert.equal(fields.materialComposition.status, "found");
    assert.equal(fields.materialComposition.source, "product_page_basic_extraction");
    assert.equal(fields.careText.status, "unavailable");
    assert.equal(fields.careText.source, "product_page_deep_read");
    assert.equal(fields.careText.sourceLabel, "Deep read blocked");
    assert.match(fields.careText.note, /unavailable, not confirmed absent/);
    assert.equal(fields.productionOrigin.status, "unavailable");
    assert(!analysis.report.productPageEvidence.missingFields.includes("Care text"));
    assert(analysis.report.productPageEvidence.unavailableFields.includes("Care text"));
  } finally {
    global.fetch = originalFetch;
    if (originalWorkerUrl === undefined) {
      delete process.env.DEEP_READER_WORKER_URL;
    } else {
      process.env.DEEP_READER_WORKER_URL = originalWorkerUrl;
    }
  }
});

test("marks found fields as deep-read sourced when worker returns evidence", async () => {
  const originalFetch = global.fetch;
  const originalWorkerUrl = process.env.DEEP_READER_WORKER_URL;

  process.env.DEEP_READER_WORKER_URL = "https://worker.example/deep-read";
  global.fetch = async (url) => {
    const requestedUrl = String(url);

    if (requestedUrl.includes("worker.example/deep-read")) {
      return {
        ok: true,
        text: async () => JSON.stringify({
          status: "success",
          failureReason: null,
          sourceUrl: "https://shop.example/product",
          finalUrl: "https://shop.example/product",
          deepReadSummary: {
            tabsClicked: 1,
            accordionsOpened: 0,
            readMoreExpanded: 0,
            structuredDataBlocksFound: 0,
            networkResponsesCaptured: 0,
            sectionLabelsDiscovered: ["Materials"],
          },
          evidence: [
            {
              sourceUrl: "https://shop.example/product",
              sectionLabel: "Materials",
              interactionType: "tab-click",
              selector: "button",
              text: "Composition: 100% cotton",
              json: null,
              confidence: "high",
              capturedAt: "2026-06-10T08:00:00.000Z",
            },
          ],
        }),
      };
    }

    if (requestedUrl === "https://shop.example/product") {
      return {
        ok: true,
        status: 200,
        url: requestedUrl,
        headers: { get: () => "text/html; charset=utf-8" },
        text: async () => `<!doctype html><html><head><title>Cotton Sweatshirt</title></head><body><h1>Cotton Sweatshirt</h1></body></html>`,
      };
    }

    return {
      ok: false,
      status: 404,
      url: requestedUrl,
      headers: { get: () => "text/html; charset=utf-8" },
      text: async () => "<html><title>Not found</title></html>",
    };
  };

  try {
    const analysis = await analyzeProductUrl("https://shop.example/product");
    const fields = analysis.report.productPageEvidence.fields;

    assert.equal(analysis.report.deepPageReadEvidence.mode, "Deep read successful");
    assert.equal(fields.materialComposition.status, "found");
    assert.equal(fields.materialComposition.source, "product_page_deep_read");
    assert.equal(fields.materialComposition.sourceLabel, "Product page deep read");
  } finally {
    global.fetch = originalFetch;
    if (originalWorkerUrl === undefined) {
      delete process.env.DEEP_READER_WORKER_URL;
    } else {
      process.env.DEEP_READER_WORKER_URL = originalWorkerUrl;
    }
  }
});

test("frontend contains the deep page read evidence renderer", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const appJs = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.match(appJs, /function renderDeepPageReadEvidence/);
  assert.match(appJs, /Deep page read evidence/);
  assert.match(appJs, /Deep read blocked/);
  assert.match(appJs, /Basic fallback used/);
  assert.match(appJs, /Product page deep read/);
  assert.match(appJs, /Product page basic extraction/);
  assert(appJs.includes("Public/source evidence unavailable"));
  assert.match(appJs, /Tabs clicked/);
  assert.match(appJs, /Sections opened/);
});
