"use client";

import { Copy, LogOut, Mic, MicOff, Phone, RefreshCcw, Video, VideoOff, Volume2 } from "lucide-react";
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
    const handleTrackSubscribed = () => syncTiles();
    const handleTrackUnsubscribed = () => syncTiles();
    const handleParticipantChange = () => syncTiles();
    const handleStateChanged = (state: ConnectionState) => setConnectionState(state);

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.LocalTrackPublished, handleTrackSubscribed);
    room.on(RoomEvent.LocalTrackUnpublished, handleTrackUnsubscribed);
    room.on(RoomEvent.ParticipantConnected, handleParticipantChange);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantChange);
    room.on(RoomEvent.ConnectionStateChanged, handleStateChanged);
    room.on(RoomEvent.MediaDevicesError, (mediaError) => setError(mediaError.message));
    room.on(RoomEvent.AudioPlaybackStatusChanged, (playing: boolean) => {
      if (!playing) setNotice("Browser បាន block speaker។ សូមចុច Enable speaker ដើម្បីឲ្យលឺសំឡេងអ្នកផ្សេង។");
    });

    return () => {
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

      await room.connect(data.url, data.token, { autoSubscribe: true });
      await room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      });
      await room.localParticipant.setCameraEnabled(true, {
        resolution: { width: 960, height: 540 },
        facingMode: "user",
        frameRate: 20
      });
      await room.startAudio().catch(() => undefined);
      setAudioEnabled(true);
      setVideoEnabled(true);
      setConnected(true);
      setTiles([...collectTiles(room)]);
      setNotice("LiveKit call បានភ្ជាប់រួច។ អ្នកចូលរួមអាចមើលមុខគ្នា និងនិយាយគ្នាបានច្បាស់ជាង WebRTC MVP។");
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join video meeting.");
    } finally {
      setConnecting(false);
    }
  }

  async function leaveRoom() {
    await room.disconnect();
    setConnected(false);
    setTiles([]);
  }

  async function toggleAudio() {
    const next = !audioEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setAudioEnabled(next);
  }

  async function toggleVideo() {
    const next = !videoEnabled;
    await room.localParticipant.setCameraEnabled(next);
    setVideoEnabled(next);
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tiles.filter((tile) => tile.kind === Track.Kind.Video).map((tile) => (
          <TrackTile key={tile.id} tile={tile} />
        ))}
        {tiles.filter((tile) => tile.kind === Track.Kind.Audio).map((tile) => (
          <TrackTile key={tile.id} tile={tile} />
        ))}
        {!tiles.some((tile) => tile.kind === Track.Kind.Video) ? (
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
