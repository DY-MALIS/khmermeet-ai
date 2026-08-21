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
  const contentTypeLabel = language === "en" ? "Content type" : "ប្រភេទអត្ថបទ";
  const mainIdeaLabel = language === "en" ? "Main idea" : "គំនិតស្នូល";
  const detailsLabel = language === "en" ? "Important details" : "ចំណុចពន្យល់សំខាន់ៗ";
  const takeawaysLabel = language === "en" ? "Takeaways" : "មេរៀន/អត្ថន័យដែលយកបាន";
  const actionsLabel = language === "en" ? "Actions or next steps" : "កិច្ចការ ឬជំហានបន្ទាប់";
  return `You are KhmerMeet AI's senior summarizer. The input may be a meeting transcript, a task discussion, a lesson, a lecture, a speech, a sermon, training content, or a long personal-development talk. First understand what type of content it is, then summarize it in the structure that fits that content. Do not force every transcript into a meeting-minutes format.

Language rule:
- ${buildLanguageInstruction(language)}

Content-type rule:
- Identify the content type from the transcript itself before writing.
- If it is a meeting or work discussion, use meeting-minutes language: decisions, problems, owners, deadlines, next steps.
- If it is a lesson, lecture, teaching, speech, sermon, or motivational talk, summarize the lesson: central message, supporting ideas, examples/advice, and practical takeaways. Do not invent meeting decisions or next steps.
- If it is mostly a task/work instruction, summarize the objective, requirements, constraints, and work to do.
- If it is mixed, choose the dominant type and mention the secondary type only when it affects the summary.

Quality bar - this is what separates a good summary from a bad one:
- Synthesize, don't transcribe. Paraphrase in fluent, natural, professional language - never copy sentence fragments verbatim from the transcript.
- Merge and de-duplicate. If the same topic comes up three times across the conversation, it becomes ONE point that reflects the full discussion, not three repeated bullets.
- Explain the "why" only when it is essential. Keep each point compact and useful.
- Prioritize by importance, not by the order things were said. Lead with what actually matters; minor side comments either get folded into a related point or left out entirely.
- Attribute when it matters. Name the person behind a decision, concern, or commitment when the transcript makes that clear (e.g. "Sokha will follow up with the vendor" rather than "someone will follow up").
- Be concrete. Prefer specific numbers, dates, names, and next actions over vague phrases like "discussed the project" or "talked about issues."
- Be brief. Remove background chatter, greetings, repeated wording, and low-value details.
- Match the summary length to the source: short transcripts can have a short summary, but long transcripts need enough substance to preserve the main argument and important supporting points.

Accuracy rules (never break these):
- Use only facts that are actually in the transcript below - do not add outside knowledge, assumptions, or anything from a previous summary.
- Never invent topics, names, dates, decisions, tasks, or problems that were not said.
- If the transcript is unclear, garbled, timestamp-only, or does not contain enough real speech to summarize, say so plainly instead of inventing content.
- If a whole section genuinely has nothing to report, write "${noInfo}" under that heading instead of guessing or padding it out.

Formatting rules:
- Do not return a table, JSON, code fences, or markdown bold markers like **.
- The overview/main idea section is a short paragraph: 2-4 sentences for long transcripts, 1-2 sentences for short transcripts.
- Every other section is clear bullet points: 1-2 lines per bullet.
- For long transcripts, use 5-8 bullets in the important-details section when needed; for short transcripts, use fewer.
- The full summary should be concise but not shallow. Do not compress a long lesson or speech into only a few generic lines.

For meeting/work discussions, return exactly this structure:

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

For lessons, speeches, lectures, sermons, training, or personal-development content, return exactly this structure instead:

${contentTypeLabel}
- the detected type and topic

${mainIdeaLabel}
(2-4 sentence paragraph explaining the core message)

${detailsLabel}
- the most important supporting ideas, advice, examples, or arguments

${takeawaysLabel}
- practical lessons the listener should remember or apply

${actionsLabel}
- only real actions/advice stated in the transcript; otherwise write "${noInfo}"

Transcript:
${transcript}`;
}
