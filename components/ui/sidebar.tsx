"use client";

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

  return (
    <aside className="w-60 shrink-0 border-r bg-card flex flex-col h-screen">
      <div className="px-6 py-5 border-b space-y-2">
        <span className="block text-xs font-semibold text-muted-foreground tracking-wide">
          UltraQuote Builder for
        </span>
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
    </aside>
  );
}
