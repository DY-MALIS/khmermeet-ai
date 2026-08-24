import { ForgotPasswordForm } from "@/components/auth-form";

export default async function ForgotPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="kh-card w-full max-w-md p-6">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-ink">Forgot password</p>
          <p className="mt-2 text-sm text-slate-500">We will send a password reset link to your email.</p>
        </div>
        <ForgotPasswordForm sent={params.sent === "1"} errorCode={params.error ?? null} />
      </section>
    </main>
  );
}
