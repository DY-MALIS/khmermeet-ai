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
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function getRecorderMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
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
    setNotice("Invite link copied. Participants only need to enter their name, then join.");
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
            <p className="text-sm font-semibold text-slate-600">Invite participants</p>
            <p className="text-sm text-slate-500">
              Share this link so others can join <span className="font-semibold text-ink">{meetingTitle()}</span>. They only enter their name.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="kh-button-secondary" type="button" onClick={copyInvite}>
              <Copy className="h-4 w-4" />
              Copy link
            </button>
            <button className="kh-button-primary" type="button" onClick={shareInvite}>
              <Share2 className="h-4 w-4" />
              Share invite
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
            const message = error.message || "Could not connect camera/microphone.";
            if (/camera|video|device|permission/i.test(message) && callMedia.video) {
              setCameraOn(false);
              setCallMedia((current) => ({ ...current, video: false }));
              setTokenPayload(null);
              setError(`${message} Please join again with camera off for audio-only mode.`);
              return;
            }
            if (/microphone|audio|device|permission/i.test(message) && callMedia.audio) {
              setMicrophoneOn(false);
              setCallMedia((current) => ({ ...current, audio: false }));
              setTokenPayload(null);
              setError(`${message} Please join again with microphone off for listen-only mode, or allow microphone permission to speak.`);
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
              <span className="text-sm font-semibold text-slate-600">Room code</span>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-600">{room}</div>
            </div>
          ) : (
            <label className="space-y-1">
              <span className="text-sm font-semibold text-slate-600">Room code</span>
              <div className="flex gap-2">
                <input className="kh-input uppercase" value={room} onChange={(event) => setRoom(event.target.value.toUpperCase())} />
                <button className="kh-button-secondary px-3" type="button" onClick={copyInvite} title="Copy invite">
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
  const visibleTracks = tracks.slice(0, 20);
  const grid = getCallGridMetrics(visibleTracks.length);

  return (
    <section className="bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-xs font-semibold text-white/70">
        <span>{visibleTracks.length}/20 participants</span>
        <span>One-screen grid view</span>
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
            const participantName = trackRef.participant.name || trackRef.participant.identity || "Participant";
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
                    <span className="text-sm font-semibold">Camera off</span>
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
        {isMicrophoneEnabled ? "Microphone" : "Mic off"}
      </button>
      <button
        className={cn("rounded-lg px-4 py-2 text-white", isCameraEnabled ? "bg-white/10" : "bg-red-500/80")}
        type="button"
        disabled={Boolean(busyControl)}
        onClick={() => runControl("camera", () => localParticipant.setCameraEnabled(!isCameraEnabled))}
      >
        <Camera className="mr-2 inline h-4 w-4" />
        {isCameraEnabled ? "Camera" : "Camera off"}
      </button>
      <button
        className={cn("rounded-lg px-4 py-2 text-white", isScreenShareEnabled ? "bg-leaf" : "bg-white/10")}
        type="button"
        disabled={Boolean(busyControl)}
        onClick={() => runControl("screen", () => localParticipant.setScreenShareEnabled(!isScreenShareEnabled))}
      >
        <Share2 className="mr-2 inline h-4 w-4" />
        {isScreenShareEnabled ? "Stop share" : "Share screen"}
      </button>
      <button
        className="rounded-lg border border-red-400/60 px-4 py-2 text-red-200"
        type="button"
        disabled={Boolean(busyControl)}
        onClick={() => runControl("leave", () => room.disconnect())}
      >
        <Phone className="mr-2 inline h-4 w-4" />
        Leave
      </button>
    </div>
  );
}

