/**
 * Load ucdavis_scraper/engineering_professors.json into Supabase.
 *
 * Scope:
 * - Upserts Professor rows for professor-search display.
 * - Upserts ProfessorCourse rows only when the referenced Course row already exists.
 * - Does not create tables and does not upload Course data.
 *
 * Run from life-planner:
 *   npm run seed:professors --workspace=apps/api
 *
 * Dry run:
 *   npm run seed:professors --workspace=apps/api -- --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const DEFAULT_JSON = path.resolve(__dirname, "../../../../ucdavis_scraper/engineering_professors.json");
const FALLBACK_JSON = path.resolve(__dirname, "../../../packages/db/engineering_professors.json");
const BATCH_SIZE = 200;
const MISSING = "Info not applicable";

type JsonObject = Record<string, unknown>;

type ProfessorSearchProfile = {
  name: string;
  email?: string;
  dept?: string;
  department?: string;
  interests?: string[];
  title?: string;
  labName?: string;
  labDescription?: string;
  about?: string;
  office?: string;
  phoneNumber?: string;
  personalSite?: string;
  sourceUrl?: string;
  topMatchedRequirementCourses?: JsonObject[];
};

type RawProfile = JsonObject & {
  name?: string;
  email?: string;
  source_url?: string;
  scraped_url?: string;
  professor_title?: string;
  department?: string;
  dept?: string;
  department_subjects?: string[];
  phone_number?: string;
  personal_site?: string;
  personal_sites?: string[];
  location?: string;
  description?: string;
  research_interest_ids?: string[];
  topic_scores?: JsonObject;
  topic_keyword_hits?: JsonObject;
  top_matched_requirement_courses?: JsonObject[];
};

type ProfessorJson = {
  profiles?: RawProfile[];
  professor_search_profiles: ProfessorSearchProfile[];
  matching_map?: {
    courses?: Array<{
      course_code: string;
      course_title?: string;
      matched_professors?: Array<{
        professor_name: string;
        email?: string;
        department?: string;
        score?: number;
        matched_topics?: string[];
        matched_topic_labels?: string[];
        evidence_terms?: string[];
        source_url?: string;
      }>;
    }>;
  };
};

type ProfessorPayload = {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  department: string | null;
  dept: string | null;
  office: string | null;
  phoneNumber: string | null;
  personalSite: string | null;
  sourceUrl: string | null;
  about: string | null;
  labName: string | null;
  labDescription: string | null;
  interests: string[];
  researchInterestIds: string[];
  departmentSubjects: string[];
  topicScores: JsonObject;
  topicKeywordHits: JsonObject;
  topMatchedRequirementCourses: JsonObject[];
  updatedAt: string;
};

type CourseRow = {
  id: string;
  courseCode: string;
};

type ProfessorCoursePayload = {
  professorId: string;
  courseId: string;
  courseCode: string;
  score: number | null;
  matchedTopics: string[];
  matchedTopicLabels: string[];
  evidenceTerms: string[];
};

function supabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY are required.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("Using SUPABASE_ANON_KEY. If RLS blocks writes, add SUPABASE_SERVICE_ROLE_KEY to .env.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function jsonPathFromArgs() {
  const index = process.argv.indexOf("--json");
  if (index !== -1) {
    return path.resolve(process.argv[index + 1]);
  }
  return fs.existsSync(DEFAULT_JSON) ? DEFAULT_JSON : FALLBACK_JSON;
}

function readProfessorJson(): ProfessorJson {
  const jsonPath = jsonPathFromArgs();
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as ProfessorJson;
  if (!Array.isArray(data.professor_search_profiles)) {
    throw new Error(`${jsonPath} must contain professor_search_profiles.`);
  }
  return data;
}

function nullable(value: unknown): string | null {
  if (typeof value !== "string") {
    return value == null ? null : String(value);
  }
  const clean = value.trim();
  return clean && clean !== MISSING ? clean : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0 && item !== MISSING)
    : [];
}

function firstString(value: unknown): string | null {
  return stringArray(value)[0] ?? null;
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function professorId(profile: ProfessorSearchProfile, rawProfile?: RawProfile) {
  const identity = nullable(profile.sourceUrl)
    ?? nullable(rawProfile?.source_url)
    ?? nullable(profile.email)
    ?? nullable(rawProfile?.email)
    ?? profile.name;
  return `professor_${slug(identity)}`;
}

function profileKey(name: unknown, email: unknown) {
  return `${String(name ?? "").trim().toLowerCase()}|${String(email ?? "").trim().toLowerCase()}`;
}

function sourceKey(sourceUrl: unknown) {
  return String(sourceUrl ?? "").trim().toLowerCase();
}

function rawProfileIndexes(data: ProfessorJson) {
  const byNameEmail = new Map<string, RawProfile>();
  const bySource = new Map<string, RawProfile>();

  for (const profile of data.profiles ?? []) {
    byNameEmail.set(profileKey(profile.name, profile.email), profile);
    if (profile.source_url) {
      bySource.set(sourceKey(profile.source_url), profile);
    }
  }

  return { byNameEmail, bySource };
}

function toProfessorPayload(profile: ProfessorSearchProfile, rawProfile: RawProfile | undefined, updatedAt: string): ProfessorPayload {
  const department = nullable(profile.department) ?? nullable(profile.dept) ?? nullable(rawProfile?.department) ?? nullable(rawProfile?.dept);
  const title = nullable(profile.title) ?? nullable(rawProfile?.professor_title);
  const about = nullable(profile.about) ?? nullable(profile.labDescription) ?? nullable(rawProfile?.description);

  return {
    id: professorId(profile, rawProfile),
    name: profile.name,
    email: nullable(profile.email) ?? nullable(rawProfile?.email),
    title,
    department,
    dept: department,
    office: nullable(profile.office) ?? nullable(rawProfile?.location),
    phoneNumber: nullable(profile.phoneNumber) ?? nullable(rawProfile?.phone_number),
    personalSite: nullable(profile.personalSite) ?? nullable(rawProfile?.personal_site) ?? firstString(rawProfile?.personal_sites),
    sourceUrl: nullable(profile.sourceUrl) ?? nullable(rawProfile?.source_url),
    about,
    labName: nullable(profile.labName),
    labDescription: nullable(profile.labDescription) ?? about,
    interests: stringArray(profile.interests),
    researchInterestIds: stringArray(rawProfile?.research_interest_ids),
    departmentSubjects: stringArray(rawProfile?.department_subjects),
    topicScores: rawProfile?.topic_scores ?? {},
    topicKeywordHits: rawProfile?.topic_keyword_hits ?? {},
    topMatchedRequirementCourses: profile.topMatchedRequirementCourses ?? rawProfile?.top_matched_requirement_courses ?? [],
    updatedAt,
  };
}

function buildProfessorRows(data: ProfessorJson) {
  const updatedAt = new Date().toISOString();
  const indexes = rawProfileIndexes(data);

  return data.professor_search_profiles.map((profile) => {
    const rawProfile = indexes.bySource.get(sourceKey(profile.sourceUrl)) ?? indexes.byNameEmail.get(profileKey(profile.name, profile.email));
    return toProfessorPayload(profile, rawProfile, updatedAt);
  });
}

function professorMaps(rows: ProfessorPayload[]) {
  const byName = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const bySource = new Map<string, string>();

  for (const row of rows) {
    byName.set(row.name.trim().toLowerCase(), row.id);
    if (row.email) {
      byEmail.set(row.email.trim().toLowerCase(), row.id);
    }
    if (row.sourceUrl) {
      bySource.set(row.sourceUrl.trim().toLowerCase(), row.id);
    }
  }

  return { byName, byEmail, bySource };
}

async function upsertBatches<T extends object>(supabase: SupabaseClient, table: string, rows: T[], onConflict: string) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch as never[], {
      onConflict,
      ignoreDuplicates: false,
    });
    if (error) {
      throw new Error(`${table} upsert failed: ${error.message}`);
    }
    process.stdout.write(`\r${table}: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
}

async function reuseExistingProfessorIds(supabase: SupabaseClient, rows: ProfessorPayload[]) {
  const sourceUrls = rows
    .map((row) => row.sourceUrl)
    .filter((sourceUrl): sourceUrl is string => Boolean(sourceUrl));
  const idBySourceUrl = new Map<string, string>();

  for (let i = 0; i < sourceUrls.length; i += BATCH_SIZE) {
    const batch = sourceUrls.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("Professor")
      .select("id,sourceUrl")
      .in("sourceUrl", batch);

    if (error) {
      throw new Error(`Professor existing-id lookup failed: ${error.message}`);
    }

    for (const row of (data ?? []) as Array<{ id: string; sourceUrl: string | null }>) {
      if (row.sourceUrl) {
        idBySourceUrl.set(row.sourceUrl, row.id);
      }
    }
  }

  let reused = 0;
  for (const row of rows) {
    if (!row.sourceUrl) {
      continue;
    }
    const existingId = idBySourceUrl.get(row.sourceUrl);
    if (existingId && existingId !== row.id) {
      row.id = existingId;
      reused += 1;
    }
  }

  return reused;
}

async function courseIdMap(supabase: SupabaseClient, courseCodes: string[]) {
  const output = new Map<string, string>();
  const uniqueCourseCodes = [...new Set(courseCodes)].sort();

  for (let i = 0; i < uniqueCourseCodes.length; i += BATCH_SIZE) {
    const batch = uniqueCourseCodes.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("Course")
      .select("id,courseCode")
      .in("courseCode", batch);

    if (error) {
      throw new Error(`Course lookup failed: ${error.message}`);
    }

    for (const row of (data ?? []) as CourseRow[]) {
      output.set(row.courseCode, row.id);
    }
  }

  return output;
}

function buildProfessorCourseRows(data: ProfessorJson, professorRows: ProfessorPayload[], coursesByCode: Map<string, string>) {
  const professorBy = professorMaps(professorRows);
  const rows = new Map<string, ProfessorCoursePayload>();
  let skippedMissingCourse = 0;
  let skippedMissingProfessor = 0;

  for (const course of data.matching_map?.courses ?? []) {
    const courseId = coursesByCode.get(course.course_code);
    if (!courseId) {
      skippedMissingCourse += course.matched_professors?.length ?? 0;
      continue;
    }

    for (const match of course.matched_professors ?? []) {
      const professorId = (match.source_url ? professorBy.bySource.get(match.source_url.trim().toLowerCase()) : undefined)
        ?? (match.email ? professorBy.byEmail.get(match.email.trim().toLowerCase()) : undefined)
        ?? professorBy.byName.get(match.professor_name.trim().toLowerCase());

      if (!professorId) {
        skippedMissingProfessor += 1;
        continue;
      }

      rows.set(`${professorId}|${courseId}`, {
        professorId,
        courseId,
        courseCode: course.course_code,
        score: typeof match.score === "number" ? match.score : null,
        matchedTopics: stringArray(match.matched_topics),
        matchedTopicLabels: stringArray(match.matched_topic_labels),
        evidenceTerms: stringArray(match.evidence_terms),
      });
    }
  }

  return {
    rows: [...rows.values()],
    skippedMissingCourse,
    skippedMissingProfessor,
  };
}

async function main() {
  const data = readProfessorJson();
  const professorRows = buildProfessorRows(data);
  const allMatchCourseCodes = (data.matching_map?.courses ?? []).map((course) => course.course_code);

  if (process.argv.includes("--dry-run")) {
    console.log(`Dry run: ${professorRows.length} Professor rows`);
    console.log(`Dry run: ${allMatchCourseCodes.length} matched course records before Course lookup`);
    console.log(JSON.stringify(professorRows[0], null, 2));
    return;
  }

  const supabase = supabaseClient();
  const reusedIds = await reuseExistingProfessorIds(supabase, professorRows);
  if (reusedIds > 0) {
    console.log(`Reusing ${reusedIds} existing Professor ids by sourceUrl.`);
  }
  await upsertBatches(supabase, "Professor", professorRows, "id");

  const coursesByCode = await courseIdMap(supabase, allMatchCourseCodes);
  const professorCourses = buildProfessorCourseRows(data, professorRows, coursesByCode);

  if (professorCourses.rows.length > 0) {
    await upsertBatches(supabase, "ProfessorCourse", professorCourses.rows, "professorId,courseId");
  }

  console.log(`Loaded ${professorRows.length} professors.`);
  console.log(`Loaded ${professorCourses.rows.length} professor-course links.`);
  console.log(`Skipped ${professorCourses.skippedMissingCourse} links because Course rows were not found.`);
  console.log(`Skipped ${professorCourses.skippedMissingProfessor} links because Professor rows were not matched.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
