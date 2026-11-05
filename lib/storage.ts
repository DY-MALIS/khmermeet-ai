import { mkdir, readFile, writeFile } from "fs/promises";
import { rm, unlink } from "fs/promises";
import path from "path";
import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  hasOpenRouterKey,
  refineOpenRouterTranscript,
  transcribeOpenRouterAudioViaChat
} from "@/lib/ai/openrouter";
import { prisma } from "@/lib/prisma";
import {
  AUDIO_PART_BYTES,
  MAX_AUDIO_RESPONSE_BYTES,
  audioPartCount,
  audioPartPath,
  audioPartSize,
  isChunkManifestPath,
  parseChunkedAudioManifest,
  type ChunkedAudioManifest
} from "@/lib/chunked-audio";
import { hasAbbreviatedSpokenNumber, hasTranscriptionPromptLeakage, hasUsableTranscript, isTimestampOnlyTranscript, normalizeTranscriptDigits, stripUnknownOnlyLines } from "@/lib/transcript-quality";
import { spellTranscriptNumberWords } from "@/lib/transcript-number-words";
import { chooseAudioWindowText, COVERED_AUDIO_CHUNK_PREFIX, INCOMPLETE_AUDIO_CHUNK_PREFIX, listenedToEverySubwindow, packPartialAudioSubwindows, stitchOverlappingAudioTranscripts, unpackSavedAudioChunkText, type SavedAudioSubwindow } from "@/lib/transcript-progress";
import { keepTrustedSpeakerLabels } from "@/lib/speaker-labels";

const uploadRoot = process.env.VERCEL ? path.join("/tmp", "khmermeet-uploads") : path.join(process.cwd(), "uploads");
// Vercel Serverless Functions (Route Handlers) hard-cap the request body at 4.5MB.
// A request larger than that is rejected by the platform before this code runs,
// so this limit must stay below 4.5MB to ever actually trigger.
const databaseAudioLimit = 4 * 1024 * 1024;
const openRouterAudioLimit = 24 * 1024 * 1024;

export type TranscriptionLanguageMode = "km" | "en" | "km-en";
type TranscriptionOptions = {
  timeoutMs?: number;
  mode?: "final" | "live";
  // Long-recording workers inspect raw numeric shorthand before deciding a
  // window is complete. User-facing live responses spell numbers as words.
  formatNumberWords?: boolean;
  // True when audioFile is known in advance to be one specific person's own
  // microphone track (client-mesh Server Rec's per-participant segments) -
  // stops the model from hallucinating a "Speaker 2:" turn inside audio
  // that is provably a single continuous voice.
  singleSpeaker?: boolean;
  // English audio otherwise always tries google/chirp-3 first. Confirmed
  // live that chirp-3 reliably rejects longer clips (~2min+ tested) with a
  // 400 - the multimodal fallback below still recovers correctly, but only
  // after wasting 60-90s on the doomed chirp-3 attempt first. Long/full-
  // call recordings (lib/storage.ts transcribeStoredTrackRecording) know in
  // advance they don't fit chirp-3's window, so they skip straight to the
  // fallback instead of paying that cost on every chunk.
  skipPrimaryModel?: boolean;
};

export function normalizeTranscriptionLanguageMode(value: unknown): TranscriptionLanguageMode {
  if (value === "km" || value === "km-KH" || value === "khmer") return "km";
  if (value === "en" || value === "en-US" || value === "english") return "en";
  if (
    value === "km-en" ||
    value === "mixed" ||
    value === "mixed-khmer-english" ||
    value === "khmer-english"
  ) {
    return "km-en";
  }
  // Missing or unfamiliar modes must not translate speech by accident.
  return "km-en";
}

// Standard Khmer writing has no spaces between the letters of a word (only
// between phrases/clauses); speech-recognition output routinely comes back
// with every syllable space-separated instead. Asking the refine LLM to fix
// this via prompt instructions alone proved unreliable in testing (real
// output: it left spacing untouched even when explicitly told to rejoin
// it). This is a mechanical Unicode-range fact, not a judgment call, so fix
// it deterministically instead: collapse whitespace strictly between two
// Khmer letter/vowel-sign characters (U+1780-U+17D3), which excludes Khmer
// punctuation (។ etc., U+17D4+) and digits so sentence breaks and numbers
// keep their spacing. Applied here so every transcription path gets it,
// not just the ones that go through the refine LLM pass.
function rejoinKhmerWordSpacing(text: string) {
  return text.replace(/([ក-៓])[ \t]+(?=[ក-៓])/g, "$1");
}

// The model is asked for one speaker turn per line and usually obliges - but
// not always. Confirmed on a real 8.7-minute three-person recording: it
// returned the entire meeting as a single line with "Speaker 1:",
// "Speaker 2:", "Speaker 3:" and "Speaker 4:" sitting inline in the middle of
// the text. Everything downstream splits on newlines, so that transcript
// counted as one turn by one speaker: the diarization was there and was
// actually better than the stored version, and the app threw all of it away -
// including the collapse detection, which saw a single label and could not
// tell anything was wrong. Put each label back on its own line before
// anything reads the text. Only our own generic label forms are split on;
// splitting at any "word:" would cut real speech that happens to contain a
// colon.
function splitInlineSpeakerLabels(text: string) {
  return text.replace(
    /(\S)[ \t]*((?:Unknown\s+Speaker|Speaker|Participant|អ្នកនិយាយ|អ្នកចូលរួម)\s*[0-9០-៩]*\s*[:：])/g,
    "$1\n$2"
  );
}

function cleanTranscriptionText(text: string) {
  if (hasTranscriptionPromptLeakage(text)) return "";
  const noSpeechPatterns = [
    /no clear speech detected/i,
    /there is no discernible speech/i,
    /no discernible speech/i,
    /provided audio/i,
    /cannot transcribe/i,
    /unable to transcribe/i,
    /there is no speech/i,
    /no speech detected/i
  ];
  const boilerplatePatterns = [
    /^(?:[^:\n]{1,60}\s*[:：]\s*)?(?:verbatim\s+)?transcript of (?:the )?(?:khmer|english|audio|meeting|provided audio)/i,
    /^(?:[^:\n]{1,60}\s*:\s*)?(?:here is|here's)\s+(?:the\s+)?(?:verbatim\s+)?transcript\b/i,
    /^(?:[^:\n]{1,60}\s*:\s*)?(?:transcript|final transcript)\s*[:：]\s*$/i,
    // "diagnostic"/"analysis" are extremely unlikely to be a real chosen
    // display name; "probe"/"test" are not safe here - see the matching fix
    // and full explanation in transcript-quality.ts's hasTranscriptionPromptLeakage
    // (this is a duplicate of that same original word list from commit
    // 57e3de1, missed when that one was fixed).
    /^(?:diagnostic|analysis)\s*[:：]/i
  ];

  const cleaned = stripUnknownOnlyLines(splitInlineSpeakerLabels(text.replace(/^```(?:text)?/i, "").replace(/```$/i, "")))
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !noSpeechPatterns.some((pattern) => pattern.test(line)))
    .filter((line) => !boilerplatePatterns.some((pattern) => pattern.test(line)))
    .filter((line) => !/^speaker\s*\d+\s*:\s*$/i.test(line))
    .filter((line) => !isTimestampOnlyTranscript(line))
    .join("\n")
    .trim();

  if (noSpeechPatterns.some((pattern) => pattern.test(cleaned))) return "";
  if (isTimestampOnlyTranscript(cleaned)) return "";
  return normalizeTranscriptDigits(rejoinKhmerWordSpacing(cleaned));
}

