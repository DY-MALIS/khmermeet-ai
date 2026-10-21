"use client";

import "@livekit/components-styles";
import type { TrackReference } from "@livekit/components-core";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks
} from "@livekit/components-react";
import { createLocalAudioTrack, RoomEvent, Track } from "livekit-client";
import type { LocalAudioTrack, RemoteParticipant } from "livekit-client";
import { Bot, Camera, Copy, Download, Loader2, Mic, Moon, Phone, Save, Share2, Square, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { uploadRecordingDirect } from "@/lib/client/direct-upload";
import { clampMeetingDurationMs, clampMeetingDurationSeconds, MAX_MEETING_DURATION_MS } from "@/lib/meeting-duration";
import { readJsonResponse } from "@/lib/read-json-response";
import { describeAudioDevice, listAudioInputs, readSavedMicrophoneId, saveMicrophoneId } from "@/lib/audio-devices";
import { useBilingualText } from "@/lib/display-language";

type TokenPayload = {
  token: string;
  livekitUrl: string;
  room: string;
  identity: string;
  name: string;
  inviteToken?: string;
};

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

type MeetingParams = {
  hasInviteRoom: boolean;
  room: string;
  title: string;
};

type MeetingParamSetters = {
  setRoom: (value: string) => void;
  setTitle: (value: string) => void;
  setIsInviteGuest: (value: boolean) => void;
};

function readMeetingParams(): MeetingParams {
  if (typeof window === "undefined") {
    return { hasInviteRoom: false, room: "MEETING", title: "" };
  }

  const params = new URLSearchParams(window.location.search);
  const inviteRoom = params.get("room")?.trim().toUpperCase() ?? "";
  const inviteTitle = params.get("title")?.trim() ?? "";
  const savedRoom = localStorage.getItem("khmermeet-meeting-room")?.trim().toUpperCase() ?? "";
  const savedTitle = localStorage.getItem("khmermeet-meeting-title")?.trim() ?? "";
  return {
    hasInviteRoom: Boolean(inviteRoom),
    room: inviteRoom || savedRoom || createRoomCode(),
    title: inviteTitle || savedTitle
  };
}

function readInviteToken() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("invite")?.trim() ?? "";
}

// Prefers, in order: a name this browser already saved (an explicit choice
// this person made before, which should stick), then the signed-in
// account's real name (passed down from the server session - only available
// for a logged-in host, not a no-account guest), then genuinely empty - a
// no-account guest sees an empty field with a placeholder hint, not a
// pre-filled "Local User" that looks like a real (if odd) name and hides
// the fact that joinRoom() below now blocks on it.
function readSavedParticipantName(accountName?: string) {
  if (typeof window === "undefined") return accountName || "";
  return localStorage.getItem("khmermeet-participant-name")?.trim() || accountName || "";
}

function syncMeetingParams({ setRoom, setTitle, setIsInviteGuest }: MeetingParamSetters) {
  const nextMeeting = readMeetingParams();
  setRoom(nextMeeting.room);
  setTitle(nextMeeting.title);
  setIsInviteGuest(nextMeeting.hasInviteRoom);
  return nextMeeting;
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
  // Server-side transcription can compress/split later; capture should keep
  // enough detail for quiet or far-field voices to survive the first encode.
  return mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 };
}

const callAudioConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};

const callVideoConstraints = {
  resolution: { width: 640, height: 360, frameRate: 15 },
  frameRate: { ideal: 15, max: 20 }
};

function extractApiError(value: unknown, fallback: string) {
  if (value && typeof value === "object" && "error" in value && typeof value.error === "string") {
    return value.error;
  }
  return fallback;
}

async function checkMediaDeviceSupport(wantsCamera: boolean, wantsMicrophone: boolean, t: (km: string, en: string) => string) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(t("កម្មវិធីរុករកនេះមិនគាំទ្រកាមេរ៉ា ឬមីក្រូហ្វូនទេ។ សូមប្រើ Chrome, Edge, Firefox ឬ Safari តាម HTTPS។", "This browser does not support camera or microphone access. Use Chrome, Edge, Firefox, or Safari on HTTPS."));
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

function cleanParticipantIdentity(identity: string, fallback: string) {
  return identity
    .replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "")
    .replace(/-[0-9a-f]{12,}$/i, "")
    .replace(/-/g, " ")
    .trim() || fallback;
}

// Mirrors isPlaceholderParticipantName in lib/storage.ts (not imported
// directly - that module pulls in server-only code like ffmpeg/Prisma,
// too heavy for a client bundle). Used here to block joining on the
// anonymous-join placeholder itself, so it stops reaching the backend at
// all instead of only being cleaned up downstream in the transcript.
function isPlaceholderName(value: string) {
  const trimmed = value.trim().toLowerCase();
  return !trimmed || trimmed === "local user" || trimmed === "khmermeet user";
}

