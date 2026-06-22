# Product Passport Agent — technical and MVP product review after Features 1–5

Review date: 22 June 2026  
Repository: `SaotoSoep/Digital-product-passport`  
Reviewed branch: `main`  
Reviewed commit: `72afb04e0d11313c559f000eb0ce5ba6a81e9c04`  
Review branch: `codex/mvp-review-after-features-1-5`

## Review method

The review covered the current browser flow, local Node/SQLite API, Netlify function, Render/Playwright worker, extraction and evidence pipeline, deterministic scoring, blocked-page recovery, report output, deployment files, and automated tests.

Verification performed:

- Read all changed application areas introduced since the previous review.
- Compared `main` with the pre-feature baseline.
- Ran the root suite: 62/62 tests passed.
- Ran the worker suite: 3/3 tests passed.
- Ran `npm audit --omit=dev`: no known vulnerabilities.
- Ran an end-to-end local analysis of the rich demo page with OpenAI and deep reading disabled to exercise degradation behavior.
- Searched for Feature 5 feedback/telemetry behavior; no implementation was found.

## A. Current state summary

The MVP has materially improved since the first review. It now has a canonical evidence ledger with stable evidence IDs, claim citations, source and verification types, deterministic Transparency and Claim strength scores, explicit `not_available` score states, better blocked-page semantics, user-provided fallback evidence, a consumer-first report, an always-visible unofficial/non-compliance disclaimer, duplicate-draft choices, accessible report tabs, and real worker tests.

The primary flow is now:

1. User submits a clothing product URL.
2. Basic HTTP extraction and deep browser reading run in parallel.
3. Product data is normalized into checked evidence fields.
4. A canonical evidence ledger assigns evidence IDs, provenance, excerpts, verification status, capture method, timestamp, and extraction confidence.
5. AI interpretation is aligned back to canonical evidence.
6. Scores are calculated deterministically from normalized fields.
7. The consumer report presents facts, claims, origin, care, scores, conclusion, sources, and unknowns.
8. Technical extraction and readiness detail remains available in a secondary tab.
9. If the retailer page is blocked, the user can retry or submit visible text/saved HTML as explicitly user-provided evidence.

Local Node creates SQLite draft reports. Netlify still only exposes `/api/analyze`; the UI detects the missing passport API and switches to analysis-only behavior.

### Target report coverage

| Target section | Current state |
| --- | --- |
| Product summary | Present, but AI-failure wording can contradict extracted facts |
| Material explained | Present; degradation explanation is provenance-oriented rather than consumer-oriented |
| Sustainability claims found | Present and separated as claims |
| Evidence level per claim | Present through source type, verification status, confidence, and citations |
| Production/origin transparency | Present with citations and missing/unavailable states |
| Washing and care advice | Present with citations |
| Transparency score | Deterministic and supports Not available |
| Claim strength score | Deterministic, but certification evidence is currently over-credited |
| Conclusion | Consumer-generated from canonical states; legacy API conclusion may still contradict evidence |
| Sources/evidence used | Present, with claim/field-level citations and a source list |
| Unknown/not publicly verifiable | Present with separate missing, unavailable, and unverified groups |

Overall assessment: the application is now a strong controlled MVP and is substantially closer to a trustworthy consumer report. It is still not ready for an unrestricted public launch because the public URL/cost boundary is unsafe, the Claim strength rubric misclassifies brand-hosted certification wording as independent support, failure output remains internally inconsistent, production and local API behavior differ, and the validation feedback loop is absent.

## B. What works well

