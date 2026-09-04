-- Allows a User row to have no password: an account created via Google
-- sign-in never sets one.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
