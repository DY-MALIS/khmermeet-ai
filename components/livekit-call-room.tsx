"use client";

import "@livekit/components-styles";
import {
  LiveKitRoom,
  VideoConference,
  useRoomContext,
  useTracks
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Bot, Camera, Copy, Download, Loader2, Mic, Phone, Save, Share2, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/components/ui";

type TokenPayload = {
  token: string;
  livekitUrl: string;
  room: string;
  identity: string;
  name: string;
};

const audioConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 }
};

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function readMeetingParams() {
  if (typeof window === "undefined") {
    return { hasInviteRoom: false, room: createRoomCode(), title: "" };
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

export function LiveKitCallRoom() {
  const initialMeeting = useMemo(() => readMeetingParams(), []);
  const [room, setRoom] = useState(initialMeeting.room);
  const [name, setName] = useState("Local User");
  const [title, setTitle] = useState(initialMeeting.title);
  const [isInviteGuest] = useState(initialMeeting.hasInviteRoom);
  const [cameraOn, setCameraOn] = useState(true);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [callMedia, setCallMedia] = useState({ audio: true, video: true });
  const [tokenPayload, setTokenPayload] = useState<TokenPayload | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("room")) {
      window.history.replaceState(null, "", `/meetings/call?room=${room}`);
    }
  }, [room]);

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
      const data = await response.json();
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
          audio={callMedia.audio ? audioConstraints : false}
          video={callMedia.video ? { facingMode: "user", resolution: { width: 1280, height: 720 } } : false}
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
          <div className="min-h-[70svh] bg-slate-950 md:min-h-[72vh]">
            <VideoConference />
          </div>
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
  const [savedMeetingId, setSavedMeetingId] = useState("");
  const [savedAudioUrl, setSavedAudioUrl] = useState("");
  const [localBackupUrl, setLocalBackupUrl] = useState("");
  const [serverRecording, setServerRecording] = useState<{ egressId: string; storageUrl: string } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const serverStartedAtRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);

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

  function startRecording() {
    setError("");
    setNotice("");
    setSavedMeetingId("");
    setSavedAudioUrl("");
    setLocalBackupUrl("");
    try {
      const mixedStream = buildMixedAudioStream();
      const mimeType = getRecorderMimeType();
      const recorder = new MediaRecorder(mixedStream, mimeType ? { mimeType, audioBitsPerSecond: 192000 } : { audioBitsPerSecond: 192000 });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => void saveRecording(mimeType || recorder.mimeType || "audio/webm");
      recorder.start(1000);
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? data.hint ?? "Server recording failed.");
      setServerRecording({ egressId: data.egressId, storageUrl: data.storageUrl });
      serverStartedAtRef.current = Date.now();
      setNotice("Server recording started. LiveKit Egress is recording the whole room to storage.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not start server recording.");
    } finally {
      setSaving(false);
    }
  }

  async function stopServerRecording() {
    if (!serverRecording) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/livekit-egress/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ egressId: serverRecording.egressId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not stop server recording.");

      const duration = Math.max(1, Math.round((Date.now() - serverStartedAtRef.current) / 1000));
      const saveResponse = await fetch("/api/call-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: meetingTitle,
          audioUrl: serverRecording.storageUrl,
          transcript: "",
          duration
        })
      });
      const saveJson = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saveJson.error ?? saveJson.hint ?? "Save failed.");
      setSavedMeetingId(saveJson.meetingId);
      setSavedAudioUrl(serverRecording.storageUrl);
      setNotice("Server recording stopped and saved to meeting history. Transcript still needs speech-to-text processing.");
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
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (!blob.size) throw new Error("No audio was recorded.");
      setLocalBackup(blob);
      const uploadData = new FormData();
      uploadData.append("audio", blob, mimeType.includes("mp4") ? "livekit-call.m4a" : "livekit-call.webm");
      uploadData.append("speakers", JSON.stringify([...room.remoteParticipants.values()].map((participant) => participant.name || participant.identity)));
      const uploadResponse = await fetch("/api/uploads", { method: "POST", body: uploadData });
      const uploadJson = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadJson.error ?? "Audio upload failed.");

      const transcript = typeof uploadJson.transcript === "string" ? uploadJson.transcript : "";
      const audioUrl = typeof uploadJson.audioUrl === "string" ? uploadJson.audioUrl : "";
      const saveResponse = await fetch("/api/call-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: meetingTitle,
          audioUrl,
          transcript,
          duration: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
        })
      });
      const saveJson = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saveJson.error ?? saveJson.hint ?? "Save failed.");
      setSavedMeetingId(saveJson.meetingId);
      setSavedAudioUrl(audioUrl);
      setNotice(transcript ? "បានរក្សាទុក audio, transcript, summary/tasks ទៅក្នុងប្រព័ន្ធ។" : "បានរក្សាទុក audio ទៅក្នុងប្រព័ន្ធ។ Transcript ត្រូវការ Gemini quota/key ដំណើរការ។");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save meeting recording.");
    } finally {
      cleanupRef.current?.();
      cleanupRef.current = null;
      setSaving(false);
    }
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            <button className="kh-button-secondary" type="button" onClick={startServerRecording} disabled={saving || recording}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Server Rec
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
