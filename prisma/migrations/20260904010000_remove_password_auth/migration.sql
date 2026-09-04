-- Auth moved entirely to Supabase/Google OAuth; no password-based sign-in remains.
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordHash";
DROP TABLE IF EXISTS "PasswordResetToken";
