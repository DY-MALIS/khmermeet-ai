"use client";

import "@livekit/components-styles";
import type { TrackReference } from "@livekit/components-core";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useLocalParticipant,
  useRoomContext,
  useTracks
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import type { RemoteParticipant } from "livekit-client";
import { Bot, Camera, Copy, Download, Loader2, Mic, Phone, Save, Share2, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { uploadRecordingDirect } from "@/lib/client/direct-upload";
import { clampMeetingDurationMs, clampMeetingDurationSeconds, MAX_MEETING_DURATION_MS } from "@/lib/meeting-duration";
import { readJsonResponse } from "@/lib/read-json-response";

type TokenPayload = {
  token: string;
  livekitUrl: string;
  room: string;
  identity: string;
  name: string;
};

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function readMeetingParams() {
  if (typeof window === "undefined") {
    return { hasInviteRoom: false, room: "MEETING", title: "" };
  }

  const params = new URLSearchParams(window.location.search);
  const inviteRoom = params.get("room")?.trim().toUpperCase() ?? "";
  const inviteTitle = params.get("title")?.trim() ?? "";
  return {
    hasInviteRoom: Boolean(inviteRoom),
    room: inviteRoom || createRoomCode(),
    title: inviteTitle
  };
}

function formatTime(seconds: number) {
  const safeSeconds = clampMeetingDurationSeconds(seconds);
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function getRecorderMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function getLongRecordingOptions(mimeType: string) {
  return mimeType ? { mimeType, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 };
}

function extractApiError(value: unknown) {
  if (value && typeof value === "object" && "error" in value && typeof value.error === "string") {
    return value.error;
  }
  return "Request failed.";
}

async function checkMediaDeviceSupport(wantsCamera: boolean, wantsMicrophone: boolean) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support camera/microphone access. Use Chrome, Edge, Firefox, or Safari on HTTPS.");
  }

  if (!navigator.mediaDevices.enumerateDevices) {
    return { hasCamera: wantsCamera, hasMicrophone: wantsMicrophone };
  }

  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const hasMicrophone = devices.some((device) => device.kind === "audioinput");
  const hasCamera = devices.some((device) => device.kind === "videoinput");

  return {
    hasCamera: wantsCamera ? hasCamera || !devices.length : false,
    hasMicrophone: wantsMicrophone ? hasMicrophone || !devices.length : false
  };
}

function getCallGridMetrics(trackCount: number) {
  const count = Math.max(1, trackCount);
  const columns = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : count <= 16 ? 4 : 5;

  return {
    columns,
    rows: Math.ceil(count / columns)
  };
}

