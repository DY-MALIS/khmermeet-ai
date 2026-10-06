-- Voice memory (lib/voice). Additive only: the live database has drifted
-- from schema.prisma, so this must never be applied with `prisma db push`.
CREATE TABLE IF NOT EXISTS "VoiceSample" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meetingId" TEXT,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "voiceprint" DOUBLE PRECISION[],
    "seconds" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceSample_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VoiceSample_ownerId_idx" ON "VoiceSample"("ownerId");
CREATE UNIQUE INDEX IF NOT EXISTS "VoiceSample_ownerId_sourceKey_key" ON "VoiceSample"("ownerId", "sourceKey");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VoiceSample_ownerId_fkey') THEN
    ALTER TABLE "VoiceSample" ADD CONSTRAINT "VoiceSample_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
