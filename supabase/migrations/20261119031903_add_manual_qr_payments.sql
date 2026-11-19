ALTER TABLE "BillingAccount"
  ADD COLUMN "manualPaymentId" TEXT,
  ADD COLUMN "manualPeriodStart" TIMESTAMP(3),
  ADD COLUMN "manualPeriodEnd" TIMESTAMP(3);

CREATE UNIQUE INDEX "BillingAccount_manualPaymentId_key" ON "BillingAccount"("manualPaymentId");

CREATE TABLE "BillingSettings" (
  "id" TEXT NOT NULL,
  "qrImage" BYTEA NOT NULL,
  "qrMimeType" TEXT NOT NULL,
  "payeeName" TEXT,
  "merchantId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManualPayment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "transactionRef" TEXT NOT NULL,
  "receipt" BYTEA,
  "receiptMimeType" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "ManualPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManualPayment_transactionRef_key" ON "ManualPayment"("transactionRef");
CREATE INDEX "ManualPayment_status_createdAt_idx" ON "ManualPayment"("status", "createdAt");
CREATE INDEX "ManualPayment_userId_createdAt_idx" ON "ManualPayment"("userId", "createdAt");
ALTER TABLE "ManualPayment" ADD CONSTRAINT "ManualPayment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ManualPayment" ENABLE ROW LEVEL SECURITY;
