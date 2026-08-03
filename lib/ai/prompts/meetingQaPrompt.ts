export function buildMeetingQaPrompt(transcript: string, question: string) {
  return `Answer the question using only the meeting transcript below. Return valid JSON only, no markdown, no code fences.

JSON shape:
{
  "answer": "direct answer in 1-3 sentences, in the same language as the question",
  "quote": "the exact sentence from the transcript that supports the answer, or null if the transcript does not contain an answer",
  "speakerName": "the speaker label attached to that quote (the text before the colon), or null"
}

Rules:
- If the transcript does not contain enough information to answer, set "answer" to a short "not discussed in this meeting" style message and set "quote"/"speakerName" to null. Never invent an answer.
- "quote" must be copied verbatim from the transcript (not paraphrased) so it can be matched back to the source.

Question: ${question}

Transcript:
${transcript}`;
}
