"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Palette, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAccent } from "@/lib/theme/accent-provider";
import { ACCENTS } from "@/lib/theme/accents";

const MODES = [
  { id: "light",  label: "Light",  icon: Sun },
  { id: "dark",   label: "Dark",   icon: Moon },
  { id: "system", label: "Auto",   icon: Monitor },
] as const;

// Per-user appearance: light/dark/system (next-themes) + accent color
// (localStorage). Applies instantly — no Save button. Affects the app UI only;
// client-facing PDFs/proposals are always light + branded.
export function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []); // theme is unknown until mounted (SSR)

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b">
        <span className="text-muted-foreground"><Palette className="w-4 h-4" /></span>
        <h2 className="font-semibold text-base">Appearance</h2>
        <span className="text-xs text-muted-foreground">· just for you</span>
      </div>
      <div className="px-6 py-5 space-y-5">
        {/* Mode */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Theme</label>
          <div className="inline-flex rounded-md border overflow-hidden">
            {MODES.map((m, i) => {
              const active = mounted && theme === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setTheme(m.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-1.5 text-sm transition-colors",
                    i > 0 && "border-l",
                    active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                  )}
                >
                  <m.icon className="w-4 h-4" />
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Auto follows your device’s light/dark setting.</p>
        </div>

        {/* Accent */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Accent color</label>
          <div className="flex flex-wrap gap-3">
            {ACCENTS.map((a) => {
              const selected = accent === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setAccent(a.id)}
                  title={a.name}
                  aria-label={a.name}
                  aria-pressed={selected}
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110",
                    selected && "ring-2 ring-offset-2 ring-offset-background"
                  )}
                  style={{ backgroundColor: a.swatch, ...(selected ? { boxShadow: `0 0 0 2px var(--background), 0 0 0 4px ${a.swatch}` } : {}) }}
                >
                  {selected && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Recolors buttons, links, and highlights. Status badges and your proposals are unaffected.
          </p>
        </div>
      </div>
    </div>
  );
}
