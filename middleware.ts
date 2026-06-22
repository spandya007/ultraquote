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
  const isPublicRoute =
    isAuthRoute || isApiRoute || isInviteRoute || isLegalRoute || isMarketingRoute;

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
