"use client";

import { Bot, Copy, FileText, LogOut, Mic, MicOff, Phone, RefreshCcw, Save, Square, Video, VideoOff, Volume2 } from "lucide-react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type TrackPublication
} from "livekit-client";
import { useEffect, useMemo, useRef, useState } from "react";

type MediaTrack = {
  sid?: string;
  mediaStreamTrack: MediaStreamTrack;
  attach: (element: HTMLMediaElement) => HTMLMediaElement;
  detach: (element: HTMLMediaElement) => HTMLMediaElement[];
};

type Tile = {
  id: string;
  name: string;
  kind: Track.Kind;
  track: MediaTrack;
  isLocal: boolean;
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

type SpeechRecognitionEventResult = {
  transcript: string;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: SpeechRecognitionEventResult;
  }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function TrackTile({ tile }: { tile: Tile }) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);

  useEffect(() => {
    const element = mediaRef.current;
    if (!element) return;
    tile.track.attach(element);
    void element.play().catch(() => undefined);
    return () => {
      tile.track.detach(element);
    };
  }, [tile.track]);

  if (tile.kind === Track.Kind.Audio) {
    return <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} autoPlay playsInline />;
  }

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-950">
      <video
        ref={mediaRef as React.RefObject<HTMLVideoElement>}
        autoPlay
        playsInline
        muted={tile.isLocal}
        className="h-full w-full bg-slate-950 object-contain"
      />
      <div className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white">
        {tile.name}
      </div>
    </div>
  );
}

