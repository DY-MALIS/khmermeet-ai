export function buildSummaryPrompt(transcript: string) {
  return `You are KhmerMeet AI, an assistant for Cambodian teams. Summarize this meeting in Khmer by default.

Return a clear meeting summary with these sections:
1. Meeting overview
2. Key discussion points
3. Decisions made
4. Problems mentioned
5. Next steps

Transcript:
${transcript}`;
}
