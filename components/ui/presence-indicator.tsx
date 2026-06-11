"use client";

import { Users } from "lucide-react";
import type { PresenceUser } from "@/lib/realtime/use-presence";

// "Sales Team is also editing" chip — shown in editor headers when teammates
// have the same quote/template open (Supabase Realtime presence).
export function PresenceIndicator({ others, noun }: { others: PresenceUser[]; noun: string }) {
  if (others.length === 0) return null;

  const names =
    others.length === 1
      ? others[0].name
      : others.length === 2
      ? `${others[0].name} and ${others[1].name}`
      : `${others[0].name} and ${others.length - 1} others`;

  return (
    <span
      title={`Also viewing this ${noun} right now: ${others.map(o => o.name).join(", ")}. Edits save last-write-wins — coordinate to avoid overwriting each other.`}
      className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 text-xs font-medium cursor-help"
    >
      <Users className="w-3.5 h-3.5" />
      {names} {others.length === 1 ? "is" : "are"} also in this {noun}
    </span>
  );
}
