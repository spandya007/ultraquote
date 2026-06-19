-- 015: per-tenant brand font for the proposal PDF/Preview.
-- One company-wide font applied to the rendered proposal body. NULL = the
-- default sans-serif. Allowed values: 'sans' | 'serif' | 'mono' (app-enforced).
-- Chosen for guaranteed rendering in BOTH Puppeteer (proposal PDF) and DocuSeal
-- (signing doc): they map to Helvetica/Arial, Times New Roman/Times, and
-- Courier New/Courier — the PDF base fonts.
alter table public.tenant_settings add column if not exists default_font text;
