"use client";

import { useState } from "react";
import { readJsonResponse } from "@/lib/read-json-response";
import { PasswordInput } from "@/components/password-input";

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
        setError(data.error ?? "Could not change the password.");
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch {
      setError("Could not change the password. This may be a network issue. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {success ? <p className="rounded-lg bg-leaf/10 p-3 text-sm text-leaf">Password changed successfully.</p> : null}
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <PasswordInput
        placeholder="Current password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        required
      />
      <PasswordInput
        placeholder="New password, at least 6 characters"
        minLength={6}
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        required
      />
      <button className="kh-button-primary" disabled={loading} type="submit">
        {loading ? "Changing..." : "Change password"}
      </button>
    </form>
  );
}
