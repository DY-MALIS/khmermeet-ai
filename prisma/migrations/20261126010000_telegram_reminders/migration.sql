CREATE TABLE "TelegramConnection" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "chatId" TEXT NOT NULL UNIQUE,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT
);
CREATE TABLE "TelegramLink" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "TelegramReminder" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "dueOn" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'attempted',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TelegramReminder_taskId_dueOn_key" ON "TelegramReminder"("taskId", "dueOn");
CREATE INDEX "TelegramReminder_userId_createdAt_idx" ON "TelegramReminder"("userId", "createdAt");
ALTER TABLE "TelegramConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramReminder" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "TelegramConnection", "TelegramLink", "TelegramReminder" FROM anon, authenticated;
