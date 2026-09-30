export type MeetingQaTurn = { question: string; answer: string };

// Decided in code from the question's own letters rather than left to the
// model: with a Khmer transcript the model answered English questions in
// Khmer. Any Khmer script means a Khmer (or Khmer-English mixed) question.
export function questionLanguage(question: string): "km" | "en" | "km-en" {
  const khmer = (question.match(/[\u1780-\u17FF]/g) ?? []).length;
  const latinWords = (question.match(/[A-Za-z]{2,}/g) ?? []).length;
  if (!khmer) return "en";
  return latinWords ? "km-en" : "km";
}

const SPOKEN_KHMER =
  "Write Khmer the way a Cambodian says it out loud to a colleague: clear, everyday spoken Khmer with natural sentence endings, not stiff formal writing and not word-for-word translation from English.";

function languageRule(question: string) {
  const language = questionLanguage(question);
  if (language === "en") {
    return "Answer language: English. The question is in English, so write the entire answer in English, translating what was said in the meeting - even though the transcript is in Khmer. Do not answer in Khmer.";
  }
  if (language === "km-en") {
    return `Answer language: Khmer mixed with English, the way the question mixes them. Write Khmer sentences, but keep the English words the question used, and other everyday English terms from the meeting (AI, app, project, meeting, ...), in English instead of translating them. ${SPOKEN_KHMER}`;
  }
  return `Answer language: Khmer. The question is in Khmer, so write the answer in Khmer. Use an English word only where the meeting itself said that word in English (for example a product or tool name); do not introduce English words the speakers did not use. ${SPOKEN_KHMER}`;
}

export function buildMeetingQaPrompt(transcript: string, question: string, history: MeetingQaTurn[] = []) {
  // Earlier turns are passed so a follow-up like "what are its main
  // benefits?" can be resolved against what "it" was in the previous answer.
  const conversation = history.length
    ? `\nEarlier questions and answers in this conversation (use them only to understand what a follow-up question refers to; the transcript stays the only source of facts):\n${history
        .map((turn, index) => `Q${index + 1}: ${turn.question}\nA${index + 1}: ${turn.answer}`)
        .join("\n")}\n`
    : "";

  return `Answer the question using only the meeting transcript below. Return valid JSON only, no markdown, no code fences.

JSON shape:
{
  "answer": "the answer, in the answer language stated below",
  "quote": "the exact sentence from the transcript that supports the answer, or null if the transcript does not contain an answer",
  "speakerName": "the speaker label attached to that quote (the text before the colon), or null"
}

${languageRule(question)}

Rules:
- An overview question such as "what is this meeting about?" gets 1-2 sentences naming the main topic(s) only - the person asks follow-up questions for detail.
- A simple factual question gets a direct answer in 1-3 sentences.
- When the question asks for the key points, details, reasons, benefits, or everything said about a topic, give each distinct point with the concrete specifics the transcript contains for it (names, numbers, tools, examples, who said it), up to about 8 sentences, instead of general statements.
- The answer is also read aloud by a voice, so write it as natural spoken sentences: no markdown, no bullet symbols, no numbered-list formatting, no emoji.
- If the question is a follow-up (for example "what are its benefits?" or "who said that?"), resolve what it refers to from the earlier questions and answers. Answer the new question itself with the specific details the transcript gives for it - never repeat or reword an earlier answer as the reply. If the transcript has nothing beyond what was already said, say so briefly.
- If the transcript does not contain enough information to answer, set "answer" to a short message saying this was not discussed in the meeting, written in the question's language (for a Khmer question: "រឿងនេះមិនត្រូវបាននិយាយនៅក្នុងកិច្ចប្រជុំនេះទេ។"), and set "quote"/"speakerName" to null. Never invent an answer.
- "quote" must be copied verbatim from the transcript (not paraphrased) so it can be matched back to the source.
${conversation}
Question: ${question}

Transcript:
${transcript}`;
}
