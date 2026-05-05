import { RecordingPanel } from "@/components/recording-panel";

export default function NewMeetingPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-leaf">ថតសំឡេងប្រជុំ</p>
        <h1 className="text-3xl font-bold text-ink">ប្រជុំថ្មី</h1>
        <p className="mt-2 text-slate-500">ថតសំឡេងក្នុង browser, ស្តាប់ preview, រួចរក្សាទុក meeting ទៅ local database។</p>
      </div>
      <RecordingPanel />
    </div>
  );
}
