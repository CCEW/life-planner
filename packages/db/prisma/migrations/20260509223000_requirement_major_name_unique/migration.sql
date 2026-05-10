-- Prevent duplicate requirement names within the same major.
CREATE UNIQUE INDEX IF NOT EXISTS "Requirement_majorId_name_key" ON "Requirement"("majorId", "name");
