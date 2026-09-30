"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircleQuestion, Mic, PlayCircle, RotateCcw, Send, Square, Volume2 } from "lucide-react";
import { readJsonResponse } from "@/lib/read-json-response";
import { seekAudioPlayer } from "@/lib/audio-player";
import { readSavedMicrophoneId } from "@/lib/audio-devices";
import { describeMicError } from "@/lib/mic-permission-error";
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

const MAX_QUESTION_SECONDS = 60;
const VOICE_PREF_KEY = "khmermeet-ask-voice-answers";
const VOICE_GENDER_KEY = "khmermeet-ask-voice-gender";
// A zero-length WAV. Playing it inside the tap that starts a question
// unlocks the audio element on iPhone/Safari, which otherwise refuses to
// play the answer because it arrives after an await, outside the tap.
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

// Wall-clock time for the question timer, kept outside the component body.
function elapsedClock() {
  return Date.now();
}

function recorderMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function readVoiceGender(): "female" | "male" {
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

function findDeviceVoice(text: string, gender: "female" | "male", naturalOnly: boolean) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const lang = answerLanguage(text);
  const voices = window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith(lang) && (!naturalOnly || NATURAL_VOICE.test(voice.name)))
    // Prefer US English among the many English accents Edge offers.
    .sort((a, b) => Number(b.lang === "en-US") - Number(a.lang === "en-US"));
  return voices.find((voice) => MALE_VOICE.test(voice.name) === (gender === "male")) ?? voices[0] ?? null;
}

// Long single utterances are cut off after ~15 seconds by some browsers, so
// the answer is queued sentence by sentence.
function speakWithDevice(text: string, voice: SpeechSynthesisVoice, onEnd: () => void) {
  const sentences = text.match(/[^។?!.\n]+[។?!.]*/g)?.map((part) => part.trim()).filter(Boolean) ?? [text];
  window.speechSynthesis.cancel();
  sentences.forEach((sentence, index) => {
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    if (index === sentences.length - 1) utterance.onend = onEnd;
    utterance.onerror = onEnd;
    window.speechSynthesis.speak(utterance);
  });
}