1. **Canonical evidence is now the strongest part of the architecture.** Stable evidence IDs and field-level records make the report inspectable and testable.
2. **Brand claims are structurally separated.** Sustainability, certification, and durability wording from the product page is labeled `brand_statement` / `brand_statement_only`, rather than presented as independent truth.
3. **Unsupported AI facts are downgraded.** Citation validation refuses unknown evidence IDs and prevents brand wording alone from becoming independently verified.
4. **Scores are deterministic.** Scoring moved out of the model into a documented rubric with factors, caps, deductions, and missing-factor explanations.
5. **Unavailable scores are honest.** Failed or insufficient extraction can return `score: null` and `status: not_available` instead of a proxy 0 or 10.
6. **Blocked pages are handled more usefully.** Basic evidence remains authoritative, only deep-read-dependent missing fields become unavailable, and the recovery flow avoids CAPTCHA or access-control circumvention.
7. **User-provided evidence is clearly labeled.** It is kept separate, used only for one-off analysis, and is not presented as independently fetched or verified.
8. **The consumer report now matches the requested structure.** The main view prioritizes understandable product information; technical diagnostics moved to a secondary tab.
9. **Trust wording is prominent.** The UI persistently states that the report is independent, not an official EU DPP, and not a compliance assessment.
10. **Accessibility improved.** Tabs have tabpanel relationships, roving tabindex, arrow/Home/End navigation, and focus styling.
11. **Duplicate handling improved.** Users must explicitly choose whether to open an existing draft, analyze without saving, or save another draft.
12. **Tests improved significantly.** The root suite increased to 62 tests and the worker now has 3 real URL/failure-contract tests.

## C. MVP gaps

### 1. Claim strength still overstates independent evidence

The scorer treats the presence of a certification field plus a product identifier as full “independent product-linked support.” It does not inspect the canonical evidence record's source type or verify certificate issuer, certificate ID, scope, validity, or product match. A certification sentence copied from a retailer page is still a brand statement, not independent verification.

This is the largest remaining product-principle gap. The evidence ledger models the distinction correctly, but the scorer ignores it.

### 2. Failure reports remain internally inconsistent

The smoke test with a readable demo page and unavailable OpenAI produced:

- correctly extracted material, care, origin, claim, certification, and durability evidence;
- a deterministic Transparency score of 82 and Claim strength score of 60;
- but `productSummary` said the full analysis could not be completed;
- and the stored API `conclusion` said no product-level transparency assessment could be made.

The consumer UI creates a safer conclusion from canonical states, but the API payload and technical view remain contradictory. The report contract itself must be coherent, not only the preferred renderer.

### 3. Confidence wording is still ambiguous

Canonical basic extraction records use `extractionConfidence: medium`, while aligned material, care, and origin report blocks are set to `confidence: High` merely because a value was found. The claim UI shows a bare Medium/High badge without naming the confidence dimension. Consumers may read this as confidence in truth rather than extraction confidence.

### 4. Material explanation degrades poorly without AI

When AI interpretation fails, “Direct material wording captured in the canonical evidence ledger” is shown as the simple explanation. This describes provenance, not what organic cotton, polyester, wool, viscose, or blends mean for the consumer.

### 5. Feature 5 feedback/quality telemetry is absent

No Useful/Not useful flow, reason capture, privacy-safe outcome telemetry, latency tracking, or aggregate validation metrics exist on `main`. The user described Features 1–5 as complete, but the repository contains Features 1–4 plus parts of duplicate handling; the originally specified feedback feature is not implemented.

### 6. Production still has two product contracts

Local Node saves drafts and supports lifecycle endpoints. Netlify only analyzes and cannot save. The UI handles this gracefully, but the progress list still includes “Save report draft” before it knows whether storage is available. Product behavior and README language therefore remain environment-dependent.

### 7. Sources are improved but still uneven

Field and claim citations are strong. The general source list still includes titles and meta descriptions as source rows, which are not independently useful sources and are sometimes not clickable. Exact citation records are not the single source-list representation.

### 8. No external verification exists yet

The architecture has an `external_evidence` concept, but the MVP does not validate certification registries, product certificate documents, factory records, or independent sources. This is acceptable for a focused MVP only if the score and wording never imply that product-page certification text is independent.

## D. Technical risks

### Critical/high

1. **SSRF remains in the main analysis endpoint.** `analyzeProductUrl` checks only HTTP(S), and `fetchHtml` directly follows redirects. It does not block localhost, private/link-local ranges, unsafe redirects, or DNS rebinding. The worker validates only the initial URL; Playwright redirects are not revalidated.
2. **Public cost and denial-of-service exposure remains.** `/api/analyze` has no rate limit, shared quota, concurrency cap, cache, or request identity. One request can trigger HTTP fetches, Playwright work, brand-page fetches, and an OpenAI call.
3. **The worker remains publicly callable.** Its in-memory IP limit is per process and trusts the first `x-forwarded-for` value. It has no caller authentication or shared quota.
4. **Claim scoring uses field presence instead of evidence provenance.** This can turn unverified retailer certification wording into a high evidence-strength result.

