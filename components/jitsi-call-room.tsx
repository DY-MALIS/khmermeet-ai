"use client";

import { Copy, Loader2, Phone, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type JitsiApi = {
  dispose: () => void;
  addListener: (event: string, callback: (payload: Record<string, unknown>) => void) => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (
      domain: string,
      options: {
        roomName: string;
        parentNode: HTMLElement;
        width?: string | number;
        height?: string | number;
        userInfo?: { displayName?: string };
        configOverwrite?: Record<string, unknown>;
        interfaceConfigOverwrite?: Record<string, unknown>;
      }
    ) => JitsiApi;
  }
}

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function safeRoomName(room: string) {
  return `KhmerMeetAI-${room.replace(/[^A-Z0-9_-]/gi, "").slice(0, 48) || createRoomCode()}`;
}

function loadJitsiScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-jitsi-api="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Jitsi API.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.dataset.jitsiApi = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Jitsi API."));
    document.head.appendChild(script);
  });
}

export function JitsiCallRoom() {
  const initialRoom = useMemo(() => {
    if (typeof window === "undefined") return createRoomCode();
    return new URLSearchParams(window.location.search).get("room") || createRoomCode();
  }, []);
  const [room, setRoom] = useState(initialRoom);
  const [name, setName] = useState("Local User");
  const [title, setTitle] = useState("");
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [participants, setParticipants] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const apiRef = useRef<JitsiApi | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("room")) {
      window.history.replaceState(null, "", `/meetings/call?room=${room}`);
    }
  }, [room]);

  useEffect(() => {
    return () => {
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, []);

  async function joinRoom() {
    if (!containerRef.current) return;
    setJoining(true);
    setError("");
    setNotice("");

    try {
      await loadJitsiScript();
      if (!window.JitsiMeetExternalAPI) throw new Error("Jitsi API is not available.");

      apiRef.current?.dispose();
      containerRef.current.innerHTML = "";

      const api = new window.JitsiMeetExternalAPI("meet.jit.si", {
        roomName: safeRoomName(room),
        parentNode: containerRef.current,
        width: "100%",
        height: "720px",
        userInfo: { displayName: name || "KhmerMeet User" },
        configOverwrite: {
          prejoinPageEnabled: false,
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          disableDeepLinking: true
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false
        }
      });

      api.addListener("videoConferenceJoined", () => {
        setJoined(true);
        setParticipants((count) => Math.max(1, count || 1));
        setNotice("Free Jitsi meeting started. Share the invite link so other people can join.");
      });
      api.addListener("participantJoined", () => setParticipants((count) => count + 1));
      api.addListener("participantLeft", () => setParticipants((count) => Math.max(1, count - 1)));
      apiRef.current = api;
      window.history.replaceState(null, "", `/meetings/call?room=${room}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not start free video meeting.");
    } finally {
      setJoining(false);
    }
  }

  async function copyInvite() {
    const url = `${window.location.origin}/meetings/call?room=${room}`;
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setNotice("Invite link copied.");
  }

  function resetRoom() {
    apiRef.current?.dispose();
    apiRef.current = null;
    if (containerRef.current) containerRef.current.innerHTML = "";
    const nextRoom = createRoomCode();
    setRoom(nextRoom);
    setJoined(false);
    setParticipants(0);
    setNotice("");
    setError("");
    window.history.replaceState(null, "", `/meetings/call?room=${nextRoom}`);
  }

  return (
    <div className="space-y-5">
      <div className="kh-card grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-semibold text-slate-600">Meeting title</span>
            <input className="kh-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Q2 planning meeting" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-slate-600">Participant name</span>
            <input className="kh-input" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-slate-600">Room code</span>
            <div className="flex gap-2">
              <input className="kh-input uppercase" value={room} onChange={(event) => setRoom(event.target.value.toUpperCase())} />
              <button className="kh-button-secondary px-3" type="button" onClick={copyInvite} title="Copy invite">
                <Copy className="h-4 w-4" />
              </button>
              <button className="kh-button-secondary px-3" type="button" onClick={resetRoom} title="New room">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </label>
        </div>
        <button className="kh-button-primary" type="button" onClick={joinRoom} disabled={joining}>
          {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
          Join Free Video Call
        </button>
      </div>

      <div className="rounded-lg border border-sky/20 bg-sky/10 p-4 text-sm leading-7 text-ink">
        Free mode uses Jitsi Meet public iframe API. It can video call without a LiveKit API key, but full server recording and automatic all-speaker transcript still need paid or self-hosted infrastructure.
        {joined ? <span className="ml-2 font-semibold">Participants: {participants}</span> : null}
      </div>

      {notice ? <div className="rounded-lg bg-leaf/10 p-3 text-sm text-leaf">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="kh-card overflow-hidden p-0">
        <div ref={containerRef} className="min-h-[520px] bg-slate-950" />
        {!joined ? (
          <div className="border-t border-slate-200 bg-white p-5 text-sm text-slate-500">
            Click Join Free Video Call, allow camera/microphone, then share the invite link.
          </div>
        ) : null}
      </div>
    </div>
  );
}
