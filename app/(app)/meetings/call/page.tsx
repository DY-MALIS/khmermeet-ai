import { VideoCallRoom } from "@/components/video-call-room";

export default function MeetingCallPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">Video meeting</p>
        <h1 className="text-3xl font-bold text-ink">ប្រជុំវីដេអូ</h1>
        <p className="mt-2 text-slate-500">
          Browser WebRTC mode សម្រាប់ video/audio call និង Gemini AI សម្រាប់ transcript, summary និង tasks។
        </p>
      </div>
      <VideoCallRoom />
    </div>
  );
}
