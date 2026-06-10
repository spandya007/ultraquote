import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  // Only allow same-site relative paths (open-redirect guard).
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  // No ?code= — invite/magic links use the implicit flow: tokens travel in the
  // URL hash, which never reaches the server but IS preserved by the browser
  // across this redirect. Forward to `next` and let the page pick the session
  // up client-side (set-password handles both the hash and an existing session).
  return NextResponse.redirect(`${origin}${next}`);
}
