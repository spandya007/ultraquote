"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Drop into a server-rendered page to re-fetch its data whenever the user
// navigates to it. Works around the App Router client cache serving stale
// payloads on soft navigation (staleTimes.dynamic isn't reliably honored).
export function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => { router.refresh(); }, [router]);
  return null;
}
