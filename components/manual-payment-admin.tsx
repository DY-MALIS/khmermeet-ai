"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, QrCode, RefreshCw, X } from "lucide-react";

type Payment = {
  id: string;
  transactionRef: string;
  receiptMimeType: string | null;
  createdAt: string;
  user: { name: string; email: string };
};

export function ManualPaymentAdmin() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadPayments = useCallback(async () => {
    const response = await fetch("/api/billing/manual/review", { cache: "no-store" });
    const result = await response.json() as { payments?: Payment[]; error?: string };
    if (!response.ok) throw new Error(result.error || "មិនអាចទាញយកការបង់ប្រាក់បាន។");
    setPayments(result.payments ?? []);
  }, []);

  useEffect(() => {
    void loadPayments().catch((cause) => setMessage(cause instanceof Error ? cause.message : "មិនអាចទាញយកការបង់ប្រាក់បាន។"));
  }, [loadPayments]);

  async function uploadQr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/billing/manual/qr", { method: "POST", body: new FormData(event.currentTarget) });
    const result = await response.json() as { error?: string };
    setBusy(false);
    setMessage(response.ok ? "បានរក្សាទុក QR សម្រាប់ការបង់ប្រាក់។" : result.error || "មិនអាចរក្សាទុក QR បាន។");
  }

  async function review(id: string, action: "approve" | "reject") {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/billing/manual/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action })
    });
    const result = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error || "មិនអាចពិនិត្យការបង់ប្រាក់បាន។");
      return;
    }
    setMessage(action === "approve" ? "បានអនុម័ត និងបើក 10 ម៉ោងសម្រាប់ 1 ខែ។" : "បានបដិសេធការបង់ប្រាក់។");
    await loadPayments();
  }

  return (
    <section className="kh-card space-y-5 p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-leaf">សម្រាប់អ្នកគ្រប់គ្រង</p>
        <h2 className="mt-1 text-lg font-bold">QR និងការអនុម័តការបង់ប្រាក់</h2>
        <p className="mt-1 text-sm text-slate-600">ដាក់រូប QR ដើមរបស់ធនាគារ។ អ្នកប្រើនឹងឃើញវានៅ Dashboard ពេលចុច “បង់តាម QR”។</p>
      </div>
      <form onSubmit={(event) => void uploadQr(event)} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        <label className="sm:col-span-2 text-sm font-semibold">រូប QR (PNG/JPG/WebP, អតិបរមា 5 MB)<input name="image" type="file" required accept="image/png,image/jpeg,image/webp" className="mt-1 block w-full rounded-lg border bg-white p-2 text-sm" /></label>
        <label className="text-sm font-semibold">ឈ្មោះអ្នកទទួល<input name="payeeName" defaultValue="PHON THA" className="mt-1 w-full rounded-lg border bg-white px-3 py-2" /></label>
        <label className="text-sm font-semibold">Merchant ID<input name="merchantId" defaultValue="32890217" className="mt-1 w-full rounded-lg border bg-white px-3 py-2" /></label>
        <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-2.5 font-semibold text-white disabled:opacity-50 sm:col-span-2"><QrCode className="h-4 w-4" />រក្សាទុក QR</button>
      </form>

      <div className="border-t pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold">ការបង់ប្រាក់កំពុងរង់ចាំ ({payments.length})</h3>
          <button type="button" onClick={() => void loadPayments()} className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50" aria-label="ផ្ទុកឡើងវិញ"><RefreshCw className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 space-y-3">
          {payments.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">មិនមានការបង់ប្រាក់កំពុងរង់ចាំទេ។</p> : payments.map((payment) => (
            <article key={payment.id} className="rounded-xl border border-slate-200 p-4">
              <p className="font-bold text-ink">{payment.user.name} · {payment.user.email}</p>
              <p className="mt-1 text-sm text-slate-600">លេខប្រតិបត្តិការ៖ <span className="font-mono font-semibold text-ink">{payment.transactionRef}</span></p>
              <p className="text-xs text-slate-500">{new Date(payment.createdAt).toLocaleString("km-KH")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {payment.receiptMimeType && <a href={`/api/billing/manual/receipt/${payment.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold"><ExternalLink className="h-4 w-4" />មើលបង្កាន់ដៃ</a>}
                <button type="button" disabled={busy} onClick={() => void review(payment.id, "approve")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4" />អនុម័ត</button>
                <button type="button" disabled={busy} onClick={() => void review(payment.id, "reject")} className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><X className="h-4 w-4" />បដិសេធ</button>
              </div>
            </article>
          ))}
        </div>
      </div>
      {message && <p role="status" className="rounded-lg bg-slate-50 px-4 py-3 text-sm font-semibold">{message}</p>}
    </section>
  );
}
