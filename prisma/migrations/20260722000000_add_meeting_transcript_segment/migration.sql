CREATE TABLE IF NOT EXISTS "MeetingTranscriptSegment" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "speakerIdentity" TEXT NOT NULL,
    "speakerName" TEXT,
    "segmentIndex" INTEGER NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingTranscriptSegment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MeetingTranscriptSegment_meetingId_startMs_idx" ON "MeetingTranscriptSegment"("meetingId", "startMs");

DO $$ BEGIN
    ALTER TABLE "MeetingTranscriptSegment" ADD CONSTRAINT "MeetingTranscriptSegment_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
