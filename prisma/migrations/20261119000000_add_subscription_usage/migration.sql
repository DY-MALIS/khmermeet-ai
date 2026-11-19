CREATE TABLE "BillingAccount" (
  "userId" TEXT NOT NULL,
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripeStatus" TEXT NOT NULL DEFAULT 'inactive',
  "stripePeriodStart" TIMESTAMP(3),
  "stripePeriodEnd" TIMESTAMP(3),
  "unlimitedAccess" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "BillingAccount_stripeCustomerId_key" ON "BillingAccount"("stripeCustomerId");
CREATE UNIQUE INDEX "BillingAccount_stripeSubscriptionId_key" ON "BillingAccount"("stripeSubscriptionId");
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- Billing records are only read and written by the server through Prisma.
ALTER TABLE "BillingAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageCharge" ENABLE ROW LEVEL SECURITY;

