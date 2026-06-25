const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const dashboard = require("../public/dashboard.js");

const projectRoot = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(projectRoot, "public", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(projectRoot, "public", "styles.css"), "utf8");
const dashboardSource = fs.readFileSync(path.join(projectRoot, "public", "dashboard.js"), "utf8");

const checkedFields = [
  ["productName", "Product name", "found"],
  ["brand", "Brand", "found"],
  ["productIdentifiers", "Product identifiers", "found"],
  ["colorVariant", "Colour/variant", "not_found"],
  ["productDescription", "Product description", "found"],
  ["materialComposition", "Material", "found"],
  ["sustainabilityClaims", "Sustainability claims", "found"],
  ["careText", "Care", "found"],
  ["supplierDetails", "Supplier/factory", "unavailable"],
  ["productionOrigin", "Origin/manufacturing", "found"],
  ["certifications", "Certifications", "not_found"],
  ["durabilityClaims", "Durability", "unavailable"],
];

function evidenceRecord(overrides = {}) {
  return {
    id: "ev_default",
    fieldKey: "sustainabilityClaims",
    sourceType: "brand_statement",
    verificationStatus: "brand_statement_only",
    status: "found",
    sourceUrl: "https://example.com/product",
    excerpt: "Made with recycled polyester",
    captureMethod: "product_page_basic_extraction",
    capturedAt: "2026-06-22T10:00:00.000Z",
    extractionConfidence: "medium",
    ...overrides,
  };
}

function buildModel(overrides = {}) {
  const records = [
    evidenceRecord({ id: "ev_claim" }),
    evidenceRecord({
      id: "ev_material",
      fieldKey: "materialComposition",
      sourceType: "public_page_evidence",
      verificationStatus: "source_confirmed",
      excerpt: "78% Organic cotton; 22% Recycled polyester",
      extractionConfidence: "high",
    }),
    evidenceRecord({
      id: "ev_origin",
      fieldKey: "productionOrigin",
      sourceType: "public_page_evidence",
      verificationStatus: "source_confirmed",
      excerpt: "Country: Portugal",
      extractionConfidence: "medium",
    }),
    evidenceRecord({
      id: "ev_care",
      fieldKey: "careText",
      sourceType: "public_page_evidence",
      verificationStatus: "source_confirmed",
      excerpt: "Machine wash at 30°C. Do not tumble dry. Iron at low temperature.",
      extractionConfidence: "medium",
    }),
  ];
  const evidenceRecordIndex = new Map(records.map((record) => [record.id, record]));
  const fields = {
    materialComposition: {
      status: "found",
      values: ["78% Organic cotton; 22% Recycled polyester"],
      evidenceIds: ["ev_material"],
      citationRecords: [evidenceRecordIndex.get("ev_material")],
    },
    sustainabilityClaims: {
      status: "found",
      values: ["Made with recycled polyester"],
      evidenceIds: ["ev_claim"],
      source: "product_page_basic_extraction",
      citationRecords: [evidenceRecordIndex.get("ev_claim")],
    },
    productionOrigin: {
      status: "found",
      values: ["Country: Portugal"],
      evidenceIds: ["ev_origin"],
      citationRecords: [evidenceRecordIndex.get("ev_origin")],
    },
    supplierDetails: {
      status: "unavailable",
      values: [],
      evidenceIds: [],
    },
    careText: {
      status: "found",
      values: ["Machine wash at 30°C. Do not tumble dry. Iron at low temperature."],
      evidenceIds: ["ev_care"],
      citationRecords: [evidenceRecordIndex.get("ev_care")],
    },
  };

  const model = {
    productName: "Relaxed Organic Cotton Overshirt",
    brand: "Demo Atelier",
    retailer: "example.com",
    submittedUrl: "https://example.com/product",
    extractionStatus: "partial",
    generatedAt: "2026-06-22T10:00:00.000Z",
    responseLinks: {},
    foundCount: 8,
    checkedCount: 12,
    missingCount: 2,
    unavailableCount: 2,
    evidenceFields: checkedFields.map(([key, label, status]) => ({ key, label, status })),
    fields,
    evidenceLedger: { records },
    evidenceRecordIndex,
    material: "78% Organic cotton; 22% Recycled polyester",
    evidenceMaterial: "78% Organic cotton; 22% Recycled polyester",
    materialExplanation: "Direct material wording captured in the canonical evidence ledger.",
    materialItems: [
      { name: "Organic cotton", percentage: "78%", explanation: "Brand or retailer material wording." },
      { name: "Recycled polyester", percentage: "22%", explanation: "Brand or retailer material wording." },
    ],
    claimCitations: [{
      id: "claim_ev_claim",
      category: "sustainability",
      originalWording: "Made with recycled polyester",
      sourceType: "brand_statement",
      verificationStatus: "brand_statement_only",
      confidenceDimension: "medium",
      evidenceIds: ["ev_claim"],
    }],
    claims: [],
    unknowns: ["Product impact data", "Full supply chain"],
    transparencyScore: {
      status: "scored",
      score: 72,
      rationale: "Disclosure score 72/100 from canonical product-page fields.",
      topPositiveFactors: [{ key: "materials", label: "Material composition", reason: "1 of 1 weighted disclosure field(s) found." }],
      missingFactors: [{ key: "supplier", label: "Supplier or factory", reason: "No canonical product-page evidence was found for this factor." }],
    },
    claimScore: {
      status: "scored",
      score: 35,
      rationale: "Evidence-strength score 35/100 after applying the evidence cap.",
      factors: [
        { key: "product_support", label: "Product-specific supporting data", status: "present", reason: "The disclosed composition supports material wording in the claim." },
        { key: "independent_support", label: "Independent product-linked support", status: "missing", reason: "No certification or independent support was found on the product page." },
      ],
      topPositiveFactors: [{ key: "specificity", label: "Specific claim wording", reason: "The claim contains concrete product or material wording." }],
      missingFactors: [{ key: "independent_support", label: "Independent product-linked support", reason: "No certification or independent support was found on the product page." }],
    },
    brandInsight: { status: "not_found", sources: [] },
    ...overrides,
  };

  return {
    ...model,
    fields: { ...fields, ...(overrides.fields || {}) },
  };
}

