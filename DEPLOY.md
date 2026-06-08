# Deployment Guide — MSP QuoteBuilder

This app has **two deployable parts** plus a managed database:

| Component | Hosted on | What it is |
|---|---|---|
| **Web app** (Next.js) | **Netlify** | The full UI + API routes |
| **PDF service** (`/pdf-service`) | **Railway** | Express + Puppeteer HTML→PDF renderer |
| **Database / Auth / Storage** | **Supabase** | Postgres + RLS, auth, file storage |

The web app builds proposal HTML and calls the PDF service over HTTPS; the PDF
service is stateless and never touches the database.

---

## 1. Supabase (database)

1. Schema lives in `supabase/schema.sql` (already applied to the project).
2. **Run pending migrations** in Supabase → SQL Editor. Current migrations:
   - `supabase/migrations/001_add_include_header_footer.sql` — adds the per-document
     header/footer toggle. Required, or saving a quote will fail.
3. Storage bucket **`proposal-assets`** must exist (used for Document image uploads).

---

## 2. PDF service on Railway

1. Push this repo to GitHub.
2. Railway → **New Project → Deploy from GitHub repo** → select the repo.
3. Service **Settings → Root Directory = `pdf-service`** (builds only that folder's Dockerfile).
4. **Settings → Networking → Generate Domain** → copy the URL.
5. **Variables** → add `PDF_SERVICE_TOKEN` = a long random string (`openssl rand -hex 32`).
   `PORT` is injected by Railway automatically.
6. Verify: `curl https://YOUR-RAILWAY-URL/health` → `{"ok":true}`.

Railway auto-redeploys on every push to `main`. Note: Railway's security scanner
checks the **whole repo**, so the root `next` version must stay patched
(currently `^14.2.35`).

---

## 3. Web app on Netlify

1. Netlify → **Add new site → Import from GitHub** → select the repo.
2. Build settings (usually auto-detected): build command `next build`; the
   **`@netlify/plugin-nextjs`** plugin handles the Next.js runtime (Netlify adds
   it automatically for Next sites).
3. **Site configuration → Environment variables** — add all of the following,
   then trigger a redeploy (Netlify only picks up env vars on a fresh build):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key |
   | `PDF_SERVICE_URL` | Railway PDF service URL (from step 2) |
   | `PDF_SERVICE_TOKEN` | Same random string set on Railway |
   | `GEMINI_API_KEY` | Google Gemini key — https://aistudio.google.com/apikey |

4. Set the variables for the **Production** context (and Deploy Previews if used).

---

## Environment variables reference

Local development uses `.env.local` (git-ignored). See `.env.example` for the
full list. Summary of what each does:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client + server Supabase access (RLS-scoped).
- `SUPABASE_SERVICE_ROLE_KEY` — privileged server-side operations.
- `PDF_SERVICE_URL` — where the web app POSTs HTML for rendering. **PDF download returns 501 until this is set.**
- `PDF_SERVICE_TOKEN` — shared secret; must match the value on the Railway service.
- `GEMINI_API_KEY` — server-side AI writing assistant (`gemini-2.5-flash`). **AI returns 501 until this is set.** Never exposed to the browser.

---

## Post-deploy smoke test

1. Log in, open a quote.
2. **Document tab** → type `/pricing` to confirm scenario tables render.
3. **Ask AI** → "Improve writing" on a selection → review modal → Replace.
4. **Preview** → confirm the proposal renders.
5. **Download PDF** → confirm pages 2+ show header/footer; page 1 (cover) is clean.
