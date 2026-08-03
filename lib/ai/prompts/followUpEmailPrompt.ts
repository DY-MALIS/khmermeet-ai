export function buildFollowUpEmailPrompt(meetingTitle: string, transcript: string, summary: string | null) {
  return `Write a short follow-up email to send to meeting attendees after this meeting. Use only facts from the transcript/summary below - never invent names, numbers, or tasks.

Formatting rules:
- Do not return JSON or markdown.
- Do not use code fences or bold markers like **.
- Plain email text only, in the same language as the transcript.
- Keep it concise and professional.

Structure exactly like this:

Subject: [short subject line about "${meetingTitle}"]

Hello everyone,

[1-3 sentence recap of what was discussed]

Tasks:
- [assignee]: [task] (deadline if known)
- ...

[optional 1-sentence closing line]

Meeting summary (if available):
${summary ?? "(no summary yet)"}

Transcript:
${transcript}`;
}
