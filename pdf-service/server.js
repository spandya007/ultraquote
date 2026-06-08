import express from "express";
import puppeteer from "puppeteer";

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

app.post("/render", async (req, res) => {
  // Optional shared-secret auth.
  if (TOKEN) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${TOKEN}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const { html, headerHtml, footerHtml } = req.body || {};
  if (!html || typeof html !== "string") {
    return res.status(400).json({ error: "Missing 'html' string in body" });
  }

  const wantHeaderFooter =
    (typeof headerHtml === "string" && headerHtml.length > 0) ||
    (typeof footerHtml === "string" && footerHtml.length > 0);

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: wantHeaderFooter,
      headerTemplate: typeof headerHtml === "string" ? headerHtml : "<span></span>",
      footerTemplate: typeof footerHtml === "string" ? footerHtml : "<span></span>",
    });
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