// Confirmed live: for a known participant name with an internal space (a
// name+title combo, e.g. "លោកគ្រូ សុភាព"), the transcription model doesn't
// reliably preserve that internal space when it writes out the label
// itself, and separately, sometimes restates a variant of the same name
// again immediately after the real label ("លោកគ្រូសុភាព: លោកគ្រូសុភាព: <real
// speech>", spacing inconsistent between the two occurrences and across
// different chunks/calls) - reproduced repeatedly across live calls on the
// same real recording, so both are handled by whitespace-insensitive
// comparison here rather than a strict regex or a prompt-wording fix
// (an explicit instruction against the restatement did not stop the model
// from doing it in testing).
function normalizeForNameCompare(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function extractLeadingLabel(line: string) {
  const match = line.match(/^([^\n:：]{1,60})[:：]\s*/);
  if (!match) return null;
  return { normalized: normalizeForNameCompare(match[1]), matchedLength: match[0].length };
}

function stripDuplicateLeadingName(body: string, knownSpeaker: string) {
  const normalizedName = normalizeForNameCompare(knownSpeaker);
  const leading = extractLeadingLabel(body);
  if (leading && leading.normalized && leading.normalized === normalizedName) {
    return body.slice(leading.matchedLength).trim();
  }
  return body.trim();
}

export function applyKnownSpeakerLabels(transcript: string, speakerNames: string[]) {
  const names = normalizeSpeakerNames(speakerNames);
  if (!names.length || !transcript.trim()) return transcript;

  let lastSpeaker = "";
  return transcript
    .split(/\n+/)
    .map((line) => {
      const numberedMatch = line.match(/^(?:Speaker|Participant|User|អ្នកនិយាយ|អ្នកចូលរួម)\s*([0-9០-៩]+)\s*[:：]\s*(.*)$/i);
      if (numberedMatch) {
        if (names.length !== 1) {
          const genericLabel = `Speaker ${numberedMatch[1]}`;
          lastSpeaker = genericLabel;
          return `${genericLabel}: ${numberedMatch[2].trim()}`;
        }
        const speakerIndex = speakerNumberToIndex(numberedMatch[1]);
        const fallbackIndex = Number.isFinite(speakerIndex)
          ? ((speakerIndex % names.length) + names.length) % names.length
          : 0;
        const speakerName = names[speakerIndex] ?? names[fallbackIndex];
        lastSpeaker = speakerName;
        return `${speakerName}: ${numberedMatch[2].trim()}`;
      }

      const leadingLabel = extractLeadingLabel(line);
      const knownSpeaker = leadingLabel
        ? names.find((name) => normalizeForNameCompare(name) === leadingLabel.normalized)
        : undefined;
      if (knownSpeaker && leadingLabel) {
        lastSpeaker = knownSpeaker;
        const body = line.slice(leadingLabel.matchedLength);
        return `${knownSpeaker}: ${stripDuplicateLeadingName(body, knownSpeaker)}`;
      }

      const unidentifiedMatch = line.match(
        /^(?:Unknown\s+Speaker|Unknown|Speaker|Participant|User|អ្នកនិយាយមិនស្គាល់|អ្នកនិយាយ|អ្នកចូលរួម)\s*[:：]\s*(.*)$/i
      );
      if (unidentifiedMatch) {
        const speakerName = names.length === 1 ? names[0] : "Unknown Speaker";
        lastSpeaker = speakerName;
        return `${speakerName}: ${unidentifiedMatch[1].trim()}`;
      }

      // The transcription prompt requests one turn per line. If a provider
      // omits the label anyway, keep the continuation with the previous speaker.
      // With several known speakers, assigning an unlabeled line to the first
      // participant is a name guess, so leave it unknown instead.
      const speakerName = lastSpeaker || (names.length === 1 ? names[0] : "Unknown Speaker");
      lastSpeaker = speakerName;
      return `${speakerName}: ${line.trim()}`;
    })
    .join("\n")
    .trim();
}

const genericSpeakerLabelPattern =
  /^(?:Unknown\s+Speaker|Unknown|Speaker|Participant|User|Woman|Man|Female|Male|អ្នកនិយាយមិនស្គាល់|អ្នកនិយាយ|អ្នកចូលរួម)\s*(?:[0-9០-៩]+)?$/i;

// Confirmed live: a leaked reasoning pass ("Speaker 1 (cartoon character
// female/kid):", "Let's double-check all Khmer segments carefully.Speaker
// 1:") still matches the "any text before a colon" line shape and isn't
// caught by genericSpeakerLabelPattern's exact "Speaker N" match, so it
// gets saved as a real participant name and shown as a "known speaker" chip
// in the UI. A real spoken name is short and has none of this shape - reject
// anything with a parenthetical aside, a "Let's ..." lead-in, or that's
// simply too long to plausibly be a name someone said about themselves.
function looksLikeLeakedSpeakerLabel(label: string) {
  return /[()]/.test(label) || /\bLet'?s\b/i.test(label) || label.length > 40;
}

// A call participant who never typed their own name joins with a literal
// placeholder display name - "Local User" client-side (readSavedParticipantName
// in livekit-call-room.tsx) or "KhmerMeet User" server-side (cleanDisplayName
// in livekit-token/route.ts). Treating that placeholder as a genuine known
// name would be mistaken for a verified identity and show up in the
// transcript, summary, and any translation.
const placeholderParticipantNames = new Set(["local user", "khmermeet user"]);

// Blank counts as a placeholder too: an empty/whitespace name is just as
// unusable as "Local User" for labeling or as a transcription hint. Most
// callers already guard emptiness separately, but not all (see
// transcribe/route.ts), and the client-side mirror of this check in
// livekit-call-room.tsx treats blank the same way - keeping the two
// contracts identical avoids a subtle split in behavior later.
export function isPlaceholderParticipantName(name: string | null | undefined) {
  const trimmed = (name ?? "").trim().toLowerCase();
  return !trimmed || placeholderParticipantNames.has(trimmed);
}

// Resolves the label a segment should be transcribed/assembled under: the
// registered display name, unless it's just the anonymous-join placeholder,
// in which case a generic "Speaker N" is assigned instead - stable per
// distinct speakerIdentity within one call to the returned function, so two
// different unnamed participants in the same meeting don't collapse into the
// same label. An unknown identity stays generic.
export function createSegmentSpeakerLabelResolver() {
  const genericLabels = new Map<string, string>();
  return (speakerName: string | null | undefined, speakerIdentity: string) => {
    const name = (speakerName ?? "").trim();
    if (name && !isPlaceholderParticipantName(name)) return name;
    if (!genericLabels.has(speakerIdentity)) {
      genericLabels.set(speakerIdentity, `Speaker ${genericLabels.size + 1}`);
    }
    return genericLabels.get(speakerIdentity) as string;
  };
}

// Filter placeholders and leaked reasoning labels from trusted participant
// names before using them as hints or showing them in a transcript.
export function sanitizeKnownSpeakerNames(names: string[]) {
  return names.filter((name) => {
    const trimmed = name.trim();
    return trimmed && !genericSpeakerLabelPattern.test(trimmed) && !looksLikeLeakedSpeakerLabel(trimmed) && !isPlaceholderParticipantName(trimmed);
  });
}

// Confirmed live (2026-09-04): the same mixed-audio recording, re-sent fresh
// with no code change, correctly split into 3 speaker turns on 3 separate
// attempts - but the run that got saved earlier had collapsed the entire
// clip under a single "Speaker 1:" label. This is a different failure shape
// than the already-handled empty-result case: the transcript is non-empty
// and passes every existing quality check, so nothing previously caught it.
// A long multi-person recording that comes back with only one distinct
// speaker label for its whole length is a strong signal that diarization
// silently failed on this particular attempt, not that the room really had
// only one voice - worth one retry before accepting it.
// Splits a transcript into "Name: text" turns, folding continuation lines
// into the turn they belong to so a turn's real length is measured rather
// than just its first line.
function transcriptTurns(transcript: string) {
  const turns: Array<{ label: string; text: string }> = [];
  for (const line of transcript.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:\n]{1,60}):\s+(\S.*)$/);
    if (match) {
      turns.push({ label: match[1].trim(), text: match[2].trim() });
    } else if (turns.length && line.trim()) {
      turns[turns.length - 1].text += ` ${line.trim()}`;
    }
  }
  return turns;
}

function countDistinctSpeakerLabels(transcript: string) {
  return new Set(transcriptTurns(transcript).map((turn) => turn.label)).size;
}

function looksLikeCollapsedMultiSpeaker(transcript: string, singleSpeaker: boolean) {
  if (singleSpeaker) return false;
  const clean = transcript.trim();
  if (clean.length < 400) return false;

  const turns = transcriptTurns(clean);
  // A long, entirely unlabeled result is also a diarization failure. The
  // model was explicitly asked to label even a single voice in mixed audio.
  if (!turns.length) return true;

  const labels = new Set(turns.map((turn) => turn.label));
  if (labels.size <= 1) return true;

  // Partial collapse - the failure the whole-transcript label count above
  // cannot see. Measured on a real 3-person room recording the owner
  // reported: the model separated the first five turns correctly (9 to 190
  // characters each, three labels), then stopped separating and dumped the
  // rest of the meeting into a single turn of 799 characters - 74.5% of all
  // speech, 42x the median of every other turn. That transcript carries
  // three speaker labels, so it passed every existing check while most of
  // the meeting sat under whoever happened to be talking when the model
  // gave up.
  //
  // A genuine long monologue among short exchanges has the same shape, so
  // the thresholds sit far above that: four turns minimum (the model was
  // demonstrably separating), one turn holding 60% of all speech, and that
  // turn at least 8x the median of the rest. A false positive costs one
  // extra request and never a worse transcript - the retry loop keeps
  // whichever attempt is better.
  if (turns.length < 4) return false;
  const lengths = turns.map((turn) => turn.text.length).sort((a, b) => a - b);
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  if (!totalLength) return false;
  const longest = lengths[lengths.length - 1];
  const others = lengths.slice(0, -1);
  const medianOfOthers = others[Math.floor(others.length / 2)] || 1;
  return longest / totalLength >= 0.6 && longest / medianOfOthers >= 8;
}

// Confirmed live (2026-09-04): a real 148.9-second mobile recording came
// back with a transcript of only 35 characters ("...now let's introduce
// ourselves, our name, uh...") - cut off right as the first speaker was
// about to say their name, with over two minutes of real, audible speech
// afterward. Re-sending the exact same compressed audio directly produced
// a full 2100+ character transcript capturing every speaker's
// self-introduction. This is a different failure shape than the collapsed-
// speaker case above (that one has plenty of text, just one label) - here
// the model just stops generating far too early. A transcript that's
// wildly short relative to how long the audio actually is means the
// attempt likely failed partway through, not that the recording was quiet
// or sparse - real speech reliably produces much more than ~2
// characters/second even accounting for pauses.
function looksSeverelyTruncated(transcript: string, durationSeconds: number | null) {
  if (!durationSeconds || durationSeconds < 30) return false;
  const length = transcript.trim().length;
  // Measured against this app's own real transcripts (2026-09-22, one
  // account, Khmer and English, 12 recordings from 18 seconds to 6.7
  // minutes): a healthy transcript runs 8.5 to 12.6 characters per second of
  // audio, and Khmer and English land in the same band, so one number works
  // for both. The rule started at 1.25 per second capped at 4000, which is
  // between 7 and 10 times looser than any real transcript - loose enough
  // that it stayed silent on a real 8.7-minute recording that came back with
  // 1142 characters, about a fifth of what that meeting actually contained.
  // Catching that is the entire point of this check.
  //
  // 6 per second still sits below the quietest healthy recording, so a
  // meeting with genuinely long silences still has room; the cap keeps a
  // multi-hour recording from being asked for an unrealistic amount, while
  // no longer flattening to almost nothing the way a 4000-character ceiling
  // did (that let a 2.5-hour recording pass on 0.44 characters per second).
  // A false positive costs retries and an "incomplete" warning, never a
  // worse transcript - and a wrong warning is the better failure here than
  // silently presenting a fifth of a meeting as the whole of it.
  const minimumExpectedLength = Math.min(40000, Math.max(120, durationSeconds * 6));
  return length < minimumExpectedLength;
}

function speakerNumberToIndex(value: string) {
  const normalized = value.replace(/[០-៩]/g, (digit) => String("០១២៣៤៥៦៧៨៩".indexOf(digit)));
  return Number(normalized) - 1;
}

