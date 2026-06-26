const assert = require("node:assert/strict");
const test = require("node:test");

const { analyzeProductUrl } = require("../src/analyzer");

test("analyzer rejects private product URLs before fetch work starts", async () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  };

  try {
    await assert.rejects(
      analyzeProductUrl("http://127.0.0.1/internal-product"),
      /public web page/
    );
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});
