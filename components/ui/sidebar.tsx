"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
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
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";

const navItems = [
  { href: "/",          label: "Dashboard",  icon: LayoutDashboard },
  { href: "/proposals", label: "Proposals",  icon: FileText },
  { href: "/clients",   label: "Clients",    icon: Users },
  { href: "/products",  label: "Products",   icon: Package },
  { href: "/templates", label: "Templates",  icon: BookTemplate },
  { href: "/settings",  label: "Settings",   icon: Settings },
  { href: "/help",      label: "Help",       icon: HelpCircle },
];

// Left navigation rail. Brand/user/theme now live in the TopBar; this is nav
// only. Mobile drawer open-state is owned by AppShell (shared with the TopBar
// hamburger) and passed in.
export function Sidebar({
  showAdmin,
  showOrg,
  mobileOpen,
  setMobileOpen,
}: {
  showAdmin?: boolean;
  showOrg?: boolean;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}) {
  const pathname = usePathname();

  // Collapsible icon rail (persisted) — frees horizontal room on laptops.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar.collapsed") === "true");
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("sidebar.collapsed", String(next));
      return next;
    });
  }

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  // Close the drawer on navigation.
  useEffect(() => { setMobileOpen(false); }, [pathname, setMobileOpen]);
  // The icon-rail collapse is a desktop affordance only.
  const rail = collapsed && !isMobile;

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
      {/* Backdrop when the mobile drawer is open */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn(
          "border-r bg-card flex flex-col z-50 shrink-0 transition-[width,transform] duration-200",
          "fixed inset-y-0 left-0 md:static md:z-auto md:translate-x-0",
          rail ? "w-16" : "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Slim header: collapse toggle (desktop) / close (mobile) */}
        <div className={cn("flex items-center px-3 py-2 border-b", rail && "justify-center")}>
          {isMobile ? (
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          ) : rail ? (
            <button
              onClick={toggleCollapsed}
              title="Expand sidebar"
              className="p-1 rounded hover:bg-muted text-muted-foreground"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={toggleCollapsed}
              title="Collapse sidebar"
              className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon }) => navLink(href, label, icon))}
          {showOrg && navLink("/org", "Organization", Building2)}
          {showAdmin && navLink("/admin", "Platform Admin", ShieldCheck)}
        </nav>
      </aside>
    </>
  );
}
