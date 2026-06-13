"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, Loader2, Copy, Download, Check, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

type View = "loading" | "off" | "enrolling" | "codes" | "on";

// Settings → Security: per-user, optional TOTP 2FA. Enroll shows a QR (issuer
// "UltraQuote Builder") → verify a code → recovery codes shown ONCE.
export function MfaCard() {
  const toast = useToast();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;

  const [view, setView] = useState<View>("loading");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // enrolling state
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // recovery codes (shown once)
  const [codes, setCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  async function refreshState() {
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = (data?.totp ?? []).some((f: { status: string }) => f.status === "verified");
    if (verified) {
      setView("on");
      fetch("/api/mfa/recovery-codes").then(r => r.json()).then(d => setRemaining(d.remaining ?? 0)).catch(() => {});
    } else {
      setView("off");
    }
  }

  useEffect(() => { refreshState(); /* eslint-disable-next-line */ }, []);

  async function startEnroll() {
    setBusy(true); setError(null);
    try {
      // On localhost (the dev project) suffix the issuer so the dev and prod
      // authenticator entries are distinguishable; prod stays "UltraQuote Builder".
      const isDev = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
      const issuer = isDev ? "UltraQuote Builder (Dev)" : "UltraQuote Builder";
      const { data, error: e } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer,
        friendlyName: `UltraQuote (${new Date().toISOString()})`,
      });
      if (e) throw e;
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setCode("");
      setView("enrolling");
    } catch (err) {
      toast.error((err as Error).message || "Couldn’t start 2FA setup");
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnroll() {
    setBusy(true); setError(null);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: code.trim() });
      if (verify.error) throw verify.error;
      // Generate recovery codes now that the factor is active.
      const res = await fetch("/api/mfa/recovery-codes", { method: "POST" });
      const json = await res.json();
      setCodes(json.codes ?? []);
      setView("codes");
    } catch (err) {
      setError((err as Error).message || "That code didn’t verify — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnroll() {
    if (factorId) { try { await supabase.auth.mfa.unenroll({ factorId }); } catch {} }
    setView("off");
  }

  async function disable() {
    if (!window.confirm("Turn off two-factor authentication for your account?")) return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of (data?.totp ?? [])) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      await fetch("/api/mfa/recovery-codes", { method: "DELETE" });
      toast.success("Two-factor authentication disabled");
      setRemaining(null);
      setView("off");
    } catch (err) {
      toast.error((err as Error).message || "Couldn’t disable 2FA");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!window.confirm("Generate a new set of recovery codes? Your old codes stop working.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/mfa/recovery-codes", { method: "POST" });
      const json = await res.json();
      setCodes(json.codes ?? []);
      setView("codes");
    } finally {
      setBusy(false);
    }
  }

  function copyCodes() {
    navigator.clipboard.writeText(codes.join("\n")).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }
  function downloadCodes() {
    const blob = new Blob([`UltraQuote Builder — two-factor recovery codes\nKeep these somewhere safe. Each code works once.\n\n${codes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "ultraquote-recovery-codes.txt";
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b">
        <span className="text-muted-foreground"><ShieldCheck className="w-4 h-4" /></span>
        <h2 className="font-semibold text-base">Two-Factor Authentication</h2>
        {view === "on" && <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300">On</span>}
      </div>
      <div className="px-6 py-5 space-y-4 max-w-md">
        {view === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        )}

        {view === "off" && (
          <>
            <p className="text-sm text-muted-foreground">
              Add a second step at sign-in using an authenticator app (Google Authenticator, Authy, 1Password…). Optional, but recommended.
            </p>
            <button onClick={startEnroll} disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Enable two-factor authentication
            </button>
          </>
        )}

        {view === "enrolling" && (
          <>
            <p className="text-sm">1. Scan this QR code in your authenticator app (it’ll appear as <span className="font-medium">UltraQuote Builder</span>):</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="2FA QR code" className="w-44 h-44 rounded-md border bg-white p-1" />
            <p className="text-xs text-muted-foreground">Can’t scan? Enter this key manually:</p>
            <code className="block text-xs bg-muted rounded px-2 py-1.5 break-all">{secret}</code>
            <p className="text-sm">2. Enter the 6-digit code from the app:</p>
            {error && <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric" placeholder="123456" autoFocus
              className="w-40 rounded-md border bg-background px-3 py-2 text-sm tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <button onClick={verifyEnroll} disabled={busy || code.length !== 6}
                className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Verify & enable
              </button>
              <button onClick={cancelEnroll} disabled={busy} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">Cancel</button>
            </div>
          </>
        )}

        {view === "codes" && (
          <>
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300 px-3 py-2 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Save these recovery codes now — they’re shown <strong>only once</strong>. Each works a single time to get back in if you lose your device.</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm bg-muted rounded-md p-3">
              {codes.map((c) => <span key={c}>{c}</span>)}
            </div>
            <div className="flex gap-2">
              <button onClick={copyCodes} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />} {copied ? "Copied" : "Copy"}
              </button>
              <button onClick={downloadCodes} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                <Download className="w-4 h-4" /> Download
              </button>
            </div>
            <button onClick={() => { setCodes([]); refreshState(); }}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">
              I’ve saved my codes
            </button>
          </>
        )}

        {view === "on" && (
          <>
            <p className="text-sm text-muted-foreground">
              Two-factor authentication is on. You’ll enter a code from your authenticator app each time you sign in.
              {remaining != null && <> {remaining} recovery code{remaining === 1 ? "" : "s"} remaining.</>}
            </p>
            <div className="flex gap-2">
              <button onClick={regenerate} disabled={busy} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
                Regenerate recovery codes
              </button>
              <button onClick={disable} disabled={busy}
                className="inline-flex items-center gap-2 rounded-md border border-destructive/40 text-destructive px-4 py-2 text-sm font-medium hover:bg-destructive/10 disabled:opacity-50">
                <ShieldOff className="w-4 h-4" /> Disable
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