export function MeetingAskChat({ meetingId, hasTranscript, hasAudio }: { meetingId: string; hasTranscript: boolean; hasAudio: boolean }) {
  const text = useUiText();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [voiceLoadingId, setVoiceLoadingId] = useState<number | null>(null);
  const [voiceAnswers, setVoiceAnswers] = useState(true);
  const [voiceGender, setVoiceGender] = useState<"female" | "male">("female");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartRef = useRef(0);
  const nextIdRef = useRef(1);
  const speakRequestRef = useRef(0);
  const turnsEndRef = useRef<HTMLDivElement | null>(null);

  const busy = loading || recording;
  const suggestedQuestions = [text.askSuggestion1, text.askSuggestion2, text.askSuggestion3];

  useEffect(() => {
    setVoiceAnswers(readVoicePreference());
    setVoiceGender(readVoiceGender());
    // The voice list loads asynchronously; asking once starts the load so it
    // is ready by the time the first answer arrives.
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
    const timer = timerRef;
    const stream = streamRef;
    const audio = audioRef;
    const audioUrl = audioUrlRef;
    // Leaving the page must release the microphone and silence any answer.
    return () => {
      if (timer.current) clearInterval(timer.current);
      stream.current?.getTracks().forEach((track) => track.stop());
      audio.current?.pause();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
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

  function changeVoiceGender(next: "female" | "male") {
    setVoiceGender(next);
    try {
      window.localStorage.setItem(VOICE_GENDER_KEY, next);
    } catch {
      // Storage blocked - the choice just will not survive a reload.
    }
  }

  function audioElement() {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  }

  function unlockAudio() {
    const audio = audioElement();
    audio.src = SILENT_WAV;
    void audio.play().catch(() => undefined);
  }

  function stopSpeaking() {
    speakRequestRef.current += 1;
    audioRef.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setSpeakingId(null);
    setVoiceLoadingId(null);
  }

  async function speak(turn: Turn) {
    stopSpeaking();
    const request = speakRequestRef.current;
    setTurns((current) => current.map((item) => (item.id === turn.id ? { ...item, voiceError: false } : item)));
    const onDeviceEnd = () => {
      if (request === speakRequestRef.current) setSpeakingId(null);
    };
    const naturalVoice = findDeviceVoice(turn.answer, voiceGender, true);
    if (naturalVoice) {
      setSpeakingId(turn.id);
      speakWithDevice(turn.answer, naturalVoice, onDeviceEnd);
      return;
    }
    setVoiceLoadingId(turn.id);
    const markFailed = () => setTurns((current) => current.map((item) => (item.id === turn.id ? { ...item, voiceError: true } : item)));
    try {
      const response = await fetch(`/api/meetings/${meetingId}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: turn.answer, voice: voiceGender })
      });
      if (!response.ok) throw new Error((await readJsonResponse(response)).error ?? "Voice failed.");
      const blob = await response.blob();
      if (request !== speakRequestRef.current) return;
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = audioElement();
      audio.src = url;
      audio.onended = () => {
        if (request === speakRequestRef.current) setSpeakingId(null);
      };
      setVoiceLoadingId(null);
      setSpeakingId(turn.id);
      await audio.play();
    } catch {
      if (request !== speakRequestRef.current) return;
      setVoiceLoadingId(null);
      // Server voice failed: any device voice for the language beats silence.
      const fallbackVoice = findDeviceVoice(turn.answer, voiceGender, false);
      if (fallbackVoice) {
        setSpeakingId(turn.id);
        speakWithDevice(turn.answer, fallbackVoice, onDeviceEnd);
      } else {
        setSpeakingId(null);
        markFailed();
      }
    }
  }

  function historyForRequest() {
    return turns.map((turn) => ({ question: turn.question, answer: turn.answer }));
  }

  async function submit(body: BodyInit, headers: HeadersInit | undefined, typedQuestion: string, readAloud: boolean) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/ask`, { method: "POST", headers, body });
      const data = await readJsonResponse<AskResponse>(response);
      if (!response.ok) throw new Error(data.error ?? "Ask Meeting failed.");
      const turn: Turn = {
        id: nextIdRef.current++,
        question: data.question || typedQuestion,
        answer: data.answer,
        quote: data.quote ?? null,
        speakerName: data.speakerName ?? null,
        startMs: data.startMs ?? null
      };
      setTurns((current) => [...current, turn]);
      setQuestion("");
      if (readAloud) void speak(turn);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Ask Meeting failed.");
    } finally {
      setLoading(false);
    }
  }

  function askTyped(nextQuestion = question) {
    const cleanQuestion = nextQuestion.trim();
    if (!cleanQuestion || !hasTranscript || busy) return;
    stopSpeaking();
    if (voiceAnswers) unlockAudio();
    void submit(
      JSON.stringify({ question: cleanQuestion, history: historyForRequest() }),
      { "Content-Type": "application/json" },
      cleanQuestion,
      voiceAnswers
    );
  }

  function stopRecordingTracks() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    if (!hasTranscript || busy) return;
    stopSpeaking();
    // Unlock playback now, inside the tap, so the spoken answer can play later.
    unlockAudio();
    setError("");
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
      const mimeType = recorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const seconds = (elapsedClock() - recordStartRef.current) / 1000;
        stopRecordingTracks();
        setRecording(false);
        // An accidental double-tap records nothing worth sending.
        if (seconds < 0.7 || chunks.length === 0) return;
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        const form = new FormData();
        form.append("audio", blob, type.includes("mp4") ? "question.m4a" : "question.webm");
        form.append("history", JSON.stringify(historyForRequest()));
        void submit(form, undefined, "", voiceAnswers);
      };
      recorderRef.current = recorder;
      recordStartRef.current = elapsedClock();
      setRecordSeconds(0);
      recorder.start();
      setRecording(true);
      timerRef.current = setInterval(() => {
        const seconds = Math.floor((elapsedClock() - recordStartRef.current) / 1000);
        setRecordSeconds(seconds);
        if (seconds >= MAX_QUESTION_SECONDS && recorder.state === "recording") recorder.stop();
      }, 250);
    } catch (error) {
      stopRecordingTracks();
      setRecording(false);
      setError(describeMicError(error));
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") recorder.stop();
  }

  function resetConversation() {
    stopSpeaking();
    setTurns([]);
    setError("");
  }

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
              disabled={busy}
              title={text.newConversation}
              aria-label={text.newConversation}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {turns.length || loading ? (
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
                    className="shrink-0 rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:text-leaf"
                    onClick={() => (speakingId === turn.id || voiceLoadingId === turn.id ? stopSpeaking() : void speak(turn))}
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
        <button
          type="button"
          onClick={() => (recording ? stopRecording() : void startRecording())}
          disabled={!hasTranscript || loading}
          className={`flex h-16 w-16 items-center justify-center rounded-full text-white shadow-md transition disabled:opacity-50 ${
            recording ? "animate-pulse bg-red-600" : "bg-leaf hover:brightness-110"
          }`}
          aria-label={recording ? text.stopAndAsk : text.askByVoice}
          title={recording ? text.stopAndAsk : text.askByVoice}
        >
          {recording ? <Square className="h-6 w-6 fill-current" /> : <Mic className="h-7 w-7" />}
        </button>
        <p className="text-xs font-semibold text-slate-500">
          {recording
            ? `${text.askListening} ${recordSeconds}s · ${text.stopAndAsk}`
            : hasTranscript
              ? text.askByVoice
              : text.askMeetingNeedsTranscript}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="kh-input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") askTyped();
          }}
          placeholder={hasTranscript ? text.askMeetingPlaceholder : text.askMeetingNeedsTranscript}
          disabled={!hasTranscript || busy}
        />
        <button className="kh-button-primary shrink-0 sm:w-auto" type="button" onClick={() => askTyped()} disabled={!hasTranscript || busy || !question.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestedQuestions.map((suggested) => (
          <button
            key={suggested}
            type="button"
            className="rounded-full border border-leaf/15 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-leaf/10 hover:text-leaf disabled:opacity-50"
            disabled={!hasTranscript || busy}
            onClick={() => askTyped(suggested)}
          >
            {suggested}
          </button>
        ))}
      </div>
      {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div> : null}
    </section>
  );
}
