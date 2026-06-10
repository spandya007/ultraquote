"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function SetPasswordForm({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
  );
}
