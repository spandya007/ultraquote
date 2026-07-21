"use client";

import { useMemo, useState } from "react";
import { Search, HelpCircle } from "lucide-react";
import { HELP_TOPICS, type HelpSection } from "@/lib/help/content";

function sectionMatches(s: HelpSection, q: string): boolean {
  if (!q) return true;
  const hay = [s.heading, ...s.blocks.flatMap(b => b.text ? [b.text] : (b.items ?? []))].join(" ").toLowerCase();
  return hay.includes(q);
}

export function HelpClient() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Topics with their matching sections (whole topic hidden if nothing matches).
  const filtered = useMemo(() => {
    return HELP_TOPICS
      .map(t => ({ ...t, sections: t.sections.filter(s => sectionMatches(s, q)) }))
      .filter(t => t.sections.length > 0);
  }, [q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><HelpCircle className="w-6 h-6 text-muted-foreground" /> Help</h1>
        <p className="text-muted-foreground text-sm mt-1">How to get the most out of SmartProps.</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help…"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex gap-8">
        {/* TOC (jump links) */}
        <nav className="hidden md:block w-48 shrink-0 sticky top-6 self-start space-y-1">
          {filtered.map(t => (
            <a key={t.id} href={`#${t.id}`}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <t.icon className="w-4 h-4 shrink-0" /> {t.title}
            </a>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-10">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No help articles match “{query}”.</p>
          )}
          {filtered.map(t => (
            <section key={t.id} id={t.id} className="scroll-mt-6 space-y-5">
              <h2 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
                <t.icon className="w-5 h-5 text-muted-foreground" /> {t.title}
              </h2>
              {t.sections.map((s, i) => (
                <div key={i} className="space-y-2">
                  <h3 className="font-medium text-sm flex items-center gap-2">
                    {s.heading}
                    {s.ownerOnly && (
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300">
                        Owner only
                      </span>
                    )}
                  </h3>
                  {s.blocks.map((b, j) =>
                    b.type === "p" ? (
                      <p key={j} className="text-sm text-muted-foreground leading-relaxed">{b.text}</p>
                    ) : (
                      <ul key={j} className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                        {(b.items ?? []).map((it, k) => <li key={k}>{it}</li>)}
                      </ul>
                    )
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
