-- KhmerMeet AI database setup for Supabase SQL Editor.
-- Run this once in Supabase > SQL Editor if `npx prisma db push` cannot connect.

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Meeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "audioUrl" TEXT,
    "transcript" TEXT,
    "summary" TEXT,
    "language" TEXT NOT NULL DEFAULT 'km',
    "duration" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'recorded',
    "speakerNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AudioFile" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AudioFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Task" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeName" TEXT,
    "deadline" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "sourceText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

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

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "MeetingTranscriptSegment_meetingId_startMs_idx" ON "MeetingTranscriptSegment"("meetingId", "startMs");

ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "speakerNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Meeting_createdById_fkey'
  ) THEN
    ALTER TABLE "Meeting"
      ADD CONSTRAINT "Meeting_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_meetingId_fkey'
  ) THEN
    ALTER TABLE "Task"
      ADD CONSTRAINT "Task_meetingId_fkey"
      FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MeetingTranscriptSegment_meetingId_fkey'
  ) THEN
    ALTER TABLE "MeetingTranscriptSegment"
      ADD CONSTRAINT "MeetingTranscriptSegment_meetingId_fkey"
      FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Scribe Studio (WorkbenchProject / WorkbenchVersion)

CREATE TABLE IF NOT EXISTS "WorkbenchProject" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT,
    "ownerId" TEXT,
    "title" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaName" TEXT,
    "mediaType" TEXT,
    "mediaSize" INTEGER,
    "duration" INTEGER,
    "sourceLanguage" TEXT NOT NULL DEFAULT 'auto',
    "targetLanguage" TEXT NOT NULL DEFAULT 'km',
    "contentType" TEXT NOT NULL DEFAULT 'meeting',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "rawTranscript" TEXT NOT NULL DEFAULT '',
    "cleanTranscript" TEXT NOT NULL DEFAULT '',
    "translatedText" TEXT NOT NULL DEFAULT '',
    "speakerNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "customVocabulary" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "folder" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "summaryType" TEXT NOT NULL DEFAULT 'meeting_minutes',
    "summaryLength" TEXT NOT NULL DEFAULT 'medium',
    "summaryLanguage" TEXT NOT NULL DEFAULT 'km',
    "summaryResult" TEXT NOT NULL DEFAULT '',
    "meetingMinutes" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkbenchProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkbenchVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkbenchVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkbenchProject_meetingId_key" ON "WorkbenchProject"("meetingId");
CREATE INDEX IF NOT EXISTS "WorkbenchProject_ownerId_updatedAt_idx" ON "WorkbenchProject"("ownerId", "updatedAt");
CREATE INDEX IF NOT EXISTS "WorkbenchProject_status_updatedAt_idx" ON "WorkbenchProject"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "WorkbenchVersion_projectId_createdAt_idx" ON "WorkbenchVersion"("projectId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkbenchVersion_projectId_fkey'
  ) THEN
    ALTER TABLE "WorkbenchVersion"
      ADD CONSTRAINT "WorkbenchVersion_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "WorkbenchProject"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AI Smart Note / Decision Tracker / Timeline

ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "smartNote" JSONB;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "timeline" JSONB;

CREATE TABLE IF NOT EXISTS "Decision" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerName" TEXT,
    "deadline" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sourceText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Decision_meetingId_fkey'
  ) THEN
    ALTER TABLE "Decision"
      ADD CONSTRAINT "Decision_meetingId_fkey"
      FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
