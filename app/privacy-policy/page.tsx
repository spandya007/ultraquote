import type { Metadata } from "next";
import { PRIVACY_POLICY_HTML } from "./policy-html";

export const metadata: Metadata = {
  title: "Privacy Policy — UltraQuote",
  description: "How UltraQuote accesses, collects, stores, uses, and shares your personal information.",
};

// Public page (no auth) — the Termly-generated Privacy Policy. Middleware
// allowlists /privacy-policy. Rendered light so it's readable regardless of
// the user's theme (legal text uses its own black-on-white styling).
export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div
        className="mx-auto max-w-3xl px-5 py-12"
        dangerouslySetInnerHTML={{ __html: PRIVACY_POLICY_HTML }}
      />
    </main>
  );
}
