import { Suspense } from "react";
import { LoginForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="kh-card w-full max-w-md p-6">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-ink">ចូលប្រើគណនី</p>
          <p className="mt-2 text-sm text-slate-500">ចូលប្រើ KhmerMeet AI ជាមួយគណនីរបស់អ្នក</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