export function LiveKitCallRoom() {
  const [roomName, setRoomName] = useState(() => createRoomId());
  const [displayName, setDisplayName] = useState("Local User");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [agentRecording, setAgentRecording] = useState(false);
  const [agentSaving, setAgentSaving] = useState(false);
  const [savedMeetingId, setSavedMeetingId] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [liveTranscriptLanguage, setLiveTranscriptLanguage] = useState<"km-KH" | "en-US">("km-KH");
  const [liveTranscriptSupported, setLiveTranscriptSupported] = useState(true);
  const agentRecordingRef = useRef(false);
  const liveTranscriptRef = useRef("");
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callRecorderRef = useRef<MediaRecorder | null>(null);
  const callChunksRef = useRef<Blob[]>([]);
  const callRecordStartedAtRef = useRef(0);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordingSourceNodesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const recordingTrackIdsRef = useRef<Set<string>>(new Set());
  const speakerRecordersRef = useRef<Map<string, SpeakerRecorderState>>(new Map());
  const speakerRecordingsReadyRef = useRef<Promise<SpeakerRecording[]> | null>(null);
  const room = useMemo(
    () =>
      new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: {
          simulcast: true,
          videoEncoding: { maxBitrate: 600_000, maxFramerate: 20 }
        }
      }),
    []
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room") || roomName;
    setRoomName(roomParam);
    if (!params.get("room")) window.history.replaceState(null, "", `/meetings/call?room=${roomParam}`);

    const syncTiles = () => setTiles([...collectTiles(room)]);
    const handleTrackSubscribed = () => {
      syncTiles();
      if (agentRecordingRef.current) startRecordingCurrentAudioTracks();
    };
    const handleTrackUnsubscribed = () => syncTiles();
    const handleParticipantChange = () => syncTiles();
    const handleDataReceived = (payload: Uint8Array, participant?: { name?: string; identity?: string }, _kind?: unknown, topic?: string) => {
      if (topic !== "khmermeet-transcript") return;
      try {
        const data = JSON.parse(new TextDecoder().decode(payload)) as { speaker?: string; text?: string };
        if (data.text) appendLiveTranscriptLine(data.speaker || participant?.name || participant?.identity || "Speaker", data.text, false);
      } catch {
        // Ignore non-transcript room data.
      }
    };
    const handleStateChanged = (state: ConnectionState) => {
      setConnectionState(state);
      setConnected(state === ConnectionState.Connected);
      if (state === ConnectionState.Disconnected) setTiles([]);
    };

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.LocalTrackPublished, handleTrackSubscribed);
    room.on(RoomEvent.LocalTrackUnpublished, handleTrackUnsubscribed);
    room.on(RoomEvent.ParticipantConnected, handleParticipantChange);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantChange);
    room.on(RoomEvent.DataReceived, handleDataReceived);
    room.on(RoomEvent.ConnectionStateChanged, handleStateChanged);
    room.on(RoomEvent.MediaDevicesError, () => {
      setNotice("Audio-only mode: camera or microphone permission/device is missing. You can still join by voice if the microphone is available.");
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, (playing: boolean) => {
      if (!playing) setNotice("Browser បាន block speaker។ សូមចុច Enable speaker ដើម្បីឲ្យលឺសំឡេងអ្នកផ្សេង។");
    });

    return () => {
      stopLiveTranscript();
      stopMixedRecordingAudio();
      room.disconnect();
      room.removeAllListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  async function joinRoom() {
    setError("");
    setNotice("");
    setConnecting(true);
    try {
      const response = await fetch("/api/livekit-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName, displayName })
      });
      const data = (await response.json()) as { token?: string; url?: string; error?: string; hint?: string };
      if (!response.ok || !data.token || !data.url) throw new Error(data.error ?? data.hint ?? "Could not join LiveKit room.");

      if (room.state !== ConnectionState.Disconnected) await room.disconnect();
      await room.connect(data.url, data.token, { autoSubscribe: true });
      setConnected(true);
      setConnectionState(ConnectionState.Connected);

      const microphoneEnabled = await room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }).then(
        () => true,
        () => false
      );
      const cameraEnabled = await room.localParticipant.setCameraEnabled(true, {
        resolution: { width: 960, height: 540 },
        facingMode: "user",
        frameRate: 20
      }).then(
        () => true,
        () => false
      );
      await room.startAudio().catch(() => undefined);
      setAudioEnabled(microphoneEnabled);
      setVideoEnabled(cameraEnabled);
      setTiles([...collectTiles(room)]);
      setNotice("LiveKit call បានភ្ជាប់រួច។ អ្នកចូលរួមអាចមើលមុខគ្នា និងនិយាយគ្នាបានច្បាស់ជាង WebRTC MVP។");
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join video meeting.");
    } finally {
      setConnecting(false);
    }
  }

  async function leaveRoom() {
    if (agentRecordingRef.current) stopAgentRecording();
    await room.disconnect();
    setConnected(false);
    setTiles([]);
  }

  async function toggleAudio() {
    const next = !audioEnabled;
    const ok = await room.localParticipant.setMicrophoneEnabled(next, {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }).then(
      () => true,
      () => false
    );
    setAudioEnabled(ok ? next : false);
    if (!ok) setError("Microphone is not available. Please allow microphone permission or connect a microphone.");
  }

  async function toggleVideo() {
    const next = !videoEnabled;
    const ok = await room.localParticipant.setCameraEnabled(next, {
      resolution: { width: 960, height: 540 },
      facingMode: "user",
      frameRate: 20
    }).then(
      () => true,
      () => false
    );
    setVideoEnabled(ok ? next : false);
    if (!ok) setNotice("No camera found. You are still connected in audio-only mode.");
    setTiles([...collectTiles(room)]);
  }

  async function unlockSpeaker() {
    await room.startAudio().catch(() => undefined);
    document.querySelectorAll("audio,video").forEach((element) => {
      void (element as HTMLMediaElement).play().catch(() => undefined);
    });
    setNotice("Speaker បានបើកហើយ។ បើនៅមិនលឺ សូមពិនិត្យ volume និងឲ្យអ្នកម្ខាងទៀត Unmute។");
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(`${window.location.origin}/meetings/call?room=${roomName}`);
  }

  function appendLiveTranscriptLine(speakerName: string, text: string, publish = true) {
    const cleanText = text.trim();
    if (!cleanText) return;
    const cleanSpeaker = speakerName.trim() || "Speaker";
    const line = `${cleanSpeaker}: ${cleanText}`;
    liveTranscriptRef.current = [liveTranscriptRef.current, line].filter(Boolean).join("\n");
    setLiveTranscript(liveTranscriptRef.current);
    if (publish && room.state === ConnectionState.Connected) {
      const payload = new TextEncoder().encode(JSON.stringify({ speaker: cleanSpeaker, text: cleanText }));
      void room.localParticipant.publishData(payload, { reliable: true, topic: "khmermeet-transcript" }).catch(() => undefined);
    }
  }

  function stopLiveTranscript() {
    if (speechRestartTimerRef.current) clearTimeout(speechRestartTimerRef.current);
    speechRestartTimerRef.current = null;
    const recognition = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.stop();
      } catch {
        // Some browsers throw if recognition is already stopped.
      }
    }
  }

  function startLiveTranscript() {
    const SpeechRecognitionConstructor =
      (window as SpeechRecognitionWindow).SpeechRecognition || (window as SpeechRecognitionWindow).webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      setLiveTranscriptSupported(false);
      setNotice("Browser នេះមិនគាំទ្រ live transcript preview ទេ។ Agent នឹងបម្លែងពី audio ពេល Stop & Save។");
      return;
    }

    stopLiveTranscript();
    setLiveTranscriptSupported(true);
    const recognition = new SpeechRecognitionConstructor();
    speechRecognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = liveTranscriptLanguage;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) appendLiveTranscriptLine(displayName || "You", text);
      }
    };
    recognition.onerror = () => {
      if (!agentRecordingRef.current) return;
      speechRestartTimerRef.current = setTimeout(startLiveTranscript, 1200);
    };
    recognition.onend = () => {
      if (!agentRecordingRef.current) return;
      speechRestartTimerRef.current = setTimeout(startLiveTranscript, 700);
    };
    try {
      recognition.start();
    } catch {
      speechRestartTimerRef.current = setTimeout(startLiveTranscript, 1000);
    }
  }

  function getRecorderMimeType() {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  function getRecorderOptions(mimeType: string, audioBitsPerSecond = 128000) {
    return mimeType ? { mimeType, audioBitsPerSecond } : { audioBitsPerSecond };
  }

  function collectNamedAudioTracks() {
    const tracks = new Map<string, { track: MediaStreamTrack; speakerName: string }>();
    room.localParticipant.trackPublications.forEach((publication) => {
      const track = publication.track as MediaTrack | undefined;
      if (publication.kind === Track.Kind.Audio && track?.mediaStreamTrack.readyState === "live") {
        tracks.set(track.mediaStreamTrack.id, { track: track.mediaStreamTrack, speakerName: displayName || "You" });
      }
    });
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((publication) => {
        const track = publication.track as MediaTrack | undefined;
        if (publication.kind === Track.Kind.Audio && track?.mediaStreamTrack.readyState === "live") {
          tracks.set(track.mediaStreamTrack.id, { track: track.mediaStreamTrack, speakerName: participant.name || participant.identity });
        }
      });
    });
    return [...tracks.values()];
  }

  function stopMixedRecordingAudio() {
    recordingDestinationRef.current = null;
    recordingSourceNodesRef.current = [];
    recordingTrackIdsRef.current.clear();
    void recordingAudioContextRef.current?.close();
    recordingAudioContextRef.current = null;
  }

  function addTrackToMixedRecording(track: MediaStreamTrack) {
    const context = recordingAudioContextRef.current;
    const destination = recordingDestinationRef.current;
    if (!context || !destination || track.kind !== "audio" || track.readyState !== "live" || recordingTrackIdsRef.current.has(track.id)) return;

    const source = context.createMediaStreamSource(new MediaStream([track]));
    const gain = context.createGain();
    gain.gain.value = track.enabled ? 1 : 0;
    source.connect(gain).connect(destination);
    recordingSourceNodesRef.current.push(source);
    recordingTrackIdsRef.current.add(track.id);
  }

  function startSpeakerRecorderForTrack(track: MediaStreamTrack, speakerName: string) {
    if (!("MediaRecorder" in window) || track.kind !== "audio" || track.readyState !== "live") return;
    if (speakerRecordersRef.current.has(track.id)) return;

    const mimeType = getRecorderMimeType();
    const recorder = new MediaRecorder(new MediaStream([track]), getRecorderOptions(mimeType, 96000));
    const state: SpeakerRecorderState = { speakerName, recorder, chunks: [], mimeType: recorder.mimeType || mimeType || "audio/webm" };
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) state.chunks.push(event.data);
    };
    recorder.start(1000);
    speakerRecordersRef.current.set(track.id, state);
  }

  function startRecordingCurrentAudioTracks() {
    collectNamedAudioTracks().forEach(({ track, speakerName }) => {
      addTrackToMixedRecording(track);
      startSpeakerRecorderForTrack(track, speakerName);
    });
  }

  function stopSpeakerRecorders() {
    const states = [...speakerRecordersRef.current.values()];
    if (!states.length) return Promise.resolve([] as SpeakerRecording[]);
    return Promise.all(
      states.map(
        (state) =>
          new Promise<SpeakerRecording>((resolve) => {
            const finish = () => resolve({ speakerName: state.speakerName, blob: new Blob(state.chunks, { type: state.mimeType }), mimeType: state.mimeType });
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

  async function startAgentRecording() {
    setError("");
    setNotice("");
    setSavedMeetingId("");
    setLiveTranscript("");
    liveTranscriptRef.current = "";
    if (!connected) {
      setError("សូមចូល HD Video Call មុនពេលចាប់ផ្តើម Agent។");
      return;
    }
    if (!("MediaRecorder" in window)) {
      setError("Browser នេះមិនគាំទ្រ audio recording ទេ។");
      return;
    }

    const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      setError("Browser នេះមិនគាំទ្រ audio mixer ទេ។");
      return;
    }

    const context = new AudioContextConstructor({ sampleRate: 48000 });
    await context.resume();
    const destination = context.createMediaStreamDestination();
    recordingAudioContextRef.current = context;
    recordingDestinationRef.current = destination;
    agentRecordingRef.current = true;
    speakerRecordingsReadyRef.current = null;
    startRecordingCurrentAudioTracks();

    if (!destination.stream.getAudioTracks().length) {
      agentRecordingRef.current = false;
      stopMixedRecordingAudio();
      setError("មិនទាន់មាន audio track សម្រាប់ថតទេ។ សូមពិនិត្យ microphone និងអ្នកចូលរួម។");
      return;
    }

    const mimeType = getRecorderMimeType();
    const recorder = new MediaRecorder(destination.stream, getRecorderOptions(mimeType));
    callChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) callChunksRef.current.push(event.data);
    };
    recorder.onstop = () => void saveAgentRecording(recorder.mimeType || "audio/webm");
    callRecorderRef.current = recorder;
    callRecordStartedAtRef.current = Date.now();
    recorder.start(1000);
    startLiveTranscript();
    setAgentRecording(true);
    setNotice("Meeting Agent កំពុងថតសំឡេងពីអ្នកចូលរួមទាំងអស់ក្នុង HD call។ ចុច Stop & Save ពេលប្រជុំចប់។");
  }

  function stopAgentRecording() {
    agentRecordingRef.current = false;
    stopLiveTranscript();
    speakerRecordingsReadyRef.current = stopSpeakerRecorders();
    setAgentRecording(false);
    if (callRecorderRef.current && callRecorderRef.current.state !== "inactive") callRecorderRef.current.stop();
  }

  async function saveAgentRecording(mimeType: string) {
    setAgentSaving(true);
    setNotice("Agent កំពុង upload audio និងរក្សា meeting record...");
    try {
      const speakerRecordings = speakerRecordingsReadyRef.current ? await speakerRecordingsReadyRef.current : await stopSpeakerRecorders();
      speakerRecordingsReadyRef.current = null;
      const blob = new Blob(callChunksRef.current, { type: mimeType });
      const uploadData = new FormData();
      uploadData.append("audio", blob, mimeType.includes("mp4") ? "livekit-call.m4a" : "livekit-call.webm");
      uploadData.append("speakers", JSON.stringify([...new Set(collectNamedAudioTracks().map((track) => track.speakerName))]));
      uploadData.append("speakerAudioNames", JSON.stringify(speakerRecordings.map((recording) => recording.speakerName)));
      speakerRecordings.forEach((recording, index) => {
        uploadData.append("speakerAudio", recording.blob, `speaker-${index + 1}.${recording.mimeType.includes("mp4") ? "m4a" : "webm"}`);
      });
      const uploadResponse = await fetch("/api/uploads", { method: "POST", body: uploadData });
      const uploadJson = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadJson.error ?? "Upload failed");

      const uploadTranscript = typeof uploadJson.transcript === "string" ? uploadJson.transcript.trim() : "";
      const transcript = uploadTranscript || liveTranscriptRef.current.trim();
      const duration = Math.max(1, Math.round((Date.now() - callRecordStartedAtRef.current) / 1000));
      const saveResponse = await fetch("/api/call-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `HD video call ${roomName}`,
          audioUrl: uploadJson.audioUrl,
          transcript,
          duration
        })
      });
      const saveJson = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saveJson.error ?? saveJson.hint ?? "Save failed");
      setSavedMeetingId(saveJson.meetingId);
      setNotice(transcript ? "Agent បានរក្សា audio/transcript ហើយ។ Summary, tasks, history នឹងទាញទិន្នន័យនេះ។" : "Agent បានរក្សា audio រួច។ បើ transcript ទទេ សូមពិនិត្យ OPENAI_API_KEY។");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save meeting recording.");
    } finally {
      stopMixedRecordingAudio();
      setAgentSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="kh-card grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-semibold text-slate-600">ឈ្មោះអ្នកចូលរួម</span>
            <input className="kh-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={connected} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-slate-600">Room code</span>
            <div className="flex gap-2">
              <input className="kh-input uppercase" value={roomName} onChange={(event) => setRoomName(event.target.value.toUpperCase())} disabled={connected} />
              <button className="kh-button-secondary px-3" type="button" onClick={copyInvite} title="Copy invite">
                <Copy className="h-4 w-4" />
              </button>
              {!connected ? (
                <button className="kh-button-secondary px-3" type="button" onClick={() => setRoomName(createRoomId())} title="New room">
                  <RefreshCcw className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <button className="kh-button-primary" type="button" onClick={() => void joinRoom()} disabled={connecting}>
              <Phone className="h-4 w-4" />
              {connecting ? "Connecting..." : "Join HD Video Call"}
            </button>
          ) : (
            <>
              <button className="kh-button-secondary" type="button" onClick={() => void unlockSpeaker()}>
                <Volume2 className="h-4 w-4" />
                Enable speaker
              </button>
              <button className="kh-button-secondary" type="button" onClick={() => void toggleAudio()}>
                {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                {audioEnabled ? "Mute" : "Unmute"}
              </button>
              <button className="kh-button-secondary" type="button" onClick={() => void toggleVideo()}>
                {videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                {videoEnabled ? "Camera off" : "Camera on"}
              </button>
              <button className="kh-button-secondary text-red-600" type="button" onClick={() => void leaveRoom()}>
                <LogOut className="h-4 w-4" />
                ចាកចេញ
              </button>
            </>
          )}
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-leaf/20 bg-leaf/10 p-4 text-sm text-leaf">{notice}</div> : null}

      <div className="rounded-lg border border-sky/20 bg-sky/10 p-4 text-sm text-ink">
        HD mode ប្រើ LiveKit SFU សម្រាប់ video/audio ច្បាស់ និងអ្នកចូលរួម 10-20 នាក់។ Status: {connectionState}
      </div>

      <section className="kh-card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-leaf">
              <Bot className="h-4 w-4" />
              Meeting Agent
            </p>
            <h2 className="mt-1 text-xl font-bold text-ink">ថតសំឡេង និងបញ្ជូនទៅប្រព័ន្ធទាំងអស់</h2>
            <p className="mt-2 text-sm text-slate-500">
              Agent ថតសំឡេងពីអ្នកចូលរួមទាំងអស់ក្នុង HD call រួចបង្កើត transcript, summary, tasks និង history។
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!agentRecording ? (
              <button className="kh-button-primary" type="button" onClick={() => void startAgentRecording()} disabled={!connected || agentSaving}>
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
        {agentSaving ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Save className="h-4 w-4" />
            កំពុងរក្សាទុក...
          </p>
        ) : null}
        <div className="mt-5 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Live transcript</p>
              <p className="text-xs text-slate-500">Preview បង្ហាញពេល Agent កំពុងថត។ ពេល Stop & Save វានឹងរក្សាទុកជាមួយ meeting record។</p>
            </div>
            <select
              className="kh-input max-w-44"
              value={liveTranscriptLanguage}
              onChange={(event) => setLiveTranscriptLanguage(event.target.value as "km-KH" | "en-US")}
              disabled={agentRecording}
            >
              <option value="km-KH">ខ្មែរ</option>
              <option value="en-US">English</option>
            </select>
          </div>
          {!liveTranscriptSupported ? (
            <p className="rounded-md bg-saffron/10 p-3 text-sm text-ink">
              Browser នេះមិនគាំទ្រ live transcript preview ទេ។ សូមប្រើ Chrome/Edge លើ HTTPS ឬអនុញ្ញាត microphone។
            </p>
          ) : null}
          <textarea
            className="kh-input min-h-36 w-full resize-y"
            value={liveTranscript}
            onChange={(event) => {
              liveTranscriptRef.current = event.target.value;
              setLiveTranscript(event.target.value);
            }}
            placeholder="Live transcript នឹងបង្ហាញនៅទីនេះ ពេលអ្នកចុច Start Agent ហើយនិយាយ..."
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tiles.filter((tile) => tile.kind === Track.Kind.Video).map((tile) => (
          <TrackTile key={tile.id} tile={tile} />
        ))}
        {tiles.filter((tile) => tile.kind === Track.Kind.Audio).map((tile) => (
          <TrackTile key={tile.id} tile={tile} />
        ))}
        {connected && !tiles.some((tile) => tile.kind === Track.Kind.Video) ? (
          <div className="kh-card col-span-full grid min-h-72 place-items-center p-8 text-center">
            <div>
              <Mic className="mx-auto mb-3 h-10 w-10 text-leaf" />
              <p className="text-lg font-bold text-ink">Audio-only meeting</p>
              <p className="mt-2 text-sm text-slate-500">
                No camera is active on this device. You can still talk, listen, and let Agent record/transcribe the meeting.
              </p>
            </div>
          </div>
        ) : null}
        {!connected && !tiles.some((tile) => tile.kind === Track.Kind.Video) ? (
          <div className="kh-card col-span-full grid min-h-72 place-items-center p-8 text-center">
            <div>
              <Video className="mx-auto mb-3 h-10 w-10 text-leaf" />
              <p className="text-lg font-bold text-ink">មិនទាន់ចូល HD Video Call</p>
              <p className="mt-2 text-sm text-slate-500">ចុច Join HD Video Call ហើយ Allow camera និង microphone។</p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function collectTiles(room: Room) {
  const tiles: Tile[] = [];
  room.localParticipant.trackPublications.forEach((publication) => {
    if (publication.track) {
      tiles.push({
        id: `local-${publication.track.sid ?? publication.track.mediaStreamTrack.id}`,
        name: room.localParticipant.name || "You",
        kind: publication.kind,
        track: publication.track as MediaTrack,
        isLocal: true
      });
    }
  });

  room.remoteParticipants.forEach((participant: RemoteParticipant) => {
    participant.trackPublications.forEach((publication: TrackPublication) => {
      if (publication.track) {
        tiles.push({
          id: `${participant.identity}-${publication.trackSid}`,
          name: participant.name || participant.identity,
          kind: publication.kind,
          track: publication.track as MediaTrack,
          isLocal: false
        });
      }
    });
  });

  return tiles;
}
