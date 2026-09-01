import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { VideoCallClient } from "@/components/video-call-client";
import { getServerUiText } from "@/lib/server-ui-text";

// Forced dynamic: as a fully static sibling of the dynamic /meetings/[id]
// route, prerendering this page confuses Vercel's builder into losing the
// lambda mapping for it ("Unable to find lambda for route: /meetings/call").
export const dynamic = "force-dynamic";

export default async function MeetingCallPage({
  searchParams
}: {
  searchParams: Promise<{ room?: string; invite?: string }>;
}) {
  const params = await searchParams;
  // Guests join a call via invite link without ever creating an account
  // (see app/api/livekit-token/route.ts's verifyInviteToken bypass). This
  // route sits outside the (app) route group's protected layout specifically
  // so a guest with a valid room+invite link never gets bounced to /login -
  // that layout's session check has no way to see these query params and
  // would otherwise redirect every unauthenticated visitor unconditionally,
  // even one proxy.ts's own edge bypass already decided to let through.
  const hasInviteParams = Boolean(params.room && params.invite);
  if (!hasInviteParams) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      redirect("/login?callbackUrl=/meetings/call");
    }
  }

  const { text } = await getServerUiText();

  return (
    <div className="min-h-screen px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto w-full max-w-[88rem] space-y-5 sm:space-y-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-leaf">{text.videoMeeting}</p>
          <h1 className="break-words text-2xl font-bold text-ink sm:text-3xl">{text.videoCallRoom}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 sm:text-base">{text.liveKitCallDescription}</p>
        </div>
        <VideoCallClient />
      </div>
    </div>
  );
}
