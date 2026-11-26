-- Run on an isolated Supabase development project after `prisma migrate deploy`.
-- This checks metadata only; it never reads customer rows.
DO $$
DECLARE
  table_name text;
  table_oid oid;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'User', 'Meeting', 'Task', 'AudioFile', 'CallSignal', 'MeetingTranscriptSegment',
    'WorkbenchProject', 'WorkbenchVersion', 'Decision', 'MeetingAudioChunk',
    'VoiceSample', 'ApiUsageEvent', 'BillingAccount', 'BillingSettings',
    'ManualPayment', 'UsageCharge', 'BillingAuditEvent', 'LiveUsageSession',
    'TelegramConnection', 'TelegramLink', 'TelegramReminder',
    'IntegrationConnection', 'IntegrationOAuthState', 'IntegrationArtifact'
  ] LOOP
    table_oid := to_regclass(format('public.%I', table_name));
    IF table_oid IS NULL THEN
      RAISE EXCEPTION 'Missing application table: %', table_name;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = table_oid) THEN
      RAISE EXCEPTION 'RLS is disabled: %', table_name;
    END IF;
    IF has_table_privilege('anon', table_oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') OR
       has_table_privilege('authenticated', table_oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
      RAISE EXCEPTION 'Data API role still has application table privileges: %', table_name;
    END IF;
  END LOOP;
END $$;
