# KhmerMeet AI

KhmerMeet AI is a production-minded MVP for Cambodian teams to record meetings, paste or generate transcripts, create Khmer/English summaries, extract action tasks, assign owners, set deadlines, and track progress.

## Features

- Email/password auth with protected dashboard
- Browser audio recording with local file storage
- Browser WebRTC video meetings for local MVP testing
- Gemini transcription for Khmer and English meeting audio
- Gemini meeting summaries in Khmer by default
- Gemini JSON action task extraction
- Meeting history, meeting detail, task management, settings
- Responsive SaaS dashboard UI with Khmer-friendly typography
- Text export for transcript and summary

## Tech Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Prisma ORM with `DATABASE_URL`
- NextAuth credentials auth
- Gemini API
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
GEMINI_API_KEY="..."
GEMINI_TEXT_MODEL=gemini-2.5-flash-lite
GEMINI_TRANSCRIBE_MODEL=gemini-2.5-flash-lite
GEMINI_TRANSCRIBE_TIMEOUT_MS=45000
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

Video meetings use browser WebRTC with server signaling. For reliable calls across different networks, configure a TURN server in Vercel:

```env
NEXT_PUBLIC_STUN_URL="stun:stun.l.google.com:19302"
NEXT_PUBLIC_TURN_URL="turn:your-turn-host:3478"
NEXT_PUBLIC_TURN_USERNAME="..."
NEXT_PUBLIC_TURN_CREDENTIAL="..."
```

Gemini powers transcription, summary generation, and task extraction. Gemini is not a media server; video/audio transport is handled by WebRTC.

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
