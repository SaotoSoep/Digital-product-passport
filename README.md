# Product Passport Agent

Product Passport Agent is a small MVP web app for checking what a fashion product page publicly reveals about a specific clothing item.

Users paste a product URL from a retailer such as Zara, H&M, Uniqlo, Zalando, or ASOS, and the app returns a structured Product Passport Report. The report is consumer-facing and independent. It is not an official brand-issued Digital Product Passport.

## Current demo mode

The current UI is configured as a mock-data-only Product Passport-light workflow for review purposes. Submitting a URL validates the input and renders a static example passport card without performing live scraping or calling the analysis endpoint.

## What it does

- Fetches a submitted product URL server-side
- Reads publicly visible HTML from the product page
- Extracts basic signals such as page title, meta description, visible product-like text, material wording, sustainability-related wording, and care-related wording
- Returns a structured report that clearly separates:
  - brand claim
  - public evidence visible on the page
  - missing or unverified information

## Product Passport-light report structure

The current Product Passport-light output is mock-data-only and is meant to show the expected report shape for review.

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
- No database
- No browser extension logic
- No broad search or certification lookup
- No retailer-specific scraping layer yet
- Cautious claim handling: the app does not label a product as sustainable unless evidence is actually found

## Tech setup

- Static frontend in `public/`
- Minimal Node server in `server.js`
- Analysis logic in `src/analyzer.js`
- Netlify Function entrypoint in `netlify/functions/analyze.js`

## Local development

Run the local server:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## Deployment

The project is deployed on Netlify and uses:

- Publish directory: `public`
- Functions directory: `netlify/functions`
- Endpoint: `/api/analyze`

## Current limitations

- Some retailer sites block or limit reliable server-side fetches
- The app only uses publicly visible page content from the submitted URL
- It does not yet verify claims against external certifications, supply-chain data, or broader web evidence

## Next steps

- Improve generic HTML extraction quality
- Add clearer fallback handling for blocked product pages
- Add optional external evidence lookup in a later version
- Connect claim detection to a stronger scoring model