type TrackJob = { egressId: string; identity: string; name: string; segmentsPrefix: string; startOffsetMs: number; stopped?: boolean };

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
  const [transcriptionLanguage, setTranscriptionLanguage] = useState<"km" | "en" | "km-en">("km");
  const [savedMeetingId, setSavedMeetingId] = useState("");
  const [savedAudioUrl, setSavedAudioUrl] = useState("");
  const [transcriptionProgress, setTranscriptionProgress] = useState("");
  const [localBackupUrl, setLocalBackupUrl] = useState("");
  const [serverRecording, setServerRecording] = useState<{
    fileEgressId: string;
    storageUrl: string;
    recordingBase: string;
    recordingStartedAt: number;
    trackJobs: TrackJob[];
  } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const segmentRecorderRef = useRef<MediaRecorder | null>(null);
  const segmentsRef = useRef<Blob[]>([]);
  const segmentingRef = useRef(false);
  const startedAtRef = useRef(0);
  const serverStartedAtRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const serverRecordingRef = useRef(serverRecording);
  useEffect(() => {
    serverRecordingRef.current = serverRecording;
  }, [serverRecording]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setSeconds(Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    return () => {
      if (localBackupUrl) URL.revokeObjectURL(localBackupUrl);
    };
  }, [localBackupUrl]);

  // Dynamically start/stop a per-participant track-egress job as people join
  // or leave during an active Server Rec recording, so late joiners still get
  // their own clean (non-overlapping) audio captured for transcription.
  useEffect(() => {
    async function handleConnected(participant: RemoteParticipant) {
      const current = serverRecordingRef.current;
      if (!current) return;
      try {
        const response = await fetch("/api/livekit-egress/track/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room: room.name,
            identity: participant.identity,
            name: participant.name,
            recordingBase: current.recordingBase,
            recordingStartedAt: current.recordingStartedAt
          })
        });
        const data = await readJsonResponse<TrackJob & { skipped?: boolean }>(response);
        if (response.ok && data.egressId) {
          setServerRecording((prev) => (prev ? { ...prev, trackJobs: [...prev.trackJobs, data] } : prev));
        }
      } catch {
        // Best-effort: this participant's audio simply won't get its own transcription track.
      }
    }

    function handleDisconnected(participant: RemoteParticipant) {
      const current = serverRecordingRef.current;
      const job = current?.trackJobs.find((entry) => entry.identity === participant.identity && !entry.stopped);
      if (!job) return;
      setServerRecording((prev) =>
        prev
          ? { ...prev, trackJobs: prev.trackJobs.map((entry) => (entry.egressId === job.egressId ? { ...entry, stopped: true } : entry)) }
          : prev
      );
      fetch("/api/livekit-egress/track/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ egressId: job.egressId })
      }).catch(() => undefined);
    }

    room.on(RoomEvent.ParticipantConnected, handleConnected);
    room.on(RoomEvent.ParticipantDisconnected, handleDisconnected);
    return () => {
      room.off(RoomEvent.ParticipantConnected, handleConnected);
      room.off(RoomEvent.ParticipantDisconnected, handleDisconnected);
    };
  }, [room]);

  function setLocalBackup(blob: Blob) {
    if (localBackupUrl) URL.revokeObjectURL(localBackupUrl);
    const url = URL.createObjectURL(blob);
    setLocalBackupUrl(url);
    return url;
  }

  function buildMixedAudioStream() {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    const nodes: MediaStreamAudioSourceNode[] = [];
    const seen = new Set<string>();

    for (const ref of audioTracks) {
      const track = ref.publication?.track?.mediaStreamTrack;
      if (!track || track.readyState !== "live" || seen.has(track.id)) continue;
      seen.add(track.id);
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      source.connect(destination);
      nodes.push(source);
    }

    if (!destination.stream.getAudioTracks().length) {
      throw new Error("No microphone tracks are available yet. Please unmute microphone first.");
    }

    cleanupRef.current = () => {
      nodes.forEach((node) => node.disconnect());
      void audioContext.close().catch(() => undefined);
    };

    return destination.stream;
  }

  function startSegmentRecorder(stream: MediaStream, mimeType: string) {
    const segmentMs = 10000;
    segmentingRef.current = true;
    segmentsRef.current = [];

    const recordNextSegment = () => {
      if (!segmentingRef.current) return;
      const media = new MediaRecorder(
        stream,
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
  }

  function getCurrentSpeakerNames() {
    const names = [
      room.localParticipant.name || room.localParticipant.identity,
      ...[...room.remoteParticipants.values()].map((participant) => participant.name || participant.identity)
    ];

    return [...new Set(names.map((name) => name?.trim()).filter((name): name is string => Boolean(name)))].slice(
      0,
      20
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
      const recorder = new MediaRecorder(mixedStream, mimeType ? { mimeType, audioBitsPerSecond: 96000 } : { audioBitsPerSecond: 96000 });
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
      setError(error instanceof Error ? error.message : "Could not start meeting recording.");
    }
  }

  function stopRecording() {
    stopSegmentRecorder();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  }

  async function startServerRecording() {
    setSaving(true);
    setError("");
    setNotice("");
    setSavedMeetingId("");
    setSavedAudioUrl("");
    try {
      const response = await fetch("/api/livekit-egress/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: room.name,
          title: meetingTitle
        })
      });
      const data = await readJsonResponse<{
        fileEgressId?: string;
        storageUrl?: string;
        recordingBase?: string;
        recordingStartedAt?: number;
        trackJobs?: TrackJob[];
        error?: string;
        hint?: string;
      }>(response);
      if (!response.ok) throw new Error(data.error ?? data.hint ?? "Server recording failed.");
      if (!data.fileEgressId || !data.storageUrl || !data.recordingBase || !data.recordingStartedAt) {
        throw new Error("Server recording did not return a recording id.");
      }
      setServerRecording({
        fileEgressId: data.fileEgressId,
        storageUrl: data.storageUrl,
        recordingBase: data.recordingBase,
        recordingStartedAt: data.recordingStartedAt,
        trackJobs: data.trackJobs ?? []
      });
      serverStartedAtRef.current = Date.now();
      setNotice("Server recording started. LiveKit Egress is recording each participant's audio separately (for accurate long-meeting transcription).");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not start server recording.");
    } finally {
      setSaving(false);
    }
  }

  async function waitForEgressComplete(fileEgressId: string, trackEgressIds: string[]) {
    const stopResponse = await fetch("/api/livekit-egress/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileEgressId, trackEgressIds })
    });
    type TrackResult = { egressId: string; status?: string; error?: string };
    const stopData = await readJsonResponse<{ recordingStatus?: string; trackResults?: TrackResult[]; error?: string }>(stopResponse);
    if (!stopResponse.ok) throw new Error(stopData.error ?? "Could not stop server recording.");
    if (stopData.recordingStatus === "complete") return stopData.trackResults ?? [];

    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      setNotice("Finalizing recording upload...");
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
      const query = new URLSearchParams({ fileEgressId });
      trackEgressIds.forEach((id) => query.append("trackEgressId", id));
      const statusResponse = await fetch(`/api/livekit-egress/status?${query.toString()}`);
      const statusData = await readJsonResponse<{ recordingStatus?: string; trackResults?: TrackResult[]; error?: string }>(statusResponse);
      if (!statusResponse.ok) throw new Error(statusData.error ?? "Server recording failed to finalize.");
      if (statusData.recordingStatus === "complete") return statusData.trackResults ?? [];
    }
    throw new Error("Server recording is taking too long to finalize. Please check back later.");
  }

  async function stopServerRecording() {
    if (!serverRecording) return;
    setSaving(true);
    setError("");
    try {
      const trackEgressIds = serverRecording.trackJobs.map((job) => job.egressId);
      const trackResults = await waitForEgressComplete(serverRecording.fileEgressId, trackEgressIds);

      const duration = Math.max(1, Math.round((Date.now() - serverStartedAtRef.current) / 1000));
      const saveResponse = await fetch("/api/call-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: meetingTitle,
          audioUrl: serverRecording.storageUrl,
          transcript: "",
          duration,
          speakerNames: getCurrentSpeakerNames()
        })
      });
      const saveJson = await readJsonResponse<{ meetingId?: string; error?: string; hint?: string }>(saveResponse);
      if (!saveResponse.ok) throw new Error(saveJson.error ?? saveJson.hint ?? "Save failed.");
      if (!saveJson.meetingId) throw new Error("Meeting was saved but no meeting id was returned.");
      setSavedMeetingId(saveJson.meetingId);
      setSavedAudioUrl(serverRecording.storageUrl);

      const readyJobs = serverRecording.trackJobs.filter(
        (job) => trackResults.find((result) => result.egressId === job.egressId)?.status === "complete"
      );

      if (readyJobs.length) {
        setNotice("Server recording saved to meeting history. Transcribing each speaker's audio — keep this tab open...");
        for (const job of readyJobs) {
          const segmentsResponse = await fetch(`/api/livekit-egress/segments?prefix=${encodeURIComponent(job.segmentsPrefix)}`);
          const segmentsJson = await readJsonResponse<{ segments?: string[] }>(segmentsResponse);
          if (segmentsResponse.ok) {
            await transcribeServerRecordingSegments(saveJson.meetingId, segmentsJson.segments ?? [], job);
          }
        }
        const mergeResponse = await fetch(`/api/meetings/${saveJson.meetingId}/merge-transcript`, { method: "POST" });
        const mergeJson = await readJsonResponse<{ merged?: boolean }>(mergeResponse);
        if (mergeResponse.ok && mergeJson.merged) {
          await fetch(`/api/meetings/${saveJson.meetingId}/finalize-summary`, { method: "POST" }).catch(() => undefined);
          setNotice("Server recording transcribed and saved to meeting history.");
        } else {
          setNotice("Recording saved, but no clear speech was found in any speaker's audio.");
        }
      } else {
        setNotice("Recording saved to meeting history. Automatic transcription segments were not available — you can transcribe manually from the meeting page.");
      }

      setServerRecording(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save server recording.");
    } finally {
      setSaving(false);
    }
  }

  async function transcribeServerRecordingSegments(meetingId: string, segments: string[], job: TrackJob) {
    if (!segments.length) return;

    let successfulChunks = 0;
    setTranscriptionProgress(`Transcribing ${job.name}: 0/${segments.length} segments...`);

    for (let index = 0; index < segments.length; index += 1) {
      setTranscriptionProgress(`Transcribing ${job.name}: ${index + 1}/${segments.length} segments...`);
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const response = await fetch(`/api/meetings/${meetingId}/transcribe-segment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              objectPath: segments[index],
              index: index + 1,
              languageMode: transcriptionLanguage,
              speakerIdentity: job.identity,
              speakerName: job.name,
              startOffsetMs: job.startOffsetMs
            })
          });
          const data = await readJsonResponse<{ transcript?: string }>(response);
          // A 2xx response (including "skipped: no usable speech") is final -
          // only a real request failure below is worth retrying, since the
          // same audio would just produce the same "no speech" result again.
          if (response.ok) {
            if (typeof data.transcript === "string" && data.transcript.trim()) successfulChunks += 1;
            break;
          }
        } catch {
          // Retry below.
        }
        if (attempt < maxAttempts) await new Promise((resolve) => window.setTimeout(resolve, 2000 * attempt));
      }
    }

    setTranscriptionProgress(`${job.name}: ${successfulChunks}/${segments.length} segments produced text.`);
  }

  async function saveRecording(mimeType: string) {
    setSaving(true);
    setError("");
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (!blob.size) throw new Error("No audio was recorded.");
      setLocalBackup(blob);
      const uploadData = new FormData();
      uploadData.append("audio", blob, mimeType.includes("mp4") ? "livekit-call.m4a" : "livekit-call.webm");
      const speakers = getCurrentSpeakerNames();
      uploadData.append("speakers", JSON.stringify(speakers));
      uploadData.append("languageMode", transcriptionLanguage);
      uploadData.append("skipTranscription", "true");
      const uploadResponse = await fetch("/api/uploads", { method: "POST", body: uploadData });
      const uploadJson = await readJsonResponse<{ transcript?: string; audioUrl?: string; speakerNames?: string[]; error?: string }>(uploadResponse);
      if (!uploadResponse.ok) {
        throw new Error(
          uploadJson.error ??
            (uploadResponse.status === 413
              ? "This recording is too large to upload. Download the local backup below, or record a shorter meeting."
              : "Audio upload failed.")
        );
      }

      const transcript = typeof uploadJson.transcript === "string" ? uploadJson.transcript : "";
      const audioUrl = typeof uploadJson.audioUrl === "string" ? uploadJson.audioUrl : "";
      const saveResponse = await fetch("/api/call-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: meetingTitle,
          audioUrl,
          transcript,
          duration: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
          speakerNames: Array.isArray(uploadJson.speakerNames) && uploadJson.speakerNames.length ? uploadJson.speakerNames : speakers
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-leaf">
            <Bot className="h-4 w-4" />
            Meeting Agent
          </p>
          <h2 className="mt-1 text-xl font-bold text-ink">ថតសំឡេង និងរក្សាទុកប្រជុំ HD</h2>
          <p className="mt-1 text-sm text-slate-500">
            ថត mixed audio ពី LiveKit room រួច upload, transcribe, summarize និងបង្កើត tasks/history។
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
          <span className={cn("kh-badge", recording ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600")}>
            {recording ? `Recording ${formatTime(seconds)}` : "Ready"}
          </span>
          {!recording ? (
            <button className="kh-button-primary" type="button" onClick={startRecording} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Start Agent
            </button>
          ) : (
            <button className="kh-button-secondary text-red-600" type="button" onClick={stopRecording}>
              <Square className="h-4 w-4" />
              Stop & Save
            </button>
          )}
          {!serverRecording ? (
            <button
              className="kh-button-secondary"
              type="button"
              onClick={startServerRecording}
              disabled={saving || recording}
              title="Audio-only server-side recording for long meetings (1-5+ hours)"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Server Rec (audio, long meetings)
            </button>
          ) : (
            <button className="kh-button-secondary text-red-600" type="button" onClick={stopServerRecording} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Stop Server Rec
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
