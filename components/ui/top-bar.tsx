"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { Menu, Sun, Moon, LogOut, ChevronDown } from "lucide-react";

// Full-width brand bar: SmartProps wordmark (left) + tenant / theme / account
// (right). Owns the theme quick-toggle and sign-out (moved here from the
// sidebar). The mobile hamburger opens the sidebar drawer via onMenuClick.
export function TopBar({
  brandName,
  logoUrl,
  userName,
  onMenuClick,
}: {
  brandName?: string;
  logoUrl?: string | null;
  userName?: string;
  onMenuClick: () => void;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    // Full navigation so server state + middleware re-evaluate cleanly.
    window.location.href = "/login";
  }

  return (
    <header className="h-14 shrink-0 border-b bg-card flex items-center justify-between px-3 sm:px-4 z-40">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="md:hidden p-1.5 rounded hover:bg-muted text-muted-foreground"
        >
          <Menu className="w-5 h-5" />
        </button>
        {/* Theme-aware wordmark: dark-text logo on the light bar, light-text
            variant on the dark bar. CSS swap (dark: variant) → no hydration flash. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="SmartProps" className="h-8 sm:h-10 w-auto block dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-dark.svg" alt="SmartProps" className="h-8 sm:h-10 w-auto hidden dark:block" />
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={brandName || "Company"}
            className="hidden sm:block max-h-8 max-w-[120px] object-contain"
          />
        ) : brandName ? (
          <span className="hidden sm:inline text-sm text-muted-foreground truncate max-w-[180px]">
            {brandName}
          </span>
        ) : null}

        {/* Dark-mode quick toggle (full picker is in Settings → Appearance) */}
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          title="Toggle dark mode"
          className="p-2 rounded-md hover:bg-muted text-muted-foreground"
        >
          {mounted && resolvedTheme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Account menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <span className="truncate max-w-[100px] sm:max-w-[140px]">{userName || "Account"}</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-1 w-44 rounded-md border bg-card shadow-lg z-50 py-1">
                <button
                  onClick={() => { setMenuOpen(false); setConfirmOpen(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground text-left"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl border shadow-2xl w-full max-w-sm p-5">
            <h3 className="font-semibold">Sign out?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You’ll need to sign in again to access your proposals.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={signingOut}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={signOut}
                disabled={signingOut}
                className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
