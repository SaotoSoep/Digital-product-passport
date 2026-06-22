const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(projectRoot, "public", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(projectRoot, "public", "styles.css"), "utf8");

test("shows the independent-report disclaimer persistently above the report", () => {
  assert.match(html, /Independent product report\./);
  assert.match(html, /Not an official EU Digital Product Passport \(DPP\)/);
  assert.match(html, /not a compliance assessment/i);
  assert.match(html, /class="trust-disclaimer"/);
  assert.match(styles, /\.trust-disclaimer\s*{[^}]*position:\s*sticky/s);
});

test("contains every consumer-first report heading", () => {
  const headings = [
    "What is known",
    "Materials explained",
    "Claims and evidence",
    "Origin and manufacturing",
    "Care guidance",
    "Disclosure and claim scores",
    "Conclusion",
    "Sources",
    "Unknowns and unavailable information",
  ];

  for (const heading of headings) {
    assert.match(app, new RegExp(`"${heading}"`));
  }
});

test("wires tabs to distinct labelled tabpanels and supports keyboard navigation", () => {
  assert.match(html, /id="report-tab-report"[\s\S]*aria-controls="report-panel-report"/);
  assert.match(html, /id="report-panel-report"[\s\S]*role="tabpanel"[\s\S]*aria-labelledby="report-tab-report"/);
  assert.match(html, /id="report-tab-technical"[\s\S]*aria-controls="report-panel-technical"/);
  assert.match(html, /id="report-panel-technical"[\s\S]*role="tabpanel"[\s\S]*aria-labelledby="report-tab-technical"/);

  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
    assert.match(app, new RegExp(`event\\.key === "${key}"`));
  }

  assert.match(app, /<details class="technical-disclosure"/);
  assert.match(styles, /\.technical-disclosure summary:focus-visible/);
});

test("keeps missing and unavailable information semantically and visually distinct", () => {
  assert.match(app, /"Missing information"/);
  assert.match(app, /"Unavailable information"/);
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
