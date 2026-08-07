import { buildLanguageInstruction, type DocumentLanguageMode } from "@/lib/ai/prompts/languageInstruction";

const summaryHeadings: Record<DocumentLanguageMode, { overview: string; keyPoints: string; decisions: string; problems: string; nextSteps: string }> = {
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
  return `You are KhmerMeet AI, an assistant for Cambodian teams. Summarize this meeting clearly and faithfully.

Language rule:
- ${buildLanguageInstruction(language)}

Accuracy rules:
- Use only facts from the transcript below.
- Do not reuse old summaries.
- Do not invent topics, names, dates, decisions, tasks, or problems.
- If the transcript is unclear, garbled, timestamp-only, or does not contain enough real speech, say this clearly and do not invent a summary.
- If information is missing, write "${language === "en" ? "No clear information available." : "មិនមានព័ត៌មានច្បាស់លាស់។"}" instead of guessing.

Formatting rules:
- Do not return a table.
- Do not return JSON.
- Do not use code fences.
- Do not use markdown bold markers like **.
- Do not write one long paragraph.
- Use short, clear bullet points.

Return exactly this clean structure, using these exact section headings:

${headings.overview}
- ...

${headings.keyPoints}
- ...
- ...

${headings.decisions}
- ...

${headings.problems}
- ...

${headings.nextSteps}
- ...

Transcript:
${transcript}`;
}
