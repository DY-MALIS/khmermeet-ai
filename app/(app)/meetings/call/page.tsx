import { VideoCallClient } from "@/components/video-call-client";
import { getServerUiText } from "@/lib/server-ui-text";

// Forced dynamic: as a fully static sibling of the dynamic /meetings/[id]
// route, prerendering this page confuses Vercel's builder into losing the
// lambda mapping for it ("Unable to find lambda for route: /meetings/call").
export const dynamic = "force-dynamic";

export default async function MeetingCallPage() {
  const { text } = await getServerUiText();
  const provider = process.env.NEXT_PUBLIC_VIDEO_PROVIDER === "jitsi" ? "jitsi" : "livekit";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">{text.videoMeeting}</p>
        <h1 className="text-3xl font-bold text-ink">{text.videoCallRoom}</h1>
        <p className="mt-2 text-slate-500">
          {provider === "livekit"
            ? text.liveKitCallDescription
            : text.jitsiCallDescription}
        </p>
      </div>
      <VideoCallClient provider={provider} />
    </div>
  );
}
