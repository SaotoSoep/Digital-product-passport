const form = document.getElementById("analysis-form");
const input = document.getElementById("product-url");
const button = document.getElementById("submit-button");
const statusBox = document.getElementById("status");
const stageList = document.getElementById("stage-list");
const reportPanel = document.getElementById("report");
const reportHeader = document.getElementById("report-header");
const overviewReportPanel = document.getElementById("report-panel-overview");
const evidenceReportPanel = document.getElementById("report-panel-evidence");
const technicalReportPanel = document.getElementById("report-panel-technical");
const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const exampleButtons = Array.from(document.querySelectorAll("[data-example-url]"));
const blockedFallback = document.getElementById("blocked-fallback");
const blockedReasonCode = document.getElementById("blocked-reason-code");
const blockedReason = document.getElementById("blocked-reason");
const blockedGuidance = document.getElementById("blocked-guidance");
const retryAnalysisButton = document.getElementById("retry-analysis-button");
const providedEvidenceForm = document.getElementById("provided-evidence-form");
const providedText = document.getElementById("provided-text");
const providedHtml = document.getElementById("provided-html");
const providedEvidenceButton = document.getElementById("provided-evidence-button");
const duplicateChoice = document.getElementById("duplicate-choice");
const duplicateMessage = document.getElementById("duplicate-message");
const openExistingButton = document.getElementById("open-existing-button");
const analysisOnlyButton = document.getElementById("analysis-only-button");
const saveDuplicateButton = document.getElementById("save-duplicate-button");

const stages = [
  "Read page",
  "Extract product data",
  "Identify unknowns",
  "Check claims",
  "Save report draft",
];

const checkedEvidenceFields = [
  ["productName", "Product name"],
  ["brand", "Brand"],
  ["productIdentifiers", "Product identifiers"],
  ["colorVariant", "Color/variant"],
  ["productDescription", "Description"],
  ["materialComposition", "Material"],
  ["sustainabilityClaims", "Sustainability claim"],
  ["careText", "Care"],
  ["supplierDetails", "Supplier/factory"],
  ["productionOrigin", "Origin/manufacturing"],
  ["certifications", "Certifications"],
  ["durabilityClaims", "Durability in use"],
];

const dppFieldDescriptions = {
  material_composition: {
    why: "Needed to understand sustainability, durability and recyclability.",
    action: "Check product specifications or ask the brand.",
  },
  manufacturing_location: {
    why: "Helps evaluate supply-chain transparency and labour conditions.",
    action: "Look for factory disclosures or contact the brand.",
  },
  certifications: {
    why: "Independent certifications can verify sustainability claims.",
    action: "Search for GOTS, OCS, GRS, Fairtrade or OEKO-TEX references.",
  },
  environmental_impact: {
    why: "Shows carbon footprint, water use and other sustainability indicators.",
    action: "Check whether the brand publishes impact reports.",
  },
  traceability: {
    why: "Shows where materials and components originate.",
    action: "Look for supplier or sourcing information.",
  },
  productIdentifiers: {
    why: "Helps connect the passport to the exact product, size, colour, SKU, or selling variant.",
    action: "Check the product specifications, URL, SKU details, or retailer product data.",
  },
  colorVariant: {
    why: "Variant data helps avoid mixing evidence from different colours, sizes, or product versions.",
    action: "Confirm the selected colour, size, and variant before using the passport data.",
  },
  materialComposition: {
    why: "Needed to understand sustainability, durability and recyclability.",
    action: "Check product specifications or ask the brand.",
  },
  careText: {
    why: "Care guidance affects product lifetime, use-phase impact, and repair or maintenance decisions.",
    action: "Check the care label, product specifications, or brand care guide.",
  },
  supplierDetails: {
    why: "Supplier and factory details help evaluate supply-chain transparency and labour conditions.",
    action: "Look for factory disclosures, supplier lists, or contact the brand.",
  },
  productionOrigin: {
    why: "Helps evaluate supply-chain transparency and labour conditions.",
    action: "Look for factory disclosures or contact the brand.",
  },
  durabilityClaims: {
    why: "Durability information helps estimate use life, repairability, and whether quality claims are supported.",
    action: "Look for warranty, repair, testing, or care-and-use evidence.",
  },
  rawMaterialProvenance: {
    why: "Shows where fibres or feedstock originate before they become fabric.",
    action: "Look for sourcing, farm, fibre, mill, or supplier information.",
  },
  supplyChainSteps: {
    why: "Shows the production journey from fibre to finished garment.",
    action: "Look for spinning, weaving, dyeing, finishing, transport, or supplier-stage disclosures.",
  },
  impactData: {
    why: "Shows carbon footprint, water use and other sustainability indicators.",
    action: "Check whether the brand publishes product impact data or impact reports.",
  },
  circularity: {
    why: "End-of-life and circularity guidance helps users repair, reuse, resell, or recycle the product.",
    action: "Look for repair guidance, take-back schemes, resale options, or recycling instructions.",
  },
  batchTraceability: {
    why: "Batch or lot data helps trace the exact production run if quality or compliance questions arise.",
    action: "Check labels, QR codes, product IDs, batch numbers, or shipment-level documentation.",
  },
  proofDocuments: {
    why: "Proof documents help verify claims with audits, certificates, tests, or third-party evidence.",
    action: "Ask for certificates, audit reports, test results, or independent verification documents.",
  },
};

let currentModel = null;
let activeTab = "overview";
let pendingDuplicate = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function known(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const cleaned = String(value).trim();
  return cleaned && cleaned !== "not_found" ? cleaned : "";
}

function normalizeStatus(status) {
  const allowed = new Set(["found", "not_found", "fallback", "unavailable", "success", "partial", "failed"]);
  return allowed.has(status) ? status : "unavailable";
}

function statusLabel(status) {
  const labels = {
    found: "Found",
    not_found: "Not found",
    fallback: "Fallback",
    unavailable: "Unavailable",
    success: "Success",
    partial: "Partial",
    failed: "Failed",
  };

  return labels[normalizeStatus(status)];
}

function statusBadge(status) {
  const normalized = normalizeStatus(status);
  return `<span class="status-badge status-${normalized}">${statusLabel(normalized)}</span>`;
}

function evidenceSourceLabel(source) {
  const labels = {
    brand_statement: "Brand statement",
    public_page_evidence: "Public page evidence",
    external_evidence: "External evidence",
    missing_information: "Missing information",
    interpretation: "Interpretation",
    product_page_deep_read: "Product page deep read",
    product_page_basic_extraction: "Product page basic extraction",
    user_provided_evidence: "User-provided evidence",
    brand_page: "Brand page",
    public_database: "Public database",
    agent_interpretation: "Agent interpretation",
  };

  return labels[source] || displayText(source);
}

function displayText(value, emptyText = "") {
  return known(value) || known(emptyText);
}

function displayMachineStatus(value, fallback = "") {
  return String(value || fallback).trim().replaceAll("_", " ");
}

function cleanReadableText(value) {
  const text = displayText(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[‘’]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([a-z)])(Machine wash|Inside leg|Model wears|Relaxed fit|Hook, bar|Do not|Niet )/g, "$1 $2")
    .trim();
  const parts = text.split(/(?<=[.!?])\s+/);
  const seen = new Set();
  const uniqueParts = [];

  for (const part of parts) {
    const cleaned = part.trim();
    const key = cleaned.toLowerCase();

    if (!cleaned || seen.has(key)) {
      continue;
    }

    uniqueParts.push(cleaned);
    seen.add(key);
  }

  return uniqueParts.join(" ");
}

function truncateReadableText(value, maxLength = 260) {
  const text = cleanReadableText(value);

  if (text.length <= maxLength) {
    return text;
  }

  const shortened = text.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
  return `${shortened}...`;
}

function fieldValues(field) {
  return field && Array.isArray(field.values)
    ? field.values.map(cleanReadableText).filter(Boolean)
    : [];
}

function fieldFallbackValues(field) {
  const fallback = field && field.fallback;
  return fallback && Array.isArray(fallback.values)
    ? fallback.values.map(cleanReadableText).filter(Boolean)
    : [];
}

function firstFieldValue(field, fallback) {
  const values = fieldValues(field);
  if (values.length > 0) {
    return values[0];
  }

  const fallbackValues = fieldFallbackValues(field);
  if (fallbackValues.length > 0) {
    return fallbackValues[0];
  }

  return known(fallback);
}

function fieldDisplayValue(field, fallback) {
  const values = fieldValues(field);
  if (values.length > 0) {
    return cleanReadableText(values.join(" "));
  }

  const fallbackValues = fieldFallbackValues(field);
  if (fallbackValues.length > 0) {
    return cleanReadableText(fallbackValues.join(" "));
  }

  return cleanReadableText(fallback);
}

function usefulReportText(value) {
  const text = cleanReadableText(value);

  if (!text || /^(no clear|not found|product name not found|brand not found|care information not found|origin\/manufacturing information not found|supplier\/factory information not found|material not found)/i.test(text)) {
    return "";
  }

  return text;
}

function scoreValue(score) {
  if (!score || score.status === "not_available") {
    return { ...(score || {}), status: "not_available", score: null };
  }

  const numeric = Number(score && score.score);
  if (!Number.isFinite(numeric)) {
    return { ...score, status: "not_available", score: null };
  }

  return {
    ...score,
    status: "scored",
    score: Math.max(0, Math.min(100, Math.round(numeric))),
  };
}

