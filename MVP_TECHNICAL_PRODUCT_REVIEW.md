# Product Passport Agent — technical and MVP product review

Review date: 19 June 2026  
Repository: `SaotoSoep/Digital-product-passport`  
Reviewed commit: `8b995cc` (`codex/clean-report-cards`)  
Review branch: `codex/mvp-technical-product-review`

## Review scope and verification

This review covers the consumer-facing MVP, the local Node/SQLite backend, the Netlify analysis function, the Render deep-reader worker, the report model, the browser UI, and the automated tests. It does not assess EU DPP compliance because the product is explicitly an independent consumer report, not an official Digital Product Passport or compliance product.

Verification performed:

- Read the application, analyzer, extraction, evidence, storage, deployment, worker, and UI code.
- Ran the root test suite: 33/33 tests passed.
- Ran the worker test command: it passed but discovered 0 tests.
- Ran `npm audit --omit=dev`: 0 known vulnerabilities.
- Ran a local end-to-end request against the included rich demo page with AI and deep reading disabled to inspect degradation behavior.

## A. Current state summary

The repository is a credible technical prototype with more extraction depth than a typical first MVP. It has a static browser UI, a Node service with SQLite passport lifecycle endpoints, a Netlify analysis-only function, a Playwright deep-reader worker on Render, generic HTML/JSON-LD extraction, OpenAI-based report synthesis, evidence normalization, and a substantial report UI.

The intended flow is: paste a clothing URL → basic fetch and deep read in parallel → normalize product-page evidence → ask the model to synthesize the consumer report → optionally collect public brand context → store a draft locally → render report, evidence, scores, and gaps. In Netlify production, `/api/passports` does not exist, so the UI silently falls back to `/api/analyze`; no draft is saved there.

The current report broadly covers the target structure:

| Target section | Current state |
| --- | --- |
| Product summary | Present |
| Material explained | Data and explanation exist; the main UI mostly shows composition, not the explanation |
| Sustainability claims found | Present |
| Evidence level per claim | Partially present; evidence wording, type, and confidence are not consistently separated |
| Production/origin transparency | Present, plus supplier transparency |
| Washing and care advice | Present |
| Transparency score | Present |
| Claim strength score | Present |
| Conclusion | Present |
| Sources/evidence used | Present but weakly traceable and often not linkable to an exact claim |
| Unknown/not publicly verifiable | Present in several overlapping forms |

Overall MVP assessment: suitable for controlled demos and product validation with known URLs, but not ready for an unrestricted public launch. The main blockers are trust semantics, inconsistent fallback output, a non-deterministic score model, unrestricted URL fetching and paid analysis, and production architecture mismatch.

## B. What works well

1. **Evidence-first data model.** `src/lib/product-passport/evidence.js` separates found, not found, unavailable, and fallback values. This is strongly aligned with the product principles.
2. **Blocked-page semantics are explicitly considered.** The analyzer distinguishes access denied, bot protection, timeout, unsupported rendering, and missing evidence. It correctly says that unreadable content is unavailable rather than proven absent.
3. **Useful extraction coverage.** Static HTML, meta tags, JSON-LD, embedded commerce payloads, tabs, accordions, structured data, and selected network responses are all covered.
4. **Good baseline report coverage.** The two permitted scores, claim rows, origin, care, conclusion, sources, and unknowns are represented without an absolute sustainability score.
5. **Cautious prompt language.** The model prompt prohibits invention and instructs the model to distinguish brand claims, public evidence, and unknowns.
6. **Fallback storage design.** The local passport lifecycle and event log are small and understandable. SQLite is appropriate for local MVP validation.
7. **Solid root tests.** The 33 passing tests cover API lifecycle, snapshots, evidence normalization, blocked pages, worker fallback, and specific extraction regressions.
8. **Safe UI rendering.** Dynamic report content is escaped before HTML insertion, which materially lowers cross-site scripting risk.

