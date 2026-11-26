import { buildLanguageInstruction, type DocumentLanguageMode } from "@/lib/ai/prompts/languageInstruction";

export function buildTaskExtractionPrompt(transcript: string, language: DocumentLanguageMode) {
  return `Extract action tasks from the transcript. Return valid JSON only, no markdown.

Language rule for title, description, and assigneeName: ${buildLanguageInstruction(language)}

JSON shape:
{
  "tasks": [
    {
      "title": "short task title",
      "description": "clear description",
      "assigneeName": "person name or null",
      "deadline": "YYYY-MM-DD or null",
      "priority": "low | medium | high",
      "status": "not_started",
      "sourceText": "exact, verbatim source sentence from transcript"
    }
  ]
}

If no tasks are found, return {"tasks":[]}.
Only extract an explicit commitment or request to do something. A suggestion,
discussion topic, or unanswered question is not a confirmed task.
Copy sourceText exactly from the transcript, in its original language. Do not
translate, paraphrase, or correct sourceText. Leave assigneeName null unless
the person is explicitly named as responsible. Leave deadline null unless a
complete calendar date is explicitly stated; do not infer a date from a
relative expression. Never mark an extracted task completed.

Transcript:
${transcript}`;
}
