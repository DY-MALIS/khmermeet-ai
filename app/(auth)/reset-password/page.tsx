import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="kh-card w-full max-w-md p-6">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-ink">កំណត់ពាក្យសម្ងាត់ថ្មី</p>
          <p className="mt-2 text-sm text-slate-500">សូមវាយពាក្យសម្ងាត់ថ្មីរបស់អ្នក</p>
        </div>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="space-y-4 text-center">
            <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Link នេះមិនត្រឹមត្រូវទេ។ សូមស្នើសុំ link ថ្មី។</p>
            <Link className="font-semibold text-leaf" href="/forgot-password">ស្នើសុំ link ថ្មី</Link>
          </div>
        )}
      </section>
    </main>
  );
}