function fallbackPassportReadiness(fields, evidenceFields) {
  const readyFields = evidenceFields
    .filter((item) => item.status === "found")
    .map((item) => ({
      key: item.key,
      label: item.label,
      value: fieldDisplayValue(fields[item.key], ""),
      detail: "Found in normalized product-page evidence.",
      source: fields[item.key]?.sourceLabel || "Submitted product page",
    }))
    .filter((item) => item.value);
  const missingFields = evidenceFields
    .filter((item) => item.status === "not_found" || item.status === "unavailable")
    .map((item) => ({
      key: item.key,
      label: item.label,
      detail: item.status === "unavailable"
        ? "The source could not be read well enough to determine whether this is disclosed."
        : "Checked on the available product page, but not found.",
    }));

  return {
    status: readyFields.length > 0 ? "partial" : "limited",
    label: readyFields.length > 0 ? "Partial passport profile" : "Limited passport evidence",
    summary: `${readyFields.length} passport-ready data group(s) found. ${missingFields.length} checked field(s) still need evidence.`,
    readyFields,
    missingFields,
    warnings: [],
    counts: {
      ready: readyFields.length,
      missing: missingFields.length,
      warnings: 0,
    },
  };
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isValidProductUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function setStatus(message, tone = "muted") {
  statusBox.textContent = message;
  statusBox.dataset.tone = tone;
}

function renderTextValue(value, emptyText) {
  const cleaned = cleanReadableText(value);
  const rendered = cleaned || cleanReadableText(emptyText);
  return `<p${cleaned ? "" : " class=\"muted\""}>${escapeHtml(rendered)}</p>`;
}

function renderCitations(records) {
  if (!Array.isArray(records) || records.length === 0) return "";

  return `<div class="citation-list">${records.map((record) => {
    const label = `${record.id} · ${evidenceSourceLabel(record.sourceType)} · ${record.verificationStatus} · ${record.extractionConfidence} confidence`;
    const excerpt = truncateReadableText(record.excerpt, 180);
    return `<div class="citation-item">
      ${isValidProductUrl(record.sourceUrl)
        ? `<a href="${escapeHtml(record.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`
        : `<span>${escapeHtml(label)}</span>`}
      <q>${escapeHtml(excerpt)}</q>
    </div>`;
  }).join("")}</div>`;
}

function renderSummaryCard(label, value, emptyText, options = {}) {
  return `
    <article class="summary-block ${options.wide ? "wide" : ""}">
      <span class="mini-label">${escapeHtml(label)}</span>
      ${renderTextValue(value, emptyText)}
      ${options.interpretation ? `<p class="interpretation-note">Interpretation — not a cited product fact.</p>` : ""}
      ${renderCitations(options.citations)}
    </article>
  `;
}

function splitLabeledFacts(values) {
  const facts = [];
  const seen = new Set();
  const topLevelLabels = "Supplier|Country|Factory|Address|Employees|Product no\\.|Product SKU|Internal product ID|GTIN|Size identifiers";
  const separator = new RegExp(`;\\s*(?=(?:${topLevelLabels}):)`, "i");

  for (const value of values) {
    for (const part of cleanReadableText(value).split(separator)) {
      const match = part.match(/^([^:]+):\s*(.+)$/) ||
        part.match(/^(Product no\.|Product SKU|Internal product ID)\s+(.+)$/i);
      const rawLabel = cleanReadableText(match ? match[1] : "");
      const label = rawLabel.toLowerCase() === "country of origin" ? "Country" : rawLabel;
      const detail = cleanReadableText(match ? match[2] : part);
      const key = `${label.toLowerCase()}\u0000${detail.toLowerCase()}`;

      if (!detail || seen.has(key)) {
        continue;
      }

      facts.push({ label, detail });
      seen.add(key);
    }
  }

  return facts;
}

function renderStructuredSummaryCard(label, values, emptyText, options = {}) {
  const includedLabels = new Set((options.includeLabels || []).map((value) => value.toLowerCase()));
  const labelOrder = (options.labelOrder || []).map((value) => value.toLowerCase());
  const seenLabels = new Set();
  const facts = splitLabeledFacts(values).filter((fact) => (
    includedLabels.size === 0 || includedLabels.has(fact.label.toLowerCase())
  )).filter((fact) => {
    const key = fact.label.toLowerCase();

    if (!options.uniqueLabels || !key || !seenLabels.has(key)) {
      if (key) seenLabels.add(key);
      return true;
    }

    return false;
  }).sort((left, right) => {
    const leftIndex = labelOrder.indexOf(left.label.toLowerCase());
    const rightIndex = labelOrder.indexOf(right.label.toLowerCase());
    const leftRank = leftIndex === -1 ? labelOrder.length : leftIndex;
    const rightRank = rightIndex === -1 ? labelOrder.length : rightIndex;
    return leftRank - rightRank;
  });

  return `
    <article class="summary-block ${options.wide ? "wide" : ""}">
      <span class="mini-label">${escapeHtml(label)}</span>
      ${facts.length > 0
        ? `<dl class="summary-facts">${facts.map((fact) => `
            <div>
              ${fact.label ? `<dt>${escapeHtml(fact.label)}</dt>` : ""}
              <dd>${escapeHtml(fact.detail)}</dd>
            </div>
          `).join("")}</dl>`
        : `<p class="muted">${escapeHtml(cleanReadableText(emptyText))}</p>`}
      ${renderCitations(options.citations)}
    </article>
  `;
}

function renderStages(activeIndex = -1, mode = "idle") {
  stageList.innerHTML = stages
    .map((stage, index) => {
      let state = "pending";

      if (mode === "complete") {
        state = "done";
      } else if (mode === "error") {
        state = index < activeIndex ? "done" : index === activeIndex ? "error" : "pending";
      } else if (mode === "running") {
        state = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
      }

      return `
        <li class="stage-item ${state}">
          <span class="stage-dot" aria-hidden="true"></span>
          <span>${escapeHtml(stage)}</span>
        </li>
      `;
    })
    .join("");
}

function extractModel(response, submittedUrl) {
  const storedPassport = response.passport || null;
  const analysis = response.analysis || response;
  const report = analysis.report || response.report || response;
  const metadata = analysis.metadata || {};
  const snapshot = storedPassport?.snapshot || metadata.productPageSnapshot || null;
  const evidence = storedPassport?.report?.productPageEvidence || report.productPageEvidence || null;
  const fields = evidence?.fields || {};
  const evidenceLedger = report.evidenceLedger || evidence?.evidenceLedger || { records: [] };
  const evidenceRecordIndex = new Map((evidenceLedger.records || []).map((record) => [record.id, record]));
  for (const field of Object.values(fields)) {
    field.citationRecords = (field.evidenceIds || []).map((id) => evidenceRecordIndex.get(id)).filter(Boolean);
  }
  const productName = firstFieldValue(
    fields.productName,
    known(storedPassport?.productName) || known(snapshot?.likelyProductName) || "Product name not found"
  );
  const brand = firstFieldValue(
    fields.brand,
    known(storedPassport?.brand) || known(snapshot?.likelyBrand) || "Brand not found"
  );
  const retailer = known(storedPassport?.retailer) || known(metadata.retailer) || new URL(submittedUrl).hostname.replace(/^www\./, "");
  const evidenceMaterial = fieldDisplayValue(
    fields.materialComposition,
    ""
  );
  const material = evidenceMaterial || "Material not found";
  const materialExplanation = cleanReadableText(report.materialExplained?.simpleExplanation);
  const materialItems = Array.isArray(report.materialExplained?.materials)
    ? report.materialExplained.materials
      .map((materialItem) => ({
        name: cleanReadableText(materialItem.name),
        percentage: cleanReadableText(materialItem.percentage),
        explanation: cleanReadableText(materialItem.explanation),
      }))
      .filter((materialItem) => materialItem.name)
    : [];
  const identifiers = fieldDisplayValue(
    fields.productIdentifiers,
    ""
  );
  const identifierValues = fieldValues(fields.productIdentifiers);
  const colorVariant = fieldDisplayValue(
    fields.colorVariant,
    ""
  );
  const colorVariantValues = fieldValues(fields.colorVariant);
  const productSummary = known(report.productSummary);
  const rawProductDescription = fieldDisplayValue(
    fields.productDescription,
    ""
  );
  const productDescription = productSummary || rawProductDescription;
  const evidenceCare = fieldDisplayValue(
    fields.careText,
    ""
  );
  const care = evidenceCare || "Care information not found";
  const evidenceOrigin = fieldDisplayValue(
    fields.productionOrigin,
    ""
  );
  const originValues = fieldValues(fields.productionOrigin);
  const origin = evidenceOrigin || "Origin/manufacturing information not found";
  const evidenceSupplierDetails = fieldDisplayValue(
    fields.supplierDetails,
    ""
  );
  const supplierDetailValues = fieldValues(fields.supplierDetails);
  const productionOriginValues = [
    ...supplierDetailValues,
    ...originValues,
  ];
  const supplierDetails = evidenceSupplierDetails || "Supplier/factory information not found";
  const certifications = fieldValues(fields.certifications);
  const durabilityClaims = fieldValues(fields.durabilityClaims);
  const claimValues = fieldValues(fields.sustainabilityClaims);
  const fallbackClaims = fieldFallbackValues(fields.sustainabilityClaims);
  const claims = Array.isArray(report.sustainabilityClaimsFound)
    ? report.sustainabilityClaimsFound
    : Array.isArray(report.claims)
      ? report.claims
      : [];
  const unknowns = Array.isArray(report.unknowns)
    ? report.unknowns
    : Array.isArray(report.missingInformation)
      ? report.missingInformation.map((item) => `${item.label}: ${item.value}`)
      : [];
  const extractionStatus = known(evidence?.extractionStatus) || known(snapshot?.extractionStatus) || known(storedPassport?.extractionStatus) || "partial";
  const generatedAt = known(metadata.generatedAt) || known(storedPassport?.createdAt);
  const sourceUrl = known(snapshot?.sourceUrl) || submittedUrl;
  const brandInsight = report.brandInsight || {
    status: "not_found",
    brand,
    summary: "No public brand context was returned by the current analyzer.",
    sources: [],
  };
  const accessDiagnostics = report.accessDiagnostics || snapshot?.accessIssue || null;
  const evidenceFields = checkedEvidenceFields.map(([key, label]) => ({
    key,
    label,
    field: fields[key],
    status: normalizeStatus(fields[key]?.status),
  }));
  const passportReadiness = report.passportReadiness ||
    fallbackPassportReadiness(fields, evidenceFields);
  const foundCount = evidenceFields.filter((item) => item.status === "found").length;
  const checkedCount = evidenceFields.length;
  const missingCount = evidenceFields.filter((item) => item.status === "not_found").length;
  const unavailableCount = evidenceFields.filter((item) => item.status === "unavailable").length;

  return {
    submittedUrl,
    storedPassport,
    responseLinks: response.links || {},
    report,
    metadata,
    snapshot,
    evidence,
    evidenceLedger,
    evidenceRecordIndex,
    fields,
    productName,
    brand,
    retailer,
    material,
    evidenceMaterial,
    materialExplanation,
    materialItems,
    identifiers,
    identifierValues,
    colorVariant,
    colorVariantValues,
    productDescription,
    rawProductDescription,
    care,
    evidenceCare,
    supplierDetails,
    supplierDetailValues,
    productionOriginValues,
    evidenceSupplierDetails,
    origin,
    originValues,
    evidenceOrigin,
    certifications,
    durabilityClaims,
    claims,
    claimCitations: Array.isArray(report.claimCitations) ? report.claimCitations : [],
    claimValues,
    fallbackClaims,
    unknowns,
    extractionStatus,
    generatedAt,
    sourceUrl,
    brandInsight,
    deepPageReadEvidence: report.deepPageReadEvidence || metadata.deepPageReadEvidence || null,
    deepReadMode: report.deepReadMode || report.deepPageReadEvidence?.mode || metadata.deepPageReadEvidence?.mode || "",
    deepReadNote: report.deepReadNote || report.deepPageReadEvidence?.note || metadata.deepPageReadEvidence?.note || "",
    blockedPage: report.blockedPage || null,
    userProvidedEvidence: report.userProvidedEvidence || evidence?.userProvidedEvidence || null,
    accessDiagnostics,
    passportReadiness,
    evidenceFields,
    foundCount,
    checkedCount,
    missingCount,
    unavailableCount,
    transparencyScore: scoreValue(report.transparencyScore),
    claimScore: scoreValue(report.claimStrengthScore),
    productSummary,
    conclusion: known(report.conclusion),
    originReport: report.productionOriginTransparency || null,
    sources: Array.isArray(report.sources) ? report.sources : [],
  };
}

function renderDeepPageReadEvidence(model) {
  const evidence = model.deepPageReadEvidence;

  if (!evidence) {
    return `
      <article class="evidence-checklist">
        <div class="checklist-header">
          <div>
            <span class="mini-label">Deep page read evidence</span>
            <h3>Basic fallback used</h3>
          </div>
          <span class="coverage-pill">fallback</span>
        </div>
        <p class="source-line">Production deep read was not configured for this run. The report used basic product-page extraction only.</p>
      </article>
    `;
  }

  const counts = evidence.counts || {};
  const labels = Array.isArray(evidence.sectionLabels)
    ? evidence.sectionLabels.map(cleanReadableText).filter(Boolean)
    : [];
  const status = displayText(evidence.status || "unknown");
  const sourceUnavailable = status === "failed";
  const mode = displayText(evidence.mode || model.deepReadMode || (
    status === "success" ? "Deep read successful" :
    status === "partial" ? "Production deep read partial" :
    status === "failed" ? "Deep read blocked" :
    "Basic fallback used"
  ));
  const badgeStatus = status === "success"
    ? "found"
    : status === "skipped"
    ? "unavailable"
    : normalizeStatus(status);

  return `
    <article class="evidence-checklist">
      <div class="checklist-header">
        <div>
          <span class="mini-label">Deep page read evidence</span>
          <h3>${escapeHtml(mode)}</h3>
        </div>
        <span class="coverage-pill">${escapeHtml(sourceUnavailable ? "Public/source evidence unavailable" : status)}</span>
      </div>
      <div class="checklist-grid">
        <div class="checklist-item found"><span>Tabs clicked</span><strong>${Number(counts.tabsClicked || 0)}</strong></div>
        <div class="checklist-item found"><span>Accordions opened</span><strong>${Number(counts.accordionsOpened || 0)}</strong></div>
        <div class="checklist-item found"><span>Read-more expanded</span><strong>${Number(counts.readMoreExpanded || 0)}</strong></div>
        <div class="checklist-item found"><span>Structured data blocks</span><strong>${Number(counts.structuredDataBlocks || 0)}</strong></div>
        <div class="checklist-item found"><span>Relevant network responses</span><strong>${Number(counts.relevantNetworkResponses || 0)}</strong></div>
      </div>
      ${
        labels.length > 0
          ? `<p class="source-line">Sections opened: ${escapeHtml(labels.slice(0, 12).join(" · "))}</p>`
          : ""
      }
      ${
        evidence.failureReason
          ? `<p class="source-line">Deep read note: ${escapeHtml(cleanReadableText(evidence.failureReason))}</p>`
          : ""
      }
      ${
        evidence.note || model.deepReadNote
          ? `<p class="source-line">${escapeHtml(cleanReadableText(evidence.note || model.deepReadNote))}</p>`
          : ""
      }
    </article>
  `;
}

function renderUserProvidedEvidence(model) {
  const evidence = model.userProvidedEvidence;
  if (!evidence) return "";

  const fields = Object.values(evidence.fields || {});
  return `
    <article class="evidence-checklist user-provided-card">
      <div class="checklist-header">
        <div>
          <span class="mini-label">User-provided evidence</span>
          <h3>${escapeHtml(displayText(evidence.label || "User-provided product content"))}</h3>
        </div>
        <span class="coverage-pill">not independently fetched</span>
      </div>
      <p class="source-line">Used only for this analysis and kept separate from public retailer-page evidence. It is not independent verification.</p>
      <p class="source-line">${fields.length} extracted field group(s) · ${Number(evidence.contentLength || 0)} characters provided</p>
    </article>
  `;
}

function buildVerdict(model) {
  const hasClaims = model.claimValues.length > 0 || model.fallbackClaims.length > 0 || model.claims.length > 0;
  const extractionFailed = model.extractionStatus === "failed";

  if (extractionFailed) {
    return {
      label: "Limited read",
      tone: "risk",
      summary: "The agent could not read enough visible page content to judge the product claims.",
    };
  }

  if (!hasClaims) {
    return {
      label: "No clear sustainability claim",
      tone: "neutral",
      summary: "The current scan did not find a clear sustainability claim on the product page.",
    };
  }

  if (model.claimScore.status !== "scored") {
    return {
      label: "Claim evidence unavailable",
      tone: "neutral",
      summary: model.claimScore.rationale || "There is not enough readable product-level evidence to score claim strength.",
    };
  }

  if (model.claimScore.score < 45) {
    return {
      label: "Claim needs proof",
      tone: "warning",
      summary: "Claim-like wording was found, but the evidence is still mostly product-page text from the brand.",
    };
  }

  return {
    label: "Brand claim found",
    tone: "attention",
    summary: "The page includes claim-like wording. Treat it as something to verify, not independent proof.",
  };
}

function renderScoreFactors(title, factors, className) {
  if (!Array.isArray(factors) || factors.length === 0) {
    return "";
  }

  return `
    <div class="score-factors ${className}">
      <span>${escapeHtml(title)}</span>
      <ul>${factors.map((factor) => `
        <li>
          <strong>${escapeHtml(factor.label)}</strong>
          ${factor.reason ? `<span>${escapeHtml(cleanReadableText(factor.reason))}</span>` : ""}
        </li>
      `).join("")}</ul>
    </div>
  `;
}

function renderScore(label, score) {
  const available = score && score.status === "scored";
  const numericScore = available ? score.score : 0;
  const displayScore = available ? `${numericScore}/100` : "Not available";

  return `
    <div class="score-card ${available ? "" : "score-unavailable"}">
      <div class="score-topline">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(displayScore)}</strong>
      </div>
      ${available ? `<div class="score-track" aria-hidden="true"><span style="width: ${numericScore}%"></span></div>` : ""}
      ${score?.rationale ? `<p>${escapeHtml(cleanReadableText(score.rationale))}</p>` : ""}
      ${renderScoreFactors("Top positive", score?.topPositiveFactors, "positive")}
      ${renderScoreFactors("Most important missing", score?.missingFactors, "missing")}
    </div>
  `;
}

function renderFieldBlock(title, field, emptyText) {
  const status = normalizeStatus(field?.status);
  const values = fieldValues(field);
  const fallbackValues = fieldFallbackValues(field);
  const sourceLabel = known(field?.sourceLabel);
  const sourceUrl = known(field?.sourceUrl);
  const extractedAt = formatDateTime(field?.extractedAt);

  return `
    <article class="evidence-row">
      <div class="row-header">
        <h3>${escapeHtml(title)}</h3>
        ${statusBadge(status)}
      </div>
      <div class="row-content">
        ${
          values.length > 0
            ? values.map((value) => `<p>${escapeHtml(cleanReadableText(value))}</p>`).join("")
            : `<p class="muted">${escapeHtml(displayText(emptyText))}</p>`
        }
        ${
          fallbackValues.length > 0
            ? `<div class="fallback-strip">
                <span>Fallback value</span>
                ${fallbackValues.map((value) => `<p>${escapeHtml(cleanReadableText(value))}</p>`).join("")}
                ${field?.fallback?.note ? `<p class="muted">${escapeHtml(cleanReadableText(field.fallback.note))}</p>` : ""}
              </div>`
            : ""
        }
      </div>
      ${renderCitations(field?.citationRecords)}
      ${
        sourceLabel || sourceUrl || extractedAt
          ? `<p class="source-line">${escapeHtml([displayText(sourceLabel), sourceUrl, extractedAt].filter(Boolean).join(" · "))}</p>`
          : ""
      }
    </article>
  `;
}

function renderEvidenceChecklist(model) {
  const evidenceLabel = model.userProvidedEvidence ? "Evidence used" : "Checked on product page";
  return `
    <article class="evidence-checklist">
      <div class="checklist-header">
        <div>
          <span class="mini-label">${escapeHtml(evidenceLabel)}</span>
          <h3>${model.foundCount}/${model.checkedCount} relevant fields found</h3>
        </div>
        <span class="coverage-pill">${model.missingCount} not found</span>
      </div>
      <div class="checklist-grid">
        ${model.evidenceFields.map(({ label, status }) => `
          <div class="checklist-item ${status}">
            <span>${escapeHtml(label)}</span>
            ${statusBadge(status)}
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function readinessTone(status) {
  if (status === "useful") {
    return "neutral";
  }

  if (status === "limited") {
    return "risk";
  }

  return "warning";
}

function renderReadinessList(items, emptyText, itemClass = "", options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  }

  const showDetails = options.showDetails !== false;

  return `
    <ul class="readiness-list ${itemClass}">
      ${items.map((item) => `
        <li>
          <strong>${escapeHtml(displayText(item.label || item.key || "Passport item"))}</strong>
          ${item.value ? `<span>${escapeHtml(cleanReadableText(item.value))}</span>` : ""}
          ${showDetails && item.detail ? `<p>${escapeHtml(cleanReadableText(item.detail))}</p>` : ""}
        </li>
      `).join("")}
    </ul>
  `;
}

function renderMissingDppField(item) {
  const label = displayText(item.label || item.key || "Passport item");
  const detail = displayText(item.detail || "");
  const info = dppFieldDescriptions[item.key] || null;

  return `
    <article class="missing-dpp-item">
      <div class="missing-dpp-heading">
        <span class="missing-icon" aria-hidden="true">!</span>
        <h4>${escapeHtml(label)}</h4>
      </div>
      ${detail ? `<p class="missing-detail">${escapeHtml(cleanReadableText(detail))}</p>` : ""}
      ${
        info
          ? `<div class="missing-guidance">
              <p><strong>Why it matters:</strong> ${escapeHtml(cleanReadableText(info.why))}</p>
              <p><strong>What you can do:</strong> ${escapeHtml(cleanReadableText(info.action))}</p>
            </div>`
          : ""
      }
    </article>
  `;
}

function renderMissingDppFields(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">No DPP gaps were returned.</p>`;
  }

  return `
    <div class="missing-dpp-list">
      ${items.map(renderMissingDppField).join("")}
    </div>
  `;
}

