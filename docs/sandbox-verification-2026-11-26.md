# Sandbox verification — 2026-11-26

Supabase project `khmermeet-ai-sandbox` (`utfupdqenrtuheyxjgpj`) was created in
the existing organization with the user's approval. The Supabase price shown
at creation was $0/month. This project is isolated from production.

All committed Prisma SQL migrations were applied sequentially through the
Supabase migration API. The run found five models missing from the historical
migration chain: `WorkbenchProject`, `WorkbenchVersion`, `ApiUsageEvent`,
`MeetingAudioChunk`, and `Decision`. A later schema comparison also found
missing `Meeting.smartNote`, `MeetingTranscriptSegment.audioUrl`, and
`MeetingTranscriptSegment.languageMode` columns. Backfill migrations were added
and applied.
The metadata assertion in `scripts/check-app-rls.sql` then passed for all 24
application tables: each exists, has RLS enabled, and grants no table access
to `anon` or `authenticated`.

Supabase security advisor reports 24 informational `rls_enabled_no_policy`
findings. This is intentional while app data access uses server-side Prisma;
Data API roles have no grants. See the
[Supabase advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Local checks: Next production build, ESLint, TypeScript, and 64 unit tests pass.
The unit suite covers quota arithmetic, LiveKit webhook metadata, recording
boundaries, Telegram link verification, OAuth token encryption, and AI
transcript handling. These checks do not replace live provider tests.

The sandbox has no app `DATABASE_URL`, Supabase Auth test user, private Storage
bucket, LiveKit test room, Stripe test keys, OpenRouter test key, Telegram bot,
or Google/Slack/Zoom OAuth apps configured. Therefore auth, payment, upload,
long recording, network interruption, Khmer speech accuracy, and provider
delivery could not be exercised end to end. No verified Khmer reference audio
dataset is available, so no AI accuracy percentage is claimed.

The production Vercel `/api/health` endpoint returned HTTP 200 with database
and schema ready, and `/api/openrouter-health` returned HTTP 200 for chat and
transcription on the existing production commit `8c21a10`. That health probe
uses silent audio; it is not a Khmer speech accuracy test. The new local code
has not been deployed. Vercel Hobby cannot run a minute-frequency Cron Job, so
the local configuration now uses Supabase `pg_cron`/`pg_net` via
`scripts/setup-livekit-usage-scheduler.sql`. Its SQL shape was prepared on the
sandbox without scheduling an outbound request. The production job is not
installed.

Production Supabase does not contain `_prisma_migrations`; running `prisma
migrate deploy` there now would replay initial table creation. Production
schema must be baselined or reconciled before a normal Prisma deploy. The
individual additive migrations for billing audit, LiveKit usage, Telegram and
provider connections were applied via the Supabase migration API. Following
the user's explicit approval, the RLS and Data API grant migration was also
applied to the 24 app tables. The production RLS assertion then passed and
`/api/health` remained HTTP 200. The remaining advisor findings are
informational RLS-without-policy notices and a password protection warning.
