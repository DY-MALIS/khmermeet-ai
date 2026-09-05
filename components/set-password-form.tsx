"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { normalizeAuthPassword } from "@/lib/auth-input";
import { PasswordInput } from "@/components/password-input";

// Being signed in already proves account ownership (via Google or an
// existing password), so this can call updateUser() directly - no email
// round trip needed the way forgot-password requires for a signed-out
// visitor. This is also how a Google-only account gets its first password,
// enabling email+password sign-in alongside Google afterward.
export function SetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess(false);
    const cleanPassword = normalizeAuthPassword(password);
    if (cleanPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (cleanPassword !== normalizeAuthPassword(confirmPassword)) {
      setError("The two passwords do not match.");
      return;
    }
    setPending(true);
    const { error: updateError } = await createSupabaseBrowserClient().auth.updateUser({ password: cleanPassword });
    setPending(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess(true);
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {success ? (
        <p className="rounded-lg bg-leaf/10 p-3 text-sm text-leaf">
          Password បានកំណត់ជោគជ័យ។ ឥឡូវអ្នកអាចប្រើ email + password នេះ ដើម្បី Sign in បន្ថែមលើ Google។
        </p>
      ) : null}
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <PasswordInput
        placeholder="Password ថ្មី, យ៉ាងហោចណាស់ ៦ តួអក្សរ"
        minLength={6}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <PasswordInput
        placeholder="បញ្ជាក់ password ថ្មី"
        minLength={6}
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        required
      />
      <button className="kh-button-primary" disabled={pending} type="submit">
        {pending ? "កំពុងកំណត់..." : "កំណត់ Password"}
      </button>
    </form>
  );
}
