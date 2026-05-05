import { LoginForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="kh-card w-full max-w-md p-6">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-ink">KhmerMeet AI</p>
          <p className="mt-2 text-sm text-slate-500">ចូលប្រើដើម្បីគ្រប់គ្រងកិច្ចប្រជុំ និងកិច្ចការ</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
