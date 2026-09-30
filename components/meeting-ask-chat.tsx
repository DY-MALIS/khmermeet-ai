"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircleQuestion, Mic, PhoneOff, PlayCircle, RotateCcw, Send, Square, Volume2 } from "lucide-react";
import { readJsonResponse } from "@/lib/read-json-response";
import { seekAudioPlayer } from "@/lib/audio-player";
import { readSavedMicrophoneId } from "@/lib/audio-devices";
import { describeMicError } from "@/lib/mic-permission-error";
import { playVoiceStream, unlockAnswerAudio, type VoicePlayback } from "@/lib/client/answer-voice";
import { createLiveListener, type LiveListener } from "@/lib/client/live-listener";
import { useUiText } from "@/components/localized-text";

type Turn = {
  id: number;
  question: string;
  answer: string;
  quote: string | null;
  speakerName: string | null;
  startMs: number | null;
  voiceError?: boolean;
};

type AskResponse = {
  question?: string;
  answer: string;
  quote: string | null;
  speakerName: string | null;
  startMs: number | null;
  error?: string;
};

type VoiceGender = "female" | "male";
// off: no conversation running. listening: waiting for the person to talk.
// hearing: they are talking. thinking: question sent. speaking: answer playing.
type LiveState = "off" | "listening" | "hearing" | "thinking" | "speaking";

const VOICE_PREF_KEY = "khmermeet-ask-voice-answers";
const VOICE_GENDER_KEY = "khmermeet-ask-voice-gender";

function readVoiceGender(): VoiceGender {
  try {
    return window.localStorage.getItem(VOICE_GENDER_KEY) === "male" ? "male" : "female";
  } catch {
    return "female";
  }
}