## C. MVP gaps

### 1. Report truth model is not canonical

The report has overlapping representations: AI report fields, normalized snapshot fields, fallback fields, readiness fields, unknowns, access diagnostics, brand context, and deep-read metadata. The UI decides which representation wins. This can produce contradictory statements and makes the API difficult to consume reliably.

Observed in the smoke test: the snapshot found material, care, origin, certification, and a sustainability claim, while the AI-failure report said material was not publicly listed and those areas were not assessed. The UI can therefore show both “found” and “not assessed” in one report.

### 2. Evidence and claim truth are conflated

“High confidence” can mean that text was extracted reliably, not that the brand claim is true. A certification mention is marked as found, but no certificate scope, identifier, issuer, validity, or product match is verified. The consumer needs distinct concepts:

- claim source: brand/product page/independent source;
- evidence availability: present/missing/unavailable;
- verification status: verified/partially supported/unverified;
- extraction confidence: High/Medium/Low.

### 3. Scores do not yet have a stable rubric

The production scores are generated by the language model. The prompt gives broad principles but no deterministic weights, caps, or evidence prerequisites. Identical evidence may score differently between runs. Failure reports still return `0/100`, and blocked reports return `10/100`; these look like negative judgments when the honest state is “not calculable.”

### 4. Blocked-page handling is directionally right but over-broad

`applyDeepReadAvailability` converts every basic-extraction `not_found` field to `unavailable` whenever deep reading fails, even when the static page was fetched successfully. A deep-reader failure should affect only content that plausibly required the deep reader, not erase the meaning of a successful basic check.

### 5. The target report is not the dominant UX

The first screen emphasizes “passport readiness,” 12 evidence fields, deep-reader internals, and structural DPP gaps. This is useful to builders but heavy for a consumer validating a clothing purchase. “Useful passport starting point” and “Missing DPP Information” also edge toward official-DPP language. The UI does not prominently state that the result is independent, unofficial, and not a compliance assessment.

### 6. Sources are not claim-level citations

Sources often contain a URL, title, meta description, or generic extraction label. The Gaps tab renders source text but not consistently a clickable URL or exact excerpt. A user cannot easily answer: “Which sentence supports this claim, from which page, captured when?”

### 7. Material explanation is underused

The analyzer generates plain-language material explanations, but the overview primarily renders the composition value. This leaves the target “Material explained” section only partially delivered.

### 8. Production does not save passports

The local Node server supports `/api/passports`; Netlify only deploys `/api/analyze`. The UI catches 404/405 and switches to analysis-only mode. This is graceful technically, but “Save draft passport” is still part of the progress flow and the documented architecture can be misunderstood as production behavior.

## D. Technical risks

### Critical/high

1. **Server-side request forgery in the public analysis path.** `analyzeProductUrl` accepts any HTTP(S) URL and `fetchHtml` fetches it directly. Unlike the worker, the Netlify/local analyzer does not reject localhost, private IP ranges, link-local addresses, DNS rebinding, or unsafe redirects. Brand-context links can add further fetches derived from the submitted page.
2. **Unbounded paid endpoint exposure.** `/api/analyze` has no rate limit, request identity, quota, cache, or concurrency guard. One request may invoke Playwright, multiple brand-page fetches, and an OpenAI call. This is a cost and denial-of-service risk.
3. **Prompt injection from retailer content.** Arbitrary page text is passed to the model. The system prompt is cautious, but there is no structured-output enforcement, evidence-ID binding, or post-validation that every generated fact exists in extracted evidence.

### Medium

