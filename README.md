# KhmerMeet AI

KhmerMeet AI is a production-minded MVP for Cambodian teams to record meetings, paste transcripts, generate Khmer summaries, extract action tasks, assign owners, set deadlines, and track progress.

## Features

- Email/password auth with protected dashboard
- Browser audio recording with local file storage
- Manual transcript editing with future speech-to-text adapter
- OpenAI summary generation in Khmer
- OpenAI JSON task extraction
- Meeting history, meeting detail, task management, settings
- Responsive SaaS dashboard UI with Khmer-friendly typography
- Text export for transcript and summary

## Tech Stack

- Next.js App Router, TypeScript, Tailwind CSS
- PostgreSQL with Prisma ORM
- NextAuth credentials auth
- OpenAI API
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
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/khmermeet_ai?schema=public"
OPENAI_API_KEY="..."
NEXTAUTH_SECRET="replace-with-a-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"
```

4. Start PostgreSQL locally. The easiest path is Docker:

```bash
docker compose up -d
```

If you already have PostgreSQL installed, create a `khmermeet_ai` database that matches `DATABASE_URL`.

5. Run Prisma migration and seed:

```bash
npm run prisma:migrate
npm run prisma:seed
```

6. Start local dev:

```bash
npm run dev
```

Demo login after seeding:

- Email: `demo@khmermeet.ai`
- Password: `password123`

## Notes

The MVP stores audio files under `uploads/` and serves them through `/api/uploads/[name]`. The storage adapter is isolated in `lib/storage.ts` so it can later move to S3 or Supabase Storage.

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
