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
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
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

CREATE TABLE IF NOT EXISTS "CallSignal" (
    "id" SERIAL NOT NULL,
    "roomId" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "CallSignal_roomId_id_idx" ON "CallSignal"("roomId", "id");
CREATE INDEX IF NOT EXISTS "CallSignal_createdAt_idx" ON "CallSignal"("createdAt");

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
END $$;
