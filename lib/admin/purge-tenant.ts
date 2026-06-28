import { createAdminClient } from "@/lib/supabase/admin";

// Scheduled-deletion grace window: a tenant marked for deletion is purged this
// many days later. The workspace stays usable during the window (export-friendly).
// NOTE: the privacy policy mentions a 90-day post-termination retention — revisit
// if this should be 90 to match. Kept here as the single source of truth.
export const DELETION_GRACE_DAYS = 30;

export interface PurgeResult {
  tenantId: string;
  tenantName: string | null;
  usersDeleted: number;
  storageFilesRemoved: number;
}

// Tenant ids whose scheduled deletion date has arrived (<= now).
export async function listDueTenantIds(): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("tenants")
    .select("id")
    .not("deletion_scheduled_at", "is", null)
    .lte("deletion_scheduled_at", new Date().toISOString());
  return ((data ?? []) as { id: string }[]).map((t) => t.id);
}

// Permanently delete a tenant and everything that does NOT cascade from the
// tenants row: Storage assets and the members' Supabase Auth logins. Order:
// capture user ids -> remove storage -> delete the tenants row (cascades all
// child tables incl. public.users) -> delete the Auth users via the admin API.
export async function purgeTenant(tenantId: string): Promise<PurgeResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const { data: members } = await admin.from("users").select("id").eq("tenant_id", tenantId);
  const userIds = ((members ?? []) as { id: string }[]).map((u) => u.id);

  // 1) Storage: remove the tenant's logo folder (best-effort; proposal images
  // live under per-quote paths not enumerable by tenant — DB refs go anyway).
  let storageFilesRemoved = 0;
  try {
    const { data: files } = await admin.storage.from("proposal-assets").list(`tenant-logos/${tenantId}`);
    const paths = ((files ?? []) as { name: string }[]).map((f) => `tenant-logos/${tenantId}/${f.name}`);
    if (paths.length) {
      await admin.storage.from("proposal-assets").remove(paths);
      storageFilesRemoved = paths.length;
    }
  } catch {
    /* bucket/path may not exist — ignore */
  }

  // 2) Delete the tenant row — clients, products(+tiers/categories/audit),
  // templates, quotes(+scenarios/line_items/signers/sessions), tenant_settings,
  // tenant_invites, and public.users all cascade via their tenant_id FK.
  const { error: delErr } = await admin.from("tenants").delete().eq("id", tenantId);
  if (delErr) throw new Error(`Failed to delete tenant ${tenantId}: ${delErr.message}`);

  // 3) Delete the Auth logins (not FK-cascaded by the tenants row).
  let usersDeleted = 0;
  for (const uid of userIds) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (!error) usersDeleted++;
    else console.error(`purgeTenant: failed to delete auth user ${uid}:`, error.message);
  }

  return { tenantId, tenantName: tenant?.name ?? null, usersDeleted, storageFilesRemoved };
}
