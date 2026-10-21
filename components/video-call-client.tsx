"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { BilingualText } from "@/components/localized-text";

function CallLoading() {
  return <div className="kh-card h-48 animate-pulse bg-slate-100" role="status"><BilingualText km="កំពុងផ្ទុកប្រជុំវីដេអូ..." en="Loading video meeting..." /></div>;
}

function CallLoadFallback() {
  return (
    <div className="kh-card space-y-3 p-5">
      <p className="text-sm font-semibold text-red-600"><BilingualText km="មិនអាចផ្ទុកប្រជុំវីដេអូបាន" en="Video call could not load" /></p>
      <p className="text-sm leading-6 text-slate-600">
        <BilingualText km="ប្រព័ន្ធប្រជុំ LiveKit មិនអាចចាប់ផ្ដើមក្នុងកម្មវិធីរុករកនេះបានទេ។ សូមផ្ទុកទំព័រឡើងវិញ។ បើនៅតែមិនបាន សូមត្រឡប់ទៅផ្ទាំងគ្រប់គ្រង ហើយបើកប្រជុំម្ដងទៀត។" en="The LiveKit meeting module failed to start in this browser. Refresh the page. If it still fails, return to Dashboard and open Meetings again." />
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="kh-button-primary" type="button" onClick={() => window.location.reload()}>
          <BilingualText km="ផ្ទុកឡើងវិញ" en="Refresh" />
        </button>
        <BackToDashboardButton />
      </div>
    </div>
  );
}

function BackToDashboardButton() {
  const router = useRouter();

  return (
    <button className="kh-button-secondary" type="button" onClick={() => router.push("/dashboard")}>
      <BilingualText km="ត្រឡប់ទៅផ្ទាំងគ្រប់គ្រង" en="Back to dashboard" />
    </button>
  );
}

const LiveKitCallRoom = dynamic(
  () =>
    import("@/components/livekit-call-room")
      .then((module) => module.LiveKitCallRoom)
      .catch(() => CallLoadFallback),
  { ssr: false, loading: CallLoading }
);

class VideoCallErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; message: string }
> {
  state = { failed: false, message: "" };

  static getDerivedStateFromError(error: unknown) {
    return {
      failed: true,
      message: error instanceof Error ? error.message : "The video call module stopped unexpectedly."
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Video call runtime error", error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="kh-card space-y-3 p-5">
          <p className="text-sm font-semibold text-red-600"><BilingualText km="ប្រជុំវីដេអូមានបញ្ហា" en="Video call error" /></p>
          <p className="text-sm leading-6 text-slate-600">
            <BilingualText km="ទំព័រប្រជុំបានបើក ប៉ុន្តែប្រព័ន្ធ LiveKit មានបញ្ហាមុនពេលភ្ជាប់។" en="The meeting page opened, but the LiveKit call UI crashed before it could connect." />
          </p>
          {this.state.message ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{this.state.message}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button className="kh-button-primary" type="button" onClick={() => window.location.reload()}>
              <BilingualText km="សាកម្ដងទៀត" en="Try again" />
            </button>
            <BackToDashboardButton />
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function VideoCallClient({ defaultName }: { defaultName?: string }) {
  return (
    <VideoCallErrorBoundary>
      <LiveKitCallRoom defaultName={defaultName} />
    </VideoCallErrorBoundary>
  );
}
