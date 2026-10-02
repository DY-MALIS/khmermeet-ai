import type { AnswerVoice } from "@/lib/ai/prompts/meetingQaPrompt";

// Google's Gemini Live is a realtime voice model: it listens and talks over
// one open connection, so an answer starts ~1s after the person stops
// talking. The previous hear -> write -> voice pipeline could not get under
// ~5s, which the owner rejected as not a real conversation. Live is not on
// OpenRouter; it needs a Google AI Studio key (GEMINI_API_KEY).
//
// The browser connects to Google directly (lowest latency) using a
// single-use token minted here, so the real key never reaches the page.

const DEFAULT_LIVE_MODEL = "models/gemini-3.8-live";
const LIVE_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

export function geminiApiKey() {
  return process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, "") || "";
}

export function geminiLiveModel() {
  return process.env.GEMINI_LIVE_MODEL?.trim() || DEFAULT_LIVE_MODEL;
}

function liveInstruction(transcript: string, voice: AnswerVoice) {
  // Khmer polite particles depend on the speaker's gender: a man says បាទ,
  // a woman says ចាស. The voice is male or female, so the words must match
  // it, or it sounds wrong to a Cambodian listener.
  const [own, other, who] = voice === "male" ? ["បាទ", "ចាស", "a man"] : ["ចាស", "បាទ", "a woman"];
  const gender = voice === "male" ? "បុរស" : "ស្ត្រី";
  // The language rules are written in Khmer and put first: with them in
  // English, a question heard badly (echo, noise) was answered in English -
  // the model fell back to the language of its instructions.
  return `អ្នកគឺជាជំនួយការសំឡេងរបស់ KhmerMeet ដែលនិយាយជាមួយអ្នកប្រើ ដូចមិត្តរួមការងារខ្មែរ តាមទូរសព្ទ។ អ្នកជា${gender}។

ភាសា (ច្បាប់សំខាន់បំផុត):
- ភាសាលំនាំដើមរបស់អ្នកគឺភាសាខ្មែរ។ ឆ្លើយជាភាសាខ្មែរជានិច្ច។
- ឆ្លើយជាភាសាអង់គ្លេស លុះត្រាតែសំណួរដែលទើបសួរ ជាភាសាអង់គ្លេសទាំងស្រុង ហើយស្តាប់ច្បាស់។
- សំណួរខ្មែរលាយពាក្យអង់គ្លេស: ឆ្លើយជាខ្មែរ ហើយរក្សាពាក្យអង់គ្លេសទាំងនោះជាអង់គ្លេស ដូចខ្មែរនិយាយធម្មតា។
- បើស្តាប់សំណួរមិនច្បាស់ (សំឡេងរំខាន សំឡេងលាយគ្នា ឬមិនប្រាកដ) កុំទាយ ហើយកុំប្តូរទៅអង់គ្លេស។ សូមនិយាយខ្លីៗថា «សុំទោស ខ្ញុំស្តាប់មិនច្បាស់ទេ សូមនិយាយម្តងទៀតបានទេ?» ហើយរង់ចាំ។
- អ្នកប្រើនិយាយតែខ្មែរ ឬអង់គ្លេសប៉ុណ្ណោះ មិនមែនចិន ថៃ ឬឡាវទេ។ ភាសាខ្មែរត្រូវតែជាខ្មែរសុទ្ធ។
- ពាក្យគួរសម: អ្នកជា${gender} ដូច្នេះត្រូវនិយាយ «${own}» ជានិច្ច (ចាប់ផ្តើមចម្លើយខ្មែរដោយ «${own},») ហើយកុំនិយាយ «${other}» ដាច់ខាត។

(Summary of the rules above in English: your default language is Khmer; answer in English only when the question just asked was clearly and entirely English; if you did not hear clearly, ask in Khmer to repeat instead of guessing; you are ${who} and always say "${own}", never "${other}".)

WHAT YOU CAN ANSWER:
- About the meeting below (what it was about, a summary, key points, decisions, who said what, tasks): the transcript is the only source of what was said - never invent anything as having been said.
- Advice and next steps (strategy, priorities, how to improve, risks): give practical suggestions from the meeting plus your own knowledge, and say they are your suggestions.
- Anything else: answer helpfully from your general knowledge.

HOW TO TALK: warm, natural and lively, like a person, not a newsreader.
- Take turns like two people talking: wait until they have completely finished before you answer, and never answer half a question.
- Answer EVERYTHING they asked, completely. If they asked two or more things in one turn, answer each of them, in order ("អំពីសំណួរទីមួយ ... ចំណែកសំណួរទីពីរ ..."). Never stop before the answer is finished.
- A simple question gets a short, complete answer (1-3 sentences). A summary, key points, strategy or several questions get as much as needed to cover it all (said as "ទីមួយ ... ទីពីរ ..."). No lists or symbols.

MEETING TRANSCRIPT:
${transcript}`;
}

// The setup message the browser sends first on the Live connection. The
// settings were measured on Khmer questions. A 400ms end-of-speech silence
// answered fastest but cut in when the person paused mid-question (reproduced
// with a 0.6s pause: it answered half the question, was interrupted, and the
// first part was never answered), and a 900ms setting still cut in the same
// way - so Gemini's own end-of-speech detection is off and the page marks
// the start and end of each question.
//
// Google ends a Live connection after about 10 minutes, and an audio session
// after 15 unless its context is compressed. With compression and resumption
// on, the page reconnects with the latest handle (resumeHandle) and the
// conversation carries on where it was.
export function buildLiveSetup(transcript: string, voice: AnswerVoice, resumeHandle?: string) {
  return {
    model: geminiLiveModel(),
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice === "male" ? "Achird" : "Aoede" } } },
      thinkingConfig: { thinkingBudget: 0 }
    },
    realtimeInputConfig: {
      // Turn-taking is decided by the page (see lib/client/gemini-live-call.ts),
      // which sends activityStart/activityEnd itself.
      automaticActivityDetection: { disabled: true }
    },
    // Without a hint, short Khmer questions were written down as Malay.
    inputAudioTranscription: { languageCodes: ["km-KH", "en-US"] },
    outputAudioTranscription: { languageCodes: ["km-KH", "en-US"] },
    contextWindowCompression: { slidingWindow: {} },
    sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
    systemInstruction: { parts: [{ text: liveInstruction(transcript, voice) }] }
  };
}

// A single-use token that must open its session within a minute and dies
// after 30 minutes - safe to hand to the browser.
export async function createLiveToken() {
  const key = geminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY is missing.");
  const now = Date.now();
  const response = await fetch("https://generativelanguage.googleapis.com/v1alpha/auth_tokens", {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 60 * 1000).toISOString()
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini Live token request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const data = (await response.json()) as { name?: string };
  if (!data.name) throw new Error("Gemini Live token response had no token.");
  return { token: data.name, wsUrl: LIVE_WS_URL };
}
