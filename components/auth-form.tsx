"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasEmailSeparatorTypo, normalizeAuthEmail, normalizeAuthPassword } from "@/lib/auth-input";
import { PasswordInput } from "@/components/password-input";

const errorMessages: Record<string, string> = {
  CallbackMissingCode: "Google sign-in did not return the expected data. Please try again.",
  CallbackFailed: "Could not complete sign-in. Please try again."
};

// Supabase's own error strings are in English and occasionally quite raw -
// map the ones a real user will actually hit to a friendly Khmer message,
// and fall back to the raw message for anything unmapped rather than
// hiding it (a mystery "Could not sign in" with no detail is worse for
// debugging a real report from a non-technical user than the raw string).
function friendlySupabaseError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "អ៊ីមែល ឬ password មិនត្រឹមត្រូវទេ។";
  if (lower.includes("email not confirmed")) {
    return "សូមបញ្ជាក់អ៊ីមែលរបស់អ្នកសិន (ចុច link ក្នុង email ដែលបានផ្ញើទៅអ្នក) មុននឹង Sign in។";
  }
  if (lower.includes("user already registered")) return "អ៊ីមែលនេះមានគណនីរួចហើយ។ សូម Sign in វិញ។";
  if (lower.includes("password should be at least")) return "Password ត្រូវមានយ៉ាងហោចណាស់ ៦ តួអក្សរ។";
  return message;
}

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

function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs font-semibold uppercase text-slate-400">
      <span className="h-px flex-1 bg-slate-200" />
      or
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

