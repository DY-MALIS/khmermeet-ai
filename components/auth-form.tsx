"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const errorMessages: Record<string, string> = {
  CallbackMissingCode: "Google sign-in did not return the expected data. Please try again.",
  CallbackFailed: "Could not complete Google sign-in. Please try again."
};

// Unlike a NextAuth native-form POST, Supabase's OAuth flow starts client-side:
// signInWithOAuth() asks Supabase for the actual Google consent-screen URL
// (it isn't a fixed, linkable path) and only then navigates there. The
// redirectTo lands back on our own /auth/callback route, which exchanges the
// one-time code for a real session.
export function GoogleSignInButton({ callbackUrl }: { callbackUrl: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <button
        type="button"
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const supabase = createSupabaseBrowserClient();
          const { error: oauthError } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}`
            }
          });
          if (oauthError) {
            setError(oauthError.message);
            setPending(false);
          }
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0">
          <path fill="#4285F4" d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.79h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.32 2.99-7.31z" />
          <path fill="#34A853" d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.23-2.5c-.9.6-2.05.95-3.39.95-2.6 0-4.8-1.76-5.59-4.12H1.06v2.59A10 10 0 0 0 10 20z" />
          <path fill="#FBBC05" d="M4.41 11.9a6 6 0 0 1 0-3.8V5.5H1.06a10 10 0 0 0 0 9l3.35-2.6z" />
          <path fill="#EA4335" d="M10 3.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 10 0a10 10 0 0 0-8.94 5.5l3.35 2.6C5.2 5.74 7.4 3.98 10 3.98z" />
        </svg>
        {pending ? "Redirecting to Google..." : "Continue with Google"}
      </button>
    </div>
  );
}

export function LoginForm({ errorCode, callbackUrl }: { errorCode: string | null; callbackUrl: string }) {
  return (
    <div className="space-y-4">
      {errorCode ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {errorMessages[errorCode] ?? `Could not sign in. Technical detail: ${errorCode}`}
        </p>
      ) : null}
      <GoogleSignInButton callbackUrl={callbackUrl} />
    </div>
  );
}
