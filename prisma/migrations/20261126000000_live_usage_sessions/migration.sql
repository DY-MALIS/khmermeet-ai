CREATE TABLE "LiveUsageSession" (
  "id" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "room" TEXT NOT NULL,
  "identity" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "baseSeconds" INTEGER NOT NULL DEFAULT 0,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiveUsageSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LiveUsageSession_endedAt_createdAt_idx" ON "LiveUsageSession"("endedAt", "createdAt");
ALTER TABLE "LiveUsageSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "LiveUsageSession" FROM anon, authenticated;
