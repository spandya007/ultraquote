"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Standalone sign-out button for the access block pages (suspended/disabled),
// which live outside the dashboard shell and so don't have the sidebar's.
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await createClient().auth.signOut();
    } catch {
      /* ignore */
    }
    router.push("/login");
  }

  return (
    <button
      onClick={signOut}
      disabled={busy}
      className={
        className ??
        "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      }
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
