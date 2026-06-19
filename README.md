# Product Passport Agent

Product Passport Agent is a small MVP web app for checking what a fashion product page publicly reveals about a specific clothing item.

Users paste a product URL from a retailer such as Zara, H&M, Uniqlo, Zalando, or ASOS, and the app returns a structured Product Passport Report. The report is consumer-facing and independent. It is not an official brand-issued Digital Product Passport.

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

## Product Passport Report structure

The current Product Passport Report output is generated from visible page evidence and stored as a draft passport.

- Product summary: a short, plain-language overview of the item.
- Materials: the main materials explained in simple words.
- Sustainability claims: any environmental or ethical claims shown on the product page.
- Evidence level: how strongly each claim is supported by public page content.
- Missing information: details that are absent, unclear, or not publicly verifiable.
- Confidence scores: simple scores that show how confident the report is in the visible information.
- Conclusion: a short consumer-friendly wrap-up of what is known and what is still uncertain.

Missing or unverifiable information should be shown explicitly and not invented.

## MVP principles

- No authentication
- No payments
- Local SQLite persistence for MVP records
- No browser extension logic
- No broad search or certification lookup
- No retailer-specific scraping layer yet
- Cautious claim handling: the app does not label a product as sustainable unless evidence is actually found

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
