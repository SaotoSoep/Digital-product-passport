# Deep Reader Worker

Browser-capable backend for the Product Passport Agent Deep Product Page Reader.

## API

`POST /deep-read`

```json
{
  "url": "https://example.com/product",
  "options": {
    "localeHints": ["nl", "en", "fr"],
    "maxDurationMs": 45000,
    "includeNetworkEvidence": true,
    "includeStructuredData": true
  }
}
```

## Local Run

```bash
PORT=8080 ALLOW_PRIVATE_URLS=1 ALLOW_UNAUTHENTICATED_DEEP_READ=1 node server.js
```

## Deploy

Use a browser-capable runtime such as Render, Fly.io, Railway, Cloud Run, or ECS/Fargate.

For Render, use `deep-reader-worker/render.yaml` or create a Docker web service with:

- Root directory: `deep-reader-worker`
- Dockerfile: `Dockerfile`
- Health check path: `/health`
- Environment:
  - `NODE_ENV=production`
  - `ALLOW_PRIVATE_URLS=0`
  - `DEEP_READER_WORKER_TOKEN=<same shared token configured in Netlify>`
  - `PORT=8080`

After deployment, configure Netlify:

```bash
npx netlify env:set DEEP_READER_WORKER_URL "https://your-worker-domain.com/deep-read"
npx netlify env:set DEEP_READER_WORKER_TIMEOUT_MS "45000"
npx netlify env:set DEEP_READER_WORKER_TOKEN "<same shared token configured on the worker>"
npx netlify deploy --prod --skip-functions-cache
```

## Security

The worker validates URLs, only allows `http` and `https`, blocks localhost/private/internal addresses unless `ALLOW_PRIVATE_URLS=1`, rate limits by client IP, caps request body and response evidence size, limits concurrent deep reads, and keeps browser interactions away from cart, checkout, payment, account, wishlist, and quantity controls.

In `NODE_ENV=production`, `/deep-read` requires a bearer token by default. Set the
same value in both places:

- Worker: `DEEP_READER_WORKER_TOKEN`
- Netlify/app caller: `DEEP_READER_WORKER_TOKEN`

Only set `ALLOW_UNAUTHENTICATED_DEEP_READ=1` for explicit local/test runs. If the
worker is behind a trusted proxy and you need per-client rate limiting instead
of per-proxy rate limiting, set `TRUST_PROXY_HEADERS=1`.
