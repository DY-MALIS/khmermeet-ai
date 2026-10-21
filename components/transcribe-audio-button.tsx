"use client";

import { AlertCircle, CheckCircle2, Loader2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readJsonResponse } from "@/lib/read-json-response";
import { useBilingualText } from "@/lib/display-language";

type LanguageMode = "km" | "en" | "km-en";

type TranscribeAudioButtonProps = {
  meetingId: string;
  hasTranscript?: boolean;
  currentTranscript?: string;
  speakerNames?: string[];
  autoStart?: boolean;
  onTranscribed?: (transcript: string) => void;
};

// Upper bound on how many times the browser will ask the server to continue.
// Twenty fifteen-minute windows is a five-hour meeting and a pass gets through
// several, so this is generous - it is here to stop a stuck recording looping
// forever, not to cut a real one short.
const MAX_TRANSCRIPTION_PASSES = 12;

export function TranscribeAudioButton({
  meetingId,
  hasTranscript = false,
  currentTranscript = "",
  speakerNames = [],
  autoStart = false,
  onTranscribed
}: TranscribeAudioButtonProps) {
  const t = useBilingualText();
  const progressSteps = useMemo(() => [
    t("កំពុងរៀបចំសំឡេង...", "Preparing audio..."),
    t("កំពុងស្តាប់សំឡេងជាបំណែកតូចៗ...", "Listening to audio segments..."),
    t("កំពុងចាប់ពាក្យ និងឈ្មោះអ្នកនិយាយ...", "Identifying words and speakers..."),
    t("កំពុងសម្អាតអត្ថបទ និងរក្សាទុក...", "Cleaning and saving transcript...")
  ], [t]);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [progressStep, setProgressStep] = useState(0);
  const autoStartedRef = useRef(false);
  // Default to km-en so mixed Khmer/English meetings are captured as spoken
  // instead of English getting silently translated into Khmer under "km" mode.
  const [languageMode, setLanguageMode] = useState<LanguageMode>("km-en");

  const transcribe = useCallback(async () => {
    setPending(true);
    setProgressStep(0);
    setMessage("");
    setError("");
    const progressTimer = window.setInterval(() => {
      setProgressStep((step) => Math.min(step + 1, progressSteps.length - 1));
    }, 14000);
    try {
      // A long recording needs more than one request: the server finishes as
      // many windows as its own time limit allows, keeps them, and continues
      // from there next time. Keep asking until the meeting is complete
      // rather than making someone press the button once per window.
      let pass = 1;
      let previousLength = 0;
      let nextTranscript = "";
      let stillPartial = false;
      let partialMessage = "";
      let recognitionNote = "";
      let retriedEmptyTranscript = false;
      for (;;) {
        const response = await fetch(`/api/meetings/${meetingId}/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ languageMode })
        });
        const data = await readJsonResponse<{ transcript?: string; error?: string; code?: string; message?: string; partial?: boolean }>(response);
        if (!response.ok && data.code === "EMPTY_TRANSCRIPT" && !retriedEmptyTranscript) {
          retriedEmptyTranscript = true;
          setProgressStep(0);
      setMessage(t("AI មិនបានបញ្ជូនអត្ថបទមកទេ។ កំពុងសាកល្បងសំឡេងដែលបានរក្សាទុកម្ដងទៀត...", "The AI returned no text. Trying the saved audio once more automatically..."));
          continue;
        }
        if (!response.ok) throw new Error(data.error ?? t("មិនអាចបំលែងសំឡេងជាអក្សរបានទេ។", "Could not transcribe audio."));
        nextTranscript = typeof data.transcript === "string" ? data.transcript.trim() : "";
        if (!nextTranscript) {
          throw new Error(t("ការបំលែងសំឡេងបានបញ្ចប់ ប៉ុន្តែមិនមានអត្ថបទនិយាយ។ សូមសាកម្ដងទៀតដោយប្រើសំឡេងច្បាស់ជាងនេះ។", "Transcription finished, but no speech text was returned. Please try again with clearer audio."));
        }
        onTranscribed?.(nextTranscript);
        if (!data.partial) {
          stillPartial = false;
          break;
        }
        partialMessage = data.message ?? "";
        if (data.code === "SPEAKER_LABELS_MISSING") {
          stillPartial = true;
          break;
        }
        // A pass that adds nothing means continuing would only spend the same
        // money again on the same windows for the same result.
        const madeProgress = nextTranscript.length > previousLength;
        previousLength = nextTranscript.length;
        if (!madeProgress || pass >= MAX_TRANSCRIPTION_PASSES) {
          stillPartial = true;
          break;
        }
        pass += 1;
        setMessage(t(`ការថតវែង — កំពុងបន្តផ្នែកទី ${pass}។ បាន ${nextTranscript.length.toLocaleString()} តួអក្សរ។`, `Long recording — continuing part ${pass}. ${nextTranscript.length.toLocaleString()} characters so far.`));
      }
      if (!stillPartial && /^\s*(?:Speaker\s+\d+|Woman|Man|Female|Male)\s*:/im.test(nextTranscript)) {
        setMessage(t("កំពុងផ្គូផ្គងអ្នកនិយាយជាមួយសំឡេងដែលបានចងចាំ...", "Matching speakers against remembered voices..."));
        const recognitionResponse = await fetch(`/api/meetings/${meetingId}/recognize-speakers`, { method: "POST" }).catch(() => null);
        if (recognitionResponse?.ok) {
          const recognition = await readJsonResponse<{ transcript?: string; matched?: number; message?: string }>(recognitionResponse);
          recognitionNote = recognition.message ?? "";
          if (recognition.matched && recognition.transcript) {
            nextTranscript = recognition.transcript;
            onTranscribed?.(nextTranscript);
          }
        } else {
          recognitionNote = t("មិនអាចពិនិត្យសំឡេងដែលបានចងចាំលើកនេះទេ។ ឈ្មោះអ្នកនិយាយនៅដដែល។", "Could not check remembered voices this time; speaker labels were kept.");
        }
      }
      setMessage(
        stillPartial
          ? partialMessage || t("ផ្នែកខ្លះនៃការថតនេះមិនទាន់បានបំលែងជាអក្សរ។ សំឡេងទាំងមូលត្រូវបានរក្សាទុក។ សូមចុចបំលែងសំឡេងម្ដងទៀតដើម្បីបន្ត។", "Some of this recording is still not transcribed. The audio is saved in full. Click Re-transcribe audio again to continue.")
          : hasTranscript
            ? `${t("បានជំនួសអត្ថបទប្រជុំ។ កំពុងផ្ទុកទិន្នន័យឡើងវិញ...", "Transcript replaced below. Refreshing meeting data...")}${recognitionNote ? ` ${recognitionNote}` : ""}`
            : `${t("បានរក្សាទុកអត្ថបទប្រជុំ។ កំពុងផ្ទុកទិន្នន័យឡើងវិញ...", "Transcription saved below. Refreshing meeting data...")}${recognitionNote ? ` ${recognitionNote}` : ""}`
      );
      window.setTimeout(() => router.refresh(), 50);
    } catch (error) {
      const detail = error instanceof Error ? error.message : t("មិនអាចបំលែងសំឡេងជាអក្សរបានទេ។", "Could not transcribe audio.");
      setError(
        detail.includes("more time") || detail.toLowerCase().includes("timed out")
          ? `${detail} ${t("អត្ថបទដែលចាប់បានមុននេះត្រូវបានរក្សាទុក ប្រសិនបើមាន។ សូមចុចម្ដងទៀតដើម្បីបន្ត។", "Previously transcribed text was saved, if any. Click again to continue.")}`
          : detail
      );
    } finally {
      window.clearInterval(progressTimer);
      setPending(false);
    }
  }, [hasTranscript, languageMode, meetingId, onTranscribed, progressSteps, router, t]);

  const matchRememberedVoices = useCallback(async () => {
    setRecognizing(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/recognize-speakers`, { method: "POST" });
      const result = await readJsonResponse<{ transcript?: string; matched?: number; message?: string; error?: string }>(response);
      if (!response.ok) throw new Error(result.error ?? t("មិនអាចស្គាល់អ្នកនិយាយបានទេ។", "Could not recognize speakers."));
      if (result.matched && result.transcript) {
        onTranscribed?.(result.transcript);
        setMessage(t(`បានផ្គូផ្គងអ្នកនិយាយ ${result.matched} នាក់ជាមួយសំឡេងដែលបានចងចាំ។`, `Matched ${result.matched} remembered speaker${result.matched === 1 ? "" : "s"}.`));
        router.refresh();
      } else {
        setMessage(result.message ?? t("មិនមានសំឡេងដែលបានចងចាំផ្គូផ្គងច្បាស់ទេ។ ឈ្មោះអ្នកនិយាយនៅដដែល។", "No remembered voice matched confidently; speaker labels were kept."));
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : t("មិនអាចស្គាល់អ្នកនិយាយបានទេ។", "Could not recognize speakers."));
    } finally {
      setRecognizing(false);
    }
  }, [meetingId, onTranscribed, router, t]);

  useEffect(() => {
    if (!autoStart || autoStartedRef.current || pending || hasTranscript) return;
    autoStartedRef.current = true;
    void transcribe();
  }, [autoStart, hasTranscript, pending, transcribe]);

  return (
    <div className="space-y-3 rounded-2xl border border-leaf/10 bg-gradient-to-br from-white to-emerald-50/50 p-4 shadow-sm">
      <div>
        <p className="font-semibold text-ink">
          {hasTranscript ? t("បំលែងសំឡេងជាអក្សរឡើងវិញ", "Re-transcribe audio") : t("បំលែងសំឡេងជាអក្សរ", "Transcribe audio")}
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {hasTranscript
            ? t("AI នឹងស្តាប់ឯកសារសំឡេងដែលបានរក្សាទុកម្ដងទៀត ហើយជំនួសអត្ថបទបច្ចុប្បន្ន។ ប្រើនៅពេលអត្ថបទមានពាក្យខុសពីអ្វីដែលបាននិយាយ។", "AI will listen to the saved audio again and replace the current transcript. Use this when the transcript contains incorrect words.")
            : t("ជ្រើសភាសាដែលបាននិយាយ រួច AI នឹងបំលែងឯកសារសំឡេងទៅជាអត្ថបទប្រជុំ។", "Choose the spoken language, then AI will transcribe the saved audio.")}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {t("ជ្រើសរបៀបអត្ថបទ៖ ខ្មែរ និងអង់គ្លេសរក្សាភាសាដែលបាននិយាយ។ ជម្រើសភាសាតែមួយនឹងបកប្រែអត្ថបទទាំងអស់ទៅភាសានោះ។", "Choose transcript mode: Khmer and English keeps the spoken languages. A single-language option translates all speech to that language.")}
        </p>
        {speakerNames.length ? (
          <p className="mt-1 text-xs leading-5 text-leaf">
            {t("ឈ្មោះអ្នកនិយាយ", "Speaker labels")}: {speakerNames.join(", ")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className="kh-input w-full sm:max-w-xs"
          value={languageMode}
          onChange={(event) => setLanguageMode(event.target.value as LanguageMode)}
          disabled={pending}
        >
          <option value="km-en">{t("ខ្មែរ និងអង់គ្លេស (រក្សាភាសាដើម)", "Khmer and English (keep original languages)")}</option>
          <option value="km">{t("ខ្មែរ (បកប្រែទាំងអស់ជាខ្មែរ)", "Khmer (translate all speech to Khmer)")}</option>
          <option value="en">{t("អង់គ្លេស (បកប្រែទាំងអស់ជាអង់គ្លេស)", "English (translate all speech to English)")}</option>
        </select>
        <button className="kh-button-primary sm:w-auto" disabled={pending || recognizing} onClick={transcribe} type="button">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {pending ? t("កំពុងបំលែងសំឡេង...", "Transcribing audio...") : hasTranscript ? t("បំលែងសំឡេងឡើងវិញ", "Re-transcribe audio") : t("បំលែងសំឡេងជាអក្សរ", "Transcribe audio")}
        </button>
        {/^\s*(?:Speaker\s+\d+|Woman|Man|Female|Male)\s*:/im.test(currentTranscript) ? (
          <button className="kh-button-secondary sm:w-auto" disabled={pending || recognizing} onClick={matchRememberedVoices} type="button">
            {recognizing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {recognizing ? t("កំពុងផ្គូផ្គងសំឡេង...", "Matching voices...") : t("ផ្គូផ្គងសំឡេងដែលបានចងចាំ", "Match remembered voices")}
          </button>
        ) : null}
      </div>

      {pending ? (
        <div className="rounded-2xl border border-leaf/20 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
            <span>{progressSteps[progressStep]}</span>
            <span>{progressStep + 1}/{progressSteps.length}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-leaf transition-all duration-500"
              style={{ width: `${((progressStep + 1) / progressSteps.length) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {t("សំឡេងវែងអាចចំណាយពេលច្រើន។ សូមកុំបិទទំព័រនេះរហូតដល់អត្ថបទត្រូវបានរក្សាទុក។", "Long recordings may take time. Keep this page open until the transcript is saved.")}
          </p>
        </div>
      ) : null}

      {message ? (
        <p className="flex items-start gap-2 rounded-lg bg-leaf/10 p-3 text-sm leading-6 text-leaf">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

