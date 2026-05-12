import { NextResponse } from "next/server";

type StoredSignal = {
  id: number;
  createdAt: number;
  message: unknown;
};

const SIGNAL_TTL_MS = 5 * 60 * 1000;

const globalSignals = globalThis as typeof globalThis & {
  khmermeetSignals?: Map<string, StoredSignal[]>;
  khmermeetSignalId?: number;
};

function getSignalStore() {
  if (!globalSignals.khmermeetSignals) globalSignals.khmermeetSignals = new Map();
  if (!globalSignals.khmermeetSignalId) globalSignals.khmermeetSignalId = 1;
  return globalSignals.khmermeetSignals;
}

function cleanupRoom(roomId: string) {
  const store = getSignalStore();
  const cutoff = Date.now() - SIGNAL_TTL_MS;
  const messages = store.get(roomId)?.filter((signal) => signal.createdAt > cutoff) ?? [];
  if (messages.length) store.set(roomId, messages);
  else store.delete(roomId);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId")?.trim();
  const since = Number(searchParams.get("since") ?? 0);

  if (!roomId) {
    return NextResponse.json({ error: "Missing roomId." }, { status: 400 });
  }

  cleanupRoom(roomId);
  const messages = getSignalStore()
    .get(roomId)
    ?.filter((signal) => signal.id > since) ?? [];

  return NextResponse.json({
    nextSince: messages.at(-1)?.id ?? since,
    messages
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const roomId = typeof body?.roomId === "string" ? body.roomId.trim() : "";
  const message = body?.message;

  if (!roomId || !message || typeof message !== "object") {
    return NextResponse.json({ error: "Missing roomId or message." }, { status: 400 });
  }

  cleanupRoom(roomId);
  const store = getSignalStore();
  const messages = store.get(roomId) ?? [];
  const id = globalSignals.khmermeetSignalId ?? 1;
  globalSignals.khmermeetSignalId = id + 1;
  messages.push({ id, createdAt: Date.now(), message });
  store.set(roomId, messages.slice(-300));

  return NextResponse.json({ id });
}
