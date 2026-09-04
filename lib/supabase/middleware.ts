import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Runs on every request the proxy lets through this far. getUser() (not
// getSession()) is deliberate - it revalidates the token against Supabase's
// auth server instead of trusting whatever is in the cookie, and refreshes
// an expired access token here so page/API code downstream never has to.
export async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  return { response, user };
}
