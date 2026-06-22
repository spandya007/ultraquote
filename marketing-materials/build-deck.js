const pptxgen = require("pptxgenjs");

// ---- Brand palette — "Signal" (Blue + Teal), locked 2026-06-21 -----------
const NAVY = "0B1F3A";   // ink / dark bg
const BRAND = "2563EB";  // primary blue
const BRAND_DK = "1D4ED8";
const TEAL = "0EA5A4";   // accent
const TEAL_DK = "0F5F5C";// teal text on light
const TEAL_50 = "ECFEFF";// teal mist (light accent section)
const TEAL_100 = "CCFBF1";
const ICE = "EFF6FF";    // brand-50 (blue tint)
const MUTED = "64748B";
const LINE = "E2E8F0";
const WHITE = "FFFFFF";
const OK = "16A34A";
const CARD = "F8FAFC";

const HF = "Georgia";    // header font
const BF = "Calibri";    // body font

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";        // 13.3 x 7.5
pres.author = "UltraQuote";
pres.title = "UltraQuote — Proposals & Quoting for MSPs";
const W = 13.3, H = 7.5;

const shadow = () => ({ type: "outer", color: "0F172A", blur: 9, offset: 3, angle: 135, opacity: 0.12 });

// Reusable: brand chip logo. chip color defaults to BRAND; pass chipColor to override
// (e.g. white chip on a brand-blue background so it stays visible).
function logo(slide, x, y, dark, chipColor) {
  const chip = chipColor || BRAND;
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 0.5, h: 0.5, rectRadius: 0.08, fill: { color: chip } });
  slide.addText("UQ", { x, y, w: 0.5, h: 0.5, align: "center", valign: "middle", fontFace: HF, bold: true, color: chip === WHITE ? BRAND : WHITE, fontSize: 16, margin: 0 });
  slide.addText("UltraQuote", { x: x + 0.58, y, w: 3, h: 0.5, align: "left", valign: "middle", fontFace: HF, bold: true, color: dark ? WHITE : NAVY, fontSize: 19, margin: 0 });
}

function eyebrow(slide, text, x, y) {
  slide.addText(text.toUpperCase(), { x, y, w: 8, h: 0.3, fontFace: BF, bold: true, color: TEAL_DK, fontSize: 12, charSpacing: 2, margin: 0 });
}

// =========================================================================
// 1. TITLE
// =========================================================================
let s = pres.addSlide();
s.background = { color: NAVY };
s.addShape(pres.shapes.OVAL, { x: 9.0, y: -2.4, w: 7, h: 7, fill: { color: BRAND, transparency: 55 } });
s.addShape(pres.shapes.OVAL, { x: 10.6, y: 2.2, w: 5, h: 5, fill: { color: TEAL, transparency: 55 } });
logo(s, 0.9, 0.7, true);
s.addText("PROPOSALS & QUOTING SOFTWARE  ·  NOW IN PRIVATE BETA", { x: 0.95, y: 2.25, w: 11, h: 0.4, fontFace: BF, bold: true, color: "93C5FD", fontSize: 13, charSpacing: 2, margin: 0 });
s.addText([
  { text: "Proposals your clients\n", options: { color: WHITE } },
  { text: "sign in minutes.", options: { color: "60A5FA" } },
], { x: 0.9, y: 2.7, w: 11, h: 2.0, fontFace: HF, bold: true, fontSize: 50, lineSpacingMultiple: 1.0, margin: 0 });
s.addText("The all-in-one platform for any team that sends quotes — build multi-option quotes, write polished proposals with AI, and collect legally-binding e-signatures, without leaving the app.", { x: 0.95, y: 4.9, w: 9.8, h: 1.0, fontFace: BF, color: "CBD5E1", fontSize: 16, margin: 0 });
s.addText("hello@ultraquote.io   ·   app.ultraquote.io", { x: 0.95, y: 6.6, w: 9, h: 0.4, fontFace: BF, color: "64748B", fontSize: 13, margin: 0 });

// =========================================================================
// 2. THE PROBLEM
// =========================================================================
s = pres.addSlide();
s.background = { color: WHITE };
eyebrow(s, "The problem", 0.9, 0.7);
s.addText("Quoting is slow, manual, and scattered across tools.", { x: 0.9, y: 1.05, w: 11.5, h: 0.9, fontFace: HF, bold: true, color: NAVY, fontSize: 32, margin: 0 });

