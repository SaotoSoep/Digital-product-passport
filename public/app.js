const form = document.getElementById("analysis-form");
const input = document.getElementById("product-url");
const button = document.getElementById("submit-button");
const statusBox = document.getElementById("status");
const stageList = document.getElementById("stage-list");
const reportPanel = document.getElementById("report");
const reportHeader = document.getElementById("report-header");
const reportOverview = document.getElementById("report-overview");
const reportBody = document.getElementById("report-body");
const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const exampleButtons = Array.from(document.querySelectorAll("[data-example-url]"));

const stages = [
  "Read page",
  "Extract product data",
  "Analyze passport gaps",
  "Check claims",
  "Save draft passport",
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

function displayText(value, emptyText = "") {
  return known(value) || known(emptyText);
}

function fieldValues(field) {
  return field && Array.isArray(field.values)
    ? field.values.map(known).filter(Boolean)
    : [];
}

function fieldFallbackValues(field) {
  const fallback = field && field.fallback;
  return fallback && Array.isArray(fallback.values)
    ? fallback.values.map(known).filter(Boolean)
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
    return values.join(" ");
  }

  const fallbackValues = fieldFallbackValues(field);
  if (fallbackValues.length > 0) {
    return fallbackValues.join(" ");
  }

  return known(fallback);
}

