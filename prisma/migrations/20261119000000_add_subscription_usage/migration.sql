ALTER TABLE "User"
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "stripeStatus" TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN "stripePeriodStart" TIMESTAMP(3),
  ADD COLUMN "stripePeriodEnd" TIMESTAMP(3),
  ADD COLUMN "unlimitedAccess" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");

CREATE TABLE "UsageCharge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "seconds" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageCharge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageCharge_sourceKey_key" ON "UsageCharge"("sourceKey");
CREATE INDEX "UsageCharge_userId_periodKey_idx" ON "UsageCharge"("userId", "periodKey");
ALTER TABLE "UsageCharge" ADD CONSTRAINT "UsageCharge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- These records are only read and written by the server through Prisma.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageCharge" ENABLE ROW LEVEL SECURITY;
