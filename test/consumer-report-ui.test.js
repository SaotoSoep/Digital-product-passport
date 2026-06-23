const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(projectRoot, "public", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(projectRoot, "public", "styles.css"), "utf8");
const dashboardSource = fs.readFileSync(path.join(projectRoot, "public", "dashboard.js"), "utf8");

test("shows the independent-report disclaimer persistently above the report", () => {
  assert.match(html, /Independent product report\./);
  assert.match(html, /Not an official EU Digital Product Passport \(DPP\)/);
  assert.match(html, /not a compliance assessment/i);
  assert.match(html, /class="trust-disclaimer"/);
  assert.match(styles, /\.trust-disclaimer\s*{[^}]*position:\s*sticky/s);
});

test("contains every compact passport overview heading", () => {
  const headings = [
    "Product summary",
    "Key facts",
    "Material composition",
    "Claims and evidence",
    "Traceability",
    "Care",
    "Missing information",
  ];

  for (const heading of headings) {
    assert.match(dashboardSource, new RegExp(heading));
  }
});

test("wires tabs to distinct labelled tabpanels and supports keyboard navigation", () => {
  assert.match(html, /id="report-tab-overview"[\s\S]*aria-controls="report-panel-overview"/);
  assert.match(html, /id="report-panel-overview"[\s\S]*role="tabpanel"[\s\S]*aria-labelledby="report-tab-overview"/);
  assert.match(html, /id="report-tab-evidence"[\s\S]*aria-controls="report-panel-evidence"/);
  assert.match(html, /id="report-panel-evidence"[\s\S]*role="tabpanel"[\s\S]*aria-labelledby="report-tab-evidence"/);
  assert.match(html, /id="report-tab-technical"[\s\S]*aria-controls="report-panel-technical"/);
  assert.match(html, /id="report-panel-technical"[\s\S]*role="tabpanel"[\s\S]*aria-labelledby="report-tab-technical"/);
  assert.match(app, /activeTab = "overview"/);

  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
    assert.match(app, new RegExp(`event\\.key === "${key}"`));
  }

  assert.match(app, /function renderEvidenceReport/);
  assert.match(app, /<details class="technical-disclosure"/);
  assert.match(styles, /\.technical-disclosure summary:focus-visible/);
});

test("keeps missing and unavailable information semantically and visually distinct", () => {
  assert.match(dashboardSource, /Missing information/);
  assert.match(dashboardSource, /Unavailable/);
  assert.match(app, /item\.status === "not_found"/);
  assert.match(app, /item\.status === "unavailable"/);
  assert.match(styles, /\.information-state\.missing-information\s*{[^}]*background:\s*#fffaf0/s);
  assert.match(styles, /\.information-state\.unavailable-information\s*{[^}]*border-left:\s*5px solid var\(--red\)/s);
});

test("does not use Sustainable as a product verdict", () => {
  assert.doesNotMatch(app, /label:\s*["'`]Sustainable\b/i);
  assert.doesNotMatch(app, /<h[1-4][^>]*>Sustainable\b/i);
  assert.match(app, /buildConsumerConclusion\(model\)/);
  assert.match(app, /not as independent proof or a product verdict/);
  assert.match(app, /The exact product identity could not be confirmed from the available evidence/);
  assert.doesNotMatch(app, /Draft passport saved/);
  assert.doesNotMatch(app, /Save draft passport/);
});

test("falls back to analysis-only when draft saving is unavailable", () => {
  assert.match(app, /function isNetworkRequestError/);
  assert.match(app, /Could not reach the analysis service/);
  assert.match(app, /function fallbackToAnalysisOnly/);
  assert.match(app, /fallbackReason/);
  assert.match(app, /response\.status >= 500/);
  assert.match(app, /draft-service-unreachable/);
});
