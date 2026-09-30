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

export type AnswerVoice = "female" | "male";

// The answer is read aloud, and the owner compared the same answers read by
// Microsoft's Khmer voice: plain written Khmer sounded flat, the same content
// written the way people talk (a polite opener, short sentences, commas and
// spaces where a speaker breathes) sounded clearly more natural. Khmer voices
// pause at spaces and commas, so the punctuation is what shapes the rhythm.
function spokenKhmer(voice: AnswerVoice) {
  const particle = voice === "male" ? "បាទ" : "ចាស";
  return `Write Khmer the way a Cambodian says it out loud to a colleague, not stiff formal writing and not word-for-word translation from English:
- Start the answer with "${particle}," (the speaker's polite particle) - never use the other gender's particle.
- Short sentences. Put a comma or a space at each natural breath pause inside a sentence, e.g. "${particle}, កិច្ចប្រជុំនេះ គឺនិយាយពី automation, ហើយនិង ការកែលម្អ ប្រព័ន្ធការងារ។"
- Everyday spoken words (e.g. "គាត់ប្រាប់ថា", "អត់ទាន់", "នៅមិនទាន់ចប់ទេ") rather than formal written ones (e.g. "ត្រូវបានលើកឡើងថា").
- When listing several points, say them out loud as "ទីមួយ, ...។ ទីពីរ, ...។ ហើយទីបី, ...។"`;
}

function languageRule(question: string, voice: AnswerVoice) {
  const SPOKEN_KHMER = spokenKhmer(voice);
  const language = questionLanguage(question);
  if (language === "en") {
    return "Answer language: English. The question is in English, so write the entire answer in English, translating what was said in the meeting - even though the transcript is in Khmer. Do not answer in Khmer. Write it the way a person says it out loud to a colleague: short, natural sentences.";
  }
  if (language === "km-en") {
    return `Answer language: Khmer mixed with English, the way the question mixes them. Write Khmer sentences, but keep the English words the question used, and other everyday English terms from the meeting (AI, app, project, meeting, ...), in English instead of translating them. ${SPOKEN_KHMER}`;
  }
  return `Answer language: Khmer. The question is in Khmer, so write the answer in Khmer. Use an English word only where the meeting itself said that word in English (for example a product or tool name); do not introduce English words the speakers did not use. ${SPOKEN_KHMER}`;
}

export function buildMeetingQaPrompt(transcript: string, question: string, history: MeetingQaTurn[] = [], voice: AnswerVoice = "female") {
  // Earlier turns are passed so a follow-up like "what are its main
  // benefits?" can be resolved against what "it" was in the previous answer.
  const conversation = history.length
    ? `\nEarlier questions and answers in this conversation (use them only to understand what a follow-up question refers to; the transcript stays the only source of facts):\n${history
        .map((turn, index) => `Q${index + 1}: ${turn.question}\nA${index + 1}: ${turn.answer}`)
        .join("\n")}\n`
    : "";

  return `Answer the question about the meeting below - or anything else the person asks. Return valid JSON only, no markdown, no code fences.

JSON shape:
{
  "answer": "the answer, in the answer language stated below",
  "quote": "the exact sentence from the transcript that supports the answer, or null if the transcript does not contain an answer",
  "speakerName": "the speaker label attached to that quote (the text before the colon), or null"
}

${languageRule(question, voice)}

Rules:
- An overview question such as "what is this meeting about?" gets 1-2 sentences naming the main topic(s) only - the person asks follow-up questions for detail.
- A simple factual question gets a direct answer in 1-3 sentences.
- When the question asks for a summary, the key points, details, reasons, benefits, or everything said about a topic, give each distinct point with the concrete specifics the transcript contains for it (names, numbers, tools, examples, who said it), up to about 8 sentences, instead of general statements.
- The answer is also read aloud by a voice, so write it as natural spoken sentences: no markdown, no bullet symbols, no numbered-list formatting, no emoji.
- If the question is a follow-up (for example "what are its benefits?" or "who said that?"), resolve what it refers to from the earlier questions and answers. Answer the new question itself with the specific details the transcript gives for it - never repeat or reword an earlier answer as the reply. If the transcript has nothing beyond what was already said, say so briefly.
- What was said in the meeting comes only from the transcript - never invent anything as having been said.
- Advice and next steps (what strategy to do next, how to improve, risks, priorities): give practical recommendations based on the meeting plus your own knowledge, and make clear they are your suggestions (e.g. "ខ្ញុំគិតថា ...", "I'd suggest ..."). Set "quote"/"speakerName" to null unless a specific transcript sentence supports it.
- Questions unrelated to the meeting: answer helpfully from general knowledge, with "quote"/"speakerName" null.
- If they ask what the meeting said about something it did not cover, say briefly that it was not discussed (for a Khmer question: "សុំទោសណា៎, រឿងនេះ អត់មាននិយាយ នៅក្នុងកិច្ចប្រជុំនេះទេ។"), then still help with what you know.
- "quote" must be copied verbatim from the transcript (not paraphrased) so it can be matched back to the source.
${conversation}
Question: ${question}

Transcript:
${transcript}`;
}
