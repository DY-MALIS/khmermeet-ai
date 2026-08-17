import { Suspense } from "react";
import { RegisterForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="kh-card w-full max-w-md p-6">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-ink">បង្កើតគណនី</p>
          <p className="mt-2 text-sm text-slate-500">ចាប់ផ្តើមប្រើ KhmerMeet AI សម្រាប់ក្រុមរបស់អ្នក</p>
        </div>
        <Suspense>
          <RegisterForm />
        </Suspense>
      </section>
    </main>
  );
}
