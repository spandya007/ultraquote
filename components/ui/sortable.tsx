"use client";

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// Lightweight client-side table sorting shared by the Quotes and Products tables.
// `getValue(row, key)` returns the comparable value for a column key; empties
// (null/undefined/"") always sort to the end regardless of direction.

export type SortDir = "asc" | "desc";
export interface SortState { key: string; dir: SortDir }
type Cmp = string | number | boolean | null | undefined;

export function useSort<T>(
  rows: T[],
  getValue: (row: T, key: string) => Cmp,
  initial: SortState | null = null,
) {
  const [sort, setSort] = useState<SortState | null>(initial);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const { key, dir } = sort;
    return [...rows].sort((a, b) => {
      const va = getValue(a, key);
      const vb = getValue(b, key);
      const aEmpty = va === null || va === undefined || va === "";
      const bEmpty = vb === null || vb === undefined || vb === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;   // empties last
      if (bEmpty) return -1;
      let c: number;
      if (typeof va === "number" && typeof vb === "number") c = va - vb;
      else if (typeof va === "boolean" && typeof vb === "boolean") c = va === vb ? 0 : va ? -1 : 1;
      else c = String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
      return dir === "asc" ? c : -c;
    });
  }, [rows, sort, getValue]);

  // Click a column: sort asc, then toggle to desc on repeat.
  function toggle(key: string) {
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }

  return { sorted, sort, toggle };
}

export function SortHeader({
  label, col, sort, onSort, align = "left", className, title,
}: {
  label: string;
  col: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  align?: "left" | "right" | "center";
  className?: string;
  title?: string;
}) {
  const active = sort?.key === col;
  const Icon = active ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className={cn(
        "px-4 py-3 font-medium text-muted-foreground select-none",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
      title={title}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon className={cn("w-3.5 h-3.5 shrink-0", active ? "opacity-100" : "opacity-30")} />
      </button>
    </th>
  );
}
