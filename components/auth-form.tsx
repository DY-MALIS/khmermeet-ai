"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { registerUser } from "@/lib/actions";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false
    });
    setLoading(false);
    if (result?.error) setError("អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ។");
    else router.push("/dashboard");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
