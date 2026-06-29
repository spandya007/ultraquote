"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

// Light/dark toggle for the console layouts (/admin, /org), which don't render
// the dashboard Sidebar (where the usual quick-toggle lives). The ThemeProvider
// is mounted at the app root, so useTheme works here too. The `mounted` guard
// avoids a hydration mismatch (server can't know the resolved theme).
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={className ?? "flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}
