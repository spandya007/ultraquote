import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// Platform Admin: manage a single workspace member.
// Body: { action: "make_owner" | "make_member" | "remove" | "delete_account" }
//  - make_owner / make_member: role change (for ownership transfer)
//  - remove: delete the users row only (login survives, no longer in any workspace)
//  - delete_account: delete the users row AND the Supabase Auth login (offboarding)
//
// Guards: never orphan a workspace (can't demote/remove/delete the only owner);
// delete_account is refused if the login also holds a platform-admin or
// org-admin hat (handle those separately so we don't nuke an admin login).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: tenantId, userId } = params;
  const body = await req.json().catch(() => ({}));
  const action = body.action as "make_owner" | "make_member" | "remove" | "delete_account" | undefined;
  const ACTIONS = ["make_owner", "make_member", "remove", "delete_account"];
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: "A valid action is required." }, { status: 400 });
  }

  const admin = createAdminClient();

  // The target must be a member of THIS workspace.
  const { data: member } = await admin
    .from("users")
    .select("id, tenant_id, role, email")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "That user is not in this workspace." }, { status: 404 });

  // How many owners does the workspace have? (for no-orphan guards)
  const ownerCount = async () => {
    const { count } = await admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "owner");
    return count ?? 0;
  };
  const isLastOwner = async () => member.role === "owner" && (await ownerCount()) <= 1;

  if (action === "make_owner") {
    const { error } = await admin.from("users").update({ role: "owner" }).eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "make_member") {
    if (await isLastOwner()) {
      return NextResponse.json(
        { error: "This is the workspace's only Owner — promote another owner first." },
        { status: 409 }
      );
    }
    const { error } = await admin.from("users").update({ role: "member" }).eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // remove / delete_account both drop the workspace membership — guard orphaning.
  if (await isLastOwner()) {
    return NextResponse.json(
      { error: "This is the workspace's only Owner — assign another owner before removing." },
      { status: 409 }
    );
  }

  if (action === "delete_account") {
    // Don't nuke a login that also administers the platform or an org.
    const [{ data: pa }, { data: oa }] = await Promise.all([
      admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
      admin.from("organization_admins").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);
    if (pa || oa) {
      return NextResponse.json(
        { error: "This login is also a Platform/Org Admin — remove those roles before deleting the account." },
        { status: 409 }
      );
    }
    await admin.from("users").delete().eq("id", userId);
    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) return NextResponse.json({ error: `User row removed but auth delete failed: ${authErr.message}` }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // remove (membership only — login survives)
  const { error } = await admin.from("users").delete().eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
