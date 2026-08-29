"use client";

import dynamic from "next/dynamic";
import { Component, type ErrorInfo, type ReactNode } from "react";

function CallLoading() {
  return <div className="kh-card h-48 animate-pulse bg-slate-100" aria-label="Loading video meeting" />;
}

function CallLoadFallback() {
  return (
    <div className="kh-card space-y-3 p-5">
      <p className="text-sm font-semibold text-red-600">Video call could not load</p>
      <p className="text-sm leading-6 text-slate-600">
        The LiveKit meeting module failed to start in this browser. Please refresh the page. If it still fails, open Dashboard and come back to Meetings.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="kh-button-primary" type="button" onClick={() => window.location.reload()}>
          Refresh
        </button>
        <button className="kh-button-secondary" type="button" onClick={() => window.location.assign("/dashboard")}>
          Back to dashboard
        </button>
      </div>
    </div>
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
          <p className="text-sm font-semibold text-red-600">Video call error</p>
          <p className="text-sm leading-6 text-slate-600">
            The meeting page opened, but the LiveKit call UI crashed before it could connect.
          </p>
          {this.state.message ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{this.state.message}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button className="kh-button-primary" type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
            <button className="kh-button-secondary" type="button" onClick={() => window.location.assign("/dashboard")}>
              Back to dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function VideoCallClient() {
  return (
    <VideoCallErrorBoundary>
      <LiveKitCallRoom />
    </VideoCallErrorBoundary>
  );
}