function renderPassportReadiness(model) {
  const readiness = model.passportReadiness || {};
  const counts = readiness.counts || {};
  const readyFields = Array.isArray(readiness.readyFields)
    ? readiness.readyFields
    : [];
  const missingFields = Array.isArray(readiness.missingFields) ? readiness.missingFields : [];
  const warnings = Array.isArray(readiness.warnings) ? readiness.warnings : [];

  return `
    <article class="passport-analysis">
      <div class="analysis-heading">
        <div>
          <span class="mini-label">Product passport analysis</span>
          <h3>${escapeHtml(displayText(readiness.label || "Passport readiness"))}</h3>
          <p>${escapeHtml(cleanReadableText(readiness.summary || "The analyzer checked which product-passport fields are present and which still need proof."))}</p>
        </div>
        <span class="verdict-pill ${readinessTone(readiness.status)}">${escapeHtml(displayText(readiness.status || "partial"))}</span>
      </div>
      <div class="readiness-metrics" aria-label="Passport readiness counts">
        <div><strong>${Number(counts.ready || readyFields.length)}</strong><span>ready</span></div>
        <div><strong>${Number(counts.missing || missingFields.length)}</strong><span>missing</span></div>
        <div><strong>${Number(counts.warnings || warnings.length)}</strong><span>warnings</span></div>
      </div>
      <div class="readiness-columns">
        <section>
          <h4>Usable for the passport</h4>
          ${renderReadinessList(readyFields.slice(0, 6), "No passport-ready fields were found yet.", "", { showDetails: false })}
        </section>
        <section>
          <h4>Still missing</h4>
          ${renderReadinessList(missingFields.slice(0, 6), "No DPP gaps were returned by the analyzer.", "missing")}
        </section>
      </div>
      ${
        warnings.length > 0
          ? `<section class="warning-strip">
              <h4>Warnings</h4>
              ${renderReadinessList(warnings, "No warnings.", "warnings")}
            </section>`
          : ""
      }
    </article>
  `;
}

