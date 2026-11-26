-- Run once on the Supabase project used by the deployed app, after setting
-- the two Vault secrets below. Supabase pg_cron calls the Vercel route every
-- minute; Vercel Hobby itself cannot schedule minute-frequency Cron Jobs.
-- Set these secrets in Supabase Vault first (do not paste them in this file):
--   khmermeet_app_url     = https://<production-domain>
--   khmermeet_cron_secret = same random value as Vercel CRON_SECRET

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'khmermeet_app_url') OR
     NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'khmermeet_cron_secret') THEN
    RAISE EXCEPTION 'Set khmermeet_app_url and khmermeet_cron_secret in Supabase Vault first';
  END IF;
END $$;

SELECT cron.schedule(
  'khmermeet-livekit-usage',
  '* * * * *',
  $$SELECT net.http_get(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'khmermeet_app_url') || '/api/cron/livekit-usage',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'khmermeet_cron_secret')
    ),
    timeout_milliseconds := 30000
  )$$
);
