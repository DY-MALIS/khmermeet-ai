"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { BILLING_PLANS, type PaidPlan } from "@/lib/billing-plans";

type Payment = {
  id: string;
  plan: PaidPlan;
  createdAt: string;
  user: { name: string; email: string };
};
type ApprovedPayment = Pick<Payment, "id" | "plan" | "user"> & { reviewedAt: string | null };
type RegisteredUser = { id: string; name: string; email: string };

export function ManualPaymentAdmin({ registeredUsers }: { registeredUsers: RegisteredUser[] }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [approved, setApproved] = useState<ApprovedPayment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [grantPlan, setGrantPlan] = useState<PaidPlan>("starter");
  const [reviewPlans, setReviewPlans] = useState<Record<string, PaidPlan>>({});
  const matchingUsers = registeredUsers.filter((account) =>
    `${account.name} ${account.email}`.toLocaleLowerCase().includes(userSearch.trim().toLocaleLowerCase())
  );

  const loadPayments = useCallback(async () => {
    const response = await fetch("/api/billing/manual/review", { cache: "no-store" });
    const result = await response.json() as { payments?: Payment[]; approved?: ApprovedPayment[]; error?: string };
    if (!response.ok) throw new Error(result.error || "មិនអាចទាញយកការបង់ប្រាក់បាន។");
    setPayments(result.payments ?? []);
    setApproved(result.approved ?? []);
  }, []);

  useEffect(() => {
    void loadPayments().catch((cause) => setMessage(cause instanceof Error ? cause.message : "មិនអាចទាញយកការបង់ប្រាក់បាន។"));
  }, [loadPayments]);

  async function review(id: string, action: "approve" | "reject", plan?: PaidPlan) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/billing/manual/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, plan })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "មិនអាចពិនិត្យការបង់ប្រាក់បាន។");
      setMessage(action === "approve" ? "បានអនុម័ត និងបើកគម្រោងសម្រាប់ 1 ខែ។" : "បានបដិសេធការបង់ប្រាក់។");
      await loadPayments();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "មិនអាចពិនិត្យការបង់ប្រាក់បាន។");
    } finally {
      setBusy(false);
    }
  }

  async function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/billing/manual/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), plan: grantPlan })
      });
      const result = await response.json() as { error?: string; email?: string; periodEnd?: string };
      if (!response.ok) throw new Error(result.error || "មិនអាចបើកគម្រោងបានទេ។");
      setMessage(`បានបើកគម្រោង ${BILLING_PLANS[grantPlan].name} សម្រាប់ ${result.email} រហូតដល់ ${new Date(result.periodEnd!).toLocaleDateString("km-KH")}។`);
      setEmail("");
      await loadPayments();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "មិនអាចបើកគម្រោងបានទេ។");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="kh-card space-y-5 p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-leaf">សម្រាប់អ្នកគ្រប់គ្រង</p>
        <h2 className="mt-1 text-lg font-bold">ការអនុម័តការបង់ប្រាក់</h2>
        <p className="mt-1 text-sm text-slate-600">ពិនិត្យថាប្រាក់ចូលគណនី MALIS DY ពិត មុនបើកសិទ្ធិឲ្យអ៊ីមែលណាមួយ។</p>
      </div>

      <form onSubmit={(event) => void grant(event)} className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h3 className="font-bold text-[#073f39]">បើកគម្រោងតាមអ៊ីមែល</h3>
        <p className="text-sm text-slate-600">ពិនិត្យប្រាក់ចូលក្នុងគណនីធនាគារជាមុន រួចបញ្ចូលអ៊ីមែលអ្នកប្រើ និងជ្រើសចំនួនដែលគេបានបង់។</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="អ៊ីមែលអ្នកប្រើ" aria-label="អ៊ីមែលអ្នកប្រើ" className="min-h-11 rounded-lg border bg-white px-3" />
          <select value={grantPlan} onChange={(event) => setGrantPlan(event.target.value as PaidPlan)} aria-label="គម្រោងដែលបានបង់" className="min-h-11 rounded-lg border bg-white px-3">
            {Object.entries(BILLING_PLANS).map(([id, plan]) => <option key={id} value={id}>${plan.monthlyCents / 100} · {plan.name}</option>)}
          </select>
          <button type="submit" disabled={busy || !email.trim()} className="min-h-11 rounded-lg bg-emerald-700 px-4 font-bold text-white disabled:opacity-50">បើកសិទ្ធិ ១ ខែ</button>
        </div>
      </form>

      <div className="border-t pt-5">
        <h3 className="font-bold">អ្នកប្រើប្រាស់ដែលបានចូលអេប ({registeredUsers.length})</h3>
        <p className="mt-1 text-sm text-slate-600">បញ្ជីឈ្មោះ និងអ៊ីមែលពីគណនីដែលបានរក្សាទុក។ ចុចឈ្មោះដើម្បីបញ្ចូលអ៊ីមែលក្នុងទម្រង់បើកសិទ្ធិខាងលើ។ ការបង់ប្រាក់ត្រូវពិនិត្យដោយឡែក។</p>
        <input
          type="search"
          value={userSearch}
          onChange={(event) => setUserSearch(event.target.value)}
          placeholder="ស្វែងរកឈ្មោះ ឬអ៊ីមែល"
          aria-label="ស្វែងរកអ្នកប្រើប្រាស់តាមឈ្មោះ ឬអ៊ីមែល"
          className="mt-3 min-h-11 w-full rounded-lg border bg-white px-3"
        />
        <div className="mt-3 max-h-80 divide-y overflow-y-auto rounded-lg border">
          {matchingUsers.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">{registeredUsers.length === 0 ? "មិនទាន់មានគណនីអ្នកប្រើប្រាស់ដែលបានរក្សាទុកទេ។" : "រកមិនឃើញអ្នកប្រើប្រាស់នេះទេ។"}</p>
          ) : matchingUsers.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => setEmail(account.email)}
              aria-label={`ជ្រើស ${account.name} ${account.email}`}
              aria-pressed={email.toLocaleLowerCase() === account.email.toLocaleLowerCase()}
              className={`flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm hover:bg-emerald-50 ${email.toLocaleLowerCase() === account.email.toLocaleLowerCase() ? "bg-emerald-50" : ""}`}
            >
              <span className="min-w-0"><span className="block font-semibold text-ink">{account.name}</span><span className="block break-all text-slate-600">{account.email}</span></span>
              <span className="text-xs font-semibold text-emerald-700">ជ្រើសរើស</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold">ការបង់ប្រាក់កំពុងរង់ចាំ ({payments.length})</h3>
          <button type="button" onClick={() => void loadPayments()} className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50" aria-label="ផ្ទុកឡើងវិញ"><RefreshCw className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 space-y-3">
          {payments.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">មិនមានការបង់ប្រាក់កំពុងរង់ចាំទេ។</p> : payments.map((payment) => (
            <article key={payment.id} className="rounded-xl border border-slate-200 p-4">
              <p className="font-bold text-ink">{payment.user.name} · {payment.user.email}</p>
              <p className="mt-1 font-semibold text-[#087862]">{BILLING_PLANS[payment.plan].name} · ${BILLING_PLANS[payment.plan].monthlyCents / 100} · Upload {BILLING_PLANS[payment.plan].uploadSeconds / 3600}h · LiveKit {BILLING_PLANS[payment.plan].liveSeconds / 3600}h</p>
              <p className="text-xs text-slate-500">{new Date(payment.createdAt).toLocaleString("km-KH")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <select value={reviewPlans[payment.id] ?? payment.plan} onChange={(event) => setReviewPlans((current) => ({ ...current, [payment.id]: event.target.value as PaidPlan }))} aria-label={`គម្រោងសម្រាប់ ${payment.user.email}`} className="rounded-lg border px-3 py-2 text-sm">
                  {Object.entries(BILLING_PLANS).map(([id, plan]) => <option key={id} value={id}>${plan.monthlyCents / 100} · {plan.name}</option>)}
                </select>
                <button type="button" disabled={busy} onClick={() => void review(payment.id, "approve", reviewPlans[payment.id] ?? payment.plan)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4" />អនុម័ត</button>
                <button type="button" disabled={busy} onClick={() => void review(payment.id, "reject")} className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><X className="h-4 w-4" />បដិសេធ</button>
              </div>
            </article>
          ))}
        </div>
      </div>
      <div className="border-t pt-5">
        <h3 className="font-bold">គណនីដែលបានបើកសិទ្ធិថ្មីៗ</h3>
        {approved.length === 0 ? <p className="mt-2 text-sm text-slate-500">មិនទាន់មានការអនុម័ត។</p> : (
          <div className="mt-3 space-y-2">
            {approved.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span>{payment.user.email}</span>
                <span className="font-semibold">${BILLING_PLANS[payment.plan].monthlyCents / 100} · {BILLING_PLANS[payment.plan].name}</span>
                <span className="text-slate-500">{payment.reviewedAt ? new Date(payment.reviewedAt).toLocaleString("km-KH") : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {message && <p role="status" className="rounded-lg bg-slate-50 px-4 py-3 text-sm font-semibold">{message}</p>}
    </section>
  );
}
