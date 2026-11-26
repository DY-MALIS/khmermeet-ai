-- These Prisma models were introduced through db push on the original
-- project but never committed as migrations. A fresh database needs them.
CREATE TABLE IF NOT EXISTS "WorkbenchProject" (
  "id" TEXT NOT NULL PRIMARY KEY,
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
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkbenchProject_meetingId_key" ON "WorkbenchProject"("meetingId");
CREATE INDEX IF NOT EXISTS "WorkbenchProject_ownerId_updatedAt_idx" ON "WorkbenchProject"("ownerId","updatedAt");
CREATE INDEX IF NOT EXISTS "WorkbenchProject_status_updatedAt_idx" ON "WorkbenchProject"("status","updatedAt");

CREATE TABLE IF NOT EXISTS "WorkbenchVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkbenchVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkbenchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WorkbenchVersion_projectId_createdAt_idx" ON "WorkbenchVersion"("projectId","createdAt");

CREATE TABLE IF NOT EXISTS "ApiUsageEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ApiUsageEvent_userId_bucket_createdAt_idx" ON "ApiUsageEvent"("userId","bucket","createdAt");

CREATE TABLE IF NOT EXISTS "MeetingAudioChunk" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "meetingId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "totalChunks" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MeetingAudioChunk_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MeetingAudioChunk_meetingId_chunkIndex_key" ON "MeetingAudioChunk"("meetingId","chunkIndex");
CREATE INDEX IF NOT EXISTS "MeetingAudioChunk_meetingId_idx" ON "MeetingAudioChunk"("meetingId");

ALTER TABLE "WorkbenchProject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkbenchVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiUsageEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetingAudioChunk" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "WorkbenchProject", "WorkbenchVersion", "ApiUsageEvent", "MeetingAudioChunk" FROM anon, authenticated;
