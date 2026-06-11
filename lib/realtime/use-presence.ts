"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface PresenceUser {
  id: string;   // auth user id
  name: string; // full name, falling back to email
}

// Who else has this channel open right now (Supabase Realtime presence).
// Presence is ephemeral — nothing is stored; joins/leaves propagate within
// seconds. Returns teammates only (self excluded). Channels are keyed per
// entity, e.g. `quote:<id>` / `template:<id>`.
export function usePresence(channelKey: string): PresenceUser[] {
  const [others, setOthers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row } = await (supabase as any)
        .from("users")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      const name: string = row?.full_name || row?.email || "A teammate";
      if (cancelled) return;

      channel = supabase.channel(`presence:${channelKey}`, {
        config: { presence: { key: user.id } },
      });

      channel.on("presence", { event: "sync" }, () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state: Record<string, any[]> = channel.presenceState();
        const list = Object.entries(state)
          .filter(([key]) => key !== user.id)
          .map(([key, metas]) => ({
            id: key,
            name: metas[0]?.name ?? "A teammate",
          }));
        setOthers(list);
      });

      channel.subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name });
        }
      });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      setOthers([]);
    };
  }, [channelKey]);

  return others;
}
