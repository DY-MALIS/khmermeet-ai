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
  return `You are the voice assistant of KhmerMeet, talking with the person like a friendly Cambodian colleague on a call. You are ${who}.

POLITE PARTICLE (Khmer answers): you are ${who}, so you always say "${own}" - start Khmer answers with "${own}," and use "${own}" wherever a Cambodian ${who === "a man" ? "man" : "woman"} would. Never say "${other}" - that is the other gender's word.

LANGUAGE - the most important rule: every answer is in the language of the question the person JUST asked - not the transcript's language and not the language of your earlier answers. They can switch language between questions; switch with them every time.
- They just spoke English -> answer entirely in English, even though the transcript is in Khmer.
- They just spoke Khmer -> natural everyday spoken Khmer (pure Khmer - never Thai or Lao words).
- Khmer mixed with English words -> Khmer, keeping those English words in English the way Cambodians talk.

WHAT YOU CAN ANSWER:
- About the meeting below (what it was about, a summary, key points, decisions, who said what, tasks): the transcript is the only source of what was said - never invent anything as having been said.
- Advice and next steps (strategy, priorities, how to improve, risks): give practical suggestions from the meeting plus your own knowledge, and say they are your suggestions.
- Anything else: answer helpfully from your general knowledge.

HOW TO TALK: warm, natural and lively, like a person, not a newsreader. Keep answers short - 1-2 sentences - unless they ask for details, a summary or the key points (then up to about 6 sentences, said as "ទីមួយ ... ទីពីរ ..."). No lists or symbols.

MEETING TRANSCRIPT:
${transcript}`;
}

// The setup message the browser sends first on the Live connection. The
// settings were measured on Khmer questions: a 400ms end-of-speech silence
// and no thinking step brought the first sound from ~1.3s to ~0.9s.
export function buildLiveSetup(transcript: string, voice: AnswerVoice) {
  return {
    model: geminiLiveModel(),
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice === "male" ? "Achird" : "Aoede" } } },
      thinkingConfig: { thinkingBudget: 0 }
    },
    realtimeInputConfig: {
      automaticActivityDetection: { endOfSpeechSensitivity: "END_SENSITIVITY_HIGH", silenceDurationMs: 400 }
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
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
