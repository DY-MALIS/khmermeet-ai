import { AudioLines, ShieldCheck, Sparkles } from "lucide-react";
import { LoginForm } from "@/components/auth-form";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getServerUiText } from "@/lib/server-ui-text";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const params = await searchParams;
  const { language } = await getServerUiText();
  const km = language === "km";

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-[470px]">
        <div className="mb-6 flex items-center justify-between gap-4 px-1">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-leaf text-white shadow-md shadow-leaf/20">
              <AudioLines className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <span className="text-lg font-bold tracking-tight text-ink">KhmerMeet AI</span>
          </div>
          <LanguageSwitcher variant="auth" />
        </div>

        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/90 bg-white p-7 shadow-[0_24px_70px_rgba(18,72,62,0.13)] sm:p-10">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-leaf via-[#44c6a4] to-saffron" />
          <div className="mb-8 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-leaf ring-1 ring-leaf/10">
            <Sparkles className="h-6 w-6" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-leaf">
            {km ? "កន្លែងធ្វើការរបស់អ្នក" : "YOUR MEETING WORKSPACE"}
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-ink">
            {km ? "សូមស្វាគមន៍មកកាន់ KhmerMeet" : "Welcome to KhmerMeet"}
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            {km
              ? "ចូលដោយគណនី Google ដើម្បីកត់ត្រាការប្រជុំ បកប្រែសំឡេង និងតាមដានកិច្ចការ។"
              : "Sign in to capture meetings, translate speech, and keep your team moving."}
          </p>

          <div className="mt-9">
            <LoginForm errorCode={params.error ?? null} callbackUrl={params.from || "/dashboard"} />
          </div>

          <div className="mt-8 flex items-center justify-center gap-2 border-t border-slate-100 pt-6 text-center text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 shrink-0 text-leaf" />
            <span>{km ? "ចូលដោយសុវត្ថិភាពតាមរយៈ Google" : "Secure sign-in with Google"}</span>
          </div>
        </section>

        <p className="mt-6 text-center text-xs text-slate-500">
          {km ? "បង្កើតឡើងសម្រាប់ក្រុមការងារកម្ពុជា" : "Made for Cambodian teams"}
        </p>
      </div>
    </main>
  );
}
