// Sends transactional email via Resend's HTTP API directly (no SDK - it's
// one endpoint and avoids a new dependency for a single call site). Needs
// RESEND_API_KEY and a domain verified in the Resend dashboard; until both
// are set up, sendPasswordResetEmail throws and the caller surfaces that as
// a clear "email is not configured yet" error instead of silently failing.
export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured - password reset email cannot be sent.");
  }
  const from = process.env.RESEND_FROM_EMAIL || "KhmerMeet AI <onboarding@resend.dev>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "កំណត់ពាក្យសម្ងាត់ថ្មី - KhmerMeet AI",
      html: `
        <div style="font-family: 'Leelawadee UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #18745F;">កំណត់ពាក្យសម្ងាត់ថ្មី</h2>
          <p>អ្នកបានស្នើសុំកំណត់ពាក្យសម្ងាត់ថ្មីសម្រាប់គណនី KhmerMeet AI របស់អ្នក។ សូមចុចប៊ូតុងខាងក្រោមដើម្បីកំណត់ពាក្យសម្ងាត់ថ្មី (link នេះប្រើបានតែ ១ម៉ោង):</p>
          <p style="margin: 32px 0;">
            <a href="${resetUrl}" style="background: #18745F; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">កំណត់ពាក្យសម្ងាត់ថ្មី</a>
          </p>
          <p style="color: #64748B; font-size: 13px;">បើអ្នកមិនបានស្នើសុំរឿងនេះ សូមមិនអើពើសារនេះចោល - គណនីរបស់អ្នកនៅតែមានសុវត្ថិភាព។</p>
          <p style="color: #94A3B8; font-size: 12px; word-break: break-all;">${resetUrl}</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API error (${response.status}): ${body.slice(0, 300)}`);
  }
}
