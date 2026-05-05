export function buildTaskExtractionPrompt(transcript: string) {
  return `Extract action tasks from the transcript. Return valid JSON only, no markdown.

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
