"use client";

import { Bot, Copy, FileText, LogOut, Mic, MicOff, Phone, RefreshCcw, Save, Square, Volume2, Video, VideoOff } from "lucide-react";
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

type SpeakerRecorderState = {
  speakerName: string;
  recorder: MediaRecorder;
  chunks: Blob[];
  mimeType: string;
};

type SpeakerRecording = {
  speakerName: string;
  blob: Blob;
  mimeType: string;
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
    unavailable: "Browser preview off"
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

const targetTeamSize = 10;
const meshVideoConstraints: MediaTrackConstraints = {
  facingMode: "user",
  width: { ideal: 640, max: 960 },
  height: { ideal: 360, max: 540 },
  frameRate: { ideal: 15, max: 20 }
};

function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function createClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

function speakerLine(name: string, text: string) {
  const clean = cleanTranscriptSegment(text);
  if (!clean) return "";
  return `${name || "Speaker"}: ${clean}`;
}

function mediaPermissionHelp(error?: unknown) {
  if (error instanceof Error && error.message === "INSECURE_CONTEXT") {
    return "Camera/Microphone ត្រូវការ HTTPS សម្រាប់ទូរស័ព្ទ និងកុំព្យូទ័រផ្សេងៗ។ សូមប្រើ Vercel link https://khmermeet-ai.vercel.app ឬ localhost លើកុំព្យូទ័រដែលរត់ app។";
  }
  if (error instanceof Error && error.message === "MEDIA_DEVICES_UNAVAILABLE") {
    return "Browser នេះមិនគាំទ្រ camera/microphone ទេ។ សូមប្រើ Chrome, Edge, ឬ Safari ថ្មីៗ ហើយកុំបើកក្នុង Facebook/Telegram in-app browser។";
  }
  return "មិនអាចបើក camera/microphone បានទេ។ សូមចុច Allow ក្នុង browser permission, បិទ browser tab ផ្សេងដែលកំពុងប្រើ camera/mic, ហើយសាកល្បងម្តងទៀត។";
}

function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const stunUrl = process.env.NEXT_PUBLIC_STUN_URL;
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;

  if (stunUrl) {
    servers.unshift({ urls: stunUrl.split(",").map((url) => url.trim()).filter(Boolean) });
  }

  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(",").map((url) => url.trim()).filter(Boolean),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL
    });
  }

  return servers;
}

function tuneSenderForTeamCall(sender: RTCRtpSender, kind: string) {
  const params = sender.getParameters();
  params.encodings = params.encodings?.length ? params.encodings : [{}];
  if (kind === "video") {
    params.encodings[0].maxBitrate = 350_000;
    params.encodings[0].maxFramerate = 15;
    params.degradationPreference = "maintain-framerate";
  }
  if (kind === "audio") {
    params.encodings[0].maxBitrate = 40_000;
  }
  void sender.setParameters(params).catch(() => undefined);
}