export function forceSingleSpeakerLabel(transcript: string, speakerName: string) {
  const name = speakerName.trim();
  if (!name || !transcript.trim()) return transcript;

  return transcript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const withoutGenericSpeaker = line
        .replace(/^(?:Speaker|Participant|User|អ្នកនិយាយ|អ្នកចូលរួម)\s*(?:[0-9០-៩]+)?\s*[:：]\s*/i, "")
        .trim();
      const withoutMatchingName = withoutGenericSpeaker.replace(new RegExp(`^${escapeRegExp(name)}\\s*:\\s*`, "i"), "").trim();
      return withoutMatchingName ? `${name}: ${withoutMatchingName}` : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getLocalAudioPath(name: string) {
  return path.join(uploadRoot, path.basename(name));
}

// The same sources as loadStoredAudioAsFile, but handing back the bytes
// instead of wrapping them in a File. A File keeps its own copy and
// file.arrayBuffer() then makes a third, so a caller that only wants the bytes
// was holding a multi-hour recording three times over - 867 MB of heap for a
// real 5-hour, 289 MB meeting, before any of it had been transcribed.
export async function loadStoredAudioBytes(audioUrl: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const normalizedUrl = audioUrl.trim();
  if (!normalizedUrl) throw new Error("Missing audio URL.");

  if (normalizedUrl.startsWith("/api/uploads/")) {
    const idOrName = path.basename(decodeURIComponent(normalizedUrl.split("?")[0]));
    const dbAudio = await prisma.audioFile.findUnique({ where: { id: idOrName } }).catch(() => null);
    if (dbAudio) return { bytes: Buffer.from(dbAudio.data), mimeType: dbAudio.mimeType };
    return { bytes: await readFile(getLocalAudioPath(idOrName)), mimeType: contentTypeFromPath(idOrName) };
  }

  if (normalizedUrl.startsWith("/api/storage/")) {
    const objectPath = normalizedUrl
      .replace(/^\/api\/storage\//, "")
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    const downloaded = await downloadSupabaseAudio(objectPath);
    return { bytes: downloaded.data, mimeType: downloaded.mimeType };
  }

  if (/^https?:\/\//i.test(normalizedUrl)) {
    const response = await fetch(normalizedUrl);
    if (!response.ok) throw new Error("Could not download audio for transcription.");
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type") || contentTypeFromPath(normalizedUrl)
    };
  }

  throw new Error("Unsupported audio storage path.");
}

export async function loadStoredAudioAsFile(audioUrl: string) {
  const normalizedUrl = audioUrl.trim();
  if (!normalizedUrl) throw new Error("Missing audio URL.");

  if (normalizedUrl.startsWith("/api/uploads/")) {
    const idOrName = path.basename(decodeURIComponent(normalizedUrl.split("?")[0]));
    const dbAudio = await prisma.audioFile.findUnique({ where: { id: idOrName } }).catch(() => null);
    if (dbAudio) {
      return new File([Buffer.from(dbAudio.data)], dbAudio.filename, { type: dbAudio.mimeType });
    }

    const data = await readFile(getLocalAudioPath(idOrName));
    return new File([data], idOrName, { type: contentTypeFromPath(idOrName) });
  }

  if (normalizedUrl.startsWith("/api/storage/")) {
    const objectPath = normalizedUrl
      .replace(/^\/api\/storage\//, "")
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    const file = await downloadSupabaseAudio(objectPath);
    return new File([file.data], path.basename(objectPath), { type: file.mimeType });
  }

  if (/^https?:\/\//i.test(normalizedUrl)) {
    const response = await fetch(normalizedUrl);
    if (!response.ok) throw new Error("Could not download audio for transcription.");
    const data = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || contentTypeFromPath(normalizedUrl);
    return new File([data], path.basename(new URL(normalizedUrl).pathname) || "meeting-audio", { type: contentType });
  }

  throw new Error("Unsupported audio storage path.");
}

export async function getStoredAudioSize(audioUrl: string) {
  if (audioUrl.startsWith("/api/storage/")) {
    const objectPath = audioUrl.replace(/^\/api\/storage\//, "").split("/").map(decodeURIComponent).join("/");
    if (isChunkManifestPath(objectPath)) return (await getChunkedAudioManifest(objectPath)).size;
  }
  return (await loadStoredAudioAsFile(audioUrl)).size;
}

export async function deleteStoredAudio(audioUrl: string | null | undefined) {
  const normalizedUrl = audioUrl?.trim();
  if (!normalizedUrl) return;

  if (normalizedUrl.startsWith("/api/uploads/")) {
    const idOrName = path.basename(decodeURIComponent(normalizedUrl.split("?")[0]));
    const dbAudio = await prisma.audioFile.delete({ where: { id: idOrName } }).catch(() => null);
    if (dbAudio) return;
    await unlink(getLocalAudioPath(idOrName)).catch(() => undefined);
    return;
  }

  if (normalizedUrl.startsWith("/api/storage/")) {
    const storage = supabaseStorageClient();
    if (!storage) return;
    const objectPath = normalizedUrl
      .replace(/^\/api\/storage\//, "")
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    const manifest = isChunkManifestPath(objectPath) ? await getChunkedAudioManifest(objectPath).catch(() => null) : null;
    const paths = manifest
      ? [...Array(audioPartCount(manifest.size))].map((_, index) => audioPartPath(objectPath, index))
      : [];
    const { error } = await storage.client.storage.from(storage.bucket).remove([...paths, objectPath]);
    if (error) throw new Error(error.message);
  }
}

export async function saveLocalAudio(file: File) {
  const ext = file.type.includes("video/mp4")
    ? "mp4"
    : file.type.includes("mp4")
      ? "m4a"
      : file.type.includes("webm")
        ? "webm"
        : file.type.includes("mpeg")
          ? "mp3"
          : "audio";
  const name = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const supabaseUrl = await saveSupabaseAudio(name, file.type || "audio/webm", bytes);
  if (supabaseUrl) return supabaseUrl;

  if (process.env.VERCEL) {
    if (bytes.length > databaseAudioLimit) {
      throw new Error(
        `Recording is ${(bytes.length / (1024 * 1024)).toFixed(1)}MB, which is over the ${(databaseAudioLimit / (1024 * 1024)).toFixed(0)}MB upload limit on this server. Please record a shorter clip, lower the recording quality, or connect Supabase Storage for larger uploads.`
      );
    }
    const audio = await createAudioFileRecord(name, file.type || "audio/webm", bytes);
    return `/api/uploads/${audio.id}`;
  }

  await mkdir(uploadRoot, { recursive: true });
  const fullPath = getLocalAudioPath(name);
  await writeFile(fullPath, bytes);
  return `/api/uploads/${name}`;
}

function supabaseStorageConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "meeting-recordings";
  if (!url || !serviceRoleKey || !bucket) return null;
  return { url, serviceRoleKey, bucket };
}

function supabaseStorageClient() {
  const config = supabaseStorageConfig();
  if (!config) return null;

  return {
    bucket: config.bucket,
    client: createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  };
}

export async function saveSupabaseAudio(filename: string, mimeType: string, data: Buffer) {
  const storage = supabaseStorageClient();
  if (!storage) return "";

  const objectPath = `audio/${new Date().toISOString().slice(0, 10)}/${filename}`;
  const { error } = await storage.client.storage
    .from(storage.bucket)
    .upload(objectPath, data, {
      contentType: mimeType,
      upsert: false
    });

  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
  return `/api/storage/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
}

export async function downloadSupabaseAudio(objectPath: string) {
  const storage = supabaseStorageClient();
  if (!storage) throw new Error("Supabase Storage is not configured.");

  if (isChunkManifestPath(objectPath)) {
    const manifest = await getChunkedAudioManifest(objectPath);
    const bytes = Buffer.allocUnsafe(manifest.size);
    for (let index = 0; index < audioPartCount(manifest.size); index += 1) {
      const partPath = audioPartPath(objectPath, index);
      const { data, error } = await storage.client.storage.from(storage.bucket).download(partPath);
      if (error || !data) throw new Error(error?.message || `Missing audio part ${index + 1}.`);
      const part = Buffer.from(await data.arrayBuffer());
      if (part.length !== audioPartSize(manifest.size, index)) throw new Error(`Audio part ${index + 1} is incomplete.`);
      part.copy(bytes, index * AUDIO_PART_BYTES);
    }
    return { data: bytes, mimeType: manifest.mimeType };
  }

  const { data, error } = await storage.client.storage.from(storage.bucket).download(objectPath);
  if (error || !data) throw new Error(error?.message || "Storage file not found.");

  const arrayBuffer = await data.arrayBuffer();
  return {
    data: Buffer.from(arrayBuffer),
    mimeType: data.type || contentTypeFromPath(objectPath)
  };
}

export async function getChunkedAudioManifest(objectPath: string): Promise<ChunkedAudioManifest> {
  if (!isChunkManifestPath(objectPath)) throw new Error("Invalid chunked audio path.");
  const storage = supabaseStorageClient();
  if (!storage) throw new Error("Supabase Storage is not configured.");
  const { data, error } = await storage.client.storage.from(storage.bucket).download(objectPath);
  if (error || !data) throw new Error(error?.message || "Chunked audio manifest not found.");
  return parseChunkedAudioManifest(JSON.parse(await data.text()), objectPath);
}

export async function readChunkedAudioRange(objectPath: string, start: number, end: number) {
  if (!isChunkManifestPath(objectPath) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < 0 || end < start || end - start >= MAX_AUDIO_RESPONSE_BYTES) {
    throw new Error("Invalid chunked audio range.");
  }
  const bytes = Buffer.allocUnsafe(end - start + 1);
  let written = 0;
  for (let index = Math.floor(start / AUDIO_PART_BYTES); index <= Math.floor(end / AUDIO_PART_BYTES); index += 1) {
    const partStart = index * AUDIO_PART_BYTES;
    const from = Math.max(0, start - partStart);
    const to = Math.min(AUDIO_PART_BYTES - 1, end - partStart);
    const signedUrl = await createSupabaseSignedUrl(audioPartPath(objectPath, index), 60);
    const response = await fetch(signedUrl, { headers: { Range: `bytes=${from}-${to}` }, cache: "no-store" });
    if (response.status !== 206) throw new Error(`Audio part ${index + 1} could not be read.`);
    const part = Buffer.from(await response.arrayBuffer());
    if (part.length !== to - from + 1) throw new Error(`Audio part ${index + 1} is incomplete.`);
    part.copy(bytes, written);
    written += part.length;
  }
  return bytes;
}

export async function listSupabaseStorageFolder(prefix: string) {
  const storage = supabaseStorageClient();
  if (!storage) throw new Error("Supabase Storage is not configured.");

  const { data, error } = await storage.client.storage
    .from(storage.bucket)
    .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((entry) => entry.id)
    .map((entry) => `${prefix}/${entry.name}`);
}

// Lets the browser upload the final recording blob directly to Supabase
// Storage, bypassing Vercel's hard 4.5MB request-body ceiling entirely
// (see the comment on `databaseAudioLimit` above) - the signed token
// authorizes that one upload on its own, no RLS policy needed
// (see @supabase/storage-js's `uploadToSignedUrl` docs: "RLS policy
// permissions required: none").
export async function createSupabaseUploadTicket(filename: string) {
  const config = supabaseStorageConfig();
  const storage = supabaseStorageClient();
  if (!config || !storage) return null;

  const objectPath = `audio/${new Date().toISOString().slice(0, 10)}/${filename}`;
  const { data, error } = await storage.client.storage.from(storage.bucket).createSignedUploadUrl(objectPath);
  if (error || !data) throw new Error(error?.message || "Could not create an upload ticket.");

  return {
    bucket: storage.bucket,
    supabaseUrl: config.url,
    objectPath,
    token: data.token,
    audioUrl: `/api/storage/${objectPath.split("/").map(encodeURIComponent).join("/")}`
  };
}

export async function createSupabaseChunkedUploadTicket(size: number, mimeType: string) {
  const config = supabaseStorageConfig();
  const storage = supabaseStorageClient();
  if (!config || !storage) return null;

  const count = audioPartCount(size);
  const manifestPath = `audio/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}/manifest.chunks.json`;
  const manifest: ChunkedAudioManifest = { kind: "khmermeet-chunked-audio", version: 1, size, mimeType };
  const parts = await Promise.all([...Array(count)].map(async (_, index) => {
    const objectPath = audioPartPath(manifestPath, index);
    const { data, error } = await storage.client.storage.from(storage.bucket).createSignedUploadUrl(objectPath);
    if (error || !data) throw new Error(error?.message || `Could not prepare audio part ${index + 1}.`);
    return { objectPath, token: data.token, start: index * AUDIO_PART_BYTES, end: index * AUDIO_PART_BYTES + audioPartSize(size, index) };
  }));
  const { error } = await storage.client.storage.from(storage.bucket).upload(
    manifestPath,
    Buffer.from(JSON.stringify(manifest)),
    { contentType: "application/json", upsert: false }
  );
  if (error) throw new Error(error.message);
  return {
    bucket: storage.bucket,
    supabaseUrl: config.url,
    audioUrl: `/api/storage/${manifestPath.split("/").map(encodeURIComponent).join("/")}`,
    cleanupToken: chunkCleanupToken(manifestPath, config.serviceRoleKey),
    parts
  };
}

function chunkCleanupToken(manifestPath: string, secret: string) {
  return createHmac("sha256", secret).update(`chunk-cleanup:${manifestPath}`).digest("hex");
}

export function verifyChunkCleanupToken(audioUrl: unknown, token: unknown) {
  if (typeof audioUrl !== "string" || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return false;
  if (!audioUrl.startsWith("/api/storage/")) return false;
  let manifestPath: string;
  try {
    manifestPath = audioUrl.slice("/api/storage/".length).split("/").map(decodeURIComponent).join("/");
  } catch {
    return false;
  }
  if (!isChunkManifestPath(manifestPath)) return false;
  const config = supabaseStorageConfig();
  if (!config) return false;
  const expected = chunkCleanupToken(manifestPath, config.serviceRoleKey);
  return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
}

export async function createSupabaseSignedUrl(objectPath: string, expiresInSeconds = 3600) {
  const storage = supabaseStorageClient();
  if (!storage) throw new Error("Supabase Storage is not configured.");

  const { data, error } = await storage.client.storage
    .from(storage.bucket)
    .createSignedUrl(objectPath, expiresInSeconds);
  if (error || !data) throw new Error(error?.message || "Could not create signed URL.");
  return data.signedUrl;
}

function contentTypeFromPath(objectPath: string) {
  if (objectPath.endsWith(".mp4")) return "video/mp4";
  if (objectPath.endsWith(".m4a")) return "audio/mp4";
  if (objectPath.endsWith(".mp3")) return "audio/mpeg";
  if (objectPath.endsWith(".webm")) return "audio/webm";
  if (objectPath.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
}

async function createAudioFileRecord(filename: string, mimeType: string, data: Buffer) {
  try {
    return await prisma.audioFile.create({
      data: {
        filename,
        mimeType,
        data,
        size: data.length
      }
    });
  } catch (error) {
    if (!isMissingAudioFileTable(error)) throw error;
    await ensureAudioFileTable();
    return prisma.audioFile.create({
      data: {
        filename,
        mimeType,
        data,
        size: data.length
      }
    });
  }
}

function isMissingAudioFileTable(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("audiofile") && (message.includes("does not exist") || message.includes("not exist"));
}

async function ensureAudioFileTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AudioFile" (
      "id" TEXT NOT NULL,
      "filename" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "data" BYTEA NOT NULL,
      "size" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AudioFile_pkey" PRIMARY KEY ("id")
    )
  `);
}

export async function transcribeAudio(
  audioFile: File,
  speakerNames: string[] = [],
  languageMode: TranscriptionLanguageMode = "km-en",
  options: TranscriptionOptions = {}
) {
  // Live calls use this same path in small, bounded chunks, while saved
  // recordings run a final text cleanup pass after audio transcription.
  if (!hasOpenRouterKey()) return "";
  if (audioFile.size > openRouterAudioLimit) {
    throw new Error(
      options.mode === "live"
        ? "This audio segment is larger than the 24 MB OpenRouter transcription limit."
        : "This saved recording is too large to re-transcribe as a single file (OpenRouter's 24 MB limit covers roughly 25-30 minutes of audio). Full-length transcription already runs automatically in small segments while you record, so long meetings are already captured — this button is only reliable for shorter recordings. Open the meeting to review the transcript captured during recording."
    );
  }

  const normalizedLanguageMode = normalizeTranscriptionLanguageMode(languageMode);
  // Saved uploads first capture the spoken languages. A later text step may
  // translate that transcript, but the audio model must not translate while
  // it is still trying to identify the words. Live chunks retain their
  // selected output mode because they are displayed during the call.
  const audioLanguageMode = options.mode === "live" ? normalizedLanguageMode : "km-en";
  const originalAudioBuffer: Buffer = Buffer.from(await audioFile.arrayBuffer());
  const originalMimeType = audioFile.type || "audio/webm";
  const originalFilename = audioFile.name || "meeting-audio.webm";
  const originalExt = audioExtensionFromMime(originalMimeType);
  // "live" mode is only ever used for many-chunk loops (stored-recording
  // splitting, in-progress-call chunk transcription) where every chunk needs
  // to come back fast. Generating 3 ffmpeg-processed variants and trying up
  // to 4 full-timeout OpenRouter calls per chunk (below) is a one-shot
  // quality maximization meant for a single short upload, not something
  // that scales across dozens of chunks - confirmed live it was the actual
  // cause of a 12-minute recording's chunk loop taking 400s+ even after
  // fixing the chunking itself and raising worker concurrency.
  const skipVariants = options.mode === "live";
  const variantCount = skipVariants ? 0 : (await import("@/lib/ffmpeg")).TRANSCRIPTION_VARIANT_COUNT;
  const attemptBaseName = path.basename(originalFilename, path.extname(originalFilename)) || "meeting-audio";
  const timeoutMs = options.timeoutMs ?? Number(process.env.OPEN_ROUTER_TRANSCRIBE_TIMEOUT_MS ?? 55000);

  // All languages use the configured multimodal transcription model
  // (default: google/gemini-3.8-flash). Keeping one audio-grounded path
  // across Khmer, English, and mixed meetings avoids switching English-only
  // recordings through a separate STT model with different behavior.
  let cleanedTranscript = "";

  // The attempts are ordered best-prepared first, and a later one is now
  // only ever used when the ones before it came back unusable - since
  // repeated listens to the same audio stopped being scored against each
  // other, the winner can only be the first usable result. Running the rest
  // anyway bought nothing and cost everything: three or four more full
  // transcription calls per recording, each with its own timeout, against a
  // server request that has a time limit of its own to fit a long meeting
  // into. So stop at the first usable transcript - the result is identical,
  // it just arrives without paying for the attempts that could not win.
  // Each variant is encoded only when the attempt before it came back
  // unusable, and the untouched original is the last attempt of all.
  for (let index = 0; index <= variantCount; index += 1) {
    let attempt = { audioBuffer: originalAudioBuffer, mimeType: originalMimeType, filename: originalFilename };
    if (index < variantCount) {
      const { prepareAudioVariantForTranscription } = await import("@/lib/ffmpeg");
      const variant = await prepareAudioVariantForTranscription(
        originalAudioBuffer,
        originalExt,
        openRouterAudioLimit,
        index
      );
      // This variant could not be encoded, or came out outside the size the
      // provider accepts. Nothing to send; the next attempt still runs.
      if (!variant) continue;
      attempt = {
        audioBuffer: Buffer.from(variant.buffer),
        mimeType: variant.mimeType,
        filename: `${attemptBaseName}-${variant.filename}`
      };
    }
    const attemptTranscript = await transcribeAndCleanAudioBuffer(
      attempt.audioBuffer,
      attempt.mimeType,
      attempt.filename,
      audioLanguageMode,
      timeoutMs,
      speakerNames,
      options.singleSpeaker ?? false
    );
    cleanedTranscript = chooseMoreCompleteTranscript(cleanedTranscript, attemptTranscript);
    if (hasUsableTranscript(cleanedTranscript) && !isLikelyIncompleteTranscript(cleanedTranscript)) break;
  }

  if (!cleanedTranscript || options.mode === "live") {
    return options.formatNumberWords === false ? cleanedTranscript : spellTranscriptNumberWords(cleanedTranscript);
  }
  assertUsableSavedTranscript(cleanedTranscript);

  // The default mode is a record of the words actually spoken. A text-only
  // model cannot check the audio and may silently replace a correct word.
  if (normalizedLanguageMode === "km-en") return spellTranscriptNumberWords(cleanedTranscript);

  const refinedTranscript = await refineOpenRouterTranscript(
    cleanedTranscript,
    normalizedLanguageMode,
    normalizeSpeakerNames(speakerNames),
    Math.min(timeoutMs, 55000)
  ).catch(() => cleanedTranscript);

  const cleanedRefinedTranscript = applyKnownSpeakerLabels(
    addSingleSpeakerLabel(keepTrustedSpeakerLabels(cleanTranscriptionText(refinedTranscript), speakerNames), speakerNames),
    speakerNames
  );
  const bestTranscript = chooseBetterSavedTranscript(cleanedTranscript, cleanedRefinedTranscript, normalizedLanguageMode);
  assertUsableSavedTranscript(bestTranscript);
  return spellTranscriptNumberWords(bestTranscript);
}

async function transcribeAndCleanAudioBuffer(
  audioBuffer: Buffer,
  mimeType: string,
  filename: string,
  languageMode: TranscriptionLanguageMode,
  timeoutMs: number,
  speakerNames: string[],
  singleSpeaker: boolean
) {
  const rawTranscript = await transcribeOpenRouterAudioViaChat(
    audioBuffer,
    mimeType,
    filename,
    languageMode,
    timeoutMs,
    normalizeSpeakerNames(speakerNames),
    singleSpeaker
  );
  return applyKnownSpeakerLabels(
    addSingleSpeakerLabel(keepTrustedSpeakerLabels(cleanTranscriptionText(rawTranscript), speakerNames), speakerNames),
    speakerNames
  );
}

function audioExtensionFromMime(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

// Outer windows bound memory and carry progress across requests. For long
// recordings, each non-silent outer window is verified in shorter listens
// before it is marked complete.
//
// Two-minute windows fit within one parallel round for recordings up to
// about 20 minutes. Use them below only after a severely truncated whole-
// audio result; longer recordings still need bounded windows to finish
// within one request's time budget.
//
// An earlier attempt at 30-45s (tried before splitAudioIntoChunks' silence-
// aware cut fix existed) found real content loss on a long 727s recording
// compared to 15s - but that predates cutting at actual silence instead of
// a flat time offset, which was very likely the real cause (a fixed-interval
// cut landing mid-sentence/mid-word loses more than a silence-aware one
// does). Revisit with fresh live testing if a similar loss shows up again at
// this much larger size.
// Shorter windows reduce the amount of speech a model can silently skip or
// replace with repetitive text in one request, especially on multi-hour MP3s.
const STORED_TRANSCRIPTION_SEGMENT_SECONDS = 4 * 60;
// Confirmed live against a real 727s recording: per-chunk transcription
// (OpenRouter multimodal call, sometimes doubled by the empty-result safety-
// net retry) averages ~60s. At the old concurrency of 4, a 12-minute
// recording (25 chunks) needed ~7 sequential rounds and blew past the ~180s
// transcription budget (414s observed). Raising concurrency is what actually
// cuts wall time - the per-call latency itself doesn't shrink.
const STORED_TRANSCRIPTION_CONCURRENCY = 10;
const WHOLE_AUDIO_TRANSCRIPTION_MAX_MS = 75000;
// Bug found on review (2026-09-02): raising this to 180000 broke the
// whole-audio-first change from earlier today. wholeAudioTimeoutMs below is
// computed as remainingMsAtStart - CHUNK_FALLBACK_RESERVE_MS, and the real
// caller-supplied budget (transcriptionBudget() in the transcribe route) is
// itself capped at 180000 - so with this reserve also at 180000, that
// subtraction landed at ~0 or negative on every real call, and the
// `wholeAudioTimeoutMs > 10000` guard then skipped the whole-audio attempt
// every time, silently reverting straight to per-chunk transactions again.
// Kept at the original 90000, which leaves whole-audio a real ~75s window
// against a typical ~180s total budget. The per-chunk timeout cap and
// chunk-size increase from that same change are unaffected and still apply
// whenever this fallback does run - it just self-limits to whatever time is
// actually left rather than needing a large fixed reserve up front.
const CHUNK_FALLBACK_RESERVE_MS = 90000;
const EMPTY_AUDIO_BUFFER = Buffer.alloc(0);
// Ceiling on how much audio may be in flight at once. Each window in flight
// costs roughly its own size again as a copy, and a third as much on top once
// base64-encoded into the request body, so ten 15 MB windows is around half a
// gigabyte of a 1024 MB function. Capping the bytes rather than the count
// keeps short recordings at full concurrency while stopping a long one from
// running the function out of memory.
const MAX_IN_FLIGHT_AUDIO_BYTES = 90 * 1024 * 1024;

// Finished chunk transcripts, kept outside this function so a long recording
// can be completed across several requests instead of restarting each time.
// load() is given the number of windows this run split the recording into, so
// an implementation can discard anything stored under a different split rather
// than stitching together windows that no longer line up.
export type StoredChunkTranscripts = {
  load: (totalChunks: number) => Promise<Record<number, string>>;
  save: (chunkIndex: number, totalChunks: number, text: string) => Promise<void>;
};

// Transcribe a complete saved recording in bounded audio windows. Sending a
// long meeting as one giant multimodal request fits the byte limit after
// compression, but providers can still skip stretches of speech or stop early
// on long audio. Chunking here happens only after the original recording is
// safely stored, then transcripts are stitched back in chronological order.
export async function transcribeStoredTrackRecording(
  audioUrl: string,
  _languageMode: TranscriptionLanguageMode,
  timeoutMs = 120000,
  // onIncomplete fires when a window was skipped or returned too little
  // speech. The caller must present the assembled text as partial.
  options: {
    speakerNames?: string[];
    singleSpeaker?: boolean;
    onIncomplete?: () => void;
    onSilentWindow?: (durationSeconds: number) => void;
    // Where finished chunks are kept between requests. Everything here has to
    // finish inside one serverless request, and a long meeting cannot: a
    // A 5-hour recording has many windows and there is only time for a few.
    // Without somewhere to put the finished ones, every attempt redid the
    // same early windows and stopped in the same place, so the end of a long
    // meeting could never be reached however many times anyone pressed the
    // button - while the message told them pressing it would continue.
    chunkStore?: StoredChunkTranscripts;
    // The meeting's known length, when the caller has it. Without it the
    // whole-file attempt below has to be started before anything can tell it
    // is hopeless, and on a long recording just preparing that attempt -
    // writing the file out and probing it - can spend the entire request.
    durationSeconds?: number;
  } = {}
) {
  // Bytes, not a File: see loadStoredAudioBytes. Reassignable so the
  // recording can be released the moment it has been cut into windows.
  const source = await loadStoredAudioBytes(audioUrl);
  const sourceMimeType = source.mimeType || "audio/webm";
  // This is always a whole-call recording (minutes to hours), never a
  // short clip - skipPrimaryModel avoids the ~60-90s wasted on chirp-3's
  // confirmed rejection of longer English audio before falling back.
  const speakerNames = normalizeSpeakerNames(options.speakerNames ?? []);
  // First write down what was spoken, in its original language. Translation
  // happens once after the audio-grounded transcript has been assembled.
  // Cached windows therefore contain source speech regardless of the output
  // language selected for a later pass.
  const audioLanguageMode: TranscriptionLanguageMode = "km-en";
  const transcribeOptions: TranscriptionOptions = {
    mode: "live",
    timeoutMs,
    singleSpeaker: options.singleSpeaker ?? true,
    skipPrimaryModel: true,
    formatNumberWords: false
  };
  const { compressWholeAudioForTranscription, splitAudioIntoChunks, splitAudioIntoOverlappingHalves, isAudioWindowSilent, estimatedAudibleAudioSeconds } = await import("@/lib/ffmpeg");
  // Deliberately reassignable: on a multi-hour recording this is hundreds of
  // megabytes, and it is dead weight the moment the audio has been cut into
  // windows. Measured on a real 5-hour, 289 MB recording: holding the source
  // alongside the windows and the requests in flight peaked at 970 MB of a
  // 1024 MB function - close enough to crash that the recording this whole
  // feature exists for was the one that would fail.
  let buffer = source.bytes;
  const ext = audioExtensionFromMime(sourceMimeType);
  const deadline = Date.now() + Math.max(1000, timeoutMs);
  // Held in one object rather than as separate `let`s: these are assigned
  // inside the async IIFE below, and TypeScript's narrowing would otherwise
  // read them back out here as their initial values.
  const wholeAudioAttempt: { buffer: Buffer | null; durationSeconds: number | null; looksIncomplete: boolean; missingSpeakerLabels: boolean } = {
    buffer: null,
    durationSeconds: null,
    looksIncomplete: false,
    missingSpeakerLabels: false
  };
  // Try the complete enhanced recording first because it gives the model the
  // best speaker and sentence context. If it comes back empty or implausibly
  // short, fall back to bounded windows below instead of accepting partial
  // text as the complete meeting.
  const remainingMsAtStart = deadline - Date.now();
  // Beyond this length the whole-file attempt cannot succeed and is not free
  // to discover that: compressWholeAudioForTranscription writes the entire
  // recording to disk and probes it before it can refuse, which on a
  // multi-hour file is minutes of a request that only has a few. Long
  // recordings go straight to the chunked path, which is the only thing that
  // was ever going to finish them.
  // For longer recordings, bounded windows make it possible to verify that
  // each stretch produced speech instead of trusting one fluent partial reply.
  const wholeAudioMaxSeconds = STORED_TRANSCRIPTION_SEGMENT_SECONDS;
  const skipWholeAudio = Boolean(options.durationSeconds && options.durationSeconds > wholeAudioMaxSeconds);
  const wholeAudioTimeoutMs = skipWholeAudio
    ? 0
    : Math.min(WHOLE_AUDIO_TRANSCRIPTION_MAX_MS, remainingMsAtStart - CHUNK_FALLBACK_RESERVE_MS);
  const wholeTranscript =
    wholeAudioTimeoutMs > 10000
      ? await (async () => {
          // Bound the encode to a share of what's left rather than its own
          // fixed 2-minute ceiling: on a long recording this step can burn
          // the entire budget before the chunked fallback below ever gets
          // to run, which is how a long meeting ends up with a silently
          // truncated transcript.
          const compressTimeoutMs = Math.max(20000, Math.min(120000, Math.floor((deadline - Date.now()) * 0.35)));
          const { buffer: wholeAudio, durationSeconds } = await compressWholeAudioForTranscription(
            buffer,
            ext,
            openRouterAudioLimit,
            compressTimeoutMs
          );
          wholeAudioAttempt.buffer = Buffer.from(wholeAudio);
          wholeAudioAttempt.durationSeconds = durationSeconds;
          let transcript = await transcribeAndCleanAudioBuffer(
            Buffer.from(wholeAudio),
            "audio/mp4",
            "complete-recording.m4a",
            audioLanguageMode,
            wholeAudioTimeoutMs,
            speakerNames,
            options.singleSpeaker ?? true
          );
          const looksBroken = (candidate: string) =>
            looksLikeCollapsedMultiSpeaker(candidate, options.singleSpeaker ?? true) ||
            looksSeverelyTruncated(candidate, durationSeconds);
          // Confirmed live: one retry isn't always enough - a real hard
          // recording truncated on 2 attempts in a row before a 3rd
          // succeeded. A near-empty transcript silently accepted is worse
          // than one extra request, so keep trying up to this many times
          // total before giving up and accepting whatever came back.
          const maxWholeAudioAttempts = 3;
          for (let attempt = 2; attempt <= maxWholeAudioAttempts && looksBroken(transcript); attempt += 1) {
            const retryTimeoutMs = deadline - Date.now() - CHUNK_FALLBACK_RESERVE_MS;
            if (retryTimeoutMs <= 10000) break;
            const lengthBeforeRetry = transcript.length;
            const labelsBeforeRetry = countDistinctSpeakerLabels(transcript);
            const retryTranscript = await transcribeAndCleanAudioBuffer(
              Buffer.from(wholeAudio),
              "audio/mp4",
              "complete-recording.m4a",
              audioLanguageMode,
              Math.min(WHOLE_AUDIO_TRANSCRIPTION_MAX_MS, retryTimeoutMs),
              speakerNames,
              options.singleSpeaker ?? true
            ).catch(() => "");
            if (hasUsableTranscript(retryTranscript) && !looksBroken(retryTranscript)) {
              transcript = retryTranscript;
              break;
            }
            // Keep the least-broken candidate even if every attempt stays
            // imperfect, so a partial retry can't discard useful text a
            // shorter/worse later attempt failed to match.
            if (hasUsableTranscript(retryTranscript) && retryTranscript.length > transcript.length) {
              transcript = retryTranscript;
            }
            // A retry that reproduced the previous attempt almost exactly -
            // same length and the same number of speakers - means the model
            // is being consistent, not flaky, so a third attempt returns the
            // same thing again and is billed for it. This fires on the
            // ordinary single-voice recording, where
            // looksLikeCollapsedMultiSpeaker keeps flagging text that was
            // right all along: measured at 3 calls before this change, 2
            // after, same transcript.
            //
            // The speaker count has to match too. Diarization is exactly what
            // varies between attempts on identical audio, so a retry that
            // came back the same length but split the speakers differently is
            // evidence the model is still moving, and stopping there would
            // throw away the attempt that lands it. The truncation case is
            // unaffected either way - there the attempts differ in length by
            // far more than this.
            if (
              hasUsableTranscript(retryTranscript) &&
              Math.abs(retryTranscript.length - lengthBeforeRetry) <= Math.max(20, lengthBeforeRetry * 0.05) &&
              countDistinctSpeakerLabels(retryTranscript) === labelsBeforeRetry
            ) {
              break;
            }
          }
          // Truncation and a completely unlabeled mixed recording need a
          // fresh audio-grounded pass. A single label alone is not enough:
          // one person may genuinely speak throughout, and retrying windows
          // cannot prove otherwise.
          wholeAudioAttempt.missingSpeakerLabels =
            !(options.singleSpeaker ?? true) && transcript.length >= 400 && transcriptTurns(transcript).length === 0;
          wholeAudioAttempt.looksIncomplete =
            looksSeverelyTruncated(transcript, durationSeconds) || wholeAudioAttempt.missingSpeakerLabels;
          return transcript;
        })().catch(() => "")
      : "";

  if (hasUsableTranscript(wholeTranscript) && !wholeAudioAttempt.looksIncomplete) {
    return spellTranscriptNumberWords(cleanTranscriptionText(wholeTranscript));
  }

  // Reuse the already-enhanced whole-file encode as the chunk source - but
  // only while it still holds real detail. compressWholeAudioForTranscription
  // picks its bitrate so the *entire* recording fits the provider's 24 MB
  // ceiling, so anything past roughly an hour is encoded near its 16 kbps
  // floor. Splitting that into two-minute windows would hand every chunk
  // audio noticeably worse than the original recording, which is the
  // opposite of what the quiet-voice enhancement is here to do - and the
  // chunk path re-runs prepareAudioForTranscription on its own anyway when a
  // chunk comes back empty. Shorter recordings encode at the full 48 kbps
  // with the speech filter already applied, so reusing the encode there is a
  // genuine win and saves an FFmpeg pass per chunk.
  const preparedWholeAudioBitrate =
    wholeAudioAttempt.buffer && wholeAudioAttempt.durationSeconds
      ? (wholeAudioAttempt.buffer.length * 8) / wholeAudioAttempt.durationSeconds
      : 0;
  const preparedWholeAudio = preparedWholeAudioBitrate >= 32000 ? wholeAudioAttempt.buffer : null;
  const reusePreparedWholeAudio = preparedWholeAudio !== null;
  const chunkSourceBuffer = preparedWholeAudio ?? buffer;
  const chunkSourceExt = reusePreparedWholeAudio ? "m4a" : ext;
  const chunkSourceMimeType = reusePreparedWholeAudio ? "audio/mp4" : sourceMimeType;
  // A short recording that yielded only a tiny fraction of expected speech
  // must be retried in genuinely smaller windows. Re-sending the same 7- or
  // 20-minute file as a single "chunk" repeats the truncation failure.
  // Keep four-minute windows for longer meetings so they still fit one server
  // request's time budget.
  const knownDuration = wholeAudioAttempt.durationSeconds ?? options.durationSeconds;
  // A fluent four-minute answer can still skip a sentence or a number phrase
  // in its middle. On long recordings, only ordered short listens can mark a
  // window complete; legacy length-only cache rows need that verification.
  const requireShortCoverage = Boolean(knownDuration && knownDuration > 20 * 60);
  const fallbackSegmentSeconds =
    knownDuration && knownDuration <= 20 * 60
      ? 2 * 60
      : STORED_TRANSCRIPTION_SEGMENT_SECONDS;
  const split = await splitAudioIntoChunks(
    chunkSourceBuffer,
    chunkSourceExt,
    openRouterAudioLimit,
    fallbackSegmentSeconds
  );
  const chunks = split.chunks;
  // The windows now hold their own copy of the audio, so every reference to
  // the whole recording can go. On a 5-hour file that is nearly 300 MB
  // released before a single request is built.
  buffer = EMPTY_AUDIO_BUFFER;
  wholeAudioAttempt.buffer = null;

  // Anything finished by an earlier request is already done - skip straight
  // past it and spend this request's budget on what is still missing.
  const alreadyDone: Record<number, string> = options.chunkStore
    ? await options.chunkStore.load(chunks.length).catch(() => ({}) as Record<number, string>)
    : {};
  const transcripts = new Array<string>(chunks.length).fill("");
  const completed = new Array<boolean>(chunks.length).fill(false);
  for (const [key, text] of Object.entries(alreadyDone)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= chunks.length) continue;
    // Recheck even cached silent windows: older detection could classify a
    // very quiet voice as silence. A cached blank must not permanently hide
    // speech after the threshold is corrected.
    if (text === "") {
      if (await isAudioWindowSilent(chunks[index].path, chunks[index].durationSeconds)) {
        completed[index] = true;
        options.onSilentWindow?.(chunks[index].durationSeconds ?? 0);
      }
      continue;
    }
    const savedWindow = unpackSavedAudioChunkText(text);
    if (await isAudioWindowSilent(chunks[index].path, chunks[index].durationSeconds)) {
      completed[index] = true;
      options.onSilentWindow?.(chunks[index].durationSeconds ?? 0);
      await options.chunkStore?.save(index, chunks.length, "").catch(() => undefined);
      continue;
    }
    const trustedText = keepTrustedSpeakerLabels(savedWindow.text, speakerNames);
    if (hasUsableTranscript(trustedText)) {
      transcripts[index] = trustedText;
      // An older pass may have saved only the first few words of this
      // window. Keep those words visible, but listen to the audio again.
      completed[index] = !savedWindow.incomplete &&
        !hasAbbreviatedSpokenNumber(trustedText) &&
        (requireShortCoverage
          ? savedWindow.covered
          : !looksSeverelyTruncated(trustedText, chunks[index].durationSeconds));
    }
  }
  const queue = chunks.map((chunk, index) => ({ chunk, index })).filter((entry) => !completed[entry.index]);
  // Set by the workers below, read after they finish - held on an object
  // because TypeScript would narrow a plain `let` assigned only inside a
  // nested function back to its initial value at the outer read.
  const chunkOutcome = { anyStillTruncated: false };

  async function worker() {
    while (queue.length) {
      const next = queue.shift();
      if (!next) return;

      const remainingMs = deadline - Date.now();
      if (remainingMs < 20000) return;

      if (await isAudioWindowSilent(next.chunk.path, next.chunk.durationSeconds)) {
        completed[next.index] = true;
        transcripts[next.index] = "";
        options.onSilentWindow?.(next.chunk.durationSeconds ?? 0);
        await options.chunkStore?.save(next.index, chunks.length, "").catch(() => undefined);
        await rm(next.chunk.path, { force: true }).catch(() => undefined);
        continue;
      }

      // Read only while this window is being worked on. Holding every window
      // in memory at once is what put a 5-hour recording over the function's
      // memory limit before it could finish.
      const chunkBytes = await readFile(next.chunk.path).catch(() => null);
      if (!chunkBytes) continue;
      const chunkFile = new File(
        [new Uint8Array(chunkBytes)],
        chunks.length === 1 ? `recording.${chunkSourceExt}` : `recording-part-${String(next.index + 1).padStart(3, "0")}.${chunkSourceExt}`,
        { type: chunkSourceMimeType }
      );
      // Cap sized for STORED_TRANSCRIPTION_SEGMENT_SECONDS (4 min chunks,
      // not 4s) - a much longer chunk needs more than 90s to transcribe.
      // Workers run in parallel, so a long meeting does not need one timeout
      // period per chunk.
      const chunkTimeoutMs = Math.min(150000, remainingMs - 5000);
      // A size-limited outer chunk may already be at most a minute long.
      // Transcribe that chunk directly instead of asking it to split again.
      const requireSubwindows = requireShortCoverage &&
        Boolean(next.chunk.durationSeconds && next.chunk.durationSeconds > 90);
      // Keep legacy text visible while verifying it against shorter audio
      // listens. Text length alone never proves every phrase was captured.
      const earlierText = transcripts[next.index];
      let savedSubwindows = unpackSavedAudioChunkText(alreadyDone[next.index] ?? "").subwindows ?? null;
      let transcript = !requireShortCoverage && hasUsableTranscript(earlierText)
        ? earlierText
        : requireSubwindows ? "" : await transcribeAudio(chunkFile, speakerNames, audioLanguageMode, {
            ...transcribeOptions,
            timeoutMs: chunkTimeoutMs
          }).catch(() => "");
      if (!requireSubwindows && !hasUsableTranscript(transcript)) {
        const retryRemainingMs = deadline - Date.now();
        if (retryRemainingMs >= 35000) {
          const { prepareAudioForTranscription } = await import("@/lib/ffmpeg");
          const preparedAudio = await prepareAudioForTranscription(
            Buffer.from(chunkBytes),
            chunkSourceExt,
            openRouterAudioLimit,
            Math.min(15000, retryRemainingMs - 20000)
          ).catch(() => null);
          if (preparedAudio) {
            const enhancedRemainingMs = deadline - Date.now() - 5000;
            if (enhancedRemainingMs >= 8000) {
              transcript = await transcribeAndCleanAudioBuffer(
                Buffer.from(preparedAudio),
                "audio/mp4",
                `recording-part-${String(next.index + 1).padStart(3, "0")}-speech.m4a`,
                audioLanguageMode,
                Math.min(45000, enhancedRemainingMs),
                speakerNames,
                options.singleSpeaker ?? true
              ).catch(() => "");
            }
          }
        }
      }
      if (!requireSubwindows && !hasUsableTranscript(transcript) && speakerNames.length) {
        // Confirmed live: a specific known-participant name can make the
        // model return an empty completion for every chunk regardless of
        // audio content or quality (e.g. "probe" - a real user's own test
        // meeting, reproduced directly: the exact same audio chunk returned
        // real text with the name "Sokha" and nothing at all with "probe").
        // The two retries above still pass the same names, so they can't
        // recover from this. Last resort: drop the name hint entirely and
        // accept generic Speaker N labels rather than losing the chunk.
        const noNameRemainingMs = deadline - Date.now();
        if (noNameRemainingMs >= 20000) {
          transcript = await transcribeAudio(chunkFile, [], audioLanguageMode, {
            ...transcribeOptions,
            timeoutMs: Math.min(90000, noNameRemainingMs - 5000)
          }).catch(() => "");
        }
      }
      // Long recordings use short, ordered listens for every audible outer
      // window. Shorter recordings use them only when a whole-window answer
      // appears severely truncated.
      let shorterWindowsIncomplete = false;
      let shorterWindowsListened = false;
      let shorterWindowsCovered = requireShortCoverage && !requireSubwindows &&
        hasUsableTranscript(transcript) && !hasAbbreviatedSpokenNumber(transcript) &&
        !looksSeverelyTruncated(transcript, next.chunk.durationSeconds);
      let shorterWindowsAllSilent = false;
      if (
        next.chunk.durationSeconds && next.chunk.durationSeconds > 90 &&
        (requireSubwindows || (hasUsableTranscript(transcript) &&
          looksSeverelyTruncated(cleanTranscriptionText(transcript), next.chunk.durationSeconds))) &&
        deadline - Date.now() >= 30000
      ) {
        const subwindowSeconds = requireSubwindows || transcript.length < next.chunk.durationSeconds ? 60 : 120;
        const subwindows = await splitAudioIntoChunks(
          Buffer.from(chunkBytes), chunkSourceExt, openRouterAudioLimit, subwindowSeconds
        ).catch(() => null);
        if (subwindows) {
          try {
            if (subwindows.chunks.length > 1) {
              const subparts: Array<SavedAudioSubwindow | null> =
                savedSubwindows?.length === subwindows.chunks.length
                  ? [...savedSubwindows]
                  : new Array(subwindows.chunks.length).fill(null);
              for (let offset = 0; offset < subwindows.chunks.length; offset += 2) {
                const batch = await Promise.all(subwindows.chunks.slice(offset, offset + 2).map(async (part, partOffset) => {
                  const cached = subparts[offset + partOffset];
                  if (cached?.complete) return cached;
                  if (await isAudioWindowSilent(part.path, part.durationSeconds)) return { text: "", complete: true };
                  const budget = deadline - Date.now() - 5000;
                  if (budget < 20000) return cached ?? { text: "", complete: false };
                  const bytes = await readFile(part.path).catch(() => null);
                  if (!bytes) return cached ?? { text: "", complete: false };
                  // A repeat of the same underfilled one-minute listen often
                  // returns the same missing words. On a later pass, divide
                  // only that unfinished minute into two shorter listens.
                  // This replaces the repeat minute call instead of adding
                  // more paid calls to every window in the recording.
                  if (cached?.text && !cached.complete && budget >= 45000 &&
                    part.durationSeconds && part.durationSeconds > 35) {
                    const shorter = await splitAudioIntoOverlappingHalves(
                      Buffer.from(bytes), chunkSourceExt
                    ).catch(() => null);
                    if (shorter) {
                      try {
                        if (shorter.chunks.length > 1) {
                          const pieces = await Promise.all(shorter.chunks.map(async (piece, pieceIndex) => {
                            if (await isAudioWindowSilent(piece.path, piece.durationSeconds)) {
                              return { text: "", complete: true };
                            }
                            const pieceBudget = deadline - Date.now() - 5000;
                            if (pieceBudget < 20000) return { text: "", complete: false };
                            const pieceBytes = await readFile(piece.path).catch(() => null);
                            if (!pieceBytes) return { text: "", complete: false };
                            const pieceFile = new File(
                              [new Uint8Array(pieceBytes)],
                              `recording-part-${next.index + 1}-subpart-${offset + partOffset + 1}-piece-${pieceIndex + 1}.m4a`,
                              { type: "audio/mp4" }
                            );
                            const result = cleanTranscriptionText(await transcribeAudio(
                              pieceFile, speakerNames, audioLanguageMode,
                              { ...transcribeOptions, timeoutMs: Math.min(60000, pieceBudget) }
                            ).catch(() => ""));
                            const audible = await estimatedAudibleAudioSeconds(piece.path, piece.durationSeconds);
                            return {
                              text: result,
                              complete: hasUsableTranscript(result) && !hasAbbreviatedSpokenNumber(result) &&
                                !looksSeverelyTruncated(result, audible)
                            };
                          }));
                          const assembled = cleanTranscriptionText(
                            stitchOverlappingAudioTranscripts(pieces[0].text, pieces[1].text)
                          );
                          const complete = pieces.every((piece) => piece.complete) && hasUsableTranscript(assembled);
                          return {
                            text: chooseAudioWindowText(cached.text, assembled, complete,
                              listenedToEverySubwindow(pieces)),
                            complete
                          };
                        }
                      } finally {
                        await shorter.dispose().catch(() => undefined);
                      }
                    }
                  }
                  const file = new File(
                    [new Uint8Array(bytes)],
                    `recording-part-${next.index + 1}-subpart-${offset + partOffset + 1}.${chunkSourceExt}`,
                    { type: chunkSourceMimeType }
                  );
                  const text = await transcribeAudio(file, speakerNames, audioLanguageMode, {
                    ...transcribeOptions,
                    timeoutMs: Math.min(90000, budget)
                  }).catch(() => "");
                  const cleaned = cleanTranscriptionText(text);
                  const audibleSeconds = await estimatedAudibleAudioSeconds(part.path, part.durationSeconds);
                  const complete = hasUsableTranscript(cleaned) && !hasAbbreviatedSpokenNumber(cleaned) &&
                    !looksSeverelyTruncated(cleaned, audibleSeconds);
                  return {
                    text: chooseAudioWindowText(cached?.text ?? "", cleaned, complete),
                    complete
                  };
                }));
                batch.forEach((part, partOffset) => { subparts[offset + partOffset] = part; });
                savedSubwindows = subparts;
                await options.chunkStore?.save(next.index, chunks.length, packPartialAudioSubwindows(earlierText, subparts)).catch(() => undefined);
                if (deadline - Date.now() < 20000) {
                  break;
                }
              }
              shorterWindowsIncomplete = subparts.some((part) => !part?.complete);
              shorterWindowsListened = listenedToEverySubwindow(subparts);
              shorterWindowsAllSilent = subparts.every((part) => part?.complete && !part.text);
              const assembled = cleanTranscriptionText(subparts.map((part) => part?.text ?? "").filter(Boolean).join("\n"));
              shorterWindowsCovered = !shorterWindowsIncomplete && hasUsableTranscript(assembled);
              transcript = chooseAudioWindowText(transcript, assembled, shorterWindowsCovered, shorterWindowsListened);
            }
          } finally {
            await subwindows.dispose().catch(() => undefined);
          }
        }
      }
      if (shorterWindowsAllSilent) {
        completed[next.index] = true;
        transcripts[next.index] = "";
        options.onSilentWindow?.(next.chunk.durationSeconds ?? 0);
        await options.chunkStore?.save(next.index, chunks.length, "").catch(() => undefined);
        await rm(next.chunk.path, { force: true }).catch(() => undefined);
        continue;
      }
      const chunkTranscriptText = cleanTranscriptionText(transcript);
      if (hasUsableTranscript(chunkTranscriptText) && (shorterWindowsIncomplete || (!shorterWindowsCovered && looksSeverelyTruncated(chunkTranscriptText, next.chunk.durationSeconds)))) {
        // Still short after every attempt. The transcript below is real, but
        // this window is missing speech - say so rather than handing back a
        // gap-filled transcript that looks whole.
        chunkOutcome.anyStillTruncated = true;
      }
      // Done with this window's audio - take it off the disk as well, so a
      // long recording does not leave twenty copies of itself in the
      // function's temporary storage while it works through them.
      await rm(next.chunk.path, { force: true }).catch(() => undefined);
      // Long-recording windows count as done only after short-listen coverage;
      // empty or underfilled results stay partial for the next pass.
      const windowHasSpeech = hasUsableTranscript(chunkTranscriptText);
      const windowIsComplete = windowHasSpeech && !shorterWindowsIncomplete &&
        !hasAbbreviatedSpokenNumber(chunkTranscriptText) &&
        (shorterWindowsCovered || (!requireSubwindows && !looksSeverelyTruncated(chunkTranscriptText, next.chunk.durationSeconds)));
      const bestText = chooseAudioWindowText(earlierText, chunkTranscriptText, shorterWindowsCovered, shorterWindowsListened);
      transcripts[next.index] = bestText;
      completed[next.index] = windowIsComplete && bestText === chunkTranscriptText;
      // Written down the moment it succeeds, not at the end: the request can
      // be cut off at any point, and a window not recorded here has to be
      // paid for all over again next time.
      const savedText = completed[next.index]
        ? requireShortCoverage ? `${COVERED_AUDIO_CHUNK_PREFIX}${bestText}` : bestText
        : savedSubwindows ? packPartialAudioSubwindows(earlierText, savedSubwindows)
        : `${INCOMPLETE_AUDIO_CHUNK_PREFIX}${bestText}`;
      if (options.chunkStore && (bestText || savedSubwindows) && savedText !== alreadyDone[next.index]) {
        await options.chunkStore.save(next.index, chunks.length, savedText).catch(() => undefined);
      }
    }
  }

  // Each window in flight costs its own size again as a copy and a third more
  // once base64-encoded into the request body, so capping the bytes rather
  // than the count keeps a short recording at full concurrency while stopping
  // a long one from running the function out of memory.
  const byteSafeConcurrency = Math.max(2, Math.floor(MAX_IN_FLIGHT_AUDIO_BYTES / (openRouterAudioLimit * 0.7)));
  const workerCount = Math.min(STORED_TRANSCRIPTION_CONCURRENCY, byteSafeConcurrency, queue.length || 1);
  await Promise.all(Array.from({ length: workerCount }, worker));
  await split.dispose().catch(() => undefined);
  const chunkTranscript = cleanTranscriptionText(transcripts.filter(Boolean).join("\n"));
  if (wholeAudioAttempt.missingSpeakerLabels && hasUsableTranscript(wholeTranscript)) {
    // A text-only refine pass cannot reconstruct who said which words. Use
    // the fresh audio-grounded pass only when it covered the full recording
    // and actually separated turns without losing much speech.
    if (
      completed.every(Boolean) &&
      hasUsableTranscript(chunkTranscript) &&
      transcriptTurns(chunkTranscript).length > 0 &&
      chunkTranscript.length >= wholeTranscript.length * 0.65
    ) {
      return spellTranscriptNumberWords(chunkTranscript);
    }
    options.onIncomplete?.();
    return spellTranscriptNumberWords(cleanTranscriptionText(wholeTranscript));
  }
  if (completed.some((done) => !done)) {
    const wholeAudioTranscript = cleanTranscriptionText(wholeTranscript);
    if (hasUsableTranscript(wholeAudioTranscript) && !wholeAudioAttempt.looksIncomplete) {
      return spellTranscriptNumberWords(wholeAudioTranscript);
    }
    options.onIncomplete?.();
    return spellTranscriptNumberWords(hasUsableTranscript(chunkTranscript) ? chunkTranscript : wholeAudioTranscript);
  }

  if (wholeAudioAttempt.looksIncomplete) {
    if (hasUsableTranscript(chunkTranscript)) {
      if (chunkOutcome.anyStillTruncated) options.onIncomplete?.();
      return spellTranscriptNumberWords(chunkTranscript);
    }
    if (hasUsableTranscript(wholeTranscript)) {
      options.onIncomplete?.();
      return spellTranscriptNumberWords(cleanTranscriptionText(wholeTranscript));
    }
  }

  const bestTranscript = chooseMoreCompleteTranscript(chunkTranscript, cleanTranscriptionText(wholeTranscript));
  // Only when the chunked run is what we are actually returning - a
  // whole-audio transcript that won covers the recording end to end.
  if (chunkOutcome.anyStillTruncated && bestTranscript === chunkTranscript) options.onIncomplete?.();
  return spellTranscriptNumberWords(bestTranscript);
}

// The live per-chunk transcription path (transcribeAudio with mode:"live",
// used while a recording is in progress) intentionally skips the refine
// pass below for latency - each chunk needs to come back fast while the
// user is still talking. That means the transcript accumulated during a
// normal recording never gets cleaned up: raw STT output for Khmer comes
// back with every syllable space-separated ("សួស្តី ថ្ងៃ នេះ...") instead
// of properly joined words, confirmed in testing. Call this once after all
// chunks are in to run the same refine + quality-guard pass transcribeAudio
// already does for non-live transcriptions, applied to the whole
// accumulated transcript instead of per-chunk.
// A many-hour meeting's full transcript sent as one refine-pass prompt can
// exceed the text model's context window (no chunking existed here at all
// before - confirmed by reading through this file). Speaker turns are
// one-per-line (see cleanTranscriptionText), so splitting on line
// boundaries never cuts a turn in half.
// This was originally 30000, sized only for the context-window limit above -
// but confirmed live against a real 292-segment call transcript that a
// ~30k-char chunk can send this model into an extremely long or fully
// runaway completion (one trial ran 145s and only stopped because it hit
// the token-length ceiling), regardless of how generous a timeout is given.
// 6000-char chunks stayed on a normal, roughly-linear completion time in
// the same test. Smaller chunks means more parallel requests for a long
// meeting, but they run concurrently (Promise.all below), so wall-clock
// time stays close to a single chunk's time either way.
const REFINE_CHUNK_MAX_CHARS = 6000;

function splitTranscriptForRefine(transcript: string, maxChars: number) {
  const lines = transcript.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const line of lines) {
    const lineLength = line.length + 1;
    if (current.length && currentLength + lineLength > maxChars) {
      chunks.push(current.join("\n"));
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += lineLength;
  }
  if (current.length) chunks.push(current.join("\n"));
  return chunks;
}

export async function refineSavedTranscript(
  transcript: string,
  languageMode: TranscriptionLanguageMode,
  speakerNames: string[] = [],
  timeoutMs = 55000
) {
  const normalizedLanguageMode = normalizeTranscriptionLanguageMode(languageMode);
  const normalizedSpeakerNames = normalizeSpeakerNames(speakerNames);
  const cleanedTranscript = keepTrustedSpeakerLabels(cleanTranscriptionText(transcript), normalizedSpeakerNames);
  if (!hasUsableTranscript(cleanedTranscript)) return cleanedTranscript;

  // In the original-language mode the audio-grounded words are the source
  // of truth. Keep deterministic spacing and digit cleanup, but do not let
  // a text-only proofreader rewrite speech it cannot hear.
  if (normalizedLanguageMode === "km-en") return spellTranscriptNumberWords(cleanedTranscript);

  const deadline = Date.now() + Math.max(1000, timeoutMs);
  const chunks = splitTranscriptForRefine(cleanedTranscript, REFINE_CHUNK_MAX_CHARS);

  const refinedChunks = await Promise.all(
    chunks.map((chunk) =>
      refineOpenRouterTranscript(
        chunk,
        normalizedLanguageMode,
        normalizedSpeakerNames,
        Math.max(1000, deadline - Date.now())
      ).catch(() => chunk)
    )
  );
  const refinedTranscript = refinedChunks.join("\n");

  const labeledTranscript = applyKnownSpeakerLabels(
    keepTrustedSpeakerLabels(cleanedTranscript, normalizedSpeakerNames), normalizedSpeakerNames
  );
  const cleanedRefinedTranscript = applyKnownSpeakerLabels(
    keepTrustedSpeakerLabels(cleanTranscriptionText(refinedTranscript), normalizedSpeakerNames), normalizedSpeakerNames
  );
  return spellTranscriptNumberWords(chooseBetterSavedTranscript(labeledTranscript, cleanedRefinedTranscript, normalizedLanguageMode));
}

export async function transcribeAudioChunks(
  audioChunks: File[],
  speakerNames: string[] = [],
  languageMode: TranscriptionLanguageMode = "km"
) {
  const usableChunks = audioChunks.filter((chunk) => chunk.size > 0);
  if (!usableChunks.length) return "";

  const transcripts: string[] = [];
  for (const chunk of usableChunks) {
    const text = await transcribeAudio(chunk, speakerNames, languageMode, {
      mode: "live",
      timeoutMs: Math.min(Number(process.env.OPEN_ROUTER_TRANSCRIBE_TIMEOUT_MS ?? 55000), 35000)
    });
    if (text && !isTimestampOnlyTranscript(text)) transcripts.push(text);
  }

  return spellTranscriptNumberWords(cleanTranscriptionText(transcripts.join("\n")));
}

function normalizeSpeakerNames(speakerNames: string[]) {
  return speakerNames
    .map((name) => name.trim())
    .filter((name) => name && !isPlaceholderParticipantName(name))
    .slice(0, 100);
}

function addSingleSpeakerLabel(text: string, speakerNames: string[]) {
  const names = normalizeSpeakerNames(speakerNames);
  // Only safe to stamp a name onto unlabeled lines when exactly one speaker
  // is known - with multiple participants there is no way to tell which of
  // them said an unlabeled line, and guessing the first name in the list
  // mislabels everyone else's speech as that one person's.
  if (names.length !== 1 || !text.trim()) return text;
  const [speakerName] = names;

  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const withoutGenericSpeaker = line
        .replace(/^(?:Speaker|Participant|User|អ្នកនិយាយ|អ្នកចូលរួម)\s*(?:[0-9០-៩]+)?\s*[:：]\s*/i, "")
        .trim();
      return /^[^:\n]{1,60}:\s/.test(withoutGenericSpeaker) ? withoutGenericSpeaker : `${speakerName}: ${withoutGenericSpeaker}`;
    })
    .join("\n");
}

