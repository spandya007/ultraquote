import type { Metadata } from "next";
import { BETA_HTML } from "./beta-html";

export const metadata: Metadata = {
  title: "Request beta access — UltraQuote",
  description:
    "UltraQuote is in private beta — build quotes, write polished proposals, and collect e-signatures in one place. Free during the beta with founding-member pricing.",
  openGraph: {
    title: "You're invited to the UltraQuote private beta",
    description:
      "Build quotes, write polished proposals, and collect e-signatures in one place. Free during the beta with founding-member pricing.",
    url: "https://app.ultraquote.io/beta",
    siteName: "UltraQuote",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "You're invited to the UltraQuote private beta",
    description:
      "Build quotes, write polished proposals, and collect e-signatures in one place. Free during the beta.",
  },
};

// Public page (no auth) — beta-signup landing. Middleware allowlists /beta.
// Rendered light/branded regardless of theme.
export default function BetaPage() {
  return (
    <main className="min-h-screen bg-[#f1f5f9] py-12 px-4">
      <div dangerouslySetInnerHTML={{ __html: BETA_HTML }} />
    </main>
  );
}