function renderClaimItem(claim, evidenceRecordIndex = new Map()) {
  const claimText = known(claim.originalWording) || known(claim.brandClaim) || known(claim.claim) || "Claim text not found";
  const confidence = known(claim.confidenceDimension) || known(claim.confidence) || "medium";
  const type = known(claim.sourceType) || known(claim.type);
  const verificationStatus = String(claim.verificationStatus || "interpretation").trim();
  const whyItMatters = known(claim.note) || known(claim.whyItMatters);
  const records = (claim.evidenceIds || []).map((id) => evidenceRecordIndex.get(id)).filter(Boolean);

  return `
    <article class="claim-row">
      <div class="row-header">
        <h3>${escapeHtml(cleanReadableText(claimText))}</h3>
        <span class="confidence-badge">${escapeHtml(displayText(confidence))}</span>
      </div>
      ${claim.category ? `<p><strong>Category:</strong> ${escapeHtml(cleanReadableText(claim.category))}</p>` : ""}
      ${type ? `<p><strong>Source type:</strong> ${escapeHtml(evidenceSourceLabel(type))}</p>` : ""}
      <p><strong>Verification:</strong> ${escapeHtml(displayMachineStatus(verificationStatus))}</p>
      ${renderCitations(records)}
      ${whyItMatters ? `<p class="muted">${escapeHtml(cleanReadableText(whyItMatters))}</p>` : ""}
    </article>
  `;
}

function passportStatusLabel(status) {
  const labels = {
    draft: "Saved report draft",
    "analysis only": "Analysis only",
    stored: "Saved report",
  };

  return labels[status] || status;
}

function brandSourceLinkLabel(source) {
  const topic = known(source.topic);
  const label = known(source.label);
  const sourceUrl = known(source.url).toLowerCase();

  if (sourceUrl.includes("design-philosophy")) {
    return "Design philosophy";
  }

  if (sourceUrl.includes("quality")) {
    return "Quality";
  }

  if (sourceUrl.includes("about")) {
    return "About";
  }

  return displayText(topic) || label || source.url;
}

function renderReportHeader(model) {
  reportHeader.innerHTML = ProductPassportDashboard.renderDashboardHeader(model);
}

function renderModuleFieldBlocks(rows) {
  return rows.map(({ title, field, emptyText }) => renderFieldBlock(title, field, emptyText)).join("");
}

function renderModuleEmpty(title, description) {
  return `
    <article class="empty-row">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
    </article>
  `;
}

function renderClaimEvidenceRows(model) {
  const displayedClaims = model.claimCitations.length > 0 ? model.claimCitations : model.claims;

  return displayedClaims.length > 0
    ? displayedClaims.map((claim) => renderClaimItem(claim, model.evidenceRecordIndex)).join("")
    : renderModuleEmpty("No claim rows", "The analyzer did not return structured claim evidence for this product.");
}

function renderModuleShell(kind, bodyByKey) {
  const modules = ProductPassportDashboard.passportModuleDefinitions(kind).map((module) => ({
    ...module,
    body: typeof bodyByKey[module.key] === "object"
      ? bodyByKey[module.key].body
      : bodyByKey[module.key] || renderModuleEmpty(`${module.label} details unavailable`, "No details were returned for this passport module."),
    layout: typeof bodyByKey[module.key] === "object" ? bodyByKey[module.key].layout : "",
  }));

  return ProductPassportDashboard.renderPassportModuleShell({
    ariaLabel: `Product passport ${kind} modules`,
    modules,
  });
}

function renderEvidenceReport(model) {
  return renderModuleShell("evidence", {
    summary: `
      <article class="passport-section">
        <div class="passport-section-heading">
          <div>
            <p class="mini-label">Evidence</p>
            <h4>Grouped source trail</h4>
          </div>
        </div>
        <p>Grouped sources, confidence, verification status, URLs, and excerpts used by this report.</p>
      </article>
      ${ProductPassportDashboard.renderDashboardSources(model)}
    `,
    keyFacts: {
      body: renderModuleFieldBlocks([
        { title: "Product name", field: model.fields.productName, emptyText: "Product name was not returned." },
        { title: "Brand", field: model.fields.brand, emptyText: "Brand was not returned." },
        { title: "Product identifiers", field: model.fields.productIdentifiers, emptyText: "No product identifiers were found." },
        { title: "Color/variant", field: model.fields.colorVariant, emptyText: "No color or variant was found." },
        { title: "Product description", field: model.fields.productDescription, emptyText: "No product description was returned." },
      ]),
      layout: "card-grid",
    },
    material: {
      body: renderModuleFieldBlocks([
        { title: "Material composition", field: model.fields.materialComposition, emptyText: "Material composition was not found in the normalized page evidence." },
        { title: "Certifications or standards", field: model.fields.certifications, emptyText: "No certification, standard, or third-party reference was found in the normalized page evidence." },
      ]),
      layout: "card-grid",
    },
    claims: `
      ${renderClaimEvidenceRows(model)}
      ${renderModuleFieldBlocks([
        { title: "Sustainability claim on product page", field: model.fields.sustainabilityClaims, emptyText: "No sustainability claim was found in the normalized page evidence." },
        { title: "Certification or standard", field: model.fields.certifications, emptyText: "No certification, standard, or third-party reference was found in the normalized page evidence." },
      ])}
    `,
    traceability: {
      body: renderModuleFieldBlocks([
        { title: "Origin and manufacturing", field: model.fields.productionOrigin, emptyText: "Country, factory, supplier, or traceability detail was not found in the normalized page evidence." },
        { title: "Supplier and factory details", field: model.fields.supplierDetails, emptyText: "Supplier, factory, country, address, or employee count was not found in the normalized page evidence." },
      ]),
      layout: "card-grid",
    },
    care: {
      body: renderModuleFieldBlocks([
        { title: "Care instructions", field: model.fields.careText, emptyText: "Care instructions were not found in the normalized page evidence." },
        { title: "Durability, repair, or warranty", field: model.fields.durabilityClaims, emptyText: "No direct claim about longevity, repair, wear, warranty, or test results was found on the product page." },
      ]),
      layout: "card-grid",
    },
    missing: `
      ${ProductPassportDashboard.renderEvidenceCoverage(model)}
      ${renderConsumerUnknowns(model)}
      ${renderTechnicalDisclosure(
        "All normalized field evidence",
        "Every checked field and citation remains available.",
        renderRawEvidence(model)
      )}
    `,
  });
}

