"use client";

import { useEffect, useState } from "react";
import { createClient } from "./client";

let cachedTenantId: string | null = null;

export function useTenantId() {
  const [tenantId, setTenantId] = useState<string | null>(cachedTenantId);

  useEffect(() => {
    if (cachedTenantId) { setTenantId(cachedTenantId); return; }
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("users")
        .select("tenant_id")
        .eq("id", user.id)
        .single() as { data: { tenant_id: string } | null };
      if (data) {
        cachedTenantId = data.tenant_id;
        setTenantId(data.tenant_id);
      }
    });
  }, []);

  return tenantId;
}
