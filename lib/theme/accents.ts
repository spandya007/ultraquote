// Accent themes (Gmail-style). Each overrides --primary/--ring in globals.css
// via html[data-accent="..."]; "default" uses the base blue tokens (no override).
// `swatch` is only the picker dot color in the Appearance card.

export const ACCENTS = [
  { id: "default",  name: "Default",  swatch: "#16a34a" },
  { id: "violet",   name: "Violet",   swatch: "#7c3aed" },
  { id: "forest",   name: "Forest",   swatch: "#16a34a" },
  { id: "sunset",   name: "Sunset",   swatch: "#d97706" },
  { id: "rose",     name: "Rose",     swatch: "#e11d48" },
  { id: "graphite", name: "Graphite", swatch: "#475569" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

export const ACCENT_STORAGE_KEY = "smartprops.accent";
export const DEFAULT_ACCENT: AccentId = "default";

export function isAccentId(v: string | null | undefined): v is AccentId {
  return !!v && ACCENTS.some((a) => a.id === v);
}
