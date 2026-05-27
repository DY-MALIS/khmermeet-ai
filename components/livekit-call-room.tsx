"use client";

import "@livekit/components-styles";
import {
  LiveKitRoom,
  VideoConference,
  useRoomContext,
  useTracks
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Bot, Copy, Loader2, Phone, Save, Square } from "lucide-react";
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

export function LiveKitCallRoom() {
  const initialRoom = useMemo(() => {
    if (typeof window === "undefined") return createRoomCode();
    return new URLSearchParams(window.location.search).get("room") || createRoomCode();
  }, []);
  const [room, setRoom] = useState(initialRoom);
  const [name, setName] = useState("Local User");
  const [title, setTitle] = useState("");
  const [cameraOn, setCameraOn] = useState(true);
  const [tokenPayload, setTokenPayload] = useState<TokenPayload | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("room")) {
      window.history.replaceState(null, "", `/meetings/call?room=${room}`);
    }
  }, [room]);

  async function joinRoom() {
    setJoining(true);
    setError("");
    try {
      const response = await fetch("/api/livekit-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, name })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiError(data));
      setTokenPayload(data);
      window.history.replaceState(null, "", `/meetings/call?room=${data.room}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "មិនអាចចូល HD video call បានទេ។");
    } finally {
      setJoining(false);
    }
  }

  async function copyInvite() {
    const url = `${window.location.origin}/meetings/call?room=${room}`;
    await navigator.clipboard?.writeText(url).catch(() => undefined);
  }

  if (tokenPayload) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-sky/20 bg-sky/10 p-4 text-sm text-ink">
          HD mode ប្រើ LiveKit SFU ដើម្បីឲ្យអ្នកចូលរួមមើលមុខគ្នា និងនិយាយលឺគ្នាជាច្រើននាក់។ Room: <b>{tokenPayload.room}</b>
        </div>
        <LiveKitRoom
          token={tokenPayload.token}
          serverUrl={tokenPayload.livekitUrl}
          connect
          audio={audioConstraints}
          video={cameraOn ? { facingMode: "user", resolution: { width: 1280, height: 720 } } : false}
          onDisconnected={() => setTokenPayload(null)}
          onError={(error) => setError(error.message)}
          className="kh-card overflow-hidden p-0"
          data-lk-theme="default"
        >
          <div className="min-h-[72vh] bg-slate-950">
            <VideoConference />
          </div>
          <LiveKitMeetingAgent meetingTitle={title || `Video call ${tokenPayload.room}`} />
        </LiveKitRoom>
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="kh-card grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-semibold text-slate-600">ចំណងជើងប្រជុំ</span>
            <input className="kh-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="ឧ. ប្រជុំផែនការ Q2" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-slate-600">ឈ្មោះអ្នកចូលរួម</span>
            <input className="kh-input" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-slate-600">Room code</span>
            <div className="flex gap-2">
              <input className="kh-input uppercase" value={room} onChange={(event) => setRoom(event.target.value.toUpperCase())} />
              <button className="kh-button-secondary px-3" type="button" onClick={copyInvite} title="Copy invite">
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input checked={cameraOn} onChange={(event) => setCameraOn(event.target.checked)} type="checkbox" />
            បើកកាមេរ៉ាពេលចូល
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
      </div>
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setSeconds(Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

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

  async function saveRecording(mimeType: string) {
    setSaving(true);
    setError("");
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (!blob.size) throw new Error("No audio was recorded.");
      const uploadData = new FormData();
      uploadData.append("audio", blob, mimeType.includes("mp4") ? "livekit-call.m4a" : "livekit-call.webm");
      uploadData.append("speakers", JSON.stringify([...room.remoteParticipants.values()].map((participant) => participant.name || participant.identity)));
      const uploadResponse = await fetch("/api/uploads", { method: "POST", body: uploadData });
      const uploadJson = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadJson.error ?? "Audio upload failed.");

      const transcript = typeof uploadJson.transcript === "string" ? uploadJson.transcript : "";
      const saveResponse = await fetch("/api/call-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: meetingTitle,
          audioUrl: uploadJson.audioUrl,
          transcript,
          duration: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
        })
      });
      const saveJson = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saveJson.error ?? saveJson.hint ?? "Save failed.");
      setSavedMeetingId(saveJson.meetingId);
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
          {savedMeetingId ? <a className="kh-button-secondary" href={`/meetings/${savedMeetingId}`}>Open record</a> : null}
        </div>
      </div>
      {notice ? <div className="mt-4 rounded-lg bg-leaf/10 p-3 text-sm text-leaf">{notice}</div> : null}
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
    </section>
  );
}
