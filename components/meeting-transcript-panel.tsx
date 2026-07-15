"use client";

import { useEffect, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { TranscribeAudioButton } from "@/components/transcribe-audio-button";
import { updateTranscript } from "@/lib/actions";

type MeetingTranscriptPanelProps = {
  meetingId: string;
  audioUrl?: string | null;
  initialTranscript: string;
  rawTranscript?: string | null;
  transcriptIsUsable: boolean;
};

export function MeetingTranscriptPanel({
  meetingId,
  audioUrl,
  initialTranscript,
  rawTranscript,
  transcriptIsUsable
}: MeetingTranscriptPanelProps) {
  const [transcript, setTranscript] = useState(initialTranscript);

  useEffect(() => {
    setTranscript(initialTranscript);
  }, [initialTranscript, meetingId]);

  const hasAnyTranscript = Boolean(rawTranscript?.trim() || transcript.trim());

  return (
    <section className="kh-card p-5" id="transcript">
      <h2 className="mb-4 text-lg font-bold">Transcript</h2>

      {!transcriptIsUsable && rawTranscript ? (
        <div className="mb-4 rounded-lg border border-saffron/30 bg-saffron/10 p-3 text-sm leading-6 text-ink">
          The saved transcript does not look like real speech text. It may contain only timestamps or unclear output.
          Please transcribe the audio again or paste the correct meeting text below.
        </div>
      ) : null}

      {audioUrl ? (
        <div className="mb-4">
          <TranscribeAudioButton meetingId={meetingId} hasTranscript={hasAnyTranscript} onTranscribed={setTranscript} />
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
        <ActionButton>Save transcript</ActionButton>
      </form>
    </section>
  );
}
