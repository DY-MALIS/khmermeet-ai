import { LiveKitCallRoom } from "@/components/livekit-call-room";

export default function MeetingCallPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">Video meeting</p>
        <h1 className="text-3xl font-bold text-ink">ប្រជុំវីដេអូ HD</h1>
        <p className="mt-2 text-slate-500">
          LiveKit SFU mode សម្រាប់ប្រជុំជាក្រុមដូច Zoom/Google Meet, មាន audio/video, screen share, chat និង Meeting Agent។
        </p>
      </div>
      <LiveKitCallRoom />
    </div>
  );
}
