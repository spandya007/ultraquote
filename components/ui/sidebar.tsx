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
  Building2,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { href: "/",          label: "Dashboard",  icon: LayoutDashboard },
  { href: "/proposals",    label: "Proposals",     icon: FileText },
  { href: "/clients",   label: "Clients",    icon: Users },
  { href: "/products",  label: "Products",   icon: Package },
  { href: "/templates", label: "Templates",  icon: BookTemplate },
  { href: "/settings",  label: "Settings",   icon: Settings },
  { href: "/help",      label: "Help",       icon: HelpCircle },
];

// Greeting based on the viewer's LOCAL time of day (computed client-side).
function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Sidebar({ brandName, logoUrl, showAdmin, showOrg, userName }: { brandName?: string; logoUrl?: string | null; showAdmin?: boolean; showOrg?: boolean; userName?: string }) {
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

  // Mobile: the sidebar becomes an off-canvas drawer with a hamburger top bar.
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  // Close the drawer on navigation.
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  // The icon-rail collapse is a desktop affordance only; the mobile drawer
  // always shows the full (expanded) layout.
  const rail = collapsed && !isMobile;

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
        title={rail ? label : undefined}
        className={cn(
          "flex items-center rounded-md text-sm font-medium transition-colors",
          rail ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {!rail && label}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile top bar with hamburger (hidden on md+) */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 z-30 flex items-center gap-3 px-4 border-b bg-card">
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="p-1.5 rounded hover:bg-muted text-muted-foreground">
          <Menu className="w-5 h-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="SmartProps" className="w-7 h-7 rounded-md" />
        <span className="font-semibold truncate">{brandName || "SmartProps"}</span>
      </div>

      {/* Backdrop when the mobile drawer is open */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn(
          "border-r bg-card flex flex-col h-screen z-50 shrink-0 transition-[width,transform] duration-200",
          "fixed inset-y-0 left-0 md:static md:z-auto md:translate-x-0",
          rail ? "w-16" : "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
      {rail ? (
        <div className="px-2 py-3 border-b flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="SmartProps" className="w-8 h-8 rounded-md" />
          <button onClick={toggleCollapsed} title="Expand sidebar" className="p-1 rounded hover:bg-muted text-muted-foreground">
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="px-6 py-5 border-b space-y-2">
          <div className="flex items-center justify-between gap-2">
            {userName ? (
              <div className="text-sm font-medium truncate">
                {mounted ? `${timeGreeting()}, ` : ""}{userName}
              </div>
            ) : <span />}
            {isMobile ? (
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0">
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={toggleCollapsed} title="Collapse sidebar" className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0">
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="SmartProps" className="w-7 h-7 rounded-md shrink-0" />
            <span className="text-xs font-semibold text-muted-foreground tracking-wide">
              SmartProps for
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
        {showOrg && navLink("/org", "Organization", Building2)}
        {showAdmin && navLink("/admin", "Platform Admin", ShieldCheck)}
      </nav>

      <div className="px-3 py-3 border-t space-y-1">
        {/* Dark-mode quick toggle (full picker is in Settings → Appearance) */}
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          title={rail ? "Toggle dark mode" : undefined}
          className={cn(
            "w-full flex items-center rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
            rail ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
          )}
        >
          {mounted && resolvedTheme === "dark"
            ? <Sun className="w-4 h-4 shrink-0" />
            : <Moon className="w-4 h-4 shrink-0" />}
          {!rail && (mounted && resolvedTheme === "dark" ? "Light mode" : "Dark mode")}
        </button>
        <button
          onClick={() => setConfirmOpen(true)}
          title={rail ? "Sign out" : undefined}
          className={cn(
            "w-full flex items-center rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
            rail ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!rail && "Sign out"}
        </button>
      </div>

    </aside>

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
    </>
  );
}
