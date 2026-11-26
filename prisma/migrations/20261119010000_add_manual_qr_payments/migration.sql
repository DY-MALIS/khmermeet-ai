-- Mirrors the legacy Supabase SQL migration so a fresh Prisma deployment is
-- complete. IF NOT EXISTS also supports projects that applied that SQL first.
ALTER TABLE "BillingAccount"
  ADD COLUMN IF NOT EXISTS "manualPaymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "manualPeriodStart" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "manualPeriodEnd" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "BillingAccount_manualPaymentId_key" ON "BillingAccount"("manualPaymentId");

CREATE TABLE IF NOT EXISTS "BillingSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "qrImage" BYTEA NOT NULL,
  "qrMimeType" TEXT NOT NULL,
  "payeeName" TEXT,
  "merchantId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ManualPayment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "transactionRef" TEXT NOT NULL,
  "receipt" BYTEA,
  "receiptMimeType" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "ManualPayment_transactionRef_key" ON "ManualPayment"("transactionRef");
CREATE INDEX IF NOT EXISTS "ManualPayment_status_createdAt_idx" ON "ManualPayment"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ManualPayment_userId_createdAt_idx" ON "ManualPayment"("userId", "createdAt");
ALTER TABLE "BillingSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ManualPayment" ENABLE ROW LEVEL SECURITY;
