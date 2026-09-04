import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Used from Server Components, Route Handlers, and Server Actions. Reads/
// writes the Supabase session via the request's cookies - the cookie
// writes only actually take effect from a Route Handler or Server Action
// (Server Components can't set cookies at all; Next.js allows the call but
// silently no-ops it), which is fine here since session refresh happens in
// the proxy/middleware on every request anyway.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component - cookies are already sent,
            // this is a no-op. The proxy below refreshes the session on
            // every request, so a stale cookie here is short-lived.
          }
        }
      }
    }
  );
}
