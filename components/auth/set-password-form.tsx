"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Phase = "loading" | "invalid" | "ready";

// Invite links land here with session tokens in the URL hash (implicit flow).
// createBrowserClient's detectSessionInUrl usually consumes them on first
// client construction; we also set the session explicitly from the hash as a
// deterministic fallback, then prompt for a password.
export function SetPasswordForm() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState("");
  const [tenantName, setTenantName] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    async function init() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
        // Drop the tokens from the address bar / browser history.
        window.history.replaceState(null, "", window.location.pathname);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPhase("invalid");
        return;
      }
      setEmail(user.email ?? "");

      const { data: tenant } = await db.from("tenants").select("name").single(); // RLS: own tenant only
      setTenantName(tenant?.name ?? null);
      setPhase("ready");
    }

    init();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
      return;
    }

    // Mark the invite accepted (best effort — login already works regardless).
    await fetch("/api/auth/accept-invite", { method: "POST" }).catch(() => {});

    // Full navigation so middleware + server components see the fresh session.
    window.location.href = "/";
  }

  if (phase === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Completing sign-in…
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm space-y-3 text-center">
        <h1 className="text-lg font-semibold">This invite link is invalid or has expired</h1>
        <p className="text-sm text-muted-foreground">
          Invite links can only be used once. Ask the person who invited you to
          re-send the invitation, then use the link in the new email.
        </p>
        <a href="/login" className="inline-block text-sm font-medium text-primary hover:underline">
          Go to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold">Welcome to UltraQuote</h1>
        <p className="text-sm text-muted-foreground">
          You’ve been invited to <span className="font-medium text-foreground">{tenantName ?? "your team"}</span>.
          Set a password to finish creating your account.
        </p>
      </div>
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
            value={email}
            disabled
            className="w-full rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="At least 8 characters"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? "Setting up your account…" : "Set password & continue"}
        </button>
      </form>
    </div>
  );
}
