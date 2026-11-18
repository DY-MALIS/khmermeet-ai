import { AudioLines, Check, ClipboardList, Sparkles } from "lucide-react";
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
  const benefits = [
    { icon: AudioLines, title: km ? "សំឡេងទៅជាអត្ថបទ" : "Audio to text", detail: km ? "ថត និងបម្លែងសំឡេងប្រជុំខ្មែរ និងអង់គ្លេស" : "Capture Khmer and English conversations" },
    { icon: Sparkles, title: km ? "សេចក្ដីសង្ខេបដោយ AI" : "AI meeting summaries", detail: km ? "យល់ចំណុចសំខាន់ដោយមិនចាំបាច់ស្តាប់ឡើងវិញ" : "Find the key points without replaying the call" },
    { icon: ClipboardList, title: km ? "កិច្ចការបន្ទាប់" : "Clear next steps", detail: km ? "រក្សាទុកការសម្រេចចិត្ត និងតាមដានកិច្ចការ" : "Keep decisions and action items together" }
  ];

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#bcc8bb] px-3 py-6 sm:px-8 sm:py-10 lg:px-14">
      <section className="w-full max-w-[1280px] overflow-hidden rounded-[22px] border-[3px] border-white bg-[#fbfcf9] shadow-[0_28px_80px_rgba(49,67,53,0.12)]">
        <div aria-hidden="true" className="flex h-7 items-center gap-2 border-b-[3px] border-white bg-[#b7c4b5] px-4">
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
        </div>

        <div className="grid min-h-[720px] lg:grid-cols-2">
          <div className="flex min-h-[720px] flex-col px-6 pb-6 pt-7 sm:px-10 lg:px-12">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-[#133a38]">
                <span className="grid h-9 w-9 place-items-center rounded-full border border-[#cfddd0] bg-[#e8f0e6]"><AudioLines className="h-[19px] w-[19px]" strokeWidth={2.1} /></span>
                <span className="text-base font-bold tracking-tight">KhmerMeet AI</span>
              </div>
              <LanguageSwitcher variant="auth" />
            </div>

            <div className="my-auto w-full max-w-[380px] self-center py-9">
              <div className="text-center">
                <h1 className="text-[2rem] font-bold leading-tight tracking-tight text-[#153b3b] sm:text-[2.25rem]">
                  {km ? "សូមស្វាគមន៍មកវិញ" : "Welcome back"}
                </h1>
                <p className="mt-2 text-sm text-[#5e746b]">
                  {km ? "ចូលគណនី ដើម្បីបន្តការងាររបស់អ្នក" : "Your meetings, notes, and next steps are here."}
                </p>
              </div>

              <div className="mt-8">
                <LoginForm errorCode={params.error ?? null} callbackUrl={params.from || "/dashboard"} />
              </div>

              <div className="mt-9 border-t border-[#dce7dc] pt-6">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.13em] text-[#45684e]">
                  {km ? "អ្វីដែលអ្នកអាចធ្វើបាន" : "WHAT YOU CAN DO"}
                </p>
                <div className="space-y-4">
                  {benefits.map(({ icon: Icon, title, detail }) => (
                    <div key={title} className="flex items-start gap-3">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e6eee4] text-[#436846]"><Icon className="h-4 w-4" strokeWidth={1.8} /></span>
                      <div>
                        <p className="text-sm font-semibold leading-5 text-[#173c39]">{title}</p>
                        <p className="mt-0.5 text-xs leading-5 text-[#63776c]">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-xs text-[#6d8073]">© {new Date().getFullYear()} KhmerMeet AI</p>
          </div>

          <div aria-hidden="true" className="relative hidden min-h-[720px] overflow-hidden bg-[#dce9d9] lg:block">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/login-sage-path.webp')" }} />
            <div className="absolute left-8 top-8 flex items-center gap-2 rounded-full border border-white/50 bg-white/45 px-3 py-1.5 text-xs font-medium text-[#405b49] backdrop-blur-sm">
              <Check className="h-3.5 w-3.5" />
              {km ? "ប្រជុំកាន់តែងាយស្រួល" : "Meetings made clearer"}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
