"use client";

import { useState } from "react";
import { readJsonResponse } from "@/lib/read-json-response";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);
    try {
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await readJsonResponse<{ ok?: boolean; error?: string }>(response);
      if (!response.ok || !data.ok) {
        setError(data.error ?? "មិនអាចប្តូរពាក្យសម្ងាត់បានទេ។");
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch {
      setError("មិនអាចប្តូរពាក្យសម្ងាត់បានទេ (ប្រហែលជាបញ្ហាបណ្តាញ)។ សូមសាកល្បងម្ដងទៀត។");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {success ? <p className="rounded-lg bg-leaf/10 p-3 text-sm text-leaf">ប្តូរពាក្យសម្ងាត់ជោគជ័យ!</p> : null}
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <input
        className="kh-input"
        type="password"
        placeholder="ពាក្យសម្ងាត់បច្ចុប្បន្ន"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        required
      />
      <input
        className="kh-input"
        type="password"
        placeholder="ពាក្យសម្ងាត់ថ្មី (យ៉ាងតិច 6 តួ)"
        minLength={6}
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        required
      />
      <button className="kh-button-primary" disabled={loading} type="submit">
        {loading ? "កំពុងប្តូរ..." : "ប្តូរពាក្យសម្ងាត់"}
      </button>
    </form>
  );
}
