"use client";

import { Download, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { TranscribeAudioButton } from "@/components/transcribe-audio-button";
import { updateTranscript } from "@/lib/actions";
import { seekAudioPlayer } from "@/lib/audio-player";
import { useBilingualText } from "@/lib/display-language";
import type { AudioReviewRange } from "@/lib/transcript-progress";

type MeetingTranscriptPanelProps = {
  meetingId: string;
  title?: string;
  audioUrl?: string | null;
  initialTranscript: string;
  rawTranscript?: string | null;
  transcriptIsUsable: boolean;
  hasUnfinishedTranscription?: boolean;
  initialLanguageMode?: "km" | "en" | "km-en";
  reviewRanges?: AudioReviewRange[];
  speakerNames?: string[] | null;
  autoStartTranscription?: boolean;
};

function downloadTranscriptText(text: string, title: string) {
  const safeTitle = title.replace(/[^\w-]+/g, "-") || "transcript";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeTitle}-transcript.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatAudioTime(seconds: number) {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remaining = whole % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export function MeetingTranscriptPanel({
  meetingId,
  title = "meeting",
  audioUrl,
  initialTranscript,
  rawTranscript,
  transcriptIsUsable,
  hasUnfinishedTranscription = false,
  initialLanguageMode = "km-en",
  reviewRanges = [],
  speakerNames,
  autoStartTranscription = false
}: MeetingTranscriptPanelProps) {
  const t = useBilingualText();
  const [transcript, setTranscript] = useState(initialTranscript);
  const pendingTranscribedTranscriptRef = useRef<string | null>(null);
  const lastMeetingIdRef = useRef(meetingId);

  useEffect(() => {
    if (lastMeetingIdRef.current !== meetingId) {
      lastMeetingIdRef.current = meetingId;
      pendingTranscribedTranscriptRef.current = null;
      setTranscript(initialTranscript);
    }
  }, [initialTranscript, meetingId]);

  useEffect(() => {
    const pendingTranscript = pendingTranscribedTranscriptRef.current;

    if (pendingTranscript) {
      if (initialTranscript.trim() === pendingTranscript.trim()) {
        pendingTranscribedTranscriptRef.current = null;
      }
      return;
    }

    setTranscript(initialTranscript);
  }, [initialTranscript]);

  function handleTranscribed(nextTranscript: string) {
    pendingTranscribedTranscriptRef.current = nextTranscript;
    setTranscript(nextTranscript);
  }

  const hasAnyTranscript = Boolean(rawTranscript?.trim() || transcript.trim());
  const meetingSpeakerNames = Array.from(
    new Set((speakerNames ?? []).map((name) => name.trim()).filter(Boolean))
  ).slice(0, 100);

  return (
    <section className="kh-card p-5" id="transcript">
      <div className="mb-4 flex flex-col gap-1">
        <p className="text-xs font-bold uppercase text-leaf">{t("អត្ថបទប្រជុំ", "Transcript")}</p>
        <h2 className="text-xl font-black text-ink">{t("ផ្ទាំងបំលែងសំឡេងជាអក្សរ", "Audio to text workspace")}</h2>
      </div>

      {!transcriptIsUsable && rawTranscript ? (
        <div className="mb-4 rounded-lg border border-saffron/30 bg-saffron/10 p-3 text-sm leading-6 text-ink">
          {t("អត្ថបទដែលបានរក្សាទុកហាក់មិនមែនជាសំឡេងនិយាយច្បាស់ទេ។ វាអាចមានតែពេលវេលា ឬអត្ថបទមិនច្បាស់។ សូមបំលែងសំឡេងម្ដងទៀត ឬបិទភ្ជាប់អត្ថបទត្រឹមត្រូវខាងក្រោម។", "The saved transcript does not look like real speech text. It may contain only timestamps or unclear output. Please transcribe the audio again or paste the correct meeting text below.")}
        </div>
      ) : null}

      {hasUnfinishedTranscription ? (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-900" role="status">
          {t("ការបម្លែងសំឡេងនេះនៅមានផ្នែកមិនទាន់បញ្ចប់។ អត្ថបទដែលមើលឃើញអាចខ្វះពាក្យ។ ចុចបន្តផ្នែកខ្វះ ដើម្បីបន្តពីផ្នែកដែលបានរក្សាទុក។", "This recording still has unfinished transcription parts. The visible text may be missing words. Use Continue unfinished parts to resume from the saved progress.")}
        </p>
      ) : null}

      {audioUrl && reviewRanges.length ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">
            {t("ពេលវេលាសំឡេងដែលត្រូវផ្ទៀងផ្ទាត់", "Audio times to review")}
          </p>
          <p className="mt-1 leading-6">
            {t("ចុចពេលវេលាដើម្បីស្តាប់សំឡេងផ្ទាល់ ហើយកែពាក្យដែលខ្វះក្នុងអត្ថបទខាងក្រោម។", "Select a time to listen to the recording, then correct missing words in the transcript below.")}
          </p>
          <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {reviewRanges.map((range) => (
              <button
                key={`${range.startSeconds}-${range.endSeconds}`}
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-white px-2 py-1 font-medium hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
                onClick={() => seekAudioPlayer(range.startSeconds * 1000)}
                aria-label={t(`ស្តាប់សំឡេងពី ${formatAudioTime(range.startSeconds)} ដល់ ${formatAudioTime(range.endSeconds)}`, `Listen from ${formatAudioTime(range.startSeconds)} to ${formatAudioTime(range.endSeconds)}`)}
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                {formatAudioTime(range.startSeconds)}–{formatAudioTime(range.endSeconds)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {(audioUrl || meetingSpeakerNames.length) ? (
        <div className="mb-4 space-y-3">
          <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-sky-50/40 p-4 shadow-sm">
            <p className="text-sm font-semibold text-ink">{t("អ្នកចូលរួមដែលបានរក្សាទុក", "Saved participants")} ({meetingSpeakerNames.length})</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {t("បញ្ជីនេះជាឈ្មោះអ្នកចូលរួមដែលបានរក្សាទុក។ អ្នកដែលមិនបាននិយាយ បិទមីក្រូហ្វូន ឬសំឡេងមិនច្បាស់ អាចមិនមានឈ្មោះក្នុងអត្ថបទប្រជុំ។", "This list contains saved participant names. Someone who did not speak, muted their microphone, or was not heard clearly may be absent from the transcript.")}
            </p>
            {meetingSpeakerNames.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {meetingSpeakerNames.map((speaker) => (
                  <span className="kh-badge bg-leaf/10 text-leaf" key={speaker}>
                    {speaker}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-saffron/10 p-3 text-sm leading-6 text-slate-600">
                {t("មិនមានឈ្មោះអ្នកចូលរួមដែលបានរក្សាទុកសម្រាប់ការថតនេះទេ។", "No participant names were saved for this recording.")}
              </p>
            )}
          </div>
          {audioUrl ? (
            <TranscribeAudioButton
              meetingId={meetingId}
              hasTranscript={hasAnyTranscript}
              hasUnfinishedTranscription={hasUnfinishedTranscription}
              initialLanguageMode={initialLanguageMode}
              currentTranscript={transcript === initialTranscript ? transcript : ""}
              speakerNames={meetingSpeakerNames}
              autoStart={autoStartTranscription}
              onTranscribed={handleTranscribed}
            />
          ) : null}
        </div>
      ) : null}

      <form action={updateTranscript} className="space-y-3">
        <input type="hidden" name="id" value={meetingId} />
        <textarea
          className="kh-input min-h-72"
          name="transcript"
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder={t("បិទភ្ជាប់ ឬកែអត្ថបទប្រជុំពិតនៅទីនេះ...", "Paste or edit the real meeting transcript here...")}
        />
        <div className="flex flex-wrap gap-2">
          <ActionButton>{t("រក្សាទុកអត្ថបទប្រជុំ", "Save transcript")}</ActionButton>
          <button
            type="button"
            className="kh-button-secondary"
            disabled={!transcript.trim()}
            onClick={() => downloadTranscriptText(transcript, title)}
          >
            <Download className="h-4 w-4" /> {t("ទាញយកអត្ថបទប្រជុំ", "Download transcript")}
          </button>
        </div>
      </form>
    </section>
  );
}
