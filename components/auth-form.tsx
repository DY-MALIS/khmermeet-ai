"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCsrfToken } from "next-auth/react";
import { hasEmailSeparatorTypo } from "@/lib/auth-input";
import { PasswordInput } from "@/components/password-input";

const errorMessages: Record<string, string> = {
  CredentialsSignin: "Could not sign in. If this email already has an account, check the password or click Forgot password."
};

const registerErrorMessages: Record<string, string> = {
  invalid: "Enter a name, email, and password with at least 6 characters.",
  exists: "This email already has an account. Sign in or use another email.",
  unknown: "Could not create the account. Please try again."
};

const forgotPasswordErrorMessages: Record<string, string> = {
  invalid: "Enter an email.",
  ratelimit: "Too many password reset requests. Wait 1 hour, then try again."
};

const resetPasswordErrorMessages: Record<string, string> = {
  short: "Password must be at least 6 characters."
};

// searchParams are read server-side by each (auth) page and passed down as
// plain props - NOT via next/navigation's useSearchParams() here. That hook
// forces Next.js to wrap the caller in <Suspense>, and confirmed live
// (curl against production HTML): the fallback for these Suspense
// boundaries had no content, so the actual <form> never appeared in the
// server-rendered HTML at all (a literal BAILOUT_TO_CLIENT_SIDE_RENDERING
// marker instead) - a visitor with JavaScript disabled or slow/failed to
// load saw a completely blank card, not even the (already JS-independent)
// native form. Reading params server-side and passing as props keeps the
// form itself fully server-rendered regardless of JS.
// Same reasoning as the credentials form below: a native POST straight to
// NextAuth's own signin endpoint, never a JS signIn() call. The OAuth
// redirect itself always needs a real full-page navigation anyway (there's
// no way to send a user to Google's consent screen via a background
// fetch), so this costs nothing extra and stays consistent with the
// no-JS-required login path.
function GoogleSignInButton({
  csrfToken,
  callbackUrl,
  enabled
}: {
  csrfToken: string;
  callbackUrl: string;
  enabled: boolean;
}) {
  if (!enabled) return null;
  return (
    <form method="POST" action="/api/auth/signin/google">
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <button className="kh-button-secondary w-full" type="submit" disabled={!csrfToken}>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
          <path fill="#4285F4" d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.79h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.32 2.99-7.31z" />
          <path fill="#34A853" d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.23-2.5c-.9.6-2.05.95-3.39.95-2.6 0-4.8-1.76-5.59-4.12H1.06v2.59A10 10 0 0 0 10 20z" />
          <path fill="#FBBC05" d="M4.41 11.9a6 6 0 0 1 0-3.8V5.5H1.06a10 10 0 0 0 0 9l3.35-2.6z" />
          <path fill="#EA4335" d="M10 3.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 10 0a10 10 0 0 0-8.94 5.5l3.35 2.6C5.2 5.74 7.4 3.98 10 3.98z" />
        </svg>
        Continue with Google
      </button>
    </form>
  );
}

