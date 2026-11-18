import { AudioLines, Check, ListChecks, ShieldCheck, Sparkles } from "lucide-react";
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-leaf/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-sky/15 blur-3xl" />

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_30px_90px_rgba(18,72,62,0.16)] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden min-h-[660px] overflow-hidden bg-[#075f53] px-12 py-12 text-white lg:flex lg:flex-col">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#42c5a7]/25 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[#8bd5c3]/20 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <AudioLines className="h-6 w-6" strokeWidth={2.25} />
            </div>
            <span className="text-xl font-bold tracking-tight">KhmerMeet AI</span>
          </div>

          <div className="relative mt-20 max-w-md">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-emerald-50">
              <Sparkles className="h-3.5 w-3.5" />
              {km ? "ជំនួយការប្រជុំសម្រាប់ក្រុមការងារ" : "A calmer way to run meetings"}
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-[2.75rem]">
              {km ? "ពីសំឡេងប្រជុំ ទៅជាការងារច្បាស់លាស់។" : "Every conversation, clearly captured."}
            </h1>
            <p className="mt-5 max-w-sm text-base leading-7 text-emerald-50/85">
              {km
                ? "រក្សាទុកការប្រជុំ បម្លែងសំឡេងជាអត្ថបទ និងតាមដានកិច្ចការសំខាន់ៗនៅកន្លែងតែមួយ។"
                : "Record meetings, find the important moments, and turn decisions into clear next steps."}
            </p>
          </div>

          <div className="relative mt-auto space-y-4">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-5 shadow-xl shadow-emerald-950/10 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-semibold"><AudioLines className="h-4 w-4 text-[#a9f2d4]" />{km ? "កំណត់ត្រាប្រជុំ" : "Meeting notes"}</span>
                <span className="rounded-full bg-[#b9f5da]/20 px-2.5 py-1 text-[11px] font-semibold text-[#d4ffea]">AI</span>
              </div>
              <div className="mt-5 space-y-3 text-sm text-emerald-50/90">
                <p className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-[#a9f2d4]" />{km ? "អត្ថបទប្រជុំដែលអាចស្វែងរកបាន" : "Searchable transcripts"}</p>
                <p className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-[#a9f2d4]" />{km ? "សេចក្ដីសង្ខេបងាយយល់" : "Summaries that get to the point"}</p>
                <p className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-[#a9f2d4]" />{km ? "កិច្ចការបន្ទាប់ច្បាស់លាស់" : "Action items your team can follow"}</p>
              </div>
            </div>
            <p className="flex items-center gap-2 text-xs text-emerald-50/70"><ListChecks className="h-4 w-4" />{km ? "បង្កើតឡើងសម្រាប់ក្រុមការងារកម្ពុជា" : "Made for Cambodian teams"}</p>
          </div>
        </div>

        <div className="flex min-h-[580px] flex-col px-6 py-7 sm:px-12 sm:py-10 lg:px-14">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 lg:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-leaf text-white shadow-sm"><AudioLines className="h-5 w-5" /></div>
              <span className="font-bold tracking-tight text-ink">KhmerMeet AI</span>
            </div>
            <div className="ml-auto"><LanguageSwitcher variant="auth" /></div>
          </div>

          <div className="my-auto w-full max-w-sm self-center py-12 lg:py-8">
            <div className="mb-7 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-leaf ring-1 ring-leaf/10 lg:hidden"><Sparkles className="h-7 w-7" /></div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-leaf">{km ? "ចូលទៅកន្លែងធ្វើការ" : "YOUR WORKSPACE"}</p>
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-ink sm:text-[2.1rem]">
              {km ? "សូមស្វាគមន៍មកវិញ" : "Welcome back"}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {km ? "ចូលដោយគណនី Google ដើម្បីបន្តការប្រជុំ និងកិច្ចការរបស់អ្នក។" : "Sign in with Google to pick up where your team left off."}
            </p>

            <div className="mt-9">
              <LoginForm errorCode={params.error ?? null} callbackUrl={params.from || "/dashboard"} />
            </div>

            <div className="mt-8 flex items-start gap-2.5 border-t border-slate-100 pt-6 text-xs leading-5 text-slate-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
              <span>{km ? "ចូលដោយសុវត្ថិភាពតាមរយៈ Google។" : "Secure sign-in with your Google account."}</span>
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-400">© {new Date().getFullYear()} KhmerMeet AI</p>
        </div>
      </section>
    </main>
  );
}
