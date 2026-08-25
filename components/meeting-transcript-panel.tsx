"use client";

import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { TranscribeAudioButton } from "@/components/transcribe-audio-button";
import { updateTranscript } from "@/lib/actions";

type MeetingTranscriptPanelProps = {
  meetingId: string;
  audioUrl?: string | null;
  initialTranscript: string;
  rawTranscript?: string | null;
  transcriptIsUsable: boolean;
  speakerNames?: string[] | null;
};

export function MeetingTranscriptPanel({
  meetingId,
  audioUrl,
  initialTranscript,
  rawTranscript,
  transcriptIsUsable,
  speakerNames
}: MeetingTranscriptPanelProps) {
  const [transcript, setTranscript] = useState(initialTranscript);
  const [speakerLabelToRename, setSpeakerLabelToRename] = useState("");
  const [speakerRenameValue, setSpeakerRenameValue] = useState("");
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
  const transcriptSpeakerLabels = extractTranscriptSpeakerLabels(transcript);

  function applySpeakerRename() {
    const fromLabel = speakerLabelToRename.trim();
    const toLabel = speakerRenameValue.trim();
    if (!fromLabel || !toLabel) return;
    setTranscript((current) => renameTranscriptSpeakerLabel(current, fromLabel, toLabel));
    setSpeakerLabelToRename("");
    setSpeakerRenameValue("");
  }

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
        <div className="mb-4 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-ink">Meeting speakers</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              KhmerMeet uses the participant names saved from the video meeting. If a voice is unclear in the mixed
              recording, the transcript may use Unknown Speaker instead of guessing.
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
                No participant names were saved for this recording. New video meetings will save participant names
                automatically when users join with their display name.
              </p>
            )}
          </div>
          <TranscribeAudioButton
            meetingId={meetingId}
            hasTranscript={hasAnyTranscript}
            speakerNames={meetingSpeakerNames}
            onTranscribed={handleTranscribed}
          />
        </div>
      ) : null}

      <form action={updateTranscript} className="space-y-3">
        <input type="hidden" name="id" value={meetingId} />
        {transcriptSpeakerLabels.length ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-ink">Fix speaker name</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <select
                className="kh-input"
                value={speakerLabelToRename}
                onChange={(event) => setSpeakerLabelToRename(event.target.value)}
              >
                <option value="">Select speaker label</option>
                {transcriptSpeakerLabels.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                className="kh-input"
                value={speakerRenameValue}
                onChange={(event) => setSpeakerRenameValue(event.target.value)}
                placeholder="ឈ្មោះពិត ឧ. ចយ"
              />
              <button
                className="kh-button-secondary"
                type="button"
                onClick={applySpeakerRename}
                disabled={!speakerLabelToRename.trim() || !speakerRenameValue.trim()}
              >
                Apply
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              ប្រើពេល transcript ចេញជា Speaker 1 ឬ Unknown Speaker។ ប្តូរឈ្មោះរួចចុច Save transcript។
            </p>
          </div>
        ) : null}
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

function extractTranscriptSpeakerLabels(transcript: string) {
  const labels = new Set<string>();
  for (const line of transcript.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:\n]{1,50}):\s+\S/);
    const label = match?.[1]?.trim();
    if (label) labels.add(label);
  }
  return Array.from(labels).slice(0, 100);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renameTranscriptSpeakerLabel(transcript: string, fromLabel: string, toLabel: string) {
  const pattern = new RegExp(`(^|\\n)(\\s*)${escapeRegExp(fromLabel)}\\s*:`, "g");
  return transcript.replace(pattern, `$1$2${toLabel}:`);
}
