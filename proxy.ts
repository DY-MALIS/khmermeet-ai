import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/middleware";

// Routes/prefixes that must stay reachable without a session: the two
// DB/provider health probes that the login form and recorder call before a
// session can exist, plus LiveKit/upload/track-recording endpoints a guest
// (invite-link only, no account) also needs to reach.
const PUBLIC_API_PREFIXES = [
  "/api/health",
  "/api/openrouter-health",
  "/api/livekit-token",
  "/api/uploads/direct-init"
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }
  if (isApi && /^\/api\/meetings\/[^/]+\/register-track-recording$/.test(pathname)) {
    return NextResponse.next();
  }
  if (pathname === "/meetings/call" && request.nextUrl.searchParams.has("room") && request.nextUrl.searchParams.has("invite")) {
    return NextResponse.next();
  }

  const { response, user, keepExistingSession } = await refreshSupabaseSession(request);
  // keepExistingSession means the auth server could not be reached or rate
  // limited us, not that this person is signed out - see the note in
  // lib/supabase/middleware.ts. Signing someone out over a blip is the worse
  // failure, and the page they land on re-checks the session properly anyway.
  if (user || keepExistingSession) return response;

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|auth).*)"]
};
