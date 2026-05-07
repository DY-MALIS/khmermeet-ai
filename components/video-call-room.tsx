"use client";

import { Bot, Copy, FileText, LogOut, Mic, MicOff, Phone, RefreshCcw, Save, Square, Video, VideoOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { useDisplayLanguage } from "@/lib/display-language";
import type { DisplayLanguage } from "@/lib/navigation-labels";

type SignalMessage =
  | { type: "join"; roomId: string; from: string; name: string }
  | { type: "offer"; roomId: string; from: string; to: string; name: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; roomId: string; from: string; to: string; name: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; roomId: string; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: "media"; roomId: string; from: string; name: string; audioEnabled: boolean; videoEnabled: boolean }
  | { type: "leave"; roomId: string; from: string };

type Participant = {
  id: string;
  name: string;
  stream?: MediaStream;
  isLocal?: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string; confidence?: number };
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onaudioend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type ListeningStatusKey =
  | "idle"
  | "starting"
  | "listening"
  | "audio_paused"
  | "speech_detected"
  | "processing"
  | "saved_line"
  | "speech_retry"
  | "restarting"
  | "waiting_retry"
  | "stopped"
  | "unavailable";

type MicQualityKey = "idle" | "quiet" | "good" | "loud";

const listeningStatusLabels: Record<DisplayLanguage, Record<ListeningStatusKey, string>> = {
  km: {
    idle: "រង់ចាំ",
    starting: "កំពុងចាប់ផ្តើមស្ដាប់",
    listening: "កំពុងស្ដាប់",
    audio_paused: "សំឡេងផ្អាក",
    speech_detected: "រកឃើញសំឡេងនិយាយ",
    processing: "កំពុងវិភាគសំឡេង",
    saved_line: "បានរក្សា transcript",
    speech_retry: "កំពុងព្យាយាមស្ដាប់ម្ដងទៀត",
    restarting: "កំពុង restart smart listener",
    waiting_retry: "រង់ចាំព្យាយាមម្ដងទៀត",
    stopped: "បានបញ្ឈប់",
    unavailable: "Speech-to-text មិនមាន"
  },
  en: {
    idle: "Idle",
    starting: "Starting smart listener",
    listening: "Listening",
    audio_paused: "Audio paused",
    speech_detected: "Speech detected",
    processing: "Processing speech",
    saved_line: "Saved transcript line",
    speech_retry: "Retrying speech",
    restarting: "Restarting smart listener",
    waiting_retry: "Waiting to retry",
    stopped: "Stopped",
    unavailable: "Speech-to-text unavailable"
  }
};

const micQualityLabels: Record<DisplayLanguage, Record<MicQualityKey, string>> = {
  km: {
    idle: "រង់ចាំសម្លេង",
    quiet: "សម្លេងទាបពេក - សូមនៅជិត microphone",
    good: "សម្លេងច្បាស់ល្អ",
    loud: "សម្លេងខ្លាំងពេក - សូមថយពី microphone បន្តិច"
  },
  en: {
    idle: "Waiting for voice",
    quiet: "Voice is too quiet - move closer to the microphone",
    good: "Voice is clear",
    loud: "Voice is too loud - move back from the microphone"
  }
};

const clearVoiceAudioConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 16 }
};

