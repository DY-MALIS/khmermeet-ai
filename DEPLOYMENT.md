# KhmerMeet AI Deployment Checklist

Use this checklist before giving the app to real users.

## 1. Create Production Services

- Vercel project for the Next.js app.
- PostgreSQL database, for example Supabase or Neon.
- OpenRouter API key for transcript, summary, and action extraction.
- Supabase Storage bucket for persistent recordings.
- LiveKit Cloud project for video calls.

## 2. Environment Variables

Set the variables listed in `.env.example` in Vercel Project Settings. Use
`STRIPE_SECRET_KEY` comes from the Stripe integration. Keep all secret values in
Vercel, outside the repository.

Card plans verify Checkout immediately on its success callback and
refreshes the subscription state before enforcing quota. A signed Stripe webhook
is recommended for faster background updates but is not required for access to
activate. To enable it, configure an endpoint at
`https://your-production-domain.com/api/billing/webhook` for
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, and `customer.subscription.deleted`. Set the
its signing secret as `STRIPE_WEBHOOK_SECRET`. Enable the Stripe customer
portal so subscribers can manage or cancel their plan. The Vercel Stripe sandbox
must be claimed and switched to a live Stripe account before charging real users.

Apply the subscription migrations before deploying the app. Free accounts receive
20 minutes per UTC calendar month. Paid plans are Starter ($15: 10 upload speech
hours, 2 LiveKit hours), Plus ($25: 15 upload speech hours, 6 LiveKit hours),
and Premium ($35: 20 upload speech hours, 10 LiveKit hours) per billing period.
Audio usage excludes detected silent intervals. Admins can grant unlimited
access by email in Settings.

The Prisma chain now includes manual QR tables and tiered billing fields.
Do not run the legacy `supabase/migrations/20261119031903_add_manual_qr_payments.sql`
separately on a new project; its schema is included in the Prisma migrations.
Builds no longer alter the database. Apply migrations explicitly and verify
them before building a deployment.

Apply `20261120000000_billing_audit_events` before deploying code that writes
billing audit events. Review `20261120010000_protect_public_app_tables` against
any external Supabase Data API consumers before applying it: enabling RLS
without owner-scoped policies blocks direct browser access to those tables.
The app's current billing and meeting table access is server-side Prisma.
Test the migration on an isolated Supabase development project before production.
It also revokes `anon` and `authenticated` table grants to prevent Data API
schema discovery. Apply `20261126000000_live_usage_sessions` before deploying
the LiveKit metering routes.
Run `scripts/check-app-rls.sql` in the development project's SQL editor after
migrations; it fails if a table is absent, RLS is off, or a Data API role has
application table access. Then run a server-side Prisma read against the
development database and Supabase Security Advisor before production rollout.

For server-side LiveKit quota enforcement, register a signed LiveKit webhook at
`https://your-production-domain.com/api/livekit-webhook` for
`participant_joined` and `participant_left`. Set a long random `CRON_SECRET`
in Vercel. The `/api/cron/livekit-usage` route checks connected participants
directly with LiveKit, charges elapsed time and removes participants at quota.
`scripts/setup-livekit-usage-scheduler.sql` schedules this once per minute via
Supabase `pg_cron` and `pg_net`. Store the deployed app URL and the same
`CRON_SECRET` in Supabase Vault as `khmermeet_app_url` and
`khmermeet_cron_secret`, then run the script on the app's Supabase project.
Vercel Hobby cannot schedule minute-frequency Cron Jobs. Metering can lag by
one scheduler interval. Check `cron.job_run_details` after installation.
Test quota exhaustion and reconnects on a non-production LiveKit project.

Telegram task reminders require `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_BOT_USERNAME`, and a random `TELEGRAM_WEBHOOK_SECRET` in the server
environment. Register the bot webhook at
`https://your-production-domain.com/api/telegram/webhook` with Telegram's
`secret_token` set to the same secret. Apply
`20261126010000_telegram_reminders` first. Users opt in by opening a one-time
bot link in Settings and can disconnect there. The daily scheduler sends due
task reminders at 09:00 Cambodia time; failed or ambiguous deliveries are
recorded and not retried automatically to avoid duplicates. Use a test bot and
test accounts before enabling this on production.

With a database connection that has migration permissions, run
`npx prisma migrate deploy`. Do not turn on the new quota routes before this
migration succeeds.

The currently connected `khmermeet-ai` Supabase database had no
`_prisma_migrations` table when checked on 26 November 2026. Do not run
`prisma migrate deploy` against that existing database yet: Prisma would try
to replay initial table creation. First compare its schema with the historical
migrations, record the already-applied baseline with `prisma migrate resolve`
only for migrations whose effects are present, and verify that the remaining
migrations apply cleanly on a copied development database. Back up the live
database and schedule the production migration separately.

Optional email reset uses `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.

## 3. Database

After setting `DATABASE_URL`, create the tables:

```bash
npm run prisma:migrate
```

Use Google sign-in to create a user after the migration. Do not seed a shared
demo login into production.

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

Required variables are the LiveKit and Egress entries in `.env.example`.

For 100 people, keep the default audio-first call setup: camera off by default, microphone on only for speakers, and screen share only when needed.

## 7. Current Local Verification

These checks passed locally:

```bash
npm run typecheck
npm run lint
npm test
node node_modules/next/dist/bin/next build
```

The direct Next.js production build completed successfully. `npm run build` was
not used for local verification because it runs `ensure-tiered-billing.mjs`,
which can change the connected database schema. The 56 unit tests passed after
restoring the missing local `ffmpeg-static` executable.

