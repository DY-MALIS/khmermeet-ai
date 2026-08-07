import { buildLanguageInstruction, type DocumentLanguageMode } from "@/lib/ai/prompts/languageInstruction";

export function buildSmartNotePrompt(transcript: string, language: DocumentLanguageMode) {
  return `Read the meeting transcript and split it into structured buckets. Return valid JSON only, no markdown, no code fences.

Language rule for every text value in the JSON (title, ownerName, problems, ideas, questions, sourceText): ${buildLanguageInstruction(language)}

JSON shape:
{
  "decisions": [
    {
      "title": "short decision statement",
      "ownerName": "person responsible, or null",
      "deadline": "YYYY-MM-DD or null",
      "sourceText": "source sentence from transcript"
    }
  ],
  "problems": ["short problem statement", "..."],
  "ideas": ["short idea statement", "..."],
  "questions": ["open question raised but not answered in the transcript", "..."]
}

Rules:
- Use only facts stated in the transcript. Never invent a decision, problem, idea, or question.
- A "decision" is something the group agreed to do or agreed is true - not a task assignment (tasks are extracted separately) and not a question.
- A "question" is something asked in the meeting that was left unanswered by the end of the transcript.
- If a bucket has nothing real to put in it, return an empty array for it.
- Keep each entry short (one sentence).

Transcript:
${transcript}`;
}
