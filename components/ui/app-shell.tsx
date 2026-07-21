"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

// App chrome: a full-width TopBar above a row of (Sidebar | main). Holds the
// mobile drawer open-state so the TopBar hamburger can open the Sidebar drawer.
export function AppShell({
  brandName,
  logoUrl,
  showAdmin,
  showOrg,
  userName,
  children,
}: {
  brandName?: string;
  logoUrl?: string | null;
  showAdmin?: boolean;
  showOrg?: boolean;
  userName?: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar
        brandName={brandName}
        logoUrl={logoUrl}
        userName={userName}
        onMenuClick={() => setMobileOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          showAdmin={showAdmin}
          showOrg={showOrg}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />
        <main className="flex-1 overflow-y-auto bg-muted/20">{children}</main>
      </div>
    </div>
  );
}
