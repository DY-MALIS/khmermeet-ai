import { ForgotPasswordForm } from "@/components/auth-form";

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="kh-card w-full max-w-sm p-8 sm:p-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-leaf text-2xl font-black text-white shadow-lg shadow-leaf/30">
            K
          </div>
          <p className="text-2xl font-bold text-ink">Forgot password</p>
        </div>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