export function LoginForm({ errorCode, callbackUrl }: { errorCode: string | null; callbackUrl: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailSeparatorTypo = hasEmailSeparatorTypo(email);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizeAuthEmail(email),
      password: normalizeAuthPassword(password)
    });
    if (signInError) {
      setError(friendlySupabaseError(signInError.message));
      setPending(false);
      return;
    }
    window.location.href = callbackUrl;
  }

  return (
    <div className="space-y-5">
      {errorCode ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {errorMessages[errorCode] ?? `Could not sign in. Technical detail: ${errorCode}`}
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {emailSeparatorTypo ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            The email has a / or \ before @. We will clean it before signing in.
          </p>
        ) : null}
        <input
          className="kh-input"
          name="email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <PasswordInput
          name="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button className="kh-button-primary w-full" type="submit" disabled={pending}>
          {pending ? "កំពុងចូល..." : "Sign in"}
        </button>
        <p className="text-center text-sm text-slate-500">
          <Link className="font-semibold text-leaf" href="/forgot-password">Forgot password?</Link>
        </p>
      </form>
      <OrDivider />
      <GoogleSignInButton callbackUrl={callbackUrl} />
      <p className="text-center text-sm text-slate-500">
        No account yet? <Link className="font-semibold text-leaf" href="/register">Create one</Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const emailSeparatorTypo = hasEmailSeparatorTypo(email);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const cleanName = name.trim();
    const cleanEmail = normalizeAuthEmail(email);
    const cleanPassword = normalizeAuthPassword(password);
    if (!cleanName || !cleanEmail || cleanPassword.length < 6) {
      setError("Enter a name, email, and password with at least 6 characters.");
      return;
    }
    if (cleanPassword !== normalizeAuthPassword(confirmPassword)) {
      setError("The two passwords do not match.");
      return;
    }
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPassword,
      options: {
        data: { full_name: cleanName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/dashboard")}`
      }
    });
    if (signUpError) {
      setError(friendlySupabaseError(signUpError.message));
      setPending(false);
      return;
    }
    if (data.session) {
      // Email confirmation is disabled on this project - signUp already
      // returned a real session, so there is nothing to wait for.
      window.location.href = "/dashboard";
      return;
    }
    setAwaitingConfirmation(true);
    setPending(false);
  }

  if (awaitingConfirmation) {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-lg bg-leaf/10 p-4 text-sm text-leaf">
          យើងបានផ្ញើ email បញ្ជាក់គណនីទៅ {email}។ សូមចូល inbox (ឬ spam/junk folder) ហើយចុច link ដើម្បីបញ្ចប់ការចុះឈ្មោះ។
        </p>
        <Link className="font-semibold text-leaf" href="/login">Back to sign in</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <input
          className="kh-input"
          name="name"
          placeholder="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        {emailSeparatorTypo ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            The email has a / or \ before @. We will clean it before creating the account.
          </p>
        ) : null}
        <input
          className="kh-input"
          name="email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <PasswordInput
          name="password"
          placeholder="Password, at least 6 characters"
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <PasswordInput
          name="confirmPassword"
          placeholder="Confirm password"
          minLength={6}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
        <button className="kh-button-primary w-full" type="submit" disabled={pending}>
          {pending ? "កំពុងបង្កើតគណនី..." : "Create account"}
        </button>
        <p className="text-center text-sm text-slate-500">
          Already have an account? <Link className="font-semibold text-leaf" href="/login">Sign in</Link>
        </p>
      </form>
      <OrDivider />
      <GoogleSignInButton callbackUrl="/dashboard" />
    </div>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const emailSeparatorTypo = hasEmailSeparatorTypo(email);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    // Always show the same "sent" message regardless of whether the email
    // actually has an account - a different response for an unknown email
    // would let anyone probe which addresses are registered.
    await supabase.auth
      .resetPasswordForEmail(normalizeAuthEmail(email), {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`
      })
      .catch(() => undefined);
    setSent(true);
    setPending(false);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-lg bg-leaf/10 p-4 text-sm text-leaf">
          បើអ៊ីមែលនេះមានគណនីចុះឈ្មោះ យើងបានផ្ញើ link កំណត់ password ថ្មីទៅហើយ។ សូមពិនិត្យ inbox ឬ spam/junk folder។
        </p>
        <Link className="font-semibold text-leaf" href="/login">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-slate-500">Enter your email and we will send a password reset link to your inbox.</p>
      {emailSeparatorTypo ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          The email has a / or \ before @. We will clean it before looking up the account.
        </p>
      ) : null}
      <input
        className="kh-input"
        name="email"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <button className="kh-button-primary w-full" type="submit" disabled={pending}>
        {pending ? "កំពុងផ្ញើ..." : "Send password reset link"}
      </button>
      <p className="text-center text-sm text-slate-500">
        <Link className="font-semibold text-leaf" href="/login">Back to sign in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) {
          setHasSession(Boolean(data.session));
          setCheckingSession(false);
        }
      })
      .catch(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const cleanPassword = normalizeAuthPassword(password);
    if (cleanPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (cleanPassword !== normalizeAuthPassword(confirmPassword)) {
      setError("The two passwords do not match.");
      return;
    }
    setPending(true);
    const { error: updateError } = await createSupabaseBrowserClient().auth.updateUser({ password: cleanPassword });
    if (updateError) {
      setError(friendlySupabaseError(updateError.message));
      setPending(false);
      return;
    }
    window.location.href = "/dashboard";
  }

  if (checkingSession) {
    return <p className="text-center text-sm text-slate-500">កំពុងផ្ទៀងផ្ទាត់ link...</p>;
  }

  if (!hasSession) {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Link នេះមិនត្រឹមត្រូវ ឬផុតកំណត់ហើយ។ សូមស្នើសុំ link ថ្មី។
        </p>
        <Link className="font-semibold text-leaf" href="/forgot-password">Request a new link</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <PasswordInput
        name="password"
        placeholder="New password, at least 6 characters"
        minLength={6}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <PasswordInput
        name="confirmPassword"
        placeholder="Confirm new password"
        minLength={6}
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        required
      />
      <button className="kh-button-primary w-full" type="submit" disabled={pending}>
        {pending ? "កំពុងកែប្រែ..." : "Reset password"}
      </button>
    </form>
  );
}