export function LiveKitCallRoom({ defaultName }: { defaultName?: string } = {}) {
  const t = useBilingualText();
  const [room, setRoom] = useState("MEETING");
  const [name, setName] = useState(defaultName || "");
  const [title, setTitle] = useState("");
  const [isInviteGuest, setIsInviteGuest] = useState(false);
  const [paramsReady, setParamsReady] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [callMedia, setCallMedia] = useState({ audio: true, video: true });
  const [tokenPayload, setTokenPayload] = useState<TokenPayload | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [nameMissing, setNameMissing] = useState(false);
  const manualLeaveRef = useRef(false);

  useEffect(() => {
    syncMeetingParams({ setRoom, setTitle, setIsInviteGuest });
    setName(readSavedParticipantName(defaultName));
    setParamsReady(true);
    // Only ever needs the account name once, on mount - it can't change
    // mid-session, and re-running this would stomp a name the person just
    // typed into the field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!paramsReady) return;
    if (!new URLSearchParams(window.location.search).get("room")) {
      window.history.replaceState(null, "", `/meetings/call?room=${room}`);
    }
  }, [paramsReady, room]);

  useEffect(() => {
    if (!tokenPayload) return;
    sessionStorage.setItem("khmermeet-active-call", "true");

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      const href = target.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || target.target === "_blank" || target.hasAttribute("download")) return;
      const nextUrl = new URL(target.href, window.location.href);
      if (nextUrl.href === window.location.href) return;

      window.alert(t("អ្នកកំពុងប្រជុំតាមវីដេអូ។ សូមប្រើវីដេអូខ្នាតតូច ឬផ្ទាំងកម្មវិធីរុករកថ្មីសម្រាប់ទំព័រផ្សេង។ ចុចចាកចេញមុនបិទការប្រជុំ។", "You are in a video call. Use Mini video or a new browser tab to visit another page. Select Leave before closing the call."));
      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      sessionStorage.removeItem("khmermeet-active-call");
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [tokenPayload, t]);

  function meetingTitle() {
    return title.trim() || `${t("ប្រជុំវីដេអូ", "Video call")} ${room}`;
  }

  function inviteLink(nextRoom = room) {
    const url = new URL(`${window.location.origin}/meetings/call`);
    url.searchParams.set("room", nextRoom);
    if (title.trim()) url.searchParams.set("title", title.trim());
    if (tokenPayload?.inviteToken) url.searchParams.set("invite", tokenPayload.inviteToken);
    return url.toString();
  }

  async function joinRoom() {
    if (!paramsReady) return;
    if (isPlaceholderName(name)) {
      setNameMissing(true);
      setError(t("សូមវាយឈ្មោះរបស់អ្នកជាមុនសិន មុនចូលរួមប្រជុំ។", "Enter your name before joining the call."));
      return;
    }
    setNameMissing(false);
    setJoining(true);
    setError("");
    setNotice("");
    try {
      const roomToJoin = room.trim().toUpperCase() || createRoomCode();
      const titleToSave = title.trim();
      setRoom(roomToJoin);
      localStorage.setItem("khmermeet-meeting-room", roomToJoin);
      if (titleToSave) localStorage.setItem("khmermeet-meeting-title", titleToSave);
      const participantName = name.trim();
      localStorage.setItem("khmermeet-participant-name", participantName);
      const media = await checkMediaDeviceSupport(cameraOn, microphoneOn, t);
      const nextCameraOn = cameraOn && media.hasCamera;
      const nextMicrophoneOn = microphoneOn && media.hasMicrophone;
      const notices: string[] = [];

      if (cameraOn && !media.hasCamera) {
        notices.push(t("រកមិនឃើញកាមេរ៉ា។ នឹងចូលដោយបិទកាមេរ៉ា។", "No camera was found. Joining without camera."));
      }
      if (microphoneOn && !media.hasMicrophone) {
        notices.push(t("រកមិនឃើញមីក្រូហ្វូន។ នឹងចូលស្តាប់ប៉ុណ្ណោះ។ ភ្ជាប់ ឬអនុញ្ញាតមីក្រូហ្វូន ប្រសិនបើចង់និយាយ។", "No microphone was found. Joining listen-only. Connect or allow a microphone if you want to speak."));
      }

      const response = await fetch("/api/livekit-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomToJoin, name: participantName, inviteToken: readInviteToken() })
      });
      const data = await readJsonResponse<TokenPayload & { error?: string }>(response);
      if (!response.ok) throw new Error(extractApiError(data, t("សំណើមិនជោគជ័យ។", "Request failed.")));
      setCameraOn(nextCameraOn);
      setMicrophoneOn(nextMicrophoneOn);
      setCallMedia({ audio: nextMicrophoneOn, video: nextCameraOn });
      setTokenPayload(data);
      if (notices.length) setNotice(notices.join(" "));
      window.history.replaceState(null, "", inviteLink(data.room));
    } catch (error) {
      setError(error instanceof Error ? error.message : t("មិនអាចចូលប្រជុំវីដេអូ HD បានទេ។", "Could not join the HD video call."));
    } finally {
      setJoining(false);
    }
  }

  async function copyInvite() {
    const url = inviteLink();
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setNotice(t("បានចម្លងតំណអញ្ជើញ។ អ្នកចូលរួមអាចវាយឈ្មោះ រួចចូលរួមបាន។", "Invite link copied. Participants can enter their names and join."));
  }

  async function shareInvite() {
    const url = inviteLink();
    if (navigator.share) {
      await navigator.share({
        title: meetingTitle(),
        text: `${t("ចូលរួមប្រជុំ KhmerMeet AI៖", "Join KhmerMeet AI meeting:")} ${meetingTitle()}`,
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
          {t("របៀប HD ប្រើ LiveKit SFU សម្រាប់ប្រជុំក្រុមធំ។", "HD mode uses LiveKit SFU for large group calls.")} {t("ប្រជុំ", "Meeting")}: <b>{meetingTitle()}</b> · {t("បន្ទប់", "Room")}: <b>{tokenPayload.room}</b>
        </div>
        {notice ? <div className="rounded-lg bg-leaf/10 p-3 text-sm text-leaf">{notice}</div> : null}
        <div className="kh-card flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-600">{t("អញ្ជើញអ្នកចូលរួម", "Invite participants")}</p>
            <p className="text-sm text-slate-500">
              {t("ចែករំលែកតំណនេះ ដើម្បីឱ្យអ្នកដទៃចូលរួម", "Share this link so others can join")} <span className="font-semibold text-ink">{meetingTitle()}</span>. {t("ពួកគេគ្រាន់តែវាយឈ្មោះ។", "They only need to enter their names.")}
            </p>
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <button className="kh-button-secondary" type="button" onClick={copyInvite}>
              <Copy className="h-4 w-4" />
              {t("ចម្លងតំណ", "Copy link")}
            </button>
            <button className="kh-button-primary" type="button" onClick={shareInvite}>
              <Share2 className="h-4 w-4" />
              {t("ចែករំលែកការអញ្ជើញ", "Share invite")}
            </button>
          </div>
        </div>
        <LiveKitRoom
          token={tokenPayload.token}
          serverUrl={tokenPayload.livekitUrl}
          connect
          options={{
            adaptiveStream: true,
            dynacast: true
          }}
          audio={callMedia.audio ? callAudioConstraints : false}
          video={callMedia.video ? callVideoConstraints : false}
          onDisconnected={(reason) => {
            if (manualLeaveRef.current) {
              manualLeaveRef.current = false;
              setTokenPayload(null);
              return;
            }
            setError(`${t("ការហៅត្រូវបានផ្ដាច់ដោយមិនរំពឹងទុក", "Call disconnected unexpectedly")}${reason ? ` (${reason})` : ""}. ${t("សូមពិនិត្យអ៊ីនធឺណិត រួចចូលម្ដងទៀត បើសំឡេង ឬវីដេអូឈប់ដំណើរការ។", "Check your connection, then rejoin if audio or video stopped.")}`);
          }}
          onMediaDeviceFailure={(failure, kind) => {
            setError(`${t("មិនអាចបើកឧបករណ៍", "Could not open device")} ${kind ?? "media"}${failure ? ` (${failure})` : ""}. ${t("សូមពិនិត្យសិទ្ធិកាមេរ៉ា និងមីក្រូហ្វូន រួចចូលម្ដងទៀត។", "Check camera and microphone permissions, then rejoin.")}`);
          }}
          onError={(error) => {
            const message = error.message || t("មិនអាចភ្ជាប់កាមេរ៉ា ឬមីក្រូហ្វូនបានទេ។", "Could not connect the camera or microphone.");
            if (/camera|video|device|permission/i.test(message) && callMedia.video) {
              setCameraOn(false);
              setCallMedia((current) => ({ ...current, video: false }));
              setTokenPayload(null);
              setError(`${message} ${t("សូមចូលម្ដងទៀតដោយបិទកាមេរ៉ា ដើម្បីប្រើតែសំឡេង។", "Rejoin with the camera off to use audio only.")}`);
              return;
            }
            if (/microphone|audio|device|permission/i.test(message) && callMedia.audio) {
              setMicrophoneOn(false);
              setCallMedia((current) => ({ ...current, audio: false }));
              setTokenPayload(null);
              setError(`${message} ${t("សូមចូលម្ដងទៀតដោយបិទមីក្រូហ្វូនដើម្បីស្តាប់ប៉ុណ្ណោះ ឬអនុញ្ញាតមីក្រូហ្វូនដើម្បីនិយាយ។", "Rejoin with the microphone off to listen only, or allow the microphone to speak.")}`);
              return;
            }
            setError(message);
          }}
          className="kh-card overflow-hidden p-0"
          data-lk-theme="default"
        >
          <LiveKitOneScreenConference onLeaveRequest={() => { manualLeaveRef.current = true; }} />
          <LiveKitMeetingAgent
            meetingTitle={meetingTitle()}
            participantName={tokenPayload.name}
            recordingRoom={tokenPayload.room}
            inviteToken={tokenPayload.inviteToken ?? ""}
          />
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
              <p className="text-sm font-semibold text-leaf">{t("អ្នកត្រូវបានអញ្ជើញចូលប្រជុំ", "You are invited to a meeting")}</p>
              <h2 className="text-xl font-bold text-ink">{meetingTitle()}</h2>
              <p className="text-sm text-slate-500">{t("លេខកូដបន្ទប់មានក្នុងតំណអញ្ជើញរួចហើយ។ សូមវាយឈ្មោះរបស់អ្នក រួចចុចចូលប្រជុំវីដេអូ HD។", "The room code is already in the invite link. Enter your name, then select Join HD Video Call.")}</p>
            </div>
          ) : (
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-semibold text-slate-600">{t("ចំណងជើងប្រជុំ", "Meeting title")}</span>
              <input className="kh-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("ឧ. ប្រជុំផែនការ Q2", "Example: Q2 planning meeting")} />
            </label>
          )}
          <label className="space-y-1">
            <span className="text-sm font-semibold text-slate-600">{t("ឈ្មោះអ្នកចូលរួម", "Participant name")}</span>
            <input
              className={`kh-input ${nameMissing ? "border-red-400 focus:border-red-500 focus:ring-red-100" : ""}`}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (nameMissing && !isPlaceholderName(event.target.value)) setNameMissing(false);
              }}
              placeholder={t("វាយឈ្មោះរបស់អ្នក", "Enter your name")}
            />
            {nameMissing ? <p className="text-xs font-semibold text-red-600">{t("សូមបំពេញឈ្មោះរបស់អ្នកជាមុនសិន។", "Enter your name first.")}</p> : null}
          </label>
          {isInviteGuest ? (
            <div className="space-y-1">
              <span className="text-sm font-semibold text-slate-600">{t("លេខកូដបន្ទប់", "Room code")}</span>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-600">{room}</div>
            </div>
          ) : (
            <label className="space-y-1">
              <span className="text-sm font-semibold text-slate-600">{t("លេខកូដបន្ទប់", "Room code")}</span>
              <div className="flex gap-2">
                <input className="kh-input min-w-0 uppercase" value={room} onChange={(event) => setRoom(event.target.value.toUpperCase())} />
                <button className="kh-button-secondary shrink-0 px-3" type="button" onClick={copyInvite} title={t("ចម្លងតំណអញ្ជើញ", "Copy invite link")}>
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500">{t("អ្នកបង្កើតប្រជុំបំពេញចំណងជើង និងលេខកូដបន្ទប់ជាមុន។ តំណអញ្ជើញនឹងមានព័ត៌មានទាំងនេះ។", "The host enters the title and room code first. The invite link includes both.")}</p>
            </label>
          )}
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input checked={cameraOn} onChange={(event) => setCameraOn(event.target.checked)} type="checkbox" />
            <Camera className="h-4 w-4 text-slate-500" />
            {t("បើកកាមេរ៉ាពេលចូល (សម្រាប់ 100 នាក់ សូមទុកបិទជាមុន)", "Turn on camera when joining (keep it off initially for large calls)")}
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input checked={microphoneOn} onChange={(event) => setMicrophoneOn(event.target.checked)} type="checkbox" />
            <Mic className="h-4 w-4 text-slate-500" />
            {t("បើកមីក្រូហ្វូនពេលចូល", "Turn on microphone when joining")}
          </label>
        </div>
        <button className="kh-button-primary w-full lg:w-auto" type="button" onClick={joinRoom} disabled={joining || !paramsReady}>
          {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
          {paramsReady ? t("ចូលប្រជុំវីដេអូ HD", "Join HD Video Call") : t("កំពុងរៀបចំការហៅ...", "Preparing call...")}
        </button>
      </div>
      <div className="rounded-lg border border-sky/20 bg-sky/10 p-4 text-sm leading-7 text-ink">
        {t("របៀប LiveKit គាំទ្រប្រជុំសំឡេង និងវីដេអូជាក្រុម ការចែករំលែកអេក្រង់ និងការជជែក។ សម្រាប់ក្រុមធំ សូមប្រើសំឡេងជាចម្បង ហើយបើកកាមេរ៉ាតែពេលត្រូវនិយាយ ឬបង្ហាញ។ ប្រសិនបើគ្មានកាមេរ៉ា អ្នកអាចចូលដោយបិទវា។ បើកកាមេរ៉ាមិនបាន សូមពិនិត្យសិទ្ធិកាមេរ៉ាក្នុងកម្មវិធីរុករក។", "LiveKit supports group audio and video, screen sharing, and chat. For large calls, use audio first and turn on cameras only when speaking or presenting. You can join without a camera. If a camera does not work, check your browser permissions.")}
      </div>
      {notice ? <div className="rounded-lg bg-leaf/10 p-3 text-sm text-leaf">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
    </div>
  );
}

