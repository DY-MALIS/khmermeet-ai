"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCsrfToken } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { requestPasswordReset, resetPassword } from "@/lib/actions";
import { PasswordInput } from "@/components/password-input";

const errorMessages: Record<string, string> = {
  CredentialsSignin: "រកមិនឃើញគណនីនេះ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ។ សូម Register ជាមុន ប្រសិនបើមិនទាន់មានគណនី។"
};

const registerErrorMessages: Record<string, string> = {
  invalid: "សូមបញ្ចូលឈ្មោះ, អ៊ីមែល, និងពាក្យសម្ងាត់យ៉ាងតិច 6 តួ។",
  exists: "អ៊ីមែលនេះមានគណនីរួចហើយ។ សូមចូលប្រើវិញ ឬប្រើអ៊ីមែលផ្សេង។",
  unknown: "មិនអាចបង្កើតគណនីបានទេ។ សូមសាកល្បងម្តងទៀត។"
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const [csrfToken, setCsrfToken] = useState("");
  const [csrfFailed, setCsrfFailed] = useState(false);
  const justRegistered = searchParams.get("registered") === "1";
  const justReset = searchParams.get("reset") === "1";
  const errorCode = searchParams.get("error");
  const callbackUrl = searchParams.get("from") || "/dashboard";

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
    <form method="POST" action="/api/auth/callback/credentials" className="space-y-4">
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {justRegistered ? (
        <p className="rounded-lg bg-leaf/10 p-3 text-sm text-leaf">បានបង្កើតគណនីរួចរាល់! សូមចូលប្រើដោយប្រើអ៊ីមែល និងពាក្យសម្ងាត់ដែលទើបបង្កើត។</p>
      ) : null}
      {justReset ? (
        <p className="rounded-lg bg-leaf/10 p-3 text-sm text-leaf">ពាក្យសម្ងាត់ត្រូវបានកំណត់ថ្មីរួចរាល់! សូមចូលប្រើដោយពាក្យសម្ងាត់ថ្មី។</p>
      ) : null}
      {csrfFailed ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          មិនអាចត្រៀមទំព័រ login បានទេ (មិនអាចទាញ security token)។ សូម refresh ទំព័រ ហើយសាកល្បងម្ដងទៀត។
        </p>
      ) : null}
      {errorCode ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {errorMessages[errorCode] ?? `ចូលប្រើមិនបានទេ។ លម្អិត technical: ${errorCode}`}
        </p>
      ) : null}
      <input className="kh-input" name="email" type="email" placeholder="អ៊ីមែល" required />
      <PasswordInput name="password" placeholder="ពាក្យសម្ងាត់" required />
      <button className="kh-button-primary w-full" type="submit" disabled={!csrfToken}>
        {csrfToken ? "ចូលប្រើ" : "កំពុងត្រៀម..."}
      </button>
      <p className="text-center text-sm text-slate-500">
        <Link className="font-semibold text-leaf" href="/forgot-password">ភ្លេចពាក្យសម្ងាត់?</Link>
      </p>
      <p className="text-center text-sm text-slate-500">
        មិនទាន់មានគណនី? <Link className="font-semibold text-leaf" href="/register">បង្កើតគណនី</Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");

  return (
    <form method="POST" action="/api/register" className="space-y-4">
      {errorCode ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {registerErrorMessages[errorCode] ?? `មិនអាចបង្កើតគណនីបានទេ។ លម្អិត technical: ${errorCode}`}
        </p>
      ) : null}
      <input className="kh-input" name="name" placeholder="ឈ្មោះ" required />
      <input className="kh-input" name="email" type="email" placeholder="អ៊ីមែល" required />
      <PasswordInput name="password" placeholder="ពាក្យសម្ងាត់យ៉ាងតិច 6 តួ" minLength={6} required />
      <button className="kh-button-primary w-full">បង្កើតគណនី</button>
      <p className="text-center text-sm text-slate-500">
        មានគណនីរួចហើយ? <Link className="font-semibold text-leaf" href="/login">ចូលប្រើ</Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const sent = searchParams.get("sent") === "1";

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-lg bg-leaf/10 p-4 text-sm text-leaf">
          បើ email នេះមានគណនីចុះឈ្មោះ យើងបានផ្ញើ link កំណត់ពាក្យសម្ងាត់ថ្មីទៅហើយ។ សូមពិនិត្យ inbox (និង spam/junk folder)។
        </p>
        <Link className="font-semibold text-leaf" href="/login">ត្រឡប់ទៅចូលប្រើ</Link>
      </div>
    );
  }

  return (
    <form action={requestPasswordReset} className="space-y-4">
      <p className="text-sm text-slate-500">វាយ email របស់អ្នក យើងនឹងផ្ញើ link កំណត់ពាក្យសម្ងាត់ថ្មីទៅ inbox របស់អ្នក។</p>
      <input className="kh-input" name="email" type="email" placeholder="អ៊ីមែល" required />
      <button className="kh-button-primary w-full" type="submit">ផ្ញើ link កំណត់ពាក្យសម្ងាត់ថ្មី</button>
      <p className="text-center text-sm text-slate-500">
        <Link className="font-semibold text-leaf" href="/login">ត្រឡប់ទៅចូលប្រើ</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  return (
    <form action={resetPassword} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <PasswordInput name="password" placeholder="ពាក្យសម្ងាត់ថ្មីយ៉ាងតិច 6 តួ" minLength={6} required />
      <button className="kh-button-primary w-full" type="submit">កំណត់ពាក្យសម្ងាត់ថ្មី</button>
    </form>
  );
}
