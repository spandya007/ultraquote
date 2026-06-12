"use client";

import { ThemeProvider } from "next-themes";
import { ToastProvider } from "@/components/ui/toast";
import { AccentProvider } from "@/lib/theme/accent-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AccentProvider>
        <ToastProvider>{children}</ToastProvider>
      </AccentProvider>
    </ThemeProvider>
  );
}
