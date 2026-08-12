"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { registerUser } from "@/lib/actions";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const justRegistered = searchParams.get("registered") === "1";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    // Without a try/catch here, any thrown/rejected step (a network hiccup, a
    // slow cold start) left the button stuck on "កំពុងចូល..." forever with no
    // way to recover except a manual page refresh - confirmed live. The
    // timeout below also caps how long a genuinely hung request can block the
    // form instead of waiting indefinitely.
    try {
      const health = await withTimeout(fetch("/api/health", { cache: "no-store" }), 15000);
      if (!health.ok) {
        setError("Database មិនទាន់ដំណើរការ។ សូមព្យាយាមម្ដងទៀតក្នុងពេលបន្តិច។");
        return;
      }
      const formData = new FormData(event.currentTarget);
      const result = await withTimeout(
        signIn("credentials", {
          email: formData.get("email"),
          password: formData.get("password"),
          redirect: false
        }),
        20000
      );
      if (result?.error) {
        setError("រកមិនឃើញគណនីនេះ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ។ សូម Register ជាមុន ប្រសិនបើមិនទាន់មានគណនី។");
        return;
      }
      router.push(searchParams.get("from") || "/dashboard");
      router.refresh();
    } catch {
      setError("ចូលប្រើមិនបានទេ (ប្រហែលជាបញ្ហាបណ្តាញ)។ សូមព្យាយាមម្ដងទៀត។");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {justRegistered ? (
        <p className="rounded-lg bg-leaf/10 p-3 text-sm text-leaf">បានបង្កើតគណនីរួចរាល់! សូមចូលប្រើដោយប្រើអ៊ីមែល និងពាក្យសម្ងាត់ដែលទើបបង្កើត។</p>
      ) : null}
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <input className="kh-input" name="email" type="email" placeholder="អ៊ីមែល" required />
      <input className="kh-input" name="password" type="password" placeholder="ពាក្យសម្ងាត់" required />
      <button className="kh-button-primary w-full" disabled={loading}>{loading ? "កំពុងចូល..." : "ចូលប្រើ"}</button>
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
