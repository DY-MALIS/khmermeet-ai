import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth-form";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="kh-card w-full max-w-md p-6">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-ink">Reset password</p>
          <p className="mt-2 text-sm text-slate-500">Enter your new password.</p>
        </div>
        {token ? (
          <ResetPasswordForm token={token} errorCode={params.error ?? null} />
        ) : (
          <div className="space-y-4 text-center">
            <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">This link is invalid. Request a new link.</p>
            <Link className="font-semibold text-leaf" href="/forgot-password">Request a new link</Link>
          </div>
        )}
      </section>
    </main>
  );
}