function readVoicePreference() {
  try {
    return window.localStorage.getItem(VOICE_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

// Microsoft Edge gives web pages Microsoft's natural Khmer neural voices
// (ស្រីមុំ Sreymom, ពិសិដ្ឋ Piseth) for free - the same voices Azure sells,
// and far more natural than any OpenRouter voice (confirmed present in Edge's
// voice list; Chrome, Firefox and iPhone Safari have no Khmer voice). When the
// device has such a voice for the answer's language it reads the answer
// itself: free, instant, and no server call.
const NATURAL_VOICE = /Natural|Online|Google/i;
const MALE_VOICE = /ពិសិដ្ឋ|Piseth|Andrew|Guy|Brian|Christopher|Eric|Roger|Steffan|Davis|Tony|Jason|David|Mark|\bmale\b/i;

function answerLanguage(text: string) {
  return /[ក-៿]/.test(text) ? "km" : "en";
}

function findDeviceVoice(text: string, gender: VoiceGender, naturalOnly: boolean) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const lang = answerLanguage(text);
  const voices = window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith(lang) && (!naturalOnly || NATURAL_VOICE.test(voice.name)))
    // Prefer US English among the many English accents Edge offers.
    .sort((a, b) => Number(b.lang === "en-US") - Number(a.lang === "en-US"));
  return voices.find((voice) => MALE_VOICE.test(voice.name) === (gender === "male")) ?? voices[0] ?? null;
}

const SENTENCE_PITCHES = [1.06, 0.97, 1.03, 0.99];

// Long single utterances are cut off after ~15 seconds by some browsers, so
// the answer is queued sentence by sentence. Resolves when reading ends.
function speakWithDevice(text: string, voice: SpeechSynthesisVoice) {
  return new Promise<void>((resolve) => {
    const sentences = text.match(/[^។?!.\n]+[។?!.]*/g)?.map((part) => part.trim()).filter(Boolean) ?? [text];
    window.speechSynthesis.cancel();
    sentences.forEach((sentence, index) => {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      // One flat pitch for every sentence is part of what sounded robotic;
      // a slightly quicker pace and small pitch changes per sentence were
      // preferred in the owner's side-by-side listening test.
      utterance.rate = 1.08;
      utterance.pitch = SENTENCE_PITCHES[index % SENTENCE_PITCHES.length];
      if (index === sentences.length - 1) utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  });
}

export function MeetingAskChat({ meetingId, hasTranscript, hasAudio }: { meetingId: string; hasTranscript: boolean; hasAudio: boolean }) {
  const text = useUiText();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState<LiveState>("off");
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [voiceLoadingId, setVoiceLoadingId] = useState<number | null>(null);
  const [voiceAnswers, setVoiceAnswers] = useState(true);
  const [voiceGender, setVoiceGender] = useState<VoiceGender>("female");

  const playbackRef = useRef<VoicePlayback | null>(null);
  const listenerRef = useRef<LiveListener | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextIdRef = useRef(1);
  const speakRequestRef = useRef(0);
  const turnsEndRef = useRef<HTMLDivElement | null>(null);
  // The live listener calls back long after it was created, so it reads the
  // current conversation and voice settings through refs.
  const turnsRef = useRef<Turn[]>([]);
  const voiceGenderRef = useRef<VoiceGender>("female");
  const voiceAnswersRef = useRef(true);
  const liveRef = useRef<LiveState>("off");

  const liveOn = live !== "off";
  const suggestedQuestions = [text.askSuggestion1, text.askSuggestion2, text.askSuggestion3];

  useEffect(() => {
    turnsRef.current = turns;
    voiceGenderRef.current = voiceGender;
    voiceAnswersRef.current = voiceAnswers;
    liveRef.current = live;
  }, [turns, voiceGender, voiceAnswers, live]);

  useEffect(() => {
    setVoiceAnswers(readVoicePreference());
    setVoiceGender(readVoiceGender());
    // The voice list loads asynchronously; asking once starts the load so it
    // is ready by the time the first answer arrives.
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
    const listener = listenerRef;
    const stream = streamRef;
    const playback = playbackRef;
    // Leaving the page must release the microphone and silence any answer.
    return () => {
      listener.current?.dispose();
      stream.current?.getTracks().forEach((track) => track.stop());
      playback.current?.stop();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    turnsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns.length, loading]);

  function toggleVoiceAnswers() {
    const next = !voiceAnswers;
    setVoiceAnswers(next);
    if (!next) stopSpeaking();
    try {
      window.localStorage.setItem(VOICE_PREF_KEY, next ? "on" : "off");
    } catch {
      // Storage blocked - the choice just will not survive a reload.
    }
  }

  function changeVoiceGender(next: VoiceGender) {
    setVoiceGender(next);
    try {
      window.localStorage.setItem(VOICE_GENDER_KEY, next);
    } catch {
      // Storage blocked - the choice just will not survive a reload.
    }
  }

  function stopSpeaking() {
    speakRequestRef.current += 1;
    playbackRef.current?.stop();
    playbackRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingId(null);
    setVoiceLoadingId(null);
  }

  // Reads one answer aloud and resolves when it has finished (or was stopped).
  async function speak(turn: Turn) {
    stopSpeaking();
    const request = speakRequestRef.current;
    const isCurrent = () => request === speakRequestRef.current;
    const gender = voiceGenderRef.current;
    setTurns((current) => current.map((item) => (item.id === turn.id ? { ...item, voiceError: false } : item)));

    const naturalVoice = findDeviceVoice(turn.answer, gender, true);
    if (naturalVoice) {
      setSpeakingId(turn.id);
      await speakWithDevice(turn.answer, naturalVoice);
      if (isCurrent()) setSpeakingId(null);
      return;
    }

    setVoiceLoadingId(turn.id);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: turn.answer, voice: gender })
      });
      if (!response.ok) throw new Error((await readJsonResponse(response)).error ?? "Voice failed.");
      if (!isCurrent()) return;
      const playback = playVoiceStream(response);
      playbackRef.current = playback;
      setVoiceLoadingId(null);
      setSpeakingId(turn.id);
      if ((await playback.done) === "failed" && isCurrent()) throw new Error("Voice failed.");
    } catch {
      if (!isCurrent()) return;
      setVoiceLoadingId(null);
      // Server voice failed: any device voice for the language beats silence.
      const fallbackVoice = findDeviceVoice(turn.answer, gender, false);
      if (fallbackVoice) {
        setSpeakingId(turn.id);
        await speakWithDevice(turn.answer, fallbackVoice);
      } else {
        setTurns((current) => current.map((item) => (item.id === turn.id ? { ...item, voiceError: true } : item)));
      }
    } finally {
      if (isCurrent()) {
        setSpeakingId(null);
        setVoiceLoadingId(null);
      }
    }
  }

  function historyForRequest() {
    return turnsRef.current.map((turn) => ({ question: turn.question, answer: turn.answer }));
  }

  // Sends a question and adds the answer to the conversation. Returns the new
  // turn, or null when it failed (the error is already shown).
  async function ask(body: BodyInit, headers: HeadersInit | undefined, typedQuestion: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/ask`, { method: "POST", headers, body });
      const data = await readJsonResponse<AskResponse>(response);
      if (!response.ok) throw Object.assign(new Error(data.error ?? "Ask Meeting failed."), { status: response.status });
      const turn: Turn = {
        id: nextIdRef.current++,
        question: data.question || typedQuestion,
        answer: data.answer,
        quote: data.quote ?? null,
        speakerName: data.speakerName ?? null,
        startMs: data.startMs ?? null
      };
      setTurns((current) => [...current, turn]);
      return turn;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Ask Meeting failed.");
      // 422 = nothing audible in the recording: worth just listening again.
      return (error as { status?: number }).status === 422 ? ("retry" as const) : null;
    } finally {
      setLoading(false);
    }
  }

  async function askTyped(nextQuestion = question) {
    const cleanQuestion = nextQuestion.trim();
    if (!cleanQuestion || !hasTranscript || loading || liveOn) return;
    stopSpeaking();
    if (voiceAnswers) unlockAnswerAudio();
    setQuestion("");
    const turn = await ask(
      JSON.stringify({ question: cleanQuestion, history: historyForRequest(), voice: voiceGenderRef.current }),
      { "Content-Type": "application/json" },
      cleanQuestion
    );
    if (turn && turn !== "retry" && voiceAnswersRef.current) void speak(turn);
  }

  // A function rather than an inline check: the state changes across awaits,
  // which TypeScript narrowing does not see.
  function liveIsOff() {
    return liveRef.current === "off";
  }

  function setLiveState(next: LiveState) {
    liveRef.current = next;
    setLive(next);
  }

  function listenAgain() {
    if (liveIsOff()) return;
    setLiveState("listening");
    listenerRef.current?.listen();
  }

  async function handleSpokenQuestion(recording: Blob) {
    if (liveIsOff()) return;
    setLiveState("thinking");
    const form = new FormData();
    form.append("audio", recording, recording.type.includes("mp4") ? "question.m4a" : "question.webm");
    form.append("history", JSON.stringify(historyForRequest()));
    form.append("voice", voiceGenderRef.current);
    const turn = await ask(form, undefined, "");
    if (liveIsOff()) return;
    if (turn === null) {
      endLive();
      return;
    }
    if (turn !== "retry" && voiceAnswersRef.current) {
      setLiveState("speaking");
      await speak(turn);
    }
    listenAgain();
  }

  async function startLive() {
    if (!hasTranscript || loading || liveOn) return;
    stopSpeaking();
    // Unlock playback now, inside the tap, so every answer can play by itself.
    const audio = unlockAnswerAudio();
    setError("");
    if (!audio) {
      setError(describeMicError(null));
      return;
    }
    try {
      const savedMic = readSavedMicrophoneId();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(savedMic ? { deviceId: { ideal: savedMic } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;
      listenerRef.current = createLiveListener(stream, audio, {
        onHearing: () => setLiveState("hearing"),
        onQuestion: (recording) => void handleSpokenQuestion(recording)
      });
      setLiveState("listening");
      listenerRef.current.listen();
    } catch (error) {
      endLive();
      setError(describeMicError(error));
    }
  }

  function endLive() {
    setLiveState("off");
    listenerRef.current?.dispose();
    listenerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    stopSpeaking();
  }

  // The big button: starts the conversation, sends a question early, or
  // interrupts the answer to ask the next one.
  function handleMainButton() {
    if (live === "off") void startLive();
    else if (live === "listening" || live === "hearing") listenerRef.current?.sendNow();
    else if (live === "speaking") stopSpeaking();
  }

  function resetConversation() {
    stopSpeaking();
    setTurns([]);
    setError("");
  }

  const liveStatus =
    live === "listening"
      ? text.liveListening
      : live === "hearing"
        ? text.liveHearing
        : live === "thinking"
          ? text.liveThinking
          : live === "speaking"
            ? text.liveSpeaking
            : hasTranscript
              ? text.liveIdleHint
              : text.askMeetingNeedsTranscript;

  return (
    <section className="kh-card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-lg font-bold">
            <MessageCircleQuestion className="h-4 w-4 text-leaf" />
            {text.askMeetingTitle}
          </p>
          <p className="mt-1 text-sm text-slate-500">{text.askMeetingDescription}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            <input type="checkbox" className="accent-leaf" checked={voiceAnswers} onChange={toggleVoiceAnswers} />
            <Volume2 className="h-3.5 w-3.5" />
            {text.voiceAnswers}
          </label>
          <select
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
            value={voiceGender}
            onChange={(event) => changeVoiceGender(event.target.value === "male" ? "male" : "female")}
            aria-label={text.voiceAnswers}
          >
            <option value="female">{text.voiceFemale}</option>
            <option value="male">{text.voiceMale}</option>
          </select>
          {turns.length ? (
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:text-leaf disabled:opacity-50"
              onClick={resetConversation}
              disabled={loading || liveOn}
              title={text.newConversation}
              aria-label={text.newConversation}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* A live conversation is voice only - the owner asked for no text on
          screen while talking; the exchange shows once the call ends. */}
      {!liveOn && (turns.length || loading) ? (
        <div className="mb-4 max-h-[28rem] space-y-3 overflow-y-auto">
          {turns.map((turn) => (
            <div key={turn.id} className="space-y-2">
              <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-sm bg-leaf/10 px-3 py-2 text-sm text-ink">
                <span className="mr-1 font-semibold text-leaf">{text.askYou}:</span>
                {turn.question}
              </div>
              <div className="max-w-[95%] rounded-2xl rounded-bl-sm bg-slate-50 p-3">
                <div className="flex items-start gap-2">
                  <p className="flex-1 whitespace-pre-line text-sm leading-6 text-ink">{turn.answer}</p>
                  <button
                    type="button"
                    className="shrink-0 rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:text-leaf disabled:opacity-50"
                    onClick={() => {
                      if (speakingId === turn.id || voiceLoadingId === turn.id) stopSpeaking();
                      else {
                        unlockAnswerAudio();
                        void speak(turn);
                      }
                    }}
                    disabled={liveOn && speakingId !== turn.id}
                    title={speakingId === turn.id ? text.stopReading : text.readAloud}
                    aria-label={speakingId === turn.id ? text.stopReading : text.readAloud}
                  >
                    {voiceLoadingId === turn.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : speakingId === turn.id ? (
                      <Square className="h-4 w-4 fill-current" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {turn.voiceError ? <p className="mt-1 text-xs text-amber-700">{text.voiceUnavailable}</p> : null}
                {turn.quote ? (
                  <div className="mt-2 flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-2 sm:flex-row sm:items-start sm:justify-between">
                    <p className="text-xs text-slate-500">
                      {turn.speakerName ? <span className="font-semibold text-slate-700">{turn.speakerName}: </span> : null}
                      &ldquo;{turn.quote}&rdquo;
                    </p>
                    {hasAudio && turn.startMs !== null ? (
                      <button
                        className="kh-button-secondary shrink-0 sm:w-auto"
                        type="button"
                        onClick={() => seekAudioPlayer(turn.startMs ?? 0)}
                        title={text.jumpToMoment}
                      >
                        <PlayCircle className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {text.askThinking}
            </div>
          ) : null}
          <div ref={turnsEndRef} />
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-2 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleMainButton}
            disabled={!hasTranscript || live === "thinking" || (!liveOn && loading)}
            className={`flex h-16 w-16 items-center justify-center rounded-full text-white shadow-md transition disabled:opacity-50 ${
              live === "hearing"
                ? "animate-pulse bg-red-600"
                : live === "listening"
                  ? "bg-red-500 ring-4 ring-red-200"
                  : "bg-leaf hover:brightness-110"
            }`}
            aria-label={liveOn ? liveStatus : text.liveStart}
            title={liveOn ? liveStatus : text.liveStart}
          >
            {live === "thinking" ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : live === "speaking" ? (
              <Volume2 className="h-7 w-7" />
            ) : live === "hearing" ? (
              <Send className="h-6 w-6" />
            ) : (
              <Mic className="h-7 w-7" />
            )}
          </button>
          {liveOn ? (
            <button
              type="button"
              onClick={endLive}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-700 text-white shadow-md hover:bg-slate-800"
              aria-label={text.liveEnd}
              title={text.liveEnd}
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          ) : null}
        </div>
        <p className="max-w-md text-center text-xs font-semibold text-slate-500">
          {!liveOn && hasTranscript ? <span className="block text-sm text-leaf">{text.liveStart}</span> : null}
          {liveStatus}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="kh-input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void askTyped();
          }}
          placeholder={hasTranscript ? text.askMeetingPlaceholder : text.askMeetingNeedsTranscript}
          disabled={!hasTranscript || loading || liveOn}
        />
        <button
          className="kh-button-primary shrink-0 sm:w-auto"
          type="button"
          onClick={() => void askTyped()}
          disabled={!hasTranscript || loading || liveOn || !question.trim()}
        >
          {loading && !liveOn ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestedQuestions.map((suggested) => (
          <button
            key={suggested}
            type="button"
            className="rounded-full border border-leaf/15 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-leaf/10 hover:text-leaf disabled:opacity-50"
            disabled={!hasTranscript || loading || liveOn}
            onClick={() => void askTyped(suggested)}
          >
            {suggested}
          </button>
        ))}
      </div>
      {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div> : null}
    </section>
  );
}