export function LiveKitCallRoom() {
  const [room, setRoom] = useState("MEETING");
  const [name, setName] = useState("Local User");
  const [title, setTitle] = useState("");
  const [isInviteGuest, setIsInviteGuest] = useState(false);
  const [paramsReady, setParamsReady] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [callMedia, setCallMedia] = useState({ audio: true, video: true });
  const [tokenPayload, setTokenPayload] = useState<TokenPayload | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const initialMeeting = readMeetingParams();
    setRoom(initialMeeting.room);
    setTitle(initialMeeting.title);
    setIsInviteGuest(initialMeeting.hasInviteRoom);
    setParamsReady(true);
  }, []);

  useEffect(() => {
    if (!paramsReady) return;
    if (!new URLSearchParams(window.location.search).get("room")) {
      window.history.replaceState(null, "", `/meetings/call?room=${room}`);
    }
  }, [paramsReady, room]);

  function meetingTitle() {
    return title.trim() || `Video call ${room}`;
  }

  function inviteLink(nextRoom = room) {
    const url = new URL(`${window.location.origin}/meetings/call`);
    url.searchParams.set("room", nextRoom);
    if (title.trim()) url.searchParams.set("title", title.trim());
    return url.toString();
  }

  async function joinRoom() {
    setJoining(true);
    setError("");
    setNotice("");
    try {
      const media = await checkMediaDeviceSupport(cameraOn, microphoneOn);
      const nextCameraOn = cameraOn && media.hasCamera;
      const nextMicrophoneOn = microphoneOn && media.hasMicrophone;
      const notices: string[] = [];

      if (cameraOn && !media.hasCamera) {
        notices.push("No camera was found. Joining without camera.");
      }
      if (microphoneOn && !media.hasMicrophone) {
        notices.push("No microphone was found. Joining listen-only. Connect/allow a microphone if you want to speak.");
      }

      const response = await fetch("/api/livekit-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, name })
      });
      const data = await readJsonResponse<TokenPayload & { error?: string }>(response);
      if (!response.ok) throw new Error(extractApiError(data));
      setCameraOn(nextCameraOn);
      setMicrophoneOn(nextMicrophoneOn);
      setCallMedia({ audio: nextMicrophoneOn, video: nextCameraOn });
      setTokenPayload(data);
      if (notices.length) setNotice(notices.join(" "));
      window.history.replaceState(null, "", inviteLink(data.room));
    } catch (error) {
      setError(error instanceof Error ? error.message : "មិនអាចចូល HD video call បានទេ។");
    } finally {
      setJoining(false);
    }
  }

  async function copyInvite() {
    const url = inviteLink();
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setNotice("បានចម្លង Invite link ។ អ្នកចូលរួមគ្រាន់តែវាយឈ្មោះ រួចចូលរួមបាន។");
  }

  async function shareInvite() {
    const url = inviteLink();
    if (navigator.share) {
      await navigator.share({
        title: meetingTitle(),
        text: `Join KhmerMeet AI meeting: ${meetingTitle()}`,
        url
      }).catch(() => undefined);
      return;
    }
    await copyInvite();
  }

  if (tokenPayload) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-sky/20 bg-sky/10 p-4 text-sm text-ink">
          HD mode ប្រើ LiveKit SFU ដើម្បីឲ្យអ្នកចូលរួមមើលមុខគ្នា និងនិយាយលឺគ្នាជាច្រើននាក់។ Meeting: <b>{meetingTitle()}</b> · Room: <b>{tokenPayload.room}</b>
        </div>
        {notice ? <div className="rounded-lg bg-leaf/10 p-3 text-sm text-leaf">{notice}</div> : null}
        <div className="kh-card flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-600">អញ្ជើញអ្នកចូលរួម</p>
            <p className="text-sm text-slate-500">
              ចែករំលែក link នេះ ដើម្បីឲ្យអ្នកដទៃចូលរួម <span className="font-semibold text-ink">{meetingTitle()}</span> បាន។ ពួកគេគ្រាន់តែវាយឈ្មោះ។
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="kh-button-secondary" type="button" onClick={copyInvite}>
              <Copy className="h-4 w-4" />
              ចម្លង Link
            </button>
            <button className="kh-button-primary" type="button" onClick={shareInvite}>
              <Share2 className="h-4 w-4" />
              ចែករំលែក Invite
            </button>
          </div>
        </div>
        <LiveKitRoom
          token={tokenPayload.token}
          serverUrl={tokenPayload.livekitUrl}
          connect
          audio={callMedia.audio}
          video={callMedia.video}
          onDisconnected={() => setTokenPayload(null)}
          onError={(error) => {
            const message = error.message || "មិនអាចភ្ជាប់ camera/microphone បានទេ។";
            if (/camera|video|device|permission/i.test(message) && callMedia.video) {
              setCameraOn(false);
              setCallMedia((current) => ({ ...current, video: false }));
              setTokenPayload(null);
              setError(`${message} សូមចូលរួមម្តងទៀតដោយបិទ camera សម្រាប់ audio-only mode។`);
              return;
            }
            if (/microphone|audio|device|permission/i.test(message) && callMedia.audio) {
              setMicrophoneOn(false);
              setCallMedia((current) => ({ ...current, audio: false }));
              setTokenPayload(null);
              setError(`${message} សូមចូលរួមម្តងទៀតដោយបិទ microphone សម្រាប់ listen-only mode ឬអនុញ្ញាត microphone ដើម្បីនិយាយបាន។`);
              return;
            }
            setError(message);
          }}
          className="kh-card overflow-hidden p-0"
          data-lk-theme="default"
        >
          <LiveKitOneScreenConference />
          <LiveKitMeetingAgent meetingTitle={meetingTitle()} />
        </LiveKitRoom>
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="kh-card grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="grid gap-3 md:grid-cols-2">
          {isInviteGuest ? (
            <div className="space-y-2 rounded-xl border border-leaf/20 bg-leaf/5 p-4 md:col-span-2">
              <p className="text-sm font-semibold text-leaf">អ្នកត្រូវបានអញ្ជើញចូលប្រជុំ</p>
              <h2 className="text-xl font-bold text-ink">{meetingTitle()}</h2>
              <p className="text-sm text-slate-500">Room code ត្រូវបានភ្ជាប់ក្នុង invite link រួចហើយ។ សូមវាយតែឈ្មោះរបស់អ្នក បន្ទាប់មកចុច Join HD Video Call។</p>
            </div>
          ) : (
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-semibold text-slate-600">ចំណងជើងប្រជុំ</span>
              <input className="kh-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="ឧ. ប្រជុំផែនការ Q2" />
            </label>
          )}
          <label className="space-y-1">
            <span className="text-sm font-semibold text-slate-600">ឈ្មោះអ្នកចូលរួម</span>
            <input className="kh-input" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          {isInviteGuest ? (
            <div className="space-y-1">
              <span className="text-sm font-semibold text-slate-600">លេខកូដ Room</span>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-600">{room}</div>
            </div>
          ) : (
            <label className="space-y-1">
              <span className="text-sm font-semibold text-slate-600">លេខកូដ Room</span>
              <div className="flex gap-2">
                <input className="kh-input uppercase" value={room} onChange={(event) => setRoom(event.target.value.toUpperCase())} />
                <button className="kh-button-secondary px-3" type="button" onClick={copyInvite} title="ចម្លង Invite">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500">Host បំពេញចំណងជើង និង room code មុន។ Invite link នឹងផ្ញើចំណងជើង/room code ជាស្រេច។</p>
            </label>
          )}
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input checked={cameraOn} onChange={(event) => setCameraOn(event.target.checked)} type="checkbox" />
            <Camera className="h-4 w-4 text-slate-500" />
            បើកកាមេរ៉ាពេលចូល
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input checked={microphoneOn} onChange={(event) => setMicrophoneOn(event.target.checked)} type="checkbox" />
            <Mic className="h-4 w-4 text-slate-500" />
            បើក microphone ពេលចូល
          </label>
        </div>
        <button className="kh-button-primary" type="button" onClick={joinRoom} disabled={joining}>
          {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
          Join HD Video Call
        </button>
      </div>
      <div className="rounded-lg border border-sky/20 bg-sky/10 p-4 text-sm leading-7 text-ink">
        LiveKit mode គាំទ្រ audio/video ជាក្រុម, grid view, screen share, chat, speaker output និងសមស្របជាង WebRTC mesh សម្រាប់ 10-20 នាក់។
        ប្រសិនបើកុំព្យូទ័រមិនមាន camera អ្នកអាចបិទ “បើកកាមេរ៉ា” ហើយចូលនិយាយដោយ microphone បាន។
        បើអ្នកចូលរួមបើកកាមេរ៉ាមិនបាន សូមចុច icon camera ក្នុង toolbar ខាងក្រោម call ហើយជ្រើស Allow នៅ browser permission។
      </div>
      {notice ? <div className="rounded-lg bg-leaf/10 p-3 text-sm text-leaf">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
    </div>
  );
}