function renderOverviewTab(model) {
  const primaryDescription = model.productSummary || model.productDescription;
  const descriptionLabel = model.productSummary ? "Product summary" : "Product-page description";

  return `
    <section class="stack">
      ${renderPassportReadiness(model)}
      ${renderUserProvidedEvidence(model)}
      ${renderDeepPageReadEvidence(model)}
      ${renderEvidenceChecklist(model)}
      <div class="content-grid">
      ${renderSummaryCard(descriptionLabel, primaryDescription, "Not found.", { wide: true, interpretation: Boolean(model.productSummary) })}
      ${renderSummaryCard("Material insight", model.material, "Not found.", { citations: model.fields.materialComposition?.citationRecords })}
      ${renderSummaryCard("Care guidance", model.care, "Not found.", { citations: model.fields.careText?.citationRecords })}
      ${renderStructuredSummaryCard("Production Origin", model.productionOriginValues, "Not found.", {
        wide: true,
        citations: [...(model.fields.productionOrigin?.citationRecords || []), ...(model.fields.supplierDetails?.citationRecords || [])],
        includeLabels: ["Country", "Supplier", "Factory", "Address", "Employees"],
        labelOrder: ["Country", "Supplier", "Factory", "Address", "Employees"],
        uniqueLabels: true,
      })}
      ${renderStructuredSummaryCard("Product identifiers", model.identifierValues, "Not found.")}
      ${renderStructuredSummaryCard("Color / variant", model.colorVariantValues, "Not found.", {
        includeLabels: ["Color", "Color reference"],
        labelOrder: ["Color", "Color reference"],
        uniqueLabels: true,
      })}
      ${renderSummaryCard("Certifications", model.certifications.length ? model.certifications.join(" ") : "", "Not found.", { citations: model.fields.certifications?.citationRecords })}
      ${renderSummaryCard("Conclusion", model.conclusion, "Not found.", { wide: true, interpretation: true })}
      ${renderSummaryCard("Brand context", model.brandInsight.summary, "Not found.", { wide: true })}
      </div>
    </section>
  `;
}

function renderClaimsTab(model) {
  const displayedClaims = model.claimCitations.length > 0 ? model.claimCitations : model.claims;
  const claimStrengthSummary = model.claimScore.status === "not_available"
    ? "Not available"
    : `${Number(model.claimScore.score)}/100`;
  const claimRows = displayedClaims.length > 0
    ? displayedClaims.map((claim) => renderClaimItem(claim, model.evidenceRecordIndex)).join("")
    : `<article class="empty-row"><h3>No claim rows</h3><p>The analyzer did not return structured sustainability claims for this URL.</p></article>`;

  return `
    <section class="stack">
      ${renderSummaryCard("Claim strength", claimStrengthSummary, "Not found.", { wide: true })}
      <div class="section-divider">
        <span>Claim analysis</span>
      </div>
      ${claimRows}
      <div class="section-divider">
        <span>Product-page evidence</span>
      </div>
      ${renderFieldBlock("Sustainability claim on product page", model.fields.sustainabilityClaims, "No sustainability claim was found in the normalized page evidence.")}
      ${renderFieldBlock("Certification or standard", model.fields.certifications, "No certification, standard, or third-party reference was found in the normalized page evidence.")}
    </section>
  `;
}

function renderDurabilityTab(model) {
  return `
    <section class="stack">
      <div class="content-grid">
        ${renderSummaryCard("Material insight", model.material, "Not found.", { wide: true })}
        ${renderSummaryCard("Care guidance", model.care, "Not found.")}
        ${renderStructuredSummaryCard("Production Origin", model.productionOriginValues, "Not found.", {
          wide: true,
          includeLabels: ["Country", "Supplier", "Factory", "Address", "Employees"],
          labelOrder: ["Country", "Supplier", "Factory", "Address", "Employees"],
          uniqueLabels: true,
        })}
      </div>
      <div class="section-divider">
        <span>Product-page evidence</span>
      </div>
      ${renderFieldBlock("Material composition", model.fields.materialComposition, "Material composition was not found in the normalized page evidence.")}
      ${renderFieldBlock("Care instructions", model.fields.careText, "Care instructions were not found in the normalized page evidence.")}
      ${renderFieldBlock("Supplier and factory details", model.fields.supplierDetails, "Supplier, factory, country, address, or employee count was not found in the normalized page evidence.")}
      ${renderFieldBlock("Origin and manufacturing", model.fields.productionOrigin, "Country, factory, supplier, or traceability detail was not found in the normalized page evidence.")}
      ${renderFieldBlock("Durability, repair, or warranty", model.fields.durabilityClaims, "No direct claim about longevity, repair, wear, warranty, or test results was found on the product page.")}
    </section>
  `;
}

function renderBrandTab(model) {
  const sources = Array.isArray(model.brandInsight.sources)
    ? model.brandInsight.sources
    : [];

  if (sources.length === 0) {
    return `
      <section class="stack">
        <article class="empty-row">
          <h3>No public brand context found</h3>
          <p>${escapeHtml(displayText(model.brandInsight.summary || "The analyzer did not find useful public brand pages from the submitted product page."))}</p>
        </article>
      </section>
    `;
  }

  return `
    <section class="stack">
      <article class="summary-block wide">
        <span class="mini-label">Public brand context</span>
        <p>${escapeHtml(cleanReadableText(model.brandInsight.summary))}</p>
      </article>
      ${sources.map((source) => `
        <article class="brand-source">
          <div class="row-header">
            <h3>${escapeHtml(displayText(source.topic || "Brand context"))}</h3>
            ${statusBadge(source.status === "unavailable" ? "unavailable" : "found")}
          </div>
          <p class="source-line">
            <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(brandSourceLinkLabel(source))}</a>
          </p>
          ${
            Array.isArray(source.snippets) && source.snippets.length > 0
              ? `<div class="brand-snippets">
                  ${source.snippets.slice(0, 2).map((snippet) => `<p>${escapeHtml(truncateReadableText(snippet, 240))}</p>`).join("")}
                </div>`
              : `<p class="muted">${escapeHtml(cleanReadableText(source.note || "No readable snippets were extracted from this candidate page."))}</p>`
          }
        </article>
      `).join("")}
    </section>
  `;
}

function renderGapsTab(model) {
  const readiness = model.passportReadiness || {};
  const readinessMissingFields = Array.isArray(readiness.missingFields) ? readiness.missingFields : [];
  const warningRows = Array.isArray(readiness.warnings) && readiness.warnings.length > 0
    ? readiness.warnings.map((item) => `<li><strong>${escapeHtml(displayText(item.label))}</strong>${item.detail ? `: ${escapeHtml(cleanReadableText(item.detail))}` : ""}</li>`).join("")
    : "<li>No data-quality warnings were returned.</li>";
  const missingEvidenceRows = model.evidenceFields
    .filter((item) => item.status === "not_found" || item.status === "unavailable")
    .map((item) => `<li>${escapeHtml(item.label)}</li>`)
    .join("");
  const missingRows = model.unknowns.length > 0
    ? model.unknowns.map((item) => `<li>${escapeHtml(cleanReadableText(item))}</li>`).join("")
    : "<li>No explicit unknowns were returned.</li>";
  const sourceRows = model.sources.length > 0
    ? model.sources.map((source) => `
        <article class="source-row">
          <strong>${escapeHtml(evidenceSourceLabel(source.source || source.type) || "Source")}</strong>
          <span>${escapeHtml(cleanReadableText(source.label || evidenceSourceLabel(source.source || source.type) || ""))}</span>
          ${
            source.source || source.type
              ? `<small>${escapeHtml(evidenceSourceLabel(source.source || source.type))}</small>`
              : ""
          }
        </article>
      `).join("")
    : `<article class="source-row"><strong>Source</strong><span>${escapeHtml(model.submittedUrl)}</span></article>`;

  return `
    <section class="stack">
      ${
        model.accessDiagnostics
          ? `<article class="gap-list">
              <h3>Access diagnostic</h3>
              <ul><li><strong>${escapeHtml(displayText(model.accessDiagnostics.type || "Access issue"))}</strong>: ${escapeHtml(displayText(model.accessDiagnostics.detail))}</li></ul>
            </article>`
          : ""
      }
      <article class="gap-list">
        <h3>Missing DPP Information</h3>
        ${renderMissingDppFields(readinessMissingFields)}
      </article>
      <article class="gap-list">
        <h3>Warnings and conflicts</h3>
        <ul>${warningRows}</ul>
      </article>
      <article class="gap-list">
        <h3>Checked but not found</h3>
        <ul>${missingEvidenceRows || "<li>All checked product-page fields were found.</li>"}</ul>
      </article>
      <article class="gap-list">
        <h3>Missing or unverified</h3>
        <ul>${missingRows}</ul>
      </article>
      ${renderFieldBlock("Page title", model.fields.pageTitle, "Page title was not found.")}
      ${renderFieldBlock("Canonical URL", model.fields.canonicalUrl, "Canonical URL was not found.")}
      <div class="section-divider">
        <span>Sources</span>
      </div>
      <div class="source-list">${sourceRows}</div>
    </section>
  `;
}

function renderReportSection(id, title, description, content) {
  return `
    <section class="consumer-section" aria-labelledby="${escapeHtml(id)}">
      <div class="consumer-section-heading">
        <h3 id="${escapeHtml(id)}">${escapeHtml(title)}</h3>
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      </div>
      <div class="consumer-section-content">${content}</div>
    </section>
  `;
}

function renderMaterialExplanation(model) {
  const materialCards = model.materialItems.map((item) => `
    <article class="material-card">
      <div class="material-card-heading">
        <h4>${escapeHtml(item.name)}</h4>
        ${item.percentage ? `<span>${escapeHtml(item.percentage)}</span>` : ""}
      </div>
      <p>${escapeHtml(item.explanation || "No plain-language explanation was returned for this material.")}</p>
    </article>
  `).join("");
  const fieldStatus = normalizeStatus(model.fields.materialComposition?.status);

  return `
    ${model.materialExplanation ? `<p class="section-summary">${escapeHtml(model.materialExplanation)}</p>` : ""}
    ${materialCards ? `<div class="material-grid">${materialCards}</div>` : ""}
    ${renderFieldBlock(
      "Material composition",
      model.fields.materialComposition,
      fieldStatus === "unavailable"
        ? "Material information is unavailable because the source could not be read well enough."
        : "Material composition was checked but not found."
    )}
  `;
}

