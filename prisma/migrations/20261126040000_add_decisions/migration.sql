-- Backfill a Prisma model that existed through db push without a migration.
CREATE TABLE IF NOT EXISTS "Decision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "meetingId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "ownerName" TEXT,
  "deadline" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "sourceText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Decision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "Decision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Decision" FROM anon, authenticated;
