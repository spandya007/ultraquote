"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  BookTemplate,
  Settings,
  HelpCircle,
  ShieldCheck,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
} from "lucide-react";

const navItems = [
  { href: "/",          label: "Dashboard",  icon: LayoutDashboard },
  { href: "/quotes",    label: "Quotes",     icon: FileText },
  { href: "/clients",   label: "Clients",    icon: Users },
  { href: "/products",  label: "Products",   icon: Package },
  { href: "/templates", label: "Templates",  icon: BookTemplate },
  { href: "/settings",  label: "Settings",   icon: Settings },
  { href: "/help",      label: "Help",       icon: HelpCircle },
];

export function Sidebar({ brandName, logoUrl, showAdmin, userName }: { brandName?: string; logoUrl?: string | null; showAdmin?: boolean; userName?: string }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Collapsible nav rail (persisted) — frees horizontal room on laptops.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar.collapsed") === "true");
  }, []);
  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c;
      localStorage.setItem("sidebar.collapsed", String(next));
      return next;
    });
  }

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    // Full navigation so server state + middleware re-evaluate cleanly.
    window.location.href = "/login";
  }

  const navLink = (href: string, label: string, Icon: typeof LayoutDashboard) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        title={collapsed ? label : undefined}
        className={cn(
          "flex items-center rounded-md text-sm font-medium transition-colors",
          collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {!collapsed && label}
      </Link>
    );
  };

  return (
    <aside className={cn("shrink-0 border-r bg-card flex flex-col h-screen transition-[width] duration-200", collapsed ? "w-16" : "w-60")}>
      {collapsed ? (
        <div className="px-2 py-3 border-b flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="UltraQuote" className="w-8 h-8 rounded-md" />
          <button onClick={toggleCollapsed} title="Expand sidebar" className="p-1 rounded hover:bg-muted text-muted-foreground">
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="px-6 py-5 border-b space-y-2">
          <div className="flex items-center justify-between gap-2">
            {userName ? (
              <div className="text-sm font-medium truncate">
                Hello, {userName} <span aria-hidden>👋</span>
              </div>
            ) : <span />}
            <button onClick={toggleCollapsed} title="Collapse sidebar" className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0">
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
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
      )}

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon }) => navLink(href, label, icon))}
        {showAdmin && navLink("/admin", "Platform Admin", ShieldCheck)}
      </nav>

      <div className="px-3 py-3 border-t space-y-1">
        {/* Dark-mode quick toggle (full picker is in Settings → Appearance) */}
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          title={collapsed ? "Toggle dark mode" : undefined}
          className={cn(
            "w-full flex items-center rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
            collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
          )}
        >
          {mounted && resolvedTheme === "dark"
            ? <Sun className="w-4 h-4 shrink-0" />
            : <Moon className="w-4 h-4 shrink-0" />}
          {!collapsed && (mounted && resolvedTheme === "dark" ? "Light mode" : "Dark mode")}
        </button>
        <button
          onClick={() => setConfirmOpen(true)}
          title={collapsed ? "Sign out" : undefined}
          className={cn(
            "w-full flex items-center rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
            collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && "Sign out"}
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
