"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { validatePassword } from "@/lib/auth/password";
import { PasswordRequirements } from "@/components/auth/password-requirements";

// In-app password change for the logged-in user — no email round-trip
// (supabase.auth.updateUser). Available to every user (own account).
export function ChangePasswordCard() {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | undefined>(undefined);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? undefined));
  }, []);

  async function save() {
    setError(null);
    const pwError = validatePassword(password, email);
    if (pwError) { setError(pwError); return; }
    if (password !== confirm) { setError("Passwords don’t match."); return; }

    setSaving(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setPassword(""); setConfirm("");
    toast.success("Password updated");
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b">
        <span className="text-muted-foreground"><KeyRound className="w-4 h-4" /></span>
        <h2 className="font-semibold text-base">Change Password</h2>
      </div>
      <div className="px-6 py-5 space-y-4 max-w-sm">
        {error && (
          <div className="rounded-md bg-destructive/10 text-destructive text-sm px-4 py-3">{error}</div>
        )}
        <div className="space-y-1">
          <label className="text-sm font-medium">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 12 characters"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <PasswordRequirements password={password} email={email} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving || !password || !confirm}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Updating…" : "Update password"}
          </button>
        </div>
      </div>
    </div>
  );
}
