ALTER TABLE "BillingAccount" ADD COLUMN IF NOT EXISTS "stripePlan" TEXT NOT NULL DEFAULT 'starter';
ALTER TABLE "BillingAccount" ADD COLUMN IF NOT EXISTS "manualPlan" TEXT NOT NULL DEFAULT 'starter';
ALTER TABLE "ManualPayment" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'starter';
ALTER TABLE "UsageCharge" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'upload';

-- Existing live transcript requests already have a distinct source prefix.
UPDATE "UsageCharge" SET "kind" = 'live' WHERE "kind" = 'upload' AND ("sourceKey" LIKE 'live:%' OR "sourceKey" LIKE 'audio:meeting:%');
CREATE INDEX IF NOT EXISTS "UsageCharge_userId_periodKey_kind_idx" ON "UsageCharge"("userId", "periodKey", "kind");
DROP INDEX IF EXISTS "UsageCharge_userId_periodKey_idx";
