"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, X, Rocket, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Steps { logo: boolean; products: boolean; clients: boolean; quotes: boolean }

// Dismissible "finish setting up" card on the dashboard — owner-focused, driven
// by real data. Auto-hides once every step is done; dismiss persists locally.
export function OnboardingChecklist({ isOwner, steps }: { isOwner: boolean; steps: Steps }) {
  const [dismissed, setDismissed] = useState(true); // hidden until we read localStorage
  useEffect(() => { setDismissed(localStorage.getItem("smartprops.onboardingDismissed") === "true"); }, []);

  if (!isOwner) return null;

  const items = [
    { label: "Add your company logo", href: "/settings", done: steps.logo },
    { label: "Add your products", href: "/products", done: steps.products },
    { label: "Add a client", href: "/clients", done: steps.clients },
    { label: "Create your first quote", href: "/quotes", done: steps.quotes },
  ];
  const doneCount = items.filter(i => i.done).length;
  if (doneCount === items.length) return null;  // all set
  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem("smartprops.onboardingDismissed", "true");
    setDismissed(true);
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Finish setting up</h2>
          <span className="text-xs text-muted-foreground">{doneCount} of {items.length} done</span>
        </div>
        <button onClick={dismiss} title="Dismiss" aria-label="Dismiss" className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-3 space-y-1">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
              it.done ? "text-muted-foreground cursor-default" : "hover:bg-muted"
            )}
          >
            <span className={cn(
              "flex items-center justify-center w-5 h-5 rounded-full border shrink-0",
              it.done ? "bg-green-500 border-green-500 text-white" : "border-muted-foreground/40"
            )}>
              {it.done && <Check className="w-3 h-3" />}
            </span>
            <span className={cn(it.done && "line-through")}>{it.label}</span>
            {!it.done && <ArrowRight className="w-3.5 h-3.5 ml-auto text-muted-foreground" />}
          </Link>
        ))}
      </div>
    </section>
  );
}
