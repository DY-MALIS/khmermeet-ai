CREATE TYPE "SubscriptionStatus" AS ENUM ('TRUE', 'FALSE');

ALTER TABLE "User"
ADD COLUMN "subscribed" "SubscriptionStatus" NOT NULL DEFAULT 'FALSE';
