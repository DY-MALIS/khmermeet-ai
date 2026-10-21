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

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <section className="w-full max-w-sm">
        <div className="kh-card relative overflow-hidden p-8 sm:p-10">
          <div className="pointer-events-none absolute inset-x-0 -top-28 h-48 bg-gradient-to-b from-leaf/25 via-saffron/10 to-transparent blur-2xl" />
          <div className="relative text-center">
            <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-leaf to-emerald-600 text-3xl font-black text-white shadow-lg shadow-leaf/30 ring-4 ring-white/70">
              K
            </div>
            <p className="text-2xl font-bold tracking-tight text-ink">KhmerMeet AI</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {language === "km" ? "ឧបករណ៍ថត និងតាមដានកិច្ចការប្រជុំដោយ AI សម្រាប់ក្រុមការងារកម្ពុជា។" : "AI meeting recorder and action tracker for Cambodian teams."}
            </p>
          </div>
          <div className="relative mt-8">
            <LoginForm errorCode={params.error ?? null} callbackUrl={params.from || "/dashboard"} />
          </div>
          <div className="relative mt-5"><LanguageSwitcher compact /></div>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">{language === "km" ? "ចូលដោយសុវត្ថិភាពតាមរយៈគណនី Google របស់អ្នក" : "Sign in securely with your Google account"}</p>
      </section>
    </main>
  );
}
