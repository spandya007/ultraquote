// Shared scenario color palette (hex), matching the 5 pastel slots used by the
// scenario tabs/tiles in quote-editor.tsx. Used by the inline pricing-table
// preview (proposal-editor.tsx) and the PDF/Preview serializer (lib/pdf) so a
// given scenario keeps the same color everywhere. Indexed by sort position.

export interface ScenarioColor {
  border:   string; // table + cell borders
  headBg:   string; // scenario title row background
  headText: string; // scenario title text
  footBg:   string; // totals (tfoot) background
  footText: string; // totals text
  accent:   string; // strong divider above the grand total
}

export const SCENARIO_HEX: ScenarioColor[] = [
  { border: "#bfdbfe", headBg: "#eff6ff", headText: "#1e40af", footBg: "#eff6ff", footText: "#1e40af", accent: "#93c5fd" }, // blue
  { border: "#ddd6fe", headBg: "#f5f3ff", headText: "#5b21b6", footBg: "#faf5ff", footText: "#5b21b6", accent: "#c4b5fd" }, // violet
  { border: "#a7f3d0", headBg: "#ecfdf5", headText: "#065f46", footBg: "#ecfdf5", footText: "#065f46", accent: "#6ee7b7" }, // emerald
  { border: "#fde68a", headBg: "#fffbeb", headText: "#92400e", footBg: "#fffbeb", footText: "#92400e", accent: "#fcd34d" }, // amber
  { border: "#fecdd3", headBg: "#fff1f2", headText: "#9f1239", footBg: "#fff1f2", footText: "#9f1239", accent: "#fda4af" }, // rose
];

export function scenarioColor(index: number): ScenarioColor {
  return SCENARIO_HEX[index % SCENARIO_HEX.length];
}
