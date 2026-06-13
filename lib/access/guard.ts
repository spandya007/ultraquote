import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccessState, canWrite, type AccessState } from "./access-state";

// API write guard. Call at the top of mutation routes (quote create/edit, send,
// apply-pricing, team invite, etc.) to block writes when the caller's access is
// read-only (grace) or hard-blocked (suspended/expired/disabled). Reads are not
// guarded here — they pass through, matching the read-only grace model.
// See docs/subscription-and-access-lifecycle-design.md (§4).
//
// Usage:
//   const gate = await requireWriteAccess();
//   if ("response" in gate) return gate.response;
//   // ...proceed; gate.state is the resolved AccessState
export async function requireWriteAccess(): Promise<
  { state: AccessState } | { response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const state = await getAccessState(user.id);
  if (!canWrite(state)) {
    const message =
      state.status === "grace"
        ? "Your subscription has lapsed — the account is read-only until it's renewed."
        : "Your access to UltraQuote is currently disabled.";
    return {
      response: NextResponse.json({ error: message, accessStatus: state.status }, { status: 403 }),
    };
  }
  return { state };
}
