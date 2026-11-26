-- These columns existed on the original database through db push, but were
-- never included in the migration history used for a fresh environment.
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "smartNote" JSONB;
ALTER TABLE "MeetingTranscriptSegment" ADD COLUMN IF NOT EXISTS "audioUrl" TEXT;
ALTER TABLE "MeetingTranscriptSegment" ADD COLUMN IF NOT EXISTS "languageMode" TEXT;
