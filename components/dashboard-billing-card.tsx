"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { BILLING_PLANS, FREE_SECONDS, type PaidPlan } from "@/lib/billing-plans";
import { SUPPORT_TELEGRAM_URL } from "@/lib/support-contact";

type Quota = {
  plan: "free" | "pro" | "unlimited";
  planId: PaidPlan | "free" | "unlimited";
  billingMethod: "card" | "qr" | null;
  usedSeconds: number;
  limitSeconds: number | null;
  remainingSeconds: number | null;
  liveUsedSeconds: number;
  liveLimitSeconds: number | null;
  liveRemainingSeconds: number | null;
  periodEnd: string;
  manualPaymentStatus: string | null;
  manualPaymentCreatedAt: string | null;
  qrAvailable: boolean;
};

function Meter({ label, used, limit, language }: { label: string; used: number; limit: number | null; language: "km" | "en" }) {
  const remaining = limit === null ? null : Math.max(0, limit - used);
  const width = limit ? Math.min(100, used / limit * 100) : 0;
  return <div>
    <div className="flex justify-between gap-2 text-sm font-semibold"><span>{label}</span><span>{remaining === null ? "∞" : `${Math.floor(remaining / 60)} ${language === "km" ? "នាទីនៅសល់" : "min left"}`}</span></div>
    <p className="text-xs text-slate-500">{Math.ceil(used / 60)} / {limit === null ? "∞" : Math.ceil(limit / 60)} {language === "km" ? "នាទីបានប្រើ" : "minutes used"}</p>
    {limit !== null && <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)} className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${remaining === 0 ? "bg-red-600" : remaining! <= 3600 ? "bg-amber-500" : "bg-[#087862]"}`} style={{ width: `${width}%` }} /></div>}
  </div>;
}

export function DashboardBillingCard({ quota, language }: { quota: Quota; language: "km" | "en" }) {
  const router = useRouter();
  const [selected, setSelected] = useState<PaidPlan>(quota.planId === "plus" || quota.planId === "premium" ? quota.planId : "starter");
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const t = (km: string, en: string) => language === "km" ? km : en;
  const amount = BILLING_PLANS[selected].monthlyCents / 100;
  const currentName = quota.planId === "free" ? "Free" : quota.planId === "unlimited" ? "Unlimited" : BILLING_PLANS[quota.planId].name;
  const pending = submitted || quota.manualPaymentStatus === "pending";
  const features = [
    t("សួរ AI អំពីអត្ថបទប្រជុំ", "Ask AI about your meeting transcript"),
    t("សង្ខេបប្រជុំ និងបង្កើតបញ្ជីកិច្ចការ", "Meeting summaries and action items"),
    t("បកប្រែភាសាខ្មែរ និងអង់គ្លេស", "Khmer and English translation"),
    t("នាំចេញជា PowerPoint, Word និង Excel", "Export to PowerPoint, Word and Excel")
  ];

  useEffect(() => {
    if (!pending) return;
    const checkPayment = async () => {
      try {
        const response = await fetch("/api/billing/quota", { cache: "no-store" });
        if (!response.ok) return;
        const latest = await response.json() as Pick<Quota, "manualPaymentStatus" | "plan">;
        if (latest.manualPaymentStatus === "approved" && latest.plan !== "free") {
          setSubmitted(false);
          setPaymentNotice(language === "km" ? "ការបង់ប្រាក់បានអនុម័ត។ គម្រោងរបស់អ្នកអាចប្រើបានហើយ។" : "Payment approved. Your plan is ready to use.");
          router.refresh();
        } else if (latest.manualPaymentStatus === "rejected") {
          setSubmitted(false);
          setPaymentNotice(language === "km" ? "សំណើបង់ប្រាក់ត្រូវបានបដិសេធ។ សូមទាក់ទងផ្នែកជំនួយ។" : "Payment request rejected. Please contact support.");
          router.refresh();
        }
      } catch { /* A later check will retry after a network error. */ }
    };
    const interval = window.setInterval(() => { void checkPayment(); }, 15_000);
    return () => window.clearInterval(interval);
  }, [pending, router, language]);

  async function cardPayment() {
    setBusy(true); setError("");
    try {
      const endpoint = quota.plan === "free" ? "checkout" : "portal";
      const response = await fetch(`/api/billing/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: selected }) });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "Could not open billing.");
      window.location.assign(data.url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open billing."); setBusy(false); }
  }

  async function qrPayment() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/billing/manual/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: selected }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not request review.");
      setSubmitted(true); setShowQr(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not request review."); }
    finally { setBusy(false); }
  }

  return <section className="rounded-[1.4rem] border border-[#cfe4da] bg-white p-5 shadow-lg shadow-[#073f39]/8">
    <p className="text-xs font-bold uppercase tracking-wide text-[#087862]">{t("ម៉ោងប្រើប្រាស់ និងតម្លៃ", "Usage and pricing")}</p>
    <h2 className="mt-1 text-xl font-black text-[#073f39]">{t("គម្រោងបច្ចុប្បន្ន", "Current plan")}: {currentName}</h2>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <Meter label={t("Upload · ម៉ោងនិយាយ", "Upload · spoken time")} used={quota.usedSeconds} limit={quota.limitSeconds} language={language} />
      <Meter label={t("LiveKit · ម៉ោងប្រជុំ", "LiveKit · meeting time")} used={quota.liveUsedSeconds} limit={quota.liveLimitSeconds} language={language} />
    </div>
    <p className="mt-2 text-xs text-slate-500">{t("Upload រាប់តែពេលនិយាយ។ LiveKit រាប់រយៈពេលប្រជុំ។ កំណត់ឡើងវិញ៖ ", "Upload counts spoken time; LiveKit counts meeting time. Resets: ")}{new Date(quota.periodEnd).toLocaleDateString(language === "km" ? "km-KH" : "en-US")}</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className={`rounded-xl border p-4 text-left ${quota.planId === "free" ? "border-[#087862] bg-[#eef9f4] ring-2 ring-[#087862]/20" : "border-slate-200"}`}>
        <span className="block font-bold">Free</span>
        <span className="block text-2xl font-black">$0<span className="text-sm font-normal text-slate-500">{t("/ខែ", "/month")}</span></span>
        <span className="mt-3 block text-sm font-semibold">{t("Upload សំឡេង/វីដេអូ", "Audio/video upload")}: {FREE_SECONDS / 60} {t("នាទីនិយាយ", "spoken minutes")}</span>
        <span className="block text-sm font-semibold">{t("ប្រជុំផ្ទាល់ LiveKit", "LiveKit meetings")}: {FREE_SECONDS / 60} {t("នាទីប្រជុំ", "meeting minutes")}</span>
      </div>
      {(["starter", "plus", "premium"] as const).map((id) => {
        const plan = BILLING_PLANS[id];
        const highlighted = quota.planId === id || (quota.plan === "free" && selected === id);
        return <button key={id} type="button" disabled={quota.plan !== "free"} onClick={() => setSelected(id)} aria-pressed={quota.plan === "free" && selected === id} className={`rounded-xl border p-4 text-left disabled:cursor-default ${highlighted ? "border-[#087862] bg-[#eef9f4] ring-2 ring-[#087862]/20" : "border-slate-200 hover:border-[#087862]"}`}>
          <span className="block font-bold">{plan.name}</span>
          <span className="block text-2xl font-black">${plan.monthlyCents / 100}<span className="text-sm font-normal text-slate-500">{t("/ខែ", "/month")}</span></span>
          <span className="mt-3 block text-sm font-semibold">{t("Upload សំឡេង/វីដេអូ", "Audio/video upload")}: {plan.uploadSeconds / 3600} {t("ម៉ោងនិយាយ", "spoken hours")}</span>
          <span className="block text-sm font-semibold">{t("ប្រជុំផ្ទាល់ LiveKit", "LiveKit meetings")}: {plan.liveSeconds / 3600} {t("ម៉ោងប្រជុំ", "meeting hours")}</span>
        </button>;
      })}
    </div>
    <div className="mt-4 rounded-xl border border-[#d5e7e0] bg-[#f5faf7] p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[#087862]">{t("មុខងារដែលទទួលបាន", "Included features")}</p>
      <ul className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
        {features.map((feature) => <li key={feature} className="flex items-start gap-2 text-sm leading-5"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#087862]" />{feature}</li>)}
      </ul>
    </div>
    <p className="mt-3 text-xs text-slate-500">{t("គ្រប់គម្រោងមានមុខងារ AI ដូចគ្នា។ តម្លៃខុសគ្នាតាមចំនួនម៉ោង Upload និង LiveKit។", "All plans include the same AI features. Prices differ by upload and LiveKit hours.")}</p>
    {quota.plan === "pro" && <p className="mt-2 text-sm text-slate-600">{t("ចង់ប្ដូរគម្រោង? សូមទាក់ទងយើងតាម Telegram។", "Want to change plans? Contact us on Telegram.")}</p>}
    {pending && <p className="mt-3 text-sm font-semibold text-amber-700">{t("សំណើបង់តាម QR កំពុងរង់ចាំការផ្ទៀងផ្ទាត់។", "Your QR payment is awaiting review.")}</p>}
    {paymentNotice && <p role="status" className="mt-3 text-sm font-semibold text-emerald-700">{paymentNotice}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {quota.plan === "free" ? <>
        <button type="button" disabled={busy || pending || !quota.qrAvailable} onClick={() => setShowQr(true)} className="rounded-xl border border-[#087862] px-4 py-3 font-bold text-[#087862] disabled:opacity-50">{t(`បង់ $${amount} តាម QR`, `Pay $${amount} by QR`)}</button>
        <button type="button" disabled={busy} onClick={() => void cardPayment()} className="rounded-xl bg-[#087862] px-4 py-3 font-bold text-white disabled:opacity-50">{t(`បង់ $${amount} តាមកាត`, `Pay $${amount} by card`)}</button>
      </> : quota.plan === "pro" && quota.billingMethod === "card" && <button type="button" disabled={busy} onClick={() => void cardPayment()} className="rounded-xl bg-[#087862] px-4 py-3 font-bold text-white disabled:opacity-50">{t("គ្រប់គ្រងការបង់ប្រាក់", "Manage billing")}</button>}
      <a href={SUPPORT_TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-slate-300 px-4 py-3 font-bold">Telegram · @malis7171</a>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {showQr && <div role="dialog" aria-modal="true" aria-labelledby="qr-title" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
      <h3 id="qr-title" className="text-xl font-black">{t(`បង់ $${amount} តាម QR`, `Pay $${amount} by QR`)}</h3>
      <p className="mt-2 text-sm text-slate-600">{t("សូមផ្ទៀងផ្ទាត់ចំនួនទឹកប្រាក់មុនស្កេន។ ការបង់ QR ត្រូវឲ្យអ្នកគ្រប់គ្រងផ្ទៀងផ្ទាត់ មុនបើកគម្រោង។", "Check the amount before scanning. QR payments need manual verification before access is enabled.")}</p>
      <Image src="/payment-qr-malis-dy.png" alt="MALIS DY payment QR" width={1258} height={1279} className="mx-auto mt-4 h-auto w-full max-w-sm" unoptimized />
      <div className="mt-4 flex gap-2"><button type="button" disabled={busy} onClick={() => void qrPayment()} className="flex-1 rounded-xl bg-[#087862] px-4 py-3 font-bold text-white disabled:opacity-50">{t("បានបង់រួច · ស្នើឲ្យពិនិត្យ", "I've paid · request review")}</button><button type="button" onClick={() => setShowQr(false)} className="rounded-xl border px-4 py-3">{t("បិទ", "Close")}</button></div>
    </div></div>}
  </section>;
}
