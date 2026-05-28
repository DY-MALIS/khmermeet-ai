import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload
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

function egressS3Output(filepath: string) {
  const accessKey = requiredEnv("LIVEKIT_EGRESS_S3_ACCESS_KEY");
  const secret = requiredEnv("LIVEKIT_EGRESS_S3_SECRET");
  const bucket = process.env.LIVEKIT_EGRESS_S3_BUCKET?.trim() || process.env.SUPABASE_STORAGE_BUCKET?.trim();
  if (!bucket) throw new Error("LIVEKIT_EGRESS_S3_BUCKET or SUPABASE_STORAGE_BUCKET is not configured.");

  return new EncodedFileOutput({
    filepath,
    fileType: EncodedFileType.MP4,
    disableManifest: true,
    output: {
      case: "s3",
      value: new S3Upload({
        accessKey,
        secret,
        bucket,
        endpoint: requiredEnv("LIVEKIT_EGRESS_S3_ENDPOINT"),
        region: process.env.LIVEKIT_EGRESS_S3_REGION?.trim() || "auto",
        forcePathStyle: process.env.LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE !== "false"
      })
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

export async function startLiveKitRoomRecording(room: string, title?: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filepath = `livekit-egress/${safeSegment(room)}/${timestamp}-${safeSegment(title || room)}.mp4`;
  const info = await egressClient().startRoomCompositeEgress(
    room,
    { file: egressS3Output(filepath) },
    {
      layout: "grid"
    }
  );

  return {
    egressId: info.egressId,
    roomName: info.roomName || room,
    status: info.status,
    filepath,
    storageUrl: storagePlaybackUrl(filepath)
  };
}

export async function stopLiveKitRoomRecording(egressId: string) {
  const info = await egressClient().stopEgress(egressId);
  return {
    egressId: info.egressId,
    roomName: info.roomName,
    status: info.status
  };
}