### Medium

5. **Prompt injection remains possible.** Arbitrary retailer or user-provided text is sent to the model. Canonical alignment limits some damage, but summary and interpretation fields are not fully bound to evidence IDs. Strict structured output is not enforced.
6. **Large orchestrator files remain a maintainability risk.** `src/analyzer.js` is 2,506 lines and `public/app.js` is 2,076 lines. Both mix many responsibilities and are difficult to change safely.
7. **Mutable evidence transformations continue.** User evidence merging, deep-read status application, and ledger enrichment mutate shared field structures, increasing ordering sensitivity.
8. **Timeout fallback does not guarantee cancellation.** `Promise.race` can return while the underlying browser work continues unless the reader closes itself promptly.
9. **Production/local drift remains.** Node 24 SQLite, Netlify analysis-only functions, and a separate Render worker create three operational environments with different behavior.
10. **Local lifecycle endpoints are unauthenticated.** Acceptable only while local. They must not be exposed publicly as-is.
11. **Duplicate detection is limited.** It searches only the latest 100 drafts and compares normalized URLs including tracking/query differences, so semantically identical product URLs can bypass detection.
12. **Test depth is still uneven.** UI tests are primarily source-code assertions rather than browser behavior tests. Worker tests do not cover redirects, DNS rebinding, rate limiting, timeout cleanup, or response limits.
13. **No CI/deployment evidence was reviewed.** Local tests pass, but there is no demonstrated production smoke test, health check for the full analysis path, or deployment rollback gate in this review.

## E. Product and UX risks

1. **A score can appear more verified than the evidence.** Claim strength up to 95 is theoretically possible from product-page certification wording plus an identifier, even without independent validation.
2. **Confidence badges lack a named dimension.** “Medium” can mean extraction quality, claim support, or truth confidence depending on context.
3. **API and UI can disagree.** The consumer conclusion is recomputed safely, while the underlying API conclusion can remain pessimistic or contradictory.
4. **User-provided evidence can influence scores.** The rationale discloses this, but a numeric score based partly on pasted text may still feel more authoritative than warranted.
5. **Blocked-page recovery is cognitively heavy.** Pasting visible text or saving HTML is useful for expert validation but may be too demanding for mainstream consumers.
6. **The technical tab still uses passport-readiness terminology.** It includes “usable for the passport” and structural DPP gaps; despite caveats, this may imply official readiness.
7. **The report is English-only.** This may limit validation with Dutch consumers and makes confidence/verification terminology harder to understand.
8. **No feedback loop exists.** The MVP cannot quantify usefulness, confusion, wrong-product extraction, or retailer-specific failure rates.
9. **Long report length may dilute the decision.** Even after consumer-first restructuring, many sections, citations, scores, side cards, unknown groups, and technical details compete for attention.

## F. Top 5 recommended next steps

1. **Correct the evidence-strength trust model.** Require actual external evidence records for independent-support points; product-page certification wording must remain brand-provided evidence.
2. **Make the API report internally coherent.** Derive summary, conclusion, unknowns, confidence labels, and scores from the same canonical state in every success/failure mode.
3. **Harden the public ingestion boundary.** Add reusable public-URL validation, redirect revalidation, response-size limits, rate/concurrency limits, and safe cancellation before public testing.
4. **Choose and document one production contract.** Either make production explicitly analysis-only or add intentionally scoped persistence; align progress and status copy with the detected capability.
5. **Implement the missing validation loop.** Add privacy-safe usefulness feedback and outcome telemetry, then evaluate a fixed retailer corpus and real consumer sessions.

## G. Recommended next 5 features

1. Evidence provenance-aware claim verifier.
2. Canonical report consistency validator.
3. Safe analysis gateway and cost controls.
4. Privacy-safe MVP feedback and quality telemetry.
5. Retailer coverage benchmark and extraction quality dashboard.

## H. Feature implementation briefs

### Feature 1 — Evidence provenance-aware claim verifier

