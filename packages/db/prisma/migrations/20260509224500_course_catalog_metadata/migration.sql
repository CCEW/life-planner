ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "unitsMin" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unitsMax" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "geCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "writingCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "gradeMode" TEXT;

UPDATE "Course"
SET
  "unitsMin" = CASE WHEN "unitsMin" = 0 THEN "units" ELSE "unitsMin" END,
  "unitsMax" = CASE WHEN "unitsMax" = 0 THEN "units" ELSE "unitsMax" END;

CREATE INDEX IF NOT EXISTS "Course_department_idx" ON "Course"("department");
CREATE INDEX IF NOT EXISTS "Course_gradeMode_idx" ON "Course"("gradeMode");
