# Product Passport Agent

Product Passport Agent is a small MVP web app for checking what a fashion product page publicly reveals about a specific clothing item.

Users paste a product URL from a retailer such as Zara, H&M, Uniqlo, Zalando, or ASOS, and the app returns a structured independent product report. It is not an official EU Digital Product Passport (DPP), a product certification, or a compliance assessment.

## Current MVP mode

The current UI creates a saved draft Product Passport record from a submitted product URL. The backend fetches publicly visible product page HTML, generates an evidence-aware report, stores the draft in a local SQLite database, and returns the saved passport record to the browser.

## What it does

- Fetches a submitted product URL server-side
- Reads publicly visible HTML from the product page
- Extracts basic signals such as page title, meta description, visible product-like text, material wording, sustainability-related wording, and care-related wording
- Stores a draft passport record with status, product metadata, report JSON, snapshot JSON, and timestamps
- Supports listing, reading, updating, publishing, and reading published passports by public id
- Returns a structured report that clearly separates:
  - brand claim
  - public evidence visible on the page
  - missing or unverified information

## Consumer-first report structure

The first report view is generated from visible page evidence and is ordered around what a consumer needs to understand. It always separates known facts, claims, missing information, and information that could not be assessed because a source was unavailable.

- What is known
- Materials explained
- Claims and evidence
- Origin and manufacturing
- Care guidance
- Disclosure and claim scores
- Conclusion
- Sources
- Unknowns and unavailable information

Deep-reader diagnostics, passport-readiness internals, brand context, and every normalized raw-evidence field remain available in the secondary Technical details tab. Missing or unverifiable information is shown explicitly and never invented.

## Deterministic score rubric

Both scores are calculated in `src/lib/product-passport/scorer.js`; model output and brand-context pages never set or change a score. A result has `status: "scored"` with an integer from 0–100, or `status: "not_available"` with `score: null`. Failed or unreadable extraction is always Not available, never a proxy score. Claim strength is also Not available when no product-level claim was found.

Transparency measures disclosure only. Its weighted inputs total 100 points:

| Input | Weight |
| --- | ---: |
| Product identity (name, brand, identifier) | 10 |
| Product description | 5 |
| Material composition | 20 |
| Production origin | 15 |
| Supplier or factory | 15 |
| Care instructions | 10 |
| Claim wording disclosed | 10 |
| Certification references | 10 |
| Durability, repair, or warranty | 5 |

Canonical contradictions deduct 10 points each, capped at a 15-point deduction. The score itself is always clamped to 0–100. URL, page title, fallback interpretation, brand prose, impact/LCA data, and regulatory compliance do not add points.

Claim strength measures evidence for a disclosed claim, not whether the product is environmentally preferable. Its inputs are claim specificity (20), matching product-specific composition or performance support (25), qualifying independent product-linked certification support (35), origin/supplier traceability (15), and durability/test support (5). Contradictions deduct 15 points each, capped at 25 points.

Independent support is provenance-aware. Product-page or brand-hosted certification wording receives zero independent-support points, even when a SKU or other product identifier is present on the same page. The 35-point independent-support factor is awarded only when a qualifying `external_evidence` ledger record links certification support to the assessed product identifier. External certification evidence that is not product-linked is shown in the factor rationale, but it does not receive independent-support points.

A claim without both qualifying external product-linked evidence and product-specific support is capped: brand wording alone at 35, and a claim with only one of those support types at 60. Every scored result returns factor-level reasons, evidence IDs where available, deductions, the applied cap, its top two positive factors, and its two highest-weight missing factors for UI explanation. UI confidence labels distinguish extraction confidence from verification strength.

These labels describe disclosure and evidence strength only. They must not characterize a product itself as sustainable or unsustainable.

## MVP principles

- No authentication
- No payments
- Local SQLite persistence for MVP records
- No browser extension logic
- No broad search or certification lookup
- No retailer-specific scraping layer yet
- Cautious claim handling: the app describes disclosure and evidence strength, never the product itself as sustainable or unsustainable

## Tech setup

- Static frontend in `public/`
- Minimal Node server in `server.js`
- Analysis logic in `src/analyzer.js`
- Passport service in `src/passports.js`
- SQLite storage adapter in `src/lib/storage/sqlite.js`
- D1/SQLite-compatible schema in `db/schema.sql` and `db/migrations/`
- Netlify Function entrypoint in `netlify/functions/analyze.js`

## Local development

The local passport storage adapter uses Node's built-in SQLite support. Use Node 24 or newer for the local backend workflow.

Run the local server:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

The local database is created automatically at:

```text
data/product-passports.sqlite
```

## Backend API

- `GET /api/health` checks that the backend is available.
- `POST /api/passports` creates a saved draft passport from `{ "productUrl": "https://..." }`.
- `GET /api/passports` lists recent passports. Optional query params: `status`, `limit`.
- `GET /api/passports/:id` returns a saved passport.
- `PATCH /api/passports/:id` updates editable metadata such as `productName`, `brand`, or `status`.
- `POST /api/passports/:id/publish` marks a passport as published and assigns a public id.
- `GET /api/public/passports/:publicId` returns a published passport by public id.
- `POST /api/analyze` remains available as the raw analysis endpoint.

### Analysis gateway safety controls

The public analysis path validates submitted product URLs before any page fetch,
deep-read worker call, or AI analysis starts. By default it only accepts public
`http` and `https` URLs, rejects localhost/private/link-local/reserved IP
ranges, resolves DNS before fetch, revalidates redirect targets, applies fetch
timeouts, and caps request/response body sizes.

Useful environment variables:

```bash
MAX_API_BODY_BYTES=131072
ANALYZE_RATE_LIMIT_WINDOW_MS=60000
ANALYZE_RATE_LIMIT_MAX=20
ANALYZE_CONCURRENCY_MAX=3
ANALYZE_DUPLICATE_TTL_MS=30000
```

Set `ALLOW_PRIVATE_URLS=1` only for explicit local development scenarios, such
as analyzing the bundled `localhost` demo pages. Do not enable it on public
deployments.

## Deployment

The existing Netlify deployment path still uses:

- Publish directory: `public`
- Functions directory: `netlify/functions`
- Endpoint: `/api/analyze`

The new passport lifecycle backend is currently wired into the local Node server first. Its schema is SQLite/D1-compatible so it can be moved to Sites/D1 when the hosting target is finalized.

### Production deep reader worker

Production deep page reading runs in the separate Render service at:

```text
https://deep-reader-worker.onrender.com/deep-read
```

Set these Netlify environment variables before deploying the frontend/functions:

```bash
npx netlify env:set DEEP_READER_WORKER_URL "https://deep-reader-worker.onrender.com/deep-read"
npx netlify env:set DEEP_READER_WORKER_TIMEOUT_MS "30000"
npx netlify env:set DEEP_READER_WORKER_TOKEN "<shared-server-token>"
npx netlify deploy --prod --skip-functions-cache
```

The app treats worker failures such as `access_denied`, `blocked_by_bot_protection`, `timeout`, and `unsupported_rendering_pattern` as unavailable source evidence. These failures must not be interpreted as proof that the product page does not disclose the missing fields.

## Current limitations

- Some retailer sites block or limit reliable server-side fetches
- The app only uses publicly visible page content from the submitted URL
- It does not yet verify claims against external certifications, supply-chain data, or broader web evidence

## Next steps

- Improve generic HTML extraction quality
- Add clearer fallback handling for blocked product pages
- Add optional external evidence lookup in a later version
- Connect claim detection to a stronger scoring model
