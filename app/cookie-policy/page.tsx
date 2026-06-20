import type { Metadata } from "next";
import { COOKIE_POLICY_HTML } from "./cookie-html";

export const metadata: Metadata = {
  title: "Cookie Policy — UltraQuote",
  description: "How UltraQuote uses cookies and similar technologies (essential and functional only).",
};

// Public page (no auth) — Cookie Policy. Middleware allowlists /cookie-policy.
// Rendered light for readability regardless of theme.
export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div
        className="mx-auto max-w-3xl px-5 py-12"
        dangerouslySetInnerHTML={{ __html: COOKIE_POLICY_HTML }}
      />
    </main>
  );
}
