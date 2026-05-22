const form = document.getElementById("analysis-form");
const input = document.getElementById("product-url");
const button = document.getElementById("submit-button");
const statusBox = document.getElementById("status");
const reportContainer = document.getElementById("report");

const mockProductPassport = {
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
        <li class="detail-item">
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

function renderMissingInformation(items) {
  return items
    .map(
      (item) => `
        <li class="detail-item">
          <p><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</p>
        </li>
      `
    )
    .join("");
}

function renderReport(passport, submittedUrl) {
  reportContainer.innerHTML = `
    <div class="report-header">
      <div>
        <p class="eyebrow">Mock report</p>
        <h2 class="report-title">Product Passport-light</h2>
      </div>
      <div class="report-meta">
        <div><strong>Input URL:</strong> ${escapeHtml(submittedUrl)}</div>
        <div><strong>Overall confidence:</strong> ${escapeHtml(passport.confidenceScore)}</div>
      </div>
    </div>

    <div class="grid">
      <article class="card">
        <h2>Product</h2>
        <p><strong>Name:</strong> ${escapeHtml(passport.productName)}</p>
        <p><strong>Brand:</strong> ${escapeHtml(passport.brand)}</p>
      </article>

      <article class="card">
        <h2>Materials</h2>
        <ul class="detail-list">${renderMaterials(passport.materials)}</ul>
      </article>

      <article class="card">
        <h2>Claims</h2>
        <ul class="detail-list">${renderClaims(passport.claims)}</ul>
      </article>

      <article class="card">
        <h2>Missing information</h2>
        <ul class="detail-list">${renderMissingInformation(passport.missingInformation)}</ul>
      </article>
    </div>
  `;

  reportContainer.classList.remove("hidden");
}

function getMockProductPassport() {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(mockProductPassport), 900);
  });
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

  statusBox.textContent = "Loading mock Product Passport-light data...";
  button.disabled = true;
  button.textContent = "Analysing...";

  try {
    const passport = await getMockProductPassport();
    renderReport(passport, productUrl);
    statusBox.textContent = "Mock passport ready for review.";
  } catch (error) {
    statusBox.textContent = error.message || "Unable to render the mock passport.";
  } finally {
    button.disabled = false;
    button.textContent = "Analyse product";
  }
});
