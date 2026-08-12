"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCsrfToken } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { registerUser } from "@/lib/actions";

const errorMessages: Record<string, string> = {
  CredentialsSignin: "រកមិនឃើញគណនីនេះ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ។ សូម Register ជាមុន ប្រសិនបើមិនទាន់មានគណនី។"
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const [csrfToken, setCsrfToken] = useState("");
  const [csrfFailed, setCsrfFailed] = useState(false);
  const justRegistered = searchParams.get("registered") === "1";
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
      <input className="kh-input" name="password" type="password" placeholder="ពាក្យសម្ងាត់" required />
      <button className="kh-button-primary w-full" type="submit" disabled={!csrfToken}>
        {csrfToken ? "ចូលប្រើ" : "កំពុងត្រៀម..."}
      </button>
      <p className="text-center text-sm text-slate-500">
        មិនទាន់មានគណនី? <Link className="font-semibold text-leaf" href="/register">បង្កើតគណនី</Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  return (
    <form action={registerUser} className="space-y-4">
      <input className="kh-input" name="name" placeholder="ឈ្មោះ" required />
      <input className="kh-input" name="email" type="email" placeholder="អ៊ីមែល" required />
      <input className="kh-input" name="password" type="password" placeholder="ពាក្យសម្ងាត់យ៉ាងតិច 6 តួ" minLength={6} required />
      <button className="kh-button-primary w-full">បង្កើតគណនី</button>
      <p className="text-center text-sm text-slate-500">
        មានគណនីរួចហើយ? <Link className="font-semibold text-leaf" href="/login">ចូលប្រើ</Link>
      </p>
    </form>
  );
}
