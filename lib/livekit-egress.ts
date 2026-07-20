import {
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  SegmentedFileOutput,
  SegmentedFileProtocol
} from "livekit-server-sdk";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
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

function egressS3SegmentsOutput(filenamePrefix: string, playlistName: string) {
  const segmentDuration = Number(process.env.LIVEKIT_EGRESS_SEGMENT_SECONDS ?? 300);
  return new SegmentedFileOutput({
    protocol: SegmentedFileProtocol.HLS_PROTOCOL,
    filenamePrefix,
    playlistName,
    segmentDuration: Number.isFinite(segmentDuration) && segmentDuration > 0 ? segmentDuration : 300,
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

// Two independent egress jobs instead of one combined { file, segments } output.
// The single-file job matches the pattern that was already proven to work in
// production; combining file+segments in one job is allowed by the SDK's types
// but its real-world reliability is unverified, so segments run as a separate,
// best-effort job that can fail without taking down the (more important) file
// recording used for playback.
export async function startLiveKitRoomRecording(room: string, title?: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `livekit-egress/${safeSegment(room)}/${timestamp}-${safeSegment(title || room)}`;
  const filepath = `${base}.m4a`;
  const segmentsPrefix = `${base}/segments`;

  const client = egressClient();
  const fileInfo = await client.startRoomCompositeEgress(room, { file: egressS3Output(filepath) }, { audioOnly: true });

  let segmentsEgressId = "";
  try {
    const segmentsInfo = await client.startRoomCompositeEgress(
      room,
      { segments: egressS3SegmentsOutput(`${segmentsPrefix}/segment`, "index.m3u8") },
      { audioOnly: true }
    );
    segmentsEgressId = segmentsInfo.egressId;
  } catch {
    // Playback recording still works without live transcription segments.
  }

  return {
    fileEgressId: fileInfo.egressId,
    segmentsEgressId,
    roomName: fileInfo.roomName || room,
    filepath,
    storageUrl: storagePlaybackUrl(filepath),
    segmentsPrefix
  };
}

type EgressPollResult =
  | { status: "complete"; egressId: string }
  | { status: "failed"; error: string }
  | { status: "finalizing"; egressId: string }
  | { status: "unknown" };

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

export async function stopLiveKitRoomRecordingAndWait(fileEgressId: string, segmentsEgressId: string) {
  const client = egressClient();
  const [fileResult, segmentsResult] = await Promise.all([
    stopAndWaitOne(client, fileEgressId, 45000),
    segmentsEgressId ? stopAndWaitOne(client, segmentsEgressId, 45000) : Promise.resolve<EgressPollResult>({ status: "complete", egressId: "" })
  ]);
  return { fileResult, segmentsResult };
}

export async function checkLiveKitEgressStatus(fileEgressId: string, segmentsEgressId: string) {
  const client = egressClient();
  const [fileResult, segmentsResult] = await Promise.all([
    pollEgressStatus(client, fileEgressId, { budgetMs: 0 }),
    segmentsEgressId ? pollEgressStatus(client, segmentsEgressId, { budgetMs: 0 }) : Promise.resolve<EgressPollResult>({ status: "complete", egressId: "" })
  ]);
  return { fileResult, segmentsResult };
}
