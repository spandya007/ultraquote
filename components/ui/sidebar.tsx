"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  BookTemplate,
  Settings,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/",          label: "Dashboard",  icon: LayoutDashboard },
  { href: "/quotes",    label: "Quotes",     icon: FileText },
  { href: "/clients",   label: "Clients",    icon: Users },
  { href: "/products",  label: "Products",   icon: Package },
  { href: "/templates", label: "Templates",  icon: BookTemplate },
  { href: "/settings",  label: "Settings",   icon: Settings },
];

export function Sidebar({ brandName, logoUrl }: { brandName?: string; logoUrl?: string | null }) {
  const pathname = usePathname();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    // Full navigation so server state + middleware re-evaluate cleanly.
    window.location.href = "/login";
  }

  return (
    <aside className="w-60 shrink-0 border-r bg-card flex flex-col h-screen">
      <div className="px-6 py-5 border-b space-y-2">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="UltraQuote" className="w-7 h-7 rounded-md shrink-0" />
          <span className="text-xs font-semibold text-muted-foreground tracking-wide">
            UltraQuote Builder for
          </span>
        </div>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={brandName || "Company logo"} className="max-h-10 max-w-full object-contain" />
        ) : (
          <span className="block font-bold text-lg tracking-tight leading-tight">
            {brandName || "your company"}
          </span>
        )}
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t">
        <button
          onClick={() => setConfirmOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl border shadow-2xl w-full max-w-sm p-5">
            <h3 className="font-semibold">Sign out?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You’ll need to sign in again to access your quotes.
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
    </aside>
  );
}
