"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpCircle } from "lucide-react";

// Floating "?" that deep-links to the Help topic for the current page. Hidden on
// the Help page itself and on the (dense, already tooltip-rich) quote editor.
function topicFor(path: string): string | null {
  if (path.startsWith("/help")) return null;
  if (/^\/quotes\/[^/]+/.test(path)) return null; // quote editor
  if (path.startsWith("/quotes")) return "quotes";
  if (path.startsWith("/clients")) return "clients";
  if (path.startsWith("/products")) return "products";
  if (path.startsWith("/templates")) return "document";
  if (path.startsWith("/settings")) return "security";
  return "getting-started";
}

export function ContextualHelp() {
  const topic = topicFor(usePathname());
  if (!topic) return null;
  return (
    <Link
      href={`/help#${topic}`}
      title="Help for this page"
      aria-label="Help for this page"
      className="fixed bottom-4 right-4 z-40 flex items-center justify-center w-10 h-10 rounded-full border bg-card text-muted-foreground shadow-lg hover:text-foreground hover:bg-muted transition-colors"
    >
      <HelpCircle className="w-5 h-5" />
    </Link>
  );
}
