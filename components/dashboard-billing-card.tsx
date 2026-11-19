"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Clock3, CreditCard, QrCode, X } from "lucide-react";

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
      : t("ឥតគិតថ្លៃ · 30 នាទី/ខែ", "Free · 30 minutes/month");

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

  async function submitManualPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/billing/manual/submit", { method: "POST", body: new FormData(event.currentTarget) });
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
              <p className="mt-1 text-sm text-slate-600">
                {t(`បានប្រើ ${usedMinutes} នាទី`, `${usedMinutes} minutes used`)}
                {remainingMinutes !== null ? t(` · នៅសល់ ${remainingMinutes} នាទី`, ` · ${remainingMinutes} minutes remaining`) : ""}
              </p>
              {quota.plan !== "unlimited" && <p className="mt-1 text-xs text-slate-500">{t("កំណត់ឡើងវិញ៖ ", "Resets: ")}{new Date(quota.periodEnd).toLocaleDateString(language === "km" ? "km-KH" : "en-US")}</p>}
              {pending && <p className="mt-2 text-sm font-semibold text-amber-700">{t("ការបង់តាម QR កំពុងរង់ចាំការត្រួតពិនិត្យ។", "Your QR payment is awaiting review.")}</p>}
              {quota.manualPaymentStatus === "rejected" && !pending && <p className="mt-2 text-sm text-red-600">{t("ការបង់មុនមិនត្រូវបានអនុម័ត។ សូមពិនិត្យលេខប្រតិបត្តិការ ហើយផ្ញើម្តងទៀត។", "The previous payment was not approved. Check the reference and resubmit.")}</p>}
            </div>
          </div>
          {quota.plan !== "unlimited" && (
            <div className="flex flex-wrap gap-2">
              {quota.plan === "free" && (
                <button type="button" onClick={() => { setError(""); setShowQr(true); }} disabled={busy || pending || !quota.qrAvailable} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#087862] bg-white px-4 py-3 text-sm font-bold text-[#087862] transition hover:bg-[#eef9f4] disabled:cursor-not-allowed disabled:opacity-50">
                  <QrCode className="h-4 w-4" />{pending ? t("កំពុងរង់ចាំ", "Awaiting review") : t("បង់តាម QR", "Pay by QR")}
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
        {!quota.qrAvailable && quota.plan === "free" && <p className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-800">{t("QR មិនទាន់បានដាក់ដោយអ្នកគ្រប់គ្រងទេ។", "The payment QR has not been uploaded by an administrator yet.")}</p>}
        {error && <p role="alert" className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p>}
      </section>

      {showQr && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="qr-payment-title">
          <div className="relative my-6 w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <button type="button" onClick={() => setShowQr(false)} className="absolute right-3 top-3 rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label={t("បិទ", "Close")}><X className="h-5 w-5" /></button>
            <h2 id="qr-payment-title" className="pr-10 text-xl font-black text-[#073f39]">{t("បង់ $15 តាម QR", "Pay $15 by QR")}</h2>
            <p className="mt-1 text-sm text-slate-600">{t("ស្កេន QR រួចបញ្ចូលលេខប្រតិបត្តិការ។ ក្រោយអនុម័ត អ្នកទទួលបាន 10 ម៉ោងសម្រាប់ 1 ខែ។", "Scan the QR, then enter the transaction reference. Approval adds 10 hours for one month.")}</p>
            <div className="mx-auto mt-4 w-full max-w-sm overflow-hidden rounded-xl border bg-white">
              <Image src="/api/billing/manual/qr" alt={t("ACLEDA QR សម្រាប់បង់ប្រាក់", "ACLEDA payment QR")} width={895} height={1263} className="h-auto w-full" unoptimized />
            </div>
            <form onSubmit={(event) => void submitManualPayment(event)} className="mt-4 space-y-3">
              <label className="block text-sm font-semibold text-slate-700">{t("លេខប្រតិបត្តិការ", "Transaction reference")}<input name="transactionRef" required minLength={4} maxLength={100} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#087862]" placeholder={t("ឧ. លេខក្នុងបង្កាន់ដៃ", "Reference shown on your receipt")} /></label>
              <label className="block text-sm font-semibold text-slate-700">{t("រូបបង្កាន់ដៃ (ជាជម្រើស)", "Receipt image (optional)")}<input name="receipt" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block w-full rounded-xl border border-slate-300 p-2 text-sm" /></label>
              <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#087862] px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? t("កំពុងផ្ញើ...", "Submitting...") : t("ផ្ញើឲ្យពិនិត្យ", "Submit for review")}</button>
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
