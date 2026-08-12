"use client";

import { AlertCircle, CheckCircle2, FileAudio, Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { readJsonResponse } from "@/lib/read-json-response";

type LanguageMode = "km" | "en" | "km-en";

function titleFromFile(file: File | null) {
  if (!file) return "";
  return file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getMediaDuration(file: File) {
  return new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const duration = Number.isFinite(element.duration) ? element.duration : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    element.src = url;
  });
}

export function ExternalMediaUploadPanel() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  // Default to km-en so mixed Khmer/English meetings are captured as spoken
  // instead of English getting silently translated into Khmer under "km" mode.
  const [languageMode, setLanguageMode] = useState<LanguageMode>("km-en");
  const [status, setStatus] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const fileLabel = useMemo(() => {
    if (!file) return "ជ្រើសរើសឯកសារសំឡេង ឬវីដេអូ";
    return `${file.name} - ${formatFileSize(file.size)}`;
  }, [file]);

  function selectFile(selectedFile: File | null) {
    setFile(selectedFile);
    setTitle((current) => current || titleFromFile(selectedFile));
    setStatus("");
    setWarning("");
    setError("");
  }

  async function uploadAndCreateMeeting() {
    if (!file) {
      setError("សូមជ្រើសរើសឯកសារសំឡេង ឬវីដេអូជាមុនសិន។");
      return;
    }

    setPending(true);
    setError("");
    setWarning("");
    setStatus("កំពុង upload ឯកសារ...");

    try {
      const duration = await getMediaDuration(file);
      const formData = new FormData();
      formData.append("audio", file, file.name);
      formData.append("languageMode", languageMode);

      setStatus("កំពុង upload និងបំលែងសំឡេងជាអក្សរ...");
      const uploadResponse = await fetch("/api/uploads", { method: "POST", body: formData });
      const uploadJson = await readJsonResponse<{
        audioUrl?: string;
        transcript?: string;
        transcriptionError?: string;
        error?: string;
      }>(uploadResponse);

      if (!uploadResponse.ok || !uploadJson.audioUrl) {
        throw new Error(uploadJson.error ?? "Upload មិនជោគជ័យទេ។");
      }

      if (uploadJson.transcriptionError) {
        setWarning(uploadJson.transcriptionError);
      }

      setStatus("កំពុងរក្សាទុកកំណត់ត្រាប្រជុំ...");
      const meetingResponse = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || titleFromFile(file) || "កិច្ចប្រជុំពីការ upload",
          audioUrl: uploadJson.audioUrl,
          transcript: uploadJson.transcript ?? "",
          duration,
          languageMode
        })
      });
      const meetingJson = await readJsonResponse<{ id?: string; error?: string }>(meetingResponse);
      if (!meetingResponse.ok || !meetingJson.id) {
        throw new Error(meetingJson.error ?? "មិនអាចរក្សាទុកប្រជុំបានទេ។");
      }

      setStatus("បានរក្សាទុករួច។ កំពុងបើកប្រជុំ...");
      router.push(`/meetings/${meetingJson.id}`);
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "មិនអាច upload ឯកសារនេះបានទេ។");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="kh-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-xl bg-leaf/10 p-3 text-leaf">
          <UploadCloud className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-leaf">Upload សំឡេង ឬវីដេអូ</p>
          <h2 className="text-xl font-bold text-ink">បំលែងការថតសំឡេងពីខាងក្រៅជាអក្សរ</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Upload ឯកសារប្រភេទ MP3, M4A, WebM, MP4 ឬប្រភេទផ្សេងទៀតដែល browser គាំទ្រ។ កម្មវិធីនឹងរក្សាទុកឯកសារនោះ
            ព្យាយាមបំលែងសំឡេងខ្មែរ និងអង់គ្លេសទៅជាអក្សរ រួចបង្កើតកំណត់ត្រាប្រជុំដោយស្វ័យប្រវត្តិ។
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 transition hover:border-leaf/50 hover:bg-leaf/5">
          <FileAudio className="h-5 w-5 shrink-0 text-leaf" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{fileLabel}</span>
            <span className="mt-1 block text-xs text-slate-500">ទទួលយកឯកសារសំឡេង និងវីដេអូ។</span>
          </span>
          <input
            accept="audio/*,video/*"
            className="sr-only"
            disabled={pending}
            onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>

        <select
          className="kh-input"
          disabled={pending}
          onChange={(event) => setLanguageMode(event.target.value as LanguageMode)}
          value={languageMode}
        >
          <option value="km">លទ្ធផលជាភាសាខ្មែរ</option>
          <option value="en">លទ្ធផលជាភាសាអង់គ្លេស</option>
          <option value="km-en">រក្សាទាំងខ្មែរ និងអង់គ្លេស</option>
        </select>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
        <input
          className="kh-input"
          disabled={pending}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="ចំណងជើងប្រជុំ"
          value={title}
        />
        <button className="kh-button-primary" disabled={pending || !file} onClick={uploadAndCreateMeeting} type="button">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {pending ? "កំពុងដំណើរការ..." : "Upload និងបំលែងជាអក្សរ"}
        </button>
      </div>

      {status ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-leaf/10 p-3 text-sm leading-6 text-leaf">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{status}</span>
        </p>
      ) : null}
      {warning ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-saffron/30 bg-saffron/10 p-3 text-sm leading-6 text-ink">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-saffron" />
          <span>{warning}</span>
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </section>
  );
}