4. **Two deployment architectures drift.** Local Node/SQLite and Netlify Functions expose different APIs and persistence behavior. The UI contains fallback logic instead of one explicit production contract.
5. **Model output parsing is fragile.** The implementation uses chat completions plus manual JSON parsing and normalization rather than a strict JSON schema. Malformed output becomes a broad AI-failure report.
6. **Analyzer concentration.** `src/analyzer.js` combines network access, extraction orchestration, brand discovery, AI prompting, score handling, fallback reports, and presentation mapping. It is difficult to reason about and risky to change.
7. **Mutable evidence objects.** `applyDeepReadAvailability` mutates normalized field objects in place. This makes provenance transformations harder to test and can create surprising reuse behavior.
8. **Storage lifecycle lacks public-boundary protection.** Local publish/update/list endpoints have no authentication or authorization. That is acceptable only while they remain strictly local; they must not be exposed as-is.
9. **Worker protection is weak.** The Render worker is publicly callable. Its in-memory rate limit is instance-local and trusts the first `x-forwarded-for` value. There is no caller authentication or shared quota.
10. **No cancellation after logical timeout.** Promise timeouts return fallback values but do not always stop the underlying browser or fetch work, which can continue consuming resources.
11. **No worker tests.** The worker package test command discovers zero tests. URL validation, redirect behavior, rate limiting, evidence size, and browser cleanup need dedicated coverage.
12. **Runtime portability.** Local persistence requires Node 24's `node:sqlite`, while deployment uses a different analysis-only runtime. This is documented but increases environment drift.

## E. Product and UX risks

1. **False precision.** Numeric scores imply a calibrated assessment even when they are model-generated or the page was unreadable.
2. **Confidence ambiguity.** “High” can be read as high confidence that a sustainability claim is true, while the code may only mean high confidence that wording was present.
3. **Unofficial status is not prominent.** The README is clear, but the consumer UI should repeat that this is an independent report and not an official EU DPP or compliance verdict.
4. **Information overload.** Deep-reader counts, DPP readiness, structural gaps, evidence checklist, five tabs, and brand context compete with the purchase-oriented answer.
5. **No explicit “analysis unavailable” score state.** Showing 0 or 10 penalizes products for technical access failure and invites unfair comparison.
6. **Brand context can look like product evidence.** General brand pages are useful context, but they are not product-level proof. The current separation is textual rather than structural throughout the report.
7. **No exact claim citation.** Users cannot quickly inspect the original wording and source scope behind each claim.
8. **No feedback capture.** The MVP cannot measure whether the report was useful, understandable, or wrong—the key learning loop for validation.
9. **Accessibility is incomplete.** Tabs expose tab roles and selection state, but lack full keyboard tab behavior and explicit tabpanel relationships.

## F. Top 5 recommended next steps

1. **Define one canonical evidence-backed report contract.** Make normalized evidence the source of truth; treat AI output as bounded interpretation. Eliminate contradictory fallback fields.
2. **Fix uncertainty and scoring semantics.** Use High/Medium/Low only with a named dimension, introduce “Not available” scores, and implement deterministic score rubrics.
3. **Harden the public ingestion boundary.** Add shared public-URL validation, redirect revalidation, response limits, rate/concurrency limits, and safe timeouts before wider testing.
4. **Choose one MVP deployment contract.** Either deploy only analysis and remove “saved draft” language, or add a deliberately scoped persistent API. Do not silently present two products.
5. **Run a small validation corpus.** Create a fixed set of readable, blocked, sparse, multilingual, and misleading product pages; assert expected evidence states and conduct consumer usability sessions.

## G. Recommended next 5 features

The following features are ordered for MVP learning and trust, not platform breadth.

1. Canonical evidence ledger and claim citations.
2. Deterministic transparency and claim-strength rubric.
3. Blocked-page guided fallback.
4. Consumer-first report mode with trust disclaimer.
5. Lightweight report feedback and quality telemetry.

## H. Feature implementation briefs

### Feature 1 — Canonical evidence ledger and claim citations

**Goal**  
Give every displayed fact and claim one traceable source while cleanly separating brand wording, public page evidence, external evidence, missing information, and interpretation.

**Scope**

