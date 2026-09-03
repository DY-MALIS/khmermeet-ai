import { buildLanguageInstruction, type DocumentLanguageMode } from "@/lib/ai/prompts/languageInstruction";
import { summaryHeadings } from "@/lib/ai/prompts/summaryPrompt";

export function buildSlideBulletsPrompt(summary: string, language: DocumentLanguageMode) {
  const headings = summaryHeadings[language];
  const sectionList = Object.values(headings).join(", ");
  return `You are rewriting a meeting summary into short PowerPoint slide bullets for someone who will read them out loud and explain each point verbally to an audience.

${buildLanguageInstruction(language)}

Rules:
- Keep the exact same section headings, in the exact same order: ${sectionList}. Do not add, remove, merge, or rename sections.
- Rewrite every sentence/bullet under each heading into a short slide phrase: about 3-10 words, not a full sentence. Drop connecting words, articles, and filler - keep only the key fact (who, what, number, date, decision).
- The overview section is a paragraph in the input - turn it into 2-4 short bullet phrases instead of a paragraph.
- Keep every bullet from the input; do not drop, merge two into one, or invent new ones. If a bullet is already short, keep it as is.
- Never change a name, number, date, or decision - only shorten the wording around it.
- Output only bullet lines starting with "- " under each heading, no paragraphs, no extra commentary, no markdown bold.

Summary to rewrite:
${summary}`;
}