const problems = [
  ["Disconnected tools", "A spreadsheet for pricing, Word for the proposal, and a third app for signatures — copy-pasted by hand every time."],
  ["Pricing errors", "Manual totals, tax, and discounts mean costly mistakes that slip into client-facing quotes."],
  ["Slow turnaround", "Days of back-and-forth, printing, and scanning before a deal is signed — momentum lost."],
  ["No visibility", "Once a quote is sent, it disappears into an inbox. No idea if it was opened, let alone won."],
];
let px = 0.9;
problems.forEach((p) => {
  s.addShape(pres.shapes.RECTANGLE, { x: px, y: 2.35, w: 2.85, h: 3.4, fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: shadow() });
  s.addShape(pres.shapes.RECTANGLE, { x: px, y: 2.35, w: 2.85, h: 0.09, fill: { color: "EF4444" } });
  s.addText("✕", { x: px + 0.25, y: 2.7, w: 0.7, h: 0.7, fontFace: BF, bold: true, color: "EF4444", fontSize: 26, margin: 0 });
  s.addText(p[0], { x: px + 0.25, y: 3.5, w: 2.4, h: 0.5, fontFace: HF, bold: true, color: NAVY, fontSize: 17, margin: 0 });
  s.addText(p[1], { x: px + 0.25, y: 4.05, w: 2.4, h: 1.6, fontFace: BF, color: MUTED, fontSize: 12.5, margin: 0 });
  px += 3.05;
});
s.addText("You lose deals to whoever quotes first — not whoever quotes best.", { x: 0.9, y: 6.35, w: 11.5, h: 0.5, fontFace: BF, italic: true, color: BRAND_DK, fontSize: 15, margin: 0 });

// =========================================================================
// 3. THE SOLUTION
// =========================================================================
s = pres.addSlide();
s.background = { color: ICE };
eyebrow(s, "The solution", 0.9, 0.7);
s.addText("One workflow: catalog → proposal → signature.", { x: 0.9, y: 1.05, w: 11.5, h: 0.9, fontFace: HF, bold: true, color: NAVY, fontSize: 32, margin: 0 });
s.addText("UltraQuote replaces the spreadsheet, the Word template, and the signing tool with a single, branded workflow built for how modern teams sell.", { x: 0.9, y: 1.95, w: 10.5, h: 0.8, fontFace: BF, color: MUTED, fontSize: 16, margin: 0 });

const pillars = [
  ["Build", "Multi-option quotes from your product catalog with tiers, setup fees, discounts, tax & margins — calculated instantly."],
  ["Write", "A rich proposal editor with your branding, AI writing assistance, two-column layouts, and embedded live pricing."],
  ["Sign & Win", "Send for e-signature, track status live from sent → viewed → signed, and watch your pipeline on a real dashboard."],
];
let qx = 0.9;
pillars.forEach((p, i) => {
  s.addShape(pres.shapes.RECTANGLE, { x: qx, y: 3.0, w: 3.75, h: 3.3, fill: { color: WHITE }, line: { color: LINE, width: 1 }, shadow: shadow() });
  s.addShape(pres.shapes.OVAL, { x: qx + 0.35, y: 3.35, w: 0.85, h: 0.85, fill: { color: TEAL } });
  s.addText(String(i + 1), { x: qx + 0.35, y: 3.35, w: 0.85, h: 0.85, align: "center", valign: "middle", fontFace: HF, bold: true, color: WHITE, fontSize: 24, margin: 0 });
  s.addText(p[0], { x: qx + 0.35, y: 4.4, w: 3.0, h: 0.5, fontFace: HF, bold: true, color: NAVY, fontSize: 21, margin: 0 });
  s.addText(p[1], { x: qx + 0.35, y: 4.95, w: 3.1, h: 1.3, fontFace: BF, color: MUTED, fontSize: 13, margin: 0 });
  qx += 4.0;
});

// =========================================================================
// 4. KEY FEATURES
// =========================================================================
s = pres.addSlide();
s.background = { color: WHITE };
eyebrow(s, "Capabilities", 0.9, 0.55);
s.addText("Everything you need to quote like a pro.", { x: 0.9, y: 0.9, w: 11.5, h: 0.8, fontFace: HF, bold: true, color: NAVY, fontSize: 30, margin: 0 });

