import { buildLanguageInstruction, type DocumentLanguageMode } from "@/lib/ai/prompts/languageInstruction";

export const summaryHeadings: Record<DocumentLanguageMode, { overview: string; keyPoints: string; decisions: string; problems: string; nextSteps: string }> = {
  km: {
    overview: "សង្ខេបប្រជុំ",
    keyPoints: "ចំណុចសំខាន់ៗ",
    decisions: "ការសម្រេចចិត្ត",
    problems: "បញ្ហាដែលបានលើកឡើង",
    nextSteps: "ជំហានបន្ទាប់"
  },
  en: {
    overview: "Meeting overview",
    keyPoints: "Key points",
    decisions: "Decisions",
    problems: "Problems raised",
    nextSteps: "Next steps"
  },
  "km-en": {
    overview: "សង្ខេបប្រជុំ",
    keyPoints: "ចំណុចសំខាន់ៗ",
    decisions: "ការសម្រេចចិត្ត",
    problems: "បញ្ហាដែលបានលើកឡើង",
    nextSteps: "ជំហានបន្ទាប់"
  }
};

export function buildSummaryPrompt(transcript: string, language: DocumentLanguageMode) {
  const headings = summaryHeadings[language];
  const noInfo = language === "en" ? "No clear information available." : "មិនមានព័ត៌មានច្បាស់លាស់។";
  return `You are an experienced executive assistant who has just sat in on this meeting and is writing a concise executive summary for people who were NOT there. Write the kind of summary a sharp, senior EA would produce - one that lets a busy executive understand the meeting in 30 seconds. This is not a mechanical extraction exercise: read the full transcript, understand what actually happened and why, and write it up in your own clear words.

Language rule:
- ${buildLanguageInstruction(language)}

Quality bar - this is what separates a good summary from a bad one:
- Synthesize, don't transcribe. Paraphrase in fluent, natural, professional language - never copy sentence fragments verbatim from the transcript.
- Merge and de-duplicate. If the same topic comes up three times across the conversation, it becomes ONE point that reflects the full discussion, not three repeated bullets.
- Explain the "why" only when it is essential. Keep each point compact and useful.
- Prioritize by importance, not by the order things were said. Lead with what actually matters; minor side comments either get folded into a related point or left out entirely.
- Attribute when it matters. Name the person behind a decision, concern, or commitment when the transcript makes that clear (e.g. "Sokha will follow up with the vendor" rather than "someone will follow up").
- Be concrete. Prefer specific numbers, dates, names, and next actions over vague phrases like "discussed the project" or "talked about issues."
- Be brief. Remove background chatter, greetings, repeated wording, and low-value details.

Accuracy rules (never break these):
- Use only facts that are actually in the transcript below - do not add outside knowledge, assumptions, or anything from a previous summary.
- Never invent topics, names, dates, decisions, tasks, or problems that were not said.
- If the transcript is unclear, garbled, timestamp-only, or does not contain enough real speech to summarize, say so plainly instead of inventing content.
- If a whole section genuinely has nothing to report, write "${noInfo}" under that heading instead of guessing or padding it out.

Formatting rules:
- Do not return a table, JSON, code fences, or markdown bold markers like **.
- "${headings.overview}" is the only section written as a short paragraph: 1-2 sentences maximum.
- Every other section is short, clear bullet points: 1 line per bullet, maximum 4 bullets per section.
- If a section has more than 4 possible points, keep only the 4 most important.
- The full summary should normally fit on one screen.

Return exactly this structure, using these exact section headings:

${headings.overview}
(one short paragraph)

${headings.keyPoints}
- the most important points discussed, synthesized and merged, most important first

${headings.decisions}
- what was decided, who owns it (if said), and the reasoning behind it (if said)

${headings.problems}
- problems, risks, or blockers raised, with enough context to understand the impact

${headings.nextSteps}
- concrete next actions, with owner and deadline whenever the transcript gives one

Transcript:
${transcript}`;
}
