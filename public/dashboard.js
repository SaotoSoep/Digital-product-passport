(function attachProductPassportDashboard(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.ProductPassportDashboard = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function buildProductPassportDashboard() {
  const EVIDENCE_FIELDS = [
    ["productName", "Product name"],
    ["brand", "Brand"],
    ["productIdentifiers", "Product identifiers"],
    ["colorVariant", "Colour/variant"],
    ["productDescription", "Product description"],
    ["materialComposition", "Material"],
    ["sustainabilityClaims", "Sustainability claims"],
    ["careText", "Care"],
    ["supplierDetails", "Supplier/factory"],
    ["productionOrigin", "Origin/manufacturing"],
    ["certifications", "Certifications"],
    ["durabilityClaims", "Durability"],
  ];

  const SOURCE_LABELS = {
    brand_statement: "Brand statement",
    public_page_evidence: "Public product-page evidence",
    external_evidence: "External evidence",
    missing_information: "Missing information",
    interpretation: "Agent interpretation",
    product_page_deep_read: "Product page deep read",
    product_page_basic_extraction: "Product page basic extraction",
    user_provided_evidence: "User-provided evidence",
    "product-page": "Product page",
    "brand-page": "Brand page",
    "external-source": "External source",
    brand_page: "Public brand page",
    public_database: "Public database",
    agent_interpretation: "Agent interpretation",
    extraction_unavailable: "Extraction unavailable",
  };

  const STATUS_LABELS = {
    found: "Found",
    not_found: "Not found",
    unavailable: "Unavailable",
    fallback: "Fallback",
    partial: "Partial",
    success: "Success",
    failed: "Failed",
    scored: "Scored",
    not_available: "Not available",
  };

  const MATERIAL_COLORS = ["#244f6f", "#2f7782", "#b98518", "#7e8b92", "#c4d5dd"];

  const PASSPORT_MODULES = [
    {
      key: "summary",
      number: "01",
      label: "Summary",
      className: "passport-module-summary",
      descriptions: {
        overview: "Product context, report scope, and what this passport can currently show.",
        evidence: "Source trail and evidence records behind the product summary.",
        technical: "Capture diagnostics, access state, and report metadata.",
      },
    },
    {
      key: "keyFacts",
      number: "02",
      label: "Key facts",
      className: "passport-module-key-facts",
      descriptions: {
        overview: "Primary product information and compact disclosure scoring.",
        evidence: "Evidence records for product identity, description, identifiers, and variant facts.",
        technical: "Readiness internals and normalized field coverage for core facts.",
      },
    },
    {
      key: "material",
      number: "03",
      label: "Material",
      className: "passport-module-material",
      descriptions: {
        overview: "Material composition, reported percentages, and composition confidence.",
        evidence: "Material evidence, citations, certificates, and extraction confidence.",
        technical: "Raw material fields and technical normalization for composition data.",
      },
    },
    {
      key: "claims",
      number: "04",
      label: "Claims",
      className: "passport-module-claims",
      descriptions: {
        overview: "Environmental or ethical claim wording and the evidence supporting it.",
        evidence: "Claim wording, claim citations, verification status, and supporting records.",
        technical: "Claim score internals, evidence caps, and normalized claim fields.",
      },
    },
    {
      key: "traceability",
      number: "05",
      label: "Traceability",
      className: "passport-module-traceability",
      descriptions: {
        overview: "Known origin, supplier, and supply-chain disclosures.",
        evidence: "Origin, supplier, factory, and supply-chain evidence records.",
        technical: "Traceability fields and source diagnostics for production data.",
      },
    },
    {
      key: "care",
      number: "06",
      label: "Care",
      className: "passport-module-care",
      descriptions: {
        overview: "Interpretable care instructions plus the original returned care text.",
        evidence: "Care, durability, repair, and warranty evidence records.",
        technical: "Care and durability fields as normalized by the evidence pipeline.",
      },
    },
    {
      key: "missing",
      number: "07",
      label: "Missing",
      className: "passport-module-missing",
      descriptions: {
        overview: "Checked information that was not found, unavailable, or still unknown.",
        evidence: "Missing, unavailable, and unknown fields separated from found evidence.",
        technical: "Raw normalized evidence, brand context, and remaining diagnostic detail.",
      },
    },
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function cleanText(value) {
    return String(value ?? "")
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/[‘’]/g, "'")
      .replace(/[“”„]/g, '"')
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .trim();
  }

  function known(value) {
    const text = cleanText(value);
    return text && text !== "not_found" ? text : "";
  }

  function displayMachineStatus(value, fallback = "") {
    return cleanText(value || fallback).replaceAll("_", " ");
  }

  function normalizeStatus(status) {
    return ["found", "not_found", "unavailable", "fallback", "partial", "success", "failed"].includes(status)
      ? status
      : "unavailable";
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || displayMachineStatus(status || "unavailable");
  }

  function sourceLabel(source) {
    return SOURCE_LABELS[source] || displayMachineStatus(source || "Source");
  }

  function claimSourceLabel(source) {
    const labels = {
      brand_statement: "Brand/retailer wording",
      public_page_evidence: "Product-page evidence",
      external_evidence: "External verification source",
      user_provided_evidence: "User provided evidence",
      "product-page": "Product page",
      "brand-page": "Brand page",
      "external-source": "External verification source",
    };

    return labels[source] || sourceLabel(source);
  }

  function claimEvidenceAssessmentLabel(status) {
    const labels = {
      verified: "Supported by product-specific evidence",
      "partially-supported": "Partially supported by product evidence",
      unverified: "No supporting product evidence found",
      unavailable: "Evidence unavailable",
      brand_statement_only: "Brand wording only; not independently supported",
      independently_verified: "Independently verified",
      user_provided: "User provided; not independently verified",
      not_verified: "Not verified",
    };

    return labels[status] || displayMachineStatus(status || "Not verified");
  }

  function claimWordingSource(claim, records) {
    const wordingRecord = records.find((record) =>
      ["sustainabilityClaims", "certifications", "durabilityClaims"].includes(record?.fieldKey)
    );

    return wordingRecord?.sourceType || records[0]?.sourceType || claim?.sourceType || claim?.type;
  }

  function isValidUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (error) {
      return false;
    }
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

  function truncate(value, maxLength = 220) {
    const text = cleanText(value);
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength).replace(/\s+\S*$/, "").trim()}...`;
  }

  function fieldValues(field) {
    return Array.isArray(field?.values)
      ? field.values.map(cleanText).filter(Boolean)
      : [];
  }

  function fieldRecords(model, key) {
    const field = model?.fields?.[key] || {};
    if (Array.isArray(field.citationRecords) && field.citationRecords.length > 0) {
      return field.citationRecords;
    }

    const index = model?.evidenceRecordIndex;
    if (!Array.isArray(field.evidenceIds) || !index || typeof index.get !== "function") {
      return [];
    }

    return field.evidenceIds.map((id) => index.get(id)).filter(Boolean);
  }

  function claimRecords(model, claim) {
    const index = model?.evidenceRecordIndex;
    if (!Array.isArray(claim?.evidenceIds) || !index || typeof index.get !== "function") {
      return [];
    }

    return claim.evidenceIds.map((id) => index.get(id)).filter(Boolean);
  }

  function renderStatusPill(status) {
    const normalized = normalizeStatus(status);
    return `<span class="dashboard-status dashboard-status-${escapeHtml(normalized)}">${escapeHtml(statusLabel(normalized))}</span>`;
  }

  function renderEvidenceLink(record) {
    const label = [
      record?.id || "Evidence",
      sourceLabel(record?.sourceType),
      displayMachineStatus(record?.verificationStatus || record?.status),
      record?.extractionConfidence ? `${record.extractionConfidence} confidence` : "",
    ].filter(Boolean).join(" · ");

    if (isValidUrl(record?.sourceUrl)) {
      return `<a href="${escapeHtml(record.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
    }

    return `<span>${escapeHtml(label)}</span>`;
  }

  function renderEvidenceFragments(records, limit = 3) {
    const usableRecords = Array.isArray(records) ? records.filter(Boolean) : [];
    if (usableRecords.length === 0) {
      return "";
    }

    return `
      <ul class="dashboard-evidence-list">
        ${usableRecords.slice(0, limit).map((record) => `
          <li>
            ${renderEvidenceLink(record)}
            ${record.excerpt ? `<q>${escapeHtml(truncate(record.excerpt, 180))}</q>` : ""}
          </li>
        `).join("")}
      </ul>
    `;
  }

  function recordConfidence(records) {
    const record = Array.isArray(records) ? records.find(Boolean) : null;
    return cleanText(record?.extractionConfidence || "not supplied");
  }

  function fieldStatusText(model, key) {
    const field = model?.fields?.[key] || {};
    const status = normalizeStatus(field.status);
    return statusLabel(status);
  }

  function fieldValue(model, key, fallback = "") {
    const values = fieldValues(model?.fields?.[key]);
    if (values.length > 0) {
      return values[0];
    }

    return known(fallback);
  }

  function renderLongValue(value, emptyText = "Not found", maxLength = 96) {
    const text = known(value) || emptyText;
    if (text.length <= maxLength) {
      return `<span>${escapeHtml(text)}</span>`;
    }

    return `
      <details class="passport-inline-details">
        <summary>${escapeHtml(truncate(text, maxLength))}</summary>
        <p>${escapeHtml(text)}</p>
      </details>
    `;
  }

  function dashboardSummaryLabel(model) {
    if (model?.blockedPage || model?.extractionStatus === "failed") {
      return "Product page not fully readable";
    }

    const claims = dashboardClaims(model);
    const hasClaimWithoutIndependentEvidence = claims.some((claim) => {
      const records = claimRecords(model, claim);
      return !records.some((record) => record.sourceType === "external_evidence");
    });

    if (hasClaimWithoutIndependentEvidence) {
      return "Claim found; independent support missing";
    }

    const found = Number(model?.foundCount || 0);
    const checked = Number(model?.checkedCount || EVIDENCE_FIELDS.length);
    const ratio = checked > 0 ? found / checked : 0;

    if (ratio >= 0.7) {
      return "Much product information found";
    }

    if (ratio >= 0.35) {
      return "Product information partly available";
    }

    return "Limited product information found";
  }

  function renderDashboardHeader(model) {
    const createdAt = formatDateTime(model?.storedPassport?.createdAt || model?.generatedAt);
    const passportId = known(model?.storedPassport?.id);
    const status = known(model?.storedPassport?.status) || (model?.responseLinks?.self ? "draft" : "analysis only");
    const coverageText = `${Number(model?.foundCount || 0)}/${Number(model?.checkedCount || EVIDENCE_FIELDS.length)} fields found`;
    const productName = known(model?.productName) || "Product name not found";
    const brand = known(model?.brand) || "Brand not found";
    const retailer = known(model?.retailer) || "Retailer not identified";

    return `
      <div class="passport-hero">
        <div>
          <p class="section-kicker">Product passport · ${escapeHtml(retailer)}</p>
          <h2>${escapeHtml(productName)}</h2>
          <p class="passport-hero-subtitle">${escapeHtml(brand)} · ${escapeHtml(retailer)}</p>
          <p class="passport-hero-status">${escapeHtml(coverageText)} · ${escapeHtml(dashboardSummaryLabel(model))}</p>
          <p class="dashboard-disclaimer">Not an official EU Digital Product Passport. Not a certification. Not a sustainability verdict.</p>
        </div>
        <div class="result-meta">
          ${renderStatusPill(model?.extractionStatus)}
          <span>${escapeHtml(displayMachineStatus(status))}</span>
          <details class="passport-meta-details">
            <summary>Meta</summary>
            <dl>
              ${passportId ? `<div><dt>Analysis ID</dt><dd>${escapeHtml(passportId)}</dd></div>` : ""}
              ${createdAt ? `<div><dt>Created</dt><dd>${escapeHtml(createdAt)}</dd></div>` : ""}
              <div><dt>Source</dt><dd>${escapeHtml(retailer)}</dd></div>
            </dl>
          </details>
        </div>
      </div>
    `;
  }

  function factorList(factors, emptyText) {
    if (!Array.isArray(factors) || factors.length === 0) {
      return `<p class="dashboard-card-note">${escapeHtml(emptyText)}</p>`;
    }

    return `
      <ul class="dashboard-factor-list">
        ${factors.slice(0, 3).map((factor) => `
          <li>
            <strong>${escapeHtml(cleanText(factor.label || factor.key || "Factor"))}</strong>
            ${factor.reason ? `<span>${escapeHtml(cleanText(factor.reason))}</span>` : ""}
          </li>
        `).join("")}
      </ul>
    `;
  }

  function renderScoreGauge(label, score, targetId) {
    const available = score?.status === "scored" && Number.isFinite(Number(score.score));
    const numeric = available ? Math.max(0, Math.min(100, Math.round(Number(score.score)))) : null;
    const status = available ? "Scored" : "Not available";
    const summary = available
      ? cleanText(score?.rationale || `${label} is ${numeric} out of 100 based on returned score factors.`)
      : cleanText(score?.rationale || `${label} is not available because the returned evidence was not sufficient for the score rubric.`);

    return `
      <div class="passport-score-row ${available ? "" : "is-unavailable"}">
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(available ? `${numeric}/100` : "Not available")}</dd>
        </div>
        <span class="dashboard-score-status">${escapeHtml(status)}</span>
        <details class="passport-inline-details">
          <summary>Score explanation</summary>
          <p>${escapeHtml(summary)}</p>
          <div class="dashboard-score-factors" id="${escapeHtml(targetId)}">
            <section>
              <h4>Positive factors</h4>
              ${factorList(score?.topPositiveFactors, "No positive score factors were returned.")}
            </section>
            <section>
              <h4>Missing factors</h4>
              ${factorList(score?.missingFactors, "No missing score factors were returned.")}
            </section>
          </div>
        </details>
      </div>
    `;
  }

  function renderPassportScores(model) {
    return `
      <article class="passport-section passport-score-section" aria-labelledby="passport-scores-title">
        <div class="passport-section-heading">
          <p class="mini-label">Scores</p>
          <h4 id="passport-scores-title">Compact disclosure scores</h4>
        </div>
        <dl class="passport-score-list">
          ${renderScoreGauge("Transparency", model?.transparencyScore, "transparency-score-details")}
          ${renderScoreGauge("Claim strength", model?.claimScore, "claim-score-details")}
        </dl>
      </article>
    `;
  }

  function coverageCounts(model) {
    const fields = Array.isArray(model?.evidenceFields) && model.evidenceFields.length > 0
      ? model.evidenceFields
      : EVIDENCE_FIELDS.map(([key, label]) => ({
          key,
          label,
          status: normalizeStatus(model?.fields?.[key]?.status),
        }));
    const counts = { found: 0, not_found: 0, unavailable: 0 };

    for (const item of fields) {
      const status = normalizeStatus(item.status);
      if (status === "found") {
        counts.found += 1;
      } else if (status === "not_found") {
        counts.not_found += 1;
      } else {
        counts.unavailable += 1;
      }
    }

    return { fields, counts, total: fields.length || EVIDENCE_FIELDS.length };
  }

  function assemblyCountryValue(model) {
    const steps = originSteps(model);
    const assembly = steps.find((step) => step.step === "Assembly country") ||
      steps.find((step) => step.step === "Origin/manufacturing");
    return assembly?.value || fieldValue(model, "productionOrigin", "");
  }

  function factoryValue(model) {
    const steps = originSteps(model);
    const supplier = steps.find((step) => step.step === "Supplier/factory");
    return supplier?.value || fieldValue(model, "supplierDetails", "");
  }

  function claimsSummary(model) {
    const claims = dashboardClaims(model);
    if (claims.length === 0) {
      return "No clear sustainability claim found";
    }

    const firstClaim = known(claims[0]?.originalWording || claims[0]?.brandClaim || claims[0]?.claim);
    return claims.length === 1
      ? firstClaim || "1 claim found"
      : `${claims.length} claims found`;
  }

  function renderKeyFact(label, value, statusText, emptyText = "Not found") {
    return `
      <div class="passport-fact-row">
        <dt>${escapeHtml(label)}</dt>
        <dd>
          ${renderLongValue(value, emptyText)}
          <small>${escapeHtml(statusText)}</small>
        </dd>
      </div>
    `;
  }

  function renderKeyFacts(model) {
    const assemblyStatus = normalizeStatus(model?.fields?.productionOrigin?.status);
    const factoryStatus = normalizeStatus(model?.fields?.supplierDetails?.status);
    const rows = [
      renderKeyFact("Material", fieldValue(model, "materialComposition", model?.material), fieldStatusText(model, "materialComposition")),
      renderKeyFact(
        "Assembly country",
        assemblyCountryValue(model),
        fieldStatusText(model, "productionOrigin"),
        assemblyStatus === "unavailable" ? "Unavailable" : "Not found"
      ),
      renderKeyFact(
        "Factory",
        factoryValue(model),
        fieldStatusText(model, "supplierDetails"),
        factoryStatus === "unavailable" ? "Unavailable" : "Not found"
      ),
      renderKeyFact("Care", fieldValue(model, "careText", model?.care), fieldStatusText(model, "careText")),
      renderKeyFact("Claims", claimsSummary(model), fieldStatusText(model, "sustainabilityClaims"), "No clear claim found"),
    ];

    return `
      <article class="passport-section passport-key-facts" aria-labelledby="passport-key-facts-card-title">
        <div class="passport-section-heading">
          <p class="mini-label">Key facts</p>
          <h4 id="passport-key-facts-card-title">Primary product information</h4>
        </div>
        <dl>${rows.slice(0, 5).join("")}</dl>
      </article>
    `;
  }

  function renderProductSummary(model) {
    const summary = known(model?.productSummary || model?.productDescription || model?.rawProductDescription);
    const fallback = model?.blockedPage || model?.extractionStatus === "failed"
      ? "The product page was not fully readable. The passport only shows information that could be returned."
      : "No concise product summary was returned.";

    return `
      <article class="passport-section passport-product-summary" aria-labelledby="passport-summary-card-title">
        <div class="passport-section-heading">
          <p class="mini-label">Product summary</p>
          <h4 id="passport-summary-card-title">What this passport can currently show</h4>
        </div>
        <p>${escapeHtml(summary || fallback)}</p>
      </article>
    `;
  }

  function renderEvidenceCoverage(model) {
    const { fields, counts, total } = coverageCounts(model);
    const safeTotal = Math.max(1, total);
    const segments = [
      ["found", "Found", counts.found],
      ["not_found", "Not found", counts.not_found],
      ["unavailable", "Unavailable", counts.unavailable],
    ];

    return `
      <article class="dashboard-card dashboard-coverage-card">
        <div class="dashboard-card-heading">
          <div>
            <p class="mini-label">Evidence coverage</p>
            <h3>${escapeHtml(counts.found)} of ${escapeHtml(total)} checked fields found</h3>
          </div>
          <span class="dashboard-card-count">${escapeHtml(total)} fields</span>
        </div>
        <p class="dashboard-card-note">Found means information was actually found. Not found means the readable source was checked. Unavailable means the source could not be checked reliably.</p>
        <div class="dashboard-coverage-bar" aria-hidden="true">
          ${segments.map(([key, label, value]) => `
            <span class="dashboard-coverage-segment dashboard-coverage-${key}" style="--coverage-share: ${(value / safeTotal) * 100}%">
              ${escapeHtml(label)} ${escapeHtml(value)}
            </span>
          `).join("")}
        </div>
        <ul class="dashboard-coverage-legend">
          ${segments.map(([key, label, value]) => `
            <li><span class="legend-swatch dashboard-coverage-${key}" aria-hidden="true"></span><strong>${escapeHtml(label)}</strong> ${escapeHtml(value)}</li>
          `).join("")}
        </ul>
        <details class="dashboard-details">
          <summary>Show field status list</summary>
          <ul class="dashboard-field-status-list">
            ${fields.map((item) => `
              <li>
                <span>${escapeHtml(item.label || item.key)}</span>
                ${renderStatusPill(item.status)}
              </li>
            `).join("")}
          </ul>
        </details>
      </article>
    `;
  }

  function parseMaterialPercentage(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value >= 0 && value <= 100 ? value : null;
    }

    const text = cleanText(value);
    const match = text.match(/^(?:approx\.?\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*%?$/i);
    if (!match) {
      return null;
    }

    const parsed = Number(match[1].replace(",", "."));
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
  }

  function normalizeMaterialName(value) {
    return cleanText(value).toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, " ").trim();
  }

  function materialConflictReasons(model, parsedItems) {
    const reasons = [];
    const materialPercentages = new Map();

    for (const item of parsedItems) {
      const key = normalizeMaterialName(item.name);
      if (!key || item.percentage === null) continue;
      const set = materialPercentages.get(key) || new Set();
      set.add(item.percentage);
      materialPercentages.set(key, set);
    }

    for (const [name, percentages] of materialPercentages) {
      if (percentages.size > 1) {
        reasons.push(`Conflicting percentages were returned for ${name}.`);
      }
    }

    const fieldConflicts = [
      ...(Array.isArray(model?.fields?.materialComposition?.conflicts) ? model.fields.materialComposition.conflicts : []),
      ...(Array.isArray(model?.evidence?.contradictions) ? model.evidence.contradictions : []),
      ...(Array.isArray(model?.report?.contradictions) ? model.report.contradictions : []),
    ].map(cleanText).filter(Boolean);

    return [...new Set([...reasons, ...fieldConflicts])];
  }

  function materialDisplayRows(model) {
    const records = fieldRecords(model, "materialComposition");
    const items = Array.isArray(model?.materialItems) ? model.materialItems : [];
    const rows = items
      .map((item, index) => ({
        name: cleanText(item?.name),
        percentage: parseMaterialPercentage(item?.percentage),
        rawPercentage: cleanText(item?.percentage),
        explanation: cleanText(item?.explanation),
        sourceRecord: records[index] || records[0] || null,
      }))
      .filter((item) => item.name);

    if (rows.length > 0) {
      return rows;
    }

    const values = fieldValues(model?.fields?.materialComposition);
    return values.length > 0
      ? values.map((value) => ({
          name: value,
          percentage: null,
          rawPercentage: "",
          explanation: cleanText(model?.materialExplanation),
          sourceRecord: records[0] || null,
        }))
      : [];
  }

  function validateMaterialComposition(model) {
    const rows = materialDisplayRows(model);
    const reasons = [];
    const percentages = rows.map((row) => row.percentage);
    const conflicts = materialConflictReasons(model, rows);

    if (rows.length === 0) {
      reasons.push("No material composition was returned.");
    }

    if (rows.length > 0 && percentages.some((percentage) => percentage === null)) {
      reasons.push("One or more material percentages are missing or not numerically parseable.");
    }

    const sum = percentages.reduce((total, percentage) => total + (percentage || 0), 0);
    if (rows.length > 0 && percentages.every((percentage) => percentage !== null) && (sum < 98 || sum > 102)) {
      reasons.push(`Returned material percentages total ${Math.round(sum * 10) / 10}%, outside the accepted 98–102% range.`);
    }

    return {
      validForChart: rows.length > 0 && reasons.length === 0 && conflicts.length === 0,
      rows,
      total: sum,
      reasons: [...reasons, ...conflicts],
    };
  }

  function renderMaterialLegend(rows) {
    return `
      <ul class="dashboard-material-list">
        ${rows.map((row, index) => {
          return `
            <li>
              <span class="legend-swatch" style="background: ${MATERIAL_COLORS[index % MATERIAL_COLORS.length]}" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(row.percentage !== null ? `${row.percentage}% ${row.name}` : row.name)}</strong>
                ${row.explanation ? `<p>${escapeHtml(row.explanation)}</p>` : ""}
              </div>
            </li>
          `;
        }).join("")}
      </ul>
    `;
  }

  function renderMaterialChart(model) {
    const validation = validateMaterialComposition(model);
    const materialText = known(model?.evidenceMaterial || model?.material);
    const fallbackText = model?.fields?.materialComposition?.status === "unavailable"
      ? "Material information is unavailable because the source could not be read reliably."
      : "Material composition was checked but not found.";

    if (validation.validForChart) {
      let cursor = 0;
      const stops = validation.rows.map((row, index) => {
        const start = cursor;
        cursor += row.percentage;
        const color = MATERIAL_COLORS[index % MATERIAL_COLORS.length];
        return `${color} ${start}% ${cursor}%`;
      }).join(", ");

      return `
        <article class="passport-section dashboard-material-card" aria-labelledby="passport-material-card-title">
          <div class="passport-section-heading">
            <div>
              <p class="mini-label">Material composition</p>
              <h4 id="passport-material-card-title">Complete composition confirmed</h4>
            </div>
            ${renderStatusPill(model?.fields?.materialComposition?.status || "found")}
          </div>
          <div class="passport-material-bar" aria-hidden="true">
            ${validation.rows.map((row, index) => `
              <span style="--material-share: ${row.percentage}%; --material-color: ${MATERIAL_COLORS[index % MATERIAL_COLORS.length]}"></span>
            `).join("")}
          </div>
          <div class="dashboard-material-layout">
            <div class="passport-material-total">
              <strong>${Math.round(validation.total)}%</strong>
              <span>reported total</span>
            </div>
            <div>
              ${renderMaterialLegend(validation.rows)}
            </div>
          </div>
          <p class="dashboard-card-note">${escapeHtml(cleanText(model?.materialExplanation || "Percentages are visualised only because every returned material percentage is parseable and totals close to 100%."))}</p>
          <p class="dashboard-card-note">Terms such as organic or recycled remain claim words unless a separate product-linked verification source is shown.</p>
        </article>
      `;
    }

    return `
      <article class="passport-section dashboard-material-card" aria-labelledby="passport-material-card-title">
        <div class="passport-section-heading">
          <div>
            <p class="mini-label">Material composition</p>
            <h4 id="passport-material-card-title">Complete composition not confirmed</h4>
          </div>
          ${renderStatusPill(model?.fields?.materialComposition?.status)}
        </div>
        <p class="dashboard-card-note">Complete composition not publicly confirmed. Unknown percentages are not estimated.</p>
        ${validation.reasons.length > 0
          ? `<ul class="dashboard-factor-list">${validation.reasons.map((reason) => `<li><span>${escapeHtml(reason)}</span></li>`).join("")}</ul>`
          : ""}
        ${validation.rows.length > 0
          ? renderMaterialLegend(validation.rows)
          : `<p class="muted">${escapeHtml(materialText || fallbackText)}</p>`}
      </article>
    `;
  }

  function dashboardClaims(model) {
    if (Array.isArray(model?.claimVerifications) && model.claimVerifications.length > 0) {
      return model.claimVerifications;
    }

    const candidates = Array.isArray(model?.claimCitations) && model.claimCitations.length > 0
      ? model.claimCitations
      : Array.isArray(model?.claims)
        ? model.claims
        : [];
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

    const structured = candidates.filter((claim) => {
      const category = cleanText(claim?.claimCategory || claim?.category).toLowerCase();
      const sourceType = cleanText(claim?.sourceType || claim?.type).toLowerCase();
      const verificationStatus = cleanText(claim?.verificationStatus).toLowerCase();

      if (sourceType === "missing_information" || verificationStatus === "not_found" || verificationStatus === "unavailable") {
        return false;
      }

      return claimCategories.has(category) ||
        sourceType === "brand_statement" ||
        sourceType === "external_evidence" ||
        sourceType === "user_provided_evidence" ||
        /brand statement|independent|unverified|user provided/.test(verificationStatus);
    });

    if (structured.length > 0) {
      return structured;
    }

    return fieldValues(model?.fields?.sustainabilityClaims).map((claim, index) => ({
      id: `dashboard_claim_${index + 1}`,
      category: "sustainability",
      originalWording: claim,
      sourceType: model?.fields?.sustainabilityClaims?.source === "user_provided_evidence" ? "user_provided_evidence" : "brand_statement",
      verificationStatus: model?.fields?.sustainabilityClaims?.source === "user_provided_evidence" ? "user_provided" : "brand_statement_only",
      confidenceDimension: fieldRecords(model, "sustainabilityClaims")[index]?.extractionConfidence || "medium",
      evidenceIds: [model?.fields?.sustainabilityClaims?.evidenceIds?.[index]].filter(Boolean),
    }));
  }

  function scoreFactor(score, key) {
    return Array.isArray(score?.factors)
      ? score.factors.find((factor) => factor.key === key)
      : null;
  }

  function renderLadderStep(label, description, state) {
    const found = state === "found";
    return `
      <li class="dashboard-ladder-step ${found ? "is-found" : "is-missing"}">
        <span aria-hidden="true">${found ? "●" : "○"}</span>
        <div>
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(description)}</small>
        </div>
      </li>
    `;
  }

  function claimStrengthStatus(model, claims) {
    if (claims.length === 0) {
      return "No clear claim found";
    }

    const hasExternal = claims.some((claim) =>
      claim?.sourceType === "external-source" ||
      claimRecords(model, claim).some((record) => record.sourceType === "external_evidence")
    );
    if (hasExternal) {
      return "Independent product-linked verification found";
    }

    if (claims.some((claim) => claim?.verificationStatus === "verified")) {
      return "Product-specific support found";
    }

    if (claims.some((claim) => claim?.verificationStatus === "partially-supported")) {
      return "Partially supported claim";
    }

    const productSupportFactor = scoreFactor(model?.claimScore, "product_support");
    if (productSupportFactor?.status === "present" || productSupportFactor?.status === "partial") {
      return "Product-specific support found";
    }

    return "Brand claim only";
  }

  function renderClaimEvidenceLadder(model) {
    const claims = dashboardClaims(model);

    if (claims.length === 0) {
      return `
        <article class="passport-section dashboard-claims-card" aria-labelledby="passport-claims-card-title">
          <div class="passport-section-heading">
            <div>
              <p class="mini-label">Claims and evidence</p>
              <h4 id="passport-claims-card-title">No clear claim found</h4>
            </div>
            ${renderStatusPill(model?.fields?.sustainabilityClaims?.status || "not_found")}
          </div>
          <p class="dashboard-card-note">The available product content was checked, but no clear environmental or ethical product claim was returned.</p>
        </article>
      `;
    }

    const productSupportFactor = scoreFactor(model?.claimScore, "product_support");
    const hasProductSupport = productSupportFactor?.status === "present" || productSupportFactor?.status === "partial";

    return `
      <article class="passport-section dashboard-claims-card" aria-labelledby="passport-claims-card-title">
        <div class="passport-section-heading">
          <div>
            <p class="mini-label">Claims and evidence</p>
            <h4 id="passport-claims-card-title">${escapeHtml(claimStrengthStatus(model, claims))}</h4>
          </div>
          <span class="dashboard-card-count">${escapeHtml(claims.length)} claim${claims.length === 1 ? "" : "s"}</span>
        </div>
        <div class="dashboard-claim-stack">
          ${claims.map((claim) => {
            const wording = known(claim?.claimText || claim?.originalWording || claim?.brandClaim || claim?.claim) || "Claim wording not supplied";
            const records = claimRecords(model, claim);
            const independent = claim?.sourceType === "external-source" ||
              records.some((record) => record.sourceType === "external_evidence");
            const userProvided = records.some((record) => record.sourceType === "user_provided_evidence") || claim?.sourceType === "user_provided_evidence";
            const verificationStatus = displayMachineStatus(claim?.verificationStatus || (userProvided ? "user_provided" : "not_verified"));
            const evidenceStatus = cleanText(claim?.evidenceStatus);
            const claimHasProductSupport = evidenceStatus === "present" &&
              ["verified", "partially-supported"].includes(claim?.verificationStatus);
            const productSupportFound = hasProductSupport || claimHasProductSupport;
            const claimSource = claimWordingSource(claim, records);
            const productSupportDescription = productSupportFactor?.reason ||
              (claim?.verificationStatus === "verified"
                ? "Product-specific evidence directly supports the claim."
                : claim?.verificationStatus === "partially-supported"
                ? "Related product-specific evidence partially supports the claim."
                : "No product-specific supporting factor was returned for this claim.");
            const independentDescription = independent
              ? "An external product-linked evidence record is attached."
              : "No independent product-linked verification was found; brand or retailer wording is not counted as independent verification.";

            return `
              <section class="dashboard-claim-card">
                <h4>“${escapeHtml(truncate(wording, 160))}”</h4>
                <dl class="dashboard-mini-facts">
                  <div><dt>Claim source</dt><dd>${escapeHtml(claimSourceLabel(claimSource))}</dd></div>
                  <div><dt>Evidence assessment</dt><dd>${escapeHtml(claimEvidenceAssessmentLabel(claim?.verificationStatus || verificationStatus))}</dd></div>
                </dl>
                <details class="dashboard-details">
                  <summary>View claim evidence</summary>
                  <ol class="dashboard-ladder" aria-label="Evidence ladder for claim">
                    ${renderLadderStep("Claim wording found", "The claim wording is present in the returned report or evidence ledger.", "found")}
                    ${renderLadderStep("Product-specific support found", productSupportDescription, productSupportFound ? "found" : "missing")}
                    ${renderLadderStep("Independent product-linked verification found", independentDescription, independent ? "found" : "missing")}
                  </ol>
                </details>
                ${claim?.note ? `<p class="dashboard-card-note">${escapeHtml(cleanText(claim.note))}</p>` : ""}
              </section>
            `;
          }).join("")}
        </div>
      </article>
    `;
  }

  function splitLabeledFacts(values) {
    const facts = [];
    for (const value of values) {
      for (const part of cleanText(value).split(/;|\n|\|/)) {
        const cleaned = cleanText(part);
        if (!cleaned) continue;
        const match = cleaned.match(/^([^:]+):\s*(.+)$/);
        facts.push(match
          ? { label: cleanText(match[1]), detail: cleanText(match[2]) }
          : { label: "", detail: cleaned });
      }
    }
    return facts;
  }

  function originSteps(model) {
    const originValues = fieldValues(model?.fields?.productionOrigin);
    const supplierValues = fieldValues(model?.fields?.supplierDetails);
    const originFacts = splitLabeledFacts(originValues);
    const supplierFacts = splitLabeledFacts(supplierValues);
    const steps = [];
    const seen = new Set();

    function add(step, value, records, state = "found") {
      const detail = cleanText(value);
      const key = `${step.toLowerCase()}\u0000${detail.toLowerCase()}`;
      if (!detail || seen.has(key)) return;
      steps.push({ step, value: detail, records, state });
      seen.add(key);
    }

    for (const fact of originFacts) {
      const label = fact.label.toLowerCase();
      if (/raw|fibre|fiber|cotton|linen|wool/.test(label)) {
        add("Raw material origin", fact.detail, fieldRecords(model, "productionOrigin"));
      } else if (/spin|fibre processing|fiber processing/.test(label)) {
        add("Spinning/fibre processing", fact.detail, fieldRecords(model, "productionOrigin"));
      } else if (/weav|knit/.test(label)) {
        add("Weaving/knitting", fact.detail, fieldRecords(model, "productionOrigin"));
      } else if (/dye|finish/.test(label)) {
        add("Dyeing/finishing", fact.detail, fieldRecords(model, "productionOrigin"));
      } else if (/country|origin|made in|assembly/.test(label)) {
        add("Assembly country", fact.detail, fieldRecords(model, "productionOrigin"));
      } else if (!fact.label) {
        add("Origin/manufacturing", fact.detail, fieldRecords(model, "productionOrigin"));
      }
    }

    for (const fact of supplierFacts) {
      const label = fact.label.toLowerCase();
      if (/factory|supplier|address|employees/.test(label) || !fact.label) {
        add("Supplier/factory", fact.label ? `${fact.label}: ${fact.detail}` : fact.detail, fieldRecords(model, "supplierDetails"));
      }
    }

    return steps;
  }

  function renderOriginFlow(model) {
    const steps = originSteps(model);
    const knownRows = steps.map((step) => ({ ...step, state: "found" }));
    const hasStep = (patterns) => steps.some((step) => patterns.some((pattern) => pattern.test(step.step)));
    const missingRows = [
      [/Assembly country/i, /Origin\/manufacturing/i],
      [/Supplier\/factory/i],
      [/Raw material origin/i],
      [/Dyeing\/finishing/i],
    ].map((patterns, index) => ({
      step: ["Assembly country", "Supplier/factory", "Raw material origin", "Dyeing/finishing"][index],
      value: "Not disclosed",
      state: "missing",
      records: [],
      patterns,
    })).filter((row) => !hasStep(row.patterns));
    const traceRows = [...knownRows, ...missingRows];

    if (knownRows.length === 0) {
      const status = normalizeStatus(model?.fields?.productionOrigin?.status || model?.fields?.supplierDetails?.status);
      return `
        <article class="passport-section dashboard-origin-card" aria-labelledby="passport-traceability-card-title">
          <div class="passport-section-heading">
            <div>
              <p class="mini-label">Traceability</p>
              <h4 id="passport-traceability-card-title">No product-specific origin step found</h4>
            </div>
            ${renderStatusPill(status)}
          </div>
          <p class="dashboard-card-note">${status === "unavailable"
            ? "Origin and supplier information is unavailable because the source could not be checked reliably."
            : "The readable product content was checked, but no product-specific production or origin detail was found."}</p>
          <ol class="dashboard-origin-flow" aria-label="Traceability steps">
            ${missingRows.map((step) => `
              <li class="is-missing">
                <span class="dashboard-origin-dot" aria-hidden="true">○</span>
                <div>
                  <strong>${escapeHtml(step.step)}</strong>
                  <span>${escapeHtml(step.value)}</span>
                </div>
              </li>
            `).join("")}
          </ol>
        </article>
      `;
    }

    return `
      <article class="passport-section dashboard-origin-card" aria-labelledby="passport-traceability-card-title">
        <div class="passport-section-heading">
          <div>
            <p class="mini-label">Traceability</p>
            <h4 id="passport-traceability-card-title">Known steps and disclosures</h4>
          </div>
          <span class="dashboard-card-count">${escapeHtml(knownRows.length)} known</span>
        </div>
        <ol class="dashboard-origin-flow" aria-label="Known traceability steps">
          ${traceRows.map((step) => `
            <li class="${step.state === "missing" ? "is-missing" : ""}">
              <span class="dashboard-origin-dot" aria-hidden="true">${step.state === "missing" ? "○" : "✓"}</span>
              <div>
                <strong>${escapeHtml(step.step)}</strong>
                <span>${escapeHtml(step.value)}</span>
              </div>
            </li>
          `).join("")}
        </ol>
        <p class="dashboard-card-note">This does not imply the full supply chain is known.</p>
      </article>
    `;
  }

  function careInstructions(model) {
    const text = fieldValues(model?.fields?.careText).join(" ");
    const lower = text.toLowerCase();
    const rows = [];

    if (!text) {
      return rows;
    }

    const temperature = lower.match(/(\d{2})\s*°?\s*c/)?.[1];
    if (/machine wash|wash|wassen|wasvoorschrift|hand wash/.test(lower)) {
      rows.push({
        key: "wash",
        icon: temperature ? `${temperature}°` : /hand wash/.test(lower) ? "Hand" : "Wash",
        label: temperature ? `Machine wash at ${temperature}°C` : /hand wash/.test(lower) ? "Hand wash" : "Washing instruction found",
      });
    }

    if (/do not tumble|not tumble|niet in de droger/.test(lower)) {
      rows.push({ key: "dry", icon: "—", label: "Do not tumble dry" });
    } else if (/tumble dry|line dry|dry flat|droger|hang dry/.test(lower)) {
      rows.push({ key: "dry", icon: "Dry", label: "Drying instruction found" });
    }

    if (/do not iron|niet strijken/.test(lower)) {
      rows.push({ key: "iron", icon: "—", label: "Do not iron" });
    } else if (/iron|strijk/.test(lower)) {
      rows.push({ key: "iron", icon: "•", label: /low/.test(lower) ? "Iron at low temperature" : "Ironing instruction found" });
    }

    if (/do not bleach|niet bleken/.test(lower)) {
      rows.push({ key: "bleach", icon: "—", label: "Do not bleach" });
    } else if (/bleach|bleken/.test(lower)) {
      rows.push({ key: "bleach", icon: "Bleach", label: "Bleaching instruction found" });
    }

    if (/do not dry clean|niet chemisch reinigen/.test(lower)) {
      rows.push({ key: "dry-clean", icon: "—", label: "Do not dry clean" });
    } else if (/dry clean|chemisch reinigen/.test(lower)) {
      rows.push({ key: "dry-clean", icon: "P", label: "Dry-cleaning instruction found" });
    }

    return rows;
  }

  function renderCareIcons(model) {
    const status = normalizeStatus(model?.fields?.careText?.status);
    const text = fieldValues(model?.fields?.careText).join(" ");
    const rows = careInstructions(model);
    const labels = {
      wash: "Wash",
      dry: "Dry",
      iron: "Iron",
      bleach: "Bleach",
      "dry-clean": "Dry clean",
    };

    return `
      <article class="passport-section dashboard-care-card" aria-labelledby="passport-care-card-title">
        <div class="passport-section-heading">
          <div>
            <p class="mini-label">Care</p>
            <h4 id="passport-care-card-title">${rows.length > 0 ? "Interpretable care categories found" : status === "found" ? "Care text found" : "No care instructions found"}</h4>
          </div>
          ${renderStatusPill(status)}
        </div>
        ${rows.length > 0
          ? `<ul class="dashboard-care-list">${rows.map((row) => `
              <li>
                <span>${escapeHtml(labels[row.key] || row.key)}</span>
                <strong>${escapeHtml(row.label)}</strong>
              </li>
            `).join("")}</ul>`
          : `<p class="dashboard-card-note">${escapeHtml(status === "unavailable"
              ? "Care information is unavailable because the source could not be checked reliably."
              : status === "found"
                ? "Care text was returned, but it was not interpreted into pictogram categories."
                : "The readable source was checked, but care information was not found.")}</p>`}
        <details class="dashboard-details">
          <summary>Original care text</summary>
          <p>${escapeHtml(text || "No original care text was returned.")}</p>
        </details>
        <p class="dashboard-card-note">The physical garment care label remains leading.</p>
      </article>
    `;
  }

  function missingAndUnavailable(model) {
    const { fields } = coverageCounts(model);
    return {
      missing: fields.filter((item) => normalizeStatus(item.status) === "not_found").map((item) => item.label || item.key),
      unavailable: fields.filter((item) => normalizeStatus(item.status) === "unavailable").map((item) => item.label || item.key),
    };
  }

  function renderUnknownList(items, emptyText) {
    return items.length > 0
      ? `<ul>${items.map((item) => `<li>${escapeHtml(cleanText(item))}</li>`).join("")}</ul>`
      : `<p class="state-empty">${escapeHtml(emptyText)}</p>`;
  }

  function renderDashboardUnknowns(model) {
    const { missing, unavailable } = missingAndUnavailable(model);
    const otherUnknowns = Array.isArray(model?.unknowns) ? model.unknowns.map(cleanText).filter(Boolean) : [];

    return `
      <article class="passport-section dashboard-unknowns-card" aria-labelledby="passport-missing-card-title">
        <div class="passport-section-heading">
          <div>
            <p class="mini-label">Missing information</p>
            <h4 id="passport-missing-card-title">${escapeHtml(missing.length)} not found · ${escapeHtml(unavailable.length)} unavailable</h4>
          </div>
          <span class="dashboard-card-count">${escapeHtml(missing.length + unavailable.length + otherUnknowns.length)} items</span>
        </div>
        <details class="dashboard-details">
          <summary>Show unavailable and unknown fields</summary>
          <div class="dashboard-unknown-grid">
            <section class="information-state missing-information">
              <div class="information-state-heading">
                <h4>Not found</h4>
                <span>${escapeHtml(missing.length)}</span>
              </div>
              <p>The product page was readable, but this information was not found.</p>
              ${renderUnknownList(missing, "No checked fields are currently marked as not found.")}
            </section>
            <section class="information-state unavailable-information">
              <div class="information-state-heading">
                <h4>Unavailable</h4>
                <span>${escapeHtml(unavailable.length)}</span>
              </div>
              <p>The source could not be read well enough to determine whether this information exists.</p>
              ${renderUnknownList(unavailable, "No checked fields are currently marked as unavailable.")}
            </section>
            <section class="information-state unverified-information">
              <div class="information-state-heading">
                <h4>Other unknowns</h4>
                <span>${escapeHtml(otherUnknowns.length)}</span>
              </div>
              <p>Additional points returned by the report.</p>
              ${renderUnknownList(otherUnknowns, "No additional unknowns were returned.")}
            </section>
          </div>
        </details>
      </article>
    `;
  }

  function sourceRows(model) {
    const records = Array.isArray(model?.evidenceLedger?.records)
      ? model.evidenceLedger.records
      : [];
    const groups = new Map();

    for (const record of records) {
      if (!record || record.sourceType === "missing_information") {
        continue;
      }

      const sourceType = record.sourceType || "interpretation";
      const sourceUrl = record.sourceUrl || (sourceType === "user_provided_evidence" ? "user-provided://evidence" : "");
      const key = `${sourceType}\u0000${sourceUrl}\u0000${record.captureMethod || ""}`;
      if (!groups.has(key)) {
        groups.set(key, {
          label: sourceLabel(record.captureMethod || sourceType),
          sourceType,
          sourceUrl,
          capturedAt: record.capturedAt,
          verificationStatus: record.verificationStatus,
          extractionConfidence: record.extractionConfidence,
          records: [],
        });
      }
      groups.get(key).records.push(record);
    }

    const rows = [...groups.values()];
    const brandSources = Array.isArray(model?.brandInsight?.sources)
      ? model.brandInsight.sources
      : [];

    for (const source of brandSources) {
      rows.push({
        label: cleanText(source.label || source.topic || "Public brand context"),
        sourceType: "brand_page",
        sourceUrl: source.url || "",
        capturedAt: model?.generatedAt,
        verificationStatus: "public_context_not_product_verification",
        extractionConfidence: source.status === "unavailable" ? "low" : "medium",
        records: (source.snippets || []).map((snippet, index) => ({
          id: `brand_context_${index + 1}`,
          sourceType: "brand_page",
          sourceUrl: source.url,
          verificationStatus: "public_context_not_product_verification",
          extractionConfidence: source.status === "unavailable" ? "low" : "medium",
          excerpt: snippet || source.note,
        })),
      });
    }

    if (rows.length === 0) {
      rows.push({
        label: "Submitted product page",
        sourceType: "product_page_basic_extraction",
        sourceUrl: model?.submittedUrl || "",
        capturedAt: model?.generatedAt,
        verificationStatus: model?.extractionStatus || "partial",
        extractionConfidence: "not supplied",
        records: [],
      });
    }

    return rows.slice(0, 8);
  }

  function renderDashboardSources(model) {
    const rows = sourceRows(model);

    return `
      <article class="dashboard-card dashboard-sources-card dashboard-full-width">
        <div class="dashboard-card-heading">
          <div>
            <p class="mini-label">Sources and evidence</p>
            <h3>Compact source trail</h3>
          </div>
          <span class="dashboard-card-count">${escapeHtml(rows.length)} source${rows.length === 1 ? "" : "s"}</span>
        </div>
        <div class="dashboard-source-list">
          ${rows.map((row) => `
            <details class="dashboard-source-row">
              <summary>
                <span>
                  <strong>${escapeHtml(row.label || sourceLabel(row.sourceType))}</strong>
                  <small>${escapeHtml(sourceLabel(row.sourceType))}</small>
                </span>
                <span class="dashboard-source-meta">${escapeHtml(row.extractionConfidence || "not supplied")} confidence</span>
              </summary>
              <dl class="dashboard-mini-facts">
                <div><dt>URL</dt><dd>${isValidUrl(row.sourceUrl) ? `<a href="${escapeHtml(row.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(row.sourceUrl)}</a>` : escapeHtml(row.sourceUrl || "No public URL")}</dd></div>
                <div><dt>Extracted</dt><dd>${escapeHtml(formatDateTime(row.capturedAt) || "Not supplied")}</dd></div>
                <div><dt>Verification</dt><dd>${escapeHtml(displayMachineStatus(row.verificationStatus || "not supplied"))}</dd></div>
              </dl>
              ${row.sourceType === "interpretation" || row.sourceType === "agent_interpretation"
                ? `<p class="dashboard-card-note">Agent interpretation is not presented as a public source.</p>`
                : ""}
              ${renderEvidenceFragments(row.records, 5)}
            </details>
          `).join("")}
        </div>
      </article>
    `;
  }

  function passportModuleDefinitions(kind = "overview") {
    const prefix = kind === "overview" ? "" : `${kind}-`;

    return PASSPORT_MODULES.map((module) => ({
      key: module.key,
      number: module.number,
      label: module.label,
      titleId: `${prefix}passport-${module.key === "keyFacts" ? "key-facts" : module.key}-title`,
      description: module.descriptions[kind] || module.descriptions.overview,
      className: module.className,
      body: "",
    }));
  }

  function renderPassportModule({ number, label, titleId, description, body, className = "", layout = "" }) {
    const bodyClass = ["passport-module-body", layout === "stack" ? "" : "is-card-grid"]
      .filter(Boolean)
      .join(" ");

    return `
      <section class="passport-module ${escapeHtml(className)}" aria-labelledby="${escapeHtml(titleId)}">
        <header class="passport-module-heading">
          <span class="passport-module-index" aria-hidden="true">${escapeHtml(number)}</span>
          <div>
            <p class="mini-label">Passport module</p>
            <h3 id="${escapeHtml(titleId)}">${escapeHtml(label)}</h3>
            <p>${escapeHtml(description)}</p>
          </div>
        </header>
        <div class="${escapeHtml(bodyClass)}">
          ${body}
        </div>
      </section>
    `;
  }

  function renderPassportModuleNav(modules) {
    return `
      <nav class="passport-side-nav" aria-label="Passport module navigation">
        <span>Passport modules</span>
        ${modules.map((module) => `
          <a href="#${escapeHtml(module.titleId)}"><strong>${escapeHtml(module.number)}</strong> ${escapeHtml(module.label)}</a>
        `).join("")}
      </nav>
    `;
  }

  function renderPassportModuleShell({ ariaLabel = "Product passport modules", modules }) {
    return `
      <section class="passport-overview" aria-label="${escapeHtml(ariaLabel)}">
        ${renderPassportModuleNav(modules)}
        <div class="passport-main">
          ${modules.map(renderPassportModule).join("")}
        </div>
      </section>
    `;
  }

  function renderDashboard(model) {
    const bodyByKey = {
      summary: renderProductSummary(model),
      keyFacts: {
        body: `${renderKeyFacts(model)}${renderPassportScores(model)}`,
        layout: "card-grid",
      },
      material: {
        body: renderMaterialChart(model),
        layout: "card-grid",
      },
      claims: renderClaimEvidenceLadder(model),
      traceability: renderOriginFlow(model),
      care: renderCareIcons(model),
      missing: renderDashboardUnknowns(model),
    };
    const modules = passportModuleDefinitions("overview").map((module) => ({
      ...module,
      body: typeof bodyByKey[module.key] === "object" ? bodyByKey[module.key].body : bodyByKey[module.key] || "",
      layout: typeof bodyByKey[module.key] === "object" ? bodyByKey[module.key].layout : "",
    }));

    return renderPassportModuleShell({
      ariaLabel: "Product passport overview",
      modules,
    });
  }

  return {
    careInstructions,
    coverageCounts,
    dashboardClaims,
    dashboardSummaryLabel,
    materialDisplayRows,
    missingAndUnavailable,
    passportModuleDefinitions,
    parseMaterialPercentage,
    renderCareIcons,
    renderClaimEvidenceLadder,
    renderDashboard,
    renderDashboardHeader,
    renderDashboardSources,
    renderDashboardUnknowns,
    renderEvidenceCoverage,
    renderKeyFacts,
    renderMaterialChart,
    renderPassportModuleShell,
    renderOriginFlow,
    renderPassportScores,
    renderScoreGauge,
    sourceRows,
    validateMaterialComposition,
  };
});
