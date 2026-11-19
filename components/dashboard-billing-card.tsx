"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Clock3, CreditCard, QrCode, X } from "lucide-react";
import { SUPPORT_TELEGRAM_URL } from "@/lib/support-contact";

type Quota = {
  plan: "free" | "pro" | "unlimited";
  usedSeconds: number;
  limitSeconds: number | null;
  remainingSeconds: number | null;
  periodEnd: string;
  manualPaymentStatus: string | null;
  manualPaymentCreatedAt: string | null;
  qrAvailable: boolean;
};

export function DashboardBillingCard({ quota, language }: { quota: Quota; language: "km" | "en" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const t = (km: string, en: string) => language === "km" ? km : en;
  const usedMinutes = Math.ceil(quota.usedSeconds / 60);
  const remainingMinutes = quota.remainingSeconds === null ? null : Math.floor(quota.remainingSeconds / 60);
  const pending = quota.manualPaymentStatus === "pending" || submitted;
  const planLabel = quota.plan === "unlimited"
    ? t("ប្រើប្រាស់មិនកំណត់", "Unlimited access")
    : quota.plan === "pro"
      ? t("Pro · $15/ខែ · 10 ម៉ោង", "Pro · $15/month · 10 hours")
      : t("ឥតគិតថ្លៃ · 20 នាទី/ខែ", "Free · 20 minutes/month");
  const remaining = quota.remainingSeconds;
  const warning = remaining !== null && remaining <= (quota.plan === "free" ? 5 * 60 : 60 * 60);
  const exhausted = remaining !== null && remaining <= 0;
  const percentUsed = quota.limitSeconds ? Math.min(100, Math.round(quota.usedSeconds / quota.limitSeconds * 100)) : 0;

  async function openStripe() {
    setBusy(true);
    setError("");
    try {
      const kind = quota.plan === "pro" ? "portal" : "checkout";
      const response = await fetch(`/api/billing/${kind}`, { method: "POST" });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || t("មិនអាចបើកការបង់ប្រាក់បាន។", "Could not open billing."));
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("មិនអាចបើកការបង់ប្រាក់បាន។", "Could not open billing."));
      setBusy(false);
    }
  }

  async function submitManualPayment() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/billing/manual/submit", { method: "POST" });
    const result = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(result.error || t("មិនអាចផ្ញើការបង់ប្រាក់បាន។", "Could not submit payment."));
      return;
    }
    setSubmitted(true);
    setShowQr(false);
    router.refresh();
  }

  return (
    <>
      <section className="overflow-hidden rounded-[1.4rem] border border-[#cfe4da] bg-white shadow-lg shadow-[#073f39]/8">
        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e1f3eb] text-[#087862]"><Clock3 className="h-5 w-5" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[#087862]">{t("ដែនកំណត់ និងការបង់ប្រាក់", "Usage and billing")}</p>
              <h2 className="mt-1 text-lg font-black text-[#073f39]">{planLabel}</h2>
              {quota.plan === "free" && (
                <p className="mt-2 inline-flex rounded-lg bg-[#fff4dc] px-3 py-2 text-sm font-black text-[#8a5a05] ring-1 ring-[#f0d58e]">
                  {t("គម្រោង Pro៖ $15/ខែ · ប្រើបាន 10 ម៉ោង", "Pro plan: $15/month · 10 hours")}
                </p>
              )}
              <p className="mt-1 text-sm text-slate-600">
                {t(`បានប្រើ ${usedMinutes} នាទី`, `${usedMinutes} minutes used`)}
                {remainingMinutes !== null ? t(` · នៅសល់ ${remainingMinutes} នាទី`, ` · ${remainingMinutes} minutes remaining`) : ""}
              </p>
              {quota.limitSeconds !== null && (
                <div className="mt-3" role="progressbar" aria-label={t("ម៉ោងនិយាយបានប្រើ", "Speech time used")} aria-valuenow={Math.min(quota.usedSeconds, quota.limitSeconds)} aria-valuemin={0} aria-valuemax={quota.limitSeconds}>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${exhausted ? "bg-red-600" : warning ? "bg-amber-500" : "bg-[#087862]"}`} style={{ width: `${percentUsed}%` }} /></div>
                  <p className={`mt-1 text-xs font-semibold ${exhausted ? "text-red-700" : warning ? "text-amber-700" : "text-slate-500"}`}>{exhausted ? t("ម៉ោងនិយាយបានអស់", "Speech time exhausted") : warning ? t("ម៉ោងនិយាយជិតអស់", "Speech time is running low") : t("គិតតែពេលមានការនិយាយ", "Only spoken time counts")}</p>
                </div>
              )}
              {quota.plan !== "unlimited" && <p className="mt-1 text-xs text-slate-500">{t("កំណត់ឡើងវិញ៖ ", "Resets: ")}{new Date(quota.periodEnd).toLocaleDateString(language === "km" ? "km-KH" : "en-US")}</p>}
              {pending && <p className="mt-2 text-sm font-semibold text-amber-700">{t("ការបង់តាម QR កំពុងរង់ចាំការត្រួតពិនិត្យ។", "Your QR payment is awaiting review.")}</p>}
              {quota.manualPaymentStatus === "rejected" && !pending && <p className="mt-2 text-sm text-red-600">{t("សំណើបង់ប្រាក់មុនមិនត្រូវបានអនុម័ត។ បើអ្នកបានបង់ប្រាក់ សូមទាក់ទងមកយើងតាម Telegram។", "The previous payment request was not approved. If you paid, please contact us on Telegram.")}</p>}
            </div>
          </div>
          {quota.plan !== "unlimited" && (
            <div className="flex flex-wrap gap-2">
              {quota.plan === "free" && (
                <button type="button" onClick={() => { setError(""); setShowQr(true); }} disabled={busy || pending || !quota.qrAvailable} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#087862] bg-white px-4 py-3 text-sm font-bold text-[#087862] transition hover:bg-[#eef9f4] disabled:cursor-not-allowed disabled:opacity-50">
                  <QrCode className="h-4 w-4" />{pending ? t("កំពុងរង់ចាំ", "Awaiting review") : t("បង់ $15 តាម QR", "Pay $15 by QR")}
                </button>
              )}
              <button type="button" onClick={() => void openStripe()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#087862] px-4 py-3 text-sm font-bold text-white shadow-md shadow-[#087862]/20 transition hover:bg-[#065d50] disabled:opacity-50">
                <CreditCard className="h-4 w-4" />
                {quota.plan === "pro" ? t("គ្រប់គ្រងការបង់ប្រាក់", "Manage billing") : t("បង់តាមកាត $15/ខែ", "Pay by card · $15/month")}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {!quota.qrAvailable && quota.plan === "free" && <p className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800">{t("តម្លៃ $15/ខែ សម្រាប់ 10 ម៉ោង។ QR មិនទាន់បានដាក់ដោយអ្នកគ្រប់គ្រងទេ។", "$15/month for 10 hours. The payment QR has not been uploaded by an administrator yet.")}</p>}
        {error && <p role="alert" className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p>}
      </section>

      {showQr && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="qr-payment-title">
          <div className="relative my-6 w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <button type="button" onClick={() => setShowQr(false)} className="absolute right-3 top-3 rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label={t("បិទ", "Close")}><X className="h-5 w-5" /></button>
            <h2 id="qr-payment-title" className="pr-10 text-xl font-black text-[#073f39]">{t("បង់ $15 តាម QR", "Pay $15 by QR")}</h2>
            <p className="mt-1 text-sm text-slate-600">{t("ស្កេន QR ហើយបង់ប្រាក់។ បន្ទាប់ពីបង់រួច ចុចប៊ូតុងខាងក្រោមឲ្យយើងពិនិត្យ។ ក្រោយផ្ទៀងផ្ទាត់ប្រាក់ចូល អ្នកទទួលបាន 10 ម៉ោងសម្រាប់ 1 ខែ។", "Scan the QR and pay. Once paid, tap the button below to request a review. After we verify the payment, you get 10 hours for one month.")}</p>
            <div className="mx-auto mt-4 w-full max-w-sm overflow-hidden rounded-xl border bg-white">
              <Image src="/payment-qr-malis-dy.png" alt={t("QR បង់ប្រាក់ទៅ MALIS DY", "Payment QR for MALIS DY")} width={1258} height={1279} className="h-auto w-full" unoptimized />
            </div>
            <div className="mt-4 space-y-3">
              <button type="button" onClick={() => void submitManualPayment()} disabled={busy} className="w-full rounded-xl bg-[#087862] px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? t("កំពុងផ្ញើ...", "Submitting...") : t("បានបង់រួច — ជូនដំណឹងឲ្យពិនិត្យ", "I've paid — request review")}</button>
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            </div>
            <a href={SUPPORT_TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="mt-4 flex min-h-11 items-center justify-center rounded-xl border border-[#087862] px-4 py-3 text-center text-sm font-bold text-[#087862] hover:bg-[#eef9f4]">
              {t("សួរអំពីការបង់ប្រាក់តាម Telegram · @malis7171", "Ask about payment on Telegram · @malis7171")}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
