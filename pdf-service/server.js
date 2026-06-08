import express from "express";
import puppeteer from "puppeteer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 8080;
const TOKEN = process.env.PDF_SERVICE_TOKEN || "";

// Reuse a single browser instance across requests for speed.
let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
  }
  return browserPromise;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

const MARGIN = 54;          // 0.75in in points
const GRAY = rgb(0.39, 0.45, 0.55);
const RULE = rgb(0.80, 0.84, 0.88);

// Stamps a running header + footer onto every page EXCEPT the first (the cover).
// Numbering starts at 1 on the second physical page; total = body page count.
async function stampHeaderFooter(pdfBytes, meta) {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  if (pages.length < 2) return pdfBytes; // cover only — nothing to stamp

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const size = 9;
  const bodyTotal = pages.length - 1;

  const tenantName = String(meta?.tenantName || "");
  const quoteNumber = String(meta?.quoteNumber || "");
  const clientCompany = String(meta?.clientCompany || "");

  for (let i = 1; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const right = width - MARGIN;

    // ── Header ──
    const headerY = height - 40;
    if (tenantName) page.drawText(tenantName, { x: MARGIN, y: headerY, size, font, color: GRAY });
    if (quoteNumber) {
      const w = mono.widthOfTextAtSize(quoteNumber, size);
      page.drawText(quoteNumber, { x: right - w, y: headerY, size, font: mono, color: GRAY });
    }
    page.drawLine({ start: { x: MARGIN, y: headerY - 6 }, end: { x: right, y: headerY - 6 }, thickness: 0.5, color: RULE });

    // ── Footer ──
    const footerY = 34;
    const conf = clientCompany ? `Confidential — prepared for ${clientCompany}` : "Confidential";
    page.drawText(conf, { x: MARGIN, y: footerY, size, font, color: GRAY });
    const label = `Page ${i} of ${bodyTotal}`;
    const lw = font.widthOfTextAtSize(label, size);
    page.drawText(label, { x: right - lw, y: footerY, size, font, color: GRAY });
    page.drawLine({ start: { x: MARGIN, y: footerY + 12 }, end: { x: right, y: footerY + 12 }, thickness: 0.5, color: RULE });
  }

  return doc.save();
}

app.post("/render", async (req, res) => {
  // Optional shared-secret auth.
  if (TOKEN) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${TOKEN}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const { html, headerFooter, meta } = req.body || {};
  if (!html || typeof html !== "string") {
    return res.status(400).json({ error: "Missing 'html' string in body" });
  }

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    let pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
    });

    // Stamp running header/footer onto pages 2+ unless disabled for this document.
    if (headerFooter !== false) {
      pdf = Buffer.from(await stampHeaderFooter(pdf, meta || {}));
    }

    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": pdf.length,
    });
    res.send(pdf);
  } catch (err) {
    console.error("[pdf-service] render error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`[pdf-service] listening on :${PORT}`);
});