- Introduce stable evidence IDs and a canonical evidence record with source URL, excerpt, capture method, timestamp, and extraction confidence.
- Make report claims reference evidence IDs.
- Show the original claim wording, source type, verification status, confidence dimension, and clickable source.
- Preserve “not found” versus “unavailable.”

**Acceptance criteria**

- Every material, origin, care, certification, and sustainability claim displayed in the report references at least one evidence ID or is explicitly marked interpretation/unknown.
- A brand statement can never be labeled independently verified without a separate qualifying source.
- Claim citations open the exact source URL and show a concise excerpt.
- AI-generated facts absent from the evidence ledger are rejected or downgraded to interpretation.
- Existing fixtures produce no contradictory found/not-assessed states.

**Allowed files**

- `src/lib/product-passport/evidence.js`
- New files under `src/lib/product-passport/`
- `src/analyzer.js` or a small extracted report-mapper module
- `public/app.js`, `public/styles.css`
- Relevant tests and fixtures

**Not allowed changes**

- No authentication, billing, production secrets, database migration, deployment, or broad web search.
- Do not add a compliance verdict or absolute sustainability score.

**Test/build expectations**

- Unit tests for evidence IDs, provenance types, citation validation, missing/unavailable states, and rejected unsupported facts.
- Regression tests for AI failure with successful extraction.
- `npm test` passes; manual demo-page rendering verifies clickable citations and escaping.

### Feature 2 — Deterministic score rubric

**Goal**  
Make Transparency and Claim strength reproducible, explainable, and unavailable when evidence is insufficient.

**Scope**

- Calculate both scores in application code from canonical evidence, not in the model.
- Document weighted inputs, caps, prerequisites, and deductions.
- Return `status: "scored" | "not_available"` with factor-level reasoning.
- Keep the scores strictly about disclosure and evidence strength.

**Acceptance criteria**

- The same evidence always produces the same score.
- A blocked/unreadable page returns “Not available,” never 0 or 10 as a proxy score.
- Brand wording without independent/product-specific support cannot receive a high Claim strength score.
- The UI explains the top positive and missing factors.
- No label describes the product itself as sustainable or unsustainable.

**Allowed files**

- New scorer under `src/lib/product-passport/`
- `src/analyzer.js` report mapping
- `public/app.js`, `public/styles.css`
- README rubric documentation
- Tests and fixtures

**Not allowed changes**

- No model fine-tuning, external scoring service, impact/LCA score, or regulatory compliance score.
- No change to secrets or production configuration.

**Test/build expectations**

- Table-driven tests for rich, sparse, claim-only, independently supported, blocked, and contradictory evidence.
- Boundary tests enforce score range and “not available” behavior.
- `npm test` passes.

### Feature 3 — Blocked-page guided fallback

**Goal**  
Turn retailer blocking into an honest, useful recovery path without pretending that unavailable information is absent.

**Scope**

- Correct the merge rule between basic extraction and deep-read availability.
- Present a dedicated blocked-page state with reason and retry guidance.
- Let a user paste visible product text or select a saved HTML file for one-off analysis, clearly labeled user-provided evidence.
- Do not bypass retailer protections.

**Acceptance criteria**

- Successful basic extraction remains authoritative when deep reading fails.
- Only fields dependent on inaccessible content become unavailable.
- User-provided text is stored/labeled separately and never presented as independently fetched evidence.
- Scores remain unavailable until minimum evidence requirements are met.
- Retrying cannot create duplicate saved drafts without an explicit choice.

**Allowed files**

- `src/analyzer.js`
- `src/lib/product-page/`
- `src/lib/product-passport/evidence.js`
- `public/index.html`, `public/app.js`, `public/styles.css`
- API validation and relevant tests/fixtures

**Not allowed changes**

- No CAPTCHA circumvention, proxy rotation, login automation, browser extension, retailer account use, or scraping evasion.
- No production deploy/configuration changes.

