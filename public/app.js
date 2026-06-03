const form = document.getElementById("analysis-form");
const input = document.getElementById("product-url");
const button = document.getElementById("submit-button");
const statusBox = document.getElementById("status");
const reportContainer = document.getElementById("report");

const mockProductPassportReport = {
  productName: "Relaxed Organic Cotton Overshirt",
  brand: "Northline Studio",
  confidenceScore: "Medium",
  materials: [
    {
      name: "Organic cotton",
      percentage: "78%",
      confidence: "High",
    },
    {
      name: "Recycled polyester",
      percentage: "22%",
      confidence: "Medium",
    },
  ],
  claims: [
    {
      claim: "Made with organic cotton",
      evidenceLevel: "Brand claim on product page",
      confidence: "Medium",
    },
    {
      claim: "Contains recycled materials",
      evidenceLevel: "Material composition mention",
      confidence: "Medium",
    },
  ],
  missingInformation: [
    {
      label: "Country of manufacture",
      value: "Information not found",
    },
    {
      label: "Factory or supplier details",
      value: "Not publicly verifiable",
    },
    {
      label: "Third-party certification reference",
      value: "Information not found",
    },
  ],
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function badgeClass(confidence) {
  return `badge ${String(confidence || "").toLowerCase()}`;
}

function evidenceStatusLabel(status) {
  const labels = {
    found: "Product page evidence",
    not_found: "Not found",
    unavailable: "Unavailable",
    fallback: "Fallback",
  };

  return labels[status] || labels.unavailable;
}

function evidenceStatusClass(status) {
  return `status-badge status-${status || "unavailable"}`;
}

function renderStatusBadge(status) {
  return `<span class="${evidenceStatusClass(status)}">${escapeHtml(evidenceStatusLabel(status))}</span>`;
}

function evidenceValues(field) {
  return field && Array.isArray(field.values)
    ? field.values.filter(Boolean)
    : [];
}

function firstEvidenceValue(field, fallback) {
  const values = evidenceValues(field);
  return values.length > 0 ? values[0] : fallback;
}

function renderFallbackBlock(fallback) {
  if (!fallback || !Array.isArray(fallback.values) || fallback.values.length === 0) {
    return "";
  }

  const values = fallback.values
    .map((value) => `<p>${escapeHtml(value)}</p>`)
    .join("");

  return `
    <div class="fallback-block">
      <div class="detail-topline">
        <span>${escapeHtml(fallback.sourceLabel || "Fallback report value")}</span>
        ${renderStatusBadge("fallback")}
      </div>
      ${values}
      ${fallback.note ? `<p class="muted">${escapeHtml(fallback.note)}</p>` : ""}
    </div>
  `;
}

function renderEvidenceItem(field, emptyLabel) {
  if (!field) {
    return `
      <li class="detail-item evidence-item evidence-unavailable">
        <div class="detail-topline">
          <span>${escapeHtml(emptyLabel || "Product page field")}</span>
          ${renderStatusBadge("unavailable")}
        </div>
        <p>Product-page evidence is unavailable for this field.</p>
      </li>
    `;
  }

  const values = evidenceValues(field);
  const displayValues = values.length > 0
    ? values
    : [emptyLabel || field.note || "Information not found on the submitted product page."];
  const sourceMeta = field.sourceUrl && field.extractedAt
    ? `<p class="evidence-meta">Source: ${escapeHtml(field.sourceLabel)} - ${escapeHtml(field.sourceUrl)} - ${escapeHtml(field.extractedAt)}</p>`
    : `<p class="evidence-meta">${escapeHtml(field.sourceLabel)}</p>`;

  return `
    <li class="detail-item evidence-item evidence-${escapeHtml(field.status)}">
      <div class="detail-topline">
        <span>${escapeHtml(field.label)}</span>
        ${renderStatusBadge(field.status)}
      </div>
      ${displayValues.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}
      ${sourceMeta}
      ${renderFallbackBlock(field.fallback)}
    </li>
  `;
}

function renderMockFallbackNotice() {
  return `
    <p class="muted fallback-note">
      ${renderStatusBadge("fallback")}
      Sample fallback content below was not extracted from the submitted product page.
    </p>
  `;
}

function isValidProductUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function renderMaterials(materials) {
  return materials
    .map(
      (material) => `
        <li class="detail-item">
          <div class="detail-topline">
            <span>${escapeHtml(material.name)}${material.percentage ? ` (${escapeHtml(material.percentage)})` : ""}</span>
            <span class="${badgeClass(material.confidence)}">${escapeHtml(material.confidence)}</span>
          </div>
        </li>
      `
    )
    .join("");
}

function renderClaims(claims) {
  return claims
    .map(
      (claim) => `
        <li class="detail-item claim-item">
          <div class="detail-topline">
            <span>${escapeHtml(claim.claim)}</span>
            <span class="${badgeClass(claim.confidence)}">${escapeHtml(claim.confidence)}</span>
          </div>
          <p class="muted"><strong>Source label:</strong> ${escapeHtml(claim.evidenceLevel)}</p>
        </li>
      `
    )
    .join("");
}

function renderVisibleSnippets(snippets, emptyLabel) {
  const items = snippets && snippets.length > 0
    ? snippets
    : [emptyLabel];

  return items
    .map(
      (snippet) => `
        <li class="detail-item">
          <p>${escapeHtml(snippet)}</p>
        </li>
      `
    )
    .join("");
}

function renderMissingInformation(items) {
  return items
    .map(
      (item) => `
        <li class="detail-item unknown-item">
          <p><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</p>
        </li>
      `
    )
    .join("");
}

function renderSnapshot(snapshot, evidence) {
  if (!snapshot && !evidence) {
    return "";
  }

  const fields = evidence
    ? [
        evidence.fields.pageTitle,
        evidence.fields.canonicalUrl,
        evidence.fields.productName,
        evidence.fields.brand,
      ]
    : [
        {
          label: "Page title",
          status: snapshot.pageTitle && snapshot.pageTitle !== "not_found" ? "found" : "not_found",
          values: snapshot.pageTitle && snapshot.pageTitle !== "not_found" ? [snapshot.pageTitle] : [],
          sourceLabel: "Submitted product page",
          sourceUrl: snapshot.sourceUrl,
          extractedAt: snapshot.extractionTimestamp,
        },
        {
          label: "Canonical URL",
          status: snapshot.canonicalUrl && snapshot.canonicalUrl !== "not_found" ? "found" : "not_found",
          values: snapshot.canonicalUrl && snapshot.canonicalUrl !== "not_found" ? [snapshot.canonicalUrl] : [],
          sourceLabel: "Submitted product page",
          sourceUrl: snapshot.sourceUrl,
          extractedAt: snapshot.extractionTimestamp,
        },
        {
          label: "Product name",
          status: snapshot.likelyProductName && snapshot.likelyProductName !== "not_found" ? "found" : "not_found",
          values: snapshot.likelyProductName && snapshot.likelyProductName !== "not_found" ? [snapshot.likelyProductName] : [],
          sourceLabel: "Submitted product page",
          sourceUrl: snapshot.sourceUrl,
          extractedAt: snapshot.extractionTimestamp,
        },
        {
          label: "Brand",
          status: snapshot.likelyBrand && snapshot.likelyBrand !== "not_found" ? "found" : "not_found",
          values: snapshot.likelyBrand && snapshot.likelyBrand !== "not_found" ? [snapshot.likelyBrand] : [],
          sourceLabel: "Submitted product page",
          sourceUrl: snapshot.sourceUrl,
          extractedAt: snapshot.extractionTimestamp,
        },
      ];

  const listItems = fields
    .map((field) => renderEvidenceItem(field, `${field.label} not found on product page`))
    .join("");

  const notes = ((evidence && evidence.notes) || (snapshot && snapshot.extractionNotes) || [])
    .map((note) => `<li class="detail-item"><p>${escapeHtml(note)}</p></li>`)
    .join("");

  return `
    <article class="card">
      <h2>Product page snapshot</h2>
      ${evidence ? `<p class="evidence-summary">${escapeHtml(evidence.summary)}</p>` : ""}
      <ul class="detail-list">${listItems}</ul>
      ${notes ? `<ul class="detail-list snapshot-notes">${notes}</ul>` : ""}
    </article>
  `;
}

function valueOrFallback(value, fallback) {
  return value && value !== "not_found" ? value : fallback;
}

function renderReport(analysis, submittedUrl) {
  const storedPassport = analysis.passport || null;
  const analysisReport = analysis.analysis || analysis;
  const passport = analysisReport.report || analysis.report || analysis;
  const snapshot = storedPassport?.snapshot || (analysisReport.metadata ? analysisReport.metadata.productPageSnapshot : null);
  const evidence = (storedPassport && storedPassport.report && storedPassport.report.productPageEvidence)
    || passport.productPageEvidence
    || null;
  const fields = evidence ? evidence.fields : {};
  const productName = firstEvidenceValue(
    fields.productName,
    valueOrFallback(storedPassport?.productName || analysis.productName || snapshot?.likelyProductName, "Product name not found on product page")
  );
  const brand = firstEvidenceValue(
    fields.brand,
    valueOrFallback(storedPassport?.brand || analysis.brand || snapshot?.likelyBrand, "Brand not found on product page")
  );
  const materialSnippets = snapshot?.materialCompositionText || [];
  const claimSnippets = snapshot?.sustainabilityClaimSnippets || [];
  const careSnippets = snapshot?.careText || [];
  const claims = passport.claims || passport.sustainabilityClaimsFound || [];
  const publicLink = analysis.links?.public
    ? `<div><strong>Public API:</strong> ${escapeHtml(analysis.links.public)}</div>`
    : "";

  reportContainer.innerHTML = `
    <div class="report-header">
      <div>
        <p class="eyebrow">${evidence ? "Product-page evidence report" : storedPassport ? "Saved draft passport" : snapshot ? "Evidence-aware report" : "Mock fallback report"}</p>
        <h2 class="report-title">Product Passport Report</h2>
      </div>
      <div class="report-meta">
        <div><strong>Input URL:</strong> ${escapeHtml(submittedUrl)}</div>
        ${storedPassport ? `<div><strong>Passport ID:</strong> ${escapeHtml(storedPassport.id)}</div>` : ""}
        ${storedPassport ? `<div><strong>Status:</strong> ${escapeHtml(storedPassport.status)}</div>` : ""}
        <div><strong>Extraction status:</strong> ${escapeHtml(evidence?.extractionStatus || snapshot?.extractionStatus || passport.confidenceScore || "Mock")}</div>
        ${evidence ? `<div><strong>Evidence summary:</strong> ${escapeHtml(evidence.summary)}</div>` : ""}
        ${publicLink}
      </div>
    </div>

    <div class="grid">
      <article class="card">
        <h2>Product</h2>
        ${evidence ? `
          <ul class="detail-list">
            ${renderEvidenceItem(fields.productName, "Product name not found on product page")}
            ${renderEvidenceItem(fields.brand, "Brand not found on product page")}
          </ul>
        ` : `
          ${renderMockFallbackNotice()}
          <p><strong>Name:</strong> ${escapeHtml(productName)}</p>
          <p><strong>Brand:</strong> ${escapeHtml(brand)}</p>
        `}
        ${passport.productSummary ? `<p class="muted report-summary"><strong>Report summary:</strong> ${escapeHtml(passport.productSummary)}</p>` : ""}
      </article>

      <article class="card">
        <h2>Materials</h2>
        ${evidence ? `
          <ul class="detail-list">
            ${renderEvidenceItem(fields.materialComposition, "Material/composition not found on product page")}
          </ul>
        ` : `
          ${renderMockFallbackNotice()}
          <ul class="detail-list">${
            materialSnippets.length > 0
              ? renderVisibleSnippets(materialSnippets, "Material information not found")
              : passport.materials
              ? renderMaterials(passport.materials)
              : renderMaterials([
                  {
                    name: passport.materialExplained?.rawMaterial || "Material not found",
                    confidence: passport.materialExplained?.confidence || "Low",
                  },
                ])
          }</ul>
        `}
      </article>

      <article class="card">
        <h2>Claims</h2>
        ${evidence ? `
          <ul class="detail-list">
            ${renderEvidenceItem(fields.sustainabilityClaims, "Sustainability claim text not found on product page")}
          </ul>
        ` : `
          ${renderMockFallbackNotice()}
          <ul class="detail-list">${
            claimSnippets.length > 0
              ? renderVisibleSnippets(claimSnippets, "Sustainability claim text not found")
              : claims.length > 0
              ? renderClaims(claims)
              : renderVisibleSnippets([], "Sustainability claim text not found")
          }</ul>
        `}
      </article>

      <article class="card">
        <h2>Care</h2>
        ${evidence ? `
          <ul class="detail-list">
            ${renderEvidenceItem(fields.careText, "Care information not found on product page")}
          </ul>
        ` : `
          ${renderMockFallbackNotice()}
          <ul class="detail-list">${renderVisibleSnippets(careSnippets, "Care information not found")}</ul>
        `}
      </article>

      <article class="card">
        <h2>Missing information</h2>
        <ul class="detail-list">${
          passport.missingInformation
            ? renderMissingInformation(passport.missingInformation)
            : renderMissingInformation((passport.unknowns || []).map((value) => ({
                label: "Unknown",
                value,
              })))
        }</ul>
      </article>

      ${renderSnapshot(snapshot, evidence)}
    </div>
  `;

  reportContainer.classList.remove("hidden");
}

function getMockProductPassport() {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(mockProductPassportReport), 900);
  });
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const productUrl = input.value.trim();
  reportContainer.classList.add("hidden");

  if (!productUrl) {
    statusBox.textContent = "Enter a product URL to continue.";
    return;
  }

  if (!isValidProductUrl(productUrl)) {
    statusBox.textContent = "Enter a valid product URL starting with http:// or https://.";
    return;
  }

  statusBox.textContent = "Creating a saved draft passport from visible product page information...";
  button.disabled = true;
  button.textContent = "Creating...";

  try {
    const analysis = await createProductPassport(productUrl);
    renderReport(analysis, productUrl);
    const status = analysis.passport?.extractionStatus || "partial";
    const passportId = analysis.passport?.id ? ` Passport ID: ${analysis.passport.id}.` : "";
    statusBox.textContent = analysis.fallbackMode === "analysis-only"
      ? "Product page analysis complete. Passport storage is not available on this deployment yet."
      : `Draft passport saved (${status}).${passportId}`;
  } catch (error) {
    const passport = await getMockProductPassport();
    renderReport(passport, productUrl);
    statusBox.textContent = `${error.message || "Unable to create the product passport."} Showing mock fallback report.`;
  } finally {
    button.disabled = false;
    button.textContent = "Create draft passport";
  }
});