**Goal**  
Ensure Claim strength reflects actual evidence provenance and never treats a retailer or brand certification mention as independent verification.

**Scope**

- Score claim support from canonical evidence records, not field presence alone.
- Separate certification mention, certificate detail, product linkage, and independently fetched/validated evidence.
- Require an `external_evidence` record for independent-support points.
- Name the confidence dimension explicitly: extraction confidence versus verification strength.

**Acceptance criteria**

- Product-page certification wording without external evidence receives zero independent-support points.
- Product identifier plus brand-hosted certification wording remains capped as unverified/brand-provided support.
- Only separate qualifying evidence can produce `independently_verified`.
- Every scored factor lists the evidence IDs used.
- UI labels say “Extraction confidence” or “Verification strength,” never an unlabeled confidence badge.

**Allowed files**

- `src/lib/product-passport/scorer.js`
- `src/lib/product-passport/evidence.js`
- A new small claim-verification module under `src/lib/product-passport/`
- `src/analyzer.js` report mapping
- `public/app.js`, `public/styles.css`
- Relevant tests and fixtures

**Not allowed changes**

- No broad web crawler, compliance verdict, official certification status, secrets, authentication, billing, or production configuration.
- Do not label a product sustainable or unsustainable.

**Test/build expectations**

- Table-driven tests for brand mention only, brand mention plus SKU, external evidence without product linkage, and qualifying external product-linked evidence.
- Regression test proves the current demo certification cannot receive full independent-support points.
- `npm test` and worker tests pass.

### Feature 2 — Canonical report consistency validator

**Goal**  
Guarantee that summary, material, claims, origin, care, scores, conclusion, sources, and unknowns cannot contradict the canonical evidence state.

**Scope**

- Introduce one final report assembly/validation step after extraction and optional AI interpretation.
- Rebuild failure-mode summary and conclusion from canonical evidence.
- Reject or downgrade unsupported output.
- Use one confidence mapping derived from evidence records.
- Return explicit analysis status separately from evidence availability.

**Acceptance criteria**

- If material/care/origin is found, unknowns and conclusion cannot state that it was not assessed.
- AI failure does not erase usable deterministic report sections.
- `error`/analysis status is separate from product evidence status.
- API and consumer UI use the same final conclusion.
- Every target report field passes a consistency assertion before response.

**Allowed files**

- New report assembler/validator under `src/lib/product-passport/`
- Focused extraction from `src/analyzer.js`
- `public/app.js` only where the API contract changes
- Tests and fixtures

**Not allowed changes**

- No model upgrade, new provider, persistence redesign, authentication, billing, deployment, or production config changes.
- Do not hide technical errors; expose them separately from report facts.

**Test/build expectations**

- Snapshot tests for full success, AI failure, blocked basic failure, deep-read failure with successful basic extraction, sparse page, and user-provided evidence.
- Contract tests assert no found/not-assessed contradictions.
- `npm test` passes.

### Feature 3 — Safe analysis gateway and cost controls

**Goal**  
Make public URL analysis safe and bounded enough for limited external MVP validation.

**Scope**

- Share public-URL validation between the main analyzer and worker.
- Validate every redirect target and resolved address.
- Block localhost, private, link-local, reserved, and unsafe IPv4/IPv6 ranges.
- Add response/body limits, concurrency limits, short-lived caching, and rate limiting.
- Ensure timeout paths abort fetch/browser work.

**Acceptance criteria**

- Main analysis rejects private/internal URLs before any fetch.
- Redirects from public to private targets are rejected.
- DNS rebinding checks occur at connection/redirect boundaries as feasible in the chosen runtime.
- Requests above configured body, response, concurrency, or rate limits fail with stable non-sensitive errors.
- Repeated identical URL analysis can reuse a short-lived safe result without duplicate model/browser cost.

**Allowed files**

- New URL/network safety modules under `src/lib/`
- `src/analyzer.js`
- `server.js`
- `netlify/functions/analyze.js`
- `deep-reader-worker/server.js` and worker reader code
- Tests and README

**Not allowed changes**

- No secret rotation, authentication rollout, billing integration, production deployment, proxy evasion, or retailer protection bypass.
- Do not change production values; add code and documented defaults only.

