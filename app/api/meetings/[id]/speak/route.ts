import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerWhere, requireUser } from "@/lib/session";
import { synthesizeSpeech } from "@/lib/ai/openrouter";
import { splitIntoSpokenPieces } from "@/lib/ai/spoken-pieces";
import { publicAiTranscriptionError } from "@/lib/api-error-messages";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Next to the database (Seoul) - see the ask route.
export const preferredRegion = "icn1";

// Reads an Ask Meeting answer aloud. Scoped to a meeting the user owns so the
// endpoint cannot be used as a general-purpose text-to-speech service.
//
// Generating the whole answer's voice took ~4s before anything could play.
// Instead every sentence is generated at once in parallel and streamed back
// in order as soon as it is ready, so the first sentence starts playing
// after roughly one sentence's worth of generation. Each frame is a 4-byte
// big-endian length followed by that sentence's WAV; a zero-length frame
// means a sentence could not be voiced and the rest is abandoned.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const [limited, meeting, body] = await Promise.all([
      rateLimitResponse(user.id, "ai-generate"),
      prisma.meeting.findFirst({ where: { id, ...ownerWhere(user) }, select: { id: true } }),
      request.json().catch(() => ({}))
    ]);
    if (limited) return limited;
    if (!meeting) return NextResponse.json({ error: "No meeting found." }, { status: 404 });

    const text = typeof body?.text === "string" ? body.text.trim().slice(0, 2000) : "";
    if (!text) return NextResponse.json({ error: "Text is required." }, { status: 400 });
    const gender = body?.voice === "male" ? "male" : "female";

    const voiced = splitIntoSpokenPieces(text).map((piece) => synthesizeSpeech(piece, 45000, gender));
    // An unobserved rejection would crash the function if the stream stops
    // early; each promise is still awaited in order below.
    voiced.forEach((promise) => promise.catch(() => undefined));

    const frameLength = (length: number) => {
      const header = new Uint8Array(4);
      new DataView(header.buffer).setUint32(0, length);
      return header;
    };
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const promise of voiced) {
          try {
            const wav = await promise;
            controller.enqueue(frameLength(wav.length));
            controller.enqueue(new Uint8Array(wav));
          } catch (error) {
            console.warn("Voice piece failed:", error instanceof Error ? error.message : error);
            controller.enqueue(frameLength(0));
            break;
          }
        }
        controller.close();
      }
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" }
    });
  } catch (error) {
    const publicError = publicAiTranscriptionError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
