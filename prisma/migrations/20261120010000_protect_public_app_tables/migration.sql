-- Supabase's public schema is exposed through the Data API. The app uses
-- Prisma's server-side connection for these tables, not the browser Data API.
-- Review any external integrations before applying: authenticated Data API
-- clients will lose direct access until explicit owner-scoped policies exist.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'User', 'Meeting', 'Task', 'AudioFile', 'CallSignal', 'MeetingTranscriptSegment',
    'WorkbenchProject', 'WorkbenchVersion', 'Decision', 'MeetingAudioChunk',
    'VoiceSample', 'ApiUsageEvent', 'BillingAccount', 'BillingSettings',
    'ManualPayment', 'UsageCharge', 'BillingAuditEvent'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      -- Application data is accessed through server-side Prisma, never
      -- directly through Supabase's Data API. Remove schema discovery and
      -- table access for public API roles as well as denying rows with RLS.
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
    END IF;
  END LOOP;
END $$;
