"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ACCENT_STORAGE_KEY, DEFAULT_ACCENT, isAccentId, type AccentId } from "./accents";

// Per-user accent, persisted in localStorage and applied as html[data-accent].
// A no-FOUC inline script in app/layout.tsx sets the attribute before paint;
// this provider keeps React state in sync and writes changes.
const AccentContext = createContext<{ accent: AccentId; setAccent: (a: AccentId) => void }>({
  accent: DEFAULT_ACCENT,
  setAccent: () => {},
});

export function useAccent() {
  return useContext(AccentContext);
}

export function AccentProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentId>(DEFAULT_ACCENT);

  useEffect(() => {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    const next = isAccentId(stored) ? stored : DEFAULT_ACCENT;
    setAccentState(next);
    document.documentElement.dataset.accent = next;
  }, []);

  function setAccent(a: AccentId) {
    setAccentState(a);
    try { localStorage.setItem(ACCENT_STORAGE_KEY, a); } catch {}
    document.documentElement.dataset.accent = a;
  }

  return <AccentContext.Provider value={{ accent, setAccent }}>{children}</AccentContext.Provider>;
}
