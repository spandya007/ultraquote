"use client";

import { useState } from "react";
import { Loader2, ToggleLeft } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { PLANS, FEATURES, type PlanKey, type FeatureKey } from "@/lib/billing/features";
import type { EntitlementMatrix } from "@/lib/billing/entitlements";

// Platform Admin: the feature×plan entitlements matrix. Rows = features (code
// registry), columns = plans. Toggling a cell PATCHes plan_features.
// See docs/integrations-phase-a-plan.md (A1).
export function FeatureEntitlementsCard({ matrix }: { matrix: EntitlementMatrix }) {
  const toast = useToast();
  // Local editable copy so toggles reflect instantly (optimistic).
  const [grid, setGrid] = useState<EntitlementMatrix>(matrix);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const isOn = (plan: string, feature: string) => Boolean(grid[plan]?.[feature]);

  async function toggle(plan: PlanKey, feature: FeatureKey) {
    const cellId = `${plan}:${feature}`;
    const next = !isOn(plan, feature);
    setSavingCell(cellId);
    // Optimistic update.
    setGrid((g) => ({ ...g, [plan]: { ...(g[plan] ?? {}), [feature]: next } }));
    try {
      const res = await fetch(`/api/admin/feature-entitlements`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, feature_key: feature, enabled: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Roll back on failure.
        setGrid((g) => ({ ...g, [plan]: { ...(g[plan] ?? {}), [feature]: !next } }));
        toast.error(json.error || "Failed to update");
        return;
      }
      toast.success(`${featureLabel(feature)} ${next ? "enabled" : "disabled"} for ${planLabelOf(plan)}`);
    } catch {
      setGrid((g) => ({ ...g, [plan]: { ...(g[plan] ?? {}), [feature]: !next } }));
      toast.error("Failed to update");
    } finally {
      setSavingCell(null);
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b">
        <ToggleLeft className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-base">Feature availability by plan</h2>
      </div>
      <div className="px-6 py-5">
        <p className="text-sm text-muted-foreground mb-4">
          Controls which subscription plans unlock each feature. Set a tenant&apos;s plan from the
          Tenants table (Manage). Changes take effect immediately.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="px-3 py-2.5 font-medium">Feature</th>
                {PLANS.map((p) => (
                  <th key={p.key} className="px-3 py-2.5 font-medium text-center whitespace-nowrap">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.key} className="border-b last:border-0">
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium">{f.label}</div>
                    <div className="text-xs text-muted-foreground max-w-xs">{f.description}</div>
                  </td>
                  {PLANS.map((p) => {
                    const cellId = `${p.key}:${f.key}`;
                    const on = isOn(p.key, f.key);
                    return (
                      <td key={p.key} className="px-3 py-3 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${f.label} for ${p.label}`}
                          disabled={savingCell === cellId}
                          onClick={() => toggle(p.key, f.key)}
                          className={
                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 " +
                            (on ? "bg-primary" : "bg-muted-foreground/30")
                          }
                        >
                          {savingCell === cellId ? (
                            <Loader2 className="w-3 h-3 animate-spin mx-auto text-white" />
                          ) : (
                            <span
                              className={
                                "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform " +
                                (on ? "translate-x-[18px]" : "translate-x-1")
                              }
                            />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function featureLabel(key: string): string {
  return FEATURES.find((f) => f.key === key)?.label ?? key;
}
function planLabelOf(key: string): string {
  return PLANS.find((p) => p.key === key)?.label ?? key;
}
