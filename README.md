# KhmerMeet AI

KhmerMeet AI is a production-minded MVP for Cambodian teams to record meetings, paste or generate transcripts, create Khmer/English summaries, extract action tasks, assign owners, set deadlines, and track progress.

## Features

- Email/password auth with protected dashboard
- Browser audio recording with local file storage
- Browser WebRTC video meetings for local MVP testing
- OpenRouter transcription for Khmer and English meeting audio
- OpenRouter meeting summaries in Khmer by default
- OpenRouter JSON action task extraction
- Meeting history, meeting detail, task management, settings
- Responsive SaaS dashboard UI with Khmer-friendly typography
- Text export for transcript and summary

## Tech Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Prisma ORM with `DATABASE_URL`
- NextAuth credentials auth
- OpenRouter API
- Local file storage for MVP

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
DATABASE_URL="file:./dev.db"
OPEN_ROUTER_API_KEY="..."
OPEN_ROUTER_TEXT_MODEL=openai/gpt-4o-mini
OPEN_ROUTER_TRANSCRIBE_MODEL=google/chirp-3
OPEN_ROUTER_TRANSCRIBE_TIMEOUT_MS=55000
NEXTAUTH_SECRET="replace-with-a-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"
```

4. Create the database and seed demo data:

```bash
npm run prisma:migrate
npm run prisma:seed
```

5. Start local dev:

```bash
npm run dev
```

Demo login after seeding:

- Email: `demo@khmermeet.ai`
- Password: `password123`

## Notes

The MVP stores audio files under `uploads/` locally and serves them through `/api/uploads/[name]`. On Vercel, local uploads are temporary, so production should move this adapter in `lib/storage.ts` to S3 or Supabase Storage.

Server Rec records each participant's microphone locally in their own browser (a room-wide signal over the LiveKit data channel starts it automatically for everyone once one person clicks the button) and posts segments straight to the transcription API - no S3-compatible storage is required and no extra environment variables need to be set. This replaced an earlier LiveKit Egress + S3 upload design after hitting a confirmed, unresolved AWS SDK V2 signature-validation bug in Supabase Storage's S3-compatible API (see https://github.com/supabase/storage/issues/646); `lib/livekit-egress.ts` and the `/api/livekit-egress/*` routes are kept in the codebase unused in case that upstream bug gets fixed and server-side recording becomes worth revisiting.

Video meetings use browser WebRTC with server signaling. For reliable calls across different networks, configure a TURN server in Vercel:

```env
NEXT_PUBLIC_STUN_URL="stun:stun.l.google.com:19302"
NEXT_PUBLIC_TURN_URL="turn:your-turn-host:3478"
NEXT_PUBLIC_TURN_USERNAME="..."
NEXT_PUBLIC_TURN_CREDENTIAL="..."
```

OpenRouter powers transcription, summary generation, and task extraction. OpenRouter is not a media server; video/audio transport is handled by WebRTC.

## Future Improvements

- Real-time speech-to-text
- Speaker detection
- Google Calendar integration
- Telegram reminders
- Slack and Zoom integrations
- PDF export
- Team workspace
- Payment plan
- Cloud storage
