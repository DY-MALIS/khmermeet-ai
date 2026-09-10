import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Failures that mean "could not check right now", not "this person is signed
// out": Supabase raises AuthRetryableFetchError for network trouble and 5xx,
// and 429 is its own rate limit - which this app can reach on its own, since
// the check below runs for every page view and every API call a page makes.
// Matched on the shape of the error rather than by importing the class from
// @supabase/auth-js, which is only a transitive dependency here.
function isTransientAuthFailure(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const { name, status } = error as { name?: string; status?: number };
  if (name === "AuthRetryableFetchError") return true;
  return status === 429 || (typeof status === "number" && status >= 500);
}

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
}

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

  let result = await supabase.auth.getUser();
  // One quick retry: a momentary blip talking to the auth server should not
  // cost someone their session. Only on the transient path, so a genuinely
  // signed-out visitor is still turned away immediately.
  if (!result.data.user && isTransientAuthFailure(result.error)) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    result = await supabase.auth.getUser();
  }

  const user = result.data.user;
  // The whole reason this flag exists: the error used to be discarded, so a
  // failed check was indistinguishable from a real sign-out and the proxy
  // bounced the person to /login while their Supabase session was still very
  // much alive (confirmed in auth.sessions: sessions here stay valid for
  // days). Letting the request continue in that case is safe - every page and
  // route still calls requireUser()/getOptionalUser() and scopes its queries
  // by owner, so this check is defence in depth rather than the only gate.
  const keepExistingSession = !user && isTransientAuthFailure(result.error) && hasSupabaseAuthCookie(request);

  return { response, user, keepExistingSession };
}
