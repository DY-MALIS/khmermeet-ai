import { RegisterForm } from "@/components/auth-form";
import { isGoogleLoginEnabled } from "@/lib/auth";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="kh-card w-full max-w-md p-6">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-ink">Create account</p>
          <p className="mt-2 text-sm text-slate-500">Start using KhmerMeet AI for your team.</p>
        </div>
        <RegisterForm errorCode={params.error ?? null} googleEnabled={isGoogleLoginEnabled()} />
      </section>
    </main>
  );
}
