import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");
  const isApiRoute = pathname.startsWith("/api");
  // /auth/* must be reachable unauthenticated: invite links arrive with the
  // session tokens in the URL hash (implicit flow), which the server never
  // sees — the page establishes the session client-side.
  const isInviteRoute = pathname.startsWith("/auth");
  // Public legal/privacy pages — reachable without a session (linked from the
  // Privacy Policy and used by non-users to submit data requests).
  const isLegalRoute = ["/privacy-request", "/privacy-policy", "/cookie-policy", "/terms"]
    .some((p) => pathname === p || pathname.startsWith(`${p}/`));
  // Public marketing/landing pages — reachable without a session (shared via
  // email/SMS/social to drive beta signups).
  const isMarketingRoute = pathname === "/beta" || pathname.startsWith("/beta/");
  // Self-serve signup (creates a standalone tenant) — public, no session.
  const isSignupRoute = pathname === "/signup";
  // OAuth discovery metadata (RFC 8414/9728) — MCP clients fetch these without a
  // session (rewritten to /api/oauth/meta/* in next.config).
  const isWellKnown = pathname.startsWith("/.well-known");
  // The OAuth consent page must be reachable so it can bounce a logged-out user
  // through /login preserving the full request (query string) itself — the
  // middleware redirect would drop the OAuth params.
  const isAuthorizeRoute = pathname === "/authorize";
  const isPublicRoute =
    isAuthRoute || isApiRoute || isInviteRoute || isLegalRoute || isMarketingRoute || isSignupRoute || isWellKnown || isAuthorizeRoute;

  if (!user && !isPublicRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
