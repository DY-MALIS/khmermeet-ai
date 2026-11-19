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

The $15/month plan verifies Checkout immediately on its success callback and
refreshes the subscription state before enforcing quota. A signed Stripe webhook
is recommended for faster background updates but is not required for access to
activate. To enable it, configure an endpoint at
`https://your-production-domain.com/api/billing/webhook` for
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, and `customer.subscription.deleted`. Set the
its signing secret as `STRIPE_WEBHOOK_SECRET`. Enable the Stripe customer
portal so subscribers can manage or cancel their plan. The Vercel Stripe sandbox
must be claimed and switched to a live Stripe account before charging real users.

Apply the `20261119000000_add_subscription_usage` Prisma migration before
deploying the new app. Free accounts receive 30 minutes per UTC calendar month;
paid accounts receive 10 hours per Stripe billing period. Admins can grant
unlimited access by email in Settings.

With a database connection that has migration permissions, run
`npx prisma migrate deploy`. Do not turn on the new quota routes before this
migration succeeds.

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
npm run build
```

The production build completed successfully. Webpack cache warnings during build are non-blocking.

