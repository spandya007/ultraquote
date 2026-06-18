import { getUserContext } from "@/lib/auth/user-context";
import type { UserRole } from "@/types";

// Tenant + user access lifecycle resolver.
// See docs/subscription-and-access-lifecycle-design.md (§2, §4).
//
// Access is the AND of three reversible conditions — the platform kill switch,
// the subscription window, and the per-user kill switch — resolved to ONE of
// five states. Expiry is NOT a binary cliff: there is a read-only GRACE window
// after subscription_end before a hard block.
//
//   precedence (most-authoritative first):
//     suspended -> user_disabled -> expired -> grace -> ok
//
// This resolver is the single source of truth in v1 (checked in the dashboard
// layout + API write guard). The SQL helpers in migration 012
// (tenant_can_read/write, user_can_read/write) mirror this for the phase-2 RLS
// hardening — keep GRACE_DAYS in sync with that migration.

export const GRACE_DAYS = 7;

export type AccessState =
  | { status: "ok"; tenantId: string; role: UserRole; subscriptionEnd: string | null }
  // grace = subscription lapsed but within the read-only window: can view, cannot write.
  | { status: "grace"; tenantId: string; role: UserRole; subscriptionEnd: string; graceEndsOn: string }
  | { status: "suspended" }                 // platform_enabled = false
  | { status: "expired"; role: UserRole }   // past subscription_end + GRACE_DAYS
  | { status: "user_disabled" };            // users.enabled = false

// True for any state where the user may still VIEW the app (ok or grace).
export function canRead(state: AccessState): boolean {
  return state.status === "ok" || state.status === "grace";
}

// True only when the user may MUTATE data (ok). Grace is read-only.
export function canWrite(state: AccessState): boolean {
  return state.status === "ok";
}

// Parse a 'YYYY-MM-DD' date column to a UTC midnight Date (date-only compare).
function toUtcDate(d: string): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve the effective access state for an authenticated user id.
 * Uses the service-role client (subscription/switch fields are platform-managed
 * and must not depend on the caller's RLS visibility).
 */
export async function getAccessState(userId: string): Promise<AccessState> {
  // Shared, per-request cached fetch (user row + joined tenant) — see
  // lib/auth/user-context.ts. Dedupes with the dashboard layout's branding fetch.
  const user = await getUserContext(userId);

  // No tenant row yet (e.g. mid-provisioning) — fail closed but harmless: the
  // layout will treat this as "disabled" and route to the block page.
  if (!user) return { status: "user_disabled" };

  const role = (user.role ?? "member") as UserRole;
  const tenantId = user.tenant_id as string;

  const tenant = user.tenant as { platform_enabled?: boolean; subscription_end?: string | null } | null;

  // 1) Platform kill switch — blocks everyone incl. owner.
  if (tenant && tenant.platform_enabled === false) return { status: "suspended" };

  // 2) Per-user kill switch — members only (owner.enabled is forced true).
  if (user.enabled === false && role !== "owner") return { status: "user_disabled" };

  const end = (tenant?.subscription_end ?? null) as string | null;

  // NULL end = unlimited/active (grandfathered).
  if (!end) return { status: "ok", tenantId, role, subscriptionEnd: null };

  const today = todayUtc();
  const endDate = toUtcDate(end);
  const graceEnd = addDays(endDate, GRACE_DAYS);

  // 3) Subscription window.
  if (today <= endDate) {
    return { status: "ok", tenantId, role, subscriptionEnd: end };
  }
  if (today <= graceEnd) {
    return { status: "grace", tenantId, role, subscriptionEnd: end, graceEndsOn: toIsoDate(graceEnd) };
  }
  return { status: "expired", role };
}