function LiveKitOneScreenConference({ onLeaveRequest }: { onLeaveRequest: () => void }) {
  const t = useBilingualText();
  const participants = useParticipants();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  );
  // Joining is not capped by this UI, but rendering unlimited live video
  // tiles at once would overwhelm browsers in large meetings. The room can
  // have many audio participants; the grid only shows the first 20 videos.
  const visibleTracks = tracks.slice(0, 20);
  const grid = getCallGridMetrics(visibleTracks.length);

  return (
    <section className="bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-xs font-semibold text-white/70">
        <span>
          {t("អ្នកចូលរួម", "Participants")} {participants.length} · {t("កំពុងបង្ហាញវីដេអូ", "Showing video")} {visibleTracks.length}/{tracks.length}
        </span>
        <span>{t("ទិដ្ឋភាពក្រឡាក្នុងអេក្រង់តែមួយ", "Single-screen grid view")}</span>
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
            const participantName = trackRef.participant.name || trackRef.participant.identity || t("អ្នកចូលរួម", "Participant");
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
                    <span className="text-sm font-semibold">{t("កាមេរ៉ាបិទ", "Camera off")}</span>
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
      <LiveKitCallControls onLeaveRequest={onLeaveRequest} />
    </section>
  );
}

function LiveKitCallControls({ onLeaveRequest }: { onLeaveRequest: () => void }) {
  const t = useBilingualText();
  const room = useRoomContext();
  const {
    isCameraEnabled,
    isMicrophoneEnabled,
    isScreenShareEnabled,
    localParticipant
  } = useLocalParticipant();
  const [busyControl, setBusyControl] = useState<"mic" | "camera" | "repair-mic" | "screen" | "audio" | "mini" | "leave" | "">("");
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [micNotice, setMicNotice] = useState("");
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  // Starts from the microphone chosen anywhere in the app, so someone who
  // picked their Bluetooth headset in the recorder does not have to pick it
  // again before a call.
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [micTrackState, setMicTrackState] = useState("");
  const manualMicTrackRef = useRef<LocalAudioTrack | null>(null);

  useEffect(() => {
    const saved = readSavedMicrophoneId();
    if (saved) setSelectedAudioDeviceId(saved);
    void loadAudioDevices();
    // Pairing a Bluetooth headset mid-call should make it selectable right
    // away, not only when the picker happens to be opened again.
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const onDeviceChange = () => void loadAudioDevices();
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, []);

  useEffect(() => {
    return () => {
      manualMicTrackRef.current?.stop();
      manualMicTrackRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    let audioContext: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    async function monitorMicrophone() {
      const publication = localParticipant.getTrackPublication(Track.Source.Microphone);
      const mediaTrack = publication?.track?.mediaStreamTrack ?? null;
      if (!mediaTrack || mediaTrack.readyState !== "live") {
        setMicLevel(0);
        setMicTrackState(isMicrophoneEnabled ? t("មីក្រូហ្វូនបើក ប៉ុន្តែគ្មានសំឡេងពីកម្មវិធីរុករក", "Mic is on, but no live browser track") : t("មីក្រូហ្វូនបិទ", "Mic is off"));
        return;
      }

      setMicTrackState(publication?.isMuted ? t("មីក្រូហ្វូនមាន ប៉ុន្តែត្រូវបានបិទសំឡេង", "Mic track exists but is muted") : t("មីក្រូហ្វូនកំពុងដំណើរការ", "Mic track live"));
      audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source = audioContext.createMediaStreamSource(new MediaStream([mediaTrack]));
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);

      const tick = () => {
        if (cancelled) return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const value = sample - 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / samples.length);
        setMicLevel(Math.min(100, Math.round(rms * 4)));
        frameId = window.requestAnimationFrame(tick);
      };

      tick();
    }

    void monitorMicrophone();

    return () => {
      cancelled = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      source?.disconnect();
      if (audioContext) void audioContext.close().catch(() => undefined);
    };
  }, [isMicrophoneEnabled, localParticipant, selectedAudioDeviceId, busyControl, t]);

  function microphoneOptions(): MediaTrackConstraints {
    return selectedAudioDeviceId
      ? { ...callAudioConstraints, deviceId: { exact: selectedAudioDeviceId } }
      : callAudioConstraints;
  }

  async function loadAudioDevices() {
    const inputs = await listAudioInputs();
    setAudioDevices(inputs);
    // A remembered microphone that is no longer connected must fall back to
    // the default, or publishing fails on an exact deviceId nothing matches.
    setSelectedAudioDeviceId((current) =>
      current && !inputs.some((device) => device.deviceId === current) ? "" : current
    );
  }

  async function measureTrackLevel(mediaTrack: MediaStreamTrack, durationMs = 900) {
    const AudioContextConstructor = window.AudioContext;
    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    const source = audioContext.createMediaStreamSource(new MediaStream([mediaTrack]));
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let maxLevel = 0;
    const startedAt = performance.now();

    return new Promise<number>((resolve) => {
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const value = sample - 128;
          sum += value * value;
        }
        maxLevel = Math.max(maxLevel, Math.min(100, Math.round(Math.sqrt(sum / samples.length) * 4)));

        if (performance.now() - startedAt >= durationMs) {
          source.disconnect();
          void audioContext.close().catch(() => undefined);
          resolve(maxLevel);
          return;
        }

        window.requestAnimationFrame(tick);
      };

      tick();
    });
  }

  async function publishManualMicrophoneFallback() {
    const currentPublication = localParticipant.getTrackPublication(Track.Source.Microphone);
    if (currentPublication?.track) {
      await localParticipant.unpublishTrack(currentPublication.track, true).catch(() => undefined);
    }

    manualMicTrackRef.current?.stop();
    manualMicTrackRef.current = null;

    const track = await createLocalAudioTrack(microphoneOptions());
    const level = await measureTrackLevel(track.mediaStreamTrack);
    if (level <= 1) {
      track.stop();
      throw new Error(t("កម្មវិធីរុករកបានបើកមីក្រូហ្វូន ប៉ុន្តែកម្រិតសំឡេងនៅ 0%។ សូមពិនិត្យឧបករណ៍ ឬការកំណត់សំឡេង។", "The browser opened the microphone, but its signal is 0%. Check the device and audio settings."));
    }

    await localParticipant.publishTrack(track, {
      source: Track.Source.Microphone,
      name: "microphone"
    });
    manualMicTrackRef.current = track;
    setMicLevel(level);
    setMicTrackState(t("មីក្រូហ្វូនបម្រុងកំពុងដំណើរការ", "Manual mic track live"));
  }

  async function runControl(name: "mic" | "camera" | "repair-mic" | "screen" | "audio" | "mini" | "leave", action: () => Promise<unknown>) {
    if (busyControl) return;
    setBusyControl(name);
    try {
      await action();
      setMicNotice("");
    } catch (error) {
      setMicNotice(error instanceof Error ? error.message : t("មិនអាចបើកមីក្រូហ្វូនបានទេ។", "Could not open the microphone."));
    } finally {
      setBusyControl("");
    }
  }

  async function unlockSpeakerAudio() {
    const audioElements = Array.from(document.querySelectorAll("audio"));
    await Promise.all(audioElements.map((element) => element.play().catch(() => undefined)));
    setAudioUnlocked(true);
  }

  async function repairMicrophone() {
    setMicNotice(t("កំពុងចាប់ផ្ដើមមីក្រូហ្វូនឡើងវិញ...", "Restarting microphone..."));
    await localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    const publication = await localParticipant.setMicrophoneEnabled(true, microphoneOptions());
    const mediaTrack = publication?.track?.mediaStreamTrack;
    if (!mediaTrack || mediaTrack.readyState !== "live") {
      setMicNotice(t("មីក្រូហ្វូន LiveKit មិនដំណើរការ។ កំពុងសាកមីក្រូហ្វូនបម្រុង...", "LiveKit microphone is not live. Trying a backup microphone..."));
      await publishManualMicrophoneFallback();
      await loadAudioDevices();
      setMicNotice(t("បានភ្ជាប់មីក្រូហ្វូនបម្រុង។ សូមសាកនិយាយម្ដងទៀត។", "Backup microphone connected. Try speaking again."));
      return;
    }

    const level = await measureTrackLevel(mediaTrack);
    if (level <= 1) {
      setMicNotice(t("មីក្រូហ្វូន LiveKit នៅស្ងាត់។ កំពុងសាកមីក្រូហ្វូនបម្រុង...", "LiveKit microphone is silent. Trying a backup microphone..."));
      await publishManualMicrophoneFallback();
      await loadAudioDevices();
      setMicNotice(t("បានភ្ជាប់មីក្រូហ្វូនបម្រុង។ សូមសាកនិយាយម្ដងទៀត។", "Backup microphone connected. Try speaking again."));
      return;
    }

    manualMicTrackRef.current?.stop();
    manualMicTrackRef.current = null;
    setMicLevel(level);
    await loadAudioDevices();
    setMicNotice(t("បានភ្ជាប់មីក្រូហ្វូនឡើងវិញ។ សូមសាកនិយាយម្ដងទៀត។", "Microphone reconnected. Try speaking again."));
  }

  async function openMiniVideo() {
    if (!document.pictureInPictureEnabled) {
      throw new Error(t("កម្មវិធីរុករកនេះមិនគាំទ្រវីដេអូខ្នាតតូចទេ។ សូមប្រើ Chrome ឬ Edge ជំនាន់ថ្មី។", "This browser does not support Mini video. Use a current version of Chrome or Edge."));
    }

    const videos = Array.from(document.querySelectorAll<HTMLVideoElement>(".kh-livekit-stage video"));
    const activeVideo = videos.find((video) => video.readyState >= 2 && !video.paused) ?? videos.find((video) => video.readyState >= 2);
    if (!activeVideo) {
      throw new Error(t("មិនទាន់មានវីដេអូសម្រាប់បង្ហាញខ្នាតតូចទេ។ សូមបើកកាមេរ៉ា ឬរង់ចាំអ្នកចូលរួមផ្សេងបើកកាមេរ៉ា។", "No video is available for Mini video yet. Turn on your camera or wait for another participant to do so."));
    }

    if (document.pictureInPictureElement === activeVideo) {
      await document.exitPictureInPicture();
      return;
    }

    await activeVideo.requestPictureInPicture();
    setMicNotice(t("បានបើកវីដេអូខ្នាតតូច។ អ្នកអាចប្ដូរទៅផ្ទាំងកម្មវិធីរុករកផ្សេង ខណៈការប្រជុំនៅបន្ត។", "Mini video is open. You can switch browser tabs while the call continues."));
  }

  async function toggleMicrophone() {
    if (isMicrophoneEnabled) {
      await localParticipant.setMicrophoneEnabled(false);
      manualMicTrackRef.current?.stop();
      manualMicTrackRef.current = null;
      setMicLevel(0);
      setMicNotice(t("បានបិទមីក្រូហ្វូន។", "Microphone turned off."));
      return;
    }

    await repairMicrophone();
  }

  return (
    <div className="border-t border-white/10 bg-slate-950 px-2 py-3 text-sm font-semibold">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          className={cn("rounded-lg px-4 py-2 text-white", isMicrophoneEnabled ? "bg-white/10" : "bg-red-500/80")}
          type="button"
          disabled={Boolean(busyControl)}
          onClick={() => runControl("mic", toggleMicrophone)}
        >
          <Mic className="mr-2 inline h-4 w-4" />
          {isMicrophoneEnabled ? t("មីក្រូហ្វូន", "Microphone") : t("បើកមីក្រូហ្វូន", "Turn on microphone")}
        </button>
        <button
          className={cn("rounded-lg px-4 py-2 text-white", isCameraEnabled ? "bg-white/10" : "bg-red-500/80")}
          type="button"
          disabled={Boolean(busyControl)}
          onClick={() => runControl("camera", () => localParticipant.setCameraEnabled(!isCameraEnabled))}
        >
          <Camera className="mr-2 inline h-4 w-4" />
          {isCameraEnabled ? t("កាមេរ៉ា", "Camera") : t("បើកកាមេរ៉ា", "Turn on camera")}
        </button>
        <button
          className={cn("rounded-lg px-4 py-2 text-white", isScreenShareEnabled ? "bg-leaf" : "bg-white/10")}
          type="button"
          disabled={Boolean(busyControl)}
          onClick={() => runControl("screen", () => localParticipant.setScreenShareEnabled(!isScreenShareEnabled))}
        >
          <Share2 className="mr-2 inline h-4 w-4" />
          {isScreenShareEnabled ? t("បញ្ឈប់ការចែករំលែក", "Stop sharing") : t("ចែករំលែកអេក្រង់", "Share screen")}
        </button>
        <button
          className="rounded-lg bg-white/10 px-4 py-2 text-white"
          type="button"
          disabled={Boolean(busyControl)}
          onClick={() => runControl("mini", openMiniVideo)}
          title={t("បង្ហាញវីដេអូប្រជុំក្នុងបង្អួចតូច ពេលប្ដូរផ្ទាំងកម្មវិធីរុករក។", "Show the call video in a small floating window when switching browser tabs.")}
        >
          {busyControl === "mini" ? t("កំពុងបើក...", "Opening...") : t("វីដេអូខ្នាតតូច", "Mini video")}
        </button>
        <button
          className="rounded-lg border border-red-400/60 px-4 py-2 text-red-200"
          type="button"
          disabled={Boolean(busyControl)}
          onClick={() => runControl("leave", async () => {
            onLeaveRequest();
            room.disconnect();
          })}
        >
          <Phone className="mr-2 inline h-4 w-4" />
          {t("ចាកចេញ", "Leave")}
        </button>
      </div>

      <details className="mx-auto mt-3 max-w-2xl text-xs text-white/70">
        <summary className="cursor-pointer list-none text-center font-semibold text-white/70">
          {t("ការកំណត់មីក្រូហ្វូន", "Mic settings")}
        </summary>
        <div className="mt-3 grid gap-2 rounded-lg border border-white/10 bg-white/5 p-3 sm:grid-cols-[1fr_auto_auto]">
          <select
            className="h-10 min-w-0 rounded-lg border border-white/10 bg-slate-900 px-3 text-sm text-white"
            value={selectedAudioDeviceId}
            onChange={(event) => {
              setSelectedAudioDeviceId(event.target.value);
              saveMicrophoneId(event.target.value);
              setMicNotice(t("បានជ្រើសមីក្រូហ្វូន។ សូមចុចជួសជុលមីក្រូហ្វូន ដើម្បីប្រើឧបករណ៍ថ្មី។", "Microphone selected. Select Repair mic to use the new device."));
            }}
            onFocus={() => void loadAudioDevices()}
            title={t("ជ្រើសមីក្រូហ្វូនសម្រាប់ការប្រជុំនេះ។", "Choose the microphone used by this call.")}
          >
            <option value="">{t("មីក្រូហ្វូនលំនាំដើម", "Default microphone")}</option>
            {audioDevices.map((device, index) => (
              <option key={device.deviceId || index} value={device.deviceId}>
                {describeAudioDevice(device, index)}
              </option>
            ))}
          </select>
          <button
            className="h-10 rounded-lg bg-white/10 px-4 py-2 text-white"
            type="button"
            disabled={Boolean(busyControl)}
            onClick={() => runControl("repair-mic", repairMicrophone)}
            title={t("ប្រើពេលអ្នកស្តាប់ឮអ្នកដទៃ ប៉ុន្តែពួកគេមិនឮអ្នក។", "Use this when you can hear others, but they cannot hear you.")}
          >
            {busyControl === "repair-mic" ? t("កំពុងជួសជុល...", "Repairing...") : t("ជួសជុលមីក្រូហ្វូន", "Repair mic")}
          </button>
          <button
            className={cn("h-10 rounded-lg px-4 py-2 text-white", audioUnlocked ? "bg-leaf" : "bg-white/10")}
            type="button"
            disabled={Boolean(busyControl)}
            onClick={() => runControl("audio", unlockSpeakerAudio)}
            title={t("ចុចម្ដង បើអ្នកមើលឃើញអ្នកចូលរួម ប៉ុន្តែមិនឮសំឡេងពួកគេ។", "Select once if you can see participants but cannot hear their voices.")}
          >
            {audioUnlocked ? t("សំឡេងបើកហើយ", "Audio enabled") : t("បើកសំឡេង", "Enable audio")}
          </button>
        </div>
        <div className="mx-auto mt-3 flex max-w-xl items-center gap-3">
          <span className="shrink-0 font-semibold">{t("កម្រិតមីក្រូហ្វូន", "Mic signal")}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn("h-full rounded-full transition-all", micLevel > 8 ? "bg-leaf" : "bg-saffron")}
              style={{ width: `${micLevel}%` }}
            />
          </div>
          <span className="w-14 text-right">{micLevel}%</span>
        </div>
        <p className="mt-1 text-center text-white/50">{micTrackState}</p>
      </details>
      {micNotice ? <p className="mt-2 text-center text-xs text-white/70">{micNotice}</p> : null}
    </div>
  );
}

