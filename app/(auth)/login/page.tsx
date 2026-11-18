import { CheckCircle2, FileText, Globe2, Mic2, ShieldCheck, Video } from "lucide-react";
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
  const features = [
    { icon: Mic2, kh: "ថតកិច្ចប្រជុំ", en: "Record meetings", detail: "Record Meeting" },
    { icon: FileText, kh: "សង្ខេបដោយ AI", en: "AI summaries", detail: "AI Summary" },
    { icon: CheckCircle2, kh: "តាមដានការងារ", en: "Track actions", detail: "Action Tracking" }
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#073f39] text-[#073f39] lg:bg-[url('/login-khmermeet-hero.webp')] lg:bg-cover lg:bg-center">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[540px] bg-gradient-to-b from-[#043f38]/70 to-transparent lg:hidden" aria-hidden="true" />
      <div className="relative mx-auto grid min-h-screen max-w-[1760px] lg:grid-cols-[49%_51%]">
        <div className="flex flex-col px-6 pb-8 pt-9 text-white sm:px-10 lg:min-h-[850px] lg:px-12 lg:pt-12 xl:px-20 xl:pt-16">
          <div className="flex items-center gap-4">
            <span className="relative grid h-16 w-16 shrink-0 place-items-center rounded-[1.4rem] border-[3px] border-white bg-gradient-to-br from-[#047861] to-[#04ae77] shadow-xl shadow-black/15 sm:h-20 sm:w-20">
              <Video className="h-8 w-8 fill-white stroke-white sm:h-10 sm:w-10" strokeWidth={1.7} />
              <span className="absolute -bottom-2 left-1 h-4 w-4 rotate-[-28deg] rounded-sm border-b-[3px] border-l-[3px] border-white bg-[#047861]" />
            </span>
            <div className="text-[2rem] font-black leading-none tracking-tight sm:text-[2.6rem] xl:text-[3.5rem]">
              KhmerMeet <span className="text-[#f5cb3f]">AI</span>
            </div>
          </div>
          <p className="mt-5 max-w-[640px] text-base font-semibold leading-8 text-white/95 sm:text-xl xl:text-2xl">
            {km ? "ប្រព័ន្ធជំនួយការ AI សម្រាប់កិច្ចប្រជុំឆ្លាតវៃ" : "Your AI assistant for smarter meetings"}
          </p>
          <div aria-hidden="true" className="mt-4 h-1 w-40 rounded-full bg-gradient-to-r from-[#06d69a] to-transparent" />

          <div className="mt-8 grid max-w-[670px] grid-cols-3 divide-x divide-emerald-200/50 sm:mt-12">
            {features.map(({ icon: Icon, kh, en, detail }) => (
              <div key={detail} className="flex flex-col items-center px-2 text-center sm:px-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#087860] to-[#03b47f] shadow-md shadow-black/10 sm:h-14 sm:w-14">
                  <Icon className="h-6 w-6 text-white sm:h-7 sm:w-7" strokeWidth={2.1} />
                </span>
                <span className="mt-3 text-xs font-semibold leading-5 sm:text-sm">{km ? kh : en}</span>
                <span className="mt-1 hidden text-xs leading-4 text-white/75 sm:block">({detail})</span>
              </div>
            ))}
          </div>
          <div className="mt-auto hidden min-h-20 lg:block" />
        </div>

        <div className="flex items-center justify-center px-4 pb-12 pt-4 sm:px-8 lg:min-h-[850px] lg:px-10 lg:py-10 xl:px-14">
          <section className="w-full max-w-[630px] rounded-[2rem] border border-white/90 bg-white/95 px-6 py-8 shadow-[0_24px_70px_rgba(17,65,59,0.18)] backdrop-blur-md sm:px-10 sm:py-10 xl:px-12 xl:py-12">
            <div className="flex flex-col items-center text-center">
              <span className="relative grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#047862] to-[#02ab77] text-white shadow-md shadow-emerald-900/10">
                <Video className="h-8 w-8 fill-white stroke-white" strokeWidth={1.7} />
                <span className="absolute -bottom-1 left-2 h-3 w-3 rotate-[-28deg] rounded-sm bg-[#047862]" />
              </span>
              <h1 className="mt-5 text-2xl font-bold tracking-tight text-[#075445] sm:text-3xl">
                KhmerMeet <span className="rounded-lg bg-[#087862] px-2 py-0.5 text-white">AI</span>
              </h1>
              <h2 className="mt-7 text-xl font-bold leading-8 text-[#0a5e4f] sm:text-[1.55rem]">
                {km ? "សូមស្វាគមន៍មកកាន់ KhmerMeet AI" : "Welcome to KhmerMeet AI"}
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                {km ? "ចូលប្រើប្រាស់ដើម្បីថត សង្ខេប និងតាមដានកិច្ចប្រជុំដោយ AI" : "Sign in to record, summarize, and follow up on meetings with AI."}
              </p>
            </div>

            <div className="mt-9">
              <LoginForm errorCode={params.error ?? null} callbackUrl={params.from || "/dashboard"} />
            </div>

            <div className="my-7 flex items-center gap-4 text-xs font-semibold text-slate-500">
              <span className="h-px flex-1 bg-slate-200" />
              <span>{km ? "ឬ" : "OR"}</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="flex items-center gap-2 text-sm font-semibold text-[#0a5e4f]">
              <Globe2 className="h-5 w-5" />
              {km ? "ភាសា / Language" : "Language / ភាសា"}
            </div>
            <div className="mt-3"><LanguageSwitcher variant="loginHero" /></div>

            <div className="mt-7 flex items-center justify-center gap-3 rounded-xl bg-[#e5f7f3] px-4 py-3.5 text-center text-xs font-medium leading-5 text-[#116b58] sm:text-sm">
              <ShieldCheck className="h-5 w-5 shrink-0" />
              <span>{km ? "ចូលប្រើប្រាស់ដោយសុវត្ថិភាព និងការពារទិន្នន័យ" : "Secure sign-in and protected meeting data"}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