// The refine pass is a text-only proofreader with no access to the audio, and
// making broken speech sound finished is exactly what text-only rewriting is
// best at. Its prompt forbids adding words - but nothing ever checked whether
// it obeyed. Every guard in chooseBetterSavedTranscript catches the refined
// version getting SMALLER (fewer tokens, fewer turns, one language squeezed
// out); an invented sentence makes it bigger and sailed straight through.
//
// In km-en mode the refined text is meant to be the raw text respaced and
// tidied, so every part of it should appear somewhere in the raw. Compare with
// whitespace and punctuation stripped, since the pass legitimately rejoins
// Khmer syllables and repairs punctuation, then look for a long stretch of
// material that is nowhere in the raw. A whole fabricated sentence looks
// exactly like that; ordinary tidying, relabelling and de-duplication do not.
//
// km-en only: the translating modes are required to change the words, so there
// is nothing meaningful to compare them against.
// Measured on a Khmer fixture: an honest clean-up (a duplicated recogniser
// line removed, nothing else touched) introduces 0.0% new material, while the
// same clean-up plus one fabricated sentence introduces 19.7%. A contiguous-run
// test was tried first and is too weak for Khmer - ordinary syllables recur
// everywhere and keep breaking the run - so measure the total instead.
const INVENTED_MATERIAL_SHARE = 0.05;
const INVENTED_RUN_GRAM = 5;

