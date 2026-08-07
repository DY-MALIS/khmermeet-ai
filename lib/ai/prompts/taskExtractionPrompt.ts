import { buildLanguageInstruction, type DocumentLanguageMode } from "@/lib/ai/prompts/languageInstruction";

export function buildTaskExtractionPrompt(transcript: string, language: DocumentLanguageMode) {
  return `Extract action tasks from the transcript. Return valid JSON only, no markdown.

Language rule for every text value in the JSON (title, description, assigneeName, sourceText): ${buildLanguageInstruction(language)}

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
      "sourceText": "source sentence from transcript"
    }
  ]
}

If no tasks are found, return {"tasks":[]}.

Transcript:
${transcript}`;
}
