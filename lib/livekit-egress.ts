import {
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  S3Upload,
  SegmentedFileOutput,
  SegmentedFileProtocol,
  TrackSource
} from "livekit-server-sdk";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

const liveKitEgressEnvNames = [
  "NEXT_PUBLIC_LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "LIVEKIT_EGRESS_S3_ENDPOINT",
  "LIVEKIT_EGRESS_S3_ACCESS_KEY",
  "LIVEKIT_EGRESS_S3_SECRET"
] as const;

export function getLiveKitEgressSetupStatus() {
  const missingVariables: string[] = liveKitEgressEnvNames.filter((name) => !process.env[name]?.trim());
  if (!process.env.LIVEKIT_EGRESS_S3_BUCKET?.trim() && !process.env.SUPABASE_STORAGE_BUCKET?.trim()) {
    missingVariables.push("LIVEKIT_EGRESS_S3_BUCKET");
  }

  return {
    ready: missingVariables.length === 0,
    missingVariables,
    setupHint:
      "Server Rec needs LiveKit Egress plus S3-compatible storage. In Vercel, add Supabase Storage S3 endpoint, access key, secret, and bucket variables, then redeploy."
  };
}

function liveKitHttpUrl() {
  const url = (process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL || "").trim();
  if (!url) throw new Error("NEXT_PUBLIC_LIVEKIT_URL is not configured.");
  return url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

function egressClient() {
  return new EgressClient(
    liveKitHttpUrl(),
    requiredEnv("LIVEKIT_API_KEY"),
    requiredEnv("LIVEKIT_API_SECRET"),
    { requestTimeout: 30_000 }
  );
}

function roomServiceClient() {
  return new RoomServiceClient(liveKitHttpUrl(), requiredEnv("LIVEKIT_API_KEY"), requiredEnv("LIVEKIT_API_SECRET"));
}

function egressS3Upload() {
  const accessKey = requiredEnv("LIVEKIT_EGRESS_S3_ACCESS_KEY");
  const secret = requiredEnv("LIVEKIT_EGRESS_S3_SECRET");
  const bucket = process.env.LIVEKIT_EGRESS_S3_BUCKET?.trim() || process.env.SUPABASE_STORAGE_BUCKET?.trim();
  if (!bucket) throw new Error("LIVEKIT_EGRESS_S3_BUCKET or SUPABASE_STORAGE_BUCKET is not configured.");

  return new S3Upload({
    accessKey,
    secret,
    bucket,
    endpoint: requiredEnv("LIVEKIT_EGRESS_S3_ENDPOINT"),
    region: process.env.LIVEKIT_EGRESS_S3_REGION?.trim() || "auto",
    forcePathStyle: process.env.LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE !== "false"
  });
}

function egressS3Output(filepath: string) {
  return new EncodedFileOutput({
    filepath,
    fileType: EncodedFileType.MP4,
    disableManifest: true,
    output: {
      case: "s3",
      value: egressS3Upload()
    }
  });
}

export function getEgressSegmentDurationSeconds() {
  const segmentDuration = Number(process.env.LIVEKIT_EGRESS_SEGMENT_SECONDS ?? 300);
  return Number.isFinite(segmentDuration) && segmentDuration > 0 ? segmentDuration : 300;
}

function egressS3SegmentsOutput(filenamePrefix: string, playlistName: string) {
  return new SegmentedFileOutput({
    protocol: SegmentedFileProtocol.HLS_PROTOCOL,
    filenamePrefix,
    playlistName,
    segmentDuration: getEgressSegmentDurationSeconds(),
    disableManifest: true,
    output: {
      case: "s3",
      value: egressS3Upload()
    }
  });
}

function safeSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "meeting";
}

export function storagePlaybackUrl(filepath: string) {
  return `/api/storage/${filepath.split("/").map(encodeURIComponent).join("/")}`;
}

export type TrackJobInfo = {
  egressId: string;
  identity: string;
  name: string;
  segmentsPrefix: string;
  startOffsetMs: number;
};

// One track-composite egress job per participant's microphone, instead of one
// mixed-room job. Overlapping speech gets physically superimposed into a single
// signal the moment audio is mixed, and no transcription model can undo that -
// capturing each participant separately avoids the problem instead of trying to
// fix it after the fact. Best-effort: one participant's job failing must not
// abort the recording or any other participant's job.
async function startTrackEgressJob(
  client: EgressClient,
  room: string,
  recordingBase: string,
  identity: string,
  name: string,
  trackSid: string,
  recordingStartedAt: number
): Promise<TrackJobInfo | null> {
  try {
    const segmentsPrefix = `${recordingBase}/segments/${safeSegment(identity)}`;
    const info = await client.startTrackCompositeEgress(
      room,
      egressS3SegmentsOutput(`${segmentsPrefix}/segment`, "index.m3u8"),
      { audioTrackId: trackSid }
    );
    return { egressId: info.egressId, identity, name, segmentsPrefix, startOffsetMs: Date.now() - recordingStartedAt };
  } catch {
    return null;
  }
}

