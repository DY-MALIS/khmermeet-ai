import { VideoCallClient } from "@/components/video-call-client";

export default function MeetingCallPage() {
  const provider = process.env.NEXT_PUBLIC_VIDEO_PROVIDER === "jitsi" ? "jitsi" : "livekit";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">Video meeting</p>
        <h1 className="text-3xl font-bold text-ink">HD Video Meeting</h1>
        <p className="mt-2 text-slate-500">
          {provider === "livekit"
            ? "LiveKit SFU mode for production audio/video, screen share, chat, recording, and Meeting Agent."
            : "Free Jitsi mode for basic video meetings without a LiveKit API key. Automatic recording, transcript, summary, and tasks need LiveKit production mode."}
        </p>
      </div>
      <VideoCallClient provider={provider} />
    </div>
  );
}
