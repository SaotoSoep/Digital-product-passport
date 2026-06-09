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
PORT=8080 ALLOW_PRIVATE_URLS=1 node server.js
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
  - `PORT=8080`

After deployment, configure Netlify:

```bash
npx netlify env:set DEEP_READER_WORKER_URL "https://your-worker-domain.com/deep-read"
npx netlify env:set DEEP_READER_WORKER_TIMEOUT_MS "45000"
npx netlify deploy --prod --skip-functions-cache
```

## Security

The worker validates URLs, only allows `http` and `https`, blocks localhost/private/internal addresses unless `ALLOW_PRIVATE_URLS=1`, rate limits by client IP, caps request body size, and keeps browser interactions away from cart, checkout, payment, account, wishlist, and quantity controls.
