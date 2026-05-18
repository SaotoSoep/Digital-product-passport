const form = document.getElementById("analysis-form");
const input = document.getElementById("product-url");
const button = document.getElementById("submit-button");
const statusBox = document.getElementById("status");
const reportContainer = document.getElementById("report");

function badgeClass(confidence) {
  return `badge ${String(confidence || "").toLowerCase()}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderClaims(claims) {
  return claims
    .map(
      (claim) => `
        <li class="claim-item">
          <div class="claim-topline">
            <span>${escapeHtml(claim.claim)}</span>
            <span class="${badgeClass(claim.confidence)}">${escapeHtml(claim.confidence)}</span>
          </div>
          <p><strong>Brand claim:</strong> ${escapeHtml(claim.brandClaim)}</p>
          <p><strong>Public evidence:</strong> ${escapeHtml(claim.publicEvidence)}</p>
          <p class="muted"><strong>Evidence level:</strong> ${escapeHtml(claim.evidenceLevel)}</p>
        </li>
      `
    )
    .join("");
}

function renderSources(sources) {
  return sources
    .map(
      (source) => `
        <li>
          <strong>${escapeHtml(source.type)}:</strong> ${escapeHtml(source.label)}
        </li>
      `
    )
    .join("");
}

function renderUnknowns(unknowns) {
  return unknowns.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderReport(data) {
  const { metadata, report } = data;

  reportContainer.innerHTML = `
    <div class="report-header">
      <div>
        <p class="eyebrow">Structured report</p>
        <h2 class="report-title">Product Passport Report</h2>
      </div>
      <div class="report-meta">
        <div><strong>Retailer:</strong> ${escapeHtml(metadata.retailer)}</div>
        <div><strong>Mode:</strong> ${escapeHtml(metadata.analysisMode)}</div>
      </div>
    </div>

    <div class="grid">
      <article class="card">
        <h2>1. Product summary</h2>
        <p>${escapeHtml(report.productSummary)}</p>
      </article>

      <article class="card">
        <h2>2. Material explained</h2>
        <p><strong>Detected material:</strong> ${escapeHtml(report.materialExplained.rawMaterial)}</p>
        <p>${escapeHtml(report.materialExplained.simpleExplanation)}</p>
        <p class="muted">Confidence: ${escapeHtml(report.materialExplained.confidence)}</p>
      </article>

      <article class="card">
        <h2>3. Sustainability claims found</h2>
        <ul class="claim-list">${renderClaims(report.sustainabilityClaimsFound)}</ul>
      </article>

      <article class="card">
        <h2>4. Production / origin transparency</h2>
        <p><strong>Status:</strong> ${escapeHtml(report.productionOriginTransparency.status)}</p>
        <p>${escapeHtml(report.productionOriginTransparency.detail)}</p>
        <p class="muted">Confidence: ${escapeHtml(report.productionOriginTransparency.confidence)}</p>
      </article>

      <article class="card">
        <h2>5. Washing and care advice</h2>
        <p>${escapeHtml(report.washingCareAdvice.summary)}</p>
        <p class="muted">Confidence: ${escapeHtml(report.washingCareAdvice.confidence)}</p>
      </article>

      <article class="card">
        <h2>6. Transparency score</h2>
        <p class="score">${escapeHtml(report.transparencyScore.score)}</p>
        <p>${escapeHtml(report.transparencyScore.rationale)}</p>
      </article>

      <article class="card">
        <h2>7. Claim strength score</h2>
        <p class="score">${escapeHtml(report.claimStrengthScore.score)}</p>
        <p>${escapeHtml(report.claimStrengthScore.rationale)}</p>
      </article>

      <article class="card">
        <h2>8. Conclusion</h2>
        <p>${escapeHtml(report.conclusion)}</p>
      </article>

      <article class="card">
        <h2>9. Sources / evidence used</h2>
        <ul class="source-list">${renderSources(report.sources)}</ul>
      </article>

      <article class="card">
        <h2>10. What is unknown or not publicly verifiable</h2>
        <ul class="unknown-list">${renderUnknowns(report.unknowns)}</ul>
      </article>
    </div>
  `;

  reportContainer.classList.remove("hidden");
}

async function submitAnalysis(productUrl) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ productUrl }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Analysis failed");
  }

  return data;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const productUrl = input.value.trim();
  statusBox.textContent = "Analysing public signals and brand claims...";
  button.disabled = true;
  reportContainer.classList.add("hidden");

  try {
    const data = await submitAnalysis(productUrl);
    renderReport(data);
    statusBox.textContent = "Report ready.";
  } catch (error) {
    statusBox.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