export function LoginForm({
  justRegistered,
  justReset,
  errorCode,
  callbackUrl,
  googleEnabled
}: {
  justRegistered: boolean;
  justReset: boolean;
  errorCode: string | null;
  callbackUrl: string;
  googleEnabled: boolean;
}) {
  const [csrfToken, setCsrfToken] = useState("");
  const [csrfFailed, setCsrfFailed] = useState(false);
  const [email, setEmail] = useState("");
  const emailSeparatorTypo = hasEmailSeparatorTypo(email);

  useEffect(() => {
    let cancelled = false;
    getCsrfToken()
      .then((token) => {
        if (!cancelled) setCsrfToken(token ?? "");
      })
      .catch(() => {
        if (!cancelled) setCsrfFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Submitting is a plain browser form POST straight to NextAuth's own
  // endpoint - deliberately NOT a JS fetch()/signIn({redirect:false}) call.
  // A real user got stuck with every fetch-based sign-in attempt silently
  // never reaching the server at all (confirmed in server logs: the GET for
  // this CSRF token always arrived, the POST never did), which matches
  // exactly what a browser extension or network filter blocking XHR/fetch
  // while allowing normal navigations looks like. A native form submission
  // can't be caught by that class of problem. NextAuth handles this
  // non-JS flow natively: redirects to callbackUrl on success, or back here
  // with ?error=... on failure.
  return (
    <div className="space-y-4">
    <form method="POST" action="/api/auth/callback/credentials" className="space-y-4">
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {justRegistered ? (
        <p className="rounded-lg bg-leaf/10 p-3 text-sm text-leaf">Account created. Sign in with the email and password you just created.</p>
      ) : null}
      {justReset ? (
        <p className="rounded-lg bg-leaf/10 p-3 text-sm text-leaf">Password reset complete. Sign in with your new password.</p>
      ) : null}
      {csrfFailed ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Could not prepare the login page because the security token could not be loaded. Refresh the page and try again.
        </p>
      ) : null}
      {errorCode ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {errorMessages[errorCode] ?? `Could not sign in. Technical detail: ${errorCode}`}
        </p>
      ) : null}
      {emailSeparatorTypo ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          The email has a / or \ before @. We will clean it before signing in.
        </p>
      ) : null}
      <input className="kh-input" name="email" type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <PasswordInput name="password" placeholder="Password" required />
      <button className="kh-button-primary w-full" type="submit" disabled={!csrfToken}>
        {csrfToken ? "Sign in" : "Preparing..."}
      </button>
      <p className="text-center text-sm text-slate-500">
        <Link className="font-semibold text-leaf" href="/forgot-password">Forgot password?</Link>
      </p>
    </form>
    {googleEnabled ? (
      <>
        <div className="flex items-center gap-3 text-xs font-semibold uppercase text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <GoogleSignInButton csrfToken={csrfToken} callbackUrl={callbackUrl} enabled={googleEnabled} />
      </>
    ) : null}
    </div>
  );
}

export function RegisterForm({ errorCode, googleEnabled }: { errorCode: string | null; googleEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const emailSeparatorTypo = hasEmailSeparatorTypo(email);

  useEffect(() => {
    let cancelled = false;
    getCsrfToken()
      .then((token) => {
        if (!cancelled) setCsrfToken(token ?? "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
    <form method="POST" action="/api/register" className="space-y-4">
      {errorCode ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {registerErrorMessages[errorCode] ?? `Could not create the account. Technical detail: ${errorCode}`}
        </p>
      ) : null}
      <input className="kh-input" name="name" placeholder="Name" required />
      {emailSeparatorTypo ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          The email has a / or \ before @. We will clean it before creating the account.
        </p>
      ) : null}
      <input className="kh-input" name="email" type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <PasswordInput name="password" placeholder="Password, at least 6 characters" minLength={6} required />
      <button className="kh-button-primary w-full">Create account</button>
      <p className="text-center text-sm text-slate-500">
        Already have an account? <Link className="font-semibold text-leaf" href="/login">Sign in</Link>
      </p>
    </form>
    {googleEnabled ? (
      <>
        <div className="flex items-center gap-3 text-xs font-semibold uppercase text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <GoogleSignInButton csrfToken={csrfToken} callbackUrl="/dashboard" enabled={googleEnabled} />
      </>
    ) : null}
    </div>
  );
}

export function ForgotPasswordForm({ sent, errorCode }: { sent: boolean; errorCode: string | null }) {
  const [email, setEmail] = useState("");
  const emailSeparatorTypo = hasEmailSeparatorTypo(email);

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-lg bg-leaf/10 p-4 text-sm text-leaf">
          If this email has a registered account, we sent a password reset link. Check your inbox and spam or junk folder.
        </p>
        <Link className="font-semibold text-leaf" href="/login">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form method="POST" action="/api/forgot-password" className="space-y-4">
      <p className="text-sm text-slate-500">Enter your email and we will send a password reset link to your inbox.</p>
      {errorCode ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {forgotPasswordErrorMessages[errorCode] ?? `Could not send the email. Please try again. (${errorCode})`}
        </p>
      ) : null}
      {emailSeparatorTypo ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          The email has a / or \ before @. We will clean it before looking up the account.
        </p>
      ) : null}
      <input className="kh-input" name="email" type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <button className="kh-button-primary w-full" type="submit">Send password reset link</button>
      <p className="text-center text-sm text-slate-500">
        <Link className="font-semibold text-leaf" href="/login">Back to sign in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token, errorCode }: { token: string; errorCode: string | null }) {
  return (
    <form method="POST" action="/api/reset-password" className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {errorCode ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {resetPasswordErrorMessages[errorCode] ?? `Could not reset the password. (${errorCode})`}
        </p>
      ) : null}
      <PasswordInput name="password" placeholder="New password, at least 6 characters" minLength={6} required />
      <button className="kh-button-primary w-full" type="submit">Reset password</button>
    </form>
  );
}
