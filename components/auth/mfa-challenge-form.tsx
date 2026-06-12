"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Shown at sign-in when the user has 2FA enabled (AAL1 → needs AAL2). They enter
// a TOTP code, or fall back to a recovery code (which disables 2FA so they can
// get in, then re-enable it in Settings).
export function MfaChallengeForm() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: { user: unknown | null } }) => {
      if (!data.user) { window.location.href = "/login"; return; }
      setReady(true);
    });
    // eslint-disable-next-line
  }, []);

  async function submitTotp() {
    setBusy(true); setError(null);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (!totp) { window.location.href = "/"; return; }
      const challenge = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: challenge.data.id, code: code.trim() });
      if (verify.error) throw verify.error;
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message || "That code didn’t verify — try again.");
      setBusy(false);
    }
  }

  async function submitRecovery() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/mfa/recovery/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Invalid recovery code"); setBusy(false); return; }
      await supabase.auth.refreshSession().catch(() => {});
      // 2FA is now disabled — land them in the app with a hint to re-enable.
      window.location.href = "/settings?mfa=recovered";
    } catch {
      setError("Something went wrong — try again.");
      setBusy(false);
    }
  }

  if (!ready) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
      {error && <div className="rounded-md bg-destructive/10 text-destructive text-sm px-4 py-3">{error}</div>}

      {mode === "totp" ? (
        <>
          <label className="text-sm font-medium">Authentication code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) submitTotp(); }}
            inputMode="numeric" placeholder="123456" autoFocus
            className="w-full rounded-md border bg-background px-3 py-2 text-lg tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button onClick={submitTotp} disabled={busy || code.length !== 6}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Verify
          </button>
          <button onClick={() => { setMode("recovery"); setCode(""); setError(null); }} className="block w-full text-center text-sm text-muted-foreground hover:text-foreground">
            Use a recovery code instead
          </button>
        </>
      ) : (
        <>
          <label className="text-sm font-medium">Recovery code</label>
          <p className="text-xs text-muted-foreground">Using a recovery code turns off 2FA so you can sign in. You can re-enable it in Settings.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter" && code.trim()) submitRecovery(); }}
            placeholder="XXXXX-XXXXX" autoFocus
            className="w-full rounded-md border bg-background px-3 py-2 text-sm tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button onClick={submitRecovery} disabled={busy || !code.trim()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Use recovery code
          </button>
          <button onClick={() => { setMode("totp"); setCode(""); setError(null); }} className="block w-full text-center text-sm text-muted-foreground hover:text-foreground">
            Back to authenticator code
          </button>
        </>
      )}
    </div>
  );
}
