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
          <p class="muted"><strong>Evidence level:</strong> ${escapeHtml(claim.evidenceLevel)}</p>
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

function renderSnapshot(snapshot) {
  if (!snapshot) {
    return "";
  }

  const listItems = [
    ["Status", snapshot.extractionStatus],
    ["Page title", snapshot.pageTitle],
    ["Canonical URL", snapshot.canonicalUrl],
    ["Product name", snapshot.likelyProductName],
    ["Brand", snapshot.likelyBrand],
  ]
    .map(
      ([label, value]) => `
        <li class="detail-item">
          <p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value || "not_found")}</p>
        </li>
      `
    )
    .join("");

  const notes = (snapshot.extractionNotes || [])
    .map((note) => `<li class="detail-item"><p>${escapeHtml(note)}</p></li>`)
    .join("");

  return `
    <article class="card">
      <h2>Product page snapshot</h2>
      <ul class="detail-list">${listItems}</ul>
      ${notes ? `<ul class="detail-list snapshot-notes">${notes}</ul>` : ""}
    </article>
  `;
}

function renderReport(analysis, submittedUrl) {
  const passport = analysis.report || analysis;
  const snapshot = analysis.metadata ? analysis.metadata.productPageSnapshot : null;
  const productName = analysis.productName || snapshot?.likelyProductName || "Product name not found";
  const brand = analysis.brand || snapshot?.likelyBrand || "Brand not found";
  const materialSnippets = snapshot?.materialCompositionText || [];
  const claimSnippets = snapshot?.sustainabilityClaimSnippets || [];
  const careSnippets = snapshot?.careText || [];
  const claims = passport.claims || passport.sustainabilityClaimsFound || [];

  reportContainer.innerHTML = `
    <div class="report-header">
      <div>
        <p class="eyebrow">${snapshot ? "Evidence-aware report" : "Mock report"}</p>
        <h2 class="report-title">Product Passport Report</h2>
      </div>
      <div class="report-meta">
        <div><strong>Input URL:</strong> ${escapeHtml(submittedUrl)}</div>
        <div><strong>Extraction status:</strong> ${escapeHtml(snapshot?.extractionStatus || passport.confidenceScore || "Mock")}</div>
      </div>
    </div>

    <div class="grid">
      <article class="card">
        <h2>Product</h2>
        <p><strong>Name:</strong> ${escapeHtml(productName)}</p>
        <p><strong>Brand:</strong> ${escapeHtml(brand)}</p>
        ${passport.productSummary ? `<p>${escapeHtml(passport.productSummary)}</p>` : ""}
      </article>

      <article class="card">
        <h2>Materials</h2>
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
      </article>

      <article class="card">
        <h2>Claims</h2>
        <ul class="detail-list">${
          claimSnippets.length > 0
            ? renderVisibleSnippets(claimSnippets, "Sustainability claim text not found")
            : claims.length > 0
            ? renderClaims(claims)
            : renderVisibleSnippets([], "Sustainability claim text not found")
        }</ul>
      </article>

      <article class="card">
        <h2>Care</h2>
        <ul class="detail-list">${renderVisibleSnippets(careSnippets, "Care information not found")}</ul>
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

      ${renderSnapshot(snapshot)}
    </div>
  `;

  reportContainer.classList.remove("hidden");
}

function getMockProductPassport() {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(mockProductPassportReport), 900);
  });
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

  statusBox.textContent = "Fetching visible product page information...";
  button.disabled = true;
  button.textContent = "Analysing...";

  try {
    const analysis = await analyzeProduct(productUrl);
    renderReport(analysis, productUrl);
    const status = analysis.metadata?.productPageSnapshot?.extractionStatus || "partial";
    statusBox.textContent = `Product page analysis complete (${status}).`;
  } catch (error) {
    const passport = await getMockProductPassport();
    renderReport(passport, productUrl);
    statusBox.textContent = `${error.message || "Unable to analyze the product URL."} Showing mock fallback report.`;
  } finally {
    button.disabled = false;
    button.textContent = "Analyse product";
  }
});
