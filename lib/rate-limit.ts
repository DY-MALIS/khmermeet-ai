import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Every bucket below wraps at least one call to the OpenRouter API, which is
// billed per request - a signed-in account with no limit could hit any of
// these in a tight loop (a script, or a bug in another client) and run up
// real cost on the shared OPEN_ROUTER_API_KEY. Limits are generous enough
// that no normal meeting workflow should ever hit them.
const RATE_LIMITS = {
  "ai-transcribe": {
    max: 200,
    windowMs: 60 * 60 * 1000, // per-chunk/segment transcription during recording
    message: (max: number) => `ការស្នើសុំ AI ច្រើនពេកក្នុងមួយម៉ោង (កំណត់ ${max})។ សូមរង់ចាំបន្តិច រួចសាកល្បងម្តងទៀត។`
  },
  "ai-generate": {
    max: 60,
    windowMs: 60 * 60 * 1000, // summaries, tasks, Q&A, studio actions
    message: (max: number) => `ការស្នើសុំ AI ច្រើនពេកក្នុងមួយម៉ោង (កំណត់ ${max})។ សូមរង់ចាំបន្តិច រួចសាកល្បងម្តងទៀត។`
  },
  "password-reset-request": {
    max: 5,
    windowMs: 60 * 60 * 1000, // keyed by email, not userId - this runs before login exists
    message: () => "ស្នើសុំកំណត់ password ថ្មីច្រើនដងពេក។ សូមរង់ចាំ ១ម៉ោង រួចសាកល្បងម្តងទៀត។"
  }
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export class RateLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

// Call once at the top of a route, right after requireUser() (or, for the
// pre-login password-reset flow, keyed by the submitted email address
// instead of a user id). Throws RateLimitExceededError (catch and return
// 429) when over the bucket's limit; otherwise records this call and
// returns normally.
export async function enforceRateLimit(key: string, bucket: RateLimitBucket) {
  const config = RATE_LIMITS[bucket];
  const since = new Date(Date.now() - config.windowMs);
  const count = await prisma.apiUsageEvent.count({ where: { userId: key, bucket, createdAt: { gte: since } } });
  if (count >= config.max) {
    throw new RateLimitExceededError(config.message(config.max));
  }
  await prisma.apiUsageEvent.create({ data: { userId: key, bucket } });
}

// Convenience wrapper for route handlers: `const limited = await
// rateLimitResponse(user.id, "ai-transcribe"); if (limited) return limited;`
// - two lines instead of a try/catch in every route, and any non-rate-limit
// error still propagates normally to the caller's own error handling.
export async function rateLimitResponse(key: string, bucket: RateLimitBucket): Promise<NextResponse | null> {
  try {
    await enforceRateLimit(key, bucket);
    return null;
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    throw error;
  }
}
