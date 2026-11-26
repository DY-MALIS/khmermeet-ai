CREATE TABLE "BillingAuditEvent" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "paymentId" TEXT,
  "plan" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingAuditEvent_targetUserId_createdAt_idx" ON "BillingAuditEvent"("targetUserId", "createdAt");
CREATE INDEX "BillingAuditEvent_actorUserId_createdAt_idx" ON "BillingAuditEvent"("actorUserId", "createdAt");

-- Only the server's database role writes billing audit records.
ALTER TABLE "BillingAuditEvent" ENABLE ROW LEVEL SECURITY;
