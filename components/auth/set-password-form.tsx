"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { validatePassword } from "@/lib/auth/password";
import { PasswordRequirements } from "@/components/auth/password-requirements";

type Phase = "loading" | "invalid" | "ready";

// Invite AND password-recovery links land here with session tokens in the URL
// hash (implicit flow); the hash `type` is `invite` or `recovery`.
// createBrowserClient's detectSessionInUrl usually consumes them on first
// client construction; we also set the session explicitly from the hash as a
// deterministic fallback, then prompt for a (new) password.
export function SetPasswordForm() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [isRecovery, setIsRecovery] = useState(false);
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
      const search = new URLSearchParams(window.location.search);
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      // Recovery is signalled either by the old implicit-flow hash (`type`) or
      // by the new click-to-confirm flow's `?flow=recovery` query param (set by
      // /auth/confirm after verifyOtp). See docs/invite-link-scanner-design.md.
      const recovery = hash.get("type") === "recovery" || search.get("flow") === "recovery";
      setIsRecovery(recovery);
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

    const pwError = validatePassword(password, email);
    if (pwError) {
      setError(pwError);
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

    // Invite acceptance only — recovery users are already members.
    if (!isRecovery) {
      await fetch("/api/auth/accept-invite", { method: "POST" }).catch(() => {});
    }

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
        <h1 className="text-lg font-semibold">This link is invalid or has expired</h1>
        <p className="text-sm text-muted-foreground">
          Password reset and invite links can only be used once and expire after
          a while. Request a new one and use the link in the latest email.
        </p>
        <div className="flex items-center justify-center gap-4">
          <a href="/auth/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Reset password
          </a>
          <a href="/login" className="text-sm font-medium text-primary hover:underline">
            Go to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold">{isRecovery ? "Choose a new password" : "Welcome to UltraQuote"}</h1>
        <p className="text-sm text-muted-foreground">
          {isRecovery ? (
            <>Enter a new password for <span className="font-medium text-foreground">{email}</span>.</>
          ) : (
            <>You’ve been invited to <span className="font-medium text-foreground">{tenantName ?? "your team"}</span>.
              Set a password to finish creating your account.</>
          )}
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
            placeholder="At least 12 characters"
          />
          <PasswordRequirements password={password} email={email} />
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
          {saving
            ? (isRecovery ? "Updating password…" : "Setting up your account…")
            : (isRecovery ? "Update password" : "Set password & continue")}
        </button>
      </form>
    </div>
  );
}