function comparableTranscriptText(text: string) {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function inventedMaterialShare(rawTranscript: string, refinedTranscript: string) {
  const raw = comparableTranscriptText(rawTranscript);
  const refined = comparableTranscriptText(refinedTranscript);
  if (raw.length < INVENTED_RUN_GRAM || refined.length < INVENTED_RUN_GRAM) return 0;

  const seen = new Set<string>();
  for (let i = 0; i + INVENTED_RUN_GRAM <= raw.length; i += 1) {
    seen.add(raw.slice(i, i + INVENTED_RUN_GRAM));
  }

  let positions = 0;
  let unmatched = 0;
  for (let i = 0; i + INVENTED_RUN_GRAM <= refined.length; i += 1) {
    positions += 1;
    if (!seen.has(refined.slice(i, i + INVENTED_RUN_GRAM))) unmatched += 1;
  }
  return positions ? unmatched / positions : 0;
}

function chooseBetterSavedTranscript(
  rawTranscript: string,
  refinedTranscript: string,
  languageMode: TranscriptionLanguageMode
) {
  if (!hasUsableTranscript(refinedTranscript)) return rawTranscript;
  if (isLikelyIncompleteTranscript(refinedTranscript)) return rawTranscript;

  const rawScore = transcriptTokenScore(rawTranscript);
  const refinedScore = transcriptTokenScore(refinedTranscript);
  if (rawScore >= 6 && refinedScore < rawScore * 0.8) return rawTranscript;

  const rawTurns = countTranscriptTurns(rawTranscript);
  const refinedTurns = countTranscriptTurns(refinedTranscript);
  // Proofreading has no audio access. Never accept a rewrite that removes
  // all speaker turns the audio transcription already identified.
  if (transcriptTurns(rawTranscript).length && !transcriptTurns(refinedTranscript).length) return rawTranscript;
  if (rawTurns >= 4 && refinedTurns < rawTurns * 0.75) return rawTranscript;

  // The refine pass is a text-only proofreading step with no access to the
  // audio - for km-en mode it's instructed to keep each phrase in whichever
  // language it was actually spoken in, but a text LLM can silently
  // translate one language into the other instead of preserving what was
  // spoken (a known LLM failure mode, distinct from dropping content, so
  // the length-based check above doesn't catch it). A steep drop in either
  // Latin/English words or Khmer characters between the raw (audio-grounded)
  // and refined transcript is a reliable signal that happened, so fall back
  // to the raw transcript rather than silently changing what the audio
  // actually said.
  if (languageMode === "km-en") {
    const rawLatinWords = countLatinWords(rawTranscript);
    const refinedLatinWords = countLatinWords(refinedTranscript);
    if (rawLatinWords >= 4 && refinedLatinWords < rawLatinWords * 0.4) return rawTranscript;

    const rawKhmerChars = countKhmerChars(rawTranscript);
    const refinedKhmerChars = countKhmerChars(refinedTranscript);
    if (rawKhmerChars >= 12 && refinedKhmerChars < rawKhmerChars * 0.4) return rawTranscript;

    // Nothing above notices content the proofreader invented rather than lost.
    if (inventedMaterialShare(rawTranscript, refinedTranscript) >= INVENTED_MATERIAL_SHARE) return rawTranscript;
  }

  return refinedTranscript;
}

function chooseMoreCompleteTranscript(
  currentTranscript: string,
  candidateTranscript: string
) {
  if (!hasUsableTranscript(candidateTranscript) || isLikelyIncompleteTranscript(candidateTranscript)) return currentTranscript;
  if (!hasUsableTranscript(currentTranscript) || isLikelyIncompleteTranscript(currentTranscript)) return candidateTranscript;
  // Repeated listens to the same audio can add fluent words that were never
  // spoken. Length, extra turns, and extra English words are not evidence of
  // accuracy. Keep the first usable result unless it is actually incomplete.
  return currentTranscript;
}

function assertUsableSavedTranscript(transcript: string) {
  if (hasUsableTranscript(transcript) && !isLikelyIncompleteTranscript(transcript)) return;
  throw new Error(
    "No clear speech text was detected. Please check the audio, microphone, selected language, or OpenRouter credits/key, then try again."
  );
}

function isLikelyIncompleteTranscript(transcript: string) {
  const clean = transcript.trim();
  if (!clean || isTimestampOnlyTranscript(clean)) return true;

  const lower = clean.toLowerCase();
  // "silence" is the one word in this list a good transcript can legitimately
  // contain: a model annotating a pause as [silence] partway through, or
  // somebody actually saying it. Matching it anywhere threw that whole
  // transcript away as an empty recording - the caller either discards it
  // with "no clear speech was detected" or pays to transcribe the same audio
  // again. A report that the recording is silent is a sentence or two; a
  // meeting is not, so length tells the two apart. The rest of these are
  // phrases a model only writes when reporting that it found nothing.
  const reportsSilence = lower.includes("silence") && clean.length <= 120;
  if (
    lower.includes("no clear speech") ||
    lower.includes("no discernible speech") ||
    lower.includes("there is no discernible speech") ||
    reportsSilence ||
    lower.includes("no speech detected") ||
    clean.includes("មិនមានសំឡេង") ||
    clean.includes("មិនច្បាស់ទាំងអស់")
  ) {
    return true;
  }

  return false;
}

function countLatinWords(transcript: string) {
  return transcript.match(/[A-Za-z0-9][A-Za-z0-9'_-]*/g)?.length ?? 0;
}

function countKhmerChars(transcript: string) {
  return transcript.match(/[\u1780-\u17FF]/g)?.length ?? 0;
}

function countTranscriptTurns(transcript: string) {
  return transcript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !isTimestampOnlyTranscript(line)).length;
}

function transcriptTokenScore(transcript: string) {
  const latinWords = countLatinWords(transcript);
  const khmerChars = countKhmerChars(transcript);
  return latinWords + Math.ceil(khmerChars / 6);
}
