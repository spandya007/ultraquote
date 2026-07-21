"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Click-to-confirm landing for invite / password-reset / signup links.
//
// Why this exists: business email security gateways (Defender Safe Links,
// Mimecast, Proofpoint) PREFETCH links to scan them, which consumes the
// single-use token before the human clicks → "link invalid/expired".
// We move token consumption to an explicit button click: scanners GET this
// page but don't click, so the token survives. The actual verification
// (verifyOtp with token_hash) only runs on the user's click.
// See docs/invite-link-scanner-design.md.

type Phase = "ready" | "verifying" | "error";

// Where to send the user after a successful verify, by link type.
function destinationFor(type: string): string {
  if (type === "recovery") return "/auth/set-password?flow=recovery";
  if (type === "invite") return "/auth/set-password?flow=invite";
  return "/"; // signup / email confirmation → straight into the app
}

export function ConfirmForm() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTokenHash(params.get("token_hash"));
    setType(params.get("type"));
  }, []);

  async function confirm() {
    if (!tokenHash || !type) {
      setPhase("error");
      return;
    }
    setPhase("verifying");
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error) {
      setPhase("error");
      return;
    }
    // Full navigation so the server (middleware + RSC) sees the fresh session cookie.
    window.location.href = destinationFor(type);
  }

  const missingParams = phase === "ready" && (!tokenHash || !type);

  if (phase === "error" || missingParams) {
    return (
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm space-y-3 text-center">
        <h1 className="text-lg font-semibold">This link is invalid or has expired</h1>
        <p className="text-sm text-muted-foreground">
          Invite and password-reset links can only be used once and expire after a while. Request a new
          one and use the link in the latest email.
        </p>
        <div className="flex items-center justify-center gap-4">
          <a href="/auth/forgot-password" className="text-sm font-medium text-primary hover:underline">Reset password</a>
          <a href="/login" className="text-sm font-medium text-primary hover:underline">Go to sign in</a>
        </div>
      </div>
    );
  }

  const label =
    type === "recovery" ? "Continue to reset your password"
    : type === "invite" ? "Accept invitation"
    : "Confirm";

  return (
    <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm space-y-4 text-center">
      <h1 className="text-xl font-bold">SmartProps</h1>
      <p className="text-sm text-muted-foreground">
        Click below to continue securely.
      </p>
      <button
        onClick={confirm}
        disabled={phase === "verifying"}
        className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        {phase === "verifying" && <Loader2 className="w-4 h-4 animate-spin" />}
        {phase === "verifying" ? "Verifying…" : label}
      </button>
    </div>
  );
}