function renderConsumerClaims(model) {
  const displayedClaims = consumerClaims(model);
  const structuredClaims = displayedClaims.length > 0
    ? displayedClaims.map((claim) => renderClaimItem(claim, model.evidenceRecordIndex)).join("")
    : "";
  const claimValues = model.claimValues.length > 0
    ? `<article class="claim-row">
        <div class="row-header"><h4>Claim wording found on the product page</h4>${statusBadge("found")}</div>
        <ul class="plain-list">${model.claimValues.map((claim) => `<li>${escapeHtml(claim)}</li>`).join("")}</ul>
        ${renderCitations(model.fields.sustainabilityClaims?.citationRecords)}
      </article>`
    : "";
  const noClaims = !structuredClaims && !claimValues
    ? `<article class="information-state missing-information">
        <h4>No clear product claim found</h4>
        <p>The available product content was checked, but no clear environmental or ethical product claim was found.</p>
      </article>`
    : "";

  return `${structuredClaims}${claimValues}${noClaims}`;
}

function consumerClaims(model) {
  const candidates = model.claimCitations.length > 0 ? model.claimCitations : model.claims;
  const claimCategories = new Set([
    "sustainability",
    "environmental",
    "ethical",
    "certification",
    "durability",
    "repair",
    "warranty",
    "claim",
  ]);

  return candidates.filter((claim) => {
    const category = displayText(claim.category).toLowerCase();
    const sourceType = displayText(claim.sourceType || claim.type).toLowerCase();
    const verificationStatus = displayText(claim.verificationStatus).toLowerCase();

    if (sourceType === "missing_information" || verificationStatus === "not_found") {
      return false;
    }

    return claimCategories.has(category) ||
      sourceType === "brand_statement" ||
      sourceType === "external_evidence" ||
      /brand statement|independent|unverified/.test(verificationStatus);
  });
}

function buildConsumerConclusion(model) {
  const claims = consumerClaims(model);
  const evidenceStatement = model.extractionStatus === "failed"
    ? "The product page could not be read reliably enough to establish product facts."
    : `The available evidence supports ${model.foundCount} of ${model.checkedCount} checked product fields.`;
  const claimStatement = claims.length > 0 || model.claimValues.length > 0
    ? "Product claim wording was found and is presented as a claim, not as independent proof or a product verdict."
    : "No clear environmental or ethical product claim was found in the available content.";
  const missingStatement = model.missingCount > 0
    ? `${model.missingCount} checked field${model.missingCount === 1 ? " was" : "s were"} not found.`
    : "No checked fields are marked as missing.";
  const unavailableStatement = model.unavailableCount > 0
    ? `${model.unavailableCount} field${model.unavailableCount === 1 ? " is" : "s are"} unavailable because source content could not be assessed reliably.`
    : "No checked fields are marked as unavailable.";

  return [evidenceStatement, claimStatement, missingStatement, unavailableStatement].join(" ");
}

function buildKnownSummary(model) {
  const productName = usefulReportText(model.productName);
  const brand = usefulReportText(model.brand);
  const identity = productName
    ? `${productName}${brand ? ` by ${brand}` : ""}.`
    : "The exact product identity could not be confirmed from the available evidence.";
  const coverage = model.extractionStatus === "failed"
    ? "The source was not readable enough to confirm product-level details."
    : `${model.foundCount} of ${model.checkedCount} checked product fields are supported by available evidence.`;

  return `${identity} ${coverage}`;
}

function renderConsumerSources(model) {
  const reportSources = model.sources.map((source) => {
    const sourceType = evidenceSourceLabel(source.source || source.type) || "Source";
    const label = cleanReadableText(source.label || sourceType);
    return `
      <article class="source-row">
        <strong>${escapeHtml(sourceType)}</strong>
        ${isValidProductUrl(label)
          ? `<a href="${escapeHtml(label)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`
          : `<span>${escapeHtml(label)}</span>`}
      </article>
    `;
  });
  const brandSources = (model.brandInsight.sources || []).map((source) => `
    <article class="source-row">
      <strong>Public brand context</strong>
      ${isValidProductUrl(source.url)
        ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(brandSourceLinkLabel(source))}</a>`
        : `<span>${escapeHtml(displayText(source.label || source.topic || "Brand source"))}</span>`}
    </article>
  `);
  const rows = [...reportSources, ...brandSources];

  if (rows.length === 0) {
    rows.push(`
      <article class="source-row">
        <strong>Submitted product page</strong>
        <a href="${escapeHtml(model.submittedUrl)}" target="_blank" rel="noreferrer">${escapeHtml(model.submittedUrl)}</a>
      </article>
    `);
  }

  return `<div class="source-list">${rows.join("")}</div>`;
}

function renderUnknownGroup(title, description, items, className, emptyText) {
  return `
    <article class="information-state ${className}">
      <div class="information-state-heading">
        <h4>${escapeHtml(title)}</h4>
        <span>${items.length}</span>
      </div>
      <p>${escapeHtml(description)}</p>
      ${items.length > 0
        ? `<ul>${items.map((item) => `<li>${escapeHtml(cleanReadableText(item))}</li>`).join("")}</ul>`
        : `<p class="state-empty">${escapeHtml(emptyText)}</p>`}
    </article>
  `;
}

function renderConsumerUnknowns(model) {
  const missing = model.evidenceFields
    .filter((item) => item.status === "not_found")
    .map((item) => item.label);
  const unavailable = model.evidenceFields
    .filter((item) => item.status === "unavailable")
    .map((item) => item.label);

  return `
    <div class="information-state-grid">
      ${renderUnknownGroup(
        "Missing information",
        "The available product content was checked, but these details were not found.",
        missing,
        "missing-information",
        "No checked fields are currently marked as missing."
      )}
      ${renderUnknownGroup(
        "Unavailable information",
        "The source could not be read well enough to determine whether these details are disclosed.",
        unavailable,
        "unavailable-information",
        "No checked fields are currently marked as unavailable."
      )}
    </div>
    ${renderUnknownGroup(
      "Other unknowns or unverified points",
      "These points remain unknown or are not independently verified by this report.",
      model.unknowns,
      "unverified-information",
      "No additional unknowns were returned."
    )}
  `;
}

function renderConsumerReport(model) {
  const originStatus = normalizeStatus(model.fields.productionOrigin?.status);
  const careStatus = normalizeStatus(model.fields.careText?.status);
  const verdict = buildVerdict(model);

  return `
    <div class="consumer-report">
      ${renderReportSection(
        "report-known",
        "What is known",
        "Product facts supported by the available page evidence.",
        `<div class="content-grid">
          ${renderSummaryCard("Evidence summary", buildKnownSummary(model), "No reliable product summary is available.", { wide: true })}
          ${renderStructuredSummaryCard("Product identifiers", model.identifierValues, "Not found.")}
          ${renderStructuredSummaryCard("Colour or variant", model.colorVariantValues, "Not found.", {
            includeLabels: ["Color", "Color reference"],
            labelOrder: ["Color", "Color reference"],
            uniqueLabels: true,
          })}
        </div>`
      )}
      ${renderReportSection(
        "report-materials",
        "Materials explained",
        "Composition as disclosed, with plain-language context where available.",
        renderMaterialExplanation(model)
      )}
      ${renderReportSection(
        "report-claims",
        "Claims and evidence",
        "Brand or retailer claims are shown as claims, alongside their evidence and verification status.",
        renderConsumerClaims(model)
      )}
      ${renderReportSection(
        "report-origin",
        "Origin and manufacturing",
        "Country, supplier, and factory details found for this product.",
        renderStructuredSummaryCard("Origin evidence", model.productionOriginValues, originStatus === "unavailable"
          ? "Origin information is unavailable because the source could not be read well enough."
          : "Origin and manufacturing information was checked but not found.", {
          wide: true,
          citations: [...(model.fields.productionOrigin?.citationRecords || []), ...(model.fields.supplierDetails?.citationRecords || [])],
          includeLabels: ["Country", "Supplier", "Factory", "Address", "Employees"],
          labelOrder: ["Country", "Supplier", "Factory", "Address", "Employees"],
          uniqueLabels: true,
        })
      )}
      ${renderReportSection(
        "report-care",
        "Care guidance",
        "Care information can affect product life and use, but it is not a durability guarantee.",
        renderFieldBlock("Care instructions", model.fields.careText, careStatus === "unavailable"
          ? "Care information is unavailable because the source could not be read well enough."
          : "Care information was checked but not found.")
      )}
      ${renderReportSection(
        "report-scores",
        "Disclosure and claim scores",
        "These scores measure disclosure coverage and claim-evidence strength, not whether the product is environmentally preferable.",
        `<div class="score-grid">${renderScore("Disclosure coverage", model.transparencyScore)}${renderScore("Claim-evidence strength", model.claimScore)}</div>`
      )}
      ${renderReportSection(
        "report-conclusion",
        "Conclusion",
        "A cautious reading of what the available evidence supports.",
        `<article class="conclusion-card ${verdict.tone}">
          <span class="verdict-pill ${verdict.tone}">${escapeHtml(verdict.label)}</span>
          <p>${escapeHtml(buildConsumerConclusion(model))}</p>
          <small>Independent interpretation — not a compliance decision or product certification.</small>
        </article>`
      )}
      ${renderReportSection(
        "report-sources",
        "Sources",
        "Public pages and labeled inputs used for this report.",
        renderConsumerSources(model)
      )}
      ${renderReportSection(
        "report-unknowns",
        "Unknowns and unavailable information",
        "Missing means checked but not found; unavailable means the source could not be assessed reliably.",
        renderConsumerUnknowns(model)
      )}
    </div>
  `;
}

function renderTechnicalDisclosure(title, description, content, open = false) {
  return `
    <details class="technical-disclosure"${open ? " open" : ""}>
      <summary>
        <span>${escapeHtml(title)}</span>
        <small>${escapeHtml(description)}</small>
      </summary>
      <div class="technical-disclosure-content">${content}</div>
    </details>
  `;
}

