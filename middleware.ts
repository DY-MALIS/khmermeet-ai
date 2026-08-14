import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Routes/prefixes that must stay reachable without a session: NextAuth's own
// sign-in/callback/session endpoints, and the two DB/provider health probes
// that the login form and recorder call before a session can exist.
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/health", "/api/openrouter-health"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // getToken() needs to be told explicitly whether to look for the
  // "__Secure-" prefixed cookie name - its own HTTPS auto-detection isn't
  // reliable inside Vercel's Edge Middleware runtime (confirmed live: a
  // valid session that /api/auth/session recognized was still invisible
  // here without this flag, silently sending every logged-in user back to
  // /login).
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production"
  });
  if (token) return NextResponse.next();

  // API routes are called via fetch() from client components expecting JSON -
  // redirecting them to an HTML login page would break every caller's
  // response parsing, so they get a plain 401 instead.
  if (isApi) {
    return NextResponse.json({ error: "សូម login មុននឹងបន្ត។" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|register|forgot-password|reset-password).*)"]
};
