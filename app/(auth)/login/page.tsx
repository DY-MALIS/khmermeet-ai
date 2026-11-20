import { CheckCircle2, FileText, Globe2, MessageCircle, Mic2, ShieldCheck, Video } from "lucide-react";
import { LoginForm } from "@/components/auth-form";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getServerUiText } from "@/lib/server-ui-text";
import { SUPPORT_TELEGRAM_URL } from "@/lib/support-contact";
import { getOptionalUser } from "@/lib/session";
import { redirect } from "next/navigation";

// Kept in the HTML so a delayed static stylesheet cannot leave the sign-in
// screen as unstyled browser defaults while a new deployment propagates.
const criticalLoginCss = `
  .login-main,.login-main *{box-sizing:border-box}
  .login-main{min-height:100vh;margin:0;overflow:hidden;color:#073f39;background:#073f39 url('/login-khmermeet-hero.webp') center/cover no-repeat;font-family:Arial,"Noto Sans Khmer",sans-serif}
  .login-main button{font:inherit;cursor:pointer}
  .login-main svg{display:block;width:24px;height:24px;flex:none}
  .login-ribbon{position:absolute;top:-220px;left:-170px;width:470px;height:365px;border-bottom:2px solid #e3b952;border-radius:0 0 85% 0;background:linear-gradient(135deg,#0ebf96b0,#05745d12);transform:rotate(-13deg);pointer-events:none}
  .login-layout{position:relative;display:grid;grid-template-columns:49% 51%;min-height:100vh;max-width:1760px;margin:auto}
  .login-left{position:relative;display:flex;flex-direction:column;min-height:850px;padding:56px 5vw 32px;color:#fff}
  .login-brand{display:flex;align-items:center;gap:16px}
  .login-brand-mark{position:relative;display:grid;flex:none;place-items:center;width:76px;height:76px;border:3px solid #fff;border-radius:24px;background:linear-gradient(135deg,#047861,#04ae77);box-shadow:0 12px 30px #001c1760}
  .login-brand-mark svg{width:38px;height:38px}
  .login-brand-title{font-size:clamp(32px,3vw,56px);font-weight:900;line-height:1.05;letter-spacing:-.04em}
  .login-brand-title span{color:#f5cb3f}
  .login-tagline{max-width:640px;margin:20px 0 0;font-size:clamp(17px,1.5vw,24px);font-weight:600;line-height:1.6}
  .login-features{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));max-width:670px;margin-top:48px}
  .login-feature{display:flex;flex-direction:column;align-items:center;min-width:0;padding:0 12px;text-align:center}
  .login-feature+.login-feature{border-left:1px solid #c8ebda77}
  .login-feature-icon{display:grid;place-items:center;width:54px;height:54px;border-radius:15px;background:linear-gradient(135deg,#087860,#03b47f);box-shadow:0 8px 20px #001c1740}
  .login-feature-title{margin-top:12px;font-size:14px;font-weight:700;line-height:1.5}
  .login-feature-detail{margin-top:3px;font-size:12px;color:#ffffffc9}
  .login-floating-stack{position:absolute;z-index:2;top:47%;left:47%;display:flex;flex-direction:column;gap:9px;width:min(260px,50%);pointer-events:none;transform:rotate(-2deg)}
  .login-floating-card{display:flex;align-items:center;gap:12px;min-height:58px;padding:8px 13px;border:1px solid #60f9e5b8;border-radius:15px;background:linear-gradient(110deg,#035d57d9,#058b7ab5);color:#fff;box-shadow:0 0 24px #2af5d466,0 10px 25px #001c1747;backdrop-filter:blur(12px)}
  .login-floating-card:nth-child(2){margin-left:22px}
  .login-floating-card:nth-child(3){margin-left:36px}
  .login-floating-card strong,.login-floating-card small{display:block;line-height:1.3}
  .login-floating-card strong{font-size:13px}
  .login-floating-card small{margin-top:2px;font-size:11px;color:#e5fff9}
  .login-floating-icon{display:grid;flex:none;place-items:center;width:38px;height:38px;border:1px solid #b5fff2a6;border-radius:10px;background:#e2fff62b}
  .login-floating-icon svg{width:21px;height:21px}
  .login-right{position:relative;display:flex;align-items:flex-start;justify-content:center;min-height:850px;padding:clamp(44px,6vh,84px) 5vw 40px}
  .login-ornament{position:absolute;top:12px;right:12px;width:92px;height:92px;color:#e7c473;opacity:.58;pointer-events:none}
  .login-ornament svg{width:100%;height:100%}
  .login-card{display:flex;flex-direction:column;width:100%;max-width:620px;min-height:760px;overflow:hidden;padding:44px 46px 0;border:1px solid #fff;border-radius:32px;background:#fffffff2;box-shadow:0 24px 70px #11413b30;backdrop-filter:blur(12px)}
  .login-card-head{display:flex;flex-direction:column;align-items:center;text-align:center}
  .login-card-logo{position:relative;display:grid;place-items:center;width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#047862,#02ab77);color:#fff}
  .login-card-logo svg{width:32px;height:32px}
  .login-card-title{margin:20px 0 0;color:#075445;font-size:30px;font-weight:800;letter-spacing:-.03em}
  .login-card-title span{padding:2px 8px;border-radius:8px;background:#087862;color:#fff}
  .login-card-subtitle{margin:28px 0 0;color:#0a5e4f;font-size:24px;font-weight:700;line-height:1.4}
  .login-card-copy{max-width:450px;margin:8px 0 0;color:#5a6970;font-size:14px;line-height:1.65}
  .login-card-action{margin-top:36px}
  .login-card-action button{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:58px;border:0;border-radius:12px;background:linear-gradient(90deg,#087f66,#05775f);color:#fff;font-size:16px;font-weight:700;box-shadow:0 8px 20px #065b492e}
  .login-card-action button:hover{background:#086e59}
  .login-card-action button:disabled{opacity:.6;cursor:wait}
  .login-card-action button svg{width:26px;height:26px;padding:4px;border-radius:50%;background:#fff}
  .login-divider{display:flex;align-items:center;gap:16px;margin:26px 0;color:#64748b;font-size:12px;font-weight:700}
  .login-divider span:first-child,.login-divider span:last-child{height:1px;flex:1;background:#d8e0e2}
  .login-divider-label{display:flex!important;align-items:center;gap:8px;white-space:nowrap;color:#0a5e4f;font-size:14px}
  .login-divider-label svg{width:18px;height:18px}
  .login-language-label{display:flex;align-items:center;gap:9px;color:#0a5e4f;font-size:14px;font-weight:700}
  .login-language-label svg{width:19px;height:19px}
  .login-language-switch{margin-top:12px}
  .login-language-switch>div{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .login-language-switch button{display:flex;align-items:center;justify-content:center;gap:9px;min-height:55px;border:1px solid #d8e1e1;border-radius:12px;background:#fff;color:#174d44;font-size:16px;font-weight:700;box-shadow:0 2px 6px #173c3912}
  .login-language-switch button[aria-pressed="true"]{border-color:#087862;background:#087862;color:#fff}
  .login-language-switch button span:first-child{font-size:22px}
  .login-trust{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:28px;padding:14px;border-radius:12px;background:#e5f7f3;color:#116b58;text-align:center;font-size:13px;font-weight:600;line-height:1.5}
  .login-trust svg{width:20px;height:20px}
  .login-card-art{height:145px;flex:none;margin:auto -46px 0;background:url('/login-angkor-footer.webp') center bottom/100% auto no-repeat;opacity:.72}
  @media(max-width:1023px){
    .login-main{background:#073f39}
    .login-layout{display:block}
    .login-left{min-height:0;padding:28px 24px 24px}
    .login-floating-stack,.login-ornament,.login-ribbon{display:none}
    .login-brand-mark{width:62px;height:62px;border-radius:20px}
    .login-brand-mark svg{width:30px;height:30px}
    .login-brand-title{font-size:clamp(26px,5vw,40px)}
    .login-tagline{margin-top:18px;font-size:16px}
    .login-features{margin-top:28px}
    .login-feature-icon{width:44px;height:44px}
    .login-feature-title{font-size:12px}
    .login-feature-detail{display:none}
    .login-right{min-height:0;padding:8px 16px 40px}
    .login-card{max-width:620px;min-height:0;padding:32px 24px 0}
    .login-card-art{height:110px;margin:14px -24px 0}
  }
  @media(max-width:430px){.login-brand{gap:12px}.login-brand-title{font-size:26px}.login-card-title{font-size:25px}.login-card-subtitle{font-size:19px}.login-card{padding:28px 20px 0}.login-card-art{margin-left:-20px;margin-right:-20px}.login-feature{padding:0 5px}}
`;

