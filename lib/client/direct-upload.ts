"use client";

import { readJsonResponse } from "@/lib/read-json-response";

type UploadTicket = {
  bucket?: string;
  supabaseUrl?: string;
  objectPath?: string;
  token?: string;
  audioUrl?: string;
  error?: string;
};

function extensionFor(mimeType: string, filename?: string) {
  const nameExt = filename?.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (nameExt && nameExt.length <= 8) return nameExt;
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mpeg")) return "mp3";
  return "audio";
}

// Uploads a recording blob straight from the browser to Supabase Storage,
// bypassing Vercel's hard 4.5MB request-body limit entirely (the blob never
// passes through our own API). Requires NEXT_PUBLIC_SUPABASE_ANON_KEY to be
// set - throws if it's missing or if anything in the handoff fails, so
// callers can fall back to the smaller-recording /api/uploads path.
export async function uploadRecordingDirect(
  blob: Blob,
  filename?: string,
  meetingId?: string,
  room?: string,
  inviteToken?: string
): Promise<string> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("Direct upload is not configured (missing NEXT_PUBLIC_SUPABASE_ANON_KEY).");

  const initResponse = await fetch("/api/uploads/direct-init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ext: extensionFor(blob.type, filename), meetingId, room, inviteToken })
  });
  const ticket = await readJsonResponse<UploadTicket>(initResponse);
  if (!initResponse.ok || !ticket.token || !ticket.objectPath || !ticket.supabaseUrl || !ticket.bucket || !ticket.audioUrl) {
    throw new Error(ticket.error ?? "Could not prepare a direct upload.");
  }

  // Dynamically imported so @supabase/supabase-js isn't in the initial
  // page bundle - it's only needed on the rare path where a recording
  // actually finishes and needs uploading.
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(ticket.supabaseUrl, anonKey);
  const { error } = await supabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.objectPath, ticket.token, blob, {
    contentType: blob.type || "audio/webm"
  });
  if (error) throw new Error(error.message);

  return ticket.audioUrl;
}

export async function uploadMediaDirect(file: File): Promise<string> {
  return uploadRecordingDirect(file, file.name);
}
