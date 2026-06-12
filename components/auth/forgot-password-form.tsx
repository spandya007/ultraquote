"use client";

import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// "Forgot password?" — sends a Supabase recovery email whose link lands on
// /auth/set-password (recovery type, same hash-token mechanics as invites).
// Bare-path redirect only (no query string — the allowlist mismatches URLs
// with query params and falls back to the Site URL).
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${base.replace(/\/$/, "")}/auth/set-password`,
    });

    setLoading(false);
    if (err) { setError(err.message); return; }
    // Always show success (don't reveal whether the email is registered).
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-lg border bg-card p-6 shadow-sm space-y-3 text-center">
        <MailCheck className="w-8 h-8 text-green-600 mx-auto" />
        <h2 className="font-semibold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{email}</span>,
          a password-reset link is on its way. The link can be used once and expires after a while.
        </p>
        <a href="/login" className="inline-block text-sm font-medium text-primary hover:underline">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 text-destructive text-sm px-4 py-3">
          {error}
        </div>
      )}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="you@company.com"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? "Sending…" : "Send reset link"}
      </button>
      <a href="/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">
        Back to sign in
      </a>
    </form>
  );
}
