import { VideoCallRoom } from "@/components/video-call-room";
import { LiveKitCallRoom } from "@/components/livekit-call-room";

export default function MeetingCallPage() {
  const liveKitConfigured = Boolean(process.env.NEXT_PUBLIC_LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">Video meeting</p>
        <h1 className="text-3xl font-bold text-ink">ប្រជុំវីដេអូ</h1>
        <p className="mt-2 text-slate-500">
          {liveKitConfigured
            ? "HD LiveKit mode សម្រាប់មើលមុខគ្នា និងនិយាយគ្នាច្បាស់ជាមួយអ្នកចូលរួមច្រើន។"
            : "MVP WebRTC mode សម្រាប់សាកល្បងតិចនាក់។ សម្រាប់ 10-20 នាក់ សូមដាក់ LiveKit env ក្នុង Vercel។"}
        </p>
      </div>
      {liveKitConfigured ? <LiveKitCallRoom /> : <VideoCallRoom />}
    </div>
  );
}
