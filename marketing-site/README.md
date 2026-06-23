# UltraQuote marketing site

The public product/landing page for **ultraquote.io** (apex). Static — no build step.
Separate from the app, which lives on **app.ultraquote.io** (the Next.js project at the repo root).

## Contents
- `index.html` — the product description (hero, features, how-it-works, pricing→beta, CTA).
  Brand: "Signal" blue+teal (see `../marketing-materials/BRAND-PALETTE.md`). CTAs point to
  `https://app.ultraquote.io/beta` (the live signup form).
- `_redirects` — Netlify: `www.ultraquote.io` → apex `ultraquote.io` (301).
- `robots.txt` + `sitemap.xml` — SEO basics (indexable; points crawlers at the sitemap).

## Deploy (Netlify — a SECOND site, not the app site)
1. Netlify → **Add new site** → deploy this `marketing-site/` folder.
   - No build command. **Publish directory:** the folder itself (`marketing-site` if deploying the
     repo, or `.` if you point a site at just this folder). Drag-and-drop of the folder also works.
2. **Domains** → add `ultraquote.io` (apex, canonical) and `www.ultraquote.io`.
   - DNS: point apex + www at this new Netlify site. Leave the existing `app.ultraquote.io`
     record pointing at the APP site untouched.
   - The `_redirects` file makes `www` 301 to the apex.
3. HTTPS: let Netlify provision the Let's Encrypt cert for both names.

## Keeping it in sync
`index.html` was derived from `../marketing-materials/ultraquote-brochure.html` (the design source,
also used for the PDF). If you change marketing copy, update both or treat this `index.html` as the
canonical web copy. The PDF brochure still uses a `mailto:` CTA — regenerate it if you want it to
point at `/beta` too.

## Note on the app domain
`app.ultraquote.io` is auth-gated (everything redirects to `/login`), so it's effectively not
indexable. If you want belt-and-suspenders, add a `noindex` robots rule to the Next app later.
