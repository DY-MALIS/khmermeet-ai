CREATE TABLE "IntegrationConnection" (
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "expiresAt" TIMESTAMP(3),
  "externalAccount" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("userId","provider")
);
CREATE TABLE "IntegrationOAuthState" (
  "tokenHash" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "IntegrationArtifact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "IntegrationArtifact_userId_provider_sourceId_key" ON "IntegrationArtifact"("userId","provider","sourceId");
ALTER TABLE "IntegrationConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationOAuthState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationArtifact" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "IntegrationConnection", "IntegrationOAuthState", "IntegrationArtifact" FROM anon, authenticated;
