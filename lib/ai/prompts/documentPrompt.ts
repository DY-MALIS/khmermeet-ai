export type MeetingDocumentType = "minutes" | "proposal" | "project_plan" | "report" | "sop" | "contract_draft";

const documentInstructions: Record<MeetingDocumentType, string> = {
  minutes:
    "Write formal Minutes of Meeting: Meeting title/date, Attendees (from speaker names if known), Agenda/topics discussed, Decisions made, Action items with owners and deadlines, Next meeting (if mentioned).",
  proposal:
    "Write a short business proposal based on what was discussed: Background/Problem, Proposed solution, Scope, Timeline, Next steps. Only include what is grounded in the transcript - do not invent budget figures or dates that were never mentioned.",
  project_plan:
    "Write a Project Plan: Objective, Milestones (with owners/deadlines mentioned in the transcript), Deliverables, Risks, Next steps.",
  report:
    "Write a short status Report: Summary, Progress since last update (if mentioned), Current status, Blockers/risks, Next steps.",
  sop: "Write a Standard Operating Procedure (SOP) describing the process discussed: Purpose, Scope, Step-by-step procedure, Responsible roles. Only document steps that were actually described in the transcript.",
  contract_draft:
    "Write a plain-language Contract Draft outline covering the terms actually discussed: Parties, Scope of work, Deliverables, Timeline, Payment terms (if mentioned). Clearly mark any standard clause as [To be filled by legal] rather than inventing legal terms that were never discussed. This is a starting draft for a human to review, not a final legal document."
};

export function buildMeetingDocumentPrompt(type: MeetingDocumentType, meetingTitle: string, transcript: string, summary: string | null) {
  return `Generate a document from this meeting. ${documentInstructions[type]}

Formatting rules:
- Do not return JSON.
- Do not use code fences or bold markers like **.
- Use clear section headings and short bullet points, in the same language as the transcript.
- Use only facts from the transcript/summary below. Never invent names, numbers, dates, or terms that were not discussed - write "not specified in the meeting" instead of guessing.

Meeting title: ${meetingTitle}

Meeting summary (if available):
${summary ?? "(no summary yet)"}

Transcript:
${transcript}`;
}