function LiveKitOneScreenConference() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  );
  // Joining is uncapped, but rendering unlimited live video tiles at once
  // would overwhelm the browser - the grid only ever shows the first 20.
  const visibleTracks = tracks.slice(0, 20);
  const grid = getCallGridMetrics(visibleTracks.length);

  return (
    <section className="bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-xs font-semibold text-white/70">
        <span>
          កំពុងបង្ហាញ {visibleTracks.length} នៃ {tracks.length} អ្នកចូលរួម
        </span>
        <span>ទិដ្ឋភាព Grid តែមួយអេក្រង់</span>
      </div>
      <div className="kh-livekit-stage h-[52svh] min-h-[300px] max-h-[680px] p-2 md:h-[calc(100svh-22rem)] md:min-h-[380px]">
        <div
          className="grid h-full gap-2"
          style={{
            gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`
          }}
        >
          {visibleTracks.map((trackRef) => {
            const participantName = trackRef.participant.name || trackRef.participant.identity || "អ្នកចូលរួម";
            const trackKey = `${trackRef.participant.sid}-${trackRef.source}`;
            const hasVideo = Boolean(trackRef.publication?.track);

            return (
              <div
                key={trackKey}
                className="relative flex min-h-0 overflow-hidden rounded-lg border border-white/10 bg-slate-900"
              >
                {hasVideo ? (
                  <VideoTrack
                    trackRef={trackRef as TrackReference}
                    className="h-full w-full object-cover"
                    playsInline
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/70">
                    <Camera className="h-8 w-8" />
                    <span className="text-sm font-semibold">បិទកាមេរ៉ា</span>
                  </div>
                )}
                <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white">
                  {participantName}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <RoomAudioRenderer />
      <LiveKitCallControls />
    </section>
  );
}

function LiveKitCallControls() {
  const room = useRoomContext();
  const {
    isCameraEnabled,
    isMicrophoneEnabled,
    isScreenShareEnabled,
    localParticipant
  } = useLocalParticipant();
  const [busyControl, setBusyControl] = useState<"mic" | "camera" | "screen" | "leave" | "">("");

  async function runControl(name: "mic" | "camera" | "screen" | "leave", action: () => Promise<unknown>) {
    if (busyControl) return;
    setBusyControl(name);
    try {
      await action();
    } finally {
      setBusyControl("");
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-slate-950 px-2 py-3 text-sm font-semibold">
      <button
        className={cn("rounded-lg px-4 py-2 text-white", isMicrophoneEnabled ? "bg-white/10" : "bg-red-500/80")}
        type="button"
        disabled={Boolean(busyControl)}
        onClick={() => runControl("mic", () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))}
      >
        <Mic className="mr-2 inline h-4 w-4" />
        {isMicrophoneEnabled ? "Microphone" : "បិទ Microphone"}
      </button>
      <button
        className={cn("rounded-lg px-4 py-2 text-white", isCameraEnabled ? "bg-white/10" : "bg-red-500/80")}
        type="button"
        disabled={Boolean(busyControl)}
        onClick={() => runControl("camera", () => localParticipant.setCameraEnabled(!isCameraEnabled))}
      >
        <Camera className="mr-2 inline h-4 w-4" />
        {isCameraEnabled ? "កាមេរ៉ា" : "បិទកាមេរ៉ា"}
      </button>
      <button
        className={cn("rounded-lg px-4 py-2 text-white", isScreenShareEnabled ? "bg-leaf" : "bg-white/10")}
        type="button"
        disabled={Boolean(busyControl)}
        onClick={() => runControl("screen", () => localParticipant.setScreenShareEnabled(!isScreenShareEnabled))}
      >
        <Share2 className="mr-2 inline h-4 w-4" />
        {isScreenShareEnabled ? "បញ្ឈប់ការចែករំលែក" : "ចែករំលែកអេក្រង់"}
      </button>
      <button
        className="rounded-lg border border-red-400/60 px-4 py-2 text-red-200"
        type="button"
        disabled={Boolean(busyControl)}
        onClick={() => runControl("leave", () => room.disconnect())}
      >
        <Phone className="mr-2 inline h-4 w-4" />
        ចាកចេញ
      </button>
    </div>
  );
}

type LiveRecordingSignal =
  | { type: "khmermeet-record-start"; meetingId: string; languageMode: "km" | "en" | "km-en"; recordingStartedAt: number }
  | { type: "khmermeet-record-stop" };

function LiveKitMeetingAgent({ meetingTitle }: { meetingTitle: string }) {
  const room = useRoomContext();
  const audioTracks = useTracks([{ source: Track.Source.Microphone, withPlaceholder: false }], {
    onlySubscribed: false
  });
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  // Default to km-en so mixed Khmer/English meetings are captured as spoken
  // instead of English getting silently translated into Khmer under "km" mode.
  const [transcriptionLanguage, setTranscriptionLanguage] = useState<"km" | "en" | "km-en">("km-en");
  const [savedMeetingId, setSavedMeetingId] = useState("");
  const [savedAudioUrl, setSavedAudioUrl] = useState("");
  const [transcriptionProgress, setTranscriptionProgress] = useState("");
  const [localBackupUrl, setLocalBackupUrl] = useState("");
  // Client-mesh per-speaker recording: each participant's browser records
  // only its own microphone locally, as one continuous file for the whole
  // call (no restarts - explicit user request), instead of LiveKit Egress
  // mixing server-side and uploading to S3. That S3 hop hit a confirmed,
  // unresolved AWS SDK V2 vs Supabase Storage signature bug
  // (supabase/storage#646) - unrelated to any config on this end - so
  // recording moved entirely client-side. The finished recording uploads
  // straight to Supabase Storage (register-track-recording) and gets
  // transcribed only after the call ends (transcribe-stored-segment,
  // splitting a long file server-side via ffmpeg if needed - see
  // lib/ffmpeg.ts) - never while the call is still live.
  const [serverRecording, setServerRecording] = useState<{ meetingId: string; recordingStartedAt: number } | null>(null);
  // True on participants who received the start signal but weren't the one
  // who clicked the button - shown as a passive "recording" indicator only,
  // they have no controls of their own.
  const [remoteRecordingActive, setRemoteRecordingActive] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const segmentRecorderRef = useRef<MediaRecorder | null>(null);
  const segmentStreamRef = useRef<MediaStream | null>(null);
  const segmentsRef = useRef<Blob[]>([]);
  const segmentingRef = useRef(false);
  const startedAtRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const mixAudioContextRef = useRef<AudioContext | null>(null);
  const mixDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mixInputRef = useRef<AudioNode | null>(null);
  const mixNodesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const serverRecordingRef = useRef(serverRecording);
  useEffect(() => {
    serverRecordingRef.current = serverRecording;
  }, [serverRecording]);
  // This participant's own track-only segment recorder for the client-mesh
  // recording path - separate from segmentRecorderRef above (which segments
  // the mixed stream for "Start Agent") since both can't safely share state.
  const trackSegmentRecorderRef = useRef<MediaRecorder | null>(null);
  const trackSegmentStreamRef = useRef<MediaStream | null>(null);
  const trackSegmentingRef = useRef(false);
  const trackChunksRef = useRef<Blob[]>([]);
  const trackMeetingIdRef = useRef("");
  const trackRecordingStartedAtRef = useRef(0);
  const trackLanguageModeRef = useRef<"km" | "en" | "km-en">("km-en");
  const trackStartRequestRef = useRef(0);
  const serverMixedRecorderRef = useRef<MediaRecorder | null>(null);
  const serverMixedChunksRef = useRef<Blob[]>([]);
  const serverMixedMimeTypeRef = useRef("audio/webm");

  useEffect(() => {
    if (!recording && !serverRecording) return;
    const startedAt = serverRecording ? serverRecording.recordingStartedAt : startedAtRef.current;
    const timer = window.setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      setSeconds(clampMeetingDurationSeconds(Math.floor(elapsedMs / 1000)));
      if (elapsedMs >= MAX_MEETING_DURATION_MS) {
        if (serverRecording) void stopServerRecording();
        else if (recording) stopRecording();
      }
    }, 250);
    return () => window.clearInterval(timer);
    // The timer should only restart when recording mode changes; stop
    // handlers read the latest refs/state they need when invoked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, serverRecording]);

  // buildMixedAudioStream() only wires up whatever microphone tracks are
  // already live when recording starts. Without this, anyone who joins (or
  // whose mic finishes subscribing) after that moment is silently missing
  // from the mixed recording even though they're audible live via
  // RoomAudioRenderer - this keeps the mix in sync with the room for both
  // Start Agent and Server Rec's primary mixed-audio recording.
  useEffect(() => {
    if (!recording && !serverRecording) return;
    connectAvailableAudioTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioTracks, recording, serverRecording]);

  useEffect(() => {
    return () => {
      if (localBackupUrl) URL.revokeObjectURL(localBackupUrl);
    };
  }, [localBackupUrl]);

  // Listens for the room-wide start/stop signal broadcast by whichever
  // participant clicked "Server Rec" (see startServerRecording below). Every
  // participant's browser - including late joiners who connect mid-recording -
  // reacts by recording only its own microphone locally and uploading
  // segments directly; nobody else has to click anything.
  useEffect(() => {
    function handleData(payload: Uint8Array) {
      let message: LiveRecordingSignal;
      try {
        message = JSON.parse(new TextDecoder().decode(payload));
      } catch {
        return;
      }
      if (message.type === "khmermeet-record-start") {
        setRemoteRecordingActive(true);
        void startLocalTrackRecording(message.meetingId, message.languageMode, message.recordingStartedAt);
      } else if (message.type === "khmermeet-record-stop") {
        setRemoteRecordingActive(false);
        void stopLocalTrackRecording();
      }
    }

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // publishData only reaches participants already connected at the moment
  // it's sent - anyone who joins mid-recording needs the start signal
  // re-sent directly to them so their browser starts recording its own
  // microphone too instead of silently missing the whole meeting.
  useEffect(() => {
    function handleConnected(participant: RemoteParticipant) {
      const current = serverRecordingRef.current;
      if (!current) return;
      const signal: LiveRecordingSignal = {
        type: "khmermeet-record-start",
        meetingId: current.meetingId,
        languageMode: trackLanguageModeRef.current,
        recordingStartedAt: current.recordingStartedAt
      };
      room.localParticipant
        .publishData(new TextEncoder().encode(JSON.stringify(signal)), {
          reliable: true,
          destinationIdentities: [participant.identity]
        })
        .catch(() => undefined);
    }

    room.on(RoomEvent.ParticipantConnected, handleConnected);
    return () => {
      room.off(RoomEvent.ParticipantConnected, handleConnected);
    };
  }, [room]);

  function setLocalBackup(blob: Blob) {
    if (localBackupUrl) URL.revokeObjectURL(localBackupUrl);
    const url = URL.createObjectURL(blob);
    setLocalBackupUrl(url);
    return url;
  }

  // Adds any live microphone tracks not already in the mix (new
  // participants joining, or a track finishing subscription) to the shared
  // AudioContext destination. Safe to call repeatedly - already-connected
  // tracks are skipped.
  function connectAvailableAudioTracks() {
    const audioContext = mixAudioContextRef.current;
    const input = mixInputRef.current;
    if (!audioContext || !input) return;
    const nodes = mixNodesRef.current;

    for (const ref of audioTracks) {
      const track = ref.publication?.track?.mediaStreamTrack;
      if (!track || track.readyState !== "live" || nodes.has(track.id)) continue;
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      source.connect(input);
      nodes.set(track.id, source);
    }
  }

  function stopMixedAudioContext() {
    mixNodesRef.current.forEach((node) => node.disconnect());
    mixNodesRef.current = new Map();
    const audioContext = mixAudioContextRef.current;
    mixAudioContextRef.current = null;
    mixDestinationRef.current = null;
    mixInputRef.current = null;
    if (audioContext) void audioContext.close().catch(() => undefined);
  }

  function buildMixedAudioStream() {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    // Compressor + gain before the destination: getUserMedia's
    // autoGainControl per-track isn't enough to keep a participant seated
    // far from their microphone as intelligible as one talking right into
    // it, especially once several tracks are mixed together. This raises
    // quiet/distant speech and caps loud/close speech instead.
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;
    const gain = audioContext.createGain();
    gain.gain.value = 1.8;
    compressor.connect(gain);
    gain.connect(destination);

    mixAudioContextRef.current = audioContext;
    mixDestinationRef.current = destination;
    mixInputRef.current = compressor;
    mixNodesRef.current = new Map();

    connectAvailableAudioTracks();

    // A MediaStreamAudioDestinationNode's .stream always reports exactly one
    // (silent) audio track from the moment it's created, even with zero
    // sources connected - checking destination.stream.getAudioTracks().length
    // here never actually catches the "no mic available" case it was meant
    // to guard against, so recording silently started and produced a
    // completely silent file instead of surfacing an error. Check how many
    // sources were actually wired up instead.
    if (mixNodesRef.current.size === 0) {
      stopMixedAudioContext();
      throw new Error("No microphone tracks are available yet. Please unmute microphone first.");
    }

    cleanupRef.current = stopMixedAudioContext;

    return destination.stream;
  }

  function startSegmentRecorder(stream: MediaStream, mimeType: string) {
    // Longer than the original 10s: a fixed-time cut regardless of natural
    // speech pauses splits some sentences across two segments, and whichever
    // half lands in a chunk gets transcribed without the rest of the
    // sentence for context - scattered wrong sentences, confirmed live in
    // the standalone recorder's identical segment-recording pattern
    // (components/recording-panel.tsx). Fewer cut points per minute means
    // fewer split sentences.
    const segmentMs = 25000;
    segmentingRef.current = true;
    segmentsRef.current = [];
    // Cloned tracks instead of the live mixed stream the main recorder is
    // attached to: running two MediaRecorder instances on the exact same
    // MediaStreamTrack has been observed to starve the older recorder of
    // audio data in some browsers, producing a fully silent main recording
    // while this segment recorder (restarted every 10s) keeps capturing
    // audio fine.
    const segmentStream = new MediaStream(stream.getAudioTracks().map((track) => track.clone()));
    segmentStreamRef.current = segmentStream;

    const recordNextSegment = () => {
      if (!segmentingRef.current) return;
      const media = new MediaRecorder(
        segmentStream,
        mimeType ? { mimeType, audioBitsPerSecond: 96000 } : { audioBitsPerSecond: 96000 }
      );
      const parts: Blob[] = [];
      segmentRecorderRef.current = media;

      media.ondataavailable = (event) => {
        if (event.data.size > 0) parts.push(event.data);
      };
      media.onstop = () => {
        const segmentType = media.mimeType || mimeType || "audio/webm";
        const segment = new Blob(parts, { type: segmentType });
        if (segment.size > 1000) segmentsRef.current.push(segment);
        if (segmentingRef.current) window.setTimeout(recordNextSegment, 0);
      };

      media.start();
      window.setTimeout(() => {
        if (media.state !== "inactive") media.stop();
      }, segmentMs);
    };

    recordNextSegment();
  }

  function stopSegmentRecorder() {
    segmentingRef.current = false;
    const media = segmentRecorderRef.current;
    if (media && media.state !== "inactive") media.stop();
    segmentStreamRef.current?.getTracks().forEach((track) => track.stop());
    segmentStreamRef.current = null;
  }

  function getCurrentSpeakerNames() {
    const names = [
      room.localParticipant.name || room.localParticipant.identity,
      ...[...room.remoteParticipants.values()].map((participant) => participant.name || participant.identity)
    ];

    return [...new Set(names.map((name) => name?.trim()).filter((name): name is string => Boolean(name)))].slice(
      0,
      50
    );
  }

  function startRecording() {
    setError("");
    setNotice("");
    setSavedMeetingId("");
    setSavedAudioUrl("");
    setLocalBackupUrl("");
    try {
      const mixedStream = buildMixedAudioStream();
      const mimeType = getRecorderMimeType();
      const recorder = new MediaRecorder(mixedStream, getLongRecordingOptions(mimeType));
      chunksRef.current = [];
      segmentsRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => void saveRecording(mimeType || recorder.mimeType || "audio/webm");
      startSegmentRecorder(mixedStream, mimeType);
      recorder.start(5000);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setSeconds(0);
      setRecording(true);
      setNotice("Meeting Agent កំពុងថតសំឡេងពី LiveKit room។");
    } catch (error) {
      setError(error instanceof Error ? error.message : "មិនអាចចាប់ផ្តើមថតកិច្ចប្រជុំបានទេ។");
    }
  }

  function stopRecording() {
    stopSegmentRecorder();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  }

  function startServerMixedBackup() {
    try {
      const mixedStream = buildMixedAudioStream();
      const mimeType = getRecorderMimeType();
      const recorder = new MediaRecorder(mixedStream, getLongRecordingOptions(mimeType));
      serverMixedChunksRef.current = [];
      serverMixedMimeTypeRef.current = mimeType || recorder.mimeType || "audio/webm";
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) serverMixedChunksRef.current.push(event.data);
      };
      recorder.start(5000);
      serverMixedRecorderRef.current = recorder;
    } catch {
      serverMixedRecorderRef.current = null;
      serverMixedChunksRef.current = [];
    }
  }

  function stopServerMixedBackup(
    meetingId: string,
    languageMode: "km" | "en" | "km-en",
    durationMs: number
  ): Promise<boolean> {
    const recorder = serverMixedRecorderRef.current;
    serverMixedRecorderRef.current = null;
    if (!recorder || recorder.state === "inactive") {
      cleanupRef.current?.();
      cleanupRef.current = null;
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      recorder.onstop = async () => {
        cleanupRef.current?.();
        cleanupRef.current = null;
        const mimeType = recorder.mimeType || serverMixedMimeTypeRef.current || "audio/webm";
        const blob = new Blob(serverMixedChunksRef.current, { type: mimeType });
        serverMixedChunksRef.current = [];
        if (blob.size <= 1000) {
          resolve(false);
          return;
        }

        try {
          const audioUrl = await uploadRecordingDirect(blob, mimeType.includes("mp4") ? "mixed-meeting.m4a" : "mixed-meeting.webm");
          const response = await fetch(`/api/meetings/${meetingId}/attach-audio`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioUrl,
              duration: clampMeetingDurationSeconds(durationMs / 1000),
              languageMode
            })
          });
          resolve(response.ok);
        } catch {
          resolve(false);
        }
      };
      recorder.stop();
    });
  }

  // Records only this participant's own microphone track (never the mixed
  // room audio) as ONE continuous file for the whole call - no restarts, no
  // gaps (explicit user request: capture start-to-finish in one take, only
  // process it afterward). `media.start(timeslice)` just controls how often
  // ondataavailable hands over the buffer so memory doesn't pile up as one
  // giant pending chunk - every piece still belongs to the same recording
  // session and is only joined into a single Blob once, in stopLocalTrackRecorder.
  function startLocalTrackRecorder(stream: MediaStream, mimeType: string) {
    trackSegmentingRef.current = true;
    const trackStream = new MediaStream(stream.getAudioTracks().map((track) => track.clone()));
    trackSegmentStreamRef.current = trackStream;
    trackChunksRef.current = [];

    const media = new MediaRecorder(
      trackStream,
      getLongRecordingOptions(mimeType)
    );
    media.ondataavailable = (event) => {
      if (event.data.size > 0) trackChunksRef.current.push(event.data);
    };
    trackSegmentRecorderRef.current = media;
    media.start(5000);
  }

  // Resolves once the recorder has fully stopped, with the single Blob for
  // the entire call (or null if nothing usable was captured).
  function stopLocalTrackRecorder(mimeType: string): Promise<Blob | null> {
    trackSegmentingRef.current = false;
    const media = trackSegmentRecorderRef.current;
    trackSegmentRecorderRef.current = null;
    if (!media || media.state === "inactive") {
      trackSegmentStreamRef.current?.getTracks().forEach((track) => track.stop());
      trackSegmentStreamRef.current = null;
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      media.onstop = () => {
        trackSegmentStreamRef.current?.getTracks().forEach((track) => track.stop());
        trackSegmentStreamRef.current = null;
        const blobType = media.mimeType || mimeType || "audio/webm";
        const blob = new Blob(trackChunksRef.current, { type: blobType });
        trackChunksRef.current = [];
        resolve(blob.size > 1000 ? blob : null);
      };
      media.stop();
    });
  }

  // Uploads the one complete recording straight to Supabase Storage
  // (uploadRecordingDirect bypasses Vercel's request-body limit entirely -
  // a full call can be tens of MB) and registers it against the meeting.
  // No AI call happens here - see transcribe-stored-segment for the
  // deferred transcription step, triggered separately below.
  async function uploadAndRegisterTrackRecording(
    meetingId: string,
    blob: Blob,
    languageMode: "km" | "en" | "km-en",
    durationMs: number
  ) {
    const identity = room.localParticipant.identity;
    const name = room.localParticipant.name || identity;
    try {
      const audioUrl = await uploadRecordingDirect(blob, blob.type.includes("mp4") ? "track.m4a" : "track.webm");
      const response = await fetch(`/api/meetings/${meetingId}/register-track-recording`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerIdentity: identity, speakerName: name, audioUrl, durationMs, languageMode })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Called on every participant's browser (including the initiator's own,
  // since publishData never loops back to the sender) when a
  // "khmermeet-record-start" signal is received - starts recording only the
  // local microphone, no user interaction required.
  async function waitForLocalMicrophoneTrack(requestId: number) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (trackStartRequestRef.current !== requestId || trackSegmentingRef.current) return null;
      const micTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
      if (micTrack?.readyState === "live") return micTrack;
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
    return null;
  }

  async function startLocalTrackRecording(meetingId: string, languageMode: "km" | "en" | "km-en", recordingStartedAt: number) {
    if (trackSegmentingRef.current) return;
    const requestId = trackStartRequestRef.current + 1;
    trackStartRequestRef.current = requestId;
    const micTrack = await waitForLocalMicrophoneTrack(requestId);
    if (!micTrack || trackSegmentingRef.current || trackStartRequestRef.current !== requestId) {
      setError("មិនអាចចាប់យក microphone សម្រាប់ Server Rec បានទេ។ សូមបើក microphone រួចចាប់ផ្តើមថតម្តងទៀត។");
      return;
    }
    trackMeetingIdRef.current = meetingId;
    trackLanguageModeRef.current = languageMode;
    trackRecordingStartedAtRef.current = recordingStartedAt;
    startLocalTrackRecorder(new MediaStream([micTrack]), getRecorderMimeType());
  }

  async function stopLocalTrackRecording() {
    trackStartRequestRef.current += 1;
    if (!trackSegmentingRef.current && !trackSegmentRecorderRef.current) return;
    const meetingId = trackMeetingIdRef.current;
    const languageMode = trackLanguageModeRef.current;
    const durationMs = clampMeetingDurationMs(Date.now() - trackRecordingStartedAtRef.current);
    const mimeType = getRecorderMimeType();
    trackMeetingIdRef.current = "";

    const blob = await stopLocalTrackRecorder(mimeType);
    if (!blob || !meetingId) return;

    const registered = await uploadAndRegisterTrackRecording(meetingId, blob, languageMode, durationMs);
    if (!registered) return;

    // Transcription happens now, after the call has fully ended - never
    // while it was still live. Best-effort: if this fails or the tab
    // closes before it finishes, merge-transcript's own catch-up pass
    // retries it since the audio is already safely stored.
    await fetch(`/api/meetings/${meetingId}/transcribe-stored-segment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speakerIdentity: room.localParticipant.identity, index: 1 })
    }).catch(() => undefined);
    await fetch(`/api/meetings/${meetingId}/merge-transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duration: clampMeetingDurationSeconds(durationMs / 1000) })
    }).catch(() => undefined);
  }

  async function startServerRecording() {
    setSaving(true);
    setError("");
    setNotice("");
    setSavedMeetingId("");
    setSavedAudioUrl("");
    try {
      const response = await fetch("/api/meetings/start-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: meetingTitle, languageMode: transcriptionLanguage })
      });
      const data = await readJsonResponse<{ meetingId?: string; error?: string }>(response);
      if (!response.ok || !data.meetingId) throw new Error(data.error ?? "ការថត Server មិនជោគជ័យទេ។");

      const recordingStartedAt = Date.now();
      const signal: LiveRecordingSignal = {
        type: "khmermeet-record-start",
        meetingId: data.meetingId,
        languageMode: transcriptionLanguage,
        recordingStartedAt
      };
      await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(signal)), { reliable: true });
      // publishData never delivers back to the sender - this participant has
      // to be told to start recording itself the same way every remote
      // participant just was.
      void startLocalTrackRecording(data.meetingId, transcriptionLanguage, recordingStartedAt);
      startServerMixedBackup();
      setServerRecording({ meetingId: data.meetingId, recordingStartedAt });
      setNotice("បានចាប់ផ្តើមថត។ Browser របស់អ្នកចូលរួមម្នាក់ៗនឹងថតសំឡេងខ្លួនឯងដាច់ដោយឡែកដោយស្វ័យប្រវត្តិ (មិនចាំបាច់ចុចអ្វីទេ)។");
    } catch (error) {
      setError(error instanceof Error ? error.message : "មិនអាចចាប់ផ្តើម Server recording បានទេ។");
    } finally {
      setSaving(false);
    }
  }

  async function stopServerRecording() {
    if (!serverRecording) return;
    setSaving(true);
    setError("");
    try {
      const stopSignal: LiveRecordingSignal = { type: "khmermeet-record-stop" };
      await room.localParticipant
        .publishData(new TextEncoder().encode(JSON.stringify(stopSignal)), { reliable: true })
        .catch(() => undefined);
      await stopLocalTrackRecording();
      const durationMs = clampMeetingDurationMs(Date.now() - serverRecording.recordingStartedAt);
      await stopServerMixedBackup(serverRecording.meetingId, transcriptionLanguage, durationMs);

      setNotice("កំពុងបំលែងសំឡេងទៅជាអក្សរ សូមរង់ចាំបន្តិច...");
      // Best-effort grace period: recording+transcription now happens
      // independently in each remote participant's own browser (this
      // participant's own work already finished above, inside
      // stopLocalTrackRecording), so there's no single server-side job to
      // poll for completion like LiveKit Egress had. Transcription was
      // deferred to call-end specifically so it wouldn't compete with the
      // AI's remote per-segment fan-out for time - a longer call has more
      // segments for remote participants to get through, so scale the wait
      // with call length instead of a flat window that was fine for a
      // quick upload but too short once transcription moved here too.
      // merge-transcript also runs its own bounded catch-up pass for any
      // segment still not done by the time it's called, so this is a
      // best-effort head start, not the only safety net.
      const callDurationMs = Date.now() - serverRecording.recordingStartedAt;
      const graceMs = Math.min(10 * 60 * 1000, Math.max(45000, Math.round(callDurationMs * 0.08)));
      await new Promise((resolve) => window.setTimeout(resolve, graceMs));

      const duration = clampMeetingDurationSeconds(durationMs / 1000);
      const mergeResponse = await fetch(`/api/meetings/${serverRecording.meetingId}/merge-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration })
      });
      const mergeJson = await readJsonResponse<{ merged?: boolean; error?: string }>(mergeResponse);
      if (!mergeResponse.ok) throw new Error(mergeJson.error ?? "Could not merge the recorded transcript.");

      setSavedMeetingId(serverRecording.meetingId);
      if (mergeJson.merged) {
        await fetch(`/api/meetings/${serverRecording.meetingId}/finalize-summary`, { method: "POST" }).catch(() => undefined);
        setNotice("ការថតត្រូវបានបំលែងជាអក្សរ និងរក្សាទុករួចរាល់។");
      } else {
        setNotice("បានរក្សាទុកកិច្ចប្រជុំ ប៉ុន្តែរកមិនឃើញសំឡេងច្បាស់លាស់ពីអ្នកចូលរួមណាម្នាក់ទេ។");
      }
      setServerRecording(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save server recording.");
    } finally {
      setSaving(false);
    }
  }

  async function saveRecording(mimeType: string) {
    setSaving(true);
    setError("");
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (!blob.size) throw new Error("No audio was recorded.");
      setLocalBackup(blob);
      const speakers = getCurrentSpeakerNames();

      let audioUrl: string;
      try {
        // Direct-to-Supabase upload bypasses Vercel's hard 4.5MB
        // request-body limit, so long (multi-hour) recordings can still be
        // saved. Falls through to the server-relayed path below when this
        // isn't available (e.g. Supabase Storage not configured) - that
        // path is only reliable for shorter clips.
        audioUrl = await uploadRecordingDirect(blob);
      } catch {
        const uploadData = new FormData();
        uploadData.append("audio", blob, mimeType.includes("mp4") ? "livekit-call.m4a" : "livekit-call.webm");
        uploadData.append("speakers", JSON.stringify(speakers));
        uploadData.append("languageMode", transcriptionLanguage);
        uploadData.append("skipTranscription", "true");
        const uploadResponse = await fetch("/api/uploads", { method: "POST", body: uploadData });
        const uploadJson = await readJsonResponse<{ audioUrl?: string; error?: string }>(uploadResponse);
        if (!uploadResponse.ok || !uploadJson.audioUrl) {
          throw new Error(
            uploadJson.error ??
              (uploadResponse.status === 413
                ? "This recording is too large to upload. Download the local backup below, or record a shorter meeting."
                : "Audio upload failed.")
          );
        }
        audioUrl = uploadJson.audioUrl;
      }

      const saveResponse = await fetch("/api/call-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: meetingTitle,
          audioUrl,
          transcript: "",
          duration: clampMeetingDurationSeconds((Date.now() - startedAtRef.current) / 1000),
          speakerNames: speakers,
          languageMode: transcriptionLanguage
        })
      });
      const saveJson = await readJsonResponse<{ meetingId?: string; error?: string; hint?: string }>(saveResponse);
      if (!saveResponse.ok) throw new Error(saveJson.error ?? saveJson.hint ?? "Save failed.");
      if (!saveJson.meetingId) throw new Error("Meeting was saved but no meeting id was returned.");
      setSavedMeetingId(saveJson.meetingId);
      setSavedAudioUrl(audioUrl);
      setNotice("បានរក្សាទុក audio ទៅក្នុងប្រព័ន្ធ។ Meeting Agent កំពុងបម្លែងសំឡេងជា transcript ជា chunks។");
      await transcribeSavedSegments(saveJson.meetingId, mimeType, speakers);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save meeting recording.");
    } finally {
      cleanupRef.current?.();
      cleanupRef.current = null;
      setSaving(false);
    }
  }

  async function transcribeSavedSegments(meetingId: string, mimeType: string, speakers: string[]) {
    const audioSegments = segmentsRef.current.filter((chunk) => chunk.size > 1000);
    if (!audioSegments.length) return;

    let successfulChunks = 0;
    let lastErrorMessage = "";
    setTranscriptionProgress(`Transcribing 0/${audioSegments.length} audio segments...`);

    for (let index = 0; index < audioSegments.length; index += 1) {
      const chunk = audioSegments[index];
      const formData = new FormData();
      const chunkType = chunk.type || mimeType;
      formData.append("audio", chunk, `livekit-call-part-${index + 1}.${chunkType.includes("mp4") ? "m4a" : "webm"}`);
      formData.append("languageMode", transcriptionLanguage);
      formData.append("speakers", JSON.stringify(speakers));
      formData.append("index", String(index + 1));
      setTranscriptionProgress(`Transcribing ${index + 1}/${audioSegments.length} audio segments...`);

      try {
        const response = await fetch(`/api/meetings/${meetingId}/transcribe-chunk`, { method: "POST", body: formData });
        const data = await readJsonResponse<{ transcript?: string; error?: string }>(response);
        if (response.ok && typeof data.transcript === "string" && data.transcript.trim()) {
          successfulChunks += 1;
        } else if (!response.ok && data.error) {
          lastErrorMessage = data.error;
        }
      } catch (error) {
        // Continue with the next chunk so one timeout/noisy section does not stop a long recording.
        lastErrorMessage = error instanceof Error ? error.message : lastErrorMessage;
      }
    }

    setTranscriptionProgress(
      successfulChunks
        ? `Transcription complete: ${successfulChunks}/${audioSegments.length} segments produced text. Open the meeting to review transcript.`
        : lastErrorMessage
          ? `Audio saved, but transcription failed: ${lastErrorMessage}`
          : "Audio saved, but no clear speech text was detected. Please check microphone quality or OpenRouter credits."
    );
    setNotice("បានរក្សាទុក audio ហើយបានបន្ថែម transcript ដែលចាប់បានទៅ meeting detail។");
  }

  return (
    <section className="border-t border-white/10 bg-white p-5">
      {recording || serverRecording || remoteRecordingActive ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
          </span>
          កិច្ចប្រជុំនេះកំពុងត្រូវបានថតសំឡេង — សូមអញ្ជើញអ្នកចូលរួមទាំងអស់ដឹងជាមុន (microphone របស់អ្នកចូលរួមម្នាក់ៗកំពុងត្រូវបានថតដោយស្វ័យប្រវត្តិ)។
        </div>
      ) : null}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-leaf">
            <Bot className="h-4 w-4" />
            Meeting Agent
          </p>
          <h2 className="mt-1 text-xl font-bold text-ink">ថតសំឡេង និងរក្សាទុកប្រជុំ HD</h2>
          <p className="mt-1 text-sm text-slate-500">
            ប្រើ &quot;Server Rec&quot; ដើម្បីថតសំឡេងប្រជុំរួមតែមួយ ដែលចាប់យកអ្នកចូលរួមទាំងអស់ដែល host លឺ ហើយរក្សាទុកជា audio player សំខាន់។ &quot;Start Agent&quot; ប្រើសម្រាប់ការហៅខ្លីៗតែប៉ុណ្ណោះ។
          </p>
          {transcriptionProgress ? <p className="mt-2 text-sm text-slate-500">{transcriptionProgress}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="kh-input h-10 w-auto min-w-36 py-1 text-sm"
            value={transcriptionLanguage}
            onChange={(event) => setTranscriptionLanguage(event.target.value as "km" | "en" | "km-en")}
            disabled={recording || saving}
            title="Choose how OpenRouter should transcribe the saved meeting audio."
          >
            <option value="km">Khmer output</option>
            <option value="en">English output</option>
            <option value="km-en">Keep Khmer + English</option>
          </select>
          <span className={cn("kh-badge", recording || serverRecording ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600")}>
            {recording || serverRecording ? `Recording ${formatTime(seconds)}` : "Ready"}
          </span>
          {remoteRecordingActive && !serverRecording ? (
            <span className="kh-badge bg-red-100 text-red-700" title="Someone in this meeting started recording - your microphone is being captured automatically.">
              🔴 Recording (started by another participant)
            </span>
          ) : null}
          {!serverRecording ? (
            <button
              className="kh-button-primary"
              type="button"
              onClick={startServerRecording}
              disabled={saving || recording}
              title="Records one mixed meeting audio file from every audible participant and saves it as the primary meeting audio."
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Server Rec (full meeting audio)
            </button>
          ) : (
            <button className="kh-button-secondary text-red-600" type="button" onClick={stopServerRecording} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Stop Server Rec
            </button>
          )}
          {!recording ? (
            <button
              className="kh-button-secondary"
              type="button"
              onClick={startRecording}
              disabled={saving || Boolean(serverRecording)}
              // Mixes all participants through a synthesized
              // MediaStreamDestinationNode into a single client-side
              // MediaRecorder - confirmed live (via components/recording-panel.tsx's
              // identical pattern) that this hand-off can lose almost all of
              // the signal on some browser/OS/driver combinations, producing
              // a silent recording with no error. Server Rec doesn't touch
              // this code path at all - it's the reliable option.
              title="Single mixed audio track for everyone - speaker names are guessed, not exact. Known issue: on some computers this can silently record no audio at all. Use Server Rec above unless you need a very quick, short recording."
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Start Agent (quick, single track - may record silently on some PCs)
            </button>
          ) : (
            <button className="kh-button-secondary text-red-600" type="button" onClick={stopRecording}>
              <Square className="h-4 w-4" />
              Stop & Save
            </button>
          )}
          {savedMeetingId ? <Link className="kh-button-secondary" href={`/meetings/${savedMeetingId}`}>Open record</Link> : null}
        </div>
      </div>
      {notice ? <div className="mt-4 rounded-lg bg-leaf/10 p-3 text-sm text-leaf">{notice}</div> : null}
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {localBackupUrl && !savedMeetingId ? (
        <div className="mt-4 rounded-xl border border-saffron/30 bg-saffron/10 p-4">
          <p className="font-semibold text-ink">Local recording backup</p>
          <p className="mt-1 text-sm text-slate-600">
            The audio was captured in this browser. If server save fails, download this backup before refreshing or closing the page.
          </p>
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
            <audio className="w-full" controls src={localBackupUrl} />
          </div>
          <a className="kh-button-secondary mt-3 inline-flex" download={`khmermeet-${room.name || "meeting"}.webm`} href={localBackupUrl}>
            <Download className="h-4 w-4" />
            Download backup audio
          </a>
        </div>
      ) : null}
      {savedMeetingId ? (
        <div className="mt-4 rounded-xl border border-leaf/20 bg-leaf/5 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="font-semibold text-ink">Recording saved successfully</p>
              <p className="mt-1 text-sm text-slate-600">
                Your audio is saved in the meeting record. You can also find it from Recorder and Meeting History.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="kh-button-primary" href={`/meetings/${savedMeetingId}`}>Open saved meeting</Link>
              <Link className="kh-button-secondary" href="/meetings/new">Saved recordings</Link>
              <Link className="kh-button-secondary" href="/meetings">History</Link>
            </div>
          </div>
          {savedAudioUrl ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
              <p className="mb-2 text-sm font-semibold text-slate-700">Recorded audio preview</p>
              <audio className="w-full" controls src={savedAudioUrl} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
