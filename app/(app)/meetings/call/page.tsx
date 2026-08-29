import { VideoCallClient } from "@/components/video-call-client";
import { getServerUiText } from "@/lib/server-ui-text";

// Forced dynamic: as a fully static sibling of the dynamic /meetings/[id]
// route, prerendering this page confuses Vercel's builder into losing the
// lambda mapping for it ("Unable to find lambda for route: /meetings/call").
export const dynamic = "force-dynamic";

export default async function MeetingCallPage() {
  const { text } = await getServerUiText();

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-leaf">{text.videoMeeting}</p>
        <h1 className="break-words text-2xl font-bold text-ink sm:text-3xl">{text.videoCallRoom}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500 sm:text-base">{text.liveKitCallDescription}</p>
      </div>
      <VideoCallClient />
    </div>
  );
}