function VideoTile({ participant }: { participant: Participant }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (ref.current && participant.stream) {
      ref.current.srcObject = participant.stream;
      void ref.current.play().catch(() => undefined);
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
          onLoadedMetadata={(event) => void event.currentTarget.play().catch(() => undefined)}
          className={cn(
            "h-full w-full object-contain bg-slate-950",
            !participant.videoEnabled && "opacity-0"
          )}
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
  const selfId = useMemo(() => createClientId(), []);
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
  const [speechLanguage, setSpeechLanguage] = useState<"km-KH" | "en-US">("km-KH");
  const [listeningStatus, setListeningStatus] = useState<ListeningStatusKey>("idle");
  const [speechConfidence, setSpeechConfidence] = useState<number | null>(null);
  const [speechRestartCount, setSpeechRestartCount] = useState(0);
  const [liveTranscriptPending, setLiveTranscriptPending] = useState(0);
  const [liveTranscriptError, setLiveTranscriptError] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [micQuality, setMicQuality] = useState<MicQualityKey>("idle");
  const [savedMeetingId, setSavedMeetingId] = useState("");
  const [agentNotice, setAgentNotice] = useState("");
  const [error, setError] = useState("");
  const [speakerUnlocked, setSpeakerUnlocked] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const signalPollRef = useRef<number | null>(null);
  const signalSinceRef = useRef(0);
  const joinedAtRef = useRef(0);
  const signalFailuresRef = useRef(0);
  const seenSignalsRef = useRef<Set<string>>(new Set());
  const localStreamRef = useRef<MediaStream | null>(null);
  const callRecorderRef = useRef<MediaRecorder | null>(null);
  const callChunksRef = useRef<Blob[]>([]);
  const liveTranscriptRecorderRef = useRef<MediaRecorder | null>(null);
  const liveTranscriptRestartTimerRef = useRef<number | null>(null);
  const liveTranscriptInFlightRef = useRef(false);
  const liveTranscriptQueueRef = useRef<Array<{ blob: Blob; mimeType: string }>>([]);
  const callRecordStartedAtRef = useRef<number>(0);
  const speakerRecordersRef = useRef<Map<string, SpeakerRecorderState>>(new Map());
  const speakerRecordingsReadyRef = useRef<Promise<SpeakerRecording[]> | null>(null);
  const agentTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const transcriptSnapshotRef = useRef("");
  const agentRecordingRef = useRef(false);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordingSourceNodesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const recordingTrackIdsRef = useRef<Set<string>>(new Set());
  const mixedAudioStreamRef = useRef<MediaStream | null>(null);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRestartSpeechRef = useRef(false);
  const speechRestartTimerRef = useRef<number | null>(null);
  const speechWatchdogTimerRef = useRef<number | null>(null);
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

  useEffect(() => {
    agentTranscriptRef.current = agentTranscript;
  }, [agentTranscript]);

  useEffect(() => {
    interimTranscriptRef.current = interimTranscript;
  }, [interimTranscript]);

  useEffect(() => {
    agentRecordingRef.current = agentRecording;
  }, [agentRecording]);

  function getCurrentAgentTranscript() {
    return `${agentTranscriptRef.current}\n${interimTranscriptRef.current}`.trim();
  }

  function updateParticipant(next: Participant) {
    setParticipants((current) => {
      const exists = current.some((participant) => participant.id === next.id);
      if (!exists) return [...current, next];
      return current.map((participant) =>
        participant.id === next.id ? { ...participant, ...next, stream: next.stream ?? participant.stream } : participant
      );
    });
  }

  function markSignalSeen(message: SignalMessage) {
    const key = JSON.stringify(message);
    if (seenSignalsRef.current.has(key)) return false;
    seenSignalsRef.current.add(key);
    if (seenSignalsRef.current.size > 500) {
      seenSignalsRef.current = new Set([...seenSignalsRef.current].slice(-250));
    }
    return true;
  }

  function post(message: SignalMessage) {
    channelRef.current?.postMessage(message);
    void fetch("/api/call-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: message.roomId, message })
    }).catch(() => {
      signalFailuresRef.current += 1;
    });
  }

  function stopServerSignalPolling() {
    if (signalPollRef.current) window.clearInterval(signalPollRef.current);
    signalPollRef.current = null;
    signalSinceRef.current = 0;
    signalFailuresRef.current = 0;
  }

  async function initializeSignalCursor(activeRoomId: string) {
    try {
      const response = await fetch(`/api/call-signals?roomId=${encodeURIComponent(activeRoomId)}&latest=1`, {
        cache: "no-store"
      });
      if (!response.ok) return;
      const data = (await response.json()) as { nextSince?: number };
      signalSinceRef.current = data.nextSince ?? 0;
    } catch {
      signalSinceRef.current = 0;
    }
  }

  function startServerSignalPolling(activeRoomId: string) {
    stopServerSignalPolling();

    const poll = async () => {
      try {
        const response = await fetch(`/api/call-signals?roomId=${encodeURIComponent(activeRoomId)}&since=${signalSinceRef.current}`, {
          cache: "no-store"
        });
        if (!response.ok) throw new Error("Signal polling failed");
        const data = (await response.json()) as {
          nextSince?: number;
          messages?: Array<{ id: number; createdAt?: string | number; message: SignalMessage }>;
        };
        signalSinceRef.current = data.nextSince ?? signalSinceRef.current;
        signalFailuresRef.current = 0;
        for (const signal of data.messages ?? []) {
          signalSinceRef.current = Math.max(signalSinceRef.current, signal.id);
          if (getSignalCreatedAtMs(signal.createdAt) < joinedAtRef.current) continue;
          await handleSignal(signal.message);
        }
      } catch {
        signalFailuresRef.current += 1;
        if (signalFailuresRef.current === 3) {
          setAgentNotice("Server signaling មិនអាចភ្ជាប់បានទេ។ អ្នកផ្សេងអាចចូលបានតែក្នុង browser tabs លើ machine ដូចគ្នា។");
        }
      }
    };

    void poll();
    signalPollRef.current = window.setInterval(() => void poll(), 900);
  }

  function getSignalCreatedAtMs(value: string | number | undefined) {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return Date.now();
  }

  async function resumeMicAudioContext() {
    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume();
    }
  }

  async function unlockRemotePlayback() {
    await resumeMicAudioContext().catch(() => undefined);
    const videos = Array.from(document.querySelectorAll("video"));
    await Promise.all(videos.map((video) => video.play().catch(() => undefined)));
    setSpeakerUnlocked(true);
    setAgentNotice("Speaker ត្រូវបានបើកហើយ។ ប្រសិនបើនៅតែមិនលឺ សូមពិនិត្យ volume/device speaker និងឲ្យអ្នកម្ខាងទៀត Unmute microphone។");
  }

  async function getMeetingStream() {
    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      throw new Error("INSECURE_CONTEXT");
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("MEDIA_DEVICES_UNAVAILABLE");
    }

    try {
      return await navigator.mediaDevices.getUserMedia({
        video: meshVideoConstraints,
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
    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      throw new Error("INSECURE_CONTEXT");
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("MEDIA_DEVICES_UNAVAILABLE");
    }

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
    } catch (error) {
      setMicQuality("idle");
      setError(mediaPermissionHelp(error));
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
    const peer = new RTCPeerConnection({ iceServers: getIceServers() });
    peersRef.current.set(peerId, peer);

    localStreamRef.current?.getTracks().forEach((track) => {
      if (localStreamRef.current) {
        const sender = peer.addTrack(track, localStreamRef.current);
        tuneSenderForTeamCall(sender, track.kind);
      }
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
      event.streams[0]?.getTracks().forEach((track) => {
        remoteStream.addTrack(track);
        if (track.kind === "audio" && agentRecordingRef.current) {
          addTrackToMixedRecording(track);
          startSpeakerRecorderForTrack(track, namesRef.current.get(peerId) ?? peerName);
        }
      });
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
    if (!markSignalSeen(message)) return;

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
      await unlockRemotePlayback();
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

      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel(`khmermeet-call-${roomId}`);
        channel.onmessage = (event: MessageEvent<SignalMessage>) => {
          void handleSignal(event.data);
        };
        channelRef.current = channel;
      }
      joinedAtRef.current = Date.now();
      await initializeSignalCursor(roomId);
      startServerSignalPolling(roomId);
      setJoined(true);
      post({ type: "join", roomId, from: selfId, name: displayName });
      window.history.replaceState(null, "", `/meetings/call?room=${roomId}`);
    } catch (error) {
      setMicQuality("idle");
      setError(mediaPermissionHelp(error));
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
    const shouldSaveRecording =
      callRecorderRef.current?.state === "recording" || callRecorderRef.current?.state === "paused" || agentRecording;
    if (shouldSaveRecording) {
      stopAgentRecording();
    }
    shouldRestartSpeechRef.current = false;
    clearSpeechTimers();
    try {
      speechRef.current?.stop();
    } catch {
      // Speech recognition may already be stopped by Stop & Save.
    }
    speechRef.current = null;
    if (roomId) post({ type: "leave", roomId, from: selfId });
    stopServerSignalPolling();
    channelRef.current?.close();
    channelRef.current = null;
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    if (!shouldSaveRecording) stopMixedRecordingAudio();
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

  function getRecorderOptions(mimeType: string, audioBitsPerSecond = 128000) {
    return mimeType ? { mimeType, audioBitsPerSecond } : { audioBitsPerSecond };
  }

  function getParticipantNames() {
    return [...new Set([displayName, ...participants.map((participant) => participant.name)].filter(Boolean))];
  }

  function commitInterimTranscript() {
    const interim = interimTranscriptRef.current.trim();
    if (!interim) return;
    setAgentTranscript((current) => appendSmartTranscript(current, interim));
    agentTranscriptRef.current = appendSmartTranscript(agentTranscriptRef.current, interim);
    setInterimTranscript("");
    interimTranscriptRef.current = "";
  }

  function resetLiveGeminiTranscript() {
    if (liveTranscriptRestartTimerRef.current) window.clearTimeout(liveTranscriptRestartTimerRef.current);
    liveTranscriptRestartTimerRef.current = null;
    liveTranscriptInFlightRef.current = false;
    liveTranscriptQueueRef.current = [];
    setLiveTranscriptPending(0);
    setLiveTranscriptError("");
  }

  function stopLiveGeminiRecorder() {
    if (liveTranscriptRestartTimerRef.current) window.clearTimeout(liveTranscriptRestartTimerRef.current);
    liveTranscriptRestartTimerRef.current = null;
    const recorder = liveTranscriptRecorderRef.current;
    liveTranscriptRecorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function startLiveGeminiRecorder(stream: MediaStream, mimeType: string) {
    stopLiveGeminiRecorder();
    resetLiveGeminiTranscript();

    const startCycle = () => {
      if (!agentRecordingRef.current) return;
      const tracks = stream.getAudioTracks().filter((track) => track.readyState === "live");
      if (!tracks.length) return;

      const recorder = new MediaRecorder(new MediaStream(tracks), getRecorderOptions(mimeType, 256000));
      const chunks: Blob[] = [];
      const liveMimeType = recorder.mimeType || mimeType || "audio/webm";
      liveTranscriptRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (chunks.length) {
          const blob = new Blob(chunks, { type: liveMimeType });
          enqueueLiveGeminiBlob(blob, liveMimeType);
        }
        if (agentRecordingRef.current) {
          liveTranscriptRestartTimerRef.current = window.setTimeout(startCycle, 100);
        }
      };

      recorder.start();
      liveTranscriptRestartTimerRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 12000);
    };

    startCycle();
  }

  function enqueueLiveGeminiBlob(blob: Blob, mimeType: string) {
    if (!blob.size || blob.size < 1200) return;
    liveTranscriptQueueRef.current.push({ blob, mimeType });
    setLiveTranscriptPending(liveTranscriptQueueRef.current.length);
    void processLiveGeminiQueue();
  }

  async function processLiveGeminiQueue() {
    if (liveTranscriptInFlightRef.current) return;
    const next = liveTranscriptQueueRef.current.shift();
    if (!next) return;
    setLiveTranscriptPending(liveTranscriptQueueRef.current.length);

    liveTranscriptInFlightRef.current = true;
    setListeningStatus("processing");
    try {
      await sendLiveGeminiBlob(next.blob, next.mimeType);
    } finally {
      liveTranscriptInFlightRef.current = false;
      setLiveTranscriptPending(liveTranscriptQueueRef.current.length);
      if (liveTranscriptQueueRef.current.length) {
        void processLiveGeminiQueue();
      }
    }
  }

  async function sendLiveGeminiBlob(blob: Blob, mimeType: string) {
    try {
      const formData = new FormData();
      formData.append("audio", blob, mimeType.includes("mp4") ? "live-chunk.m4a" : "live-chunk.webm");
      formData.append("speakers", JSON.stringify(getParticipantNames()));
      const response = await fetch("/api/live-transcript", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Live transcript failed");
      const transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
      setLiveTranscriptError("");
      if (transcript) {
        setAgentTranscript((current) => {
          const next = appendSmartTranscript(current, transcript);
          agentTranscriptRef.current = next;
          return next;
        });
        setListeningStatus("saved_line");
      }
    } catch (error) {
      setLiveTranscriptError(error instanceof Error ? error.message : "Gemini live transcript failed.");
      setListeningStatus("speech_retry");
    }
  }

  function stopMixedRecordingAudio() {
    mixedAudioStreamRef.current?.getTracks().forEach((track) => track.stop());
    mixedAudioStreamRef.current = null;
    recordingDestinationRef.current = null;
    recordingSourceNodesRef.current = [];
    recordingTrackIdsRef.current.clear();
    void recordingAudioContextRef.current?.close();
    recordingAudioContextRef.current = null;
  }

  function collectNamedCallAudioTracks() {
    const tracks = new Map<string, { track: MediaStreamTrack; speakerName: string }>();
    localStreamRef.current
      ?.getAudioTracks()
      .filter((track) => track.readyState === "live")
      .forEach((track) => tracks.set(track.id, { track, speakerName: displayName || "Local User" }));
    participants.forEach((participant) => {
      participant.stream
        ?.getAudioTracks()
        .filter((track) => track.readyState === "live")
        .forEach((track) => tracks.set(track.id, { track, speakerName: participant.name || "Speaker" }));
    });
    return [...tracks.values()];
  }

  function collectCallAudioTracks() {
    return collectNamedCallAudioTracks().map((item) => item.track);
  }

  function getBestLiveTranscriptStream(mixedStream: MediaStream) {
    const liveTracks = collectCallAudioTracks().filter((track) => track.readyState === "live");
    if (liveTracks.length === 1) {
      return new MediaStream([liveTracks[0]]);
    }
    return mixedStream;
  }

  function startSpeakerRecorderForTrack(track: MediaStreamTrack, speakerName: string) {
    if (!("MediaRecorder" in window) || track.kind !== "audio" || track.readyState !== "live") return;
    if (speakerRecordersRef.current.has(track.id)) return;

    const mimeType = getRecorderMimeType();
    const recorder = new MediaRecorder(new MediaStream([track]), getRecorderOptions(mimeType, 160000));
    const state: SpeakerRecorderState = {
      speakerName: speakerName || "Speaker",
      recorder,
      chunks: [],
      mimeType: recorder.mimeType || mimeType || "audio/webm"
    };
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) state.chunks.push(event.data);
    };
    recorder.start(1000);
    speakerRecordersRef.current.set(track.id, state);
  }

  function startSpeakerRecordersForCurrentTracks() {
    collectNamedCallAudioTracks().forEach(({ track, speakerName }) => startSpeakerRecorderForTrack(track, speakerName));
  }

  function stopSpeakerRecorders() {
    const states = [...speakerRecordersRef.current.values()];
    if (!states.length) return Promise.resolve([] as SpeakerRecording[]);

    return Promise.all(
      states.map(
        (state) =>
          new Promise<SpeakerRecording>((resolve) => {
            const finish = () => {
              resolve({
                speakerName: state.speakerName,
                blob: new Blob(state.chunks, { type: state.mimeType }),
                mimeType: state.mimeType
              });
            };

            if (state.recorder.state === "inactive") {
              finish();
              return;
            }

            state.recorder.onstop = finish;
            state.recorder.stop();
          })
      )
    ).then((recordings) => {
      speakerRecordersRef.current.clear();
      return recordings.filter((recording) => recording.blob.size > 0);
    });
  }

  async function getCallAudioStream() {
    stopMixedRecordingAudio();
    const tracks = collectCallAudioTracks();
    if (!tracks.length) return new MediaStream();

    const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return new MediaStream(tracks);

    const context = new AudioContextConstructor({ sampleRate: 48000 });
    await context.resume();
    const destination = context.createMediaStreamDestination();

    recordingAudioContextRef.current = context;
    recordingDestinationRef.current = destination;
    mixedAudioStreamRef.current = destination.stream;
    tracks.forEach((track) => addTrackToMixedRecording(track));
    return destination.stream;
  }

  function addTrackToMixedRecording(track: MediaStreamTrack) {
    const context = recordingAudioContextRef.current;
    const destination = recordingDestinationRef.current;
    if (!context || !destination || track.kind !== "audio" || track.readyState !== "live" || recordingTrackIdsRef.current.has(track.id)) return;

    const source = context.createMediaStreamSource(new MediaStream([track]));
    const gain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -32;
    compressor.knee.value = 24;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    gain.gain.value = track.enabled ? 1.7 : 0;
    source.connect(compressor).connect(gain).connect(destination);
    recordingSourceNodesRef.current.push(source);
    recordingTrackIdsRef.current.add(track.id);
  }

  function clearSpeechTimers() {
    if (speechRestartTimerRef.current) window.clearTimeout(speechRestartTimerRef.current);
    if (speechWatchdogTimerRef.current) window.clearTimeout(speechWatchdogTimerRef.current);
    speechRestartTimerRef.current = null;
    speechWatchdogTimerRef.current = null;
  }

  function restartSpeechRecognition(delay = 450) {
    if (!shouldRestartSpeechRef.current) return;
    commitInterimTranscript();
    if (speechRestartTimerRef.current) window.clearTimeout(speechRestartTimerRef.current);
    speechRestartTimerRef.current = window.setTimeout(() => {
      if (!shouldRestartSpeechRef.current) return;
      setListeningStatus("restarting");
      try {
        speechRef.current?.stop();
      } catch {
        // The browser may already have stopped the recognizer.
      }
      const nextRecognition = createSpeechRecognition();
      if (!nextRecognition || !shouldRestartSpeechRef.current) return;
      speechRef.current = nextRecognition;
      try {
        nextRecognition.start();
      } catch {
        setListeningStatus("waiting_retry");
      }
    }, delay);
  }

  function armSpeechWatchdog(delay = 3500) {
    if (!shouldRestartSpeechRef.current) return;
    if (speechWatchdogTimerRef.current) window.clearTimeout(speechWatchdogTimerRef.current);
    speechWatchdogTimerRef.current = window.setTimeout(() => {
      if (!shouldRestartSpeechRef.current) return;
      restartSpeechRecognition(0);
    }, delay);
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
    recognition.lang = speechLanguage;
    (recognition as SpeechRecognitionLike & { maxAlternatives?: number }).maxAlternatives = 3;
    recognition.onaudiostart = () => {
      setListeningStatus("listening");
      armSpeechWatchdog();
    };
    recognition.onaudioend = () => {
      setListeningStatus("audio_paused");
      armSpeechWatchdog(1400);
    };
    recognition.onspeechstart = () => setListeningStatus("speech_detected");
    recognition.onspeechend = () => {
      setListeningStatus("processing");
      armSpeechWatchdog(1800);
    };
    recognition.onresult = (event) => {
      armSpeechWatchdog();
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
      if (finalText) {
        const line = speakerLine(displayName, finalText);
        setAgentTranscript((current) => appendSmartTranscript(current, line));
        agentTranscriptRef.current = appendSmartTranscript(agentTranscriptRef.current, line);
      }
      const nextInterim = interimText ? speakerLine(displayName, interimText) : "";
      setInterimTranscript(nextInterim);
      interimTranscriptRef.current = nextInterim;
      setListeningStatus(finalText ? "saved_line" : "listening");
    };
    recognition.onerror = (event) => {
      void event;
      commitInterimTranscript();
      setListeningStatus("speech_retry");
      setAgentNotice("Speech-to-text មិនដំណើរការល្អនៅ browser នេះទេ។ Agent នឹងរក្សា audio ហើយអ្នកអាចកែ transcript បន្ថែមបាន។");
      restartSpeechRecognition(800);
    };
    recognition.onend = () => {
      commitInterimTranscript();
      if (!shouldRestartSpeechRef.current) {
        setListeningStatus("stopped");
        return;
      }
      setListeningStatus("restarting");
      setSpeechRestartCount((count) => count + 1);
      restartSpeechRecognition(450);
    };
    return recognition;
  }

  async function startAgentRecording() {
    setError("");
    setAgentNotice("");
    setSavedMeetingId("");
    transcriptSnapshotRef.current = "";
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
    agentRecordingRef.current = true;
    void resumeMicAudioContext();
    const audioStream = await getCallAudioStream();
    const liveAudioStream = getBestLiveTranscriptStream(audioStream);
    if (!audioStream.getAudioTracks().length) {
      agentRecordingRef.current = false;
      setError("មិនមាន audio track សម្រាប់ថតទេ។");
      return;
    }
    const mimeType = getRecorderMimeType();
    const recorder = new MediaRecorder(audioStream, getRecorderOptions(mimeType, 256000));
    callChunksRef.current = [];
    resetLiveGeminiTranscript();
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        callChunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      if (mixedAudioStreamRef.current === audioStream) stopMixedRecordingAudio();
      void saveAgentRecording(recorder.mimeType || "audio/webm");
    };
    callRecorderRef.current = recorder;
    callRecordStartedAtRef.current = Date.now();
    recorder.start(1000);
    startLiveGeminiRecorder(liveAudioStream, mimeType);
    speakerRecordingsReadyRef.current = null;
    startSpeakerRecordersForCurrentTracks();

    shouldRestartSpeechRef.current = true;
    setListeningStatus("starting");
    setSpeechConfidence(null);
    setSpeechRestartCount(0);
    setLiveTranscriptPending(0);
    setLiveTranscriptError("");
    const recognition = createSpeechRecognition();
    if (recognition) {
      speechRef.current = recognition;
      try {
        recognition.start();
        armSpeechWatchdog();
        setAgentNotice("Agent កំពុងថតសំឡេងប្រជុំជាឯកសារតែមួយ និងសរសេរ transcript ស្វ័យប្រវត្តិ។ សូមនិយាយជិត microphone ហើយកុំបិទ tab ពេលកំពុងថត។");
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
    transcriptSnapshotRef.current = getCurrentAgentTranscript();
    speakerRecordingsReadyRef.current = stopSpeakerRecorders();
    agentRecordingRef.current = false;
    stopLiveGeminiRecorder();
    shouldRestartSpeechRef.current = false;
    clearSpeechTimers();
    speechRef.current?.stop();
    speechRef.current = null;
    setInterimTranscript("");
    setListeningStatus("stopped");
    setAgentRecording(false);
    if (callRecorderRef.current && callRecorderRef.current.state !== "inactive") {
      callRecorderRef.current.stop();
    }
  }

  async function saveAgentRecording(mimeType: string) {
    setAgentSaving(true);
    setAgentNotice("Agent កំពុង upload audio និងរក្សា meeting record...");
    try {
      const blob = new Blob(callChunksRef.current, { type: mimeType });
      const speakerRecordings = speakerRecordingsReadyRef.current ? await speakerRecordingsReadyRef.current : await stopSpeakerRecorders();
      speakerRecordingsReadyRef.current = null;
      const uploadData = new FormData();
      uploadData.append("audio", blob, mimeType.includes("mp4") ? "call.m4a" : "call.webm");
      uploadData.append(
        "speakers",
        JSON.stringify([...new Set([displayName, ...participants.map((participant) => participant.name)].filter(Boolean))])
      );
      uploadData.append("speakerAudioNames", JSON.stringify(speakerRecordings.map((recording) => recording.speakerName)));
      speakerRecordings.forEach((recording, index) => {
        uploadData.append(
          "speakerAudio",
          recording.blob,
          `speaker-${index + 1}.${recording.mimeType.includes("mp4") ? "m4a" : "webm"}`
        );
      });
      const uploadResponse = await fetch("/api/uploads", { method: "POST", body: uploadData });
      const uploadJson = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadJson.error ?? "Upload failed");

      const liveTranscript = transcriptSnapshotRef.current || getCurrentAgentTranscript();
      const serverTranscript = typeof uploadJson.transcript === "string" ? uploadJson.transcript.trim() : "";
      const transcript = serverTranscript || liveTranscript;
      if (serverTranscript) setAgentTranscript(serverTranscript);
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
      if (!saveResponse.ok) {
        throw new Error(saveJson.error ?? saveJson.hint ?? "Save failed");
      }
      setSavedMeetingId(saveJson.meetingId);
      transcriptSnapshotRef.current = "";
      setAgentNotice(
        serverTranscript
          ? saveJson.aiError
            ? "Agent បានរក្សា audio និង transcript រួច។ AI summary/tasks មានបញ្ហា ប៉ុន្តែទិន្នន័យប្រជុំបានទៅ History និង Transcript ហើយ។"
            : "Agent បានថត audio ហើយបម្លែងជាអក្សរដោយ AI រួច។ Summary និង tasks ត្រូវបានបង្កើត។"
          : "Agent បានរក្សា audio រួច។ Browser មិនបានផ្តល់ transcript ទេ សូមបញ្ចូល transcript ដោយដៃ ឬពិនិត្យ GEMINI_API_KEY។"
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? `Agent មិនអាចរក្សា meeting បានទេ។ ${error.message}`
          : "Agent មិនអាចរក្សា meeting បានទេ។ សូមសាកល្បងម្តងទៀត។"
      );
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
              <button className={cn("kh-button-secondary", speakerUnlocked && "border-leaf/30 bg-leaf/10 text-leaf")} type="button" onClick={() => void unlockRemotePlayback()}>
                <Volume2 className="h-4 w-4" />
                Enable speaker
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
        MVP WebRTC នេះសាកល្បងល្អបំផុតប្រហែល 2-5 នាក់។ សម្រាប់អ្នកចូលរួមច្រើនជាងនេះ និង network ខុសគ្នា សូមដាក់ TURN server ឲ្យរឹងមាំ ឬប្រើ media server/SFU ផ្សេងនៅពេល production។ បើមិនលឺសំឡេង សូមចុច Enable speaker ហើយឲ្យអ្នកម្ខាងទៀត Unmute microphone។
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
          <p className="mt-1 text-xs text-slate-500">
            {displayLanguage === "en"
              ? "Final AI transcription supports Khmer and English. Browser live transcript is only a quick preview and may vary by device."
              : "Transcript ចុងក្រោយដោយ AI អាចចាប់បានទាំងខ្មែរ និងអង់គ្លេស។ Live transcript ក្នុង browser គ្រាន់តែជា preview ហើយអាចខុសគ្នាតាម device។"}
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-600">Live transcript</span>
              <select
                className="kh-input h-9 w-auto min-w-36 py-1 text-xs"
                value={speechLanguage}
                onChange={(event) => setSpeechLanguage(event.target.value as "km-KH" | "en-US")}
                disabled={agentRecording}
                title={
                  displayLanguage === "en"
                    ? "Browser live preview language. Final AI transcript still supports Khmer and English."
                    : "ភាសាសម្រាប់ live preview ក្នុង browser។ Transcript ចុងក្រោយដោយ AI នៅតែគាំទ្រ Khmer និង English។"
                }
              >
                <option value="km-KH">{displayLanguage === "en" ? "Live: Khmer" : "Live: ខ្មែរ"}</option>
                <option value="en-US">{displayLanguage === "en" ? "Live: English" : "Live: English"}</option>
              </select>
            </div>
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
              {agentRecording ? (
                <span className="rounded-full bg-sky/15 px-2.5 py-1 text-sky">
                  Gemini {liveTranscriptPending ? `queue ${liveTranscriptPending}` : liveTranscriptInFlightRef.current ? "processing" : "ready"}
                </span>
              ) : null}
            </div>
          </div>
          {liveTranscriptError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              Gemini live transcript error: {liveTranscriptError}
            </div>
          ) : null}
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
        {joined ? (
          <div className="kh-card col-span-full flex flex-col gap-2 p-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {participants.length}/{targetTeamSize} participants
            </span>
            <span>
              {participants.length > 4
                ? "Team mode កំពុងប្រើ video quality ទាប ដើម្បីឲ្យ 5-10 នាក់រត់ស្ថិរជាងមុន។"
                : "Invite អ្នកចូលរួមបានរហូតដល់ 10 នាក់សម្រាប់ test MVP។"}
            </span>
          </div>
        ) : null}
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
