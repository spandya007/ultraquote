"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Gate form: the user must accept the Terms of Service + Privacy Policy before
// using the app. On agree, records acceptance (POST) then enters the app.
export function AcceptTermsForm() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!agreed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/accept-terms", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not save your acceptance. Please try again.");
      }
      // Hard navigation so the dashboard layout re-reads acceptance server-side.
      window.location.href = "/";
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span>
          I have read and agree to the{" "}
          <a className="text-primary underline" href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>{" "}
          and{" "}
          <a className="text-primary underline" href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
        </span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={accept}
        disabled={!agreed || submitting}
        className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {submitting ? "Saving…" : "Agree and continue"}
      </button>
    </div>
  );
}