export async function startLiveKitRoomRecording(room: string, title?: string) {
  const recordingStartedAt = Date.now();
  const timestamp = new Date(recordingStartedAt).toISOString().replace(/[:.]/g, "-");
  const recordingBase = `livekit-egress/${safeSegment(room)}/${timestamp}-${safeSegment(title || room)}`;
  const filepath = `${recordingBase}.m4a`;

  const client = egressClient();
  const fileInfo = await client.startRoomCompositeEgress(room, { file: egressS3Output(filepath) }, { audioOnly: true });

  const trackJobs: TrackJobInfo[] = [];
  try {
    const participants = await roomServiceClient().listParticipants(room);

    // Start track-egress jobs in bounded-concurrency batches instead of one at
    // a time - a meeting can have dozens of participants, and starting jobs
    // sequentially risks blowing past this route's maxDuration before everyone
    // is hooked up for recording.
    const concurrency = 8;
    for (let i = 0; i < participants.length; i += concurrency) {
      const batch = participants.slice(i, i + concurrency);
      const jobs = await Promise.all(batch.map(async (participant) => {
        const speaker = await waitForMicrophoneTrack(room, participant.identity, 4, 1000);
        if (!speaker) return null;
        return startTrackEgressJob(
          client,
          room,
          recordingBase,
          participant.identity,
          participant.name || participant.identity,
          speaker.micTrack.sid,
          recordingStartedAt
        );
      }));
      for (const job of jobs) if (job) trackJobs.push(job);
    }
  } catch {
    // Listing participants failed - the file recording still proceeds. Late
    // joiners can still get a track job via startParticipantTrackEgress.
  }

  return {
    fileEgressId: fileInfo.egressId,
    roomName: fileInfo.roomName || room,
    filepath,
    storageUrl: storagePlaybackUrl(filepath),
    recordingBase,
    recordingStartedAt,
    segmentDurationMs: getEgressSegmentDurationSeconds() * 1000,
    trackJobs
  };
}

// For a participant who joins after the recording already started.
export async function startParticipantTrackEgress(
  room: string,
  recordingBase: string,
  identity: string,
  name: string | undefined,
  recordingStartedAt: number
): Promise<TrackJobInfo | null> {
  const client = egressClient();
  // ParticipantConnected can fire slightly before that participant's mic
  // track is actually published, so wait long enough for browser permission,
  // LiveKit publish, and server participant state to settle.
  const speaker = await waitForMicrophoneTrack(room, identity);
  if (!speaker) return null;
  return startTrackEgressJob(
    client,
    room,
    recordingBase,
    identity,
    name || speaker.participant.name || identity,
    speaker.micTrack.sid,
    recordingStartedAt
  );
}

type EgressPollResult =
  | { status: "complete"; egressId: string }
  | { status: "failed"; error: string }
  | { status: "finalizing"; egressId: string }
  | { status: "unknown" };

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function findMicrophoneTrack(room: string, identity: string) {
  const participants = await roomServiceClient().listParticipants(room);
  const participant = participants.find((entry) => entry.identity === identity);
  const micTrack = participant?.tracks.find((track) => track.source === TrackSource.MICROPHONE);
  return participant && micTrack ? { participant, micTrack } : null;
}

async function waitForMicrophoneTrack(room: string, identity: string, attempts = 8, intervalMs = 1500) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const speaker = await findMicrophoneTrack(room, identity);
    if (speaker) return speaker;
    if (attempt < attempts) await sleep(intervalMs);
  }
  return null;
}

async function pollEgressStatus(
  client: EgressClient,
  egressId: string,
  { pollIntervalMs = 2000, budgetMs = 45000 }: { pollIntervalMs?: number; budgetMs?: number } = {}
): Promise<EgressPollResult> {
  const deadline = Date.now() + budgetMs;
  do {
    const [info] = await client.listEgress({ egressId });
    if (!info) return { status: "unknown" };
    if (info.status === EgressStatus.EGRESS_COMPLETE) return { status: "complete", egressId };
    if (
      info.status === EgressStatus.EGRESS_FAILED ||
      info.status === EgressStatus.EGRESS_ABORTED ||
      info.status === EgressStatus.EGRESS_LIMIT_REACHED
    ) {
      return { status: "failed", error: info.error || "Egress failed." };
    }
    if (Date.now() >= deadline) return { status: "finalizing", egressId };
    await sleep(pollIntervalMs);
  } while (true);
}

async function stopAndWaitOne(client: EgressClient, egressId: string, budgetMs: number) {
  await client.stopEgress(egressId).catch(() => undefined);
  return pollEgressStatus(client, egressId, { budgetMs });
}

export async function stopSingleTrackEgress(egressId: string) {
  return stopAndWaitOne(egressClient(), egressId, 15000);
}

export async function stopLiveKitRoomRecordingAndWait(fileEgressId: string, trackEgressIds: string[]) {
  const client = egressClient();
  const [fileResult, ...trackResultsList] = await Promise.all([
    stopAndWaitOne(client, fileEgressId, 45000),
    ...trackEgressIds.map((id) => stopAndWaitOne(client, id, 45000))
  ]);
  return {
    fileResult,
    trackResults: trackEgressIds.map((egressId, index) => ({ egressId, result: trackResultsList[index] }))
  };
}

export async function checkLiveKitEgressStatus(fileEgressId: string, trackEgressIds: string[]) {
  const client = egressClient();
  const [fileResult, ...trackResultsList] = await Promise.all([
    pollEgressStatus(client, fileEgressId, { budgetMs: 0 }),
    ...trackEgressIds.map((id) => pollEgressStatus(client, id, { budgetMs: 0 }))
  ]);
  return {
    fileResult,
    trackResults: trackEgressIds.map((egressId, index) => ({ egressId, result: trackResultsList[index] }))
  };
}
