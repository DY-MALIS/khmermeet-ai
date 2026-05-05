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
- Local SQLite with Prisma ORM for the MVP, structured so it can move back to PostgreSQL later
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
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY="..."
NEXTAUTH_SECRET="replace-with-a-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"
```

4. Create the local SQLite database and seed demo data:

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