function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function cleanTranscriptSegment(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function appendSmartTranscript(current: string, segment: string) {
  const clean = cleanTranscriptSegment(segment);
  if (!clean) return current;
  const existing = current.trim();
  if (!existing) return clean;
  if (existing.includes(clean) || existing.endsWith(clean)) return current;
  return `${existing}\n${clean}`;
}

function VideoTile({ participant }: { participant: Participant }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (ref.current && participant.stream) {
      ref.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-ink">
      {participant.stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={participant.isLocal}
          className={cn("h-full w-full object-cover", !participant.videoEnabled && "opacity-0")}
        />
      ) : null}
      {!participant.videoEnabled ? (
        <div className="absolute inset-0 grid place-items-center bg-slate-900 text-white">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-leaf text-2xl font-bold">
            {participant.name.slice(0, 1).toUpperCase()}
          </div>
        </div>
      ) : null}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white">
        {participant.audioEnabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
        {participant.name}
      </div>
    </div>
  );
}

export function VideoCallRoom() {
  const selfId = useMemo(() => crypto.randomUUID(), []);
  const [displayLanguage] = useDisplayLanguage();
  const [roomId, setRoomId] = useState(() => createRoomId());
  const [displayName, setDisplayName] = useState("Local User");
  const [joined, setJoined] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [agentRecording, setAgentRecording] = useState(false);
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentTranscript, setAgentTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [listeningStatus, setListeningStatus] = useState<ListeningStatusKey>("idle");
  const [speechConfidence, setSpeechConfidence] = useState<number | null>(null);
  const [speechRestartCount, setSpeechRestartCount] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [micQuality, setMicQuality] = useState<MicQualityKey>("idle");
  const [savedMeetingId, setSavedMeetingId] = useState("");
  const [agentNotice, setAgentNotice] = useState("");
  const [error, setError] = useState("");
  const channelRef = useRef<BroadcastChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callRecorderRef = useRef<MediaRecorder | null>(null);
  const callChunksRef = useRef<Blob[]>([]);
  const callRecordStartedAtRef = useRef<number>(0);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRestartSpeechRef = useRef(false);
  const speechRestartTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const micMonitorFrameRef = useRef<number | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const namesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room") || roomId;
    setRoomId(room);
    if (!params.get("room")) {
      window.history.replaceState(null, "", `/meetings/call?room=${room}`);
    }
    return () => leaveRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateParticipant(next: Participant) {
    setParticipants((current) => {
      const exists = current.some((participant) => participant.id === next.id);
      if (!exists) return [...current, next];
      return current.map((participant) => (participant.id === next.id ? { ...participant, ...next } : participant));
    });
  }

  function post(message: SignalMessage) {
    channelRef.current?.postMessage(message);
  }

  async function resumeMicAudioContext() {
    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume();
    }
  }

  async function getMeetingStream() {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: clearVoiceAudioConstraints
      });
    } catch {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      } catch {
        const audioOnly = await navigator.mediaDevices.getUserMedia({
          audio: clearVoiceAudioConstraints
        });
        setAgentNotice("Camera មិនអាចបើកបានទេ។ App បានបើក audio-only mode ដើម្បីចាប់សំឡេងប្រជុំ។");
        return audioOnly;
      }
    }
  }

  async function getAudioOnlyStream() {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: clearVoiceAudioConstraints
      });
    } catch {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }
  }

  async function enableMicrophoneOnly() {
    setError("");
    try {
      const stream = await getAudioOnlyStream();
      localStreamRef.current = stream;
      startMicMonitor(stream);
      await resumeMicAudioContext();
      setAudioEnabled(true);
      setVideoEnabled(false);
      updateParticipant({
        id: selfId,
        name: displayName,
        stream,
        isLocal: true,
        audioEnabled: true,
        videoEnabled: false
      });
      setAgentNotice("Microphone ត្រូវបានបើកហើយ។ សូមនិយាយសាកល្បង មើល bar Voice clarity រត់ បន្ទាប់មកចុច Start Agent។");
      return stream;
    } catch {
      setMicQuality("idle");
      setError("មិនអាចបើក microphone បានទេ។ សូមបើក browser permission: Camera/Microphone = Allow ហើយកុំប្រើ in-app browser របស់ Facebook/Telegram។");
      return null;
    }
  }

  function stopMicMonitor() {
    if (micMonitorFrameRef.current) window.cancelAnimationFrame(micMonitorFrameRef.current);
    micMonitorFrameRef.current = null;
    audioAnalyserRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setMicLevel(0);
    setMicQuality("idle");
  }

  function startMicMonitor(stream: MediaStream) {
    stopMicMonitor();
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    void context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    const source = context.createMediaStreamSource(new MediaStream([audioTrack]));
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    audioContextRef.current = context;
    audioAnalyserRef.current = analyser;

    const tick = () => {
      if (context.state === "suspended") {
        void context.resume();
      }
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / samples.length);
      const level = Math.min(100, Math.round(rms * 260));
      setMicLevel(level);
      if (level < 5) setMicQuality("idle");
      else if (level < 16) setMicQuality("quiet");
      else if (level > 82) setMicQuality("loud");
      else setMicQuality("good");
      micMonitorFrameRef.current = window.requestAnimationFrame(tick);
    };

    tick();
  }

  function makePeer(peerId: string, peerName: string) {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;

    namesRef.current.set(peerId, peerName);
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    peersRef.current.set(peerId, peer);

    localStreamRef.current?.getTracks().forEach((track) => {
      if (localStreamRef.current) peer.addTrack(track, localStreamRef.current);
    });

    const remoteStream = new MediaStream();
    updateParticipant({
      id: peerId,
      name: peerName,
      stream: remoteStream,
      audioEnabled: true,
      videoEnabled: true
    });

    peer.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
      updateParticipant({
        id: peerId,
        name: namesRef.current.get(peerId) ?? peerName,
        stream: remoteStream,
        audioEnabled: true,
        videoEnabled: true
      });
    };

    peer.onicecandidate = (event) => {
      if (event.candidate && roomId) {
        post({ type: "ice", roomId, from: selfId, to: peerId, candidate: event.candidate.toJSON() });
      }
    };

    peer.onconnectionstatechange = () => {
      if (["closed", "failed", "disconnected"].includes(peer.connectionState)) {
        peersRef.current.delete(peerId);
      }
    };

    return peer;
  }

  async function createOffer(peerId: string, peerName: string) {
    const peer = makePeer(peerId, peerName);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    post({ type: "offer", roomId, from: selfId, to: peerId, name: displayName, sdp: offer });
  }

  async function handleSignal(message: SignalMessage) {
    if (message.roomId !== roomId || message.from === selfId) return;

    if (message.type === "join") {
      await createOffer(message.from, message.name);
      post({
        type: "media",
        roomId,
        from: selfId,
        name: displayName,
        audioEnabled,
        videoEnabled
      });
      return;
    }

    if ("to" in message && message.to !== selfId) return;

    if (message.type === "offer") {
      const peer = makePeer(message.from, message.name);
      await peer.setRemoteDescription(message.sdp);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      post({ type: "answer", roomId, from: selfId, to: message.from, name: displayName, sdp: answer });
      return;
    }

    if (message.type === "answer") {
      await peersRef.current.get(message.from)?.setRemoteDescription(message.sdp);
      return;
    }

    if (message.type === "ice") {
      await peersRef.current.get(message.from)?.addIceCandidate(message.candidate);
      return;
    }

    if (message.type === "media") {
      namesRef.current.set(message.from, message.name);
      updateParticipant({
        id: message.from,
        name: message.name,
        stream: participants.find((participant) => participant.id === message.from)?.stream,
        audioEnabled: message.audioEnabled,
        videoEnabled: message.videoEnabled
      });
      return;
    }

    if (message.type === "leave") {
      peersRef.current.get(message.from)?.close();
      peersRef.current.delete(message.from);
      setParticipants((current) => current.filter((participant) => participant.id !== message.from));
    }
  }

  async function joinRoom() {
    setError("");
    if (!roomId.trim()) {
      setError("សូមបញ្ចូល room code។");
      return;
    }

    try {
      const stream = await getMeetingStream();
      localStreamRef.current = stream;
      startMicMonitor(stream);
      await resumeMicAudioContext();
      const hasVideo = stream.getVideoTracks().length > 0;
      setAudioEnabled(true);
      setVideoEnabled(hasVideo);
      setParticipants([
        {
          id: selfId,
          name: displayName,
          stream,
          isLocal: true,
          audioEnabled: true,
          videoEnabled: hasVideo
        }
      ]);

      const channel = new BroadcastChannel(`khmermeet-call-${roomId}`);
      channel.onmessage = (event: MessageEvent<SignalMessage>) => {
        void handleSignal(event.data);
      };
      channelRef.current = channel;
      setJoined(true);
      post({ type: "join", roomId, from: selfId, name: displayName });
      window.history.replaceState(null, "", `/meetings/call?room=${roomId}`);
    } catch {
      setMicQuality("idle");
      setError("មិនអាចបើក microphone បានទេ។ សូមចុច Allow microphone ក្នុង browser settings ហើយសាកល្បងម្តងទៀត។");
    }
  }

  function toggleAudio() {
    const next = !audioEnabled;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setAudioEnabled(next);
    updateParticipant({ id: selfId, name: displayName, stream: localStreamRef.current ?? undefined, isLocal: true, audioEnabled: next, videoEnabled });
    post({ type: "media", roomId, from: selfId, name: displayName, audioEnabled: next, videoEnabled });
  }

  function toggleVideo() {
    const next = !videoEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setVideoEnabled(next);
    updateParticipant({ id: selfId, name: displayName, stream: localStreamRef.current ?? undefined, isLocal: true, audioEnabled, videoEnabled: next });
    post({ type: "media", roomId, from: selfId, name: displayName, audioEnabled, videoEnabled: next });
  }

  function leaveRoom() {
    shouldRestartSpeechRef.current = false;
    if (speechRestartTimerRef.current) window.clearTimeout(speechRestartTimerRef.current);
    speechRestartTimerRef.current = null;
    speechRef.current?.stop();
    speechRef.current = null;
    if (roomId) post({ type: "leave", roomId, from: selfId });
    channelRef.current?.close();
    channelRef.current = null;
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    stopMicMonitor();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setParticipants([]);
    setJoined(false);
  }

  async function copyInvite() {
    const url = `${window.location.origin}/meetings/call?room=${roomId}`;
    await navigator.clipboard.writeText(url);
  }

  async function copyRoomCode() {
    await navigator.clipboard.writeText(roomId);
    setAgentNotice("Room code ត្រូវបាន copy រួច។ អ្នកចូលក្រោយអាចវាយ code នេះក្នុងទំព័រ Video Call។");
  }

  function getRecorderMimeType() {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  function getCallAudioStream() {
    const tracks = new Map<string, MediaStreamTrack>();
    localStreamRef.current?.getAudioTracks().forEach((track) => tracks.set(track.id, track));
    participants.forEach((participant) => {
      if (!participant.isLocal) {
        participant.stream?.getAudioTracks().forEach((track) => tracks.set(track.id, track));
      }
    });
    return new MediaStream([...tracks.values()]);
  }

  function createSpeechRecognition() {
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) return null;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "km-KH";
    recognition.onaudiostart = () => setListeningStatus("listening");
    recognition.onaudioend = () => setListeningStatus("audio_paused");
    recognition.onspeechstart = () => setListeningStatus("speech_detected");
    recognition.onspeechend = () => setListeningStatus("processing");
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      let confidenceTotal = 0;
      let confidenceCount = 0;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = cleanTranscriptSegment(result[0].transcript);
        if (typeof result[0].confidence === "number") {
          confidenceTotal += result[0].confidence;
          confidenceCount += 1;
        }
        if (result.isFinal) finalText += `${transcript} `;
        else interimText += transcript;
      }
      if (confidenceCount) setSpeechConfidence(Math.round((confidenceTotal / confidenceCount) * 100));
      if (finalText) setAgentTranscript((current) => appendSmartTranscript(current, finalText));
      setInterimTranscript(interimText);
      setListeningStatus(finalText ? "saved_line" : "listening");
    };
    recognition.onerror = (event) => {
      void event;
      setListeningStatus("speech_retry");
      setAgentNotice("Speech-to-text មិនដំណើរការល្អនៅ browser នេះទេ។ Agent នឹងរក្សា audio ហើយអ្នកអាចកែ transcript បន្ថែមបាន។");
    };
    recognition.onend = () => {
      if (!shouldRestartSpeechRef.current) {
        setListeningStatus("stopped");
        return;
      }
      setListeningStatus("restarting");
      setSpeechRestartCount((count) => count + 1);
      if (speechRestartTimerRef.current) window.clearTimeout(speechRestartTimerRef.current);
      speechRestartTimerRef.current = window.setTimeout(() => {
        const nextRecognition = createSpeechRecognition();
        if (!nextRecognition || !shouldRestartSpeechRef.current) return;
        speechRef.current = nextRecognition;
        try {
          nextRecognition.start();
        } catch {
          setListeningStatus("waiting_retry");
        }
      }, 450);
    };
    return recognition;
  }

  async function startAgentRecording() {
    setError("");
    setAgentNotice("");
    setSavedMeetingId("");
    if (!localStreamRef.current) {
      const stream = await enableMicrophoneOnly();
      if (!stream) {
        setError("សូមបើក Microphone មុនពេលចាប់ផ្តើម Agent recording។");
        return;
      }
    }
    if (!localStreamRef.current) {
      setError("មិនទាន់មាន microphone សម្រាប់ថតទេ។");
      return;
    }
    if (!("MediaRecorder" in window)) {
      setError("Browser នេះមិនគាំទ្រ MediaRecorder ទេ។");
      return;
    }
    void resumeMicAudioContext();
    const audioStream = getCallAudioStream();
    if (!audioStream.getAudioTracks().length) {
      setError("មិនមាន audio track សម្រាប់ថតទេ។");
      return;
    }
    const mimeType = getRecorderMimeType();
    const recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
    callChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) callChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      audioStream.getTracks().forEach((track) => track.stop());
      void saveAgentRecording(recorder.mimeType || "audio/webm");
    };
    callRecorderRef.current = recorder;
    callRecordStartedAtRef.current = Date.now();
    recorder.start(1000);

    shouldRestartSpeechRef.current = true;
    setListeningStatus("starting");
    setSpeechConfidence(null);
    setSpeechRestartCount(0);
    const recognition = createSpeechRecognition();
    if (recognition) {
      speechRef.current = recognition;
      try {
        recognition.start();
        setAgentNotice("Agent កំពុងថតសំឡេង និងសរសេរ transcript ស្វ័យប្រវត្តិ។ Smart listening នឹង restart ដោយស្វ័យប្រវត្តិ បើ browser ផ្អាក។");
      } catch {
        setListeningStatus("waiting_retry");
        setAgentNotice("Agent កំពុងថត audio។ Speech-to-text នឹងព្យាយាមចាប់ផ្តើមម្តងទៀតដោយស្វ័យប្រវត្តិ។");
      }
    } else {
      shouldRestartSpeechRef.current = false;
      setListeningStatus("unavailable");
      setAgentNotice("Browser នេះមិនគាំទ្រ live speech-to-text ទេ។ Agent នឹងថត audio ហើយរក្សា transcript ដែលអ្នកបញ្ចូលដោយដៃ។");
    }
    setAgentRecording(true);
  }

  function stopAgentRecording() {
    shouldRestartSpeechRef.current = false;
    if (speechRestartTimerRef.current) window.clearTimeout(speechRestartTimerRef.current);
    speechRestartTimerRef.current = null;
    speechRef.current?.stop();
    speechRef.current = null;
    setInterimTranscript("");
    setListeningStatus("stopped");
    setAgentRecording(false);
    callRecorderRef.current?.stop();
  }

  async function saveAgentRecording(mimeType: string) {
    setAgentSaving(true);
    setAgentNotice("Agent កំពុង upload audio និងរក្សា meeting record...");
    try {
      const blob = new Blob(callChunksRef.current, { type: mimeType });
      const uploadData = new FormData();
      uploadData.append("audio", blob, mimeType.includes("mp4") ? "call.m4a" : "call.webm");
      const uploadResponse = await fetch("/api/uploads", { method: "POST", body: uploadData });
      const uploadJson = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadJson.error ?? "Upload failed");

      const transcript = `${agentTranscript}\n${interimTranscript}`.trim();
      const duration = Math.max(1, Math.round((Date.now() - callRecordStartedAtRef.current) / 1000));
      const saveResponse = await fetch("/api/call-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Video call ${roomId}`,
          audioUrl: uploadJson.audioUrl,
          transcript,
          duration
        })
      });
      const saveJson = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saveJson.error ?? "Save failed");
      setSavedMeetingId(saveJson.meetingId);
      setAgentNotice("Agent បានរក្សា audio, transcript, summary និង tasks រួចរាល់។");
    } catch {
      setError("Agent មិនអាចរក្សា meeting បានទេ។ សូមសាកល្បងម្តងទៀត។");
    } finally {
      setAgentSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="kh-card grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-semibold text-slate-600">ឈ្មោះអ្នកចូលរួម</span>
            <input className="kh-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={joined} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-slate-600">Room code</span>
            <div className="flex gap-2">
              <input className="kh-input uppercase" value={roomId} onChange={(event) => setRoomId(event.target.value.toUpperCase())} disabled={joined} />
              <button className="kh-button-secondary px-3" type="button" onClick={copyRoomCode} title="Copy room code">
                <Copy className="h-4 w-4" />
              </button>
              {!joined ? (
                <button className="kh-button-secondary px-3" type="button" onClick={() => setRoomId(createRoomId())} title="New room">
                  <RefreshCcw className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <p className="text-xs text-slate-500">
              អ្នកចូលក្រោយអាចបើកទំព័រ Video Call, វាយ room code នេះ, រួចចុច “ចូល Video Call”។
            </p>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {!joined ? (
            <button className="kh-button-primary" type="button" onClick={joinRoom}>
              <Phone className="h-4 w-4" />
              ចូល Video Call
            </button>
          ) : (
            <>
              <button className="kh-button-secondary" type="button" onClick={copyInvite}>
                <Copy className="h-4 w-4" />
                Copy invite
              </button>
              <button className="kh-button-secondary" type="button" onClick={toggleAudio}>
                {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                {audioEnabled ? "Mute" : "Unmute"}
              </button>
              <button className="kh-button-secondary" type="button" onClick={toggleVideo}>
                {videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                {videoEnabled ? "Camera off" : "Camera on"}
              </button>
              <button className="kh-button-secondary text-red-600" type="button" onClick={leaveRoom}>
                <LogOut className="h-4 w-4" />
                ចាកចេញ
              </button>
            </>
          )}
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-lg border border-saffron/25 bg-saffron/10 p-4 text-sm text-ink">
        MVP នេះប្រើ WebRTC + BroadcastChannel សម្រាប់ local multi-person call។ ដើម្បីសាកល្បងច្រើននាក់ សូម copy invite ហើយបើកក្នុង browser tab/window ផ្សេងៗលើ machine នេះ។ សម្រាប់ call ឆ្លងកាត់ internet ពិតៗ ត្រូវបន្ថែម signaling server និង TURN server។
      </div>

      <section className="kh-card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-leaf">
              <Bot className="h-4 w-4" />
              Meeting Agent
            </p>
            <h2 className="mt-1 text-xl font-bold text-ink">ថតសំឡេង សរសេរ transcript និងរក្សាស្វ័យប្រវត្តិ</h2>
            <p className="mt-2 text-sm text-slate-500">
              Agent នឹងថត audio ពេល video call, សរសេរ transcript បើ browser គាំទ្រ, រួចបង្កើត meeting summary និង tasks។
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!agentRecording ? (
              <button className="kh-button-primary" type="button" onClick={() => void startAgentRecording()} disabled={agentSaving}>
                <Mic className="h-4 w-4" />
                Start Agent
              </button>
            ) : (
              <button className="kh-button-secondary text-red-600" type="button" onClick={stopAgentRecording}>
                <Square className="h-4 w-4" />
                Stop & Save
              </button>
            )}
            {savedMeetingId ? (
              <a className="kh-button-secondary" href={`/meetings/${savedMeetingId}`}>
                <FileText className="h-4 w-4" />
                Open record
              </a>
            ) : null}
          </div>
        </div>
        {agentNotice ? <div className="mt-4 rounded-lg bg-leaf/10 p-3 text-sm text-leaf">{agentNotice}</div> : null}
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-600">
            <span>{displayLanguage === "en" ? "Voice clarity" : "ភាពច្បាស់នៃសម្លេង"}</span>
            <div className="flex flex-wrap items-center gap-2">
              {!localStreamRef.current?.getAudioTracks().length ? (
                <button className="rounded-full bg-leaf px-3 py-1 text-xs font-bold text-white" type="button" onClick={() => void enableMicrophoneOnly()}>
                  {displayLanguage === "en" ? "Enable microphone" : "បើក Microphone"}
                </button>
              ) : null}
              <span
                className={cn(
                  "rounded-full px-2.5 py-1",
                  micQuality === "good" && "bg-leaf/10 text-leaf",
                  micQuality === "quiet" && "bg-saffron/15 text-saffron",
                  micQuality === "loud" && "bg-red-100 text-red-700",
                  micQuality === "idle" && "bg-white text-slate-500"
                )}
              >
                {micQualityLabels[displayLanguage][micQuality]}
              </span>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                micQuality === "good" && "bg-leaf",
                micQuality === "quiet" && "bg-saffron",
                micQuality === "loud" && "bg-red-500",
                micQuality === "idle" && "bg-slate-300"
              )}
              style={{ width: `${micLevel}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {displayLanguage === "en"
              ? "Clear voice mode uses echo cancellation, noise suppression, auto gain, and a live microphone level check."
              : "Clear voice mode ប្រើ echo cancellation, noise suppression, auto gain និងពិនិត្យកម្រិត microphone ជាបន្តផ្ទាល់។"}
          </p>
          {!localStreamRef.current?.getAudioTracks().length ? (
            <p className="mt-1 text-xs font-semibold text-saffron">
              {displayLanguage === "en"
                ? "Tap Enable microphone first. On mobile, open this page in Safari or Chrome, not inside Facebook/Telegram."
                : "សូមចុច បើក Microphone ជាមុន។ លើទូរស័ព្ទ សូមបើកដោយ Safari ឬ Chrome មិនមែន browser ក្នុង Facebook/Telegram។"}
            </p>
          ) : null}
        </div>
        <label className="mt-4 block space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-600">Live transcript</span>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className={cn("rounded-full px-2.5 py-1", agentRecording ? "bg-leaf/10 text-leaf" : "bg-slate-100 text-slate-500")}>
                {displayLanguage === "en" ? "Smart listening" : "ការស្ដាប់ឆ្លាតវៃ"}: {listeningStatusLabels[displayLanguage][listeningStatus]}
              </span>
              {speechConfidence !== null ? (
                <span className="rounded-full bg-sky/15 px-2.5 py-1 text-sky">
                  {displayLanguage === "en" ? "Confidence" : "កម្រិតជឿជាក់"} {speechConfidence}%
                </span>
              ) : null}
              {speechRestartCount ? (
                <span className="rounded-full bg-saffron/15 px-2.5 py-1 text-saffron">
                  {displayLanguage === "en" ? "Auto retry" : "ព្យាយាមឡើងវិញ"} {speechRestartCount}
                </span>
              ) : null}
            </div>
          </div>
          <textarea
            className="kh-input min-h-36"
            value={`${agentTranscript}${interimTranscript ? `\n${interimTranscript}` : ""}`}
            onChange={(event) => {
              setAgentTranscript(event.target.value);
              setInterimTranscript("");
            }}
            placeholder="Agent transcript នឹងបង្ហាញនៅទីនេះ។ អ្នកក៏អាចវាយកំណត់ត្រាបន្ថែមដោយដៃបាន។"
          />
        </label>
        {agentSaving ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Save className="h-4 w-4" />
            កំពុងរក្សាទុក...
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {participants.length ? (
          participants.map((participant) => <VideoTile key={participant.id} participant={participant} />)
        ) : (
          <div className="kh-card col-span-full grid min-h-72 place-items-center p-8 text-center">
            <div>
              <Video className="mx-auto mb-3 h-10 w-10 text-leaf" />
              <p className="text-lg font-bold text-ink">មិនទាន់ចូល Video Call</p>
              <p className="mt-2 text-sm text-slate-500">ចុច “ចូល Video Call” ហើយអនុញ្ញាត camera និង microphone។</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