const feats = [
  ["Product catalog & tiers", "Import via CSV; price with multiple tiers, setup fees & billing periods."],
  ["Multi-option scenarios", "Present Good / Better / Best side-by-side; star a recommended pick."],
  ["AI writing assistant", "Google Gemini drafts, expands, re-tones & extracts pricing from docs."],
  ["Built-in e-signature", "Client + counter-sign roles, initials, checkboxes — status flips live."],
  ["Your brand", "Logo, accent theme, proposal font, and custom domain. Clients see you."],
  ["Templates & import", "Reusable templates; import from Word or Markdown in one click."],
  ["Teams & roles", "Owner/member roles, quote ownership, and live presence indicators."],
  ["Real-time dashboard", "Pipeline value, win rate, expiring quotes, recurring revenue at a glance."],
  ["Secure by design", "Multi-tenant isolation, 2FA, password policy & idle auto-logout."],
];
let fx = 0.9, fy = 1.95;
feats.forEach((f, i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const x = 0.9 + col * 4.0, y = 1.95 + row * 1.62;
  s.addShape(pres.shapes.RECTANGLE, { x, y, w: 3.8, h: 1.45, fill: { color: CARD }, line: { color: LINE, width: 1 } });
  s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.09, h: 1.45, fill: { color: TEAL } });
  s.addText(f[0], { x: x + 0.3, y: y + 0.18, w: 3.35, h: 0.4, fontFace: HF, bold: true, color: NAVY, fontSize: 15, margin: 0 });
  s.addText(f[1], { x: x + 0.3, y: y + 0.62, w: 3.35, h: 0.75, fontFace: BF, color: MUTED, fontSize: 11.5, margin: 0 });
});

// =========================================================================
// 5. HOW IT WORKS
// =========================================================================
s = pres.addSlide();
s.background = { color: NAVY };
eyebrow(s, "How it works", 0.9, 0.7);
s.addText("Four steps from inquiry to signed contract.", { x: 0.9, y: 1.05, w: 11.5, h: 0.8, fontFace: HF, bold: true, color: WHITE, fontSize: 30, margin: 0 });

const steps = [
  ["Build the quote", "Pull products from your catalog, add scenarios, and apply per-line discounts."],
  ["Write the proposal", "Draft with AI, drop in live pricing tables, and brand the document."],
  ["Send for signature", "Preview the PDF, then send. Client signs online; you counter-sign."],
  ["Track & win", "Watch status flip in real time and manage pipeline on the dashboard."],
];
let sx = 0.9;
steps.forEach((p, i) => {
  s.addShape(pres.shapes.RECTANGLE, { x: sx, y: 2.7, w: 2.85, h: 2.9, fill: { color: "1E293B" }, line: { color: "334155", width: 1 } });
  s.addText(String(i + 1).padStart(2, "0"), { x: sx + 0.25, y: 2.9, w: 2.4, h: 0.8, fontFace: HF, bold: true, color: "5EEAD4", fontSize: 40, margin: 0 });
  s.addText(p[0], { x: sx + 0.25, y: 3.85, w: 2.45, h: 0.5, fontFace: HF, bold: true, color: WHITE, fontSize: 16, margin: 0 });
  s.addText(p[1], { x: sx + 0.25, y: 4.4, w: 2.45, h: 1.1, fontFace: BF, color: "94A3B8", fontSize: 12, margin: 0 });
  sx += 3.05;
});

// =========================================================================
// 6. PRICING — detailed tiers
// =========================================================================
s = pres.addSlide();
s.background = { color: WHITE };
eyebrow(s, "Pricing", 0.9, 0.45);
s.addText("You only pay for documents that get signed.", { x: 0.9, y: 0.8, w: 11.5, h: 0.7, fontFace: HF, bold: true, color: NAVY, fontSize: 28, margin: 0 });
s.addText("Quotes are always unlimited. We meter only completed (fully-signed) documents.", { x: 0.9, y: 1.5, w: 11.5, h: 0.4, fontFace: BF, color: MUTED, fontSize: 14, margin: 0 });