function renderRawEvidence(model) {
  const fieldRows = model.evidenceFields
    .map(({ key, label }) => renderFieldBlock(label, model.fields[key], `${label} was not returned.`))
    .join("");

  return `
    ${renderEvidenceChecklist(model)}
    <div class="stack raw-evidence-list">
      ${fieldRows}
      ${renderFieldBlock("Page title", model.fields.pageTitle, "Page title was not returned.")}
      ${renderFieldBlock("Canonical URL", model.fields.canonicalUrl, "Canonical URL was not returned.")}
    </div>
  `;
}

function renderTechnicalReport(model) {
  const accessNote = model.accessDiagnostics
    ? `<article class="gap-list"><h3>Access diagnostic</h3><p><strong>${escapeHtml(displayText(model.accessDiagnostics.type || "Access issue"))}:</strong> ${escapeHtml(displayText(model.accessDiagnostics.detail))}</p></article>`
    : `<p class="muted">No access diagnostic was returned.</p>`;
  const metadata = `
    <dl class="passport-facts technical-facts">
      <div><dt>Submitted URL</dt><dd>${escapeHtml(model.submittedUrl)}</dd></div>
      <div><dt>Source read</dt><dd>${escapeHtml(model.sourceUrl)}</dd></div>
      <div><dt>Extraction status</dt><dd>${escapeHtml(statusLabel(model.extractionStatus))}</dd></div>
      ${model.storedPassport?.id ? `<div><dt>Saved analysis ID</dt><dd>${escapeHtml(model.storedPassport.id)}</dd></div>` : ""}
    </dl>
  `;

  return renderModuleShell("technical", {
    summary: `
      <article class="passport-section">
        <div class="passport-section-heading">
          <div>
            <p class="mini-label">Technical details</p>
            <h4>Capture and report metadata</h4>
          </div>
        </div>
        <p>Diagnostics, normalized evidence, and report-readiness internals are preserved here for deeper review.</p>
      </article>
      ${renderTechnicalDisclosure(
        "Evidence capture and access",
        "Deep-reader status, user-provided evidence, and access diagnostics.",
        `${renderUserProvidedEvidence(model)}${renderDeepPageReadEvidence(model)}${accessNote}`,
        Boolean(model.accessDiagnostics)
      )}
      ${renderTechnicalDisclosure(
        "Report metadata",
        "Source and saved-analysis identifiers.",
        metadata
      )}
    `,
    keyFacts: {
      body: `
        ${renderTechnicalDisclosure(
          "Passport-readiness internals",
          "Field mapping for future passport workflows; this is not official DPP readiness.",
          renderPassportReadiness(model),
          true
        )}
        ${renderEvidenceChecklist(model)}
        ${renderModuleFieldBlocks([
          { title: "Product name", field: model.fields.productName, emptyText: "Product name was not returned." },
          { title: "Brand", field: model.fields.brand, emptyText: "Brand was not returned." },
          { title: "Product identifiers", field: model.fields.productIdentifiers, emptyText: "No product identifiers were found." },
          { title: "Color/variant", field: model.fields.colorVariant, emptyText: "No color or variant was found." },
          { title: "Product description", field: model.fields.productDescription, emptyText: "No product description was returned." },
        ])}
      `,
      layout: "card-grid",
    },
    material: {
      body: renderModuleFieldBlocks([
        { title: "Material composition", field: model.fields.materialComposition, emptyText: "Material composition was not returned." },
        { title: "Certifications", field: model.fields.certifications, emptyText: "Certifications were not returned." },
      ]),
      layout: "card-grid",
    },
    claims: `
      <div class="score-grid">
        ${renderScore("Claim-evidence strength", model.claimScore)}
      </div>
      ${renderClaimEvidenceRows(model)}
      ${renderModuleFieldBlocks([
        { title: "Sustainability claims", field: model.fields.sustainabilityClaims, emptyText: "Sustainability claims were not returned." },
        { title: "Certifications", field: model.fields.certifications, emptyText: "Certifications were not returned." },
      ])}
    `,
    traceability: {
      body: renderModuleFieldBlocks([
        { title: "Origin and manufacturing", field: model.fields.productionOrigin, emptyText: "Origin/manufacturing was not returned." },
        { title: "Supplier and factory details", field: model.fields.supplierDetails, emptyText: "Supplier/factory details were not returned." },
      ]),
      layout: "card-grid",
    },
    care: {
      body: renderModuleFieldBlocks([
        { title: "Care instructions", field: model.fields.careText, emptyText: "Care instructions were not returned." },
        { title: "Durability, repair, or warranty", field: model.fields.durabilityClaims, emptyText: "Durability, repair, or warranty details were not returned." },
      ]),
      layout: "card-grid",
    },
    missing: `
      ${renderTechnicalDisclosure(
        "Raw normalized evidence",
        "Every checked product field and its citations remain accessible.",
        renderRawEvidence(model),
        true
      )}
      ${renderTechnicalDisclosure(
        "Brand context",
        "Public brand pages kept separate from product-level evidence.",
        renderBrandTab(model)
      )}
    `,
  });
}

let passportModuleNavFrame = 0;
let passportModuleNavLockedUntil = 0;

function activeReportPanel() {
  if (activeTab === "evidence") {
    return evidenceReportPanel;
  }

  if (activeTab === "technical") {
    return technicalReportPanel;
  }

  return overviewReportPanel;
}

function keepPassportModuleLinkVisible(link) {
  const nav = link.closest(".passport-side-nav");
  if (!nav || nav.scrollWidth <= nav.clientWidth) {
    return;
  }

  const navRect = nav.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  const targetLeft = nav.scrollLeft
    + linkRect.left
    - navRect.left
    - (nav.clientWidth - linkRect.width) / 2;

  nav.scrollTo({
    left: Math.max(0, targetLeft),
    behavior: "smooth",
  });
}

function passportModulePairs() {
  const panel = activeReportPanel();
  if (!panel || panel.hidden) {
    return [];
  }

  return Array.from(panel.querySelectorAll(".passport-side-nav a[href^='#']"))
    .map((link) => {
      const id = decodeURIComponent(link.getAttribute("href").slice(1));
      return {
        id,
        link,
        target: document.getElementById(id),
      };
    })
    .filter((item) => item.target);
}

function setActivePassportModule(targetId, options = {}) {
  const pairs = passportModulePairs();

  for (const { id, link } of pairs) {
    const selected = id === targetId;
    link.classList.toggle("is-active", selected);
    if (selected) {
      link.setAttribute("aria-current", "location");
      if (options.keepVisible) {
        keepPassportModuleLinkVisible(link);
      }
    } else {
      link.removeAttribute("aria-current");
    }
  }
}

function syncPassportModuleNav() {
  passportModuleNavFrame = 0;

  const panel = activeReportPanel();
  if (!currentModel || !panel || panel.hidden) {
    return;
  }

  const pairs = passportModulePairs();
  if (pairs.length === 0) {
    return;
  }

  if (Date.now() < passportModuleNavLockedUntil) {
    return;
  }

  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  if (window.scrollY >= maxScroll - 4) {
    setActivePassportModule(pairs[pairs.length - 1].id, { keepVisible: true });
    return;
  }

  const anchorLine = Math.min(window.innerHeight * 0.2, 180);
  let active = pairs[0];
  let activeTop = Number.NEGATIVE_INFINITY;

  for (const pair of pairs) {
    const top = pair.target.getBoundingClientRect().top;
    if (top > anchorLine) {
      break;
    }

    if (top > activeTop + 8) {
      active = pair;
      activeTop = top;
    }
  }

  setActivePassportModule(active.id, { keepVisible: true });
}

function requestPassportModuleNavSync() {
  if (passportModuleNavFrame) {
    return;
  }

  passportModuleNavFrame = window.requestAnimationFrame(syncPassportModuleNav);
}

function renderActiveTab() {
  if (!currentModel) {
    return;
  }

  tabButtons.forEach((tabButton) => {
    const selected = tabButton.dataset.tab === activeTab;
    tabButton.classList.toggle("active", selected);
    tabButton.setAttribute("aria-selected", String(selected));
    tabButton.setAttribute("tabindex", selected ? "0" : "-1");
  });
  overviewReportPanel.hidden = activeTab !== "overview";
  evidenceReportPanel.hidden = activeTab !== "evidence";
  technicalReportPanel.hidden = activeTab !== "technical";

  requestPassportModuleNavSync();
}

function renderReport(response, submittedUrl) {
  currentModel = extractModel(response, submittedUrl);
  activeTab = "overview";
  renderReportHeader(currentModel);
  overviewReportPanel.innerHTML = ProductPassportDashboard.renderDashboard(currentModel);
  evidenceReportPanel.innerHTML = renderEvidenceReport(currentModel);
  technicalReportPanel.innerHTML = renderTechnicalReport(currentModel);
  renderActiveTab();
  reportPanel.classList.remove("hidden");
  renderRecoveryState(currentModel);
  requestPassportModuleNavSync();
}

function renderRecoveryState(model) {
  const blocked = model.blockedPage;
  if (!blocked) {
    blockedFallback.classList.add("hidden");
    return;
  }

  blockedReasonCode.textContent = displayMachineStatus(blocked.reasonCode, "unavailable");
  blockedReason.textContent = cleanReadableText(blocked.reason || "Some product-page content was unavailable.");
  const guidance = Array.isArray(blocked.retryGuidance) ? blocked.retryGuidance : [];
  blockedGuidance.innerHTML = guidance
    .map((item) => `<li>${escapeHtml(cleanReadableText(item))}</li>`)
    .join("");
  blockedFallback.classList.remove("hidden");
}

