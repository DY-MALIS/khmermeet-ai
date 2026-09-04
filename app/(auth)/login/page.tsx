import { LoginForm } from "@/components/auth-form";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="kh-card w-full max-w-sm p-8 sm:p-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-leaf text-2xl font-black text-white shadow-lg shadow-leaf/30">
            K
          </div>
          <p className="text-2xl font-bold text-ink">KhmerMeet AI</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            AI meeting recorder and action tracker for Cambodian teams. Sign in with your Google account to continue.
          </p>
        </div>
        <LoginForm errorCode={params.error ?? null} callbackUrl={params.from || "/dashboard"} />
      </section>
    </main>
  );
}