**Test/build expectations**

- Tests for static-success/deep-failure, both-failure, timeout, access denied, and user-provided evidence.
- Worker package gains real tests for public URL validation and failure mapping.
- `npm test` passes and worker tests discover at least one test.

### Feature 4 — Consumer-first report mode and trust disclaimer

**Goal**  
Make the first view answer “what is known, what is claimed, and what is unknown?” without implying official DPP or compliance status.

**Scope**

- Reorder the first view to the target report structure.
- Surface material explanations, claim evidence, origin, care, scores, conclusion, sources, and unknowns.
- Move deep-reader diagnostics and passport-readiness internals into a secondary technical details area.
- Add a persistent concise disclaimer.

**Acceptance criteria**

- Above the fold states: independent report, not an official EU DPP, not a compliance assessment.
- All target sections are present and use consistent headings.
- “Sustainable” is never used as a product verdict.
- Missing and unavailable information are visually distinct.
- Keyboard users can operate all tabs/details; tab/tabpanel ARIA relationships are complete.

**Allowed files**

- `public/index.html`, `public/app.js`, `public/styles.css`
- README wording
- Frontend-focused tests

**Not allowed changes**

- No new backend platform, design system dependency, authentication, payments, or publishing workflow.
- Do not remove access to raw evidence; move it to technical details.

**Test/build expectations**

- Static assertions for disclaimer and target headings.
- Browser smoke test on rich, sparse, and blocked fixtures at mobile and desktop widths.
- Accessibility check for focus order, keyboard operation, names, and contrast.
- `npm test` passes.

### Feature 5 — Report feedback and quality telemetry

**Goal**  
Measure whether the MVP is useful and identify extraction/report failures without collecting unnecessary personal data.

**Scope**

- Add “Useful / Not useful” and reason choices such as wrong product, missing evidence, confusing wording, blocked page, and other.
- Record technical outcome fields: retailer domain, extraction state, analysis state, latency bucket, evidence coverage, and model/schema version.
- Keep free text optional and clearly disclosed.
- Start with local or explicitly chosen MVP storage; no analytics platform is required.

**Acceptance criteria**

- Feedback is optional and report generation works without it.
- No full URL query string, page body, evidence excerpt, IP address, or personal identifier is stored in telemetry by default.
- Duplicate submissions from one report are prevented or intentionally versioned.
- A simple aggregate can answer success rate, blocked rate, usefulness rate, and top failure reason by retailer domain.
- The UI confirms submission and supports retry on failure.

**Allowed files**

- New minimal feedback module under `src/`
- Local API/service/storage files and a narrowly scoped migration if local persistence is selected
- `public/index.html`, `public/app.js`, `public/styles.css`
- Tests and README

**Not allowed changes**

- No third-party analytics SDK, cookies, fingerprinting, authentication, billing, secret changes, or production deployment.
- No collection of raw retailer page content for analytics.

**Test/build expectations**

- API tests for validation, duplicate behavior, and storage.
- Privacy tests/assertions for excluded fields.
- UI smoke test for submit/success/failure states.
- `npm test` passes.

## I. Branch and change scope

This review is isolated on `codex/mvp-technical-product-review`. The only intended repository change is this review document. No product code, secrets, authentication, billing, production configuration, deployment, merge, commit, push, or pull request is included in this review task.

## Recommended MVP release gate

Before an unrestricted public MVP, require all of the following:

- no contradictory report/evidence states in the validation corpus;
- deterministic or unavailable scores;
- SSRF-safe URL handling and bounded redirects/responses;
- rate/concurrency protection for analysis and worker calls;
- a single documented production API contract;
- at least one worker test suite covering URL safety and cleanup;
- prominent independent/unofficial/non-compliance wording;
- claim-level source traceability;
- monitored success, blocked, timeout, and AI-failure rates.

Until then, use the product as a controlled validation prototype with known test URLs and explicit operator oversight.
