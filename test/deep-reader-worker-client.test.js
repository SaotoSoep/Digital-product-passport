const assert = require("node:assert/strict");
const test = require("node:test");

const { analyzeProductUrl } = require("../src/analyzer");
const {
  callDeepReaderWorker,
  normalizeWorkerDeepReadResponse,
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
  assert.equal(normalized.productionSource, "production_deep_read");
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
});

test("marks unfound fields unavailable when production deep read fails", async () => {
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
    assert.equal(fields.materialComposition.status, "found");
    assert.equal(fields.careText.status, "unavailable");
    assert.equal(fields.productionOrigin.status, "unavailable");
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
  assert.match(appJs, /Tabs clicked/);
  assert.match(appJs, /Sections opened/);
});