type LiveRecordingSignal =
  | { type: "khmermeet-participant-name"; identity: string; name: string }
  | { type: "khmermeet-participant-name-request" }
  | {
      type: "khmermeet-record-start";
      meetingId: string;
      languageMode: "km" | "en" | "km-en";
      recordingStartedAt: number;
    }
  | { type: "khmermeet-record-stop"; meetingId: string };

type EgressTrackJob = {
  egressId: string;
  identity: string;
  name: string;
  segmentsPrefix: string;
  startOffsetMs: number;
};

type EgressRecording = {
  meetingId: string;
  fileEgressId: string;
  storageUrl: string;
  recordingBase: string;
  recordingStartedAt: number;
  segmentDurationMs: number;
  trackJobs: EgressTrackJob[];
};

function LiveKitMeetingAgent({
  meetingTitle,
  participantName,
  recordingRoom,
  inviteToken
}: {
  meetingTitle: string;
  participantName: string;
  recordingRoom: string;
  inviteToken: string;
}) {
  const t = useBilingualText();
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
  const [, setAnnouncedSpeakerNames] = useState<Record<string, string>>({});
  const announcedSpeakerNamesRef = useRef<Record<string, string>>({});
  // One-click Server Rec: every participant records their own microphone
  // locally, then the host also keeps one mixed backup in case a participant
  // closes their tab before their track upload finishes.
  const [serverRecording, setServerRecording] = useState<{ meetingId: string; recordingStartedAt: number } | null>(null);
  const [egressRecording, setEgressRecording] = useState<EgressRecording | null>(null);
  // True on participants who received the start signal but weren't the one
  // who clicked the button - shown as a passive "recording" indicator only,
  // they have no controls of their own.
  const [remoteRecordingActive, setRemoteRecordingActive] = useState(false);
  const [quietScreenActive, setQuietScreenActive] = useState(false);
  const isAnyRecordingActive = recording || Boolean(serverRecording) || Boolean(egressRecording) || remoteRecordingActive;
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
  const egressRecordingRef = useRef(egressRecording);
  useEffect(() => {
    egressRecordingRef.current = egressRecording;
  }, [egressRecording]);
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
  const pendingLocalRecordingRef = useRef<{
    meetingId: string;
    languageMode: "km" | "en" | "km-en";
    recordingStartedAt: number;
    requestId: number;
  } | null>(null);
  const serverMixedRecorderRef = useRef<MediaRecorder | null>(null);
  const serverMixedChunksRef = useRef<Blob[]>([]);
  const serverMixedMimeTypeRef = useRef("audio/webm");

  useEffect(() => {
    if (!recording && !serverRecording && !egressRecording) return;
    const startedAt = egressRecording?.recordingStartedAt ?? serverRecording?.recordingStartedAt ?? startedAtRef.current;
    const timer = window.setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      setSeconds(clampMeetingDurationSeconds(Math.floor(elapsedMs / 1000)));
      if (elapsedMs >= MAX_MEETING_DURATION_MS) {
        if (egressRecording || serverRecording) void stopServerRecording();
        else if (recording) stopRecording();
      }
    }, 250);
    return () => window.clearInterval(timer);
    // The timer should only restart when recording mode changes; stop
    // handlers read the latest refs/state they need when invoked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, serverRecording, egressRecording]);

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
    if (!recording && !serverRecording && !pendingLocalRecordingRef.current) return;

    function handleAudioTrackReady() {
      window.setTimeout(() => {
        connectAvailableAudioTracks();
        void tryStartPendingLocalTrackRecording();
      }, 0);
    }

    room.on(RoomEvent.TrackSubscribed, handleAudioTrackReady);
    room.on(RoomEvent.TrackUnmuted, handleAudioTrackReady);
    room.on(RoomEvent.LocalTrackPublished, handleAudioTrackReady);
    room.on(RoomEvent.LocalTrackSubscribed, handleAudioTrackReady);
    return () => {
      room.off(RoomEvent.TrackSubscribed, handleAudioTrackReady);
      room.off(RoomEvent.TrackUnmuted, handleAudioTrackReady);
      room.off(RoomEvent.LocalTrackPublished, handleAudioTrackReady);
      room.off(RoomEvent.LocalTrackSubscribed, handleAudioTrackReady);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, audioTracks, recording, serverRecording]);

  useEffect(() => {
    return () => {
      if (localBackupUrl) URL.revokeObjectURL(localBackupUrl);
    };
  }, [localBackupUrl]);

  useEffect(() => {
    if (isAnyRecordingActive) return;
    setQuietScreenActive(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [isAnyRecordingActive]);

  useEffect(() => {
    const syncQuietScreen = () => {
      if (!document.fullscreenElement) setQuietScreenActive(false);
    };
    document.addEventListener("fullscreenchange", syncQuietScreen);
    return () => document.removeEventListener("fullscreenchange", syncQuietScreen);
  }, []);

  async function enterQuietScreen() {
    setQuietScreenActive(true);
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // The black overlay still reduces light when fullscreen is unavailable.
    }
  }

  async function exitQuietScreen() {
    setQuietScreenActive(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  }

  function rememberSpeakerName(identity: string, name: string) {
    const cleanIdentity = identity.trim();
    const cleanName = name.trim();
    if (!cleanIdentity || !cleanName) return;
    announcedSpeakerNamesRef.current = { ...announcedSpeakerNamesRef.current, [cleanIdentity]: cleanName };
    setAnnouncedSpeakerNames(announcedSpeakerNamesRef.current);
  }

  useEffect(() => {
    const identity = room.localParticipant.identity;
    const displayName = participantName.trim() || room.localParticipant.name || cleanParticipantIdentity(identity, t("អ្នកចូលរួម", "Participant"));
    rememberSpeakerName(identity, displayName);

    function announceName() {
      const signal: LiveRecordingSignal = {
        type: "khmermeet-participant-name",
        identity,
        name: displayName
      };
      room.localParticipant
        .publishData(new TextEncoder().encode(JSON.stringify(signal)), { reliable: true })
        .catch(() => undefined);
    }

    announceName();
    const timer = window.setInterval(announceName, 3000);
    const stopTimer = window.setTimeout(() => window.clearInterval(timer), 30000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stopTimer);
    };
  }, [participantName, room, t]);

  useEffect(() => {
    function handleData(payload: Uint8Array) {
      let message: LiveRecordingSignal;
      try {
        message = JSON.parse(new TextDecoder().decode(payload));
      } catch {
        return;
      }
      if (message.type === "khmermeet-participant-name") {
        const identity = message.identity.trim();
        const name = message.name.trim();
        if (!identity || !name) return;
        rememberSpeakerName(identity, name);
      } else if (message.type === "khmermeet-participant-name-request") {
        const identity = room.localParticipant.identity;
        const name = participantName.trim() || room.localParticipant.name || cleanParticipantIdentity(identity, t("អ្នកចូលរួម", "Participant"));
        const signal: LiveRecordingSignal = { type: "khmermeet-participant-name", identity, name };
        room.localParticipant
          .publishData(new TextEncoder().encode(JSON.stringify(signal)), { reliable: true })
          .catch(() => undefined);
      } else if (message.type === "khmermeet-record-start") {
        setRemoteRecordingActive(true);
        void startLocalTrackRecording(message.meetingId, message.languageMode, message.recordingStartedAt);
      } else if (message.type === "khmermeet-record-stop") {
        setRemoteRecordingActive(false);
        if (message.meetingId === trackMeetingIdRef.current || trackSegmentingRef.current) {
          void stopLocalTrackRecording();
        }
      }
    }

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  useEffect(() => {
    function handleConnected(participant: RemoteParticipant) {
      const currentEgress = egressRecordingRef.current;
      if (currentEgress) {
        fetch("/api/livekit-egress/track/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room: room.name,
            identity: participant.identity,
            name: participant.name || participant.identity,
            recordingBase: currentEgress.recordingBase,
            recordingStartedAt: currentEgress.recordingStartedAt
          })
        })
          .then((response) => (response.ok ? readJsonResponse<EgressTrackJob & { skipped?: boolean }>(response) : null))
          .then((job) => {
            if (!job || job.skipped || !job.egressId) return;
            setEgressRecording((current) => {
              if (!current || current.trackJobs.some((existing) => existing.egressId === job.egressId)) return current;
              return { ...current, trackJobs: [...current.trackJobs, job] };
            });
          })
          .catch(() => undefined);
        return;
      }

      rememberSpeakerName(participant.identity, participant.name || cleanParticipantIdentity(participant.identity, t("អ្នកចូលរួម", "Participant")));
      const request: LiveRecordingSignal = { type: "khmermeet-participant-name-request" };
      room.localParticipant
        .publishData(new TextEncoder().encode(JSON.stringify(request)), {
          reliable: true,
          destinationIdentities: [participant.identity]
        })
        .catch(() => undefined);
      const currentServerRecording = serverRecordingRef.current;
      if (currentServerRecording) {
        const startSignal: LiveRecordingSignal = {
          type: "khmermeet-record-start",
          meetingId: currentServerRecording.meetingId,
          languageMode: trackLanguageModeRef.current,
          recordingStartedAt: currentServerRecording.recordingStartedAt
        };
        window.setTimeout(connectAvailableAudioTracks, 0);
        room.localParticipant
          .publishData(new TextEncoder().encode(JSON.stringify(startSignal)), {
            reliable: true,
            destinationIdentities: [participant.identity]
          })
          .catch(() => undefined);
      }
    }

    room.on(RoomEvent.ParticipantConnected, handleConnected);
    return () => {
      room.off(RoomEvent.ParticipantConnected, handleConnected);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!audioContext || !input) return 0;
    const nodes = mixNodesRef.current;

    const connectTrack = (track: MediaStreamTrack | undefined | null) => {
      if (!track || track.readyState !== "live" || nodes.has(track.id)) return;
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      source.connect(input);
      nodes.set(track.id, source);
    };

    connectTrack(room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack);
    for (const ref of audioTracks) {
      connectTrack(ref.publication?.track?.mediaStreamTrack);
    }
    return nodes.size;
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

    const connectedTrackCount = connectAvailableAudioTracks();

    // A MediaStreamAudioDestinationNode's .stream always reports exactly one
    // (silent) audio track from the moment it's created, even with zero
    // sources connected - checking destination.stream.getAudioTracks().length
    // here never actually catches the "no mic available" case it was meant
    // to guard against, so recording silently started and produced a
    // completely silent file instead of surfacing an error. Check how many
    // sources were actually wired up instead.
    if (connectedTrackCount === 0) {
      stopMixedAudioContext();
      throw new Error(t("មិនទាន់មានសំឡេងមីក្រូហ្វូនទេ។ សូមបើកមីក្រូហ្វូនជាមុនសិន។", "No microphone tracks are available yet. Please unmute a microphone first."));
    }
    if (room.remoteParticipants.size > 0 && connectedTrackCount <= 1) {
      stopMixedAudioContext();
      throw new Error(t("មានអ្នកចូលរួមផ្សេងទៀតក្នុងការហៅ ប៉ុន្តែឧបករណ៍ថតចាប់បានមីក្រូហ្វូនតែមួយ។ សូមរង់ចាំឱ្យអ្នកផ្សេងបើកមីក្រូហ្វូន រួចថតម្ដងទៀត។", "Other participants are in the call, but the recorder found only one microphone track. Wait for them to unmute, then start recording again."));
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
        mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 }
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
    const announcedNames = announcedSpeakerNamesRef.current;
    const names = [
      announcedNames[room.localParticipant.identity] ||
        participantName ||
        room.localParticipant.name ||
        cleanParticipantIdentity(room.localParticipant.identity, t("អ្នកចូលរួម", "Participant")),
      ...[...room.remoteParticipants.values()].map(
        (participant) =>
          announcedNames[participant.identity] ||
          participant.name ||
          cleanParticipantIdentity(participant.identity, t("អ្នកចូលរួម", "Participant"))
      )
    ];

    return [...new Set(names.map((name) => name?.trim()).filter((name): name is string => Boolean(name)))].slice(0, 100);
  }

  // Hidden fallback for the old mixed-track recorder; the visible UI now uses one Server Rec button.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      setNotice(t("ជំនួយការប្រជុំកំពុងថតសំឡេងពីបន្ទប់ LiveKit។", "Meeting Agent is recording audio from the LiveKit room."));
    } catch (error) {
      setError(error instanceof Error ? error.message : t("មិនអាចចាប់ផ្ដើមថតកិច្ចប្រជុំបានទេ។", "Could not start meeting recording."));
    }
  }

  function stopRecording() {
    stopSegmentRecorder();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  }

  // Backup recording: one mixed audio file for the whole call.
  function startServerMixedBackup() {
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
  }

  function participantCount() {
    return 1 + room.remoteParticipants.size;
  }

  async function requestParticipantNames() {
    const request: LiveRecordingSignal = { type: "khmermeet-participant-name-request" };
    await room.localParticipant
      .publishData(new TextEncoder().encode(JSON.stringify(request)), { reliable: true })
      .catch(() => undefined);
    await new Promise((resolve) => window.setTimeout(resolve, 1800));
    return getCurrentSpeakerNames();
  }

  function stopServerMixedBackup(
    meetingId: string,
    languageMode: "km" | "en" | "km-en",
    durationMs: number
  ): Promise<string | null> {
    const recorder = serverMixedRecorderRef.current;
    serverMixedRecorderRef.current = null;
    if (!recorder || recorder.state === "inactive") {
      cleanupRef.current?.();
      cleanupRef.current = null;
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      recorder.onstop = async () => {
        cleanupRef.current?.();
        cleanupRef.current = null;
        const mimeType = recorder.mimeType || serverMixedMimeTypeRef.current || "audio/webm";
        const blob = new Blob(serverMixedChunksRef.current, { type: mimeType });
        serverMixedChunksRef.current = [];
        if (blob.size <= 1000) {
          resolve(null);
          return;
        }

        try {
          const audioUrl = await uploadRecordingDirect(
            blob,
            mimeType.includes("mp4") ? "mixed-meeting.m4a" : "mixed-meeting.webm",
            meetingId,
            recordingRoom,
            inviteToken
          );
          const response = await fetch(`/api/meetings/${meetingId}/attach-audio`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioUrl,
              duration: clampMeetingDurationSeconds(durationMs / 1000),
              languageMode,
              room: recordingRoom,
              speakerNames: getCurrentSpeakerNames()
            })
          });
          resolve(response.ok ? audioUrl : null);
        } catch {
          resolve(null);
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
    const name =
      announcedSpeakerNamesRef.current[identity] ||
      participantName.trim() ||
      room.localParticipant.name ||
      cleanParticipantIdentity(identity, t("អ្នកចូលរួម", "Participant"));
    try {
      const audioUrl = await uploadRecordingDirect(
        blob,
        blob.type.includes("mp4") ? "track.m4a" : "track.webm",
        meetingId,
        recordingRoom,
        inviteToken
      );
      const response = await fetch(`/api/meetings/${meetingId}/register-track-recording`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakerIdentity: identity,
          speakerName: name,
          audioUrl,
          durationMs,
          languageMode,
          room: recordingRoom,
          inviteToken
        })
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
  function getLocalMicrophoneTrack() {
    return room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null;
  }

  async function waitForLocalMicrophoneTrack(requestId: number) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (trackStartRequestRef.current !== requestId || trackSegmentingRef.current) return null;
      const micTrack = getLocalMicrophoneTrack();
      if (micTrack?.readyState === "live") return micTrack;
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
    return null;
  }

  async function tryStartPendingLocalTrackRecording() {
    const pending = pendingLocalRecordingRef.current;
    if (!pending || trackSegmentingRef.current || trackSegmentRecorderRef.current) return false;
    if (trackStartRequestRef.current !== pending.requestId) {
      pendingLocalRecordingRef.current = null;
      return false;
    }

    const micTrack = getLocalMicrophoneTrack();
    if (micTrack?.readyState !== "live") return false;

    pendingLocalRecordingRef.current = null;
    trackMeetingIdRef.current = pending.meetingId;
    trackLanguageModeRef.current = pending.languageMode;
    trackRecordingStartedAtRef.current = pending.recordingStartedAt;
    startLocalTrackRecorder(new MediaStream([micTrack]), getRecorderMimeType());
    return true;
  }

  async function startLocalTrackRecording(meetingId: string, languageMode: "km" | "en" | "km-en", recordingStartedAt: number) {
    if (trackSegmentingRef.current) return;
    const requestId = trackStartRequestRef.current + 1;
    trackStartRequestRef.current = requestId;
    pendingLocalRecordingRef.current = { meetingId, languageMode, recordingStartedAt, requestId };
    const micTrack = await waitForLocalMicrophoneTrack(requestId);
    if (!micTrack || trackSegmentingRef.current || trackStartRequestRef.current !== requestId) {
      setNotice(t("ការថតកំពុងរង់ចាំមីក្រូហ្វូនរបស់អ្នក។ ពេលបើកមីក្រូហ្វូន វានឹងចាប់ផ្ដើមថតដោយស្វ័យប្រវត្តិ។", "Recording is waiting for your microphone. It will start automatically when you unmute."));
      return;
    }
    void tryStartPendingLocalTrackRecording();
  }

  async function stopLocalTrackRecording() {
    trackStartRequestRef.current += 1;
    pendingLocalRecordingRef.current = null;
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
      const speakers = await requestParticipantNames();
      const expectedParticipants = participantCount();
      if (speakers.length < expectedParticipants) {
        throw new Error(
          t(`មិនទាន់ទទួលបានឈ្មោះអ្នកចូលរួមគ្រប់គ្នា (${speakers.length}/${expectedParticipants})។ សូមរង់ចាំ 2–3 វិនាទី រួចចុចថតម្ដងទៀត។`, `Participant names are not ready yet (${speakers.length}/${expectedParticipants}). Wait 2–3 seconds, then start recording again.`)
        );
      }
      if (expectedParticipants > 100) {
        throw new Error(t(`ការហៅនេះមានអ្នកចូលរួម ${expectedParticipants} នាក់។ KhmerMeet អាចថត និងរក្សាឈ្មោះបានអតិបរមា 100 នាក់។`, `This call has ${expectedParticipants} participants. KhmerMeet supports recording and speaker names for up to 100 participants.`));
      }
      const response = await fetch("/api/meetings/start-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: meetingTitle, languageMode: transcriptionLanguage, room: recordingRoom, speakerNames: speakers, participantCount: expectedParticipants })
      });
      const data = await readJsonResponse<{ meetingId?: string; error?: string }>(response);
      if (!response.ok || !data.meetingId) {
        throw new Error(data.error ?? t("មិនអាចចាប់ផ្ដើមថតបានទេ។", "Could not start recording."));
      }

      const recordingStartedAt = Date.now();
      trackLanguageModeRef.current = transcriptionLanguage;
      startServerMixedBackup();
      const startSignal: LiveRecordingSignal = {
        type: "khmermeet-record-start",
        meetingId: data.meetingId,
        languageMode: transcriptionLanguage,
        recordingStartedAt
      };
      await room.localParticipant
        .publishData(new TextEncoder().encode(JSON.stringify(startSignal)), { reliable: true })
        .catch(() => undefined);
      await startLocalTrackRecording(data.meetingId, transcriptionLanguage, recordingStartedAt);
      setSavedMeetingId(data.meetingId);
      setServerRecording({ meetingId: data.meetingId, recordingStartedAt });
      setSeconds(0);
      setNotice(
        t(`បានចាប់ផ្ដើមថតសំឡេងអ្នកចូលរួម ${getCurrentSpeakerNames().length} នាក់ ដោយមានសំឡេងរួមជាសំឡេងបម្រុង។`, `Recording started for ${getCurrentSpeakerNames().length} participants, with mixed audio as a backup.`)
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : t("មិនអាចចាប់ផ្ដើមថតបានទេ។", "Could not start recording."));
    } finally {
      setSaving(false);
    }
  }

  async function stopServerRecording() {
    if (!serverRecording && !egressRecording) return;
    const currentRecording = serverRecording;
    const currentEgressRecording = egressRecording;
    setSaving(true);
    setError("");
    try {
      if (currentEgressRecording) {
        const durationMs = clampMeetingDurationMs(Date.now() - currentEgressRecording.recordingStartedAt);
        const duration = clampMeetingDurationSeconds(durationMs / 1000);
        const stopResponse = await fetch("/api/livekit-egress/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileEgressId: currentEgressRecording.fileEgressId,
            trackEgressIds: currentEgressRecording.trackJobs.map((job) => job.egressId)
          })
        });
        const stopJson = await readJsonResponse<{ error?: string }>(stopResponse);
        if (!stopResponse.ok) throw new Error(stopJson.error ?? t("មិនអាចបញ្ឈប់ការថត LiveKit បានទេ។", "Could not stop LiveKit recording."));

        await fetch(`/api/meetings/${currentEgressRecording.meetingId}/attach-audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioUrl: currentEgressRecording.storageUrl,
            duration,
            languageMode: transcriptionLanguage
          })
        }).catch(() => undefined);

        setSavedMeetingId(currentEgressRecording.meetingId);
        setSavedAudioUrl(currentEgressRecording.storageUrl);
        setEgressRecording(null);
        setNotice(t("បានឈប់ថត និងរក្សាទុកសំឡេងរួច។ កំពុងបំលែងសំឡេងអ្នកចូលរួមម្នាក់ៗជាអត្ថបទតាមឈ្មោះ។", "Recording stopped and audio saved. Transcribing each participant by name."));
        void finalizeEgressRecording(currentEgressRecording, duration);
        return;
      }

      if (!currentRecording) return;
      const durationMs = clampMeetingDurationMs(Date.now() - currentRecording.recordingStartedAt);
      const stopSignal: LiveRecordingSignal = { type: "khmermeet-record-stop", meetingId: currentRecording.meetingId };
      await room.localParticipant
        .publishData(new TextEncoder().encode(JSON.stringify(stopSignal)), { reliable: true })
        .catch(() => undefined);
      await stopLocalTrackRecording();
      const savedMixedAudioUrl = await stopServerMixedBackup(currentRecording.meetingId, transcriptionLanguage, durationMs);
      if (!savedMixedAudioUrl) throw new Error(t("សំឡេងមិនត្រូវបានរក្សាទុកទេ។ សូមពិនិត្យមីក្រូហ្វូន និងសិទ្ធិកម្មវិធីរុករក រួចថតម្ដងទៀត។", "Audio was not saved. Check microphone and browser permissions, then record again."));
      const duration = clampMeetingDurationSeconds(durationMs / 1000);
      setSavedMeetingId(currentRecording.meetingId);
      setSavedAudioUrl(savedMixedAudioUrl);
      setServerRecording(null);
      setNotice(t("បានឈប់ថត។ កំពុងប្រមូលសំឡេងអ្នកចូលរួមម្នាក់ៗ និងបំលែងជាអត្ថបទ។", "Recording stopped. Collecting each participant's audio and transcribing it."));
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(15000, 3500 + participantCount() * 250)));
      void finalizeServerRecording(currentRecording.meetingId, duration);
    } catch (error) {
      setError(error instanceof Error ? error.message : t("មិនអាចរក្សាទុកការថតបានទេ។", "Could not save the recording."));
    } finally {
      setSaving(false);
    }
  }

  async function finalizeServerRecording(meetingId: string, duration: number) {
    try {
      const mergeResponse = await fetch(`/api/meetings/${meetingId}/merge-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration })
      });
      const mergeJson = await readJsonResponse<{ merged?: boolean; error?: string; partial?: boolean }>(mergeResponse);
      if (!mergeResponse.ok) throw new Error(mergeJson.error ?? t("មិនអាចបញ្ចូលអត្ថបទប្រជុំរួមបានទេ។", "Could not merge the recorded transcript."));

      if (mergeJson.merged) {
        await fetch(`/api/meetings/${meetingId}/finalize-summary`, { method: "POST" }).catch(() => undefined);
        setNotice(
          mergeJson.partial
            ? t("ការបំលែងការហៅវែងមិនទាន់ចប់ទេ។ សំឡេងទាំងមូលបានរក្សាទុក។ សូមបើកប្រជុំ រួចបំលែងម្ដងទៀតដើម្បីបន្ត។", "This long call is not fully transcribed yet. The complete audio is saved. Open the meeting and transcribe again to continue.")
            : t("បានរក្សាទុកការថត អត្ថបទ និងសេចក្ដីសង្ខេប។ អ្នកអាចបន្តការហៅ ឬថតជុំថ្មី។", "Recording, transcript, and summary are saved. You can continue the call or start another recording.")
        );
      } else {
        setNotice(t("បានរក្សាទុកសំឡេងរួច ប៉ុន្តែមិនទាន់រកឃើញពាក្យនិយាយច្បាស់សម្រាប់អត្ថបទ។ អ្នកអាចបន្តការហៅ ឬថតជុំថ្មី។", "Audio is saved, but no clear speech was found for the transcript. You can continue the call or record again."));
      }
    } catch (error) {
      setTranscriptionProgress(`${t("បានរក្សាទុកសំឡេង ប៉ុន្តែការបំលែងជាអត្ថបទបរាជ័យ។", "Audio saved, but background transcription failed.")} ${error instanceof Error ? error.message : ""}`);
    }
  }

  async function finalizeEgressRecording(recording: EgressRecording, duration: number) {
    try {
      let transcribedSegments = 0;
      const jobs = recording.trackJobs;
      setTranscriptionProgress(
        jobs.length > 1
          ? t(`កំពុងរៀបចំអត្ថបទពីអ្នកចូលរួម ${jobs.length} នាក់...`, `Preparing transcripts from ${jobs.length} participants...`)
          : t("កំពុងរៀបចំអត្ថបទពីសំឡេងមួយ។ ប្រសិនបើមានអ្នកចូលរួមច្រើន សូមប្រាកដថាពួកគេបានបើកមីក្រូហ្វូនពេលថត។", "Preparing a transcript from one audio track. If more people joined, make sure their microphones were on while recording.")
      );

      for (const job of jobs) {
        const listResponse = await fetch(`/api/livekit-egress/segments?prefix=${encodeURIComponent(job.segmentsPrefix)}`);
        const listJson = await readJsonResponse<{ segments?: string[]; error?: string }>(listResponse);
        if (!listResponse.ok || !Array.isArray(listJson.segments)) continue;

        const segments = listJson.segments
          .filter((objectPath) => objectPath.endsWith(".ts") || objectPath.endsWith(".aac") || objectPath.endsWith(".m4a"))
          .sort((a, b) => a.localeCompare(b));

        for (let index = 0; index < segments.length; index += 1) {
          const response = await fetch(`/api/meetings/${recording.meetingId}/transcribe-segment`, {
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
          const data: { transcript?: string } = await readJsonResponse<{ transcript?: string }>(response).catch(() => ({}));
          if (response.ok && data.transcript?.trim()) transcribedSegments += 1;
        }
      }

      const mergeResponse = await fetch(`/api/meetings/${recording.meetingId}/merge-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration })
      });
      const mergeJson = await readJsonResponse<{ merged?: boolean; error?: string; partial?: boolean }>(mergeResponse);
      if (!mergeResponse.ok) throw new Error(mergeJson.error ?? t("មិនអាចបញ្ចូលអត្ថបទប្រជុំរួមបានទេ។", "Could not merge the recorded transcript."));

      if (mergeJson.merged) {
        await fetch(`/api/meetings/${recording.meetingId}/finalize-summary`, { method: "POST" }).catch(() => undefined);
        setNotice(
          mergeJson.partial
            ? t("ការបំលែងការហៅវែងមិនទាន់ចប់ទេ។ សំឡេងទាំងមូលបានរក្សាទុក។ សូមបើកប្រជុំ រួចបំលែងម្ដងទៀតដើម្បីបន្ត។", "This long call is not fully transcribed yet. The complete audio is saved. Open the meeting and transcribe again to continue.")
            : t("ការថតរួចរាល់ ហើយអត្ថបទត្រូវបានបញ្ចូលតាមឈ្មោះអ្នកនិយាយ។", "Recording is complete and the transcript is labeled by speaker.")
        );
      } else {
        setNotice(t("បានរក្សាទុកសំឡេងរួច ប៉ុន្តែមិនទាន់មានសំឡេងនិយាយច្បាស់ពីអ្នកចូលរួមសម្រាប់អត្ថបទ។", "Audio is saved, but no clear participant speech was found for the transcript."));
      }
      setTranscriptionProgress(
        transcribedSegments
          ? t(`បានបំលែងសំឡេង ${transcribedSegments} ចម្រៀក។ សូមបើកកំណត់ត្រាដើម្បីពិនិត្យឈ្មោះអ្នកនិយាយ។`, `Transcribed ${transcribedSegments} audio segments. Open the record to review speaker names.`)
          : t("បានរក្សាទុកសំឡេង ប៉ុន្តែមិនទាន់មានចម្រៀកសំឡេងអ្នកចូលរួមណាមួយច្បាស់ទេ។", "Audio saved. No participant segment produced clear speech yet.")
      );
    } catch (error) {
      setTranscriptionProgress(`${t("បានរក្សាទុកសំឡេង ប៉ុន្តែការបំលែងជាអត្ថបទបរាជ័យ។", "Audio saved, but transcription failed.")} ${error instanceof Error ? error.message : ""}`);
    }
  }

  async function saveRecording(mimeType: string) {
    setSaving(true);
    setError("");
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (!blob.size) throw new Error(t("មិនមានសំឡេងត្រូវបានថតទេ។", "No audio was recorded."));
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
                ? t("ការថតនេះធំពេកសម្រាប់ផ្ទុកឡើង។ សូមទាញយកសំឡេងបម្រុងខាងក្រោម ឬថតប្រជុំឱ្យខ្លីជាងនេះ។", "This recording is too large to upload. Download the local backup below, or record a shorter meeting.")
                : t("ការផ្ទុកសំឡេងឡើងមិនជោគជ័យ។", "Audio upload failed."))
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
      if (!saveResponse.ok) throw new Error(saveJson.error ?? saveJson.hint ?? t("ការរក្សាទុកមិនជោគជ័យ។", "Save failed."));
      if (!saveJson.meetingId) throw new Error(t("បានរក្សាទុកប្រជុំ ប៉ុន្តែមិនបានទទួលលេខសម្គាល់ប្រជុំ។", "Meeting was saved but no meeting ID was returned."));
      setSavedMeetingId(saveJson.meetingId);
      setSavedAudioUrl(audioUrl);
      setNotice(t("បានរក្សាទុកសំឡេង។ ជំនួយការប្រជុំកំពុងបំលែងសំឡេងជាអត្ថបទតាមចម្រៀក។", "Audio saved. Meeting Agent is transcribing it in segments."));
      await transcribeSavedSegments(saveJson.meetingId, mimeType, speakers);
    } catch (error) {
      setError(error instanceof Error ? error.message : t("មិនអាចរក្សាទុកការថតប្រជុំបានទេ។", "Could not save the meeting recording."));
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
    setTranscriptionProgress(t(`កំពុងបំលែងសំឡេង 0/${audioSegments.length} ចម្រៀក...`, `Transcribing 0/${audioSegments.length} audio segments...`));

    for (let index = 0; index < audioSegments.length; index += 1) {
      const chunk = audioSegments[index];
      const formData = new FormData();
      const chunkType = chunk.type || mimeType;
      formData.append("audio", chunk, `livekit-call-part-${index + 1}.${chunkType.includes("mp4") ? "m4a" : "webm"}`);
      formData.append("languageMode", transcriptionLanguage);
      formData.append("speakers", JSON.stringify(speakers));
      formData.append("index", String(index + 1));
      setTranscriptionProgress(t(`កំពុងបំលែងសំឡេង ${index + 1}/${audioSegments.length} ចម្រៀក...`, `Transcribing ${index + 1}/${audioSegments.length} audio segments...`));

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
        ? t(`បានបំលែងជាអត្ថបទ ${successfulChunks}/${audioSegments.length} ចម្រៀក។ សូមបើកប្រជុំដើម្បីពិនិត្យអត្ថបទ។`, `Transcription complete: ${successfulChunks}/${audioSegments.length} segments produced text. Open the meeting to review it.`)
        : lastErrorMessage
          ? `${t("បានរក្សាទុកសំឡេង ប៉ុន្តែការបំលែងជាអត្ថបទបរាជ័យ៖", "Audio saved, but transcription failed:")} ${lastErrorMessage}`
          : t("បានរក្សាទុកសំឡេង ប៉ុន្តែមិនរកឃើញពាក្យនិយាយច្បាស់។ សូមពិនិត្យគុណភាពមីក្រូហ្វូន។", "Audio saved, but no clear speech was detected. Check microphone quality.")
    );
    setNotice(t("បានរក្សាទុកសំឡេង និងបន្ថែមអត្ថបទដែលចាប់បានទៅកំណត់ត្រាប្រជុំ។", "Audio and captured transcript were saved to the meeting record."));
  }

  return (
    <section className="border-t border-white/10 bg-white p-5">
      {recording || serverRecording || egressRecording || remoteRecordingActive ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
          </span>
          {t("កិច្ចប្រជុំនេះកំពុងត្រូវបានថតសំឡេង។ សូមជូនដំណឹងអ្នកចូលរួមទាំងអស់ជាមុន។ មីក្រូហ្វូនរបស់ម្នាក់ៗអាចត្រូវបានថតដោយស្វ័យប្រវត្តិ។", "This meeting is being recorded. Please inform all participants. Each participant's microphone may be captured automatically.")}
        </div>
      ) : null}
      {isAnyRecordingActive ? (
        <button
          className="mb-4 flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-slate-950 px-4 font-semibold text-white shadow-sm transition hover:bg-black"
          onClick={() => void enterQuietScreen()}
          type="button"
        >
          <Moon className="h-5 w-5" />
          {t("បន្ថយពន្លឺអេក្រង់ពេលកំពុងថត", "Dim screen while recording")}
        </button>
      ) : null}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-leaf">
            <Bot className="h-4 w-4" />
            {t("ជំនួយការប្រជុំ", "Meeting Agent")}
          </p>
          <h2 className="mt-1 text-xl font-bold text-ink">{t("ថតសំឡេង និងរក្សាទុកប្រជុំ HD", "Record and save an HD meeting")}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("ចុចថតម្ដង ដើម្បីចាប់សំឡេងអ្នកចូលរួមម្នាក់ៗ ហើយបំលែងជាអត្ថបទតាមឈ្មោះអ្នកនិយាយ។", "Select Record to capture each participant's audio and transcribe it with speaker names.")}
          </p>
          {transcriptionProgress ? <p className="mt-2 text-sm text-slate-500">{transcriptionProgress}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="kh-input h-10 w-auto min-w-64 py-1 text-sm"
            value={transcriptionLanguage}
            onChange={(event) => setTranscriptionLanguage(event.target.value as "km" | "en" | "km-en")}
            disabled={recording || Boolean(serverRecording) || Boolean(egressRecording) || saving}
            title={t("ជ្រើសរបៀបបំលែងសំឡេងប្រជុំដែលបានរក្សាទុក។", "Choose how to transcribe the saved meeting audio.")}
          >
            <option value="km-en">{t("ខ្មែរ និងអង់គ្លេស (រក្សាភាសាដើម)", "Khmer and English (keep original languages)")}</option>
            <option value="km">{t("ខ្មែរ (បកប្រែទាំងអស់ជាខ្មែរ)", "Khmer (translate all speech to Khmer)")}</option>
            <option value="en">{t("អង់គ្លេស (បកប្រែទាំងអស់ជាអង់គ្លេស)", "English (translate all speech to English)")}</option>
          </select>
          <span className={cn("kh-badge", recording || serverRecording || egressRecording ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600")}>
            {recording || serverRecording || egressRecording ? `${t("កំពុងថត", "Recording")} ${formatTime(seconds)}` : t("រួចរាល់", "Ready")}
          </span>
          {remoteRecordingActive && !serverRecording ? (
            <span className="kh-badge bg-red-100 text-red-700" title={t("អ្នកចូលរួមផ្សេងបានចាប់ផ្ដើមថត។ មីក្រូហ្វូនរបស់អ្នកអាចត្រូវបានថតដោយស្វ័យប្រវត្តិ។", "Another participant started recording. Your microphone is being captured automatically.")}>
              🔴 {t("កំពុងថត (ចាប់ផ្ដើមដោយអ្នកចូលរួមផ្សេង)", "Recording (started by another participant)")}
            </span>
          ) : null}
          {!serverRecording && !egressRecording ? (
            <button
              className="kh-button-primary"
              type="button"
              onClick={startServerRecording}
              disabled={saving || recording}
              title={t("ចាប់ផ្ដើមថតសំឡេងអ្នកនិយាយទាំងអស់ក្នុងការហៅ។", "Start recording everyone speaking in the call.")}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("ចាប់ផ្ដើមថត", "Start recording")}
            </button>
          ) : (
            <button className="kh-button-secondary text-red-600" type="button" onClick={stopServerRecording} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              {t("ឈប់ថត និងរក្សាទុក", "Stop and save")}
            </button>
          )}
          {savedMeetingId ? <Link className="kh-button-secondary" href={`/meetings/${savedMeetingId}`}>{t("បើកកំណត់ត្រា", "Open record")}</Link> : null}
        </div>
      </div>
      {notice ? <div className="mt-4 rounded-lg bg-leaf/10 p-3 text-sm text-leaf">{notice}</div> : null}
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {localBackupUrl && !savedMeetingId ? (
        <div className="mt-4 rounded-xl border border-saffron/30 bg-saffron/10 p-4">
          <p className="font-semibold text-ink">{t("សំឡេងថតបម្រុងក្នុងកម្មវិធីរុករក", "Local recording backup")}</p>
          <p className="mt-1 text-sm text-slate-600">
            {t("សំឡេងត្រូវបានថតក្នុងកម្មវិធីរុករកនេះ។ បើការរក្សាទុកទៅម៉ាស៊ីនមេបរាជ័យ សូមទាញយកសំឡេងបម្រុងមុនផ្ទុកទំព័រឡើងវិញ ឬបិទទំព័រ។", "The audio was captured in this browser. If server save fails, download this backup before refreshing or closing the page.")}
          </p>
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
            <audio className="w-full" controls src={localBackupUrl} />
          </div>
          <a className="kh-button-secondary mt-3 inline-flex" download={`khmermeet-${room.name || "meeting"}.webm`} href={localBackupUrl}>
            <Download className="h-4 w-4" />
            {t("ទាញយកសំឡេងបម្រុង", "Download backup audio")}
          </a>
        </div>
      ) : null}
      {savedMeetingId ? (
        <div className="mt-4 rounded-xl border border-leaf/20 bg-leaf/5 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="font-semibold text-ink">{t("បានរក្សាទុកការថតដោយជោគជ័យ", "Recording saved successfully")}</p>
              <p className="mt-1 text-sm text-slate-600">
                {t("សំឡេងរបស់អ្នកត្រូវបានរក្សាទុកក្នុងកំណត់ត្រាប្រជុំ។ អ្នកក៏អាចរកឃើញវានៅផ្ទាំងថត និងប្រវត្តិប្រជុំ។", "Your audio is saved in the meeting record. You can also find it from Recorder and Meeting History.")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="kh-button-primary" href={`/meetings/${savedMeetingId}`}>{t("បើកប្រជុំដែលបានរក្សាទុក", "Open saved meeting")}</Link>
              <Link className="kh-button-secondary" href="/meetings/new">{t("ការថតដែលបានរក្សាទុក", "Saved recordings")}</Link>
              <Link className="kh-button-secondary" href="/meetings">{t("ប្រវត្តិ", "History")}</Link>
            </div>
          </div>
          {savedAudioUrl ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
              <p className="mb-2 text-sm font-semibold text-slate-700">{t("ស្ដាប់សំឡេងដែលបានថត", "Recorded audio preview")}</p>
              <audio className="w-full" controls src={savedAudioUrl} />
            </div>
          ) : null}
        </div>
      ) : null}
      {quietScreenActive && isAnyRecordingActive ? (
        <div className="fixed inset-0 z-[100] flex min-h-dvh flex-col items-center justify-between bg-black px-6 py-8 text-center text-white">
          <div className="flex w-full justify-end">
            <button
              aria-label={t("ត្រឡប់ពីអេក្រង់ងងឹត", "Return from dark screen")}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:bg-white/10 hover:text-white"
              onClick={() => void exitQuietScreen()}
              title={t("ត្រឡប់ទៅផ្ទាំងប្រជុំ", "Return to meeting")}
              type="button"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div>
            <div className="mb-5 flex items-center justify-center gap-3 text-sm font-semibold text-white/70">
              <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
              {t("កិច្ចប្រជុំកំពុងត្រូវបានថតសំឡេង", "Meeting is being recorded")}
            </div>
            <p className="text-5xl font-semibold tabular-nums text-white/80 sm:text-6xl">{formatTime(seconds)}</p>
            <p className="mt-5 max-w-sm text-sm leading-6 text-white/45">
              {t("អេក្រង់ត្រូវបានធ្វើឱ្យងងឹត ដើម្បីកុំឱ្យរំខានការប្រជុំ។ សូមកុំចាក់សោទូរស័ព្ទ។", "The screen is dimmed to avoid distracting the meeting. Do not lock your phone.")}
            </p>
          </div>
          <button
            className="flex min-h-12 w-full max-w-sm items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 font-semibold text-white/80"
            onClick={() => void exitQuietScreen()}
            type="button"
          >
            {t("ត្រឡប់ទៅផ្ទាំងប្រជុំ", "Return to meeting")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
