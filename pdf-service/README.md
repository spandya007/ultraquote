# QuoteBuilder PDF Service

A tiny Express + Puppeteer microservice that turns proposal HTML into a PDF.
The Next.js app (`/api/quotes/[id]/pdf`) serializes a quote to HTML and POSTs it
here; this service renders it with headless Chrome and returns the PDF bytes.

## Endpoints

- `GET /health` → `{ ok: true }`
- `POST /render` → body `{ "html": "<!DOCTYPE html>..." }` → `application/pdf`
  - If `PDF_SERVICE_TOKEN` is set, requires header `Authorization: Bearer <token>`.

## Deploy to Railway

1. Create a new Railway project → **Deploy from Repo** (or a subdirectory deploy
   pointing at `/pdf-service`).
2. Railway auto-detects the `Dockerfile`. No build config needed.
3. Set environment variables:
   - `PDF_SERVICE_TOKEN` — a long random string (shared secret).
   - `PORT` is provided by Railway automatically.
4. Deploy. Note the public URL (e.g. `https://quotebuilder-pdf.up.railway.app`).

## Wire up the Next.js app

In the main app's environment (`.env.local` for dev, Vercel env for prod):

```
PDF_SERVICE_URL=https://quotebuilder-pdf.up.railway.app
PDF_SERVICE_TOKEN=<same random string as above>
```

## Local test

```bash
cd pdf-service
npm install
PDF_SERVICE_TOKEN=dev npm start
# then:
curl -X POST http://localhost:8080/render \
  -H "Authorization: Bearer dev" -H "Content-Type: application/json" \
  -d '{"html":"<h1>Hello PDF</h1>"}' --output test.pdf
```
