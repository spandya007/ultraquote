"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { validatePassword } from "@/lib/auth/password";
import { PasswordRequirements } from "@/components/auth/password-requirements";

// Public self-serve signup form (/signup). Posts to /api/auth/signup, which
// creates the account + a standalone tenant and sends a confirmation email.
export function SignupForm() {
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const pwError = validatePassword(password, email);
    if (pwError) { setError(pwError); return; }
    if (password !== confirm) { setError("Passwords don’t match."); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, company, email, password, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Something went wrong. Please try again."); setSaving(false); return; }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm space-y-3 text-center">
        <h1 className="text-lg font-semibold">Check your email 🎉</h1>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
          Click it to verify your address, then sign in to your new workspace.
        </p>
        <a href="/login" className="inline-block text-sm font-medium text-primary hover:underline">Go to sign in</a>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold">Create your SmartProps workspace</h1>
        <p className="text-sm text-muted-foreground">Start building proposals in minutes.</p>
      </div>
      <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 text-destructive text-sm px-4 py-3">{error}</div>
        )}
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="fullName">Your name</label>
          <input id="fullName" type="text" required autoComplete="name" autoFocus value={fullName}
            onChange={(e) => setFullName(e.target.value)} maxLength={120}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Jordan Lee" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="company">Company name</label>
          <input id="company" type="text" required autoComplete="organization" value={company}
            onChange={(e) => setCompany(e.target.value)} maxLength={120}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Acme IT Services" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="email">Work email</label>
          <input id="email" type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="jordan@acme.com" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="password">Password</label>
          <input id="password" type="password" required autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="At least 12 characters" />
          <PasswordRequirements password={password} email={email} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="confirm">Confirm password</label>
          <input id="confirm" type="password" required autoComplete="new-password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="••••••••" />
        </div>
        {/* Honeypot — hidden from users, catches bots. */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website}
          onChange={(e) => setWebsite(e.target.value)}
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }} />
        <button type="submit" disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? "Creating your workspace…" : "Create workspace"}
        </button>
        <p className="text-center text-xs text-muted-foreground">
          Already have an account? <a href="/login" className="font-medium text-primary hover:underline">Sign in</a>
        </p>
      </form>
    </div>
  );
}
