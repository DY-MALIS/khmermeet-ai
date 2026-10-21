"use client";

import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { TranscribeAudioButton } from "@/components/transcribe-audio-button";
import { updateTranscript } from "@/lib/actions";

type MeetingTranscriptPanelProps = {
  meetingId: string;
  title?: string;
  audioUrl?: string | null;
  initialTranscript: string;
  rawTranscript?: string | null;
  transcriptIsUsable: boolean;
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

export function MeetingTranscriptPanel({
  meetingId,
  title = "meeting",
  audioUrl,
  initialTranscript,
  rawTranscript,
  transcriptIsUsable,
  speakerNames,
  autoStartTranscription = false
}: MeetingTranscriptPanelProps) {
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
        <p className="text-xs font-bold uppercase text-leaf">Transcript</p>
        <h2 className="text-xl font-black text-ink">Audio to text workspace</h2>
      </div>

      {!transcriptIsUsable && rawTranscript ? (
        <div className="mb-4 rounded-lg border border-saffron/30 bg-saffron/10 p-3 text-sm leading-6 text-ink">
          The saved transcript does not look like real speech text. It may contain only timestamps or unclear output.
          Please transcribe the audio again or paste the correct meeting text below.
        </div>
      ) : null}

      {(audioUrl || meetingSpeakerNames.length) ? (
        <div className="mb-4 space-y-3">
          <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-sky-50/40 p-4 shadow-sm">
            <p className="text-sm font-semibold text-ink">អ្នកចូលរួមដែលបានរក្សាទុក ({meetingSpeakerNames.length})</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              បញ្ជីនេះជាឈ្មោះអ្នកចូលរួមដែលបានរក្សាទុក។ អ្នកដែលមិនបាននិយាយ បិទមីក្រូហ្វូន ឬសំឡេងមិនច្បាស់ អាចមិនមានឈ្មោះក្នុងអត្ថបទប្រជុំ។
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
                មិនមានឈ្មោះអ្នកចូលរួមដែលបានរក្សាទុកសម្រាប់ការថតនេះទេ។
              </p>
            )}
          </div>
          {audioUrl ? (
            <TranscribeAudioButton
              meetingId={meetingId}
              hasTranscript={hasAnyTranscript}
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
          placeholder="Paste or edit the real meeting transcript here..."
        />
        <div className="flex flex-wrap gap-2">
          <ActionButton>Save transcript</ActionButton>
          <button
            type="button"
            className="kh-button-secondary"
            disabled={!transcript.trim()}
            onClick={() => downloadTranscriptText(transcript, title)}
          >
            <Download className="h-4 w-4" /> Download transcript
          </button>
        </div>
      </form>
    </section>
  );
}