function renderError(error, submittedUrl) {
  currentModel = null;
  reportHeader.innerHTML = `
    <div>
      <p class="section-kicker">Analysis stopped</p>
      <h2>Could not create an independent report</h2>
      <p>${escapeHtml(submittedUrl)}</p>
    </div>
    <div class="result-meta">
      <span class="verdict-pill risk">Needs retry</span>
    </div>
  `;
  overviewReportPanel.innerHTML = `
    <article class="empty-row">
      <span class="mini-label">No reliable result</span>
      <h3>No fallback passport was generated</h3>
      <p>${escapeHtml(error.message || "Unable to analyze this URL.")}</p>
      <p>This report only shows extracted or returned evidence. It does not fill the report with sample product data when the live read fails.</p>
    </article>
  `;
  evidenceReportPanel.innerHTML = "";
  technicalReportPanel.innerHTML = "";
  activeTab = "overview";
  tabButtons.forEach((tabButton) => {
    const selected = tabButton.dataset.tab === activeTab;
    tabButton.classList.toggle("active", selected);
    tabButton.setAttribute("aria-selected", String(selected));
    tabButton.setAttribute("tabindex", selected ? "0" : "-1");
  });
  overviewReportPanel.hidden = false;
  evidenceReportPanel.hidden = true;
  technicalReportPanel.hidden = true;
  reportPanel.classList.remove("hidden");
}

class ApiRequestError extends Error {
  constructor(message, status, payload = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.payload = payload;
  }
}

function isNetworkRequestError(error) {
  return error instanceof TypeError &&
    /failed to fetch|networkerror|load failed/i.test(error.message || "");
}

function analysisServiceUnavailableError(error) {
  return new ApiRequestError(
    "Could not reach the analysis service. Check that the local server is running and retry.",
    0,
    {
      code: "analysis_service_unreachable",
      cause: error.message || "Network request failed",
    }
  );
}

async function analyzeProduct(productUrl, userProvidedEvidence = null) {
  let response;

  try {
    response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productUrl,
        ...(userProvidedEvidence ? { userProvidedEvidence } : {}),
      }),
    });
  } catch (error) {
    if (isNetworkRequestError(error)) {
      throw analysisServiceUnavailableError(error);
    }

    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiRequestError(errorBody.error || "Unable to analyze the product URL.", response.status, errorBody);
  }

  return response.json();
}

async function fallbackToAnalysisOnly(productUrl, reason) {
  const analysis = await analyzeProduct(productUrl);
  return {
    ...analysis,
    fallbackMode: "analysis-only",
    fallbackReason: reason,
  };
}

async function createProductPassport(productUrl, options = {}) {
  let response;

  try {
    response = await fetch("/api/passports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productUrl,
        allowDuplicate: options.allowDuplicate === true,
      }),
    });
  } catch (error) {
    if (isNetworkRequestError(error)) {
      return fallbackToAnalysisOnly(productUrl, "draft-service-unreachable");
    }

    throw error;
  }

  if (response.status === 404 || response.status === 405) {
    return fallbackToAnalysisOnly(productUrl, "draft-service-unavailable");
  }

  if (response.status >= 500) {
    return fallbackToAnalysisOnly(productUrl, `draft-service-${response.status}`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiRequestError(errorBody.error || "Unable to create the independent report.", response.status, errorBody);
  }

  return response.json();
}

async function fetchPassport(url) {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiRequestError(body.error || "Unable to open the existing report draft.", response.status, body);
  }
  return body;
}

function showDuplicateChoice(error, productUrl) {
  pendingDuplicate = {
    productUrl,
    existingUrl: error.payload?.links?.self || "",
  };
  duplicateMessage.textContent = error.message;
  duplicateChoice.classList.remove("hidden");
  setStatus("A report draft already exists. Choose how this retry should continue.", "warning");
}

async function runAnalysisOnly(productUrl, userProvidedEvidence = null, message = "Analysis complete without saving a report draft.") {
  setStatus("Analyzing without saving another report draft...", "active");
  button.disabled = true;
  retryAnalysisButton.disabled = true;
  providedEvidenceButton.disabled = true;
  try {
    const analysis = await analyzeProduct(productUrl, userProvidedEvidence);
    renderStages(stages.length - 1, "complete");
    renderReport({ ...analysis, fallbackMode: "analysis-only" }, productUrl);
    duplicateChoice.classList.add("hidden");
    setStatus(message, "success");
    return analysis;
  } catch (error) {
    setStatus(error.message || "Unable to analyze the product URL.", "error");
    throw error;
  } finally {
    button.disabled = false;
    retryAnalysisButton.disabled = false;
    providedEvidenceButton.disabled = false;
  }
}

tabButtons.forEach((tabButton) => {
  tabButton.addEventListener("click", () => {
    activeTab = tabButton.dataset.tab;
    renderActiveTab();
  });

  tabButton.addEventListener("keydown", (event) => {
    const currentIndex = tabButtons.indexOf(tabButton);
    let nextIndex = null;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabButtons.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabButtons.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    activeTab = tabButtons[nextIndex].dataset.tab;
    renderActiveTab();
    tabButtons[nextIndex].focus();
  });
});

document.addEventListener("click", (event) => {
  const link = event.target.closest?.(".passport-side-nav a[href^='#']");
  if (!link) {
    return;
  }

  const id = decodeURIComponent(link.getAttribute("href").slice(1));
  const target = document.getElementById(id);
  if (target) {
    event.preventDefault();
    passportModuleNavLockedUntil = Date.now() + 800;
    setActivePassportModule(id, { keepVisible: true });
    target.scrollIntoView({ block: "start", inline: "nearest" });
  }
});

document.addEventListener("scroll", requestPassportModuleNavSync, { passive: true });
window.addEventListener("resize", requestPassportModuleNavSync);

document.addEventListener("keydown", (event) => {
  const summary = event.target.closest?.("summary");
  if (!summary || (event.key !== "Enter" && event.key !== " ")) {
    return;
  }

  const details = summary.parentElement;
  if (!(details instanceof HTMLDetailsElement)) {
    return;
  }

  event.preventDefault();
  details.open = !details.open;
});

exampleButtons.forEach((exampleButton) => {
  exampleButton.addEventListener("click", () => {
    input.value = exampleButton.dataset.exampleUrl || "";
    input.focus();
    setStatus("Example link added. Start the analysis when you are ready.", "active");
  });
});

retryAnalysisButton.addEventListener("click", () => {
  const productUrl = currentModel?.submittedUrl || input.value.trim();
  if (!isValidProductUrl(productUrl)) {
    setStatus("Enter a valid product URL before retrying.", "warning");
    return;
  }
  runAnalysisOnly(productUrl, null, "Public page retry complete. No additional report draft was saved.")
    .catch(() => {});
});

providedEvidenceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const productUrl = currentModel?.submittedUrl || input.value.trim();
  const pastedText = providedText.value.trim();
  const file = providedHtml.files?.[0] || null;

  if (pastedText && file) {
    setStatus("Choose either pasted text or one saved HTML file for this analysis.", "warning");
    return;
  }
  if (!pastedText && !file) {
    setStatus("Paste visible product text or select a saved HTML file.", "warning");
    return;
  }

  let evidence;
  if (file) {
    if (!/\.html?$/i.test(file.name) && file.type !== "text/html") {
      setStatus("Select an HTML file ending in .html or .htm.", "warning");
      return;
    }
    evidence = {
      kind: "html_file",
      content: await file.text(),
      fileName: file.name,
    };
  } else {
    evidence = {
      kind: "visible_text",
      content: pastedText,
    };
  }

  await runAnalysisOnly(
    productUrl,
    evidence,
    "One-off analysis complete. User-provided evidence was not saved as a new report draft."
  ).catch(() => {});
});

openExistingButton.addEventListener("click", async () => {
  if (!pendingDuplicate?.existingUrl) return;
  try {
    const response = await fetchPassport(pendingDuplicate.existingUrl);
    renderReport(response, pendingDuplicate.productUrl);
    duplicateChoice.classList.add("hidden");
    setStatus("Existing report draft opened. No duplicate was created.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

analysisOnlyButton.addEventListener("click", () => {
  if (!pendingDuplicate) return;
  runAnalysisOnly(
    pendingDuplicate.productUrl,
    null,
    "Retry complete without saving another report draft."
  ).catch(() => {});
});

saveDuplicateButton.addEventListener("click", async () => {
  if (!pendingDuplicate) return;
  setStatus("Saving another report draft after your explicit choice...", "active");
  try {
    const response = await createProductPassport(pendingDuplicate.productUrl, { allowDuplicate: true });
    renderReport(response, pendingDuplicate.productUrl);
    duplicateChoice.classList.add("hidden");
    setStatus(`Another report draft was saved by explicit choice. Analysis ${response.passport?.id || "created"}.`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const productUrl = input.value.trim();
  reportPanel.classList.add("hidden");
  blockedFallback.classList.add("hidden");
  duplicateChoice.classList.add("hidden");

  if (!productUrl) {
    setStatus("Enter a product URL to continue.", "warning");
    renderStages(-1, "idle");
    return;
  }

  if (!isValidProductUrl(productUrl)) {
    setStatus("Enter a valid URL starting with http:// or https://.", "warning");
    renderStages(-1, "idle");
    return;
  }

  setStatus("Agent is reading the product page...", "active");
  button.disabled = true;
  button.textContent = "Analyzing";

  let activeStage = 0;
  renderStages(activeStage, "running");
  const stageTimer = window.setInterval(() => {
    activeStage = Math.min(activeStage + 1, stages.length - 1);
    renderStages(activeStage, "running");
  }, 950);

  try {
    const analysis = await createProductPassport(productUrl);
    window.clearInterval(stageTimer);
    renderStages(stages.length - 1, "complete");
    renderReport(analysis, productUrl);

    const reportId = analysis.passport?.id ? ` Analysis ${analysis.passport.id}.` : "";
    const mode = analysis.fallbackMode === "analysis-only" ? "Analysis complete without saving a report draft." : "Report draft saved.";
    setStatus(`${mode}${reportId}`, "success");
  } catch (error) {
    window.clearInterval(stageTimer);
    if (error.status === 409 && error.payload?.code === "duplicate_draft") {
      renderStages(activeStage, "idle");
      showDuplicateChoice(error, productUrl);
      return;
    }
    renderStages(activeStage, "error");
    renderError(error, productUrl);
    setStatus(error.message || "Unable to create the independent report.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "Analyze";
  }
});

renderStages(-1, "idle");
