import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  if (process.env.VERCEL) throw new Error("DATABASE_URL is required to deploy tiered billing.");
  console.log("Skipping tiered billing migration without a database URL.");
  process.exit(0);
}

const prisma = new PrismaClient();
try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('ALTER TABLE "BillingAccount" ADD COLUMN IF NOT EXISTS "stripePlan" TEXT NOT NULL DEFAULT \'starter\'');
    await tx.$executeRawUnsafe('ALTER TABLE "BillingAccount" ADD COLUMN IF NOT EXISTS "manualPlan" TEXT NOT NULL DEFAULT \'starter\'');
    await tx.$executeRawUnsafe('ALTER TABLE "ManualPayment" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT \'starter\'');
    await tx.$executeRawUnsafe('ALTER TABLE "ManualPayment" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT');
    await tx.$executeRawUnsafe('ALTER TABLE "UsageCharge" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT \'upload\'');
    await tx.$executeRawUnsafe('UPDATE "UsageCharge" SET "kind" = \'live\' WHERE "kind" = \'upload\' AND ("sourceKey" LIKE \'live:%\' OR "sourceKey" LIKE \'audio:meeting:%\')');
    await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "UsageCharge_userId_periodKey_kind_idx" ON "UsageCharge"("userId", "periodKey", "kind")');
    await tx.$executeRawUnsafe('DROP INDEX IF EXISTS "UsageCharge_userId_periodKey_idx"');
  });
  console.log("Tiered billing database schema is ready.");
} finally {
  await prisma.$disconnect();
}
