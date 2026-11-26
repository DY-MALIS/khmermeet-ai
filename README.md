# KhmerMeet AI

KhmerMeet AI is a production-minded MVP for Cambodian teams to record meetings, paste or generate transcripts, create Khmer/English summaries, extract action tasks, assign owners, set deadlines, and track progress.

## Features

- Supabase Google sign-in with protected dashboard
- Browser audio recording with Supabase Storage for persistent files
- LiveKit video meetings
- OpenRouter transcription for Khmer and English meeting audio
- OpenRouter meeting summaries in Khmer by default
- OpenRouter JSON action task extraction
- Meeting history, meeting detail, task management, settings
- Responsive SaaS dashboard UI with Khmer-friendly typography
- TXT, Word, Excel, and PowerPoint export
- Stripe and manual QR billing with separate upload and LiveKit quotas

## Tech Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Prisma ORM with `DATABASE_URL`
- Supabase Auth
- OpenRouter API
- Supabase Storage and LiveKit Cloud

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Fill in:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/khmermeet_ai?schema=public"
OPEN_ROUTER_API_KEY="..."
OPEN_ROUTER_TEXT_MODEL=openai/gpt-4o-mini
OPEN_ROUTER_TRANSCRIBE_MODEL=google/chirp-3
OPEN_ROUTER_TRANSCRIBE_FALLBACK_MODEL=google/gemini-3.8-flash
OPEN_ROUTER_TRANSCRIBE_TIMEOUT_MS=55000
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="..."
```

4. On a fresh development database, apply the migrations:

```bash
npx prisma migrate deploy
```

5. Start local dev:

```bash
npm run dev
```

Configure Google sign-in in Supabase Auth to create your account.

## Production Deployment

Before giving KhmerMeet AI to real users, follow the deployment checklist in [`DEPLOYMENT.md`](./DEPLOYMENT.md). It lists the required Vercel environment variables, PostgreSQL setup, Supabase Storage bucket, OpenRouter checks, and LiveKit configuration.

## Notes

Production recordings use a private Supabase Storage bucket. Local storage is a development fallback; configure the Storage variables in `.env.example` before testing long recordings.

Server Rec records each participant's microphone locally in their own browser (a room-wide signal over the LiveKit data channel starts it automatically for everyone once one person clicks the button) and posts segments straight to the transcription API - no S3-compatible storage is required and no extra environment variables need to be set. This replaced an earlier LiveKit Egress + S3 upload design after hitting a confirmed, unresolved AWS SDK V2 signature-validation bug in Supabase Storage's S3-compatible API (see https://github.com/supabase/storage/issues/646); `lib/livekit-egress.ts` and the `/api/livekit-egress/*` routes are kept in the codebase unused in case that upstream bug gets fixed and server-side recording becomes worth revisiting.

Video meetings run entirely on LiveKit Cloud (WebRTC SFU) - it handles STUN/TURN relay for reliable calls across different networks internally, so no separate TURN server configuration is needed.

OpenRouter powers transcription, summary generation, and task extraction. OpenRouter is not a media server; video/audio transport is handled by LiveKit.

## Future Improvements

- Real-time speech-to-text
- Speaker detection
- Google Calendar integration
- Telegram bot configuration and sandbox delivery verification
- Slack and Zoom integrations
- PDF export
- Team workspace
