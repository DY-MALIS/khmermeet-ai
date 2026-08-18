import { LoginForm } from "@/components/auth-form";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ registered?: string; reset?: string; error?: string; from?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="kh-card w-full max-w-md p-6">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-ink">ចូលប្រើគណនី</p>
          <p className="mt-2 text-sm text-slate-500">ចូលប្រើ KhmerMeet AI ជាមួយគណនីរបស់អ្នក</p>
        </div>
        <LoginForm
          justRegistered={params.registered === "1"}
          justReset={params.reset === "1"}
          errorCode={params.error ?? null}
          callbackUrl={params.from || "/dashboard"}
        />
      </section>
    </main>
  );
}
