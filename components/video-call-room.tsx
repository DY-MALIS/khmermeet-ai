"use client";

import { Copy, LogOut, Mic, MicOff, Phone, RefreshCcw, Video, VideoOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/components/ui";

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

function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
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
  const [roomId, setRoomId] = useState("");
  const [displayName, setDisplayName] = useState("Local User");
  const [joined, setJoined] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState("");
  const channelRef = useRef<BroadcastChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const namesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room") || createRoomId();
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      localStreamRef.current = stream;
      setAudioEnabled(true);
      setVideoEnabled(true);
      setParticipants([
        {
          id: selfId,
          name: displayName,
          stream,
          isLocal: true,
          audioEnabled: true,
          videoEnabled: true
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
      setError("មិនអាចបើក camera/microphone បានទេ។ សូមចុច Allow ហើយសាកល្បងម្តងទៀត។");
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
    if (roomId) post({ type: "leave", roomId, from: selfId });
    channelRef.current?.close();
    channelRef.current = null;
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setParticipants([]);
    setJoined(false);
  }

  async function copyInvite() {
    const url = `${window.location.origin}/meetings/call?room=${roomId}`;
    await navigator.clipboard.writeText(url);
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
              {!joined ? (
                <button className="kh-button-secondary px-3" type="button" onClick={() => setRoomId(createRoomId())} title="New room">
                  <RefreshCcw className="h-4 w-4" />
                </button>
              ) : null}
            </div>
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