test("wires a compact passport shell with overview, evidence, and technical tabs", () => {
  assert.match(html, /<script src="\/dashboard\.js" defer><\/script>[\s\S]*<script src="\/app\.js" defer><\/script>/);
  assert.match(html, /id="report-tab-overview"[\s\S]*aria-controls="report-panel-overview"/);
  assert.match(html, /id="report-tab-evidence"[\s\S]*aria-controls="report-panel-evidence"/);
  assert.match(html, /id="report-tab-technical"[\s\S]*aria-controls="report-panel-technical"/);
  assert.match(app, /ProductPassportDashboard\.renderDashboardHeader/);
  assert.match(app, /overviewReportPanel\.innerHTML = ProductPassportDashboard\.renderDashboard\(currentModel\)/);
  assert.match(app, /evidenceReportPanel\.innerHTML = renderEvidenceReport\(currentModel\)/);
  assert.match(app, /technicalReportPanel\.innerHTML = renderTechnicalReport\(currentModel\)/);
  assert.match(app, /renderModuleShell\("evidence"/);
  assert.match(app, /renderModuleShell\("technical"/);

  const rendered = dashboard.renderDashboard(buildModel());
  for (const section of [
    "Product passport overview",
    "Passport modules",
    "Product summary",
    "Key facts",
    "Compact disclosure scores",
    "Material composition",
    "Claims and evidence",
    "Traceability",
    "Care",
    "Missing information",
  ]) {
    assert.match(rendered, new RegExp(section));
  }
  for (const anchor of [
    "#passport-summary-title",
    "#passport-key-facts-title",
    "#passport-material-title",
    "#passport-claims-title",
    "#passport-traceability-title",
    "#passport-care-title",
    "#passport-missing-title",
  ]) {
    assert.match(rendered, new RegExp(`href="${anchor}"`));
  }
  assert.equal((rendered.match(/class="passport-module /g) || []).length, 7);
  assert.equal((rendered.match(/class="passport-module-body is-card-grid"/g) || []).length, 7);
  assert.match(rendered, /class="passport-module-heading"/);
  assert.match(rendered, /passport-module-body is-card-grid/);
  assert.match(rendered, /<h3 id="passport-material-title">Material<\/h3>/);
  assert.match(rendered, /<h3 id="passport-claims-title">Claims<\/h3>/);
  assert.doesNotMatch(rendered, /passport-section-grid/);

  const evidenceModules = dashboard.passportModuleDefinitions("evidence");
  const technicalModules = dashboard.passportModuleDefinitions("technical");
  assert.equal(evidenceModules.length, 7);
  assert.equal(technicalModules.length, 7);
  assert.equal(evidenceModules[0].titleId, "evidence-passport-summary-title");
  assert.equal(technicalModules[0].titleId, "technical-passport-summary-title");
  assert.match(dashboard.renderPassportModuleShell({
    ariaLabel: "Evidence module shell",
    modules: evidenceModules.map((module) => ({ ...module, body: "<p>Evidence</p>" })),
  }), /href="#evidence-passport-material-title"/);
});

test("module navigation follows the current tab section", () => {
  assert.match(app, /function syncPassportModuleNav/);
  assert.match(app, /function setActivePassportModule/);
  assert.match(app, /function activeReportPanel/);
  assert.match(app, /if \(activeTab === "evidence"\)/);
  assert.match(app, /if \(activeTab === "technical"\)/);
  assert.match(app, /aria-current", "location"/);
  assert.match(app, /document\.addEventListener\("scroll", requestPassportModuleNavSync, \{ passive: true \}\)/);
  assert.match(app, /window\.addEventListener\("resize", requestPassportModuleNavSync\)/);
  assert.match(app, /function keepPassportModuleLinkVisible/);
  assert.match(app, /nav\.scrollTo\(\{/);
  assert.match(app, /passportModuleNavLockedUntil = Date\.now\(\) \+ 800/);
  assert.match(app, /window\.scrollY >= maxScroll - 4/);
  assert.match(app, /event\.preventDefault\(\)/);
  assert.match(app, /target\.scrollIntoView\(\{ block: "start", inline: "nearest" \}\)/);
  assert.match(styles, /\.passport-side-nav a\.is-active,\s*\n\.passport-side-nav a\[aria-current="location"\]/);
  assert.match(styles, /\.report-detail\s*{[^}]*overflow:\s*visible/s);
  assert.match(styles, /\.passport-side-nav\s*{[^}]*position:\s*sticky/s);
  assert.match(styles, /\.passport-side-nav\s*{[^}]*top:\s*96px/s);
  assert.match(styles, /\.passport-side-nav\s*{[^}]*max-height:\s*calc\(100vh - 112px\)/s);
  assert.match(styles, /\.passport-side-nav\s*{[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /\.passport-module \[id\$="-title"\]\s*{[^}]*scroll-margin-top:\s*112px/s);
  assert.match(styles, /\.passport-module\s*{[^}]*border-top:\s*1px solid #dfe5dc/s);
  assert.match(styles, /\.passport-module-heading\s*{[^}]*border-left:\s*5px solid var\(--passport-gold\)/s);
  assert.match(styles, /\.passport-module-body\.is-card-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*430px\),\s*1fr\)\)/s);
  assert.match(styles, /\.passport-module-body\.is-card-grid > \.dashboard-card\.dashboard-full-width,\s*\n\.passport-module-body\.is-card-grid > \.dashboard-coverage-card\s*{[^}]*grid-column:\s*auto/s);
  assert.match(styles, /\.dashboard-claim-stack\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*360px\),\s*1fr\)\)/s);
  assert.match(styles, /\.dashboard-material-list,\s*\n\.dashboard-origin-flow,\s*\n\.dashboard-care-list\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*300px\),\s*1fr\)\)/s);
});

test("renders compact score rows without treating unavailable as zero", () => {
  const scored = dashboard.renderScoreGauge("Transparency", buildModel().transparencyScore, "report-scores");
  assert.match(scored, /72\/100/);
  assert.match(scored, /Scored/);
  assert.match(scored, /passport-score-row/);
  assert.doesNotMatch(scored, /dashboard-gauge/);

  const unavailable = dashboard.renderScoreGauge("Claim strength", {
    status: "not_available",
    score: null,
    rationale: "Not enough claim evidence.",
    topPositiveFactors: [],
    missingFactors: [],
  }, "report-scores");
  assert.match(unavailable, /Not available/);
  assert.doesNotMatch(unavailable, /0\/100/);
  assert.doesNotMatch(unavailable, /dashboard-gauge/);
});

test("key facts render at most five primary facts without inline evidence excerpts", () => {
  const rendered = dashboard.renderKeyFacts(buildModel());
  const rows = rendered.match(/class="passport-fact-row"/g) || [];
  assert.equal(rows.length, 5);
  for (const label of ["Material", "Assembly country", "Factory", "Care", "Claims"]) {
    assert.match(rendered, new RegExp(label));
  }
  assert.doesNotMatch(rendered, /confidence/i);
  assert.doesNotMatch(rendered, /dashboard-evidence-list/);
  assert.doesNotMatch(rendered, /<q>/);
});

test("key facts show not found for readable origin fields that are absent", () => {
  const rendered = dashboard.renderKeyFacts(buildModel({
    fields: {
      productionOrigin: {
        status: "not_found",
        values: [],
        evidenceIds: [],
        citationRecords: [],
      },
      supplierDetails: {
        status: "not_found",
        values: [],
        evidenceIds: [],
        citationRecords: [],
      },
    },
  }));

  assert.match(rendered, /Assembly country[\s\S]*Not found[\s\S]*<small>Not found<\/small>/);
  assert.match(rendered, /Factory[\s\S]*Not found[\s\S]*<small>Not found<\/small>/);
  assert.doesNotMatch(rendered, /Unavailable/);
});

test("evidence coverage keeps found, not found, and unavailable separate", () => {
  const model = buildModel();
  const counts = dashboard.coverageCounts(model);
  assert.deepEqual(counts.counts, { found: 8, not_found: 2, unavailable: 2 });

  const rendered = dashboard.renderEvidenceCoverage(model);
  assert.match(rendered, /Found<\/strong> 8/);
  assert.match(rendered, /Not found<\/strong> 2/);
  assert.match(rendered, /Unavailable<\/strong> 2/);
  assert.match(rendered, /Show field status list/);
});

test("material composition bar appears only for parseable complete percentages", () => {
  const valid = buildModel();
  assert.equal(dashboard.validateMaterialComposition(valid).validForChart, true);
  assert.match(dashboard.renderMaterialChart(valid), /passport-material-bar/);
  assert.match(dashboard.renderMaterialChart(valid), /78% Organic cotton/);

  const invalid = buildModel({
    materialItems: [
      { name: "Organic cotton", percentage: "78%", explanation: "" },
      { name: "Recycled polyester", percentage: "", explanation: "" },
    ],
  });
  assert.equal(dashboard.validateMaterialComposition(invalid).validForChart, false);
  assert.doesNotMatch(dashboard.renderMaterialChart(invalid), /passport-material-bar/);
  assert.match(dashboard.renderMaterialChart(invalid), /Complete composition not publicly confirmed/);
});

test("material visual is blocked by contradictory or incomplete percentages", () => {
  const incomplete = buildModel({
    materialItems: [
      { name: "Organic cotton", percentage: "70%", explanation: "" },
      { name: "Recycled polyester", percentage: "20%", explanation: "" },
    ],
  });
  assert.equal(dashboard.validateMaterialComposition(incomplete).validForChart, false);
  assert.match(dashboard.renderMaterialChart(incomplete), /outside the accepted 98–102% range/);

  const conflicting = buildModel({
    materialItems: [
      { name: "Cotton", percentage: "70%", explanation: "" },
      { name: "Cotton", percentage: "80%", explanation: "" },
    ],
  });
  assert.equal(dashboard.validateMaterialComposition(conflicting).validForChart, false);
  assert.match(dashboard.renderMaterialChart(conflicting), /Conflicting percentages/);
});

test("claim evidence ladder separates wording, product support, and independent verification", () => {
  const rendered = dashboard.renderClaimEvidenceLadder(buildModel());
  assert.match(rendered, /View claim evidence/);
  assert.match(rendered, /Claim wording found/);
  assert.match(rendered, /Product-specific support found/);
  assert.match(rendered, /Independent product-linked verification found/);
  assert.match(rendered, /The disclosed composition supports material wording in the claim/);
  assert.match(rendered, /No independent product-linked verification was found/);
  assert.match(rendered, /Claim source/);
  assert.match(rendered, /Brand\/retailer wording/);
  assert.match(rendered, /Evidence assessment/);
  assert.match(rendered, /Brand wording only; not independently supported/);
  assert.doesNotMatch(rendered, /independently verified/i);
});

test("claim module prefers deterministic claim verification statuses", () => {
  const rendered = dashboard.renderClaimEvidenceLadder(buildModel({
    claimVerifications: [{
      id: "clv_verified",
      claimText: "Contains 78% organic cotton",
      claimCategory: "organic",
      sourceType: "product-page",
      evidenceStatus: "present",
      verificationStatus: "verified",
      extractionConfidence: "high",
      evidenceIds: ["ev_claim", "ev_material"],
    }],
  }));

  assert.match(rendered, /Contains 78% organic cotton/);
  assert.match(rendered, /Claim source/);
  assert.match(rendered, /Brand\/retailer wording/);
  assert.match(rendered, /Evidence assessment/);
  assert.match(rendered, /Supported by product-specific evidence/);
  assert.doesNotMatch(rendered, /Extraction confidence/);
  assert.match(rendered, /The disclosed composition supports material wording in the claim|Product-specific evidence directly supports the claim/);
  assert.match(rendered, /dashboard-ladder-step is-found[\s\S]*Product-specific support found/);
  assert.doesNotMatch(rendered, /brand statement only/);
});

test("external evidence is required before a claim is shown as independently verified", () => {
  const externalRecord = evidenceRecord({
    id: "ev_external",
    sourceType: "external_evidence",
    verificationStatus: "independently_verified",
    sourceUrl: "https://certifier.example/product-certificate",
    excerpt: "Certificate linked to product SKU 123",
    extractionConfidence: "high",
  });
  const model = buildModel();
  model.evidenceLedger.records.push(externalRecord);
  model.evidenceRecordIndex.set(externalRecord.id, externalRecord);
  model.claimCitations[0] = {
    ...model.claimCitations[0],
    verificationStatus: "independently_verified",
    evidenceIds: ["ev_claim", "ev_external"],
  };

  const rendered = dashboard.renderClaimEvidenceLadder(model);
  assert.match(rendered, /An external product-linked evidence record is attached/);
  assert.match(rendered, /Independent product-linked verification found/);
});

test("blocked pages and user-provided evidence are labelled without implying public verification", () => {
  const blocked = buildModel({
    blockedPage: { status: "blocked" },
    extractionStatus: "failed",
    foundCount: 0,
    checkedCount: 12,
  });
  assert.equal(dashboard.dashboardSummaryLabel(blocked), "Product page not fully readable");
  assert.match(dashboard.renderDashboardHeader(blocked), /Product page not fully readable/);

  const userRecord = evidenceRecord({
    id: "ev_user_claim",
    sourceType: "user_provided_evidence",
    verificationStatus: "user_provided",
    sourceUrl: null,
    excerpt: "User pasted: made with recycled polyester",
    captureMethod: "user_provided_evidence",
  });
  const userModel = buildModel({
    evidenceLedger: { records: [userRecord] },
    evidenceRecordIndex: new Map([[userRecord.id, userRecord]]),
    fields: {
      sustainabilityClaims: {
        status: "found",
        source: "user_provided_evidence",
        values: ["User pasted: made with recycled polyester"],
        evidenceIds: ["ev_user_claim"],
      },
    },
    claimCitations: [{
      id: "claim_user",
      category: "sustainability",
      originalWording: "User pasted: made with recycled polyester",
      sourceType: "user_provided_evidence",
      verificationStatus: "user_provided",
      confidenceDimension: "medium",
      evidenceIds: ["ev_user_claim"],
    }],
  });

  assert.match(dashboard.renderDashboardSources(userModel), /User-provided evidence/);
  assert.match(dashboard.renderClaimEvidenceLadder(userModel), /user provided/i);
  assert.match(dashboard.renderClaimEvidenceLadder(userModel), /No independent product-linked verification was found/);
});

test("missing and unavailable information render separately but compactly", () => {
  const model = buildModel();
  assert.deepEqual(dashboard.missingAndUnavailable(model), {
    missing: ["Colour/variant", "Certifications"],
    unavailable: ["Supplier/factory", "Durability"],
  });

  const rendered = dashboard.renderDashboardUnknowns(model);
  assert.match(rendered, /2 not found · 2 unavailable/);
  assert.match(rendered, /Show unavailable and unknown fields/);
  assert.match(rendered, /<h4>Not found<\/h4>/);
  assert.match(rendered, /Colour\/variant/);
  assert.match(rendered, /<h4>Unavailable<\/h4>/);
  assert.match(rendered, /Supplier\/factory/);
});

test("origin and care visualisations use only known data and keep text equivalents", () => {
  const model = buildModel();
  const origin = dashboard.renderOriginFlow(model);
  assert.match(origin, /Assembly country/);
  assert.match(origin, /Portugal/);
  assert.match(origin, /Raw material origin/);
  assert.match(origin, /Dyeing\/finishing/);
  assert.match(origin, /Not disclosed/);
  assert.doesNotMatch(origin, /Raw material → Textile production/);

  const care = dashboard.renderCareIcons(model);
  assert.match(care, /Machine wash at 30°C/);
  assert.match(care, /Do not tumble dry/);
  assert.match(care, /Iron at low temperature/);
  assert.match(care, /Original care text/);
  assert.match(care, /The physical garment care label remains leading/);
});

test("overview keeps evidence out of the main flow while preserving access", () => {
  const rendered = dashboard.renderDashboard(buildModel());
  const evidence = dashboard.renderDashboardSources(buildModel());
  assert.match(rendered, /aria-label="Product passport overview"/);
  assert.match(rendered, /aria-hidden="true"/);
  assert.match(rendered, /<summary>Original care text<\/summary>/);
  assert.doesNotMatch(rendered, /dashboard-evidence-list/);
  assert.doesNotMatch(rendered, /<q>/);
  assert.match(evidence, /dashboard-evidence-list/);
  assert.match(evidence, /<q>/);
  assert.match(styles, /\.dashboard-details summary:focus-visible/);
  assert.match(styles, /\.passport-inline-details summary:focus-visible/);
  assert.match(styles, /min-height:\s*44px/);
  assert.match(app, /event\.key === "ArrowRight"/);
});

test("evidence and long source text stay wrap-safe", () => {
  assert.match(styles, /\.dashboard-card\s*{[^}]*align-content:\s*start/s);
  assert.match(styles, /\.dashboard-evidence-list > li\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(styles, /\.dashboard-evidence-list q\s*{[^}]*display:\s*block/s);
  assert.match(styles, /\.dashboard-source-row a\s*{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(styles, /\.dashboard-origin-flow > li\s*{/);
  assert.match(styles, /\.dashboard-care-list > li\s*{/);
  assert.doesNotMatch(styles, /\.dashboard-origin-flow li\s*{/);
});

test("dashboard is responsive and avoids sustainability verdict language", () => {
  assert.match(styles, /overflow-x:\s*hidden/);
  assert.match(styles, /\.app-shell\s*{[^}]*width:\s*min\(1560px,\s*calc\(100% - 32px\)\)/s);
  assert.match(styles, /\.report-shell\s*{[^}]*width:\s*min\(1480px,\s*100%\)/s);
  assert.match(styles, /\.passport-overview\s*{[^}]*grid-template-columns:\s*236px minmax\(0,\s*1fr\)/s);
  assert.match(styles, /\.passport-module-body\s*{[^}]*display:\s*grid/s);
  assert.match(styles, /\.passport-module-body\.is-card-grid > \*\s*{[^}]*min-width:\s*0/s);
  assert.match(styles, /@media \(max-width:\s*940px\)[\s\S]*\.passport-side-nav[\s\S]*overflow-x:\s*auto/);
  assert.match(styles, /@media \(max-width:\s*680px\)[\s\S]*\.passport-fact-row,[\s\S]*\.passport-score-row,[\s\S]*\.dashboard-mini-facts div[\s\S]*grid-template-columns:\s*1fr/);
  assert.doesNotMatch(dashboardSource, /label:\s*["']Sustainable\b/i);
  assert.doesNotMatch(dashboard.renderDashboard(buildModel()), /Sustainable product|Good sustainability|Environmentally friendly|Responsible choice|Bad product/i);
});
