"use client";

import dynamic from "next/dynamic";

function CallLoading() {
  return <div className="kh-card h-48 animate-pulse bg-slate-100" aria-label="Loading video meeting" />;
}

const LiveKitCallRoom = dynamic(
  () => import("@/components/livekit-call-room").then((module) => module.LiveKitCallRoom),
  { ssr: false, loading: CallLoading }
);

const JitsiCallRoom = dynamic(
  () => import("@/components/jitsi-call-room").then((module) => module.JitsiCallRoom),
  { ssr: false, loading: CallLoading }
);

export function VideoCallClient({ provider }: { provider: "livekit" | "jitsi" }) {
  return provider === "livekit" ? <LiveKitCallRoom /> : <JitsiCallRoom />;
}
