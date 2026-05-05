import { VideoCallRoom } from "@/components/video-call-room";

export default function MeetingCallPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">Video meeting</p>
        <h1 className="text-3xl font-bold text-ink">ប្រជុំវីដេអូ</h1>
        <p className="mt-2 text-slate-500">បើក video call ជាច្រើននាក់សម្រាប់ local MVP និងសាកល្បងក្នុង browser tabs។</p>
      </div>
      <VideoCallRoom />
    </div>
  );
}
