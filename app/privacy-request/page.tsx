import type { Metadata } from "next";
import { ENTITY } from "@/lib/legal/entity";

export const metadata: Metadata = {
  title: `Privacy & Data Requests — ${ENTITY.productName}`,
  description: `Submit a request to access, correct, or delete your personal information held by ${ENTITY.productName}.`,
};

// Public page (no auth) — linked from the Privacy Policy as the way for users to
// submit data-subject access requests (access / correct / delete). Middleware
// allows /privacy-request without a session.
const PRIVACY_EMAIL = ENTITY.privacyEmail;

const mailto =
  `mailto:${PRIVACY_EMAIL}` +
  `?subject=${encodeURIComponent("Privacy data request")}` +
  `&body=${encodeURIComponent(
    [
      "Type of request (please keep the relevant one):",
      "  - Access a copy of my personal information",
      "  - Correct my personal information",
      "  - Delete my personal information / account",
      "",
      "Full name:",
      "Email address on the account:",
      "Company / workspace (if known):",
      "",
      "Additional details:",
    ].join("\n")
  )}`;

export default function PrivacyRequestPage() {
  return (
    <main className="min-h-screen bg-background text-foreground flex justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <p className="text-sm font-semibold tracking-wide text-primary">SmartProps</p>
        <h1 className="mt-2 text-3xl font-bold">Privacy &amp; Data Requests</h1>
        <p className="mt-3 text-muted-foreground">
          You can ask us to access, correct, or delete the personal information we hold about you.
          Depending on where you live, privacy laws may give you the right to make these requests.
        </p>

        <section className="mt-8 space-y-2">
          <h2 className="text-lg font-semibold">Your requests</h2>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li><strong className="text-foreground">Access</strong> — get a copy of the personal information we hold about you.</li>
            <li><strong className="text-foreground">Correct</strong> — fix inaccurate or incomplete information.</li>
            <li><strong className="text-foreground">Delete</strong> — remove your personal information / close your account.</li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold">How to submit a request</h2>
          <p className="text-muted-foreground">
            Email <a className="text-primary underline" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> with:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>the type of request (access, correct, or delete),</li>
            <li>your full name,</li>
            <li>the email address on your account, and</li>
            <li>any details that help us locate your information.</li>
          </ul>
          <div className="pt-2">
            <a
              href={mailto}
              className="inline-flex items-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Email your request
            </a>
          </div>
          <p className="text-sm text-muted-foreground">
            We verify the requester’s identity before acting on a request and will respond within a
            reasonable timeframe (and within any period required by applicable law).
          </p>
        </section>

        <p className="mt-10 text-sm text-muted-foreground">
          For more detail on how we handle data, see our Privacy Policy. Questions? Contact{" "}
          <a className="text-primary underline" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
        </p>
      </div>
    </main>
  );
}