function scoreValue(score) {
  const numeric = Number(score && score.score);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
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
      detail: "Not found in the current product-page analysis.",
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
  const cleaned = displayText(value);
  const rendered = cleaned || displayText(emptyText);
  return `<p${cleaned ? "" : " class=\"muted\""}>${escapeHtml(rendered)}</p>`;
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
  const productName = firstFieldValue(
    fields.productName,
    known(storedPassport?.productName) || known(snapshot?.likelyProductName) || "Product name not found"
  );
  const brand = firstFieldValue(
    fields.brand,
    known(storedPassport?.brand) || known(snapshot?.likelyBrand) || "Brand not found"
  );
  const retailer = known(storedPassport?.retailer) || known(metadata.retailer) || new URL(submittedUrl).hostname.replace(/^www\./, "");
  const material = fieldDisplayValue(
    fields.materialComposition,
    known(report.materialExplained?.rawMaterial) || "Material not found"
  );
  const identifiers = fieldDisplayValue(
    fields.productIdentifiers,
    ""
  );
  const colorVariant = fieldDisplayValue(
    fields.colorVariant,
    ""
  );
  const productDescription = fieldDisplayValue(
    fields.productDescription,
    ""
  );
  const productSummary = known(report.productSummary);
  const care = fieldDisplayValue(
    fields.careText,
    known(report.washingCareAdvice?.summary) || "Care information not found"
  );
  const origin = fieldDisplayValue(
    fields.productionOrigin,
    known(report.productionOriginTransparency?.detail) || "Origin/manufacturing information not found"
  );
  const supplierDetails = fieldDisplayValue(
    fields.supplierDetails,
    known(report.supplierTransparency?.detail) || "Supplier/factory information not found"
  );
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

  return {
    submittedUrl,
    storedPassport,
    responseLinks: response.links || {},
    report,
    metadata,
    snapshot,
    evidence,
    fields,
    productName,
    brand,
    retailer,
    material,
    identifiers,
    colorVariant,
    productDescription,
    care,
    supplierDetails,
    origin,
    certifications,
    durabilityClaims,
    claims,
    claimValues,
    fallbackClaims,
    unknowns,
    extractionStatus,
    generatedAt,
    sourceUrl,
    brandInsight,
    accessDiagnostics,
    passportReadiness,
    evidenceFields,
    foundCount,
    checkedCount,
    missingCount,
    transparencyScore: scoreValue(report.transparencyScore),
    claimScore: scoreValue(report.claimStrengthScore),
    productSummary,
    conclusion: known(report.conclusion),
    originReport: report.productionOriginTransparency || null,
    sources: Array.isArray(report.sources) ? report.sources : [],
  };
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

  if (model.claimScore < 45) {
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

function renderScore(label, score, rationale) {
  return `
    <div class="score-card">
      <div class="score-topline">
        <span>${escapeHtml(label)}</span>
        <strong>${score}/100</strong>
      </div>
      <div class="score-track" aria-hidden="true">
        <span style="width: ${score}%"></span>
      </div>
      ${rationale ? `<p>${escapeHtml(displayText(rationale))}</p>` : ""}
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
            ? values.map((value) => `<p>${escapeHtml(displayText(value))}</p>`).join("")
            : `<p class="muted">${escapeHtml(displayText(emptyText))}</p>`
        }
        ${
          fallbackValues.length > 0
            ? `<div class="fallback-strip">
                <span>Fallback value</span>
                ${fallbackValues.map((value) => `<p>${escapeHtml(displayText(value))}</p>`).join("")}
                ${field?.fallback?.note ? `<p class="muted">${escapeHtml(displayText(field.fallback.note))}</p>` : ""}
              </div>`
            : ""
        }
      </div>
      ${
        sourceLabel || sourceUrl || extractedAt
          ? `<p class="source-line">${escapeHtml([displayText(sourceLabel), sourceUrl, extractedAt].filter(Boolean).join(" · "))}</p>`
          : ""
      }
    </article>
  `;
}

function renderEvidenceChecklist(model) {
  return `
    <article class="evidence-checklist">
      <div class="checklist-header">
        <div>
          <span class="mini-label">Checked on product page</span>
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

function renderReadinessList(items, emptyText, itemClass = "") {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  }

  return `
    <ul class="readiness-list ${itemClass}">
      ${items.map((item) => `
        <li>
          <strong>${escapeHtml(displayText(item.label || item.key || "Passport item"))}</strong>
          ${item.value ? `<span>${escapeHtml(displayText(item.value))}</span>` : ""}
          ${item.detail ? `<p>${escapeHtml(displayText(item.detail))}</p>` : ""}
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
      ${detail ? `<p class="missing-detail">${escapeHtml(detail)}</p>` : ""}
      ${
        info
          ? `<div class="missing-guidance">
              <p><strong>Why it matters:</strong> ${escapeHtml(info.why)}</p>
              <p><strong>What you can do:</strong> ${escapeHtml(info.action)}</p>
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
  const readyFields = Array.isArray(readiness.readyFields) ? readiness.readyFields : [];
  const missingFields = Array.isArray(readiness.missingFields) ? readiness.missingFields : [];
  const warnings = Array.isArray(readiness.warnings) ? readiness.warnings : [];

  return `
    <article class="passport-analysis">
      <div class="analysis-heading">
        <div>
          <span class="mini-label">Product passport analysis</span>
          <h3>${escapeHtml(displayText(readiness.label || "Passport readiness"))}</h3>
          <p>${escapeHtml(displayText(readiness.summary || "The analyzer checked which product-passport fields are present and which still need proof."))}</p>
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
          ${renderReadinessList(readyFields.slice(0, 6), "No passport-ready fields were found yet.")}
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

function renderClaimItem(claim) {
  const claimText = known(claim.brandClaim) || known(claim.claim) || "Claim text not found";
  const evidenceLevel = known(claim.evidenceLevel) || known(claim.publicEvidence) || "Visible page wording";
  const confidence = known(claim.confidence) || "Medium";

  return `
    <article class="claim-row">
      <div class="row-header">
        <h3>${escapeHtml(claimText)}</h3>
        <span class="confidence-badge">${escapeHtml(displayText(confidence))}</span>
      </div>
      <p>${escapeHtml(displayText(evidenceLevel))}</p>
      ${claim.publicEvidence ? `<p class="muted">${escapeHtml(displayText(claim.publicEvidence))}</p>` : ""}
    </article>
  `;
}

function passportStatusLabel(status) {
  const labels = {
    draft: "Draft",
    "analysis only": "Analysis only",
    stored: "Stored",
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
  const verdict = buildVerdict(model);
  const createdAt = formatDateTime(model.storedPassport?.createdAt || model.generatedAt);
  const passportId = known(model.storedPassport?.id);
  const status = known(model.storedPassport?.status) || (model.responseLinks.self ? "draft" : "analysis only");

  reportHeader.innerHTML = `
    <div>
      <p class="section-kicker">${escapeHtml(model.retailer)}</p>
      <h2>${escapeHtml(model.productName)}</h2>
      <p>${escapeHtml(model.brand)}</p>
    </div>
    <div class="result-meta">
      <span class="verdict-pill ${verdict.tone}">${escapeHtml(verdict.label)}</span>
      ${statusBadge(model.extractionStatus)}
      ${passportId ? `<span>Draft ${escapeHtml(passportId)}</span>` : ""}
      ${createdAt ? `<span>${escapeHtml(createdAt)}</span>` : ""}
      <span>${escapeHtml(passportStatusLabel(status))}</span>
    </div>
  `;
}

function renderReportOverview(model) {
  const verdict = buildVerdict(model);
  const transparencyRationale = known(model.report.transparencyScore?.rationale);
  const claimRationale = known(model.report.claimStrengthScore?.rationale);
  const coverageSummary = model.extractionStatus === "failed"
    ? "Product-page extraction failed. Fallback values remain separated from product-page evidence."
    : `Product-page extraction found ${model.foundCount} of ${model.checkedCount} relevant MVP fields. Fields that were not found are listed separately in the Gaps tab. Fallback values remain separated from product-page evidence.`;

  reportOverview.innerHTML = `
    <div class="verdict-card ${verdict.tone}">
      <span class="mini-label">Agent read</span>
      <h3>${escapeHtml(verdict.label)}</h3>
      <p>${escapeHtml(verdict.summary)}</p>
    </div>

    ${renderScore("Transparency", model.transparencyScore, transparencyRationale)}
    ${renderScore("Claim strength", model.claimScore, claimRationale)}

    <div class="score-card">
      <div class="score-topline">
        <span>Page evidence</span>
        <strong>${model.foundCount}/${model.checkedCount}</strong>
      </div>
      <p>${escapeHtml(coverageSummary)}</p>
    </div>

    <div class="score-card">
      <div class="score-topline">
        <span>Passport gaps</span>
        <strong>${Number(model.passportReadiness?.counts?.missing || 0)}</strong>
      </div>
      <p>${escapeHtml(displayText(model.passportReadiness?.summary || "Product-passport readiness analysis was not returned."))}</p>
    </div>

    <div class="score-card">
      <div class="score-topline">
        <span>Brand context</span>
        <strong>${escapeHtml(statusLabel(model.brandInsight.status))}</strong>
      </div>
      <p>${escapeHtml(displayText(model.brandInsight.summary))}</p>
    </div>

    ${
      model.accessDiagnostics
        ? `<div class="score-card">
            <div class="score-topline">
              <span>Access</span>
              <strong>${escapeHtml(displayText(model.accessDiagnostics.type || "blocked"))}</strong>
            </div>
            <p>${escapeHtml(displayText(model.accessDiagnostics.detail))}</p>
          </div>`
        : ""
    }

    <dl class="passport-facts">
      <div>
        <dt>Input</dt>
        <dd><a href="${escapeHtml(model.submittedUrl)}" target="_blank" rel="noreferrer">${escapeHtml(model.submittedUrl)}</a></dd>
      </div>
      ${
        model.responseLinks.public
          ? `<div><dt>Public API</dt><dd>${escapeHtml(model.responseLinks.public)}</dd></div>`
          : ""
      }
      <div>
        <dt>Source read</dt>
        <dd>${escapeHtml(model.sourceUrl)}</dd>
      </div>
    </dl>
  `;
}

function renderOverviewTab(model) {
  const primaryDescription = model.productDescription || model.productSummary;

  return `
    <section class="stack">
      ${renderPassportReadiness(model)}
      ${renderEvidenceChecklist(model)}
      <div class="content-grid">
      <article class="summary-block wide">
        <span class="mini-label">Product-page description</span>
        ${renderTextValue(primaryDescription, "No product description was found in the normalized page evidence.")}
      </article>
      <article class="summary-block">
        <span class="mini-label">Product identifiers</span>
        ${renderTextValue(model.identifiers, "Product, SKU, GTIN, or size identifiers were not found.")}
      </article>
      <article class="summary-block">
        <span class="mini-label">Color / variant</span>
        ${renderTextValue(model.colorVariant, "Color or selected variant data was not found.")}
      </article>
      <article class="summary-block">
        <span class="mini-label">Material</span>
        ${renderTextValue(model.material, "Material was not found on the product page.")}
      </article>
      <article class="summary-block">
        <span class="mini-label">Care</span>
        ${renderTextValue(model.care, "No clear care instructions were found.")}
      </article>
      <article class="summary-block">
        <span class="mini-label">Supplier / factory</span>
        ${renderTextValue(model.supplierDetails, "Supplier, factory, country, address, or employee count was not found.")}
      </article>
      <article class="summary-block">
        <span class="mini-label">Origin/manufacturing</span>
        ${renderTextValue(model.origin, "No clear origin or manufacturing information was found.")}
      </article>
      <article class="summary-block">
        <span class="mini-label">Certifications</span>
        ${renderTextValue(model.certifications.length ? model.certifications.join(" ") : "", "No certification or standard reference was found on the product page.")}
      </article>
      <article class="summary-block wide">
        <span class="mini-label">Conclusion</span>
        ${renderTextValue(model.conclusion, "The scan finished, but the current analyzer did not return a conclusion.")}
      </article>
      <article class="summary-block wide">
        <span class="mini-label">Brand context</span>
        ${renderTextValue(model.brandInsight.summary, "No public brand context was found.")}
      </article>
      </div>
    </section>
  `;
}

function renderClaimsTab(model) {
  const evidenceRows = [
    renderFieldBlock("Sustainability claim on product page", model.fields.sustainabilityClaims, "No sustainability claim was found in the normalized page evidence."),
    renderFieldBlock("Certification or standard", model.fields.certifications, "No certification, standard, or third-party reference was found in the normalized page evidence."),
  ];
  const claimRows = model.claims.length > 0
    ? model.claims.map(renderClaimItem).join("")
    : `<article class="empty-row"><h3>No claim rows</h3><p>The analyzer did not return structured sustainability claims for this URL.</p></article>`;

  return `
    <section class="stack">
      ${evidenceRows.join("")}
      <div class="section-divider">
        <span>Claim rows</span>
      </div>
      ${claimRows}
    </section>
  `;
}

function renderDurabilityTab(model) {
  return `
    <section class="stack">
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
        <p>${escapeHtml(displayText(model.brandInsight.summary))}</p>
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
                  ${source.snippets.map((snippet) => `<p>${escapeHtml(snippet)}</p>`).join("")}
                </div>`
              : `<p class="muted">${escapeHtml(displayText(source.note || "No readable snippets were extracted from this candidate page."))}</p>`
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
    ? readiness.warnings.map((item) => `<li><strong>${escapeHtml(displayText(item.label))}</strong>${item.detail ? `: ${escapeHtml(displayText(item.detail))}` : ""}</li>`).join("")
    : "<li>No data-quality warnings were returned.</li>";
  const missingEvidenceRows = model.evidenceFields
    .filter((item) => item.status === "not_found" || item.status === "unavailable")
    .map((item) => `<li>${escapeHtml(item.label)}</li>`)
    .join("");
  const missingRows = model.unknowns.length > 0
    ? model.unknowns.map((item) => `<li>${escapeHtml(displayText(item))}</li>`).join("")
    : "<li>No explicit unknowns were returned.</li>";
  const sourceRows = model.sources.length > 0
    ? model.sources.map((source) => `
        <article class="source-row">
          <strong>${escapeHtml(displayText(source.type || "Source"))}</strong>
          <span>${escapeHtml(displayText(source.label || ""))}</span>
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

function renderActiveTab() {
  if (!currentModel) {
    return;
  }

  const tabRenderers = {
    overview: renderOverviewTab,
    claims: renderClaimsTab,
    durability: renderDurabilityTab,
    brand: renderBrandTab,
    gaps: renderGapsTab,
  };

  reportBody.innerHTML = tabRenderers[activeTab](currentModel);
  tabButtons.forEach((tabButton) => {
    const selected = tabButton.dataset.tab === activeTab;
    tabButton.classList.toggle("active", selected);
    tabButton.setAttribute("aria-selected", String(selected));
  });
}

function renderReport(response, submittedUrl) {
  currentModel = extractModel(response, submittedUrl);
  activeTab = "overview";
  renderReportHeader(currentModel);
  renderReportOverview(currentModel);
  renderActiveTab();
  reportPanel.classList.remove("hidden");
}

function renderError(error, submittedUrl) {
  currentModel = null;
  reportHeader.innerHTML = `
    <div>
      <p class="section-kicker">Analysis stopped</p>
      <h2>Could not create a Product Passport</h2>
      <p>${escapeHtml(submittedUrl)}</p>
    </div>
    <div class="result-meta">
      <span class="verdict-pill risk">Needs retry</span>
    </div>
  `;
  reportOverview.innerHTML = `
    <div class="verdict-card risk">
      <span class="mini-label">Agent read</span>
      <h3>No reliable result</h3>
      <p>${escapeHtml(error.message || "Unable to analyze this URL.")}</p>
    </div>
  `;
  reportBody.innerHTML = `
    <article class="empty-row">
      <h3>No fallback report was generated</h3>
      <p>This MVP only shows extracted or returned evidence. It does not fill the report with sample product data when the live read fails.</p>
    </article>
  `;
  reportPanel.classList.remove("hidden");
}

async function analyzeProduct(productUrl) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ productUrl }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || "Unable to analyze the product URL.");
  }

  return response.json();
}

async function createProductPassport(productUrl) {
  const response = await fetch("/api/passports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ productUrl }),
  });

  if (response.status === 404 || response.status === 405) {
    const analysis = await analyzeProduct(productUrl);
    return {
      ...analysis,
      fallbackMode: "analysis-only",
    };
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || "Unable to create the product passport.");
  }

  return response.json();
}

tabButtons.forEach((tabButton) => {
  tabButton.addEventListener("click", () => {
    activeTab = tabButton.dataset.tab;
    renderActiveTab();
  });
});

exampleButtons.forEach((exampleButton) => {
  exampleButton.addEventListener("click", () => {
    input.value = exampleButton.dataset.exampleUrl || "";
    input.focus();
    setStatus("Example link added. Start the analysis when you are ready.", "active");
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const productUrl = input.value.trim();
  reportPanel.classList.add("hidden");

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

    const passportId = analysis.passport?.id ? ` Draft ${analysis.passport.id}.` : "";
    const mode = analysis.fallbackMode === "analysis-only" ? "Analysis complete without passport storage." : "Draft passport saved.";
    setStatus(`${mode}${passportId}`, "success");
  } catch (error) {
    window.clearInterval(stageTimer);
    renderStages(activeStage, "error");
    renderError(error, productUrl);
    setStatus(error.message || "Unable to create the product passport.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "Analyze";
  }
});

renderStages(-1, "idle");
