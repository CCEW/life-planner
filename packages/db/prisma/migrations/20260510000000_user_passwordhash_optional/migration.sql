-- Make passwordHash nullable so Supabase Auth users don't need a local hash
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