function AudioTileIcon({ icon }: { icon: "audio" | "summary" | "tasks" }) {
  const Icon = icon === "audio" ? Mic2 : icon === "summary" ? FileText : CheckCircle2;
  return <span className="login-floating-icon"><Icon aria-hidden="true" /></span>;
}

function LotusOrnament() {
  return (
    <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      {[0, 90, 180, 270].map((rotation) => (
        <g key={rotation} transform={`rotate(${rotation} 60 60)`}>
          <path d="M60 7C45 25 44 40 60 52C76 40 75 25 60 7Z" />
          <path d="M60 18C54 31 54 40 60 47C66 40 66 31 60 18Z" />
        </g>
      ))}
      <circle cx="60" cy="60" r="13" />
      <circle cx="60" cy="60" r="5" />
    </svg>
  );
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const params = await searchParams;
  if (await getOptionalUser().catch(() => null)) redirect("/dashboard");
  const { language } = await getServerUiText();
  const km = language === "km";
  const features = [
    { icon: Mic2, kh: "ថតកិច្ចប្រជុំ", en: "Record meetings", detail: "Record Meeting" },
    { icon: FileText, kh: "សង្ខេបដោយ AI", en: "AI summaries", detail: "AI Summary" },
    { icon: CheckCircle2, kh: "តាមដានការងារ", en: "Track actions", detail: "Action Tracking" }
  ];

  return (
    <main className="login-main relative min-h-screen overflow-hidden bg-[#073f39] text-[#073f39] lg:bg-[url('/login-khmermeet-hero.webp')] lg:bg-cover lg:bg-center">
      <style>{criticalLoginCss}</style>
      <div className="login-ribbon" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[540px] bg-gradient-to-b from-[#043f38]/70 to-transparent lg:hidden" aria-hidden="true" />
      <div className="login-layout relative mx-auto grid min-h-screen max-w-[1760px] lg:grid-cols-[49%_51%]">
        <div className="login-left flex flex-col px-6 pb-8 pt-9 text-white sm:px-10 lg:min-h-[850px] lg:px-12 lg:pt-12 xl:px-20 xl:pt-16">
          <div className="login-brand flex items-center gap-4">
            <span className="login-brand-mark relative grid h-16 w-16 shrink-0 place-items-center rounded-[1.4rem] border-[3px] border-white bg-gradient-to-br from-[#047861] to-[#04ae77] shadow-xl shadow-black/15 sm:h-20 sm:w-20">
              <Video className="h-8 w-8 fill-white stroke-white sm:h-10 sm:w-10" strokeWidth={1.7} />
              <span className="absolute -bottom-2 left-1 h-4 w-4 rotate-[-28deg] rounded-sm border-b-[3px] border-l-[3px] border-white bg-[#047861]" />
            </span>
            <div className="login-brand-title text-[2rem] font-black leading-none tracking-tight sm:text-[2.6rem] xl:text-[3.5rem]">
              KhmerMeet <span className="text-[#f5cb3f]">AI</span>
            </div>
          </div>
          <p className="login-tagline mt-5 max-w-[640px] text-base font-semibold leading-8 text-white/95 sm:text-xl xl:text-2xl">
            {km ? "ប្រព័ន្ធជំនួយការ AI សម្រាប់កិច្ចប្រជុំឆ្លាតវៃ" : "Your AI assistant for smarter meetings"}
          </p>
          <div aria-hidden="true" className="mt-4 h-1 w-40 rounded-full bg-gradient-to-r from-[#06d69a] to-transparent" />

          <div className="login-features mt-8 grid max-w-[670px] grid-cols-3 divide-x divide-emerald-200/50 sm:mt-12">
            {features.map(({ icon: Icon, kh, en, detail }) => (
              <div key={detail} className="login-feature flex flex-col items-center px-2 text-center sm:px-4">
                <span className="login-feature-icon grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#087860] to-[#03b47f] shadow-md shadow-black/10 sm:h-14 sm:w-14">
                  <Icon className="h-6 w-6 text-white sm:h-7 sm:w-7" strokeWidth={2.1} />
                </span>
                <span className="login-feature-title mt-3 text-xs font-semibold leading-5 sm:text-sm">{km ? kh : en}</span>
                <span className="login-feature-detail mt-1 hidden text-xs leading-4 text-white/75 sm:block">({detail})</span>
              </div>
            ))}
          </div>
          <div className="login-floating-stack" aria-hidden="true">
            <div className="login-floating-card">
              <AudioTileIcon icon="audio" />
              <span><strong>{km ? "កត់ត្រាកិច្ចប្រជុំ" : "Meeting transcript"}</strong><small>Transcription</small></span>
            </div>
            <div className="login-floating-card">
              <AudioTileIcon icon="summary" />
              <span><strong>{km ? "សង្ខេបដោយ AI" : "AI summary"}</strong><small>AI Summary</small></span>
            </div>
            <div className="login-floating-card">
              <AudioTileIcon icon="tasks" />
              <span><strong>{km ? "តាមដានការងារ" : "Action tracking"}</strong><small>Action Tracking</small></span>
            </div>
          </div>
          <div className="mt-auto hidden min-h-20 lg:block" />
        </div>

        <div className="login-right flex items-center justify-center px-4 pb-12 pt-4 sm:px-8 lg:min-h-[850px] lg:px-10 lg:py-10 xl:px-14">
          <div className="login-ornament" aria-hidden="true"><LotusOrnament /></div>
          <section className="login-card w-full max-w-[630px] rounded-[2rem] border border-white/90 bg-white/95 px-6 py-8 shadow-[0_24px_70px_rgba(17,65,59,0.18)] backdrop-blur-md sm:px-10 sm:py-10 xl:px-12 xl:py-12">
            <div className="login-card-head flex flex-col items-center text-center">
              <span className="login-card-logo relative grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#047862] to-[#02ab77] text-white shadow-md shadow-emerald-900/10">
                <Video className="h-8 w-8 fill-white stroke-white" strokeWidth={1.7} />
                <span className="absolute -bottom-1 left-2 h-3 w-3 rotate-[-28deg] rounded-sm bg-[#047862]" />
              </span>
              <h1 className="login-card-title mt-5 text-2xl font-bold tracking-tight text-[#075445] sm:text-3xl">
                KhmerMeet <span className="rounded-lg bg-[#087862] px-2 py-0.5 text-white">AI</span>
              </h1>
              <h2 className="login-card-subtitle mt-7 text-xl font-bold leading-8 text-[#0a5e4f] sm:text-[1.55rem]">
                {km ? "សូមស្វាគមន៍មកកាន់ KhmerMeet AI" : "Welcome to KhmerMeet AI"}
              </h2>
              <p className="login-card-copy mt-2 max-w-md text-sm leading-6 text-slate-600">
                {km ? "ចូលប្រើប្រាស់ដើម្បីថត សង្ខេប និងតាមដានកិច្ចប្រជុំដោយ AI" : "Sign in to record, summarize, and follow up on meetings with AI."}
              </p>
            </div>

            <div className="login-card-action mt-9">
              <LoginForm errorCode={params.error ?? null} callbackUrl={params.from || "/dashboard"} initialLanguage={language} />
            </div>

            <div className="login-divider my-7 flex items-center gap-4 text-xs font-semibold text-slate-500">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="login-divider-label"><Globe2 className="h-5 w-5" />{km ? "ភាសា / Language" : "Language / ភាសា"}</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="login-language-switch mt-3"><LanguageSwitcher variant="loginHero" initialLanguage={language} /></div>

            <div className="login-trust mt-7 flex items-center justify-center gap-3 rounded-xl bg-[#e5f7f3] px-4 py-3.5 text-center text-xs font-medium leading-5 text-[#116b58] sm:text-sm">
              <ShieldCheck className="h-5 w-5 shrink-0" />
              <span>{km ? "ចូលប្រើប្រាស់ដោយសុវត្ថិភាព និងការពារទិន្នន័យ" : "Secure sign-in and protected meeting data"}</span>
            </div>
            <a href={SUPPORT_TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="mt-4 flex flex-wrap items-center justify-center gap-1 text-center text-sm font-semibold text-[#087862] underline underline-offset-2 hover:text-[#065d50]">
              <MessageCircle className="h-4 w-4" />
              <span>{km ? "សួរអំពីអេប ការបង់ប្រាក់ ឬការប្រើប្រាស់ សូមទាក់ទងតាមរយៈ" : "For questions about the app, payments, or using it, contact us via"}</span>
              <span className="whitespace-nowrap">Telegram @malis7171</span>
            </a>
            <div className="login-card-art" aria-hidden="true" />
          </section>
        </div>
      </div>
    </main>
  );
}