**Test/build expectations**

- Tests for IPv4/IPv6 private ranges, encoded hosts, redirects, DNS changes, oversized responses, rate/concurrency behavior, and cancellation.
- Root and worker tests pass.
- A local public-page smoke test succeeds while local/private targets are rejected under production-safe mode.

### Feature 4 — Privacy-safe MVP feedback and quality telemetry

**Goal**  
Create the missing validation loop so the team can measure whether reports are useful and where the pipeline fails.

**Scope**

- Add Useful/Not useful feedback with structured reasons.
- Capture privacy-safe technical outcomes: retailer domain, extraction state, analysis state, latency bucket, evidence coverage, score availability, and schema/model version.
- Keep free text optional.
- Provide a minimal aggregate view or export for validation analysis.

**Acceptance criteria**

- Feedback is optional and does not block analysis.
- No full URL query string, page content, evidence excerpt, IP address, or personal identifier is stored by default.
- One report cannot accidentally submit duplicate feedback.
- Aggregates show success, blocked, timeout, AI-failure, usefulness, and top reason by retailer domain.
- The UI confirms success and supports retry after submission failure.

**Allowed files**

- New feedback service/module under `src/`
- Local API/storage files and a narrowly scoped migration if local storage is selected
- `public/index.html`, `public/app.js`, `public/styles.css`
- README and tests

**Not allowed changes**

- No third-party analytics SDK, cookies, fingerprinting, authentication, billing, secret changes, or production deployment.
- No raw retailer content in telemetry.

**Test/build expectations**

- API tests for validation, duplicate behavior, privacy exclusions, and aggregation.
- Browser-level smoke test for submit/success/failure.
- `npm test` passes.

### Feature 5 — Retailer coverage benchmark and extraction quality dashboard

**Goal**  
Measure real MVP reliability across representative retailers before adding platform complexity.

**Scope**

- Maintain a small consented/fixed corpus of readable, JavaScript-heavy, blocked, sparse, multilingual, and misleading pages or snapshots.
- Record expected evidence states and critical fields.
- Produce a local benchmark summary for extraction success, contradiction rate, claim citation coverage, and report consistency.
- Keep this as a development/validation tool, not a production analytics platform.

**Acceptance criteria**

- Corpus covers at least 20 representative cases across five retailer/page patterns.
- Expected results distinguish found, not found, and unavailable.
- Benchmark reports field precision regressions and blocked-page behavior.
- No live retailer request is required for deterministic CI.
- A release candidate cannot regress critical material, claim, origin, care, or citation expectations unnoticed.

**Allowed files**

- `test/fixtures/`
- New benchmark/test helpers under `test/`
- Package scripts
- Documentation and local generated summaries ignored by Git where appropriate

**Not allowed changes**

- No large scraping platform, scheduled production crawler, browser extension, proxy pool, retailer login, CAPTCHA bypass, or production database.
- Do not commit copyrighted full-page archives beyond minimal purpose-limited fixtures.

**Test/build expectations**

- Deterministic offline benchmark command with machine-readable and concise human output.
- Failure exit code on critical regression.
- Existing root and worker suites continue to pass.

## I. Branch and change scope

This review is isolated on `codex/mvp-review-after-features-1-5`, created directly from `main` at `72afb04`. The only intended change is this review document. The pre-existing untracked export `Product_Passport_Agent_MVP_Review_Export.md` was preserved and is not part of this review change.

No product code, secrets, authentication, billing, production configuration, deployment, merge, push, or pull request is included.

## Recommended release gate

Before unrestricted public MVP access, require:

- independent-support scoring based on actual external evidence provenance;
- zero contradictory canonical/API report states in the fixed validation corpus;
- explicit confidence dimensions;
- SSRF-safe main and worker URL handling including redirects;
- bounded rate, concurrency, response size, and analysis cost;
- one documented production API/storage contract;
- privacy-safe usefulness and failure telemetry;
- browser-level tests for the consumer and blocked-page flows;
- monitored extraction, blocked, timeout, AI-failure, citation, and usefulness rates.

Until these gates are met, the application is best used as a controlled MVP with a curated validation cohort and known test URLs.
