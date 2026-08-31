# KhmerMeet AI Deployment Checklist

Use this checklist before giving the app to real users.

## 1. Create Production Services

- Vercel project for the Next.js app.
- PostgreSQL database, for example Supabase or Neon.
- OpenRouter API key for transcript, summary, and action extraction.
- Supabase Storage bucket for persistent recordings.
- LiveKit Cloud project for video calls.

## 2. Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
OPEN_ROUTER_API_KEY="..."
OPEN_ROUTER_TEXT_MODEL="openai/gpt-4o-mini"
OPEN_ROUTER_TRANSCRIBE_MODEL="google/chirp-3"
OPEN_ROUTER_TRANSCRIBE_FALLBACK_MODEL="google/gemini-2.5-pro"
OPEN_ROUTER_TRANSCRIBE_TIMEOUT_MS="55000"
NEXTAUTH_SECRET="generate-a-long-random-secret"
NEXTAUTH_URL="https://your-production-domain.com"

SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="..."
SUPABASE_STORAGE_BUCKET="meeting-recordings"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."

NEXT_PUBLIC_LIVEKIT_URL="wss://your-livekit-project.livekit.cloud"
LIVEKIT_API_KEY="..."
LIVEKIT_API_SECRET="..."
```

Optional email reset support:

```env
RESEND_API_KEY="..."
RESEND_FROM_EMAIL="KhmerMeet AI <noreply@your-domain.com>"
```

## 3. Database

After setting `DATABASE_URL`, create the tables:

```bash
npm run prisma:migrate
```

For a fresh demo account:

```bash
npm run prisma:seed
```

Demo login from the seed:

- Email: `demo@khmermeet.ai`
- Password: `password123`

Change or remove this demo user before inviting real users.

## 4. Storage

Create a private Supabase Storage bucket named:

```text
meeting-recordings
```

The server uses `SUPABASE_SERVICE_ROLE_KEY` for private file access. The browser uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` for direct uploads, which avoids Vercel request-size limits for longer recordings.

## 5. Verify After Deployment

Open these URLs after Vercel deploys:

```text
https://your-production-domain.com/api/health
https://your-production-domain.com/api/openrouter-health
```

Expected:

- `/api/health` returns `ok: true`.
- `/api/openrouter-health` does not report `missing_key` or authentication errors.

Then test the real workflow:

1. Register a new account.
2. Create a meeting.
3. Upload or record audio.
4. Transcribe.
5. Generate summary and tasks.
6. Start a video meeting if LiveKit is enabled.

## 6. 100-Participant Recording

For large calls, use LiveKit Cloud plus LiveKit Egress. The app now starts LiveKit server recording first and only falls back to browser mixed recording for small calls of 12 participants or fewer. This avoids making one user's browser subscribe to, mix, and upload audio for a large room.

Required for large-call recording:

```env
NEXT_PUBLIC_LIVEKIT_URL="wss://your-livekit-project.livekit.cloud"
LIVEKIT_API_KEY="..."
LIVEKIT_API_SECRET="..."
LIVEKIT_EGRESS_S3_ENDPOINT="https://<project-ref>.supabase.co/storage/v1/s3"
LIVEKIT_EGRESS_S3_REGION="auto"
LIVEKIT_EGRESS_S3_BUCKET="meeting-recordings"
LIVEKIT_EGRESS_S3_ACCESS_KEY="..."
LIVEKIT_EGRESS_S3_SECRET="..."
LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE="true"
```

For 100 people, keep the default audio-first call setup: camera off by default, microphone on only for speakers, and screen share only when needed.

## 7. Current Local Verification

These checks passed locally:

```bash
npm run typecheck
npm run lint
npm run build
```

The production build completed successfully. Webpack cache warnings during build are non-blocking.
