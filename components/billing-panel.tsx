"use client";

import { useState } from "react";
import { BILLING_PLANS, type PaidPlan } from "@/lib/billing-plans";

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
};

export function BillingPanel({ quota, isAdmin }: { quota: Quota; isAdmin: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [unlimited, setUnlimited] = useState(true);
  const [adminMessage, setAdminMessage] = useState("");

  async function goToBilling(kind: "checkout" | "portal") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/billing/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: "starter" }) });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Could not open billing.");
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open billing.");
      setBusy(false);
    }
  }

  async function updateUnlimited() {
    setBusy(true);
    setAdminMessage("");
    try {
      const response = await fetch("/api/billing/unlimited", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, unlimited })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not update access.");
      setAdminMessage("បានធ្វើបច្ចុប្បន្នភាពសិទ្ធិគណនី។");
      setEmail("");
    } catch (cause) {
      setAdminMessage(cause instanceof Error ? cause.message : "Could not update access.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="kh-card space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold">គម្រោងប្រើប្រាស់</h2>
        <p className="mt-1 text-sm text-slate-600">
          {quota.planId === "unlimited" ? "ប្រើប្រាស់មិនកំណត់" : quota.planId === "free" ? "Free · 20 នាទី/ខែ" : `${BILLING_PLANS[quota.planId].name} · $${BILLING_PLANS[quota.planId].monthlyCents / 100}/ខែ`}
        </p>
      </div>
      <div className="rounded-lg bg-slate-50 p-4 text-sm">
        <p>Upload: បានប្រើ {Math.ceil(quota.usedSeconds / 60)} នាទី{quota.limitSeconds !== null ? ` ក្នុង ${quota.limitSeconds / 60} នាទី` : ""}</p>
        {quota.remainingSeconds !== null && <p>Upload នៅសល់ {Math.floor(quota.remainingSeconds / 60)} នាទី</p>}
        <p>LiveKit: បានប្រើ {Math.ceil(quota.liveUsedSeconds / 60)} នាទី{quota.liveLimitSeconds !== null ? ` ក្នុង ${quota.liveLimitSeconds / 60} នាទី` : ""}</p>
        {quota.liveRemainingSeconds !== null && <p>LiveKit នៅសល់ {Math.floor(quota.liveRemainingSeconds / 60)} នាទី</p>}
        <p className="mt-1 text-slate-500">កំណត់ឡើងវិញ៖ {new Date(quota.periodEnd).toLocaleDateString("km-KH")}</p>
      </div>
      {quota.plan === "free" && (
        <a href="/dashboard" className="inline-block rounded-lg bg-leaf px-5 py-3 font-semibold text-white">
          មើលគម្រោង $15 / $25 / $35 នៅ Dashboard
        </a>
      )}
      {quota.plan === "pro" && quota.billingMethod === "card" && (
        <button type="button" disabled={busy} onClick={() => void goToBilling("portal")} className="rounded-lg bg-leaf px-5 py-3 font-semibold text-white disabled:opacity-50">
          គ្រប់គ្រងការបង់ប្រាក់
        </button>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {isAdmin && (
        <div className="space-y-3 border-t pt-4">
          <h3 className="font-semibold">ផ្ដល់សិទ្ធិប្រើប្រាស់មិនកំណត់</h3>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="អ៊ីមែលអ្នកប្រើ" className="w-full rounded-lg border p-2" />
          <select value={unlimited ? "on" : "off"} onChange={(event) => setUnlimited(event.target.value === "on")} className="rounded-lg border p-2">
            <option value="on">បើកសិទ្ធិ</option>
            <option value="off">បិទសិទ្ធិ</option>
          </select>
          <button type="button" disabled={busy || !email.trim()} onClick={() => void updateUnlimited()} className="ml-2 rounded-lg bg-leaf px-4 py-2 text-white disabled:opacity-50">រក្សាទុក</button>
          {adminMessage && <p role="status" className="text-sm">{adminMessage}</p>}
        </div>
      )}
    </section>
  );
}
