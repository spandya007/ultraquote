import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/user-context";
import { getConnectionSecrets, deleteConnection } from "@/lib/integrations/store";
import { revokeToken } from "@/lib/integrations/qbo/oauth";

export const runtime = "nodejs";

// Owner disconnects QBO: best-effort token revoke, then delete our row.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getUserContext(user.id);
  if (!ctx || ctx.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conn = await getConnectionSecrets(ctx.tenant_id, "qbo");
  if (conn?.refreshToken) await revokeToken(conn.refreshToken);
  await deleteConnection(ctx.tenant_id, "qbo");
  return NextResponse.json({ ok: true });
}
