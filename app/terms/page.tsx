import type { Metadata } from "next";
import { TERMS_HTML } from "./terms-html";

export const metadata: Metadata = {
  title: "Terms of Service — UltraQuote",
  description: "The terms governing your access to and use of UltraQuote.",
};

// Public page (no auth) — the Termly-generated Terms of Service. Middleware
// allowlists /terms. Rendered light for readability regardless of theme.
export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div
        className="mx-auto max-w-3xl px-5 py-12"
        dangerouslySetInnerHTML={{ __html: TERMS_HTML }}
      />
    </main>
  );
}