const plans = [
  ["Pay-per-use", "$9", "/ signed doc", "$0 base · pay as you go", ["1 user (owner)", "Unlimited quotes", "All features", "No commitment"], false],
  ["Starter", "$29", "/ mo", "10 signed docs included", ["1 user · up to 3", "+$10/seat (+5 docs)", "$3 per extra doc", "Unlimited quotes"], false],
  ["Team", "$79", "/ mo", "50 signed docs included", ["5 users · up to 10", "+$10/seat (+5 docs)", "$3 per extra doc", "Everything in Starter"], true],
  ["Team Ultra", "$159", "/ mo", "100 signed docs included", ["10 users included", "$3 per extra doc", "Best per-doc rate", "Everything in Team"], false],
];
let plx = 0.9;
plans.forEach((p) => {
  const feat = p[5];
  const y = feat ? 1.95 : 2.1, h = feat ? 4.2 : 3.9;
  s.addShape(pres.shapes.RECTANGLE, { x: plx, y, w: 2.85, h, fill: { color: feat ? NAVY : WHITE }, line: { color: feat ? NAVY : LINE, width: feat ? 0 : 1 }, shadow: shadow() });
  if (!feat) s.addShape(pres.shapes.RECTANGLE, { x: plx, y, w: 2.85, h: 0.08, fill: { color: TEAL } });
  if (feat) s.addText("MOST POPULAR", { x: plx, y: y + 0.2, w: 2.85, h: 0.3, align: "center", fontFace: BF, bold: true, color: "5EEAD4", fontSize: 10, charSpacing: 2, margin: 0 });
  const ty = feat ? y + 0.58 : y + 0.32;
  s.addText(p[0], { x: plx + 0.25, y: ty, w: 2.4, h: 0.4, fontFace: HF, bold: true, color: feat ? WHITE : NAVY, fontSize: 18, margin: 0 });
  s.addText([{ text: p[1], options: { fontSize: 34, bold: true, color: feat ? WHITE : NAVY } }, { text: " " + p[2], options: { fontSize: 12, color: feat ? "94A3B8" : MUTED } }], { x: plx + 0.25, y: ty + 0.45, w: 2.5, h: 0.6, fontFace: HF, margin: 0 });
  s.addText(p[3], { x: plx + 0.25, y: ty + 1.15, w: 2.45, h: 0.35, fontFace: BF, bold: true, color: feat ? "5EEAD4" : TEAL_DK, fontSize: 11.5, margin: 0 });
  const items = p[4].map((it) => ({ text: it, options: { bullet: { code: "2713", indent: 14 }, color: feat ? "CBD5E1" : "1E293B", breakLine: true, paraSpaceAfter: 5 } }));
  s.addText(items, { x: plx + 0.25, y: ty + 1.55, w: 2.5, h: 1.7, fontFace: BF, fontSize: 11.5, margin: 0 });
  plx += 3.05;
});
s.addText("Flat $3 per completed document beyond your plan's monthly included docs — any plan, never a hard cap. Annual billing (~2 months free). Pricing is being finalized during beta — contact hello@ultraquote.io.", { x: 0.9, y: 6.5, w: 11.5, h: 0.6, fontFace: BF, italic: true, color: MUTED, fontSize: 11.5, align: "center", margin: 0 });

// =========================================================================
// 7. CLOSING CTA
// =========================================================================
s = pres.addSlide();
s.background = { color: BRAND };
s.addShape(pres.shapes.OVAL, { x: -2, y: 3.5, w: 7, h: 7, fill: { color: BRAND_DK, transparency: 45 } });
s.addShape(pres.shapes.OVAL, { x: 9.5, y: -3, w: 7, h: 7, fill: { color: TEAL, transparency: 45 } });
logo(s, 0.9, 0.8, true, WHITE);
s.addText("Ready to send proposals that close?", { x: 0.9, y: 2.6, w: 11, h: 1.5, fontFace: HF, bold: true, color: WHITE, fontSize: 40, margin: 0 });
s.addText("Join the teams building faster, more professional quotes with UltraQuote.\nNow in private beta — request your early-access invite.", { x: 0.95, y: 4.3, w: 10, h: 1.0, fontFace: BF, color: ICE, fontSize: 17, margin: 0 });
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.95, y: 5.6, w: 3.4, h: 0.75, rectRadius: 0.1, fill: { color: WHITE }, shadow: shadow() });
s.addText("Request access  →", { x: 0.95, y: 5.6, w: 3.4, h: 0.75, align: "center", valign: "middle", fontFace: BF, bold: true, color: BRAND_DK, fontSize: 16, margin: 0 });
s.addText("hello@ultraquote.io     ·     app.ultraquote.io", { x: 0.95, y: 6.7, w: 9, h: 0.4, fontFace: BF, color: ICE, fontSize: 13, margin: 0 });

pres.writeFile({ fileName: "/Users/sameer/ultraquote/marketing-materials/ultraquote-deck.pptx" }).then((f) => console.log("WROTE", f));
